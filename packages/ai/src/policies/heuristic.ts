// 휴리스틱 정책: ISMCTS 롤아웃·상대 모델과 같은 규칙을 그대로 정책으로 쓴다(조정·기준선용).
import type { Action, PlayerView } from '@p2p-gostop/engine';
import { determinize } from '../knowledge.ts';
import { heuristicAction } from '../rollout.ts';
import type { DecisionContext, Policy } from '../types.ts';
import { DEFAULT_WEIGHTS, type Weights } from '../weights.ts';
import { onlyAction } from './common.ts';

export class HeuristicPolicy implements Policy {
  readonly name = 'heuristic';
  private readonly weights: Weights;
  private readonly noise: number;

  constructor(options: { readonly weights?: Weights; readonly noise?: number } = {}) {
    this.weights = options.weights ?? DEFAULT_WEIGHTS;
    this.noise = options.noise ?? 0;
  }

  decide(view: PlayerView, legal: readonly Action[], ctx: DecisionContext): Action {
    const only = onlyAction(legal);
    if (only !== null) {
      return only;
    }
    if (legal[0]?.type === 'pickFirst') {
      return ctx.rng.pick(legal);
    }
    const det = determinize(view, ctx.rng);
    return heuristicAction(det, view.viewer, legal, ctx.rng, this.weights, this.noise);
  }
}
