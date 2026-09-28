import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, PRESETS, WINNING_SCORE } from '../src/index.ts';

describe('규칙 프리셋 (FR-20, rules 12장)', () => {
  it('표준은 기본값: 보너스 3장·뺏기 켬·2장 폭탄 끔·피박 7장·나가리 상한 ×8', () => {
    expect(DEFAULT_RULES).toBe(PRESETS.standard);
    expect(DEFAULT_RULES).toMatchObject({
      bonusCards: 3,
      bonusSteal: true,
      twoCardBomb: 'off',
      piBakThreshold: 7,
      piBakZeroExempt: true,
      nagariCap: 8,
      chongtongPoints: 10,
      threePpeokPoints: 7,
    });
    expect(WINNING_SCORE).toBe(7);
  });

  it('정통은 뺏기·2장 폭탄·밀기·대박판 끔', () => {
    expect(PRESETS.traditional).toMatchObject({
      bonusSteal: false,
      twoCardBomb: 'off',
      push: false,
      jackpotRound: null,
    });
  });

  it('아케이드는 뺏기·밀기·대박판 켬', () => {
    expect(PRESETS.arcade).toMatchObject({
      bonusSteal: true,
      push: true,
      jackpotRound: { every: 5, multiplier: 2 },
    });
  });

  it('규칙 옵션은 22개 (12.7 토글 24개 중 로컬 설정 2개 제외)', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(Object.keys(preset)).toHaveLength(22);
    }
  });
});
