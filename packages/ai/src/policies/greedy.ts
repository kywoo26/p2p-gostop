// 보통 (spec AI-03): 평가 함수 그리디 + 1수 앞 시뮬레이션.
// 각 합법 수를 K개의 결정화 사본에 적용하고(뒤집기 결과가 사본마다 달라 남은 카드 분포에 대한 평균이 된다),
// 이어지는 자기 프롬프트(대상 선택·국진·고/스톱)는 휴리스틱으로 마저 처리한 뒤 Evaluator 평균이 가장 큰 수를 고른다.
import {
  legalActions,
  type Action,
  type GameState,
  type PlayerView,
  type Seat,
} from '@p2p-gostop/engine';
import { evaluateState } from '../evaluator.ts';
import { actingSeat, determinize } from '../knowledge.ts';
import { heuristicAction, ruleGoStop, step } from '../rollout.ts';
import { analyzePush } from '../push.ts';
import type { Rng } from '../rng.ts';
import type { DecisionContext, Policy } from '../types.ts';
import { DEFAULT_WEIGHTS, type Weights } from '../weights.ts';
import { firstOf, onlyAction } from './common.ts';

export interface GreedyOptions {
  /** 뒤집기 표본 수 K (결정화 사본 수) */
  readonly samples?: number;
  readonly weights?: Weights;
  readonly debugReduce?: boolean;
}

/** 같은 턴 안의 자기 후속 프롬프트를 휴리스틱으로 처리한다(카드 내기 차례가 다시 오면 멈춤). */
function finishOwnPrompts(
  state: GameState,
  seat: Seat,
  rng: Rng,
  w: Weights,
  debugReduce: boolean,
): GameState {
  let s = state;
  for (let i = 0; i < 8 && s.phase !== 'end' && actingSeat(s) === seat; i++) {
    const kind = s.pending?.kind;
    if (kind === 'play' || kind === undefined) {
      break;
    }
    s = step(s, heuristicAction(s, seat, legalActions(s, seat), rng, w, 0), debugReduce);
  }
  return s;
}

export class GreedyPolicy implements Policy {
  readonly name = 'greedy';
  private readonly samples: number;
  private readonly weights: Weights;
  private readonly debugReduce: boolean;

  constructor(options: GreedyOptions = {}) {
    this.samples = options.samples ?? 8;
    this.weights = options.weights ?? DEFAULT_WEIGHTS;
    this.debugReduce = options.debugReduce ?? false;
  }

  decidePush(view: PlayerView, ctx: DecisionContext): boolean {
    return (
      analyzePush(view, ctx.rng, 8, this.weights, ctx.balancePoints, this.debugReduce).decision ===
      'push'
    );
  }

  decide(view: PlayerView, legal: readonly Action[], ctx: DecisionContext): Action {
    const only = onlyAction(legal);
    if (only !== null) {
      return only;
    }
    const rng = ctx.rng;
    const me = view.viewer;
    const w = this.weights;
    const first = firstOf(legal);
    if (first.type === 'pickFirst') {
      return rng.pick(legal);
    }
    if (first.type === 'go' || first.type === 'stop') {
      const choice = ruleGoStop(determinize(view, rng), me, w);
      return legal.find((a) => a.type === choice) ?? first;
    }
    // 공통 난수: 모든 후보를 같은 결정화 사본들로 비교한다.
    const dets = Array.from({ length: this.samples }, () => determinize(view, rng));
    let best: Action = first;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const action of legal) {
      let total = 0;
      for (const det of dets) {
        const after = finishOwnPrompts(
          step(det, action, this.debugReduce),
          me,
          rng,
          w,
          this.debugReduce,
        );
        total += evaluateState(after, me, w);
      }
      if (total > bestValue) {
        bestValue = total;
        best = action;
      }
    }
    return best;
  }
}
