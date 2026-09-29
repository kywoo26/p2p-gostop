import { PRESETS, createScenario, playerView, reduce, type GameState } from '@p2p-gostop/engine';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  EasyPolicy,
  GreedyPolicy,
  IsmctsPolicy,
  Rng,
  analyzePush,
  easyPush,
} from '../src/index.ts';

function applied(state: GameState, action: Parameters<typeof reduce>[1]): GameState {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(result.message);
  return result.state;
}

function settled(pushes = 0): GameState {
  const rules = { ...PRESETS.arcade, jackpotRound: null };
  const state = createScenario({
    rules,
    pushes,
    hands: [
      [9, 17, 21, 25, 37, 13, 16, 20],
      [14, 18, 22, 26, 38, 15, 19, 23],
    ],
    floor: [10, 30],
    captured: [[0, 8, 28, 40, 1, 5], [3]],
  });
  return applied(applied(state, { type: 'play', seat: 0, card: 9 }), { type: 'stop', seat: 0 });
}

describe('밀기 결정 (AI-02)', () => {
  it('쉬움은 낮은 점수에서만 밀고 ×2 판에서는 받는다', () => {
    const view = playerView(settled(), 0);
    expect(view.legal).toEqual([{ type: 'push', seat: 0 }]);
    expect(easyPush(view)).toBe(true);
    expect(easyPush(playerView(settled(1), 0))).toBe(false);
    expect(playerView(settled(2), 0).legal).toEqual([]);
    expect(() => analyzePush(playerView(settled(2), 0), new Rng(1), 8, DEFAULT_WEIGHTS)).toThrow(
      '밀 수 없는 판',
    );
    expect(new EasyPolicy().decidePush(view, { rng: new Rng(1) })).toBe(true);
  });

  it('보통·상용급은 같은 시드·잔액에서 결정적이고 EV 비교 결과를 따른다', () => {
    const view = playerView(settled(), 0);
    const balances: [number, number] = [30, 300];
    const a = analyzePush(view, new Rng(91), 8, DEFAULT_WEIGHTS, balances);
    const b = analyzePush(view, new Rng(91), 8, DEFAULT_WEIGHTS, balances);
    expect(b).toEqual(a);
    expect(a.decision).toBe('take');
    expect(analyzePush(view, new Rng(91), 8, DEFAULT_WEIGHTS, [1, 10_000]).decision).toBe('push');
    expect(a.decision).toBe(a.pushEv > a.takeEv ? 'push' : 'take');
    const normal = new GreedyPolicy();
    expect(normal.decidePush(view, { rng: new Rng(91), balancePoints: balances })).toBe(
      a.decision === 'push',
    );
    const commercial = new IsmctsPolicy({ maxIterations: 20, defaultTimeBudgetMs: null });
    const choice = commercial.decidePush(view, { rng: new Rng(91), balancePoints: balances });
    expect(commercial.decidePush(view, { rng: new Rng(91), balancePoints: balances })).toBe(choice);
  });

  it('시간 초과 시 공통 표본 한 쌍까지 평가하고 주입 시계를 확인한다', () => {
    const view = playerView(settled(), 0);
    const one = analyzePush(view, new Rng(91), 1, DEFAULT_WEIGHTS);
    let calls = 0;
    const now = () => {
      calls++;
      return 100;
    };
    const limited = analyzePush(view, new Rng(91), 16, DEFAULT_WEIGHTS, undefined, false, {
      now,
      until: 100,
    });
    expect(limited).toEqual(one);
    expect(calls).toBe(1);

    for (const policy of [new GreedyPolicy(), new IsmctsPolicy({ maxIterations: 20 })]) {
      calls = 0;
      expect(policy.decidePush(view, { rng: new Rng(91), timeBudgetMs: 0, now })).toBe(
        one.decision === 'push',
      );
      expect(calls).toBe(2); // 시작 시각 + 첫 표본 쌍 뒤 기한 확인
    }
  });
});
