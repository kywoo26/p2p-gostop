// Evaluator 특징 단위 테스트: 시나리오 상태에서 특징의 방향(부호)과 엔진 점수와의 일치를 확인한다.
import {
  ALL_CARD_IDS,
  createScenario,
  getCard,
  playerView,
  reduce,
  scoreCaptured,
  type CapturedPile,
  type CardId,
  type GameState,
  type ScenarioSetup,
} from '@p2p-gostop/engine';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  countsOf,
  evaluate,
  holdProbability,
  pointsOf,
  terminalPoints,
  withWeights,
  type Weights,
} from '../src/index.ts';

function mustReduce(state: GameState, action: Parameters<typeof reduce>[1]): GameState {
  const result = reduce(state, action);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.state;
}

function pileOf(ids: readonly CardId[]): CapturedPile {
  const pile = {
    gwang: [] as CardId[],
    yeol: [] as CardId[],
    tti: [] as CardId[],
    pi: [] as CardId[],
  };
  for (const id of ids) {
    const kind = getCard(id).kind;
    (kind === 'bonus' ? pile.pi : pile[kind]).push(id);
  }
  return pile;
}

/** 좌석 0이 낼 차례인 기본 배치 (손패 5장씩, 바닥 4장) */
const BASE: ScenarioSetup = {
  hands: [
    [13, 17, 21, 25, 37],
    [14, 18, 22, 26, 38],
  ],
  floor: [2, 6, 30, 34],
};

function view0(setup: Partial<ScenarioSetup>, w: Weights = DEFAULT_WEIGHTS): number {
  const state = createScenario({ ...BASE, ...setup });
  return evaluate(playerView(state, 0), 0, w);
}

describe('특징: 족보 점수', () => {
  it('장수 벡터 점수(pointsOf)는 엔진 scoreCaptured와 항상 같다', () => {
    fc.assert(
      fc.property(fc.subarray([...ALL_CARD_IDS]), fc.boolean(), (ids, asPi) => {
        const pile = pileOf(ids);
        expect(pointsOf(countsOf(pile, asPi))).toBe(scoreCaptured(pile, asPi).total);
      }),
      { numRuns: 500, seed: 7 },
    );
  });

  it('holdProbability: 모르는 카드가 없으면 0, 손패가 충분히 많으면 1, 단조 증가', () => {
    expect(holdProbability(0, 20, 5)).toBe(0);
    expect(holdProbability(2, 20, 0)).toBe(0);
    expect(holdProbability(2, 10, 9)).toBe(1);
    expect(holdProbability(1, 20, 5)).toBeCloseTo(5 / 20);
    expect(holdProbability(2, 20, 5)).toBeGreaterThan(holdProbability(1, 20, 5));
    expect(holdProbability(2, 20, 6)).toBeGreaterThan(holdProbability(2, 20, 5));
  });
});

describe('Evaluator(view, seat)', () => {
  it('내 광·고도리 진행은 올리고 상대 진행은 내린다', () => {
    const base = view0({});
    expect(view0({ captured: [[0, 8], []] })).toBeGreaterThan(base);
    expect(view0({ captured: [[], [0, 8]] })).toBeLessThan(base);
    expect(view0({ captured: [[4, 12], []] })).toBeGreaterThan(base);
    expect(view0({ captured: [[], [4, 12]] })).toBeLessThan(base);
  });

  it('상대가 고도리 새를 하나라도 가지면 내 고도리 진행 가치가 사라진다', () => {
    const alive = view0({ captured: [[4, 12], [0]] }) - view0({ captured: [[], [0]] });
    const dead = view0({ captured: [[4, 12], [29]] }) - view0({ captured: [[], [29]] });
    expect(alive).toBeGreaterThan(dead);
  });

  it('피박 위험: 피 진행 가치를 끄면 피박 위험 항만 남는다 (상대 피 9장일 때 내 피 3 < 8)', () => {
    const w = withWeights(DEFAULT_WEIGHTS, { combo: { piUnit: 0 } });
    const oppPi = [3, 7, 11, 15, 19, 23, 27, 31, 35];
    // 내 피 3장(가치 3, 피박 문턱 7 이하) vs 6장(가치 8: 쌍피 2장 포함)
    const myFive = [10, 39, 41];
    const myEight = [10, 39, 41, 42, 43, 47];
    const gap = (weights: typeof w): number =>
      view0({ captured: [myEight, oppPi] }, weights) -
      view0({ captured: [myFive, oppPi] }, weights);
    const off = withWeights(w, { risk: { piBak: 0 } });
    // 피박 위험 항을 켜면 "피 8"과 "피 3"의 차이가 위험 항만큼 벌어진다(다른 항은 두 경우에 같게 작용)
    expect(gap(w)).toBeGreaterThan(gap(off) + 0.5);
  });

  it('광박 위험: 내 광 0장이고 상대 광 2장이면 광박 항만큼 내려간다', () => {
    const on = view0({ captured: [[], [0, 8]] });
    const off = view0(
      { captured: [[], [0, 8]] },
      withWeights(DEFAULT_WEIGHTS, { risk: { gwangBak: 0 } }),
    );
    expect(on).toBeLessThan(off);
  });

  it('바닥 노출: 상대가 먹을 수 있는 광을 바닥에 두면 노출 가중치만큼 내려간다', () => {
    const setup = { floor: [0, 6, 30, 34] };
    const on = view0(setup);
    const off = view0(setup, withWeights(DEFAULT_WEIGHTS, { tactic: { exposure: 0 } }));
    expect(on).toBeLessThan(off);
  });

  it('손패 매칭: 바닥과 맞는 카드를 들고 있으면 올라간다', () => {
    const noMatch = view0({});
    const match = view0({
      hands: [
        [1, 17, 21, 25, 37],
        [14, 18, 22, 26, 38],
      ],
      floor: [0, 6, 30, 34],
    });
    const matchOff = view0(
      {
        hands: [
          [1, 17, 21, 25, 37],
          [14, 18, 22, 26, 38],
        ],
        floor: [0, 6, 30, 34],
      },
      withWeights(DEFAULT_WEIGHTS, { tactic: { handMatch: 0 } }),
    );
    expect(match).toBeGreaterThan(matchOff);
    expect(Number.isFinite(noMatch)).toBe(true);
  });

  it('흔들기·고박 배수가 잠재력에 곱해진다', () => {
    const plain = view0({ captured: [[0, 8, 28], []] });
    const shaken = view0({ captured: [[0, 8, 28], []], seats: [{ shakes: 1 }, {}] });
    expect(shaken).toBeGreaterThan(plain);
    const oppWent = view0({
      captured: [[0, 8, 28], []],
      seats: [{}, { goCount: 1, lastGoScore: 7 }],
    });
    expect(oppWent).toBeGreaterThan(plain);
  });

  it('관점 대칭: 다른 좌석 관점 값은 부호가 반대', () => {
    const state = createScenario({
      ...BASE,
      captured: [
        [0, 4],
        [12, 3],
      ],
    });
    const view = playerView(state, 0);
    expect(evaluate(view, 1)).toBe(-evaluate(view, 0));
  });

  it('끝난 판은 정산 점수 그대로 (스톱: 4광 4 + 홍단 3 = 7점, 상대 광 0장 → 광박 ×2 = 14점)', () => {
    const state = createScenario({
      hands: [
        [9, 17, 21],
        [14, 18, 22],
      ],
      floor: [10, 30],
      deck: [47],
      captured: [[0, 8, 28, 40, 1, 5], [3]],
    });
    const prompted = mustReduce(state, { type: 'play', seat: 0, card: 9 });
    expect(prompted.pending?.kind).toBe('goStop');
    const end = mustReduce(prompted, { type: 'stop', seat: 0 });
    expect(end.phase).toBe('end');
    expect(terminalPoints(end, 0)).toBe(14);
    expect(evaluate(playerView(end, 0), 0)).toBe(14);
    expect(evaluate(playerView(end, 1), 1)).toBe(-14);
  });
});
