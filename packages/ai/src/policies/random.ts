// 무작위 정책: 기준선·속성 테스트용 (시드 결정적)
import type { Action, PlayerView } from '@p2p-gostop/engine';
import type { DecisionContext, Policy } from '../types.ts';
import { onlyAction } from './common.ts';

export class RandomPolicy implements Policy {
  readonly name = 'random';

  decide(_view: PlayerView, legal: readonly Action[], ctx: DecisionContext): Action {
    return onlyAction(legal) ?? ctx.rng.pick(legal);
  }
}
