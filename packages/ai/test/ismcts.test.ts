// ISMCTS: 반복 상한·시간 제한 준수, 고/스톱 기대값 비교(AI-06)
import {
  PRESETS,
  createScenario,
  playerView,
  previewStop,
  reduce,
  type GameState,
  type ScenarioSetup,
} from '@p2p-gostop/engine';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  IsmctsPolicy,
  Rng,
  actingSeat,
  analyzeGoStop,
  utility,
  ruleGoStop,
  withWeights,
} from '../src/index.ts';
import { randomState } from './helpers.ts';

function mustReduce(state: GameState, action: Parameters<typeof reduce>[1]): GameState {
  const r = reduce(state, action);
  if (!r.ok) {
    throw new Error(r.message);
  }
  return r.state;
}

/** 좌석 0이 3홍(9)을 내서 3피(10)를 먹으면 4광 4 + 홍단 3 = 7점으로 고/스톱 프롬프트가 뜬다 */
function goStopState(setup: Partial<ScenarioSetup>): GameState {
  const state = createScenario({
    hands: [
      [9, 17, 21, 25, 37, 13, 16, 20],
      [14, 18, 22, 26, 38, 15, 19, 23],
    ],
    floor: [10, 30],
    captured: [[0, 8, 28, 40, 1, 5], [3]],
    ...setup,
  });
  const next = mustReduce(state, { type: 'play', seat: 0, card: 9 });
  expect(next.pending?.kind).toBe('goStop');
  return next;
}

describe('IsmctsPolicy', () => {
  it('UCT 모드: 반복 상한을 정확히 지킨다 (시간 제한 없음 = 결정적 모드)', () => {
    const state = randomState(PRESETS.standard, 4, 0);
    const view = playerView(state, actingSeat(state) ?? 0);
    const policy = new IsmctsPolicy({
      maxIterations: 123,
      defaultTimeBudgetMs: null,
      searchMode: 'uct',
    });
    policy.decide(view, view.legal, { rng: new Rng(1) });
    expect(policy.lastStats?.iterations).toBe(123);
    const visits = policy.lastStats?.edges.reduce((s, e) => s + e.visits, 0);
    expect(visits).toBe(123);
  });

  it('순차 반감 모드도 반복 상한 안에서 합법 수를 고른다', () => {
    const state = randomState(PRESETS.standard, 4, 0);
    const view = playerView(state, actingSeat(state) ?? 0);
    const policy = new IsmctsPolicy({
      maxIterations: 200,
      defaultTimeBudgetMs: null,
      searchMode: 'halving',
    });
    const action = policy.decide(view, view.legal, { rng: new Rng(1) });
    expect(view.legal).toContainEqual(action);
    expect(policy.lastStats?.iterations).toBeLessThanOrEqual(200);
    expect(policy.lastStats?.edges[0]?.action).toEqual(action);
  });

  it('UCT 모드: 시간 제한을 지킨다 (주입한 시계: 호출마다 1ms)', () => {
    const state = randomState(PRESETS.standard, 4, 0);
    const view = playerView(state, actingSeat(state) ?? 0);
    let t = 0;
    const now = (): number => t++;
    const policy = new IsmctsPolicy({ maxIterations: 1_000_000, searchMode: 'uct' });
    const action = policy.decide(view, view.legal, { rng: new Rng(1), timeBudgetMs: 20, now });
    const iterations = policy.lastStats?.iterations ?? 0;
    // 시계는 16회마다 확인: 20ms 예산이면 20번째 확인 무렵 멈춘다
    expect(iterations).toBeGreaterThanOrEqual(view.legal.length);
    expect(iterations).toBeLessThanOrEqual(16 * 22);
    expect(view.legal).toContainEqual(action);
  });

  it('순차 반감 모드(기본): 시간 제한을 지킨다 (주입한 시계: 호출마다 1ms)', () => {
    const state = randomState(PRESETS.standard, 4, 0);
    const view = playerView(state, actingSeat(state) ?? 0);
    let t = 0;
    const now = (): number => t++;
    const policy = new IsmctsPolicy({ maxIterations: 1_000_000 });
    const action = policy.decide(view, view.legal, { rng: new Rng(1), timeBudgetMs: 20, now });
    const rollouts = policy.lastStats?.iterations ?? 0;
    // 후보당 4표본마다 시계 확인: 20ms 예산이면 약 20번 확인(×4표본×후보 수) 안에 멈춘다
    expect(rollouts).toBeGreaterThan(0);
    expect(rollouts).toBeLessThanOrEqual(4 * 22 * view.legal.length);
    expect(view.legal).toContainEqual(action);
  });

  it('기본 시간 제한(1s)과 반복 상한 중 먼저 오는 쪽에서 멈춘다', () => {
    const state = randomState(PRESETS.standard, 9, 4);
    const view = playerView(state, actingSeat(state) ?? 0);
    const policy = new IsmctsPolicy({ maxIterations: 50 });
    policy.decide(view, view.legal, { rng: new Rng(2) });
    expect(policy.lastStats === null || policy.lastStats.iterations <= 50).toBe(true);
  });

  it('보상은 [−1, 1] 범위이고 부호를 지킨다', () => {
    const s = DEFAULT_WEIGHTS.search;
    for (const p of [-500, -7, -1, 0, 1, 7, 500]) {
      const u = utility(p, s);
      expect(Math.abs(u)).toBeLessThanOrEqual(1);
      expect(Math.sign(u)).toBe(Math.sign(p));
    }
  });
});

describe('고/스톱 기대값 비교 (AI-06)', () => {
  it('분석 값의 정합성: 스톱 값 = previewStop, EV = P(승)·획득 − P(패)·손실', () => {
    const state = goStopState({});
    const view = playerView(state, 0);
    const a = analyzeGoStop(view, new Rng(5), 200, DEFAULT_WEIGHTS);
    expect(a.stopPoints).toBe(previewStop(state, 0).finalPoints);
    expect(a.pWin + a.pLose + a.pNagari).toBeCloseTo(1, 9);
    expect(a.goEv).toBeCloseTo(
      a.pWin * a.meanGain - a.pLose * a.meanLoss + a.pNagari * a.meanNagari,
      9,
    );
    expect(a.samples).toBe(200);
  });

  it('고를 부르면 다음 턴에 5광 폭탄이 확실하면 고 (EV ≫ 스톱)', () => {
    // 손패에 12월 3장(비열·비띠·쌍피), 바닥에 비광: 상대에게 12월이 없어 다음 턴 폭탄으로 5광 15점 + 폭탄 ×2.
    // 지금 스톱 = 4광 4 + 홍단 3 = 7점 × 광박 2 = 14점
    const state = goStopState({
      hands: [
        [9, 45, 46, 47, 17, 21, 25, 37],
        [14, 18, 22, 26, 38, 15, 19, 23],
      ],
      floor: [10, 30, 44],
    });
    const view = playerView(state, 0);
    const policy = new IsmctsPolicy({ maxIterations: 400, defaultTimeBudgetMs: null });
    const action = policy.decide(view, view.legal, { rng: new Rng(1) });
    const a = policy.lastGoStop;
    expect(a?.stopPoints).toBe(14);
    expect(a?.pWin).toBeGreaterThan(0.9);
    expect(a?.goEv).toBeGreaterThan(3 * 14);
    expect(action.type).toBe('go');
  });

  it('과감성 1은 순액 EV를 비교하며 같은 표본에서 여유만 줄인다 (AI-06·08)', () => {
    for (const seed of [1, 2, 3]) {
      const view = playerView(goStopState({}), 0);
      const a = analyzeGoStop(view, new Rng(seed), 100, DEFAULT_WEIGHTS);
      const cautious = analyzeGoStop(
        view,
        new Rng(seed),
        100,
        withWeights(DEFAULT_WEIGHTS, { goStop: { bold: 0.5 } }),
      );
      const expected = a.goEv > a.stopPoints ? 'go' : 'stop';
      expect(a.decision).toBe(expected);
      expect(cautious.goEv).toBe(a.goEv);
      expect(cautious.threshold).toBeGreaterThan(a.threshold);
      expect(analyzeGoStop(view, new Rng(seed), 100, DEFAULT_WEIGHTS)).toEqual(a);
    }
  });

  it('상대가 고도리·청단 직전(바닥에 8고·10청)이고 내 턴이 1번뿐이면 스톱', () => {
    const state = goStopState({
      hands: [
        [9, 17],
        [14, 18, 22, 26, 38, 15],
      ],
      floor: [10, 29, 37],
      deck: [47],
      // 상대: 비광 1장(광박 없음), 새 2장(8고 바닥), 청단 2장(10청 바닥), 열끗 5장(1점), 피 9
      captured: [
        [0, 8, 28, 40, 1, 5],
        [44, 4, 12, 20, 24, 36, 21, 33, 2, 3, 6, 7, 11, 27, 31, 35, 39],
      ],
    });
    const view = playerView(state, 0);
    const policy = new IsmctsPolicy({ maxIterations: 400, defaultTimeBudgetMs: null });
    const action = policy.decide(view, view.legal, { rng: new Rng(1) });
    const a = policy.lastGoStop;
    expect(a?.pLose).toBeGreaterThan(0.3);
    expect(a?.goEv).toBeLessThan(a?.stopPoints ?? 0);
    expect(action.type).toBe('stop');
  });

  it('표본 0·음수·소수는 NaN 분석 대신 거부한다', () => {
    const view = playerView(goStopState({}), 0);
    for (const n of [0, -1, 0.5]) {
      expect(() => analyzeGoStop(view, new Rng(1), n, DEFAULT_WEIGHTS)).toThrow('표본');
    }
  });

  it('기한이 지나면 완료한 표본으로 합법적인 결정을 돌려준다', () => {
    const view = playerView(goStopState({}), 0);
    const a = analyzeGoStop(view, new Rng(1), 2000, DEFAULT_WEIGHTS, { now: () => 1, until: 0 });
    expect(a.samples).toBe(16);
    expect(Number.isFinite(a.goEv)).toBe(true);
    expect(view.legal.some((action) => action.type === a.decision)).toBe(true);
  });
});

describe('보통의 과감한 고/스톱 (AI-03·06)', () => {
  it('피박 기회는 피 가치 1~5일 때만 추가 고: 0장 예외·광 1장 보유를 반영한다 (G6·G7)', () => {
    const pi = [19, 22, 23, 26, 27];
    for (const count of [0, 1, 5]) {
      const state = createScenario({
        hands: [
          [9, 17, 21, 25],
          [24, 29, 30, 31],
        ],
        floor: [10],
        deck: [42, 43, 46, 47],
        captured: [
          [0, 8, 28, 40, 1, 5, 2, 3, 6, 7, 11, 14, 15, 18],
          [44, ...pi.slice(0, count)],
        ],
      });
      const seats: GameState['seats'] = [{ ...state.seats[0], goCount: 2 }, state.seats[1]];
      expect(ruleGoStop({ ...state, seats }, 0, DEFAULT_WEIGHTS)).toBe(count === 0 ? 'stop' : 'go');
    }
  });

  it('내 피박 위험과 상대 3점이 겹치면 상한 전 스톱한다 (G4·G6)', () => {
    const state = createScenario({
      hands: [
        [9, 17, 21, 25],
        [24, 29, 30, 31],
      ],
      floor: [10],
      deck: [42, 43, 46, 47],
      captured: [
        [0, 8, 28, 40, 1, 5, 2],
        [3, 6, 7, 11, 14, 15, 18, 19, 22, 23, 26, 27],
      ],
    });
    expect(state.seats[1].score.total).toBe(3);
    expect(ruleGoStop(state, 0, DEFAULT_WEIGHTS)).toBe('stop');
  });

  it('상대 위험이 낮으면 1고 뒤에도 고하고, 광박 기회에는 2고 뒤 한 번 더 간다', () => {
    const state = goStopState({});
    for (const goCount of [0, 1, 2]) {
      const seats: GameState['seats'] = [{ ...state.seats[0], goCount }, state.seats[1]];
      expect(ruleGoStop({ ...state, seats }, 0, DEFAULT_WEIGHTS)).toBe('go');
    }
    const seats: GameState['seats'] = [{ ...state.seats[0], goCount: 3 }, state.seats[1]];
    expect(ruleGoStop({ ...state, seats }, 0, DEFAULT_WEIGHTS)).toBe('stop');
  });

  it('남은 턴·더미가 부족하면 저위험 박 기회여도 스톱한다', () => {
    const state = goStopState({});
    expect(ruleGoStop({ ...state, deck: state.deck.slice(0, 1) }, 0, DEFAULT_WEIGHTS)).toBe('stop');
    const seats: GameState['seats'] = [
      { ...state.seats[0], hand: state.seats[0].hand.slice(0, 1) },
      state.seats[1],
    ];
    expect(ruleGoStop({ ...state, seats }, 0, DEFAULT_WEIGHTS)).toBe('stop');
  });

  it('상대 득점 위험이 높으면 고 횟수 상한 전에도 스톱한다', () => {
    const state = goStopState({});
    const seats: GameState['seats'] = [
      state.seats[0],
      {
        ...state.seats[1],
        score: { ...state.seats[1].score, total: 5 },
      },
    ];
    expect(ruleGoStop({ ...state, seats }, 0, DEFAULT_WEIGHTS)).toBe('stop');
  });
});
