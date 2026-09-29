// AI 롤아웃 벤치마크 (CI 아님). 사용: ./dev.sh npm run bench -w packages/ai -- [반복 수]
// 같은 시드·휴리스틱으로 판을 끝까지 두어 reduce와 applyUnchecked의 반복 처리량을 비교한다.
import { PRESETS, newRound, playerView } from '@p2p-gostop/engine';
import { DEFAULT_WEIGHTS, IsmctsPolicy, Rng, rollout } from '../src/index.ts';

const iterations = Number(process.argv[2] ?? 1000);
if (!Number.isInteger(iterations) || iterations < 1)
  throw new RangeError('반복 수는 양의 정수여야 합니다');

function run(debugReduce: boolean, count = iterations): number {
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    const state = newRound(PRESETS.standard, i + 20260929, { dealer: i % 2 === 0 ? 0 : 1 }).state;
    rollout(state, new Rng(i + 431), DEFAULT_WEIGHTS, debugReduce);
  }
  return (count * 1000) / (performance.now() - start);
}

run(true, 500); // 두 경로를 동일하게 JIT 예열
run(false, 500);
const median = (values: number[]): number => values.toSorted((a, b) => a - b)[1] ?? 0;
const checked: number[] = [];
const unchecked: number[] = [];
for (let i = 0; i < 3; i++) {
  checked.push(run(true));
  unchecked.push(run(false));
}
const before = median(checked);
const after = median(unchecked);
console.log(`reduce: ${before.toFixed(1)} iterations/s`);
console.log(`applyUnchecked: ${after.toFixed(1)} iterations/s`);
console.log(`ratio: ×${(after / before).toFixed(2)}`);

const view = playerView(newRound(PRESETS.standard, 4, { dealer: 0 }).state, 0);
function search(debugReduce: boolean): number {
  const start = performance.now();
  let iterationsDone = 0;
  for (let i = 0; i < 3; i++) {
    const policy = new IsmctsPolicy({
      maxIterations: iterations,
      defaultTimeBudgetMs: null,
      debugReduce,
    });
    policy.decide(view, view.legal, { rng: new Rng(991 + i) });
    iterationsDone += policy.lastStats?.iterations ?? 0;
  }
  return (iterationsDone * 1000) / (performance.now() - start);
}
search(true);
search(false);
const checkedSearch = search(true);
const uncheckedSearch = search(false);
console.log(`search reduce: ${checkedSearch.toFixed(1)} iterations/s`);
console.log(`search applyUnchecked: ${uncheckedSearch.toFixed(1)} iterations/s`);
console.log(`search ratio: ×${(uncheckedSearch / checkedSearch).toFixed(2)}`);
