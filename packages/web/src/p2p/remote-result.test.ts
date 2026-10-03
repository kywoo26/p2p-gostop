// #131 / FR-16·FR-53·NP-03: 수동 Stop의 원격 결과 인지·확인 순서. 자동 Stop 규칙 검증이 아니다.
import { replay } from '@p2p-gostop/engine';
import {
  combineSeed,
  createMemoryTransportPair,
  createQueuedTransportPair,
  fromHex,
} from '@p2p-gostop/protocol';
import { tick } from 'svelte';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Game from '../routes/Game.svelte';
import decision from './fixtures/host-v2-push-decision.json';
import { GuestGame } from './guest.svelte.ts';
import { HostGame, loadHostSave, type HostSave } from './host.svelte.ts';

function fixture(): HostSave {
  const key = 'gostop.host.v2';
  const previous = localStorage.getItem(key);
  try {
    localStorage.setItem(key, JSON.stringify(decision));
    const saved = loadHostSave();
    if (saved === null) throw new Error('저장 fixture 검증 실패');
    return saved;
  } finally {
    if (previous === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previous);
  }
}

function beforeStop(): HostSave {
  const saved = fixture();
  const round = saved.state.round;
  if (round === null || round.guestSecret === null) throw new Error('종료 판 fixture 누락');
  const actions = round.actions.slice(0, -1);
  const hostSecret = fromHex(round.hostSecret);
  const guestSecret = fromHex(round.guestSecret);
  if (hostSecret === null || guestSecret === null) throw new Error('fixture 시드 형식 오류');
  const before = replay(
    saved.config.rules,
    combineSeed(hostSecret, guestSecret),
    actions,
    round.options,
  );
  if (!before.ok) throw new Error('수동 Stop 이전 저장 fixture 복원 실패');
  return {
    ...saved,
    state: {
      ...saved.state,
      stage: 'playing',
      seq: round.firstSeq + before.events.length - 1,
      round: { ...round, actions },
    },
  };
}

function pair(saved = beforeStop()) {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostGame({
    config: saved.config,
    resume: saved,
    transport: hostWire,
    clock: false,
    persist: false,
    now: () => 0,
  });
  expect(host.resumeSaved()).toBe(true);
  const guest = new GuestGame({
    name: saved.state.names[1],
    token: saved.state.token,
    transport: guestWire,
    clock: false,
    persist: false,
    now: () => 0,
    onTicket: () => {},
  });
  return { host, guest, hostWire, guestWire };
}

async function stop(host: HostGame) {
  await vi.waitFor(() => expect(host.canAct).toBe(true));
  expect(host.playback.board.pending?.kind).toBe('goStop');
  expect(host.submit({ type: 'stop', seat: 0 })).toBe(true);
}

function choicesHidden(container: HTMLElement) {
  expect(container.querySelector('[data-choice="push"]')).toBeNull();
  expect(container.querySelector('[data-choice="accept"]')).toBeNull();
  expect(container.querySelector('[data-choice="next"]')).toBeNull();
}

// 게스트 held-result 시험의 상대 fixture만 운전한다. 호스트의 실제 UI 조작은 단일 host 시험이 맡는다.
async function acceptHostFixture(host: HostGame) {
  expect(host.playback.idle).toBe(true);
  expect(host.playback.pending).toBe(0);
  expect(host.playback.board.phase).toBe('end');
  expect(host.playback.board.round).toBe(host.stats.round);
  expect(host.playback.board.eventSeq).toBe(host.stats.seq);
  const result = host.pendingRoundResult;
  if (result === null) throw new Error('공개 완료된 상대 결과 누락');
  expect(result.acknowledged).toBe(false);
  expect(host.records).toHaveLength(0);
  const round = host.stats.round;
  host.acknowledgeRoundResult(result.key);
  expect(host.pendingRoundResult?.key).toBe(result.key);
  expect(host.pendingRoundResult?.acknowledged).toBe(true);
  expect(host.pushDecision?.winner).toBe(true);
  host.choosePush(false);
  await vi.waitFor(() => expect(host.playback.settlement).not.toBeNull());
  await vi.waitFor(() => expect(host.playback.busy).toBe(false));
  expect(host.records).toHaveLength(1);
  expect(host.stats.round).toBe(round);
  expect(host.playback.board.round).toBe(round);
  expect(host.playback.board.eventSeq).toBe(host.stats.seq);
  expect(host.pendingRoundResult?.acknowledged).toBe(true);
}

// 원 red의 title/첫 overlay assertion은 유지한다. 미도달 승리 부분문자열은 fixture의 수동 Stop 표시 계약으로 정한다.
test('#131 manual-stop: 원격 최종 재생→결과 인지→명시 확인 전 선택을 가린다', async () => {
  const { host, guest, hostWire, guestWire } = pair();
  const screen = await render(Game, { controller: host });
  try {
    await stop(host);
    await vi.waitFor(() => expect(host.playback.busy).toBe(true));
    await tick();
    expect(screen.container.querySelector('.overlay')).toBeNull();
    const wireCount = hostWire.sent.length + guestWire.sent.length;
    host.acknowledgeRoundResult('stale');
    host.choosePush(false);
    expect(hostWire.sent.length + guestWire.sent.length).toBe(wireCount);
    expect(host.records).toHaveLength(0);
    await vi.waitFor(() => expect(host.playback.idle).toBe(true), { timeout: 8000 });
    await expect.element(screen.getByRole('button', { name: '결과 확인' })).toBeVisible();
    await expect
      .element(screen.getByTestId('settlement-headline'))
      .toHaveAttribute('title', '호스트 승리 · 스톱');
    choicesHidden(screen.container);
    expect(host.records).toHaveLength(0);
    const result = host.pendingRoundResult;
    if (result === null) throw new Error('재생 완료 결과 누락');
    const oldButton = screen
      .getByRole('button', { name: '결과 확인' })
      .element() as HTMLButtonElement;
    const beforeAck = hostWire.sent.length + guestWire.sent.length;
    host.acknowledgeRoundResult('stale');
    expect(host.pendingRoundResult?.acknowledged).toBe(false);
    await screen.getByRole('button', { name: '결과 확인' }).click();
    host.acknowledgeRoundResult(result.key);
    oldButton.click();
    expect(hostWire.sent.length + guestWire.sent.length).toBe(beforeAck);
    await expect.element(screen.getByRole('button', { name: '받기', exact: true })).toBeVisible();
    expect(document.activeElement).toBe(screen.getByTestId('settlement-headline').element());
    expect(host.records).toHaveLength(0);
    await screen.getByRole('button', { name: '받기', exact: true }).click();
    await vi.waitFor(() => expect(host.playback.settlement).not.toBeNull());
    await expect
      .element(screen.getByRole('button', { name: '다음 판', exact: true }))
      .toBeVisible();
    expect(host.records).toHaveLength(1);
    const balances = host.balances;
    host.choosePush(false);
    expect(host.records).toHaveLength(1);
    expect(host.balances).toBe(balances);
    expect(host.stats.round).toBe(1);
  } finally {
    await screen.unmount();
    host.dispose();
    guest.dispose();
  }
});

test('#131 manual-stop guest: 공개 결과 확인은 송신·정산·다음 판 동의가 아니다', async () => {
  const { host, guest, hostWire, guestWire } = pair();
  const screen = await render(Game, { controller: guest });
  try {
    await stop(host);
    await vi.waitFor(() => expect(guest.playback.busy).toBe(true));
    await tick();
    expect(screen.container.querySelector('.overlay')).toBeNull();
    await vi.waitFor(() => expect(guest.playback.idle).toBe(true), { timeout: 8000 });
    await expect.element(screen.getByRole('button', { name: '결과 확인' })).toBeVisible();
    await expect
      .element(screen.getByTestId('settlement-headline'))
      .toHaveAttribute('title', '호스트 승리 · 스톱');
    await expect.element(screen.getByRole('region', { name: '공개 족보 점수' })).toBeVisible();
    expect(screen.container.querySelector('.amount')).toBeNull();
    choicesHidden(screen.container);
    const result = guest.pendingRoundResult;
    if (result === null || !('publicResult' in result)) throw new Error('게스트 공개 결과 누락');
    expect(result.publicResult.winner).toBe(0);
    expect(result.publicResult.reason).toBe('stop');
    const count = hostWire.sent.length + guestWire.sent.length;
    const balances = host.balances;
    guest.acknowledgeRoundResult('stale');
    guest.choosePush(false);
    expect(guest.pendingRoundResult?.acknowledged).toBe(false);
    await screen.getByRole('button', { name: '결과 확인' }).click();
    guest.acknowledgeRoundResult(result.key);
    guest.acknowledgeRoundResult(result.key);
    guest.nextRound();
    expect(hostWire.sent.length + guestWire.sent.length).toBe(count);
    expect(guest.ready).toBe(false);
    expect(host.balances).toBe(balances);
    expect(host.records).toHaveLength(0);
    await expect.element(screen.getByText('승자의 받기·밀기 선택을 기다리는 중')).toBeVisible();
    choicesHidden(screen.container);
  } finally {
    await screen.unmount();
    host.dispose();
    guest.dispose();
  }
});

for (const timing of ['첫 표시 전', '이미 표시한 뒤'] as const) {
  test(`#131 상대 선확정+next 선수신: ${timing}에도 같은 판 결과를 확인한다`, async () => {
    const { host, guest, hostWire, guestWire } = pair();
    let guestScreen =
      timing === '이미 표시한 뒤' ? await render(Game, { controller: guest }) : null;
    try {
      await stop(host);
      await vi.waitFor(() => expect(host.playback.idle).toBe(true), { timeout: 8000 });
      if (guestScreen !== null)
        await expect
          .element(guestScreen.locator.getByRole('button', { name: '결과 확인' }))
          .toBeVisible();
      const terminalKey = guest.pendingRoundResult?.key;
      await acceptHostFixture(host);
      await vi.waitFor(() => expect(guest.playback.settlement).not.toBeNull());
      host.nextRound();
      expect(host.stats.round).toBe(2);
      await vi.waitFor(() => expect(guest.playback.pending).toBeGreaterThan(0));
      await vi.waitFor(() => expect(guest.playback.busy).toBe(false));
      expect(guest.playback.board.round).toBe(1);
      expect(guest.stats.round).toBe(2);
      if (guestScreen === null) guestScreen = await render(Game, { controller: guest });
      await expect
        .element(guestScreen.locator.getByRole('button', { name: '결과 확인' }))
        .toBeVisible();
      await expect
        .element(guestScreen.locator.getByTestId('settlement-headline'))
        .toHaveAttribute('title', '호스트 승리 · 스톱');
      await expect
        .element(guestScreen.locator.getByRole('heading', { name: '금액', exact: true }))
        .toBeVisible();
      choicesHidden(guestScreen.container);
      expect(guest.pendingRoundResult?.key).toBe(terminalKey);
      const key = guest.pendingRoundResult!.key;
      const count = hostWire.sent.length + guestWire.sent.length;
      const records = host.records.length;
      const balances = host.balances;
      await guestScreen.locator.getByRole('button', { name: '결과 확인' }).click();
      guest.acknowledgeRoundResult(key);
      expect(hostWire.sent.length + guestWire.sent.length).toBe(count);
      expect(host.records).toHaveLength(records);
      expect(host.balances).toBe(balances);
      await guestScreen.locator.getByRole('button', { name: '다음 판', exact: true }).click();
      await vi.waitFor(() => expect(guest.playback.board.round).toBe(2));
      const after = hostWire.sent.length + guestWire.sent.length;
      guest.acknowledgeRoundResult(key);
      expect(guest.pendingRoundResult?.key).not.toBe(key);
      expect(hostWire.sent.length + guestWire.sent.length).toBe(after);
    } finally {
      await guestScreen?.unmount();
      host.dispose();
      guest.dispose();
    }
  });
}

test('#131 복귀 snapshot: 없는 승자·사유·금액을 만들지 않고 미확인부터 시작한다', async () => {
  const { host, guest, hostWire, guestWire } = pair(fixture());
  const screen = await render(Game, { controller: guest });
  try {
    await expect.element(screen.getByRole('button', { name: '결과 확인' })).toBeVisible();
    await expect
      .element(screen.getByTestId('settlement-headline'))
      .toHaveAttribute('title', '판 종료 · 결과 확인 중');
    const result = guest.pendingRoundResult;
    if (result === null || !('publicResult' in result)) throw new Error('복귀 공개 결과 누락');
    expect(result.publicResult.winner).toBeUndefined();
    expect(result.publicResult.reason).toBeUndefined();
    expect(result.summary).toBeNull();
    expect(result.acknowledged).toBe(false);
    expect(host.pendingRoundResult?.acknowledged).toBe(false);
    choicesHidden(screen.container);
    expect(screen.container.querySelector('.amount')).toBeNull();
    const count = hostWire.sent.length + guestWire.sent.length;
    await screen.getByRole('button', { name: '결과 확인' }).click();
    guest.acknowledgeRoundResult(result.key);
    host.choosePush(false);
    expect(hostWire.sent.length + guestWire.sent.length).toBe(count);
    expect(host.records).toHaveLength(0);
    guest.dispose();
    guest.acknowledgeRoundResult(result.key);
    expect(guest.pendingRoundResult).toBeNull();
    expect(hostWire.sent.length + guestWire.sent.length).toBe(count);
  } finally {
    await screen.unmount();
    host.dispose();
    guest.dispose();
  }
});

test('#131 미래 판도 이미 settled: 이전 결과의 다음 판은 새 판 ready를 보내지 않는다', async () => {
  const { host, guest, hostWire, guestWire } = pair();
  const guestScreen = await render(Game, { controller: guest });
  try {
    await stop(host);
    await vi.waitFor(() => expect(host.playback.idle).toBe(true), { timeout: 8000 });
    await expect
      .element(guestScreen.locator.getByRole('button', { name: '결과 확인' }))
      .toBeVisible();
    const oldKey = guest.pendingRoundResult!.key;
    await acceptHostFixture(host);
    // 기존 wiring fixture와 같은 정상 handshake 시드다. 즉시 종료는 UI 순서 조건이며 규칙 기대값이 아니다.
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint8Array) {
        array.fill(0);
        array[0] = 128;
      }
      return array;
    });
    try {
      host.nextRound();
      expect(host.stats.round).toBe(2);
      await vi.waitFor(() => expect(guest.stats.round).toBe(2));
      await vi.waitFor(() => expect(guest.stage).toBe('settled'));
    } finally {
      random.mockRestore();
    }
    await vi.waitFor(() => expect(guest.playback.busy).toBe(false));
    expect(guest.playback.board.round).toBe(1);
    expect(guest.playback.pending).toBeGreaterThan(0);
    expect(guest.pendingRoundResult?.key).toBe(oldKey);
    await guestScreen.locator.getByRole('button', { name: '결과 확인' }).click();
    const count = hostWire.sent.length + guestWire.sent.length;
    const balances = host.balances;
    const records = host.records.length;
    await guestScreen.locator.getByRole('button', { name: '다음 판', exact: true }).click();
    expect(hostWire.sent.length + guestWire.sent.length).toBe(count);
    expect(guest.ready).toBe(false);
    expect(host.balances).toBe(balances);
    expect(host.records).toHaveLength(records);
    await vi.waitFor(() => expect(guest.playback.board.round).toBe(2));
    await expect
      .element(guestScreen.locator.getByRole('button', { name: '결과 확인' }))
      .toBeVisible();
    expect(guest.pendingRoundResult?.key).not.toBe(oldKey);
    expect(guest.pendingRoundResult?.acknowledged).toBe(false);
    guest.acknowledgeRoundResult(oldKey);
    expect(hostWire.sent.length + guestWire.sent.length).toBe(count);
    expect(guest.pendingRoundResult?.acknowledged).toBe(false);
  } finally {
    await guestScreen.unmount();
    host.dispose();
    guest.dispose();
    vi.restoreAllMocks();
  }
});

test('#131 밀기 확정 순번: 같은 종료 결과 확인을 유지하고 기록을 한 번 남긴다', async () => {
  const { host, guest, hostWire, guestWire } = pair();
  const screen = await render(Game, { controller: host });
  try {
    await stop(host);
    await vi.waitFor(() => expect(host.playback.idle).toBe(true), { timeout: 8000 });
    await expect.element(screen.getByRole('button', { name: '결과 확인' })).toBeVisible();
    const result = host.pendingRoundResult;
    if (result === null) throw new Error('밀기 전 결과 누락');
    const terminalSeq = host.playback.board.eventSeq;
    const balances = host.balances;
    await screen.getByRole('button', { name: '결과 확인' }).click();
    await screen.getByRole('button', { name: '밀기 · 다음 판 ×2', exact: true }).click();
    await vi.waitFor(() => expect(host.playback.settlement).not.toBeNull());
    await expect
      .element(screen.getByRole('button', { name: '다음 판', exact: true }))
      .toBeVisible();
    expect(host.playback.board.eventSeq).toBeGreaterThan(terminalSeq);
    expect(host.pendingRoundResult?.key).toBe(result.key);
    expect(host.pendingRoundResult?.acknowledged).toBe(true);
    expect(host.records).toHaveLength(1);
    expect(host.balances).toEqual(balances);
    const count = hostWire.sent.length + guestWire.sent.length;
    host.acknowledgeRoundResult(result.key);
    host.choosePush(true);
    expect(hostWire.sent.length + guestWire.sent.length).toBe(count);
    expect(host.records).toHaveLength(1);
  } finally {
    await screen.unmount();
    host.dispose();
    guest.dispose();
  }
});

test('#131 epoch 복원: 첫 유효 snapshot만 reset하고 duplicate·stale·거절은 reset하지 않는다', async () => {
  const saved = fixture();
  const [hostWire, guestWire, link] = createQueuedTransportPair();
  const host = new HostGame({
    config: saved.config,
    resume: saved,
    transport: hostWire,
    clock: false,
    persist: false,
    now: () => 0,
  });
  expect(host.resumeSaved()).toBe(true);
  const guest = new GuestGame({
    name: saved.state.names[1],
    token: saved.state.token,
    transport: guestWire,
    clock: false,
    persist: false,
    now: () => 0,
    onTicket: () => {},
  });
  link.notify(1, 'present');
  link.flush();
  const screen = await render(Game, { controller: guest });
  let restored: HostGame | null = null;
  try {
    await expect.element(screen.getByRole('button', { name: '결과 확인' })).toBeVisible();
    const oldKey = guest.pendingRoundResult!.key;
    await screen.getByRole('button', { name: '결과 확인' }).click();
    const reset = vi.spyOn(guest.playback, 'reset');
    host.dispose();
    hostWire.reset();
    restored = new HostGame({
      config: saved.config,
      resume: saved,
      transport: hostWire,
      clock: false,
      persist: false,
      now: () => 0,
    });
    expect(restored.resumeSaved()).toBe(true);
    link.notify(1, 'present');
    // 새 welcome 뒤 snapshot이 생성되기 전부터 큐를 관찰한다. 정상 프로토콜 복원만 사용한다.
    const send = vi.spyOn(hostWire, 'send');
    link.flush();
    await expect.element(screen.getByRole('button', { name: '결과 확인' })).toBeVisible();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(guest.pendingRoundResult?.key).not.toBe(oldKey);
    expect(guest.pendingRoundResult?.acknowledged).toBe(false);
    const latest = send.mock.calls
      .flatMap(([message]) => (message.t === 'snapshot' ? [message] : []))
      .at(-1);
    if (latest === undefined) throw new Error('새 세대 snapshot 누락');
    expect(guest.playback.board.eventSeq).toBe(latest.seq);
    expect(guest.playback.board.round).toBe(latest.view.round);
    expect(guest.balances).toEqual(latest.ledger.balances);
    const beforeAck = link.queue.length;
    guest.acknowledgeRoundResult(oldKey);
    expect(link.queue).toHaveLength(beforeAck);
    expect(guest.pendingRoundResult?.acknowledged).toBe(false);
    link.inject(1, JSON.stringify(latest));
    link.inject(
      1,
      JSON.stringify({
        ...latest,
        seq: latest.seq - 1,
        view: { ...latest.view, eventSeq: latest.seq - 1 },
      }),
    );
    link.inject(1, JSON.stringify({ ...latest, view: { ...latest.view, viewer: 99 } }));
    link.flush();
    await tick();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(guest.playback.board.eventSeq).toBe(latest.seq);
    expect(guest.playback.board.round).toBe(latest.view.round);
    expect(guest.balances).toEqual(latest.ledger.balances);
    guest.dispose();
    link.inject(1, JSON.stringify(latest));
    link.flush();
    expect(reset).toHaveBeenCalledTimes(1);
  } finally {
    await screen.unmount();
    host.dispose();
    restored?.dispose();
    guest.dispose();
    vi.restoreAllMocks();
  }
});

test('#131 확정 summary epoch 복원: 이전 다음 판 재생은 복원된 금액·held 결과를 덮지 않는다', async () => {
  const saved = beforeStop();
  const storageKey = 'gostop.host.v2';
  const previous = localStorage.getItem(storageKey);
  const [hostWire, guestWire, link] = createQueuedTransportPair();
  const host = new HostGame({
    config: saved.config,
    resume: saved,
    transport: hostWire,
    clock: false,
    persist: true,
    now: () => 0,
  });
  expect(host.resumeSaved()).toBe(true);
  const guest = new GuestGame({
    name: saved.state.names[1],
    token: saved.state.token,
    transport: guestWire,
    clock: false,
    persist: false,
    now: () => 0,
    onTicket: () => {},
  });
  link.notify(1, 'present');
  link.flush();
  const screen = await render(Game, { controller: guest });
  let restored: HostGame | null = null;
  try {
    await stop(host);
    link.flush();
    await expect.element(screen.locator.getByRole('button', { name: '결과 확인' })).toBeVisible();
    const oldKey = guest.pendingRoundResult!.key;
    await screen.locator.getByRole('button', { name: '결과 확인' }).click();
    await acceptHostFixture(host);
    link.flush();
    await vi.waitFor(() => expect(guest.playback.settlement).not.toBeNull());
    await expect
      .element(screen.locator.getByRole('button', { name: '다음 판', exact: true }))
      .toBeVisible();
    const committed = loadHostSave();
    if (committed === null) throw new Error('정상 확정 저장본 누락');
    expect(committed.state.stage).toBe('settled');
    expect(committed.records).toHaveLength(1);
    const held = guest.playback.settlement;
    if (held === null) throw new Error('확정 held summary 누락');
    expect(guest.balances).toEqual(committed.state.ledger.balances);
    const reset = vi.spyOn(guest.playback, 'reset');
    // 기존 wiring의 byte0 분배 fixture로 다음 판 재생을 시작한다. 규칙 계산 기대값은 추가하지 않는다.
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint8Array) array.fill(0);
      return array;
    });
    try {
      host.nextRound();
      link.flush();
      expect(guest.stats.round).toBe(2);
      expect(guest.stage).toBe('playing');
    } finally {
      random.mockRestore();
    }
    await screen.locator.getByRole('button', { name: '다음 판', exact: true }).click();
    await vi.waitFor(() => expect(guest.playback.busy).toBe(true));
    expect(reset).not.toHaveBeenCalled();
    host.dispose();
    hostWire.reset();
    restored = new HostGame({
      config: committed.config,
      resume: committed,
      transport: hostWire,
      clock: false,
      persist: false,
      now: () => 0,
    });
    expect(restored.resumeSaved()).toBe(true);
    const send = vi.spyOn(hostWire, 'send');
    link.notify(1, 'present');
    link.flush();
    const latest = send.mock.calls
      .flatMap(([message]) => (message.t === 'snapshot' ? [message] : []))
      .at(-1);
    if (latest === undefined || latest.settlement === undefined)
      throw new Error('새 세대의 확정 snapshot 누락');
    expect(reset).toHaveBeenCalledTimes(1);
    const replacement = reset.mock.calls[0];
    if (replacement === undefined || replacement[1] === null || replacement[1] === undefined)
      throw new Error('확정 summary를 전달한 reset 누락');
    expect(replacement[0].eventSeq).toBe(latest.seq);
    expect(replacement[0].round).toBe(latest.view.round);
    expect(replacement[1].view).toEqual({ ...latest.settlement, names: committed.state.names });
    await vi.waitFor(() => expect(guest.playback.busy).toBe(false));
    await tick();
    expect(guest.playback.pending).toBe(0);
    expect(guest.playback.board.round).toBe(1);
    expect(guest.playback.board.eventSeq).toBe(latest.seq);
    expect(guest.playback.settlement).toEqual(replacement[1]);
    expect(guest.playback.settlement?.view).toEqual(held.view);
    expect(guest.balances).toEqual(latest.ledger.balances);
    expect(guest.balances).toEqual(committed.state.ledger.balances);
    expect(restored.records).toEqual(committed.records);
    await expect.element(screen.locator.getByRole('button', { name: '결과 확인' })).toBeVisible();
    expect(guest.pendingRoundResult?.key).not.toBe(oldKey);
    expect(guest.pendingRoundResult?.acknowledged).toBe(false);
    const count = link.queue.length;
    guest.acknowledgeRoundResult(oldKey);
    expect(link.queue).toHaveLength(count);
    expect(guest.pendingRoundResult?.acknowledged).toBe(false);
    expect(guest.playback.settlement).toEqual(replacement[1]);
    expect(guest.balances).toEqual(committed.state.ledger.balances);
    expect(reset).toHaveBeenCalledTimes(1);
  } finally {
    await screen.unmount();
    host.dispose();
    restored?.dispose();
    guest.dispose();
    vi.restoreAllMocks();
    if (previous === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, previous);
  }
});
