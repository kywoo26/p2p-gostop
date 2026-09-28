// 쉬움 (spec AI-03): 가중 랜덤 + 기본 휴리스틱.
// 카드 가치는 따지지 않는다. 먹을 수 있는 수(바닥에 같은 월이 있는 카드·보너스·폭탄)를 조금 더 자주 고르는 가중 랜덤,
// 대상 선택은 광·띠·열끗·피 순의 단순 선호, 고/스톱은 동전 던지기에 가깝다. 사람이 이기기 쉬운 상대가 목표.
import { getCard, type Action, type PlayerView } from '@p2p-gostop/engine';
import type { DecisionContext, Policy } from '../types.ts';
import { firstOf, onlyAction } from './common.ts';

export interface EasyOptions {
  /** 먹을 수 있는 수의 가중치 (먹을 게 없는 수는 1) */
  readonly captureWeight?: number;
  /** 고를 부를 확률(고 2회 미만일 때) */
  readonly goRate?: number;
  /** 흔들기 수락 확률 */
  readonly shakeRate?: number;
}

const KIND_RANK: Readonly<Record<string, number>> = { gwang: 4, tti: 3, yeol: 2, pi: 1, bonus: 1 };

export class EasyPolicy implements Policy {
  readonly name = 'easy';
  private readonly captureWeight: number;
  private readonly goRate: number;
  private readonly shakeRate: number;

  constructor(options: EasyOptions = {}) {
    this.captureWeight = options.captureWeight ?? 2;
    this.goRate = options.goRate ?? 0.5;
    this.shakeRate = options.shakeRate ?? 0.5;
  }

  decide(view: PlayerView, legal: readonly Action[], ctx: DecisionContext): Action {
    const only = onlyAction(legal);
    if (only !== null) {
      return only;
    }
    const rng = ctx.rng;
    const first = firstOf(legal);
    switch (first.type) {
      case 'go':
      case 'stop': {
        const go = view.seats[view.viewer].goCount < 2 && rng.float() < this.goRate;
        return legal.find((a) => a.type === (go ? 'go' : 'stop')) ?? first;
      }
      case 'shake': {
        const accept = rng.float() < this.shakeRate;
        return legal.find((a) => a.type === 'shake' && a.accept === accept) ?? first;
      }
      case 'chooseTarget': {
        // 단순 선호: 광 > 띠 > 열끗 > 피 (같으면 무작위)
        const rank = (a: Action): number =>
          a.type === 'chooseTarget' ? (KIND_RANK[getCard(a.card).kind] ?? 0) : 0;
        const best = Math.max(...legal.map(rank));
        return rng.pick(legal.filter((a) => rank(a) === best));
      }
      case 'play':
      case 'bomb':
      case 'flipOnly':
        return this.weightedPlay(view, legal, ctx);
      default:
        return rng.pick(legal);
    }
  }

  /** 먹을 수 있는 수에 captureWeight, 나머지 1의 가중치로 뽑는다 */
  private weightedPlay(view: PlayerView, legal: readonly Action[], ctx: DecisionContext): Action {
    const months = new Set(view.floor.map((g) => g.month));
    const weightOf = (a: Action): number => {
      if (a.type === 'bomb') {
        return this.captureWeight;
      }
      if (a.type !== 'play') {
        return 1;
      }
      const month = getCard(a.card).month;
      return month === null || months.has(month) ? this.captureWeight : 1;
    };
    const weights = legal.map(weightOf);
    const total = weights.reduce((s, x) => s + x, 0);
    let r = ctx.rng.float() * total;
    for (const [i, action] of legal.entries()) {
      r -= weights[i] ?? 0;
      if (r < 0) {
        return action;
      }
    }
    return legal.at(-1) ?? firstOf(legal);
  }
}
