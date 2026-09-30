// 카드 그림 경로와 한국어 이름 (NF-08: 손패·바닥은 카드 도상·aria-label).
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

/** 바닥 카드 모서리 표식의 종류 기호. 일반 피는 기호 없이 월 숫자만 */
export type MarkKind = 'gwang' | 'yeol' | 'tti' | 'pi' | 'ssangpi';

export interface CardIndex {
  readonly month: number;
  readonly kind: MarkKind;
}

/**
 * 카드 모서리 표식: 월 숫자 + 종류 기호. 보너스 카드는 그림에 가치(2피·3피)가 크게 쓰여 있어 표식이 없다(null).
 * 9월 국진은 열끗 기호다(쌍피로 셀 때는 획득패의 "쌍피" 표지가 알린다).
 */
export function cardIndex(id: CardId): CardIndex | null {
  const card = getCard(id);
  if (card.month === null || card.kind === 'bonus') return null;
  const kind: MarkKind = card.kind === 'pi' && card.piValue === 2 ? 'ssangpi' : card.kind;
  return { month: card.month, kind };
}

/**
 * 표식을 오른쪽 모서리에 두는 카드 (intent/plan.md D1). 기본은 왼쪽이다.
 * Commons 그림(viewBox 103.2×168.2)의 光 원·띠 글자·주요 도상이 있는 쪽을 피한다.
 * 12/16px 색인의 실제 보호 영역 교차는 CardArt.test.ts에서 바닥·손패 크기별로 검사한다.
 * - 위: 11월 광(봉황 머리), 12월 광(光 원 x 11~46, y 9~44), 8월 열끗(기러기)
 * - 아래: 3월 광·8월 광(光 원 x 12~48, y 119~156), 5월 열끗(다리), 10월 열끗(사슴 다리), 12월 광(개구리)
 */
const RIGHT_TOP: ReadonlySet<CardId> = new Set([29, 40, 44]);
const RIGHT_BOTTOM: ReadonlySet<CardId> = new Set([8, 16, 28, 36, 44]);

export function markSide(id: CardId, at: 'top' | 'bottom'): 'left' | 'right' {
  return (at === 'top' ? RIGHT_TOP : RIGHT_BOTTOM).has(id) ? 'right' : 'left';
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
