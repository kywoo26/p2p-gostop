import { PRESETS, newRound, playerView } from '@p2p-gostop/engine';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  EasyPolicy,
  GreedyPolicy,
  IsmctsPolicy,
  Rng,
  playRound,
  rollout,
  type PlayRoundOptions,
} from '../src/index.ts';

describe('롤아웃 적용 경로', () => {
  it('시드가 정해진 여러 판에서 applyUnchecked와 reduce의 상태·정산이 같다', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(PRESETS.standard, PRESETS.traditional, PRESETS.arcade),
        fc.integer({ min: 1, max: 2_000_000 }),
        fc.boolean(),
        (preset, seed, dealerZero) => {
          const start = newRound(preset, seed, { dealer: dealerZero ? 0 : 1 }).state;
          const unchecked = rollout(start, new Rng(seed * 71), DEFAULT_WEIGHTS);
          const checked = rollout(start, new Rng(seed * 71), DEFAULT_WEIGHTS, true);
          expect(unchecked).toEqual(checked);
        },
      ),
      { numRuns: 72, seed: 20260929 },
    );
  });

  it('한 판 진행기에서 두 경로의 액션·이벤트·최종 상태가 같다', () => {
    let pushed = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const options: PlayRoundOptions = {
        rules: PRESETS.arcade,
        seed,
        round: { dealer: seed % 2 === 0 ? 0 : 1 },
        policySeeds: [seed * 101, seed * 103] as const,
        balancePoints: [500, 700] as const,
      };
      const unchecked = playRound([new EasyPolicy(), new EasyPolicy()], options);
      const checked = playRound([new EasyPolicy(), new EasyPolicy()], {
        ...options,
        debugReduce: true,
      });
      expect(unchecked).toEqual(checked);
      pushed += unchecked.actions.some((action) => action.type === 'push') ? 1 : 0;
    }
    expect(pushed).toBeGreaterThan(0);
  });

  it('그리디·ISMCTS 탐색도 두 적용 경로에서 같은 수를 고른다', () => {
    const state = newRound(PRESETS.standard, 791, { dealer: 0 }).state;
    const view = playerView(state, 0);
    for (const make of [
      (debugReduce: boolean) => new GreedyPolicy({ samples: 4, debugReduce }),
      (debugReduce: boolean) =>
        new IsmctsPolicy({ maxIterations: 40, defaultTimeBudgetMs: null, debugReduce }),
    ]) {
      const fast = make(false).decide(view, view.legal, { rng: new Rng(55) });
      const checked = make(true).decide(view, view.legal, { rng: new Rng(55) });
      expect(fast).toEqual(checked);
    }
  });
});
