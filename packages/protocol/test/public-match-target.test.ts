// Refs #200 #202: FR-14~17·NF-03/08/09·AC-06/07·NP-02/03/04.
// 현재 공백의 재현/경계 근거다. 제품 착지 성공이나 새 wire 계약 수용 검사가 아니다.
import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  newRound,
  playerView,
  reduce,
  type Action,
  type GameState,
  type Seat,
} from '@p2p-gostop/engine';
import {
  HostSession,
  GuestSession,
  createMemoryTransportPair,
  decode,
  toBoardView,
  type Message,
} from '../src/index.ts';
import { secrets, viaJson } from './helpers.ts';

// 합성 난수 공급기 secrets(36)/secrets(456)의 commit-reveal로 얻은 합법 분배.
// 덱 고정·상태 직접 대입 없이 두 dealer에서 같은 카드 관계를 재현한다.
const seed = [3839809690, 1129524092, 3832060461, 2933933213] as const;
const meta = { names: ['좌석0', '좌석1'] as const, balances: [50_000, 50_000] as const };
function step(state: GameState, action: Action) {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(result.message);
  return result;
}
function board(state: GameState, viewer: Seat) {
  return toBoardView(playerView(state, viewer), meta);
}
function game(actor: Seat, timed = false) {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostSession(hostWire, {
    rules: PRESETS.standard,
    names: meta.names,
    random32: secrets(36),
    dealer: actor,
    timerSettings: { decisionMs: timed ? 5_000 : null, policy: 'fixed-v1' },
  });
  const guest = new GuestSession(guestWire, { name: '좌석1', random32: secrets(456) });
  guest.join();
  expect(host.state).toEqual(
    newRound(PRESETS.standard, seed, { dealer: actor, roundNumber: 1 }).state,
  );
  return { host, guest, hostWire, guestWire };
}
function manual(g: ReturnType<typeof game>, action: Action) {
  const before = g.host.seq;
  if (action.seat === 0) {
    if (!g.host.apply(action)) throw new Error('호스트 입력 거절');
  } else g.guest.sendAction(action);
  expect(g.host.seq).toBeGreaterThan(before);
}
function latestBoardMessage(messages: readonly Message[]) {
  const message = messages.findLast((m) => m.t === 'events' || m.t === 'snapshot');
  if (!message || (message.t !== 'events' && message.t !== 'snapshot'))
    throw new Error('뷰 응답 없음');
  return message;
}
function ready(g: ReturnType<typeof game>) {
  const clock = g.host.decisionClock;
  if (!clock) throw new Error('시계 없음');
  expect(g.host.decisionReady(0, clock.key, clock.attempt, g.host.seq)).toBe(true);
  expect(g.guest.decisionReady(g.guest.seq)).toBe(true);
  expect(g.host.decisionClock?.state).toBe('running');
  return clock;
}

describe.each([0, 1] as const)('공개 대상 계약 공백: 행동 좌석 %i', (actor) => {
  it('서로 다른 수락 대상 6/4가 양 관찰자의 전체 BoardView와 이벤트에서 구별되지 않는다', () => {
    const initial = newRound(PRESETS.standard, seed, { dealer: actor }).state;
    const played = step(initial, { type: 'play', seat: actor, card: 7 });
    expect(played.events.map((e) => e.type)).toEqual(['CardPlayed']);
    expect(played.state.pending).toEqual({
      kind: 'target',
      seat: actor,
      source: 'play',
      card: 7,
      options: [6, 4],
    });
    const left = step(played.state, { type: 'chooseTarget', seat: actor, card: 6 });
    const right = step(played.state, { type: 'chooseTarget', seat: actor, card: 4 });
    expect(left.state.ctx?.playTarget).toBe(6);
    expect(right.state.ctx?.playTarget).toBe(4);
    expect(left.events.map((e) => e.type)).toEqual(['CardFlipped']);
    expect(left.events).toEqual(right.events);
    for (const viewer of [0, 1] as const) {
      expect(playerView(left.state, viewer).ctx?.playTarget).toBe(6);
      expect(board(left.state, viewer)).toEqual(board(right.state, viewer));
      expect(board(left.state, viewer).inFlight).toEqual({ played: 7, staged: [29] });
      expect(board(left.state, viewer).seats[viewer === 0 ? 1 : 0].hand).toBeNull();
    }
    const resolved = step(left.state, { type: 'chooseTarget', seat: actor, card: 28 });
    expect(resolved.events.filter((e) => e.type === 'Matched')).toEqual([
      expect.objectContaining({ source: 'play', target: 6, cards: [7, 6] }),
      expect.objectContaining({ source: 'flip', target: 28, cards: [29, 28] }),
    ]);
    expect(resolved.events.some((e) => e.type === 'Ttadak')).toBe(false);
    expect(resolved.events.find((e) => e.type === 'Captured')?.cards).toEqual([6, 7, 28, 29]);
  });

  it('실제 host/guest codec 왕복도 target을 잃고 v3 파서는 임의 추가 필드를 제거한다', () => {
    const g = game(actor);
    manual(g, { type: 'play', seat: actor, card: 7 });
    const seq = g.host.seq;
    // 후보 28은 다음 덱 선택 후보일 뿐 현재 손패 선택에서는 불법이다.
    g.guestWire.send({
      t: 'action',
      seq,
      requestId: 900,
      payload: { type: 'chooseTarget', seat: 1, card: 28 },
    });
    expect(g.host.seq).toBe(seq);
    expect(g.host.state?.ctx?.playTarget).toBeNull();
    expect(g.hostWire.sent.at(-1)).toMatchObject({ t: 'reject', reason: 'ILLEGAL_ACTION' });
    manual(g, { type: 'chooseTarget', seat: actor, card: 6 });
    expect(g.host.state?.ctx?.playTarget).toBe(6);
    expect(g.guest.view).toEqual(g.host.guestView());
    expect(g.host.hostView()?.inFlight).toEqual({ played: 7, staged: [29] });
    const response = latestBoardMessage(g.hostWire.sent);
    expect(response.t).toBe('events');
    if (response.t !== 'events') throw new Error('events 응답 없음');
    expect(response.list.map((e) => e.type)).toEqual(['CardFlipped']);
    const parsed = decode(
      JSON.stringify({
        ...response,
        view: { ...response.view, inFlight: { ...response.view.inFlight, playTarget: 6 } },
      }),
      'host',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || (parsed.message.t !== 'events' && parsed.message.t !== 'snapshot'))
      throw new Error('decode 실패');
    expect(parsed.message.view.inFlight).toEqual({ played: 7, staged: [29] });
  });

  it('저장 replay로 엔진 target은 회복되지만 새 epoch의 차분 및 빈 snapshot에는 없다', () => {
    const g = game(actor);
    manual(g, { type: 'play', seat: actor, card: 7 });
    const beforeSelection = viaJson(g.guest.toJSON());
    const beforeHost = viaJson(g.host.toJSON());
    manual(g, { type: 'chooseTarget', seat: actor, card: 6 });
    const saved = viaJson(g.host.toJSON());
    const [hostWire, guestWire] = createMemoryTransportPair();
    const restored = HostSession.fromJSON(hostWire, saved, { random32: secrets(999) });
    const observer = new GuestSession(guestWire, {
      name: '좌석1',
      random32: secrets(456),
      restore: beforeSelection,
    });
    observer.join();
    expect(restored.epoch).not.toBe(g.host.epoch);
    expect(restored.state?.ctx?.playTarget).toBe(6);
    expect(observer.epoch).toBe(restored.epoch);
    expect(observer.view?.pending).toMatchObject({ source: 'flip', card: 29, options: [28, 30] });
    expect(observer.view).toEqual(restored.guestView());
    const delta = latestBoardMessage(hostWire.sent);
    expect(delta.t).toBe('events');
    if (delta.t !== 'events') throw new Error('차분 events 없음');
    expect(delta.list.map((e) => e.type)).toEqual(['CardFlipped']);
    observer.join();
    const snap = latestBoardMessage(hostWire.sent);
    expect(snap.t).toBe('snapshot');
    expect(snap.view.inFlight).toEqual({ played: 7, staged: [29] });

    const [olderHostWire, olderGuestWire] = createMemoryTransportPair();
    const olderHost = HostSession.fromJSON(olderHostWire, beforeHost, { random32: secrets(1000) });
    const rewound = new GuestSession(olderGuestWire, {
      name: '좌석1',
      random32: secrets(456),
      restore: viaJson(g.guest.toJSON()),
    });
    rewound.join();
    expect(rewound.seq).toBe(beforeHost.seq);
    expect(rewound.epoch).toBe(olderHost.epoch);
    expect(olderHost.state?.ctx?.playTarget).toBeNull();
    expect(rewound.view?.pending).toMatchObject({ source: 'play', options: [6, 4] });
    expect(rewound.view?.inFlight).toEqual({ played: 7, staged: [] });
  });

  it('권위 timeout은 최소 ID 4를 한 번 수락하고 늦은 옛 결정 입력은 대상/seq를 바꾸지 않는다', () => {
    const g = game(actor, true);
    ready(g);
    manual(g, { type: 'play', seat: actor, card: 7 });
    const clock = ready(g);
    for (let now = 500; now <= 5_000; now += 500) g.host.advanceTime(now);
    expect(g.host.decisionClock?.state).toBe('checking');
    expect(g.guest.ackExpiry(g.guest.seq, true)).toBe(true);
    expect(g.host.timeoutHistory).toHaveLength(1);
    expect(g.host.timeoutHistory[0]?.action).toEqual({
      type: 'chooseTarget',
      seat: actor,
      card: 4,
    });
    expect(g.host.state?.ctx?.playTarget).toBe(4);
    expect(g.guest.view?.inFlight).toEqual({ played: 7, staged: [29] });
    const seq = g.host.seq;
    g.guestWire.send({
      t: 'action',
      seq: clock.key.baseSeq,
      requestId: 901,
      decisionKey: clock.key,
      decisionAttempt: clock.attempt,
      payload: { type: 'chooseTarget', seat: 1, card: 6 },
    });
    expect(g.host.seq).toBe(seq);
    expect(g.host.state?.ctx?.playTarget).toBe(4);
    expect(g.host.timeoutHistory).toHaveLength(1);
    expect(g.hostWire.sent.some((m) => m.t === 'reject' && m.reason === 'STALE_DECISION')).toBe(
      true,
    );
  });
});

it('선택 직후 resolve가 끝나는 합법 seed8에서는 ctx 필드만 추가해도 덱 전 접촉 근거가 남지 않는다', () => {
  const played = step(newRound(PRESETS.standard, 8, { dealer: 0 }).state, {
    type: 'play',
    seat: 0,
    card: 35,
  });
  expect(played.state.pending).toMatchObject({ source: 'play', options: [34, 33] });
  const accepted = step(played.state, { type: 'chooseTarget', seat: 0, card: 34 });
  expect(accepted.events.map((e) => e.type)).toEqual([
    'CardFlipped',
    'Matched',
    'Matched',
    'Captured',
    'ScoreChanged',
  ]);
  expect(accepted.state.ctx).toBeNull();
  expect(board(accepted.state, 0).inFlight).toEqual({ played: null, staged: [] });
  expect(accepted.events.find((e) => e.type === 'Matched')).toMatchObject({
    source: 'play',
    target: 34,
  });
});

it('합법 seed117의 따닥은 선택 7/5 모두 같은 최종 상태/이벤트이며 Matched가 없다', () => {
  const played = step(newRound(PRESETS.standard, 117, { dealer: 0 }).state, {
    type: 'play',
    seat: 0,
    card: 4,
  });
  expect(played.state.pending).toMatchObject({ source: 'play', options: [7, 5] });
  const left = step(played.state, { type: 'chooseTarget', seat: 0, card: 7 });
  const right = step(played.state, { type: 'chooseTarget', seat: 0, card: 5 });
  expect(left.events.map((e) => e.type)).toEqual([
    'CardFlipped',
    'Ttadak',
    'Captured',
    'InstantPayout',
    'ScoreChanged',
  ]);
  expect(left.state.ctx).toBeNull();
  expect(left.state).toEqual(right.state);
  expect(left.events).toEqual(right.events);
});
