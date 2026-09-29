// E1 트랙(엔진 M6 선행) API 계약: 공개 손패(revealed)와 결정화 표본 형식, applyUnchecked, 밀기 액션, matchPreview.
// 규칙 기대값은 벡터(test/vectors/push.json·view.json·pi.json)가, 무작위 판 전체는 properties.test.ts가 검사한다.
import { describe, expect, it } from 'vitest';
import {
  MAX_PUSHES,
  PRESETS,
  UNIMPLEMENTED_RULES,
  applySettlement,
  applyUnchecked,
  cardId,
  createLedger,
  determinize,
  legalActions,
  matchPreview,
  newRound,
  playerView,
  reduce,
  settle,
  unseenCards,
  type Action,
  type GameState,
} from '../src/index.ts';
import { createScenario } from '../src/testing.ts';

const c = cardId;
const ascending = (ids: readonly number[]): number[] => ids.toSorted((a, b) => a - b);

function mustReduce(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.state;
}

/** 좌석 0이 5월 3장을 흔들고 5열을 낸 뒤 상태(5초·5피a 공개), 좌석 1 차례 */
function shaken(): GameState {
  const state = createScenario({
    hands: [
      [c('5열'), c('5초'), c('5피a'), c('12열')],
      [c('10청'), c('10피a')],
    ],
    floor: [c('8광')],
    deck: [c('11피a'), c('9피a')],
  });
  const asked = mustReduce(state, { type: 'play', seat: 0, card: c('5열') });
  return mustReduce(asked, { type: 'shake', seat: 0, accept: true });
}

/** 좌석 0이 7점으로 스톱해 끝난 판 (밀기 켬) */
function wonRound(pushes = 0, push = true): GameState {
  const state = createScenario({
    rules: { ...PRESETS.standard, push },
    hands: [
      [c('5열'), c('12열')],
      [c('10청'), c('10피a')],
    ],
    floor: [c('5피a'), c('9청')],
    deck: [c('7열')],
    captured: [
      [
        '11쌍피',
        '12쌍피',
        '1피a',
        '1피b',
        '2피a',
        '2피b',
        '3피a',
        '3피b',
        '4피a',
        '4피b',
        '6피a',
        'B2b',
      ].map(c),
      [],
    ],
    seats: [{ turnsTaken: 3 }, {}],
    pushes,
  });
  const prompted = mustReduce(state, { type: 'play', seat: 0, card: c('5열') });
  return mustReduce(prompted, { type: 'stop', seat: 0 });
}

describe('공개 손패 (SeatView.revealed)', () => {
  it('흔들어 보여 준 카드는 양쪽 뷰에 보이고 상대의 unseenCards에서 빠진다', () => {
    const state = shaken();
    const revealed = [c('5초'), c('5피a')];
    expect(ascending(state.seats[0].revealed)).toEqual(revealed);
    for (const viewer of [0, 1] as const) {
      expect(ascending(playerView(state, viewer).seats[0].revealed)).toEqual(revealed);
    }
    const view = playerView(state, 1);
    const unseen = unseenCards(view);
    expect(unseen.filter((id) => revealed.includes(id))).toEqual([]);
    expect(unseen).toHaveLength(view.seats[0].handCount - revealed.length + view.deckCount);
  });

  it('결정화 표본은 숨은 손패(공개 카드 제외) 형식과 전체 손패 형식을 모두 받는다', () => {
    const state = shaken();
    const view = playerView(state, 1);
    const hand = state.seats[0].hand;
    const hidden = hand.filter((id) => !state.seats[0].revealed.includes(id));
    // 전체 손패 형식: 원래 상태 그대로
    expect(determinize(view, { opponentHand: hand, deck: state.deck }, state.rng)).toEqual(state);
    // 숨은 손패 형식: 공개 카드를 결정화가 더한다(손패 순서만 다를 수 있다)
    const det = determinize(view, { opponentHand: hidden, deck: state.deck }, state.rng);
    expect(ascending(det.seats[0].hand)).toEqual(ascending(hand));
    expect(det.seats[0].revealed).toEqual(state.seats[0].revealed);
    expect(legalActions(det, 1)).toEqual(legalActions(state, 1));
  });

  it('공개 카드와 모순되는 표본은 RangeError', () => {
    const state = shaken();
    const view = playerView(state, 1);
    const [top = -1, ...rest] = state.deck;
    // 전체 손패 형식인데 공개 카드(5초)를 빼고 더미 카드를 넣음
    const swapped = state.seats[0].hand.map((id) => (id === c('5초') ? top : id));
    expect(() => determinize(view, { opponentHand: swapped, deck: [c('5초'), ...rest] })).toThrow(
      RangeError,
    );
    // 숨은 손패 형식 장수(1장)도 전체 형식 장수(3장)도 아닌 표본
    expect(() => determinize(view, { opponentHand: [], deck: state.deck })).toThrow(RangeError);
  });

  it('시나리오의 공개 카드는 손패에 있어야 한다', () => {
    expect(() =>
      createScenario({ hands: [[c('5열')], [c('10청')]], seats: [{ revealed: [c('5초')] }, {}] }),
    ).toThrow(RangeError);
  });
});

describe('applyUnchecked (검증 생략 경로)', () => {
  it('합법 수에는 reduce와 같은 상태·이벤트를 낸다', () => {
    const { state } = newRound(PRESETS.standard, 5, { dealer: 0 });
    for (const action of legalActions(state, 0)) {
      const checked = reduce(state, action);
      const expected = checked.ok ? { state: checked.state, events: checked.events } : checked;
      expect(applyUnchecked(state, action)).toEqual(expected);
    }
  });

  it('입력 상태를 바꾸지 않는다', () => {
    const { state } = newRound(PRESETS.standard, 5, { dealer: 1 });
    const copy: unknown = JSON.parse(JSON.stringify(state));
    const [action] = legalActions(state, 1);
    if (action !== undefined) {
      applyUnchecked(state, action);
    }
    expect(state).toEqual(copy);
  });
});

describe('밀기 (push)', () => {
  it('규칙에 따라 끝난 판의 승자에게만 합법 수로 나온다', () => {
    const won = wonRound();
    expect(legalActions(won, 0)).toEqual([{ type: 'push', seat: 0 }]);
    expect(legalActions(won, 1)).toEqual([]);
    expect(playerView(won, 0).legal).toEqual([{ type: 'push', seat: 0 }]);
    expect(legalActions(wonRound(0, false), 0)).toEqual([]);
    expect(legalActions(wonRound(MAX_PUSHES), 0)).toEqual([]);
    expect(UNIMPLEMENTED_RULES).not.toContain('push');
  });

  it('밀면 정산이 포기되고(원장 그대로) 다시 밀 수 없다', () => {
    const pushed = mustReduce(wonRound(), { type: 'push', seat: 0 });
    const settlement = settle(pushed);
    expect(settlement).toMatchObject({
      pushed: true,
      finalPoints: 0,
      forfeitedPoints: 7,
      nextPushes: 1,
    });
    const ledger = createLedger(100, 1000);
    expect(applySettlement(ledger, settlement, pushed.rules)).toBe(ledger);
    expect(legalActions(pushed, 0)).toEqual([]);
    expect(reduce(pushed, { type: 'push', seat: 0 })).toMatchObject({
      ok: false,
      reason: 'roundOver',
    });
    expect(playerView(pushed, 1).result).toEqual({ reason: 'stop', winner: 0, pushed: true });
    expect(playerView(pushed, 1).round.pushes).toBe(0);
  });

  it('진행 중인 판에서 밀기는 거부된다(차례인 좌석이면 합법 수가 아님)', () => {
    const state = createScenario({
      rules: PRESETS.arcade,
      hands: [[c('5열')], [c('10청')]],
      floor: [c('8광')],
    });
    expect(reduce(state, { type: 'push', seat: 0 })).toMatchObject({
      ok: false,
      reason: 'illegalAction',
    });
    expect(reduce(state, { type: 'push', seat: 1 })).toMatchObject({
      ok: false,
      reason: 'notYourTurn',
    });
  });

  it('다음 판에 nextPushes를 넘기면 정산에 밀기 배수가 붙는다', () => {
    const pushed = mustReduce(wonRound(), { type: 'push', seat: 0 });
    const next = newRound(pushed.rules, 9, {
      dealer: settle(pushed).nextDealer,
      pushes: settle(pushed).nextPushes ?? 0,
    }).state;
    expect(next.round.pushes).toBe(1);
    expect(playerView(next, 0).round).toMatchObject({ pushes: 1 });
  });
});

describe('matchPreview', () => {
  it('상대 손패를 모르는 뷰에서는 흔들기 여부를 false로 두고, 손패에 없는 카드는 RangeError', () => {
    const state = createScenario({
      hands: [
        [c('5열'), c('5초'), c('5피a')],
        [c('10청'), c('10피a')],
      ],
      floor: [c('8광')],
    });
    expect(matchPreview(state, 0, c('5열'))).toEqual({ kind: 'place', floor: [], shake: true });
    expect(matchPreview(playerView(state, 1), 0, c('5열'))).toEqual({
      kind: 'place',
      floor: [],
      shake: false,
    });
    expect(() => matchPreview(state, 0, c('10청'))).toThrow(RangeError);
  });
});
