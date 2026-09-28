// 카드 카탈로그 (plan.md 1.4, code-refs.md 6.2, rules-commercial.md 1.1·12.1).
// 상태에는 카드 ID(0~50 정수)만 두고, 카드의 성질은 이 불변 카탈로그에서 조회한다.

/** 카드 ID. 0~47은 기본 48장(월 순서), 48~50은 보너스 카드. */
export type CardId = number;

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** 카드 종류. 광 / 열끗 / 띠 / 피 / 보너스 */
export type CardKind = 'gwang' | 'yeol' | 'tti' | 'pi' | 'bonus';

/** 띠 종류. 홍단 / 청단 / 초단 / 비띠(12월, 단 불성립) */
export type Ribbon = 'hong' | 'cheong' | 'cho' | 'bi';

export interface BonusInfo {
  /** 획득 시 상대 피 1장 뺏기 (rules 12.2 B3). 규칙 옵션 `bonusSteal`로 끌 수 있다. */
  readonly stealsOnGain: boolean;
}

export interface Card {
  readonly id: CardId;
  /** 월. 보너스 카드는 월이 없다(null). */
  readonly month: Month | null;
  readonly kind: CardKind;
  /**
   * 피로 셀 때의 가치. 일반피 1, 쌍피(11·12월) 2, 보너스 2피 2·3피 3.
   * 국진(9월 열끗)은 쌍피로 옮겼을 때의 가치 2를 가진다(rules 12.3 S5). 그 밖의 광·열끗·띠는 0.
   */
  readonly piValue: 0 | 1 | 2 | 3;
  /** 띠 카드만 값이 있다. */
  readonly ribbon: Ribbon | null;
  /** 고도리 새(2·4·8월 열끗) */
  readonly isGodori: boolean;
  /** 비광(12월 광). 3광 계산에서 비삼광으로 처리 (rules 12.3 S1) */
  readonly isBiGwang: boolean;
  /** 국진(9월 열끗). 열끗/쌍피 선택 가능 */
  readonly isGukjin: boolean;
  /** 보너스 카드만 값이 있다 */
  readonly bonus: BonusInfo | null;
}

type CardSpec = Omit<Card, 'id' | 'month' | 'bonus' | 'isGodori' | 'isBiGwang' | 'isGukjin'> &
  Partial<Pick<Card, 'isGodori' | 'isBiGwang' | 'isGukjin'>>;

const gwang: CardSpec = { kind: 'gwang', piValue: 0, ribbon: null };
const yeol: CardSpec = { kind: 'yeol', piValue: 0, ribbon: null };
const godori: CardSpec = { ...yeol, isGodori: true };
const tti = (ribbon: Ribbon): CardSpec => ({ kind: 'tti', piValue: 0, ribbon });
const pi: CardSpec = { kind: 'pi', piValue: 1, ribbon: null };
const ssangpi: CardSpec = { kind: 'pi', piValue: 2, ribbon: null };

/** 월별 4장 (rules-commercial.md 1.1 표). 각 월 안의 순서는 광 → 열끗 → 띠 → 피. */
const MONTHS: readonly (readonly [Month, readonly [CardSpec, CardSpec, CardSpec, CardSpec]])[] = [
  [1, [gwang, tti('hong'), pi, pi]], // 송학
  [2, [godori, tti('hong'), pi, pi]], // 매조
  [3, [gwang, tti('hong'), pi, pi]], // 벚꽃
  [4, [godori, tti('cho'), pi, pi]], // 흑싸리
  [5, [yeol, tti('cho'), pi, pi]], // 난초
  [6, [yeol, tti('cheong'), pi, pi]], // 모란
  [7, [yeol, tti('cho'), pi, pi]], // 홍싸리
  [8, [gwang, godori, pi, pi]], // 공산
  [9, [{ ...yeol, piValue: 2, isGukjin: true }, tti('cheong'), pi, pi]], // 국준
  [10, [yeol, tti('cheong'), pi, pi]], // 단풍
  [11, [gwang, pi, pi, ssangpi]], // 오동
  [12, [{ ...gwang, isBiGwang: true }, yeol, tti('bi'), ssangpi]], // 비
];

/** 보너스 카드 3장: 2피, 2피, 3피 (rules 12.1 R1). */
const BONUS_PI_VALUES = [2, 2, 3] as const;

function buildCatalog(): readonly Card[] {
  const cards: Card[] = [];
  for (const [month, specs] of MONTHS) {
    for (const spec of specs) {
      cards.push(
        Object.freeze({
          id: cards.length,
          month,
          kind: spec.kind,
          piValue: spec.piValue,
          ribbon: spec.ribbon,
          isGodori: spec.isGodori ?? false,
          isBiGwang: spec.isBiGwang ?? false,
          isGukjin: spec.isGukjin ?? false,
          bonus: null,
        }),
      );
    }
  }
  for (const piValue of BONUS_PI_VALUES) {
    cards.push(
      Object.freeze({
        id: cards.length,
        month: null,
        kind: 'bonus',
        piValue,
        ribbon: null,
        isGodori: false,
        isBiGwang: false,
        isGukjin: false,
        bonus: Object.freeze({ stealsOnGain: true }),
      }),
    );
  }
  return Object.freeze(cards);
}

/** ID 순서의 전체 카탈로그 51장. `CARDS[id].id === id`. */
export const CARDS: readonly Card[] = buildCatalog();

export const BASE_CARD_COUNT = 48;
export const TOTAL_CARD_COUNT = 51;

/** 0~50 */
export const ALL_CARD_IDS: readonly CardId[] = Object.freeze(CARDS.map((c) => c.id));

/** 보너스 카드 ID: 48(2피), 49(2피), 50(3피) */
export const BONUS_CARD_IDS: readonly CardId[] = Object.freeze(
  CARDS.filter((c) => c.kind === 'bonus').map((c) => c.id),
);

export function getCard(id: CardId): Card {
  const card = CARDS[id];
  if (card === undefined) {
    throw new RangeError(`알 수 없는 카드 ID: ${id}`);
  }
  return card;
}

/**
 * 규칙 옵션의 보너스 구성(rules 12.7 "보너스 카드 구성")에 맞는 덱 카드 ID 목록.
 * 0장: 48장 / 2장: 2피(48)·3피(50) / 3장: 2피·2피·3피(48·49·50).
 */
export function deckCardIds(bonusCards: 0 | 2 | 3): CardId[] {
  return [...ALL_CARD_IDS.slice(0, BASE_CARD_COUNT), ...BONUS_BY_COUNT[bonusCards]];
}

const BONUS_BY_COUNT: Readonly<Record<0 | 2 | 3, readonly CardId[]>> = {
  0: [],
  2: [48, 50],
  3: [48, 49, 50],
};
