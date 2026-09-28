// 난이도 → 정책 (spec AI-03)
import { EasyPolicy } from './policies/easy.ts';
import { GreedyPolicy } from './policies/greedy.ts';
import { IsmctsPolicy, type IsmctsOptions } from './policies/ismcts.ts';
import type { Difficulty, Policy } from './types.ts';
import type { Weights } from './weights.ts';

export interface PolicyOptions {
  readonly weights?: Weights;
  /** 상용급 탐색 옵션 */
  readonly ismcts?: IsmctsOptions;
}

export function createPolicy(difficulty: Difficulty, options: PolicyOptions = {}): Policy {
  const weights = options.weights === undefined ? {} : { weights: options.weights };
  if (difficulty === 'easy') {
    return new EasyPolicy();
  }
  if (difficulty === 'normal') {
    return new GreedyPolicy(weights);
  }
  return new IsmctsPolicy({ ...weights, ...options.ismcts });
}
