// 카드 그림 경로와 한국어 이름·표식 (spec 6.6: 카드 위 표식은 런타임 오버레이, NF-08: 색만으로 구분하지 않음).
import { getCard } from '@p2p-gostop/engine';
import type { CardId } from '../lib/view-types.ts';

/** s: 획득패 더미, m: 바닥, l: 손패 (tokens.css --card-w-*) */
export type CardSize = 's' | 'm' | 'l';

// vite.config.ts의 base가 './'라 BASE_URL도 상대 경로다(Android assets·로컬 미리보기 공통).
const base = import.meta.env.BASE_URL;

export function cardSrc(id: CardId): string {
  return `${base}cards/${id}.svg`;
}

export const CARD_BACK_SRC = `${base}cards/back.svg`;

const TTI_NAMES = { hong: '홍단', cheong: '청단', cho: '초단', bi: '비띠' } as const;

/** 화면 읽기 프로그램용 이름. 예: "1월 광", "9월 국진", "11월 쌍피", "보너스 3피" */
export function cardLabel(id: CardId): string {
  const card = getCard(id);
  if (card.month === null) return `보너스 ${card.piValue}피`;
  const month = `${card.month}월`;
  switch (card.kind) {
    case 'gwang':
      return `${month} ${card.isBiGwang ? '비광' : '광'}`;
    case 'yeol':
      return `${month} ${card.isGukjin ? '국진' : card.isGodori ? '고도리' : '열끗'}`;
    case 'tti':
      return `${month} ${card.ribbon ? TTI_NAMES[card.ribbon] : '띠'}`;
    case 'pi':
      return `${month} ${card.piValue === 2 ? '쌍피' : '피'}`;
    case 'bonus':
      return `보너스 ${card.piValue}피`;
  }
}

/** 카드 모서리 표식: 월 숫자 + 종류 한 글자 (보너스는 +2·+3) */
export function cardMark(id: CardId): string {
  const card = getCard(id);
  if (card.month === null) return `+${card.piValue}`;
  const kind =
    card.kind === 'gwang'
      ? '광'
      : card.kind === 'yeol'
        ? '열'
        : card.kind === 'tti'
          ? '띠'
          : card.piValue === 2
            ? '쌍'
            : '피';
  return `${card.month}${kind}`;
}

const KIND_ORDER = { gwang: 0, yeol: 1, tti: 2, pi: 3, bonus: 4 } as const;

/**
 * 손패 표시 순서 (M3 리뷰 I-2): 월 → 종류(광·열끗·띠·피, 엔진 카탈로그 순) → ID, 보너스(월 없음)는 끝.
 * 엔진 손패 배열(분배 순서, 보충 카드는 끝)은 그대로 두고 화면에서만 정렬한다. 같은 입력이면 늘 같은 순서다.
 */
export function sortHand(cards: readonly CardId[]): CardId[] {
  return cards.toSorted((a, b) => {
    const x = getCard(a);
    const y = getCard(b);
    return (x.month ?? 13) - (y.month ?? 13) || KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || a - b;
  });
}
