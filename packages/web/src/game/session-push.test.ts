// FR-14·FR-16·AI-02, plan §4.2 .2-A: 밀기 보류와 최종 원장 반영.
import { legalActions, PRESETS, settle, type Seat } from '@p2p-gostop/engine';
import { expect, test } from 'vitest';
import { createMemoryTransportPair, GuestSession, HostSession } from '@p2p-gostop/protocol';
import { GuestGame } from '../p2p/guest.svelte.ts';
import { HostGame } from '../p2p/host.svelte.ts';
import { pushOffer } from './adapter.ts';
import type { AiClient } from './ai-client.ts';
import type { AiRequest, AiResult } from './ai-core.ts';
import { SoloSession } from './solo.svelte.ts';
import {
  acceptRound,
  actingSeats,
  createSession,
  endSession,
  parseSession,
  sessionAct,
  startNextRound,
  type SessionState,
} from './session.ts';

function fresh(seed = 20260929): SessionState {
  return createSession({
    preset: 'arcade',
    rules: PRESETS.arcade,
    perPoint: 100,
    startBalance: 1_000_000,
    names: ['가', '나'],
    seed,
  }).session;
}

function untilDecision(input: SessionState): SessionState {
  let session = input;
  for (let guard = 0; guard < 2000; guard++) {
    if (session.phase === 'pushDecision' || session.phase === 'roundOver') return session;
    const seat = actingSeats(session.game)[0];
    if (seat === undefined) throw new Error('진행 중인데 입력 좌석 없음');
    const legal = legalActions(session.game, seat);
    const action = legal.find((a) => a.type === 'stop') ?? legal[0];
    if (action === undefined) throw new Error('합법 수 없음');
    const result = sessionAct(session, action);
    if (!result.ok) throw new Error(result.message);
    session = result.session;
  }
  throw new Error('판이 끝나지 않음');
}

function winnerDecision(): SessionState {
  let session = fresh();
  for (let round = 0; round < 20; round++) {
    session = untilDecision(session);
    if (session.phase === 'pushDecision') return session;
    session = startNextRound(session).session;
  }
  throw new Error('승자 밀기 선택이 없음');
}

function winnerDecisionFor(wanted: Seat): SessionState {
  for (let seed = 1; seed <= 50; seed++) {
    let session = fresh(seed);
    for (let round = 0; round < 10; round++) {
      session = untilDecision(session);
      if (session.phase === 'pushDecision' && session.game.result?.winner === wanted)
        return session;
      session = session.phase === 'pushDecision' ? acceptRound(session) : session;
      session = startNextRound(session).session;
    }
  }
  throw new Error(`좌석 ${wanted} 밀기 결정 대기 판이 없음`);
}

test('받기: 보류 저장·복원 뒤 확정 정산은 원장과 기록에 한 번만 들어간다 (FR-16)', () => {
  const pending = winnerDecision();
  expect(pending.records).toHaveLength(pending.roundNumber - 1);
  const restored = parseSession(JSON.parse(JSON.stringify(pending)) as unknown);
  expect(restored?.phase).toBe('pushDecision');
  expect(restored?.ledger).toEqual(pending.ledger);
  const accepted = acceptRound(restored!);
  const winner = pending.game.result?.winner;
  if (winner === null || winner === undefined) throw new Error('승자 없음');
  expect(pushOffer(pending.game, pending.ledger).amount).toBe(
    accepted.ledger.balances[winner] - pending.ledger.balances[winner],
  );
  expect(accepted.records).toHaveLength(pending.roundNumber);
  expect(accepted.records.at(-1)?.settlement.pushed).toBe(false);
  expect(acceptRound(accepted)).toEqual(accepted);
  expect(accepted.ledger.balances).toEqual(accepted.records.at(-1)?.after);
  expect(endSession(pending).records).toHaveLength(pending.roundNumber);
});

test('밀기: 포기 정산 0, 다음 판 ×2, 중복·패자 입력 거부 (FR-14·16)', () => {
  const pending = winnerDecision();
  const winner = pending.game.result?.winner;
  if (winner === null || winner === undefined) throw new Error('승자 없음');
  const loser = winner === 0 ? 1 : 0;
  expect(sessionAct(pending, { type: 'push', seat: loser }).ok).toBe(false);
  const result = sessionAct(pending, { type: 'push', seat: winner });
  if (!result.ok) throw new Error(result.message);
  const pushed = result.session;
  expect(pushed.records).toHaveLength(pending.roundNumber);
  expect(pushed.records.at(-1)?.settlement).toMatchObject({
    pushed: true,
    finalPoints: 0,
    nextPushes: 1,
  });
  expect(pushed.records.at(-1)?.settlement.forfeitedPoints).toBeGreaterThan(0);
  expect(pushed.ledger.balances).toEqual(pending.ledger.balances);
  expect(sessionAct(pushed, { type: 'push', seat: winner }).ok).toBe(false);
  const next = startNextRound(pushed).session;
  expect(next.game.round.pushes).toBe(1);
  expect(next.game.round.carry).toBe(1);
  expect(settle(pushed.game).nextPushes).toBe(1);
  const ended = endSession(pushed);
  expect(ended.ledger).toEqual(pushed.ledger);
  expect(ended.records).toEqual(pushed.records);
  expect(endSession(ended)).toEqual(ended);
});

test.each([false, true])(
  'CPU %s: Worker 요청 하나의 받기/밀기 결과만 확정한다 (AI-02)',
  async (push) => {
    const pending = winnerDecisionFor(1);
    const requests: AiRequest[] = [];
    const pendingAnswer: { resolve?: (result: AiResult) => void } = {};
    const ai: AiClient = {
      mode: 'worker',
      decide(request) {
        requests.push(request);
        return new Promise<AiResult>((resolve) => (pendingAnswer.resolve = resolve));
      },
      dispose() {},
    };
    const root = document.createElement('div');
    document.body.append(root);
    const solo = new SoloSession(pending, {
      difficulty: 'easy',
      timeBudgetMs: 100,
      ai,
      persist: false,
    });
    try {
      solo.attach(root);
      expect(requests).toHaveLength(0);
      solo.acknowledgeRoundResult(solo.pendingRoundResult!.key);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.decision).toBe('push');
      solo.skipAnimations();
      solo.attach(root);
      expect(requests).toHaveLength(1);
      expect(solo.thinking).toBe(true);
      pendingAnswer.resolve?.({ action: { type: push ? 'push' : 'stop', seat: 1 }, ms: 1 });
      await flush();
      expect(solo.state.phase).toBe('roundOver');
      expect(solo.state.records).toHaveLength(pending.records.length + 1);
      expect(solo.state.records.at(-1)?.settlement.pushed).toBe(push);
      expect(solo.state.ledger.balances).toEqual(
        push ? pending.ledger.balances : acceptRound(pending).ledger.balances,
      );
      expect(requests).toHaveLength(1);
    } finally {
      solo.dispose();
      root.remove();
    }
  },
);

test('CPU의 오래된 밀기 Worker 응답은 세션 종료 후 적용되지 않는다 (AI-02)', async () => {
  const pending = winnerDecisionFor(1);
  const pendingAnswer: { resolve?: (result: AiResult) => void } = {};
  const ai: AiClient = {
    mode: 'worker',
    decide() {
      return new Promise<AiResult>((resolve) => (pendingAnswer.resolve = resolve));
    },
    dispose() {},
  };
  const root = document.createElement('div');
  document.body.append(root);
  const solo = new SoloSession(pending, {
    difficulty: 'easy',
    timeBudgetMs: 100,
    ai,
    persist: false,
  });
  try {
    solo.attach(root);
    expect(solo.thinking).toBe(false);
    solo.acknowledgeRoundResult(solo.pendingRoundResult!.key);
    expect(solo.thinking).toBe(true);
    solo.end();
    const ended = solo.state;
    expect(ended.phase).toBe('ended');
    expect(ended.records.at(-1)?.settlement.pushed).toBe(false);
    pendingAnswer.resolve?.({ action: { type: 'push', seat: 1 }, ms: 1 });
    await flush();
    expect(solo.state).toEqual(ended);
  } finally {
    solo.dispose();
    root.remove();
  }
});

test('두 번 밀면 다음 판 ×4이고 세 번째 밀기는 합법 수가 아니다 (FR-16)', () => {
  let session = fresh();
  let pushed = 0;
  for (let round = 0; round < 30 && pushed < 2; round++) {
    session = untilDecision(session);
    if (session.phase === 'pushDecision') {
      const winner = session.game.result?.winner;
      if (winner === null || winner === undefined) throw new Error('승자 없음');
      const result = sessionAct(session, { type: 'push', seat: winner });
      if (!result.ok) throw new Error(result.message);
      session = result.session;
      pushed++;
    }
    session = startNextRound(session).session;
  }
  expect(pushed).toBe(2);
  expect(session.game.round.pushes).toBe(2);
  expect(session.game.round.carry * 2 ** session.game.round.pushes).toBe(4);
  session = untilDecision(session);
  expect(session.phase).toBe('roundOver');
  const winner = session.game.result?.winner;
  if (winner !== null && winner !== undefined)
    expect(sessionAct(session, { type: 'push', seat: winner }).ok).toBe(false);
});

async function flush(): Promise<void> {
  for (let i = 0; i < 2; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

test('호스트·게스트 승자만 기존 push/ready 경로로 선택하고 최종 정산을 한 번 기록한다', async () => {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostGame({
    config: {
      preset: 'arcade',
      rules: PRESETS.arcade,
      perPoint: 100,
      startBalance: 1_000_000,
      hostName: '호스트',
      timerDecisionMs: null,
    },
    transport: hostWire,
    clock: false,
    persist: false,
  });
  const guest = new GuestGame({
    name: '게스트',
    transport: guestWire,
    clock: false,
    persist: false,
    onTicket: () => {},
  });
  try {
    await flush();
    expect(host.start()).toBe(true);
    let hostPush = false;
    let guestPush = false;
    let hostAccept = false;
    let guestAccept = false;
    for (
      let round = 0;
      round < 30 && (!hostPush || !guestPush || !hostAccept || !guestAccept);
      round++
    ) {
      for (let step = 0; step < 300 && host.stage !== 'settled'; step++) {
        for (const game of [host, guest]) {
          if (!game.canAct) continue;
          const legal = game.playback.board.legal;
          const action = legal.find((a) => a.type === 'stop') ?? legal[0];
          if (action) game.submit(action);
          break;
        }
        await flush();
      }
      if (host.stage !== 'settled')
        throw new Error(
          JSON.stringify({
            stage: host.stage,
            hostAct: host.canAct,
            guestAct: guest.canAct,
            hostLegal: host.playback.board.legal,
            guestLegal: guest.playback.board.legal,
            hostNotice: host.notice,
            guestNotice: guest.notice,
            round,
            hostRound: host.stats.round,
            guestRound: guest.stats.round,
            hostBusy: host.playback.busy,
            guestBusy: guest.playback.busy,
            hostPending: host.playback.pending,
            guestPending: guest.playback.pending,
            guestStage: guest.stage,
            guestReady: guest.ready,
          }),
        );
      const currentRound = host.stats.round;
      if (host.pushDecision !== null) {
        expect(guest.pushDecision?.winner).toBe(!host.pushDecision.winner);
        expect(host.records).toHaveLength(currentRound - 1);
        if (host.pushDecision.winner && !hostPush) {
          host.choosePush(true);
          hostPush = true;
        } else if (guest.pushDecision?.winner && !guestPush) {
          guest.choosePush(true);
          guestPush = true;
        } else if (host.pushDecision.winner) {
          host.choosePush(false);
          hostAccept = true;
        } else {
          guest.choosePush(false);
          guestAccept = true;
        }
        await flush();
      }
      if (host.records.length !== currentRound)
        throw new Error(
          JSON.stringify({
            currentRound,
            after: host.records.length,
            stage: host.stage,
            hostDecision: host.pushDecision,
            guestDecision: guest.pushDecision,
            guestReady: guest.ready,
            round: host.stats.round,
            hostPush,
            guestPush,
            hostAccept,
            guestAccept,
          }),
        );
      expect(host.playback.settlement).not.toBeNull();
      expect(guest.playback.settlement).not.toBeNull();
      if (host.records.at(-1)?.points === 0 && host.records.at(-1)?.winner !== null) {
        expect(host.playback.settlement?.view.pushed).toBe(true);
        expect(guest.playback.settlement?.view.pushed).toBe(true);
      }
      if (!hostPush || !guestPush || !hostAccept || !guestAccept) {
        const expectedPushes = host.playback.settlement?.view.nextPushes;
        guest.nextRound();
        await flush();
        host.nextRound();
        await flush();
        expect(host.playback.board.pushes).toBe(expectedPushes);
      }
    }
    expect(hostPush).toBe(true);
    expect(guestPush).toBe(true);
    expect(hostAccept).toBe(true);
    expect(guestAccept).toBe(true);
  } finally {
    host.dispose();
    guest.dispose();
  }
}, 60_000);

test('호스트가 선택 대기 중 종료하면 받기 정산을 한 번 기록한다', async () => {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostGame({
    config: {
      preset: 'arcade',
      rules: PRESETS.arcade,
      perPoint: 100,
      startBalance: 1_000_000,
      hostName: '호스트',
      timerDecisionMs: null,
    },
    transport: hostWire,
    clock: false,
    persist: false,
  });
  const guest = new GuestGame({
    name: '게스트',
    transport: guestWire,
    clock: false,
    persist: false,
    onTicket: () => {},
  });
  try {
    await flush();
    expect(host.start()).toBe(true);
    for (let round = 0; round < 15; round++) {
      for (let step = 0; step < 300 && host.stage !== 'settled'; step++) {
        for (const game of [host, guest]) {
          if (!game.canAct) continue;
          const legal = game.playback.board.legal;
          const action = legal.find((a) => a.type === 'stop') ?? legal[0];
          if (action) game.submit(action);
          break;
        }
        await flush();
      }
      expect(host.stage).toBe('settled');
      if (host.pushDecision !== null) {
        expect(host.records).toHaveLength(host.stats.round - 1);
        host.end();
        expect(host.records).toHaveLength(host.stats.round);
        expect(host.records.at(-1)?.points).toBeGreaterThan(0);
        expect(host.stats.phase).toBe('ended');
        return;
      }
      guest.nextRound();
      await flush();
      host.nextRound();
      await flush();
    }
    throw new Error('밀기 선택 대기 판이 없음');
  } finally {
    host.dispose();
    guest.dispose();
  }
}, 30_000);

test('게스트 승자 이탈 뒤 3분에도 자동 수락하지 않고 호스트 명시 선택만 확정한다', () => {
  function secrets(start: number): () => Uint8Array {
    let n = start;
    return () => {
      n++;
      return Uint8Array.from({ length: 32 }, (_, i) => (n * 31 + i * 7) & 255);
    };
  }
  for (let seed = 0; seed < 40; seed++) {
    const [hostWire, guestWire] = createMemoryTransportPair();
    const host = new HostSession(hostWire, {
      rules: PRESETS.arcade,
      names: ['호스트', '게스트'],
      random32: secrets(seed),
      startBalance: 1_000_000,
    });
    const guest = new GuestSession(guestWire, {
      name: '게스트',
      random32: secrets(seed + 5000),
    });
    guest.join();
    for (let step = 0; step < 400 && host.stage === 'playing'; step++) {
      const mine = host.hostView()?.legal ?? [];
      const legal = mine.length > 0 ? mine : (guest.view?.legal ?? []);
      const action = legal.find((a) => a.type === 'stop') ?? legal[0];
      if (action === undefined) throw new Error('합법 수 없음');
      if (action.seat === 0) expect(host.apply(action)).toBe(true);
      else guest.sendAction(action);
    }
    if (host.stage !== 'settled' || host.state?.result?.winner !== 1) continue;
    expect(host.settlement).toBeNull();
    const before = host.ledger.balances;
    guestWire.disconnect();
    host.advanceTime(179_999);
    expect(host.acceptRound({ forSeat: 1, reason: 'absent' })).toBe(false);
    expect(host.settlement).toBeNull();
    host.advanceTime(180_001);
    expect(host.settlement).toBeNull();
    expect(host.acceptRound({ forSeat: 1, reason: 'absent' })).toBe(true);
    expect(host.settlement?.winner).toBe(1);
    expect(host.ledger.balances).not.toEqual(before);
    expect(host.acceptRound({ forSeat: 1, reason: 'absent' })).toBe(false);
    return;
  }
  throw new Error('게스트 승자 밀기 선택 대기 판이 없음');
});
