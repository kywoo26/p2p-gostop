import { describe, expect, it } from 'vitest';
import {
  ALL_CARD_IDS,
  BONUS_CARD_IDS,
  CARDS,
  deckCardIds,
  getCard,
  type CardKind,
} from '../src/index.ts';

// 기대값의 근거: rules-commercial.md 1.1 표와 12.1 R1.
const countBy = (pred: (c: (typeof CARDS)[number]) => boolean) => CARDS.filter(pred).length;
const ofKind = (kind: CardKind) => CARDS.filter((c) => c.kind === kind);
const ribbonMonths = (ribbon: string) =>
  ofKind('tti')
    .filter((c) => c.ribbon === ribbon)
    .map((c) => c.month);
const sumPi = (cards: readonly { piValue: number }[]) => cards.reduce((a, c) => a + c.piValue, 0);

describe('카드 카탈로그', () => {
  it('ID는 0~50의 서로 다른 51개이고 CARDS[id].id === id', () => {
    expect(CARDS).toHaveLength(51);
    expect(new Set(ALL_CARD_IDS).size).toBe(51);
    CARDS.forEach((card, index) => expect(card.id).toBe(index));
    expect(Math.min(...ALL_CARD_IDS)).toBe(0);
    expect(Math.max(...ALL_CARD_IDS)).toBe(50);
  });

  it('월마다 4장, 보너스는 월이 없다', () => {
    for (let month = 1; month <= 12; month++) {
      expect(
        countBy((c) => c.month === month),
        `${month}월`,
      ).toBe(4);
    }
    expect(countBy((c) => c.month === null)).toBe(3);
  });

  it('종류별 장수: 광 5, 열끗 9, 띠 10, 피 24(쌍피 2), 보너스 3', () => {
    expect(ofKind('gwang')).toHaveLength(5);
    expect(ofKind('yeol')).toHaveLength(9);
    expect(ofKind('tti')).toHaveLength(10);
    expect(ofKind('pi')).toHaveLength(24);
    expect(ofKind('pi').filter((c) => c.piValue === 2)).toHaveLength(2);
    expect(ofKind('bonus')).toHaveLength(3);
  });

  it('광은 1·3·8·11·12월, 비광은 12월 하나', () => {
    expect(ofKind('gwang').map((c) => c.month)).toEqual([1, 3, 8, 11, 12]);
    expect(CARDS.filter((c) => c.isBiGwang).map((c) => [c.month, c.kind])).toEqual([[12, 'gwang']]);
  });

  it('고도리는 2·4·8월 열끗, 국진은 9월 열끗', () => {
    expect(CARDS.filter((c) => c.isGodori).map((c) => [c.month, c.kind])).toEqual([
      [2, 'yeol'],
      [4, 'yeol'],
      [8, 'yeol'],
    ]);
    expect(CARDS.filter((c) => c.isGukjin).map((c) => [c.month, c.kind, c.piValue])).toEqual([
      [9, 'yeol', 2],
    ]);
  });

  it('띠: 홍단 1·2·3월, 청단 6·9·10월, 초단 4·5·7월, 12월 비띠', () => {
    expect(ribbonMonths('hong')).toEqual([1, 2, 3]);
    expect(ribbonMonths('cheong')).toEqual([6, 9, 10]);
    expect(ribbonMonths('cho')).toEqual([4, 5, 7]);
    expect(ribbonMonths('bi')).toEqual([12]);
    expect(CARDS.filter((c) => c.kind !== 'tti').every((c) => c.ribbon === null)).toBe(true);
  });

  it('쌍피는 11·12월', () => {
    expect(
      ofKind('pi')
        .filter((c) => c.piValue === 2)
        .map((c) => c.month),
    ).toEqual([11, 12]);
  });

  it('피 가치 합계: 기본 피 26(일반 22 + 쌍피 2×2), 보너스 7(2+2+3)', () => {
    expect(sumPi(ofKind('pi'))).toBe(26);
    expect(sumPi(ofKind('bonus'))).toBe(7);
    expect(ofKind('gwang').every((c) => c.piValue === 0)).toBe(true);
    expect(ofKind('tti').every((c) => c.piValue === 0)).toBe(true);
    expect(ofKind('yeol').every((c) => c.piValue === (c.isGukjin ? 2 : 0))).toBe(true);
  });

  it('보너스는 48(2피)·49(2피)·50(3피), 뺏기 속성을 가진다', () => {
    expect(BONUS_CARD_IDS).toEqual([48, 49, 50]);
    expect(BONUS_CARD_IDS.map((id) => getCard(id).piValue)).toEqual([2, 2, 3]);
    expect(BONUS_CARD_IDS.every((id) => getCard(id).bonus?.stealsOnGain === true)).toBe(true);
    expect(CARDS.filter((c) => c.kind !== 'bonus').every((c) => c.bonus === null)).toBe(true);
  });

  it('보너스 구성별 덱: 48 / 50(2피·3피) / 51장', () => {
    expect(deckCardIds(0)).toHaveLength(48);
    expect(
      deckCardIds(2)
        .slice(48)
        .map((id) => getCard(id).piValue),
    ).toEqual([2, 3]);
    expect(deckCardIds(3)).toEqual([...ALL_CARD_IDS]);
  });

  it('카탈로그는 불변', () => {
    expect(Object.isFrozen(CARDS)).toBe(true);
    expect(Object.isFrozen(CARDS[0])).toBe(true);
  });

  it('범위 밖 ID는 거부', () => {
    expect(() => getCard(51)).toThrow(RangeError);
    expect(() => getCard(-1)).toThrow(RangeError);
  });
});
