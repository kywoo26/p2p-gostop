// 정책 공통 속성: 합법 수만 낸다(fast-check, 무작위 상태·프롬프트 종류 전체), 같은 시드면 같은 수(AI-08).
import { PRESETS, playerView, sameAction, type PresetId } from '@p2p-gostop/engine';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES,
  EasyPolicy,
  GreedyPolicy,
  HeuristicPolicy,
  IsmctsPolicy,
  RandomPolicy,
  Rng,
  actingSeat,
  createPolicy,
  playRound,
  type Policy,
} from '../src/index.ts';
import { randomState, rulesFor } from './helpers.ts';

const makers: readonly [string, () => Policy][] = [
  ['random', () => new RandomPolicy()],
  ['easy', () => new EasyPolicy()],
  ['heuristic', () => new HeuristicPolicy()],
  ['greedy', () => new GreedyPolicy({ samples: 3 })],
  ['ismcts', () => new IsmctsPolicy({ maxIterations: 40, defaultTimeBudgetMs: null })],
];

const presetArb = fc.constantFrom<PresetId>('standard', 'traditional', 'arcade');

describe('정책 속성', () => {
  it('모든 정책은 모든 프롬프트 종류에서 합법 수만 낸다', () => {
    const kinds = new Set<string>();
    fc.assert(
      fc.property(
        presetArb,
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 1, max: 2_000_000 }),
        fc.integer({ min: 0, max: 45 }),
        (preset, variant, seed, steps) => {
          const state = randomState(rulesFor(preset, variant), seed, steps);
          const seat = actingSeat(state);
          if (seat === null) {
            return;
          }
          const view = playerView(state, seat);
          kinds.add(view.legal[0]?.type ?? 'none');
          for (const [, make] of makers) {
            const action = make().decide(view, view.legal, { rng: new Rng(seed) });
            expect(view.legal.some((a) => sameAction(a, action))).toBe(true);
          }
        },
      ),
      { numRuns: 150, seed: 42 },
    );
    // 표본이 카드 내기·선 고르기 외의 프롬프트도 지났는지 (대상 선택 등)
    expect(kinds.has('play')).toBe(true);
    expect(kinds.size).toBeGreaterThan(2);
  });

  it('같은 시드·같은 뷰면 같은 수 (AI-08)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const state = randomState(PRESETS.standard, seed * 97, seed * 3);
      const seat = actingSeat(state);
      if (seat === null) {
        continue;
      }
      const view = playerView(state, seat);
      for (const [, make] of makers) {
        const a = make().decide(view, view.legal, { rng: new Rng(seed) });
        const b = make().decide(view, view.legal, { rng: new Rng(seed) });
        expect(b).toEqual(a);
      }
    }
  });

  it('한 판 전체도 시드가 같으면 액션·이벤트가 같다 (모든 난이도, 좌석 교대)', () => {
    for (const difficulty of DIFFICULTIES) {
      const policy = (): Policy =>
        createPolicy(difficulty, { ismcts: { maxIterations: 30, defaultTimeBudgetMs: null } });
      const run = () =>
        playRound([policy(), new EasyPolicy()], {
          rules: PRESETS.standard,
          seed: 11,
          round: { dealer: 1 },
          policySeeds: [3, 4],
        });
      const a = run();
      const b = run();
      expect(b.actions).toEqual(a.actions);
      expect(b.events).toEqual(a.events);
      expect(a.state.phase).toBe('end');
    }
  });

  it('선 고르기(첫 판)부터 끝까지 둘 수 있다', () => {
    const played = playRound([new GreedyPolicy({ samples: 2 }), new RandomPolicy()], {
      rules: PRESETS.arcade,
      seed: 5,
      policySeeds: [1, 2],
    });
    expect(played.state.phase).toBe('end');
    expect(played.actions[0]?.type).toBe('pickFirst');
  });

  it('합법 수가 아닌 수를 내는 정책은 진행기가 거부한다', () => {
    const cheater: Policy = {
      name: 'cheater',
      decide: (view) => ({ type: 'stop', seat: view.viewer }),
    };
    expect(() =>
      playRound([cheater, new RandomPolicy()], {
        rules: PRESETS.standard,
        seed: 1,
        round: { dealer: 0 },
        policySeeds: [1, 2],
      }),
    ).toThrow('합법 수가 아닌');
  });
});
