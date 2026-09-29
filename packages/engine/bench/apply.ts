// 엔진 적용 경로 벤치마크 (CI 아님, 수동 측정용). ai-tuning.md §6-6 "검증 없는 적용 경로".
// 사용: npm run bench -w packages/engine [-- 판수]
// 1) 무작위 합법 정책으로 판을 두며 (상태, 액션) 쌍을 모은 뒤, 같은 쌍을 reduce / applyUnchecked로 다시 적용해 처리량을 잰다.
// 2) 롤아웃 전체(합법 수 열거 + 무작위 선택 + 적용)를 두 경로로 잰다(AI 롤아웃과 같은 모양).
import * as engine from '../src/index.ts';
import type { Action, GameState, RngState, Seat } from '../src/index.ts';

// 엔진 tsconfig는 lib es2023만 쓰므로(types: []) Node 전역을 여기서만 선언한다.
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };
declare const process: { readonly argv: readonly string[] };

type Apply = (state: GameState, action: Action) => GameState;

const viaReduce: Apply = (state, action) => {
  const result = engine.reduce(state, action);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.state;
};

const unchecked: Apply | null =
  'applyUnchecked' in engine ? (state, action) => engine.applyUnchecked(state, action).state : null;

function actingSeat(state: GameState): Seat | null {
  const pending = state.pending;
  if (pending === null) {
    return null;
  }
  return pending.kind === 'pickFirst' ? (pending.seats[0] ?? null) : pending.seat;
}

/** 무작위 합법 정책으로 한 판. 적용할 때마다 onStep(적용 전 상태, 액션) */
function playRound(
  seed: number,
  rng: RngState,
  apply: Apply,
  onStep?: (state: GameState, action: Action) => void,
): RngState {
  const rules = engine.PRESETS.standard;
  let state = engine.newRound(rules, seed, { dealer: seed % 2 === 0 ? 0 : 1 }).state;
  let r = rng;
  while (state.phase !== 'end') {
    const seat = actingSeat(state);
    if (seat === null) {
      throw new Error('입력할 좌석이 없습니다');
    }
    const legal = engine.legalActions(state, seat);
    const [index, next] = engine.nextInt(r, legal.length);
    r = next;
    const action = legal[index];
    if (action === undefined) {
      throw new Error('합법 수가 없습니다');
    }
    onStep?.(state, action);
    state = apply(state, action);
  }
  return r;
}

function time(label: string, ops: number, run: () => void): number {
  run(); // 예열
  const start = performance.now();
  run();
  const ms = performance.now() - start;
  const perSec = Math.round((ops / ms) * 1000);
  console.log(
    `${label.padEnd(34)} ${ms.toFixed(0).padStart(6)} ms  ${perSec.toLocaleString('en-US').padStart(10)} /s`,
  );
  return perSec;
}

const rounds = Number(process.argv[2] ?? 3000);
const pairs: [GameState, Action][] = [];
let rng = engine.createRng(20260928);
for (let seed = 0; seed < rounds; seed++) {
  rng = playRound(seed, rng, viaReduce, (state, action) => pairs.push([state, action]));
}
console.log(`판 ${rounds}, 적용 ${pairs.length}회 (표준 프리셋, 무작위 합법 정책)`);

const applyAll = (apply: Apply) => (): void => {
  for (const [state, action] of pairs) {
    apply(state, action);
  }
};
const a = time('reduce (적용만)', pairs.length, applyAll(viaReduce));
const b =
  unchecked === null ? null : time('applyUnchecked (적용만)', pairs.length, applyAll(unchecked));

const rollouts = (apply: Apply) => (): void => {
  let r = engine.createRng(7);
  for (let seed = 0; seed < rounds; seed++) {
    r = playRound(seed, r, apply);
  }
};
const c = time('reduce (롤아웃: 합법 수 + 적용)', rounds, rollouts(viaReduce));
const d = unchecked === null ? null : time('applyUnchecked (롤아웃)', rounds, rollouts(unchecked));

if (b !== null && d !== null) {
  console.log(`속도비: 적용만 ×${(b / a).toFixed(2)}, 롤아웃 ×${(d / c).toFixed(2)}`);
}
