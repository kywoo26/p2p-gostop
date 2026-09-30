// 호스트·게스트 화면 연결 (Vitest 브라우저 모드): 실제 protocol HostSession/GuestSession을 MemoryTransport로 잇고
// 화면 컨트롤러(HostGame·GuestGame)가 로비 → 판 → 정산 → 다음 판을 끝까지 도는지, 게스트가 호스트 손패를 못 보는지 본다.
// 애니메이션 없이(보드 루트를 붙이지 않음) 재생 큐만 돈다. 두 좌석 모두 화면에 보이는 합법 수에서만 무작위로 고른다.
import { PRESETS, type Action, type CardId } from '@p2p-gostop/engine';
import {
  createMemoryTransportPair,
  createQueuedTransportPair,
  decode,
  type DecisionClock,
  type BoardView,
  type HostMessage,
  type Message,
  type RelayNotice,
  type Transport,
} from '@p2p-gostop/protocol';
import { expect, onTestFinished, test, vi } from 'vitest';
import type { GameController } from '../game/controller.ts';
import { GuestGame } from './guest.svelte.ts';
import { clearHostSave, HostGame, loadHostSave, type HostConfig } from './host.svelte.ts';
import type { GuestTicket } from './ticket.ts';

const CONFIG: HostConfig = {
  preset: 'standard',
  rules: PRESETS.standard,
  perPoint: 100,
  startBalance: 1_000_000_000,
  hostName: '호스트',
  timerDecisionMs: null,
};

const TIMED_CONFIG: HostConfig = { ...CONFIG, timerDecisionMs: 5_000 };

test('중계 present로 첫 hello를 한 번 보내고 프리셋 welcome도 한 번만 받는다 (FR-51, NP-02)', () => {
  const [hostWire, guestWire, link] = createQueuedTransportPair();
  const welcomes: HostMessage[] = [];
  const send = hostWire.send.bind(hostWire);
  hostWire.send = (message: Message) => {
    if (message.t === 'welcome') welcomes.push(message);
    send(message);
  };
  const host = new HostGame({ config: CONFIG, transport: hostWire, clock: false, persist: false });
  const guest = new GuestGame({
    name: '민지',
    transport: guestWire,
    onTicket: () => {},
    clock: false,
    persist: false,
  });
  onTestFinished(() => {
    guest.dispose();
    host.dispose();
  });

  expect(link.queue).toHaveLength(0);
  link.notify(1, 'present');
  link.flush();
  expect(welcomes).toHaveLength(1);
  expect(guest.lobby?.rules).toEqual(PRESETS.standard);

  host.configure({ ...CONFIG, preset: 'arcade', rules: PRESETS.arcade });
  link.flush();
  expect(welcomes).toHaveLength(2);
  expect(welcomes[1]).toMatchObject({ rules: PRESETS.arcade });
  expect(guest.lobby?.rules).toEqual(PRESETS.arcade);

  // 수동 재접속은 새 소켓의 present가 hello를 맡는다. 먼저 보낸 hello가 큐에 남으면
  // 새 소켓에서 두 번 도착해 같은 welcome을 두 번 받는다.
  guest.reconnect();
  link.notify(1, 'present');
  link.flush();
  expect(welcomes).toHaveLength(3);
  expect(guest.lobby?.rules).toEqual(PRESETS.arcade);

  // 호스트 부재 중 수동 재접속은 hello를 쌓지 않고, 복귀 알림에서 한 번 보낸다.
  guestWire.disconnect();
  link.notify(1, 'absent');
  guest.reconnect();
  expect(link.queue).toHaveLength(0);
  link.notify(1, 'joined');
  link.flush();
  expect(welcomes).toHaveLength(4);
  expect(guest.lobby?.rules).toEqual(PRESETS.arcade);
});

function lcg(seed: number) {
  let x = seed >>> 0;
  return (n: number) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x % n;
  };
}

/** 재생 큐가 모두 돌 때까지 (setTimeout·tick이 섞여 있어 매크로 태스크를 몇 번 넘긴다) */
async function settle(): Promise<void> {
  for (let i = 0; i < 2; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function legalOf(c: GameController): readonly Action[] {
  return c.playback.board.legal;
}

/** 조작 전에 구독하고 대상 상태를 담은 수신 메시지를 기다린다. 타이머는 실패 상한뿐이다. */
function receiveState(
  wire: Transport,
  matches: (message: HostMessage) => boolean,
  act: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const unsubscribe = wire.onMessage((raw) => {
      const decoded = decode(raw, 'host');
      if (!decoded.ok || !matches(decoded.message)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('대상 상태 메시지를 받지 못했습니다'));
    }, 5_000);
    try {
      act();
    } catch (error) {
      clearTimeout(timeout);
      unsubscribe();
      reject(error);
    }
  });
}

async function playOneRound(host: HostGame, guest: GuestGame): Promise<void> {
  expect(host.start()).toBe(true);
  await settle();
  for (let step = 0; step < 300; step++) {
    if (host.stage === 'settled' || host.stage === 'bankrupt') {
      await settle();
      return;
    }
    for (const game of [host, guest]) {
      if (!game.canAct) continue;
      const legal = legalOf(game);
      const action = legal.find((a) => a.type === 'stop') ?? legal[0];
      if (action !== undefined) game.submit(action);
      break;
    }
    await settle();
  }
  throw new Error('한 판이 끝나지 않았습니다');
}

async function startTimedDecision(host: HostGame, guest: GuestGame): Promise<DecisionClock> {
  expect(host.start()).toBe(true);
  await settle();
  for (let step = 0; step < 4 && host.decisionClock === null; step++) {
    const actor = host.canAct ? host : guest;
    const action = actor.playback.board.legal[0];
    expect(action).toBeDefined();
    expect(actor.submit(action!)).toBe(true);
    await settle();
  }
  expect(host.decisionClock?.state).toBe('preparing');
  host.decisionRendered();
  guest.decisionRendered();
  await settle();
  expect(host.decisionClock?.state).toBe('running');
  return host.decisionClock!;
}

test('새 로비의 v2 첫 hello에도 VERSION_MISMATCH와 새로고침 안내를 보낸다 (NP-04)', () => {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostGame({
    config: TIMED_CONFIG,
    transport: hostWire,
    clock: false,
    persist: false,
  });
  guestWire.send({ t: 'hello', v: 2, name: '옛 게스트' });
  expect(hostWire.sent.at(-1)).toMatchObject({
    t: 'reject',
    reason: 'VERSION_MISMATCH',
    message: expect.stringContaining('새로고침'),
  });
  expect(host.stage).toBe('lobby');
  host.dispose();
});

test('소켓 닫힘은 현재 단조 시각에서 잔여량을 보존하고 중복 닫힘으로 환급하지 않는다 (NP-10)', async () => {
  let now = 0;
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostGame({
    config: TIMED_CONFIG,
    transport: hostWire,
    clock: false,
    persist: false,
    now: () => now,
  });
  const guest = new GuestGame({
    name: '민지',
    transport: guestWire,
    onTicket: () => {},
    clock: false,
    persist: false,
    now: () => now,
  });
  try {
    await settle();
    const clock = await startTimedDecision(host, guest);
    expect(clock.deadlineMs).toBe(5_000);
    now = 499;
    hostWire.disconnect();
    expect(host.decisionClock?.state).toBe('paused');
    expect(host.decisionClock?.remainingMs).toBe(4_501);
    now = 999;
    hostWire.disconnect();
    expect(host.decisionClock?.remainingMs).toBe(4_501);
  } finally {
    guest.dispose();
    host.dispose();
  }
});

test('게스트 hidden→visible은 열린 소켓에서도 hello·snapshot·새 offer를 시작한다 (NP-10)', async () => {
  let now = 0;
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostGame({
    config: TIMED_CONFIG,
    transport: hostWire,
    clock: false,
    persist: false,
    now: () => now,
  });
  const guest = new GuestGame({
    name: '민지',
    transport: guestWire,
    onTicket: () => {},
    persist: false,
    now: () => now,
  });
  try {
    await settle();
    const before = await startTimedDecision(host, guest);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(host.decisionClock?.state).toBe('paused');
    now = 500;
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    host.decisionRendered();
    guest.decisionRendered();
    await settle();
    expect(guestWire.sent.some((m) => m.t === 'hello' && m.lastSeq === guest.seq)).toBe(true);
    expect(host.decisionClock?.key).toEqual(before.key);
    expect(host.decisionClock?.attempt).toBeGreaterThan(before.attempt);
    expect(host.decisionClock?.state).toBe('running');
  } finally {
    guest.dispose();
    host.dispose();
    visibility.mockRestore();
  }
});

test.each([
  { secretByte: 0, stage: 'playing' },
  { secretByte: 128, stage: 'settled' },
] as const)(
  'settled 저장본 복원·hello 재처리 → 다음 판 $stage (MN-05·NP-03·NF-05)',
  async ({ secretByte, stage }) => {
    clearHostSave();
    onTestFinished(clearHostSave);
    const [hostWire, guestWire] = createMemoryTransportPair();
    const host = new HostGame({ config: CONFIG, transport: hostWire, clock: false });
    onTestFinished(() => host.dispose());
    const guest = new GuestGame({
      name: '민지',
      transport: guestWire,
      onTicket: () => {},
      persist: false,
    });
    onTestFinished(() => guest.dispose());
    await settle();
    await playOneRound(host, guest);
    expect(guest.settlementNote).toContain('검증 통과');
    const saved = loadHostSave();
    expect(saved?.state.stage).toBe('settled');
    expect(host.playback.settlement).not.toBeNull();
    const records = host.records.length;
    host.dispose();
    guest.dispose();

    const [restoredWire, rejoinedWire] = createMemoryTransportPair();
    const resumed = new HostGame({
      config: CONFIG,
      resume: saved,
      transport: restoredWire,
      clock: false,
      persist: false,
    });
    onTestFinished(() => resumed.dispose());
    const rejoined = new GuestGame({
      name: '민지',
      token: saved?.state.token ?? null,
      transport: rejoinedWire,
      onTicket: () => {},
      persist: false,
    });
    onTestFinished(() => rejoined.dispose());
    expect(rejoined.lobby).toBeNull();
    await receiveState(
      rejoinedWire,
      (m) => m.t === 'snapshot' && m.status.round === 1 && m.status.stage === 'settled',
      () => expect(resumed.resumeSaved()).toBe(true),
    );
    expect(resumed.playback.settlement?.view).toEqual(host.playback.settlement?.view);
    expect(resumed.records).toHaveLength(records);
    expect(rejoined.lobby?.names).toEqual(['호스트', '민지']);
    expect(resumed.guestOnline).toBe(true);
    // 다음 판은 비동기로 배달한다. 즉시 단언하면 handshake이며, 고정 sleep 대신 상태 수신을 기다려야 한다.
    for (const wire of [restoredWire, rejoinedWire]) {
      const send = wire.send.bind(wire);
      wire.send = (message) => queueMicrotask(() => send(message));
    }
    // 32바이트 secret의 첫 바이트만 다르다. 0은 일반 분배, 128은 바닥 총통(R6)으로 즉시 정산한다.
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint8Array) {
        array.fill(0);
        array[0] = secretByte;
      }
      return array;
    });
    try {
      await receiveState(
        rejoinedWire,
        (m) =>
          (m.t === 'events' || m.t === 'snapshot') &&
          m.status.round === 2 &&
          m.status.stage === stage,
        () => resumed.nextRound(),
      );
    } finally {
      random.mockRestore();
    }
    expect(resumed.stats.round).toBe(2);
    expect(resumed.stage).toBe(stage);
    expect(rejoined.stage).toBe(stage);
    expect(rejoined.stats.seq).toBe(resumed.stats.seq);
    expect(resumed.records).toHaveLength(records + (stage === 'settled' ? 1 : 0));
    if (stage === 'settled') {
      expect(resumed.records.at(-1)).toMatchObject({ round: 2, winner: null, reason: 'nagari' });
      expect(
        restoredWire.sent.some(
          (m) =>
            m.t === 'events' &&
            m.list.some((e) => e.type === 'Settled' && e.settlement.reason === 'floorChongtong'),
        ),
      ).toBe(true);
    }
  },
  30_000,
);

test('bankrupt 저장본은 재충전 선택이 가능한 정산을 복원한다 (MN-02·MN-05)', async () => {
  clearHostSave();
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostGame({
    config: { ...CONFIG, startBalance: 0 },
    transport: hostWire,
    clock: false,
  });
  const guest = new GuestGame({
    name: '민지',
    transport: guestWire,
    onTicket: () => {},
    persist: false,
  });
  await settle();
  await playOneRound(host, guest);
  const saved = loadHostSave();
  expect(saved?.state.stage).toBe('bankrupt');
  host.dispose();
  guest.dispose();
  const [restoredWire] = createMemoryTransportPair();
  const resumed = new HostGame({
    config: CONFIG,
    resume: saved,
    transport: restoredWire,
    clock: false,
    persist: false,
  });
  expect(resumed.resumeSaved()).toBe(true);
  expect(resumed.playback.settlement).not.toBeNull();
  expect(resumed.bankrupt).toBe(true);
  resumed.refill();
  expect(resumed.bankrupt).toBe(false);
  resumed.dispose();
  clearHostSave();
}, 30_000);

test('양쪽 파산 선택: 게스트 종료와 호스트 종료가 각각 세션을 끝낸다 (MN-02)', async () => {
  for (const endingSeat of [0, 1] as const) {
    const [hostWire, guestWire] = createMemoryTransportPair();
    const host = new HostGame({
      config: { ...CONFIG, startBalance: 0 },
      transport: hostWire,
      clock: false,
      persist: false,
    });
    const guest = new GuestGame({
      name: '민지',
      transport: guestWire,
      onTicket: () => {},
      persist: false,
    });
    await settle();
    await playOneRound(host, guest);
    expect(host.stage).toBe('bankrupt');
    expect(host.bankrupt).toBe(true);
    expect(guest.bankrupt).toBe(true);
    if (endingSeat === 1) {
      guest.endBankruptcy();
      expect(guestWire.sent.at(-1)).toEqual({ t: 'bankruptcy', choice: 'end' });
    } else host.end();
    expect(host.stage).toBe('ended');
    expect(
      hostWire.sent.some(
        (m) => m.t === 'sessionEnd' && m.reason === 'bankruptcy' && m.seat === endingSeat,
      ),
    ).toBe(true);
    expect(guest.phase).toBe('ended');
    expect(guest.playback.settlement).not.toBeNull();
    host.dispose();
    guest.dispose();
  }
}, 30_000);

test('sessionEnd 뒤 게스트는 최종 정산과 종료 안내를 유지한다', async () => {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostGame({ config: CONFIG, transport: hostWire, clock: false, persist: false });
  const guest = new GuestGame({
    name: '민지',
    transport: guestWire,
    onTicket: () => {},
    persist: false,
  });
  await settle();
  await playOneRound(host, guest);
  guest.nextRound();
  await settle();
  expect(guest.playback.settlement).toBeNull();
  host.end();
  expect(guest.phase).toBe('ended');
  expect(guest.playback.settlement).not.toBeNull();
  expect(guest.notice).toBe('호스트가 대전을 끝냈습니다');
  expect(guest.settlementNote).toContain('호스트가 대전을 끝냈습니다');
  guest.dispose();
}, 30_000);

test('토큰 거절 뒤 다시 연결은 joinFresh로 토큰 없는 hello를 보낸다', () => {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const guest = new GuestGame({
    name: '민지',
    token: 'a'.repeat(32),
    transport: guestWire,
    onTicket: () => {},
    persist: false,
  });
  hostWire.send({ t: 'reject', seq: 0, reason: 'TOKEN_INVALID', message: 'TOKEN_INVALID' });
  expect(guest.phase).toBe('rejected');
  guest.reconnect();
  expect(guestWire.sent.at(-1)).toMatchObject({ t: 'hello', name: '민지' });
  expect(guestWire.sent.at(-1)).not.toHaveProperty('sessionToken');
  guest.dispose();
});

test('게스트 시계는 1초마다 진행하고 화면 복귀 즉시 진행하며 dispose 뒤 멈춘다 (NP-03·NF-05)', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const [, guestWire] = createMemoryTransportPair();
  const guest = new GuestGame({
    name: '민지',
    transport: guestWire,
    onTicket: () => {},
    persist: false,
    now: () => 6_000,
  });
  const advance = vi.spyOn(
    (guest as unknown as { session: { advanceTime(now: number): void } }).session,
    'advanceTime',
  );
  try {
    vi.advanceTimersByTime(1_000);
    expect(advance).toHaveBeenCalledWith(6_000);
    const calls = advance.mock.calls.length;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(advance).toHaveBeenCalledTimes(calls + 1);
    guest.dispose();
    vi.advanceTimersByTime(2_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(advance).toHaveBeenCalledTimes(calls + 1);
  } finally {
    guest.dispose();
    visibility.mockRestore();
    vi.useRealTimers();
  }
});

test('게스트 3분 부재 때 계속 기다리기 또는 종료를 고를 수 있다 (spec 2.4)', async () => {
  let now = 0;
  const wallClock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostGame({
    config: CONFIG,
    transport: hostWire,
    clock: false,
    persist: false,
    now: () => now,
  });
  const guest = new GuestGame({
    name: '민지',
    transport: guestWire,
    onTicket: () => {},
    persist: false,
  });
  try {
    await settle();
    expect(host.start()).toBe(true);
    (host as unknown as { onRelay(n: object): void }).onRelay({ t: 'relay', peer: 'left' });
    now = 180_001;
    host.tick();
    expect(host.waitPrompt).toBe(true);
    host.keepWaiting();
    expect(host.waitPrompt).toBe(false);
    host.end();
    expect(hostWire.sent.some((m) => m.t === 'sessionEnd' && m.reason === 'host')).toBe(true);
  } finally {
    guest.dispose();
    host.dispose();
    wallClock.mockRestore();
  }
});

test('호스트 시계만 움직일 때 rev·seq가 같으면 저장을 다시 쓰지 않는다 (MN-05)', async () => {
  clearHostSave();
  let now = 0;
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  try {
    const [hostWire, guestWire] = createMemoryTransportPair();
    const host = new HostGame({
      config: CONFIG,
      transport: hostWire,
      clock: false,
      now: () => now,
    });
    const guest = new GuestGame({
      name: '민지',
      transport: guestWire,
      onTicket: () => {},
      persist: false,
    });
    await settle();
    expect(host.start()).toBe(true);
    await settle();
    const writes = () => setItem.mock.calls.filter(([key]) => key === 'gostop.host.v2').length;
    const before = writes();
    now = 15_000;
    host.tick();
    now = 30_000;
    host.tick();
    expect(writes()).toBe(before);
    host.dispose();
    guest.dispose();
  } finally {
    setItem.mockRestore();
    clearHostSave();
  }
});

/** 게스트가 받은 메시지에서 좌석 0 손패로 보일 수 있는 카드 ID를 모은다 */
function cardsSeenByGuest(message: Message): { ids: CardId[]; handVisible: boolean } {
  const ids: CardId[] = [];
  let handVisible = false;
  const board = (view: BoardView) => {
    if (view.seats[0].hand !== null) handVisible = true;
    for (const g of view.floor) ids.push(...g.cards);
    for (const s of view.seats) {
      const c = s.captured;
      ids.push(...c.gwang, ...c.yeol, ...c.tti, ...c.pi, ...(s.hand ?? []));
    }
    if (view.inFlight.played !== null) ids.push(view.inFlight.played);
    ids.push(...view.inFlight.staged);
  };
  if (message.t === 'snapshot' || message.t === 'events') board(message.view);
  if (message.t === 'events') {
    // 규칙상 공개되는 카드는 뺀다: 선 고르기 후보(분배 때 덱을 다시 섞는다, engine deal.ts),
    // 흔들기로 보여 준 손패(E11), 총통을 끝낼 때 보여 준 4장(E13)
    const PUBLIC = new Set(['FirstPicked', 'FirstPickTie', 'Shake', 'Chongtong']);
    for (const e of message.list) if (!PUBLIC.has(e.type)) ids.push(...e.cards);
  }
  return { ids, handVisible };
}

test('로비 → 시작 → 여러 판: 양쪽 화면이 같은 원장·순번, 게스트는 호스트 손패를 못 본다 (AC-04 축소판, spec 4.5)', async () => {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const tickets: GuestTicket[] = [];
  const host = new HostGame({ config: CONFIG, transport: hostWire, clock: false, persist: false });
  const guest = new GuestGame({
    name: '민지',
    transport: guestWire,
    onTicket: (t) => tickets.push(t),
    persist: false,
  });

  // 게스트에게 가는 모든 메시지에서 그 순간 호스트 손패가 보이는지 검사한다
  const leaks: string[] = [];
  const session = () =>
    (host as unknown as { session: { state: { seats: { hand: CardId[] }[] } | null } | null })
      .session;
  const send = hostWire.send.bind(hostWire);
  hostWire.send = (message: Message) => {
    send(message);
    const hand = new Set(session()?.state?.seats[0]?.hand ?? []);
    const seen = cardsSeenByGuest(message);
    if (seen.handVisible) leaks.push(`${message.t}: hand array`);
    for (const id of seen.ids) if (hand.has(id)) leaks.push(`${message.t}: ${id}`);
  };

  await settle();
  // 로비: 이름·토큰이 오가고 아직 판은 없다
  expect(host.guestName).toBe('민지');
  expect(host.guestOnline).toBe(true);
  expect(guest.lobby?.names).toEqual(['호스트', '민지']);
  expect(guest.lobby?.ledger.startBalance).toBe(CONFIG.startBalance);
  expect(tickets.at(-1)?.token).toBe(host.token);
  expect(guest.phase).toBe('lobby');

  expect(host.start()).toBe(true);
  await settle();
  expect(host.phase).toBe('playing');
  expect(guest.phase).toBe('playing');

  const pick = lcg(7);
  const target = 4;
  let idle = 0;
  const describe = () =>
    JSON.stringify({
      host: {
        canAct: host.canAct,
        idle: host.playback.idle,
        busy: host.playback.busy,
        pending: host.playback.pending,
        settlement: host.playback.settlement !== null,
        legal: host.playback.board.legal.length,
        online: host.guestOnline,
        bankrupt: host.bankrupt,
        notice: host.notice,
        stats: host.stats,
      },
      guest: {
        canAct: guest.canAct,
        idle: guest.playback.idle,
        pending: guest.playback.pending,
        settlement: guest.playback.settlement !== null,
        legal: guest.playback.board.legal.length,
        notice: guest.notice,
        phase: guest.phase,
        stats: guest.stats,
      },
    });
  for (let step = 0; step < 4000; step++) {
    if (host.stats.roundsPlayed >= target && guest.stats.roundsPlayed >= target) break;
    if (host.playback.settlement !== null) host.nextRound();
    if (guest.playback.settlement !== null) guest.nextRound();
    let acted = false;
    for (const c of [host, guest] as const) {
      if (!c.canAct) continue;
      const legal = legalOf(c);
      const action = legal[pick(legal.length)];
      if (action === undefined) continue;
      expect(c.submit(action, performance.now())).toBe(true);
      acted = true;
      break;
    }
    await settle();
    idle = acted ? 0 : idle + 1;
    if (idle > 40) throw new Error(`진행 멈춤: ${describe()}`);
  }

  expect(host.stats.roundsPlayed).toBeGreaterThanOrEqual(target);
  expect(guest.stats.roundsPlayed).toBe(host.stats.roundsPlayed);
  // MN-01: 원장은 두 좌석 사이의 이동뿐이고 양쪽 화면이 같은 잔액을 본다
  const [a, b] = host.stats.balances;
  expect(a + b).toBe(CONFIG.startBalance * 2);
  expect(guest.stats.balances).toEqual(host.stats.balances);
  // NP-03: 순번이 끊기지 않고 같다
  expect(guest.stats.seq).toBe(host.stats.seq);
  expect(leaks).toEqual([]);
  // 정산 화면의 두 이름은 양쪽이 같다
  expect(host.records).toHaveLength(host.stats.roundsPlayed);

  host.dispose();
  guest.dispose();
}, 60_000);

test('게스트가 끊겼다 돌아오면 같은 토큰으로 재동기화하고 판이 이어진다 (spec 2.4, NF-05)', async () => {
  const [hostWire, guestWire] = createMemoryTransportPair();
  let notifyRelay: (notice: RelayNotice) => void = () => {};
  const relayWire: Transport = {
    send: (message) => guestWire.send(message),
    onMessage: (handler) => guestWire.onMessage(handler),
    onClose: (handler) => guestWire.onClose(handler),
    reconnect: () => guestWire.reconnect(),
    onRelay: (handler) => {
      notifyRelay = handler;
      return () => {
        notifyRelay = () => {};
      };
    },
  };
  const host = new HostGame({ config: CONFIG, transport: hostWire, clock: false, persist: false });
  const guest = new GuestGame({
    name: '민지',
    transport: relayWire,
    onTicket: () => {},
    persist: false,
  });
  notifyRelay({ t: 'relay', peer: 'present' });
  await settle();
  host.start();
  await settle();
  const pick = lcg(11);
  for (let step = 0; step < 30; step++) {
    for (const c of [host, guest] as const) {
      if (c.playback.settlement !== null) c.nextRound();
      if (!c.canAct) continue;
      const legal = legalOf(c);
      const action = legal[pick(legal.length)];
      if (action !== undefined) c.submit(action);
      break;
    }
    await settle();
  }
  const before = host.stats.seq;
  guestWire.disconnect();
  // 게스트가 없는 동안 호스트는 입력을 막는다 (게임은 게스트 부재 중 진행되지 않는다, spec 2.4)
  (host as unknown as { onRelay(n: object): void }).onRelay({ t: 'relay', peer: 'left' });
  expect(host.guestOnline).toBe(false);
  expect(host.canAct).toBe(false);
  expect(host.notice).toContain('연결 끊김');
  guestWire.reconnect();
  (host as unknown as { onRelay(n: object): void }).onRelay({ t: 'relay', peer: 'joined' });
  // 실제 중계의 present 알림으로 GuestSession이 스스로 hello를 보낸다.
  await receiveState(
    guestWire,
    (m) =>
      (m.t === 'snapshot' || m.t === 'events') &&
      m.status.round === host.stats.round &&
      guest.stats.seq === host.stats.seq,
    () => notifyRelay({ t: 'relay', peer: 'present' }),
  );
  expect(host.guestOnline).toBe(true);
  expect(guest.stats.seq).toBe(host.stats.seq);
  expect(host.stats.seq ?? 0).toBeGreaterThanOrEqual(before ?? 0);
  host.dispose();
  guest.dispose();
}, 30_000);
