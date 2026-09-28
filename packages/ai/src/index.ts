// CPU 상대 (plan.md 1.5, spec 7장 AI-01~AI-09).
// 정책은 playerView 결과와 합법 수만 본다(정보 은닉). 난수는 시드 xoshiro128**(Rng)만 쓴다(AI-08).
export { DIFFICULTIES, type DecisionContext, type Difficulty, type Policy } from './types.ts';
export { Rng, mixSeed } from './rng.ts';
export {
  DEFAULT_WEIGHTS,
  parseWeights,
  withWeights,
  type ComboWeights,
  type DeepPartial,
  type GoStopWeights,
  type RiskWeights,
  type RolloutWeights,
  type SearchWeights,
  type TacticWeights,
  type Weights,
} from './weights.ts';
export {
  cardValue,
  countsOf,
  holdProbability,
  pointsOf,
  potentialOf,
  type Counts,
} from './features.ts';
export { evaluate, evaluateState, terminalPoints } from './evaluator.ts';
export { actingSeat, determinize, unknownCards } from './knowledge.ts';
export { heuristicAction, rollout, ruleGoStop } from './rollout.ts';
export { RandomPolicy } from './policies/random.ts';
export { HeuristicPolicy } from './policies/heuristic.ts';
export { EasyPolicy, type EasyOptions } from './policies/easy.ts';
export { GreedyPolicy, type GreedyOptions } from './policies/greedy.ts';
export {
  DEFAULT_ISMCTS_ITERATIONS,
  DEFAULT_TIME_BUDGET_MS,
  IsmctsPolicy,
  analyzeGoStop,
  utility,
  type GoStopAnalysis,
  type IsmctsOptions,
  type SearchStats,
} from './policies/ismcts.ts';
export { createPolicy, type PolicyOptions } from './factory.ts';
export {
  playRound,
  type DecisionRecord,
  type PlayRoundOptions,
  type PlayedRound,
} from './match.ts';
export {
  DEFAULT_PER_POINT,
  MONEY_MODEL_BASIS,
  MONEY_STATS,
  PER_POINT_OPTIONS,
  START_BALANCE_TABLE,
  suggestedStartBalance,
  type PerPoint,
  type PresetMoneyStats,
} from './money-defaults.ts';
