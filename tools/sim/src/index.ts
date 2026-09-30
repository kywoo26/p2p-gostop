// 셀프플레이 시뮬레이션 (intent/plan.md 1.5·M2): 판 진행·좌석 교대·통계·파산 몬테카를로.
export {
  DEFAULT_CONFIG,
  parseArgs,
  POLICY_SPECS,
  type PolicySpec,
  type SimConfig,
} from './config.ts';
export {
  makePolicies,
  runPair,
  runSession,
  runUnit,
  unitCount,
  type RoundRecord,
} from './runner.ts';
export { runAll } from './pool.ts';
export { bankruptcy, distribution, niceCeil, percentile, summarize } from './stats.ts';
export { toMarkdown } from './report.ts';
