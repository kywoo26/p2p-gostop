// Refs #200 #202: FR-14~17·NF-03/08/09·AC-06/07·NP-02/03/04.
// #234의 합법 공백 재현을 보존하고 wire4 전달/복원으로 구별됨을 검사한다. 시각 착지 성공 검사는 아니다.
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
  createQueuedTransportPair,
  decode,
  toBoardView,
  byteLength,
  checkRound,
  readGuestSessionState,
  PROTOCOL_VERSION,
  type GuestSessionState,
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
function game(actor: Seat, timed = false, hostRandomStart = 36) {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostSession(hostWire, {
    rules: PRESETS.standard,
    names: meta.names,
    random32: secrets(hostRandomStart),
    dealer: actor,
    timerSettings: { decisionMs: timed ? 5_000 : null, policy: 'fixed-v1' },
  });
  const guest = new GuestSession(guestWire, { name: '좌석1', random32: secrets(456) });
  guest.join();
  if (
    hostRandomStart === 36 &&
    JSON.stringify(host.state) !==
      JSON.stringify(newRound(PRESETS.standard, seed, { dealer: actor, roundNumber: 1 }).state)
  )
    throw new Error('합성 분배 불일치');
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
  it('기존 projection은 수락 6/4를 구별하지 못하지만 새 현재 관계는 양 관찰자에서 구별한다', () => {
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
      const leftView = board(left.state, viewer);
      const rightView = board(right.state, viewer);
      // 기존 공개 계약으로 projection하면 여전히 구별 불가: #234 필요성 근거 보존.
      expect({ ...leftView, inFlight: { ...leftView.inFlight, playTarget: null } }).toEqual({
        ...rightView,
        inFlight: { ...rightView.inFlight, playTarget: null },
      });
      expect(leftView.inFlight.playTarget).toBe(6);
      expect(rightView.inFlight.playTarget).toBe(4);
      expect(board(left.state, viewer).inFlight).toEqual({
        played: 7,
        staged: [29],
        playTarget: 6,
      });
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

  it('실제 host/guest wire4 왕복은 수락 tuple과 현재 관계를 보존하고 여분 필드를 제거한다', () => {
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
    expect(g.host.hostView()?.inFlight).toEqual({ played: 7, staged: [29], playTarget: 6 });
    const response = latestBoardMessage(g.hostWire.sent);
    expect(response.t).toBe('events');
    if (response.t !== 'events') throw new Error('events 응답 없음');
    expect(response.list.map((e) => e.type)).toEqual(['CardFlipped']);
    expect(response.acceptedPlayTarget).toEqual({ seat: actor, card: 7, target: 6, baseSeq: seq });
    const parsed = decode(
      JSON.stringify({
        ...response,
        view: {
          ...response.view,
          inFlight: { ...response.view.inFlight, playTarget: 6, extra: 'strip' },
        },
      }),
      'host',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || (parsed.message.t !== 'events' && parsed.message.t !== 'snapshot'))
      throw new Error('decode 실패');
    expect(parsed.message.view.inFlight).toEqual({ played: 7, staged: [29], playTarget: 6 });
  });

  it('저장 replay와 새 epoch의 차분/빈 snapshot은 현재 관계만 복원하고 rollback은 제거한다', () => {
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
    expect(delta.acceptedPlayTarget).toBeUndefined();
    observer.join();
    const snap = latestBoardMessage(hostWire.sent);
    expect(snap.t).toBe('snapshot');
    expect(snap.view.inFlight).toEqual({ played: 7, staged: [29], playTarget: 6 });

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
    expect(rewound.view?.inFlight).toEqual({ played: 7, staged: [], playTarget: null });
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
    expect(g.guest.view?.inFlight).toEqual({ played: 7, staged: [29], playTarget: 4 });
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
  expect(board(accepted.state, 0).inFlight).toEqual({ played: null, staged: [], playTarget: null });
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

function complete(g: ReturnType<typeof game>) {
  for (let count = 0; count < 400 && g.host.stage === 'playing'; count++) {
    const actions = [...(g.host.hostView()?.legal ?? []), ...(g.guest.view?.legal ?? [])];
    const action = actions.find((a) => a.type === 'stop') ?? actions[0];
    if (!action) throw new Error('합법 수 없음');
    if (action.seat === 0) {
      if (!g.host.apply(action)) throw new Error('호스트 합법 액션 거절');
    } else g.guest.sendAction(action);
  }
  if (!g.host.settlementView) g.host.acceptRound();
  const reveal = g.hostWire.sent.findLast((m) => m.t === 'revealHost');
  if (reveal?.t !== 'revealHost') throw new Error('공개 없음');
  const observed = g.guest.toJSON().observations.find((o) => o.round === reveal.round)!;
  return {
    commitments: { host: reveal.hostHash, guest: reveal.guestHash },
    reveals: { host: reveal.secret, guest: reveal.guestSecret },
    seed: reveal.seed,
    actions: reveal.actions,
    options: reveal.options,
    round: reveal.round,
    firstSeq: reveal.firstSeq,
    rules: PRESETS.standard,
    observed,
  };
}

it('wire5/v3 handshake는 필드 검사보다 먼저 명시 VERSION_MISMATCH다', () => {
  expect(PROTOCOL_VERSION).toBe(5);
  expect(decode(JSON.stringify({ t: 'welcome', v: 3 }), 'host')).toEqual({
    ok: false,
    reason: 'VERSION_MISMATCH',
  });
  const g = game(0);
  g.guestWire.send({ t: 'hello', v: 3, name: '좌석1' });
  expect(g.hostWire.sent.at(-1)).toMatchObject({ t: 'reject', reason: 'VERSION_MISMATCH' });
  const welcome = g.hostWire.sent.find((m) => m.t === 'welcome');
  if (welcome?.t !== 'welcome') throw new Error('welcome 없음');
  g.hostWire.send({ ...welcome, v: 3 });
  expect(g.guest.connection).toBe('versionMismatch');
});

it('live tuple의 seat/card/target/baseSeq와 현재 관계를 각각 대조하고 거절한다', () => {
  for (const patch of [
    { seat: 1 },
    { card: 4 },
    { target: 28 },
    { baseSeq: 0 },
    { target: 4 },
  ] as const) {
    const g = game(0);
    manual(g, { type: 'play', seat: 0, card: 7 });
    const saved = viaJson(g.guest.toJSON());
    manual(g, { type: 'chooseTarget', seat: 0, card: 6 });
    const response = latestBoardMessage(g.hostWire.sent);
    if (response.t !== 'events' || !response.acceptedPlayTarget) throw new Error('live 증거 없음');
    const [out, input] = createMemoryTransportPair();
    const observer = new GuestSession(input, {
      name: '좌석1',
      random32: secrets(456),
      restore: saved,
    });
    // 실제 직전 뷰를 snapshot으로 전달한 뒤 live forge를 주입한다.
    const previous = newRound(PRESETS.standard, seed, { dealer: 0 }).state;
    const played = step(previous, { type: 'play', seat: 0, card: 7 }).state;
    out.send({
      t: 'snapshot',
      seq: saved.seq,
      view: { ...board(played, 1), eventSeq: saved.seq },
      ledger: response.ledger,
      status: response.status,
      decision: null,
    });
    out.send({ ...response, acceptedPlayTarget: { ...response.acceptedPlayTarget, ...patch } });
    expect(observer.seq).toBe(saved.seq);
    expect(observer.errors.at(-1)).toBe('MALFORMED');
    expect(observer.acceptedPlayTarget).toBeNull();
  }
});

it.each(['drop', 'reorder'] as const)(
  '이전 play frame %s 뒤 선택 수락은 live 재연 없이 snapshot 현재 관계로 수렴한다',
  (mode) => {
    const [hostWire, guestWire, link] = createQueuedTransportPair();
    const host = new HostSession(hostWire, {
      rules: PRESETS.standard,
      names: meta.names,
      random32: secrets(36),
      dealer: 0,
    });
    const guest = new GuestSession(guestWire, { name: '좌석1', random32: secrets(456) });
    const live: unknown[] = [];
    guest.onChange((session) => {
      if (session.acceptedPlayTarget !== null) live.push(session.acceptedPlayTarget);
    });
    guest.join();
    link.flush();
    expect(guest.seq).toBe(1);
    expect(host.apply({ type: 'play', seat: 0, card: 7 })).toBe(true);
    const played = link.queue.find((frame) => JSON.parse(frame.raw).t === 'events');
    if (!played) throw new Error('play frame 없음');
    if (mode === 'drop') link.drop(link.queue.indexOf(played));
    expect(host.apply({ type: 'chooseTarget', seat: 0, card: 6 })).toBe(true);
    const selected = link.queue.find(
      (frame) => JSON.parse(frame.raw).t === 'events' && JSON.parse(frame.raw).to === 3,
    );
    if (!selected) throw new Error('선택 frame 없음');
    link.deliver(link.queue.indexOf(selected));
    expect(guest.seq).toBe(1);
    expect(guest.errors).toEqual(['STALE_SEQ']);
    expect(link.queue.some((frame) => JSON.parse(frame.raw).t === 'hello')).toBe(true);
    // 순서 역전의 이전 frame은 snapshot 뒤에 배달해 현재 관계를 되돌리지 않는지도 확인한다.
    if (mode === 'reorder') link.drop(link.queue.indexOf(played));
    link.flush();
    expect(host.seq).toBe(3);
    expect(guest.seq).toBe(3);
    expect(guest.view).toEqual(host.guestView());
    expect(guest.view?.pending).toEqual({
      kind: 'target',
      seat: 0,
      source: 'flip',
      card: 29,
      options: [28, 30],
    });
    expect(guest.view?.inFlight).toEqual({ played: 7, staged: [29], playTarget: 6 });
    expect(guest.acceptedPlayTarget).toBeNull();
    expect(live).toEqual([]);
    const observation = guest.toJSON().observations.at(-1)?.publicTargets;
    expect(observation?.gap).toBe(true);
    expect(observation?.accepted['2']).toEqual([{ seat: 0, card: 7, target: 6, baseSeq: 2 }]);
    const saved = JSON.stringify(guest.toJSON().observations);
    link.inject(1, selected.raw);
    if (mode === 'reorder') link.inject(1, played.raw);
    link.flush();
    expect(guest.seq).toBe(3);
    expect(guest.view).toEqual(host.guestView());
    expect(JSON.stringify(guest.toJSON().observations)).toBe(saved);
    expect(live).toEqual([]);
    expect(guest.errors).toEqual(['STALE_SEQ']);
    guest.advanceTime(60_000);
    link.flush();
    expect(guest.seq).toBe(host.seq);
    expect(guest.view?.inFlight.playTarget).toBe(6);
    expect(live).toEqual([]);
  },
);

it.each(['events', 'snapshot'] as const)(
  '같은 seq %s의 상이 관계는 exact duplicate와 달리 보존되어 판 완료 뒤 conflict다',
  (kind) => {
    const g = game(0);
    manual(g, { type: 'play', seat: 0, card: 7 });
    manual(g, { type: 'chooseTarget', seat: 0, card: 6 });
    const response = latestBoardMessage(g.hostWire.sent);
    if (response.t !== 'events') throw new Error('events 없음');
    const previousView = g.guest.view;
    const saved = JSON.stringify(g.guest.toJSON().observations);
    g.hostWire.send(response);
    expect(JSON.stringify(g.guest.toJSON().observations)).toBe(saved);
    const view = { ...response.view, inFlight: { ...response.view.inFlight, playTarget: 4 } };
    if (kind === 'events') g.hostWire.send({ ...response, view });
    else g.hostWire.send({ ...response, t: 'snapshot', seq: response.to, view });
    expect(g.guest.seq).toBe(response.to);
    expect(g.guest.view).toEqual(kind === 'events' ? previousView : view);
    expect(g.guest.view === previousView).toBe(kind === 'events');
    expect(
      g.guest.toJSON().observations.at(-1)?.publicTargets?.relations[String(response.to)],
    ).toEqual([
      { played: 7, playTarget: 6 },
      { played: 7, playTarget: 4 },
    ]);
    const observed = JSON.stringify(g.guest.toJSON().observations);
    if (kind === 'events') g.hostWire.send({ ...response, view });
    else g.hostWire.send({ ...response, t: 'snapshot', seq: response.to, view });
    expect(JSON.stringify(g.guest.toJSON().observations)).toBe(observed);
    const input = complete(g);
    expect(g.guest.checks.at(-1)).toMatchObject({
      result: 'verified',
      publicTargets: { result: 'conflict', reason: 'relations' },
    });
    for (const gap of [false, true])
      expect(
        checkRound({
          ...input,
          observed: { ...input.observed, publicTargets: { ...input.observed.publicTargets!, gap } },
        }),
      ).toMatchObject({ ok: true, publicTargets: { result: 'conflict', reason: 'relations' } });
  },
);

it('동일 live 재수신은 멱등, 상이 tuple은 보존되어 gap에서도 별도 conflict다', () => {
  const g = game(0);
  manual(g, { type: 'play', seat: 0, card: 7 });
  manual(g, { type: 'chooseTarget', seat: 0, card: 6 });
  const response = latestBoardMessage(g.hostWire.sent);
  if (response.t !== 'events' || !response.acceptedPlayTarget) throw new Error('증거 없음');
  const before = JSON.stringify(g.guest.toJSON().observations);
  g.hostWire.send(response);
  expect(JSON.stringify(g.guest.toJSON().observations)).toBe(before);
  g.hostWire.send({
    ...response,
    acceptedPlayTarget: { ...response.acceptedPlayTarget, target: 4 },
  });
  const input = complete(g);
  const result = checkRound(input);
  expect(result).toMatchObject({
    ok: true,
    publicTargets: { result: 'conflict', reason: 'accepted' },
  });
  expect(g.guest.checks.at(-1)?.result).toBe('verified'); // 기존 검증과 별도 결과
  expect(
    checkRound({
      ...input,
      observed: {
        ...input.observed,
        publicTargets: { ...input.observed.publicTargets!, gap: true },
      },
    }),
  ).toMatchObject({ ok: true, publicTargets: { result: 'conflict' } });
});

it('snapshot의 같은 월 다른 원본도 기존 digest 통과와 새 관계 conflict를 분리한다', () => {
  const g = game(0);
  manual(g, { type: 'play', seat: 0, card: 7 });
  manual(g, { type: 'chooseTarget', seat: 0, card: 6 });
  g.guest.join();
  const snapshot = latestBoardMessage(g.hostWire.sent);
  if (snapshot.t !== 'snapshot') throw new Error('snapshot 없음');
  g.hostWire.send({
    ...snapshot,
    view: { ...snapshot.view, inFlight: { ...snapshot.view.inFlight, playTarget: 4 } },
  });
  const input = complete(g);
  expect(checkRound(input)).toMatchObject({
    ok: true,
    publicTargets: { result: 'conflict', reason: 'relations' },
  });
});

it.each([1, 2] as const)(
  'guest v%i는 기존 관찰을 유지하되 새 target은 미관찰, v3 왕복/잘린 필드는 검증한다',
  (version) => {
    const g = game(0);
    manual(g, { type: 'play', seat: 0, card: 7 });
    const current = viaJson(g.guest.toJSON());
    expect(current.v).toBe(3);
    expect(readGuestSessionState(current)).toEqual(current);
    const legacy = {
      ...current,
      v: version,
      observations: current.observations.map(({ publicTargets: _targets, ...o }) => o),
    } as GuestSessionState;
    const [out, wire] = createMemoryTransportPair();
    const restored = new GuestSession(wire, {
      name: '좌석1',
      random32: secrets(456),
      restore: legacy,
    });
    expect(restored.toJSON().observations[0]?.events).toEqual(current.observations[0]?.events);
    expect(restored.toJSON().observations[0]?.publicTargets).toEqual({
      gap: true,
      accepted: {},
      relations: {},
    });
    const host = HostSession.fromJSON(out, viaJson(g.host.toJSON()), { random32: secrets(999) });
    restored.join();
    manual(
      { host, guest: restored, hostWire: out, guestWire: wire },
      { type: 'chooseTarget', seat: 0, card: 6 },
    );
    const oldInput = complete({ host, guest: restored, hostWire: out, guestWire: wire });
    expect(checkRound(oldInput)).toMatchObject({
      ok: true,
      publicTargets: { result: 'unverifiable', reason: 'gap' },
    });
    expect(restored.checks.at(-1)?.result).toBe('verified');

    expect(readGuestSessionState({ ...current, observations: legacy.observations })).toBeNull();
    const invalid = viaJson(current);
    const relations = invalid.observations[0]!.publicTargets!.relations;
    Object.assign(relations, { '0': [{ played: 7, playTarget: 51 }] });
    expect(readGuestSessionState(invalid)).toBeNull();
    expect(
      () => new GuestSession(wire, { name: '좌석1', random32: secrets(456), restore: invalid }),
    ).toThrow('저장 형식');
    const finished = complete(g);
    const { publicTargets: _newTargets, ...legacyObservation } = finished.observed;
    expect(checkRound({ ...finished, observed: legacyObservation })).toMatchObject({ ok: true });
    expect(
      checkRound({
        ...finished,
        observed: {
          ...finished.observed,
          publicTargets: { gap: true, accepted: {}, relations: {} },
        },
      }),
    ).toMatchObject({ ok: true, publicTargets: { result: 'unverifiable' } });
  },
);

it('빈 map은 verified가 아니고 완전 관측·손패 선택 없는 판과 구별한다', () => {
  const g = game(0, false, 1);
  const input = complete(g);
  expect(input.observed.publicTargets?.accepted).toEqual({});
  expect(checkRound(input)).toMatchObject({
    ok: true,
    publicTargets: { result: 'verified', scope: 'complete' },
  });
  expect(
    checkRound({
      ...input,
      observed: { ...input.observed, publicTargets: { gap: false, accepted: {}, relations: {} } },
    }),
  ).toMatchObject({ ok: true, publicTargets: { result: 'unverifiable', reason: 'noObservation' } });
});

it('wire16KiB와 최근 두 판 관찰 바이트를 합성 실측하며 판 전환은 전이 이력을 재연하지 않는다', () => {
  const g = game(0);
  manual(g, { type: 'play', seat: 0, card: 7 });
  const base = g.host.seq;
  manual(g, { type: 'chooseTarget', seat: 0, card: 6 });
  const response = latestBoardMessage(g.hostWire.sent);
  expect(byteLength(JSON.stringify(response))).toBeLessThanOrEqual(16 * 1024);
  complete(g);
  expect(g.host.nextRound()).toBe(true);
  complete(g);
  expect(g.guest.toJSON().observations).toHaveLength(2);
  expect(g.host.nextRound()).toBe(true);
  expect(g.guest.toJSON().observations.map((o) => o.round)).toEqual([2, 3]);
  expect(g.guest.toJSON().observations[1]?.publicTargets?.accepted[String(base)]).toBeUndefined();
  expect(g.guest.acceptedPlayTarget).toBeNull();
  expect(readGuestSessionState(viaJson(g.guest.toJSON()))).not.toBeNull();
});

it.each(['accepted', 'relations'] as const)(
  'runtime %s 총량 제한은 exact dedup을 소비하지 않고 overflow를 조용히 지우지 않는다',
  (kind) => {
    const g = game(0);
    manual(g, { type: 'play', seat: 0, card: 7 });
    const saved = viaJson(g.guest.toJSON());
    const observation = saved.observations[0]!;
    const targets = observation.publicTargets!;
    const full =
      kind === 'accepted'
        ? {
            gap: true,
            accepted: Object.fromEntries(
              Array.from({ length: 400 }, (_, i) => [
                String(i),
                [{ seat: 0 as const, card: 7, target: 6, baseSeq: i }],
              ]),
            ),
            relations: targets.relations,
          }
        : {
            gap: true,
            accepted: targets.accepted,
            relations: Object.fromEntries(
              Array.from({ length: 401 }, (_, i) => [String(i), [{ played: 7, playTarget: null }]]),
            ),
          };
    const stress = { ...saved, observations: [{ ...observation, publicTargets: full }] };
    expect(readGuestSessionState(stress)).not.toBeNull();
    const [out, wire] = createMemoryTransportPair();
    const host = HostSession.fromJSON(out, viaJson(g.host.toJSON()), { random32: secrets(999) });
    const observer = new GuestSession(wire, {
      name: '좌석1',
      random32: secrets(456),
      restore: stress,
    });
    observer.join(); // same seq relation duplicate consumes 0
    const before = observer.toJSON().observations[0]!.publicTargets!;
    expect(before.overflowSeq).toBeUndefined();
    manual(
      { host, guest: observer, hostWire: out, guestWire: wire },
      { type: 'chooseTarget', seat: 0, card: 4 },
    );
    const overflow = observer.toJSON().observations[0]!.publicTargets!;
    expect(overflow.overflowSeq).toBeDefined();
    expect(Object.values(overflow.accepted).flat().length).toBeLessThanOrEqual(400);
    expect(Object.values(overflow.relations).flat().length).toBeLessThanOrEqual(401);
    observer.join();
    expect(observer.toJSON().observations[0]!.publicTargets!.overflowSeq).toBe(
      overflow.overflowSeq,
    );
    const input = complete({ host, guest: observer, hostWire: out, guestWire: wire });
    expect(checkRound(input)).toMatchObject({
      ok: true,
      publicTargets: { result: 'conflict', reason: 'observationLimit' },
    });
    expect(readGuestSessionState(viaJson(observer.toJSON()))).not.toBeNull();
  },
);
