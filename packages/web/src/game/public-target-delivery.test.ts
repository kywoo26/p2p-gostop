// FR-14·NP-03/04, Refs #200 #202 #234: 실제 성공 생산→공통 enqueue 전달만 검사한다.
// DOM 카드 존재/좌표/시각 착지 결과는 전제하지 않는다.
import { cardId, newRound, playerView, PRESETS, type Seat } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import {
  createMemoryTransportPair,
  GuestSession,
  HostSession,
  type RoundCheck,
} from '@p2p-gostop/protocol';
import { expect, onTestFinished, test, vi } from 'vitest';
import { GuestGame } from '../p2p/guest.svelte.ts';
import { HostGame } from '../p2p/host.svelte.ts';
import type { AiClient } from './ai-client.ts';
import { toBoardView } from './adapter.ts';
import { automaticAction } from './controller.ts';
import { createSession, sessionAct, type SessionState } from './session.ts';
import { SoloSession } from './solo.svelte.ts';

const config = {
  preset: 'standard' as const,
  rules: PRESETS.standard,
  names: ['좌석0', '좌석1'] as const,
  seed: 3588976197,
  perPoint: 100,
  startBalance: 1_000_000,
};
const ai: AiClient = {
  mode: 'inline',
  async decide(req) {
    return { action: req.view.legal[0]!, ms: 1 };
  },
  dispose() {},
};

function pendingSession(seat: Seat) {
  // 합법 newRound/reduce를 세션 테스트 fixture로 사용. 저장/분배 정책을 바꾸지 않는다.
  const initial = {
    ...createSession(config).session,
    game: newRound(PRESETS.standard, 8, { dealer: seat }).state,
  };
  const played = sessionAct(initial, { type: 'play', seat, card: 35 });
  if (!played.ok) throw new Error(played.message);
  expect(played.session.game.pending).toMatchObject({ kind: 'target', source: 'play', card: 35 });
  return played.session;
}
function solo(session: SessionState, client: AiClient = ai) {
  const previous = document.documentElement.dataset['speed'];
  document.documentElement.dataset['speed'] = 'instant';
  const game = new SoloSession(session, {
    difficulty: 'easy',
    timeBudgetMs: 100,
    ai: client,
    persist: false,
  });
  onTestFinished(() => {
    game.dispose();
    if (previous === undefined) delete document.documentElement.dataset['speed'];
    else document.documentElement.dataset['speed'] = previous;
  });
  return game;
}

test('솔로 수동 즉시 resolve의 정확 원본이 ctx 소실 뒤에도 enqueue metadata로 도달한다', () => {
  const session = pendingSession(0);
  const game = solo(session);
  const enqueue = vi.spyOn(game.playback, 'enqueue');
  expect(game.submit({ type: 'chooseTarget', seat: 0, card: 34 })).toBe(true);
  expect(enqueue).toHaveBeenCalledOnce();
  const [events, view, options] = enqueue.mock.calls[0]!;
  expect(events.map((e) => e.type)).toEqual([
    'CardFlipped',
    'Matched',
    'Matched',
    'Captured',
    'ScoreChanged',
  ]);
  expect(view.inFlight.playTarget).toBeNull();
  expect(options?.publicTarget).toEqual({
    namespace: { mode: 'solo', round: 1 },
    evidence: { seat: 0, card: 35, target: 34, baseSeq: session.game.eventSeq },
  });
  enqueue.mockClear();
  expect(game.submit({ type: 'chooseTarget', seat: 0, card: 34 })).toBe(false);
  expect(enqueue).not.toHaveBeenCalled();
});

test.each(['decision', 'fallback'] as const)(
  '솔로 CPU %s도 수동과 같은 권위 증거를 전달한다',
  async (mode) => {
    const session = pendingSession(1);
    const client: AiClient = {
      ...ai,
      async decide(req) {
        if (mode === 'fallback') throw new Error('합성 오류');
        return { action: req.view.legal.find((a) => a.type === 'chooseTarget')!, ms: 1 };
      },
    };
    const game = solo(session, client);
    const enqueue = vi.spyOn(game.playback, 'enqueue');
    game.attach(null);
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledOnce());
    const options = enqueue.mock.calls[0]![2];
    const accepted = options?.publicTarget;
    expect(accepted?.namespace).toEqual({ mode: 'solo', round: 1 });
    expect(accepted?.evidence).toMatchObject({ seat: 1, card: 35, baseSeq: session.game.eventSeq });
    expect(
      session.game.pending?.kind === 'target' &&
        session.game.pending.options.includes(accepted!.evidence.target),
    ).toBe(true);
    expect(options?.action).toBeNull(); // 계측 action=null이어도 권위 선택 전달
  },
);

test('늦은 CPU 결과는 disposed generation에 수락·enqueue 증거를 만들지 않는다', async () => {
  let release: (() => void) | undefined;
  const client: AiClient = {
    ...ai,
    async decide(req) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { action: req.view.legal[0]!, ms: 1 };
    },
  };
  const game = solo(pendingSession(1), client);
  const enqueue = vi.spyOn(game.playback, 'enqueue');
  game.attach(null);
  await vi.waitFor(() => expect(release).toBeDefined());
  game.dispose();
  release!();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(enqueue).not.toHaveBeenCalled();
});

test('기존 자동 동등 선택은 submit/sessionAct 성공으로 정확 원본을 전달한다', async () => {
  const c = cardId;
  const initial = {
    ...createSession(config).session,
    game: createScenario({
      hands: [[c('8광')], [c('10열')]],
      floor: [c('8피b'), c('8피a')],
      deck: [c('12비광'), c('10청')],
    }),
  };
  const played = sessionAct(initial, { type: 'play', seat: 0, card: c('8광') });
  if (!played.ok) throw new Error(played.message);
  const game = solo(played.session);
  const enqueue = vi.spyOn(game.playback, 'enqueue');
  const expected = automaticAction(
    toBoardView(playerView(played.session.game, 0), {
      names: config.names,
      balances: [1000, 1000],
    }),
  );
  expect(expected?.type).toBe('chooseTarget');
  game.autoAdvance(false);
  await vi.waitFor(() =>
    expect(enqueue.mock.calls.some((call) => call[2]?.publicTarget?.evidence.seat === 0)).toBe(
      true,
    ),
  );
  expect(
    enqueue.mock.calls.filter((call) => call[2]?.publicTarget?.evidence.seat === 0),
  ).toHaveLength(1);
  expect(
    enqueue.mock.calls.find((call) => call[2]?.publicTarget?.evidence.seat === 0)?.[2]?.publicTarget
      ?.evidence,
  ).toMatchObject({
    seat: 0,
    card: c('8광'),
    target: expected?.type === 'chooseTarget' ? expected.card : -1,
  });
});

function synthetic(start: number) {
  let n = start;
  return () => {
    n++;
    return Uint8Array.from({ length: 32 }, (_, i) => (n * 31 + i * 7) & 255);
  };
}

test.each([0, 1] as const)(
  'P2P 행동좌석 %i의 tuple은 local observer와 guest enqueue에 동일 도달한다',
  async (actor) => {
    const [savedOut, savedIn] = createMemoryTransportPair();
    const authority = new HostSession(savedOut, {
      rules: PRESETS.standard,
      names: config.names,
      random32: synthetic(36),
      dealer: actor,
    });
    const observer = new GuestSession(savedIn, { name: '좌석1', random32: synthetic(456) });
    observer.join();
    if (actor === 0) expect(authority.apply({ type: 'play', seat: actor, card: 7 })).toBe(true);
    else observer.sendAction({ type: 'play', seat: actor, card: 7 });
    const saved = authority.toJSON();
    const [out, input] = createMemoryTransportPair();
    const hostConfig = {
      preset: 'standard' as const,
      rules: PRESETS.standard,
      perPoint: 100,
      startBalance: 50_000,
      hostName: '좌석0',
      timerDecisionMs: null,
    };
    const host = new HostGame({
      config: hostConfig,
      resume: { version: 2, config: hostConfig, state: saved, records: [] },
      transport: out,
      clock: false,
      persist: false,
    });
    expect(host.resumeSaved()).toBe(true);
    const guest = new GuestGame({
      name: '좌석1',
      token: saved.token,
      restore: observer.toJSON(),
      transport: input,
      onTicket() {},
      clock: false,
      persist: false,
    });
    onTestFinished(() => {
      host.dispose();
      guest.dispose();
    });
    guest.reconnect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const hostEnqueue = vi.spyOn(host.playback, 'enqueue');
    const guestEnqueue = vi.spyOn(guest.playback, 'enqueue');
    const acting = actor === 0 ? host : guest;
    expect(acting.submit({ type: 'chooseTarget', seat: actor, card: 6 })).toBe(true);
    const h = hostEnqueue.mock.calls.find((call) => call[2]?.publicTarget)?.[2]?.publicTarget;
    const g = guestEnqueue.mock.calls.find((call) => call[2]?.publicTarget)?.[2]?.publicTarget;
    expect(h).toEqual(g);
    expect(h?.evidence).toEqual({ seat: actor, card: 7, target: 6, baseSeq: saved.seq });
    expect(h?.namespace).toMatchObject({ mode: 'p2p', round: 1 });
    expect(
      hostEnqueue.mock.calls.find((call) => call[2]?.publicTarget)?.[1].inFlight.playTarget,
    ).toBe(6);
    hostEnqueue.mockClear();
    guestEnqueue.mockClear();
    guest.reconnect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hostEnqueue.mock.calls.every((call) => call[2]?.publicTarget === undefined)).toBe(true);
    expect(guestEnqueue.mock.calls.every((call) => call[2]?.publicTarget === undefined)).toBe(true);
  },
);

test.each([
  { result: 'verified', scope: 'complete' },
  { result: 'conflict', reason: 'accepted' },
  { result: 'unverifiable', reason: 'gap' },
  undefined,
] as const)('기존 정산 note는 셔플과 선택 결과를 분리한다: %j', async (targetCheck) => {
  const [sourceOut, sourceIn] = createMemoryTransportPair();
  const authority = new HostSession(sourceOut, {
    rules: PRESETS.standard,
    names: config.names,
    random32: synthetic(36),
    dealer: 0,
  });
  const observer = new GuestSession(sourceIn, { name: '좌석1', random32: synthetic(456) });
  observer.join();
  for (let step = 0; step < 400 && authority.stage === 'playing'; step++) {
    const legal = [...(authority.hostView()?.legal ?? []), ...(observer.view?.legal ?? [])];
    const action = legal.find((a) => a.type === 'stop') ?? legal[0];
    if (!action) throw new Error('합법 수 없음');
    if (action.seat === 0) authority.apply(action);
    else observer.sendAction(action);
  }
  if (!authority.settlementView) authority.acceptRound();
  const [out, input] = createMemoryTransportPair();
  HostSession.fromJSON(out, authority.toJSON(), { random32: synthetic(999) });
  const guest = new GuestGame({
    name: '좌석1',
    token: authority.token,
    restore: observer.toJSON(),
    transport: input,
    onTicket() {},
    clock: false,
    persist: false,
  });
  onTestFinished(() => guest.dispose());
  guest.reconnect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const check: RoundCheck = {
    round: 1,
    result: 'verified',
    ...(targetCheck ? { publicTargets: targetCheck } : {}),
  };
  guest.checks = [check];
  expect(guest.settlementNote).toContain('셔플 공정성 검증 통과');
  expect(guest.settlementNote).toContain(
    targetCheck?.result === 'verified'
      ? '선택 정보 일치'
      : targetCheck?.result === 'conflict'
        ? '선택 정보 불일치'
        : '선택 정보 검증 불가 (관찰 기록 없음)',
  );
  expect(guest.settlementNote).not.toMatch(/wire|epoch|seq|v[34]/);
});
