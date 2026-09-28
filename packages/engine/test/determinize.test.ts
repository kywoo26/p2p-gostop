// 결정화 API 계약 (M1 리뷰 F-3, spec AI-01·AI-03). 무작위 판 전체의 왕복 검사는 properties.test.ts(step-checks.ts).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  PRESETS,
  cardId,
  deckCardIds,
  determinize,
  legalActions,
  newRound,
  playerView,
  reduce,
  unseenCards,
  type Action,
  type GameState,
} from '../src/index.ts';
import { collectCards, createScenario } from '../src/testing.ts';

const c = cardId;
const ascending = (ids: readonly number[]): number[] => ids.toSorted((a, b) => a - b);

function mustReduce(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.state;
}

function midTurn(): GameState {
  // 좌석 0이 5열을 내면 바닥 5월 2장 중 대상을 고르는 프롬프트(낸 카드가 진행 중 상태에 있다)
  return mustReduce(
    createScenario({
      hands: [
        [c('5열'), c('12열')],
        [c('10청'), c('10피a')],
      ],
      floor: [c('5초'), c('5피a'), c('8광')],
      deck: [c('11피a'), c('9피a')],
      captured: [[c('1광')], [c('2피a')]],
      seats: [
        { turnsTaken: 3, ppeokTurns: [2] },
        { turnsTaken: 3, noCaptureStreak: 2 },
      ],
    }),
    { type: 'play', seat: 0, card: c('5열') },
  );
}

describe('unseenCards', () => {
  it('보는 좌석이 볼 수 없는 카드 = 상대 손패 ∪ 더미 (낸 카드·바닥·획득 패는 보인다)', () => {
    const state = midTurn();
    expect(state.pending?.kind).toBe('target');
    for (const viewer of [0, 1] as const) {
      const opp = viewer === 0 ? 1 : 0;
      expect(unseenCards(playerView(state, viewer))).toEqual(
        ascending([...state.seats[opp].hand, ...state.deck]),
      );
    }
  });

  it('선 고르기 단계에는 후보가 가려져 있어 덱 전체다', () => {
    const { state } = newRound(DEFAULT_RULES, 3);
    expect(unseenCards(playerView(state, 0))).toHaveLength(51);
  });
});

describe('determinize', () => {
  it('실제 숨은 정보를 넣으면 원래 상태와 같다 (PRNG는 인수로)', () => {
    const state = midTurn();
    for (const viewer of [0, 1] as const) {
      const opp = viewer === 0 ? 1 : 0;
      const det = determinize(
        playerView(state, viewer),
        { opponentHand: state.seats[opp].hand, deck: state.deck },
        state.rng,
      );
      expect(det).toEqual(state);
    }
  });

  it('무작위 표본이어도 카드 51장이 보존되고 보는 좌석의 합법 수가 같다', () => {
    const state = midTurn();
    const view = playerView(state, 0);
    const unseen = unseenCards(view).toReversed();
    const count = view.seats[1].handCount;
    const det = determinize(view, {
      opponentHand: unseen.slice(0, count),
      deck: unseen.slice(count),
    });
    expect(ascending(collectCards(det))).toEqual(Array.from({ length: 51 }, (_, i) => i));
    expect(legalActions(det, 0)).toEqual(legalActions(state, 0));
    expect(det.rng).toEqual(
      determinize(view, { opponentHand: unseen.slice(0, count), deck: unseen.slice(count) }, 0).rng,
    );
  });

  it('표본이 뷰와 모순되면 RangeError', () => {
    const state = midTurn();
    const view = playerView(state, 0);
    const hand = state.seats[1].hand;
    expect(() => determinize(view, { opponentHand: hand.slice(1), deck: state.deck })).toThrow(
      RangeError,
    );
    // 보이는 카드(바닥의 8광)를 숨은 카드 자리에 넣음
    const swapped = [c('8광'), ...hand.slice(1)];
    expect(() => determinize(view, { opponentHand: swapped, deck: state.deck })).toThrow(
      RangeError,
    );
    // 자기 프롬프트는 표본으로 바꿀 수 없다
    expect(() =>
      determinize(view, {
        opponentHand: hand,
        deck: state.deck,
        pending: { kind: 'play', seat: 1 },
      }),
    ).toThrow(RangeError);
  });

  it('가려진 상대 흔들기 프롬프트는 표본의 pending으로 되살리고, 없으면 카드 내기 대기로 둔다', () => {
    const state = mustReduce(
      createScenario({
        hands: [
          [c('5열'), c('5초'), c('5피a'), c('12열')],
          [c('10청'), c('10피a')],
        ],
        floor: [c('8광')],
        deck: [c('11피a')],
      }),
      { type: 'play', seat: 0, card: c('5열') },
    );
    const view = playerView(state, 1);
    const sample = { opponentHand: state.seats[0].hand, deck: state.deck };
    expect(
      determinize(
        view,
        { ...sample, pending: state.pending ?? { kind: 'play', seat: 0 } },
        state.rng,
      ),
    ).toEqual(state);
    expect(determinize(view, sample).pending).toEqual({ kind: 'play', seat: 0 });
  });

  it('월을 가린 상대 총통(분배 직후 후 좌석)은 표본 손패의 같은 월 4장으로 월을 채운다', () => {
    const top = (
      '6열 6청 7열 7초 8광 8고 9국진 9청 10열 10청 ' +
      '1광 1홍 1피a 1피b 2고 2홍 3광 3홍 4고 4초 ' +
      '2피a 3피a 4피a 5열 6피a 7피a 11광 12비광'
    )
      .split(' ')
      .map(c);
    const deck = [...top, ...deckCardIds(3).filter((id) => !top.includes(id))];
    const { state } = newRound(PRESETS.standard, 1, { dealer: 0, deck });
    const view = playerView(state, 0);
    expect(view.pending).toMatchObject({ kind: 'chongtong', months: [] });
    const hand = state.seats[1].hand;
    const det = determinize(view, { opponentHand: hand, deck: state.deck }, state.rng);
    expect(det.pending).toEqual(state.pending);
    // 표본 손패에 같은 월 4장이 없으면 뷰와 모순: 1광을 더미 맨 위 카드와 맞바꾼다
    const [top0 = -1, ...restDeck] = state.deck;
    expect(() =>
      determinize(view, {
        opponentHand: hand.map((id) => (id === c('1광') ? top0 : id)),
        deck: [c('1광'), ...restDeck],
      }),
    ).toThrow(RangeError);
  });

  it('선 고르기 단계: 후보를 주면 그대로, 없으면 rng로 섞어 만든다', () => {
    const { state } = newRound(DEFAULT_RULES, 3, { isNight: true });
    const view = playerView(state, 1);
    const empty = { opponentHand: [], deck: [] };
    const pool = state.firstPick?.pool ?? [];
    expect(determinize(view, { ...empty, firstPickPool: pool }, state.rng)).toEqual(state);
    const det = determinize(view, empty, 9);
    expect(det.firstPick).toMatchObject({ picks: [null, null], ties: 0, isNight: true });
    expect(det.firstPick?.pool).toHaveLength(8);
    expect(legalActions(det, 1)).toEqual(legalActions(state, 1));
    expect(() => determinize(view, { ...empty, firstPickPool: pool.slice(1) })).toThrow(RangeError);
  });
});
