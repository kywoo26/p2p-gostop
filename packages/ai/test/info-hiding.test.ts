// spec AI-01 정보 은닉: 정책은 playerView 결과와 합법 수만 받는다.
// (1) 타입: Policy.decide의 입력은 PlayerView이고, PlayerView에는 더미가 없으며 좌석 손패는 null일 수 있다.
// (2) 런타임: 뷰에 더미·상대 손패 내용이 없다.
// (3) 불변성: 상대 손패·더미를 다시 섞어도(숨은 정보만 변경) 뷰와 모든 정책의 결정이 똑같다.
//     정책이 어떤 경로로든 숨은 정보를 읽는다면 이 속성이 깨진다.
import { playerView, type CardId, type PlayerView, type SeatView } from '@p2p-gostop/engine';
import * as fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  EasyPolicy,
  GreedyPolicy,
  HeuristicPolicy,
  IsmctsPolicy,
  RandomPolicy,
  Rng,
  actingSeat,
  evaluate,
  type DecisionContext,
  type Policy,
} from '../src/index.ts';
import { randomState, resampleHidden, rulesFor } from './helpers.ts';

describe('정보 은닉 (AI-01)', () => {
  it('타입: 정책 입력은 PlayerView뿐이고 PlayerView에는 더미가 없다', () => {
    expectTypeOf<Parameters<Policy['decide']>[0]>().toEqualTypeOf<PlayerView>();
    expectTypeOf<PlayerView>().not.toHaveProperty('deck');
    expectTypeOf<PlayerView>().not.toHaveProperty('rng');
    expectTypeOf<SeatView>().toHaveProperty('hand').toEqualTypeOf<readonly CardId[] | null>();
    expectTypeOf<DecisionContext>().not.toHaveProperty('state');
  });

  it('런타임: 뷰에 더미·상대 손패 내용이 없다', () => {
    const state = randomState(rulesFor('standard', 0), 7, 6);
    const seat = actingSeat(state) ?? 0;
    const view = playerView(state, seat);
    expect(Object.keys(view)).not.toContain('deck');
    expect(view.seats[seat === 0 ? 1 : 0].hand).toBeNull();
    expect(view.seats[seat].hand).toEqual(state.seats[seat].hand);
    expect(view.deckCount).toBe(state.deck.length);
  });

  const policies: readonly (() => Policy)[] = [
    () => new RandomPolicy(),
    () => new EasyPolicy(),
    () => new HeuristicPolicy(),
    () => new GreedyPolicy({ samples: 4 }),
    () => new IsmctsPolicy({ maxIterations: 60, defaultTimeBudgetMs: null }),
  ];

  it('숨은 정보를 다시 섞어도 뷰·평가·모든 정책의 결정이 같다', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (seed, steps, variant, shuffleSeed) => {
          const state = randomState(rulesFor('standard', variant), seed, steps);
          const seat = actingSeat(state);
          if (seat === null || state.pending?.kind === 'pickFirst') {
            return;
          }
          const other = resampleHidden(state, seat, shuffleSeed);
          const a = playerView(state, seat);
          const b = playerView(other, seat);
          expect(b).toEqual(a);
          expect(evaluate(b, seat)).toBe(evaluate(a, seat));
          for (const make of policies) {
            const x = make().decide(a, a.legal, { rng: new Rng(seed) });
            const y = make().decide(b, b.legal, { rng: new Rng(seed) });
            expect(y).toEqual(x);
          }
        },
      ),
      { numRuns: 60, seed: 20260928 },
    );
  });
});
