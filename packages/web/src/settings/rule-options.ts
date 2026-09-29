// FR-21: rules-commercial §12.7의 세션 규칙 22행과 §12의 추가 규칙 3행.
import { PRESETS, type PresetId, type RuleOptions } from '@p2p-gostop/engine';

export interface RuleChoice {
  readonly value: unknown;
  readonly label: string;
  readonly disabled?: boolean;
}
export interface RuleField {
  readonly key: keyof RuleOptions;
  readonly label: string;
  readonly choices: readonly RuleChoice[];
  readonly note?: string;
  readonly hidden?: boolean;
}
const choice = (value: unknown, label: string, disabled = false): RuleChoice => ({
  value,
  label,
  disabled,
});
const yesNo = [choice(true, '켬'), choice(false, '끔')];

export const RULE_FIELDS: readonly RuleField[] = [
  {
    key: 'bonusCards',
    label: '보너스 카드 구성',
    choices: [choice(0, '0장'), choice(2, '2장 (2피·3피)'), choice(3, '3장 (2피·2피·3피)')],
  },
  { key: 'bonusSteal', label: '보너스 뺏기', choices: yesNo },
  { key: 'dealFloorBonusSteal', label: '분배 시 바닥 보너스 뺏기', choices: yesNo, hidden: true },
  {
    key: 'twoCardBomb',
    label: '2장 폭탄',
    choices: [
      choice('off', '끔'),
      choice('noMultiplier', '켬 (배수 없음)'),
      choice('double', '켬 (×2)'),
    ],
  },
  {
    key: 'ppeokPayout',
    label: '첫뻑·연뻑·3연뻑 즉시 정산',
    choices: [
      choice('points', '7/14/21점'),
      choice('baseMultiple', '기본점수 ×1/2/3'),
      choice('off', '끔'),
    ],
    note: '기본점수는 현재 7점이므로 앞의 두 선택은 같은 금액입니다.',
  },
  { key: 'firstTtadakPayout', label: '첫따닥 즉시 정산 (7점)', choices: yesNo },
  { key: 'threePpeokPoints', label: '3뻑 점수', choices: [choice(7, '7점'), choice(10, '10점')] },
  { key: 'chongtongPoints', label: '총통 점수', choices: [choice(7, '7점'), choice(10, '10점')] },
  { key: 'chongtongContinue', label: '총통 계속하기', choices: yesNo },
  {
    key: 'bonusChongtong',
    label: '보너스로 만든 총통',
    choices: [choice('never', '불인정'), choice('firstTurn', '첫 턴만'), choice('always', '항상')],
  },
  {
    key: 'floorChongtong',
    label: '바닥 총통',
    choices: [
      choice('nagari', '나가리'),
      choice('dealerWins', '선 승리'),
      choice('redeal', '재분배'),
    ],
  },
  {
    key: 'bothChongtong',
    label: '양측 총통',
    choices: [choice('nagari', '나가리'), choice('dealerWins', '선 승리')],
  },
  { key: 'piBakThreshold', label: '피박 기준', choices: [choice(6, '6장'), choice(7, '7장')] },
  { key: 'piBakZeroExempt', label: '피박 0장 예외', choices: yesNo },
  { key: 'lastTurnPpeokSteal', label: '마지막 턴 뻑먹기 뺏기', choices: yesNo },
  {
    key: 'nagariCap',
    label: '나가리 배수 상한',
    choices: [choice(null, '없음'), choice(4, '×4'), choice(8, '×8'), choice(16, '×16')],
  },
  {
    key: 'goScoring',
    label: '고 배수 방식',
    choices: [
      choice('plusNAndDouble', '+n, 3고부터 ×2^(n−2)'),
      choice('doubleOnly', '3고부터 배수만'),
    ],
  },
  {
    key: 'gukjin',
    label: '국진 처리',
    choices: [choice('auto', '자동 최적'), choice('ask', '매번 묻기')],
  },
  { key: 'push', label: '밀기', choices: yesNo, note: '판 종료 뒤 최대 2회 연속 밀 수 있습니다.' },
  {
    key: 'jackpotRound',
    label: '대박판',
    choices: [choice(null, '끔'), choice({ every: 5, multiplier: 2 }, '5판마다 ×2')],
  },
  {
    key: 'missions',
    label: '미션',
    choices: [
      choice('off', '끔'),
      choice('ppangppang', '미션 유형 1', true),
      choice('jokbo', '족보형', true),
    ],
    note: '엔진 미구현: 미션은 선택할 수 없습니다.',
  },
  {
    key: 'firstDealer',
    label: '선 결정',
    choices: [
      choice('pickCard', '패 고르기'),
      choice('timeOfDay', '시각 기준'),
      choice('rockPaperScissors', '가위바위보', true),
    ],
    note: '가위바위보는 엔진 미구현이며 패 고르기로 대체됩니다.',
  },
  { key: 'naturalPpeokSteal', label: '자연뻑 피 뺏기', choices: yesNo },
  { key: 'hudang', label: '허당', choices: yesNo },
  { key: 'limitedLiability', label: '승자 보유액 상한', choices: yesNo },
];

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 저장값은 각 필드의 허용 목록에 있는 값만 받아 세션에 전달한다. */
export function normalizeRules(raw: unknown, preset: PresetId): RuleOptions | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const rules: Record<string, unknown> = { ...PRESETS[preset] };
  for (const field of RULE_FIELDS) {
    const selected = field.choices.find(
      (item) => !item.disabled && same(item.value, source[field.key]),
    );
    if (selected === undefined) return null;
    rules[field.key] = selected.value;
  }
  return rules as unknown as RuleOptions;
}

export function presetOfRules(rules: RuleOptions): PresetId | 'custom' {
  for (const id of ['standard', 'traditional', 'arcade'] as const) {
    if (RULE_FIELDS.every(({ key }) => same(rules[key], PRESETS[id][key]))) return id;
  }
  return 'custom';
}
