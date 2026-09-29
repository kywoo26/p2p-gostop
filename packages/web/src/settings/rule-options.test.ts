import { PRESETS } from '@p2p-gostop/engine';
import { expect, test } from 'vitest';
import { presetOfRules, RULE_FIELDS, normalizeRules } from './rule-options.ts';
import { effectiveRules, normalizeSettings } from './settings.svelte.ts';

test('FR-21: §12.7 세션 규칙 22행을 한 번씩 매핑하고 기기 로컬 2행은 제외한다', () => {
  const commercialKeys = [
    'bonusCards',
    'bonusSteal',
    'dealFloorBonusSteal',
    'twoCardBomb',
    'ppeokPayout',
    'firstTtadakPayout',
    'threePpeokPoints',
    'chongtongPoints',
    'chongtongContinue',
    'bonusChongtong',
    'floorChongtong',
    'bothChongtong',
    'piBakThreshold',
    'piBakZeroExempt',
    'lastTurnPpeokSteal',
    'nagariCap',
    'goScoring',
    'gukjin',
    'push',
    'jackpotRound',
    'missions',
    'firstDealer',
  ];
  expect(RULE_FIELDS.slice(0, 22).map((field) => field.key)).toEqual(commercialKeys);
  expect(new Set(RULE_FIELDS.map((field) => field.key)).size).toBe(25);
  expect(RULE_FIELDS.find((field) => field.key === 'dealFloorBonusSteal')?.hidden).toBe(true);
  expect(
    RULE_FIELDS.find((field) => field.key === 'missions')?.choices.filter(
      (choice) => choice.disabled,
    ),
  ).toHaveLength(2);
  expect(RULE_FIELDS.find((field) => field.key === 'firstDealer')?.choices.at(-1)?.disabled).toBe(
    true,
  );
});

test('FR-21: 저장된 불법 규칙은 버리고 프리셋과 로컬 힌트는 분리한다', () => {
  const fresh = normalizeSettings({});
  expect(fresh.hintLevel).toBe('basic');
  expect(fresh.effectIntensity).toBe('strong');
  expect(fresh.sound).toBe(true);
  expect(fresh.vibrate).toBe(true);
  expect(fresh.confirmDelay).toBe(false);
  expect(fresh.autoPlay).toBe(false);
  expect(
    normalizeSettings({
      sound: false,
      vibration: false,
      hintLevel: 'off',
      effectIntensity: 'subtle',
      confirmDelay: true,
    }),
  ).toMatchObject({
    sound: false,
    vibrate: false,
    hintLevel: 'off',
    effectIntensity: 'subtle',
    confirmDelay: true,
  });
  expect(normalizeSettings({ vibrate: true, vibration: false }).vibrate).toBe(true);
  expect(effectiveRules(fresh)).toEqual(PRESETS.standard);
  expect(normalizeRules({ ...PRESETS.standard, missions: 'ppangppang' }, 'standard')).toBeNull();
  expect(
    normalizeRules({ ...PRESETS.standard, firstDealer: 'rockPaperScissors' }, 'standard'),
  ).toBeNull();
  expect(presetOfRules({ ...PRESETS.standard, bonusCards: 2 })).toBe('custom');
  const changed = normalizeSettings({
    ...fresh,
    customRules: { ...PRESETS.standard, bonusCards: 2 },
    hintLevel: 'detail',
  });
  expect(effectiveRules(changed).bonusCards).toBe(2);
  expect(effectiveRules(changed).gukjin).toBe('auto');
  expect(changed.hintLevel).toBe('detail');
});
