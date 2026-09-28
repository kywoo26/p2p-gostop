// CPU 결정 한 번 (spec AI-01·AI-05·AI-08). Web Worker(src/workers/ai.worker.ts)와 인라인 대체 경로가 같이 쓴다.
// 정책은 playerView 결과(뷰)와 합법 수만 받는다: 전체 상태를 넘기지 않으므로 더미·상대 손패를 볼 수 없다.
import { createPolicy, Rng, type Difficulty, type Policy } from '@p2p-gostop/ai';
import type { Action, PlayerView } from '@p2p-gostop/engine';

export interface AiRequest {
  readonly difficulty: Difficulty;
  /** CPU 좌석의 뷰 (playerView(state, seat)) */
  readonly view: PlayerView;
  /** 결정 난수 시드 (같은 시드·같은 뷰면 같은 수, AI-08) */
  readonly seed: number;
  /** 시간 제한 ms (넘으면 그때까지의 최선 수, AI-05) */
  readonly timeBudgetMs: number;
}

export interface AiResult {
  readonly action: Action;
  /** 결정에 걸린 시간 ms (진단 로그) */
  readonly ms: number;
}

const policies = new Map<Difficulty, Policy>();

function policyFor(difficulty: Difficulty): Policy {
  let policy = policies.get(difficulty);
  if (policy === undefined) {
    policy = createPolicy(difficulty);
    policies.set(difficulty, policy);
  }
  return policy;
}

export function decide(req: AiRequest): AiResult {
  const t0 = performance.now();
  const action = policyFor(req.difficulty).decide(req.view, req.view.legal, {
    rng: new Rng(req.seed),
    timeBudgetMs: req.timeBudgetMs,
  });
  return { action, ms: performance.now() - t0 };
}
