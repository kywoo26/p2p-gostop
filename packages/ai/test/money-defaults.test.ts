// MN-03·MN-04: 시작 잔액 기본값은 보기 좋은 단위, 파산 확률 목표 이하, 점당 금액에 선형 비례
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PER_POINT,
  MONEY_MODEL_BASIS,
  MONEY_STATS,
  PER_POINT_OPTIONS,
  START_BALANCE_TABLE,
  suggestedStartBalance,
} from '../src/index.ts';

const PRESETS = ['standard', 'traditional', 'arcade'] as const;
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

function isNice(value: number): boolean {
  const exp = 10 ** Math.floor(Math.log10(value));
  return NICE_STEPS.some((s) => Math.abs(s * exp - value) < 1e-6);
}

describe('머니 기본값 (MN-03·MN-04)', () => {
  it('점당 금액 선택지와 기본값', () => {
    expect(PER_POINT_OPTIONS).toEqual([50, 100, 200, 500, 1000]);
    expect(PER_POINT_OPTIONS).toContain(DEFAULT_PER_POINT);
    expect(MONEY_MODEL_BASIS.sessionLength).toBe(30);
  });

  it('프리셋마다 점당 100 기준 잔액은 보기 좋은 단위이고 파산 확률 ≤ 5%', () => {
    for (const preset of PRESETS) {
      const stats = MONEY_STATS[preset];
      expect(isNice(stats.startBalance)).toBe(true);
      expect(stats.bankruptcyRisk).toBeLessThanOrEqual(MONEY_MODEL_BASIS.bankruptcyTarget);
      expect(stats.perRoundPoints.p99).toBeGreaterThanOrEqual(stats.perRoundPoints.p95);
    }
    expect(MONEY_STATS.standard.basis).toBe('measured');
  });

  it('표 = 선형 비례 제안값', () => {
    for (const preset of PRESETS) {
      for (const perPoint of PER_POINT_OPTIONS) {
        expect(START_BALANCE_TABLE[preset][perPoint]).toBe(suggestedStartBalance(preset, perPoint));
      }
      expect(suggestedStartBalance(preset, 1000)).toBe(10 * suggestedStartBalance(preset, 100));
      expect(suggestedStartBalance(preset, 100)).toBe(MONEY_STATS[preset].startBalance);
    }
  });
});
