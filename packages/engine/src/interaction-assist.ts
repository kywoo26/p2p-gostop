// 플레이 보조 판정(C01·C02·C05). 현재 공개 뷰와 카드 카탈로그만 읽으며 행동을 실행하지 않는다.
import { ALL_CARD_IDS, BASE_CARD_COUNT, getCard, type CardId } from './cards.ts';
import { matchPreview } from './preview.ts';
import type { Action, CapturedPile, FloorGroup, Pending, Phase, Seat, TurnCtx } from './state.ts';

export interface EquivalentTargets {
  readonly equivalent: boolean;
  /** 동등할 때만 카드 ID가 가장 작은 대상. 그렇지 않으면 null. */
  readonly representative: CardId | null;
}

/**
 * 현재 play/flip 대상 선택의 두 바닥 패가 완전히 동등한 일반피인지 판정한다.
 * 같은 월·같은 피 가치라도 특수 역할이 있으면 자동 선택하지 않는다.
 */
export function equivalentTargets(
  table: { readonly pending: Pending | null; readonly floor: readonly FloorGroup[] },
  pending: Pending,
): EquivalentTargets {
  const current = table.pending;
  if (
    pending.kind !== 'target' ||
    current?.kind !== 'target' ||
    current.seat !== pending.seat ||
    current.source !== pending.source ||
    current.card !== pending.card ||
    pending.options.length !== 2 ||
    current.options.length !== 2
  ) {
    return { equivalent: false, representative: null };
  }
  const [first, second] = pending.options;
  if (
    first === undefined ||
    second === undefined ||
    first === second ||
    !current.options.includes(first) ||
    !current.options.includes(second)
  ) {
    return { equivalent: false, representative: null };
  }
  const a = getCard(first);
  const b = getCard(second);
  const played = getCard(pending.card);
  const group = table.floor.find((item) => item.month === a.month);
  const ordinaryPi = (card: typeof a): boolean =>
    card.kind === 'pi' &&
    card.piValue === 1 &&
    card.ribbon === null &&
    !card.isGodori &&
    !card.isBiGwang &&
    !card.isGukjin &&
    card.bonus === null;
  if (
    a.month === null ||
    a.month !== b.month ||
    a.month !== played.month ||
    !ordinaryPi(a) ||
    !ordinaryPi(b) ||
    group?.kind !== 'loose' ||
    group.cards.length !== 2 ||
    !group.cards.includes(first) ||
    !group.cards.includes(second)
  ) {
    return { equivalent: false, representative: null };
  }
  return { equivalent: true, representative: Math.min(first, second) };
}

/** play 단계의 전체 합법 수 중 유일한 일반 내기 또는 뒤집기만 반환한다. */
export function uniqueLegalAction(legal: readonly Action[]): Action | null {
  const [only] = legal;
  return legal.length === 1 && (only?.type === 'play' || only?.type === 'flipOnly') ? only : null;
}

export type CaptureCertainty = 'none' | 'match' | 'guaranteed' | 'heldPair';
export type CaptureReason =
  | 'notPlayable'
  | 'bonus'
  | 'noFloorMatch'
  | 'unseenMonth'
  | 'opponentRevealedMonth'
  | 'noOpponentMonth'
  | 'exclusiveHeldPair';

export interface CaptureAssessment {
  readonly card: CardId;
  readonly certainty: CaptureCertainty;
  readonly reason: CaptureReason;
}

/** PlayerView와 wire BoardView가 공유하는 공개 카드 입력. 숨은 패·규칙·난수는 받지 않는다. */
export interface CapturePublicView {
  readonly viewer: Seat;
  readonly phase: Phase;
  readonly turn: Seat;
  readonly pending: { readonly kind: string; readonly seat?: Seat } | null;
  readonly seats: readonly [
    {
      readonly hand: readonly CardId[] | null;
      readonly captured: CapturedPile;
      readonly revealed: readonly CardId[];
    },
    {
      readonly hand: readonly CardId[] | null;
      readonly captured: CapturedPile;
      readonly revealed: readonly CardId[];
    },
  ];
  readonly floor: readonly FloorGroup[];
  readonly legal: readonly Action[];
  readonly ctx?: Pick<TurnCtx, 'played' | 'flipped' | 'heldBonuses'> | null;
  readonly inFlight?: { readonly played: CardId | null; readonly staged: readonly CardId[] };
}

function unseenBaseCards(view: CapturePublicView): Set<CardId> {
  const seen = new Set<CardId>(view.seats[view.viewer].hand ?? []);
  for (const group of view.floor) for (const id of group.cards) seen.add(id);
  for (const seat of view.seats) {
    for (const id of [
      ...seat.captured.gwang,
      ...seat.captured.yeol,
      ...seat.captured.tti,
      ...seat.captured.pi,
      ...seat.revealed,
    ])
      seen.add(id);
  }
  if (view.ctx != null) {
    if (view.ctx.played !== null) seen.add(view.ctx.played);
    if (view.ctx.flipped !== null) seen.add(view.ctx.flipped);
    for (const id of view.ctx.heldBonuses) seen.add(id);
  }
  if (view.inFlight !== undefined) {
    if (view.inFlight.played !== null) seen.add(view.inFlight.played);
    for (const id of view.inFlight.staged) seen.add(id);
  }
  return new Set(ALL_CARD_IDS.slice(0, BASE_CARD_COUNT).filter((id) => !seen.has(id)));
}

/**
 * 자기 손패의 합법 play마다 현재 바닥 짝 또는 두 손패 독점 보유를 공개정보로 판정한다.
 * heldPair는 즉시 획득이 아니며, 어느 분류도 미래 소유·점수를 보장하지 않는다.
 */
export function guaranteedCaptures(view: CapturePublicView): CaptureAssessment[] {
  const hand = view.seats[view.viewer].hand ?? [];
  const playable =
    view.phase === 'turn' &&
    view.turn === view.viewer &&
    view.pending?.kind === 'play' &&
    view.pending.seat === view.viewer;
  const legal = new Set(
    view.legal
      .filter((action) => action.type === 'play')
      .filter((action) => action.seat === view.viewer)
      .map((action) => action.card),
  );
  const held = [...new Set(hand)];
  const captured = new Set(
    view.seats.flatMap((seat) => [
      ...seat.captured.gwang,
      ...seat.captured.yeol,
      ...seat.captured.tti,
      ...seat.captured.pi,
    ]),
  );
  const unseen = unseenBaseCards(view);
  const opponent = view.viewer === 0 ? 1 : 0;
  const opponentRevealed = view.seats[opponent].revealed;
  return held
    .toSorted((a, b) => a - b)
    .map((card) => {
      if (!playable || !legal.has(card)) {
        return { card, certainty: 'none', reason: 'notPlayable' };
      }
      const month = getCard(card).month;
      if (month === null) {
        return { card, certainty: 'none', reason: 'bonus' };
      }
      const preview = matchPreview(view, view.viewer, card);
      if (preview.kind === 'place' || preview.kind === 'bonus' || preview.floor.length === 0) {
        const pair = held.filter((id) => getCard(id).month === month);
        // CF11: 두 장이 함께 합법인 H2/F0/C2/U0에만 적용한다. 바닥 확정 분류는 그대로 둔다.
        if (
          pair.length === 2 &&
          pair.every((id) => legal.has(id)) &&
          !view.floor.some((group) => group.cards.some((id) => getCard(id).month === month)) &&
          [...captured].filter((id) => getCard(id).month === month).length === 2 &&
          ![0, 1, 2, 3].some((offset) => unseen.has((month - 1) * 4 + offset)) &&
          !opponentRevealed.some((id) => getCard(id).month === month)
        ) {
          return { card, certainty: 'heldPair', reason: 'exclusiveHeldPair' };
        }
        return { card, certainty: 'none', reason: 'noFloorMatch' };
      }
      if ([0, 1, 2, 3].some((offset) => unseen.has((month - 1) * 4 + offset))) {
        return { card, certainty: 'match', reason: 'unseenMonth' };
      }
      if (opponentRevealed.some((id) => getCard(id).month === month)) {
        return { card, certainty: 'match', reason: 'opponentRevealedMonth' };
      }
      return { card, certainty: 'guaranteed', reason: 'noOpponentMonth' };
    });
}
