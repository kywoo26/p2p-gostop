// 시나리오 헬퍼: 손패·바닥·더미·획득 패를 직접 지정해 상태를 만든다 (code-refs 6.2, 규칙 벡터·단위 테스트용).
import { deckCardIds, getCard, type CardId } from './cards.ts';
import { blankDraft } from './deal.ts';
import type { DraftPile } from './draft.ts';
import { buildFloor, monthOf, placeGroup } from './floor.ts';
import type { Seed } from './rng.ts';
import { DEFAULT_RULES, type RuleOptions } from './rules.ts';
import { seatScore } from './score.ts';
import type { GameState, Seat, SeatState } from './state.ts';

export type SeatCounters = Partial<
  Pick<
    SeatState,
    | 'goCount'
    | 'lastGoScore'
    | 'shakes'
    | 'bombs'
    | 'bombTokens'
    | 'ppeokTurns'
    | 'turnsTaken'
    | 'noCaptureStreak'
    | 'gukjinAsPi'
  >
>;

export interface ScenarioSetup {
  readonly rules?: RuleOptions;
  readonly hands: readonly [readonly CardId[], readonly CardId[]];
  /** 바닥 낱장. 같은 월 3장은 자연뻑 무더기가 된다 */
  readonly floor?: readonly CardId[];
  readonly ppeokPiles?: readonly { readonly cards: readonly CardId[]; readonly owner: Seat }[];
  /** 더미 맨 위부터 */
  readonly deck?: readonly CardId[];
  /** 지정하지 않은 나머지 카드를 더미 아래에 ID 순으로 채운다(기본 true, 카드 보존 불변식 유지) */
  readonly fillDeck?: boolean;
  readonly captured?: readonly [readonly CardId[], readonly CardId[]];
  readonly seats?: readonly [SeatCounters, SeatCounters];
  readonly turn?: Seat;
  readonly dealer?: Seat;
  readonly carry?: number;
  readonly roundNumber?: number;
  readonly seed?: Seed;
}

function pileOf(ids: readonly CardId[]): DraftPile {
  const pile: DraftPile = { gwang: [], yeol: [], tti: [], pi: [] };
  for (const id of ids) {
    const kind = getCard(id).kind;
    (kind === 'bonus' ? pile.pi : pile[kind]).push(id);
  }
  return pile;
}

/** 지정한 배치로 turn 좌석이 카드를 낼 차례인 상태를 만든다. 카드 중복·덱 밖 카드는 거부한다. */
export function createScenario(setup: ScenarioSetup): GameState {
  const rules = setup.rules ?? DEFAULT_RULES;
  const s = blankDraft(rules, setup.seed ?? 0, {
    carry: setup.carry ?? 1,
    roundNumber: setup.roundNumber ?? 1,
  });
  const piles = setup.ppeokPiles ?? [];
  const placed = [
    ...setup.hands[0],
    ...setup.hands[1],
    ...(setup.floor ?? []),
    ...piles.flatMap((p) => p.cards),
    ...(setup.deck ?? []),
    ...(setup.captured?.[0] ?? []),
    ...(setup.captured?.[1] ?? []),
  ];
  const allowed = new Set(deckCardIds(rules.bonusCards));
  const seen = new Set<CardId>();
  for (const id of placed) {
    if (!allowed.has(id) || seen.has(id)) {
      throw new RangeError(`시나리오 카드 오류(중복 또는 덱 밖): ${id}`);
    }
    seen.add(id);
  }
  const filler = setup.fillDeck === false ? [] : [...allowed].filter((id) => !seen.has(id));
  const turn = setup.turn ?? 0;
  s.dealer = setup.dealer ?? turn;
  s.turn = turn;
  s.deck = [...(setup.deck ?? []), ...filler];
  s.floor = buildFloor(setup.floor ?? []);
  for (const pile of piles) {
    const month = monthOf(pile.cards.find((id) => getCard(id).month !== null) ?? -1);
    placeGroup(s.floor, { month, cards: [...pile.cards], kind: 'ppeok', owner: pile.owner });
  }
  for (const seat of [0, 1] as const) {
    const draft = s.seats[seat];
    Object.assign(draft, setup.seats?.[seat] ?? {});
    draft.ppeokTurns = [...draft.ppeokTurns];
    draft.hand = [...setup.hands[seat]];
    draft.captured = pileOf(setup.captured?.[seat] ?? []);
    draft.score = seatScore(draft.captured, draft.gukjinAsPi, rules);
  }
  s.pending = { kind: 'play', seat: turn };
  return s;
}

/** 상태 안의 모든 카드 ID (카드 보존 불변식 검사용, spec 4.4) */
export function collectCards(state: GameState): CardId[] {
  const seatCards = state.seats.flatMap((s) => [
    ...s.hand,
    ...s.captured.gwang,
    ...s.captured.yeol,
    ...s.captured.tti,
    ...s.captured.pi,
  ]);
  const ctx = state.ctx;
  const inFlight =
    ctx === null
      ? []
      : [
          ...(ctx.played !== null && !isOnTable(state, ctx.played) ? [ctx.played] : []),
          ...(ctx.flipped !== null && !isOnTable(state, ctx.flipped) ? [ctx.flipped] : []),
          ...ctx.heldBonuses.filter((id) => !isOnTable(state, id)),
        ];
  return [...seatCards, ...state.floor.flatMap((g) => g.cards), ...state.deck, ...inFlight];
}

function isOnTable(state: GameState, id: CardId): boolean {
  return (
    state.floor.some((g) => g.cards.includes(id)) ||
    state.seats.some((s) =>
      Object.values(s.captured).some((pile: readonly CardId[]) => pile.includes(id)),
    )
  );
}
