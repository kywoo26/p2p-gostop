// 규칙 옵션과 프리셋 (spec 4.2, FR-20·FR-21, rules-commercial.md 12.7).
// 기본값의 근거는 rules-commercial.md 12장뿐이다. 12.7의 24개 토글 중 22개는 판의 결과를 바꾸는 규칙(RuleOptions),
// 진행 속도·자동치기 2개는 기기별 로컬 설정(LocalPlayOptions, FR-24)으로 나눈다.
// 여기에 12.1 R7("뺏기 없음" 토글), 12.4 E14(허당, 기본 끔), 12.6 M2(승자 보유액 상한 선택)의 3개를 더해 25개다.
//
// 구현 상태 (M1): push(밀기)·missions(미션)·firstDealer='rockPaperScissors'는 타입만 있고 엔진이 무시한다(P2, M6).
// 가위바위보는 패 고르기로 대체된다. 목록은 UNIMPLEMENTED_RULES.

export interface JackpotRoundOption {
  /** N판마다 */
  readonly every: number;
  /** ×k */
  readonly multiplier: number;
}

export interface RuleOptions {
  /** 보너스 카드 구성: 0장 / 2장(2피·3피) / 3장(2피·2피·3피) — R1 */
  readonly bonusCards: 0 | 2 | 3;
  /** 보너스 뺏기 — B3 */
  readonly bonusSteal: boolean;
  /** 분배 시 바닥 보너스로 뺏기 — B3(d) */
  readonly dealFloorBonusSteal: boolean;
  /** 2장 폭탄: 끔 / 켬(배수 없음) / 켬(×2, 피망식) — E10 */
  readonly twoCardBomb: 'off' | 'noMultiplier' | 'double';
  /** 첫뻑·연뻑·3연뻑 즉시 정산: 7/14/21점 / 기본점수×1/2/3 / 끔 — E4 */
  readonly ppeokPayout: 'points' | 'baseMultiple' | 'off';
  /** 첫따닥 즉시 정산(7점) — E6 */
  readonly firstTtadakPayout: boolean;
  /** 3뻑(통산) 점수 — E5 */
  readonly threePpeokPoints: 7 | 10;
  /** 총통 점수 — E12 */
  readonly chongtongPoints: 7 | 10;
  /** 총통 계속하기 허용 — E12 */
  readonly chongtongContinue: boolean;
  /** 보너스로 만든 총통: 불인정 / 첫 턴만 / 항상 — B5 */
  readonly bonusChongtong: 'never' | 'firstTurn' | 'always';
  /** 바닥 총통: 나가리 / 선 승리 / 재분배(배수 없음) — R6 */
  readonly floorChongtong: 'nagari' | 'dealerWins' | 'redeal';
  /** 양측 총통: 나가리 / 선 승리 — E13 */
  readonly bothChongtong: 'nagari' | 'dealerWins';
  /** 피박 기준: 패자 피 이 장수 이하면 피박 — G6 */
  readonly piBakThreshold: 6 | 7;
  /** 피박 0장 예외 — G6 */
  readonly piBakZeroExempt: boolean;
  /** 마지막 턴 뻑먹기 피 뺏기 — E3 */
  readonly lastTurnPpeokSteal: boolean;
  /** 나가리 배수 상한 (null = 없음) — G9 */
  readonly nagariCap: 4 | 8 | 16 | null;
  /** 고 배수 방식: +n & 3고부터 ×2^(n-2) / 3고부터 배수만 — G3 */
  readonly goScoring: 'plusNAndDouble' | 'doubleOnly';
  /** 국진 처리: 자동 최적(피망식) / 매번 묻기 — S5 */
  readonly gukjin: 'auto' | 'ask';
  /** 밀기(최대 2회 연속, ×4) */
  readonly push: boolean;
  /** 대박판 (null = 끔) */
  readonly jackpotRound: JackpotRoundOption | null;
  /** 미션 */
  readonly missions: 'off' | 'ppangppang' | 'jokbo';
  /** 선 결정: 패 고르기(높은 월) / 밤일낮장 / 가위바위보 — R4 */
  readonly firstDealer: 'pickCard' | 'timeOfDay' | 'rockPaperScissors';
  /** 바닥 같은 월 3장(자연뻑)을 먹을 때 피 1장 뺏기 — R7 ("뺏기 없음" 토글) */
  readonly naturalPpeokSteal: boolean;
  /** 허당: 연속 5턴 아무것도 못 먹으면 7점으로 끝 — E14 (기본 끔, 한게임 구 맞고 레거시) */
  readonly hudang: boolean;
  /** 획득 상한을 승자 보유액까지로도 제한(유한책임제) — M2 선택지. 기본은 패자 잔액까지만 */
  readonly limitedLiability: boolean;
}

/** 타입만 있고 M1 엔진이 무시하는 옵션 (P2, plan.md M6). */
export const UNIMPLEMENTED_RULES: readonly string[] = Object.freeze([
  'push',
  'missions',
  'firstDealer:rockPaperScissors',
]);

/** 기기별 로컬 설정 (FR-23, FR-24). 엔진 결과에 영향 없음. */
export interface LocalPlayOptions {
  /** 진행 속도: 보통(×1.5) / 빠름(기준) / 매우 빠름(×0.6) — spec 6.4 */
  readonly speed: 'normal' | 'fast' | 'veryFast';
  readonly autoPlay: boolean;
}

export const DEFAULT_LOCAL_PLAY_OPTIONS: LocalPlayOptions = Object.freeze({
  speed: 'fast',
  autoPlay: false,
});

/** 나는 점수 (G1). 토글 아님. */
export const WINNING_SCORE = 7;

/** 즉시 정산·허당의 단위 점수 (E4·E6·E14: 7점 단위) */
export const INSTANT_UNIT_POINTS = 7;

export type PresetId = 'standard' | 'traditional' | 'arcade';

/** 표준: rules-commercial.md 12장 권장 기본값 그대로 (FR-20). */
const STANDARD: RuleOptions = Object.freeze({
  bonusCards: 3,
  bonusSteal: true,
  dealFloorBonusSteal: false,
  twoCardBomb: 'off',
  ppeokPayout: 'points',
  firstTtadakPayout: true,
  threePpeokPoints: 7,
  chongtongPoints: 10,
  chongtongContinue: true,
  bonusChongtong: 'firstTurn',
  floorChongtong: 'nagari',
  bothChongtong: 'nagari',
  piBakThreshold: 7,
  piBakZeroExempt: true,
  lastTurnPpeokSteal: false,
  nagariCap: 8,
  goScoring: 'plusNAndDouble',
  gukjin: 'auto',
  push: false,
  jackpotRound: null,
  missions: 'off',
  firstDealer: 'pickCard',
  naturalPpeokSteal: true,
  hudang: false,
  limitedLiability: false,
});

/** 정통: 보너스 뺏기 끔, 2장 폭탄 끔, 밀기·대박판 끔 (FR-20). */
const TRADITIONAL: RuleOptions = Object.freeze({
  ...STANDARD,
  bonusSteal: false,
  twoCardBomb: 'off',
  push: false,
  jackpotRound: null,
});

/**
 * 아케이드: 뺏기 켬, 대박판 켬, 밀기 켬, 미션은 P2 (FR-20).
 * 대박판 주기·배수는 spec 11.2 Q5 잠정값(5판마다 ×2).
 * TODO(M6): 미션 구현 후 missions 기본값 결정.
 */
const ARCADE: RuleOptions = Object.freeze({
  ...STANDARD,
  bonusSteal: true,
  push: true,
  jackpotRound: Object.freeze({ every: 5, multiplier: 2 }),
  missions: 'off',
});

export const PRESETS: Readonly<Record<PresetId, RuleOptions>> = Object.freeze({
  standard: STANDARD,
  traditional: TRADITIONAL,
  arcade: ARCADE,
});

export const DEFAULT_RULES: RuleOptions = STANDARD;
