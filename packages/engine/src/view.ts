// 좌석별 뷰 (spec 4.5, FR-11): 상대 손패 ID와 더미 순서를 가리고 장수만 남긴다.
import type { CardId } from './cards.ts';
import { unitsLeft } from './draft.ts';
import { legalActions } from './legal.ts';
import type { RuleOptions } from './rules.ts';
import type {
  Action,
  CapturedPile,
  EngineEvent,
  FloorGroup,
  GameState,
  InstantPayout,
  Pending,
  Phase,
  RoundResult,
  ScoreBreakdown,
  Seat,
  TurnCtx,
} from './state.ts';

export interface SeatView {
  readonly handCount: number;
  /** 보는 좌석 자신의 손패만. 상대는 null */
  readonly hand: readonly CardId[] | null;
  readonly captured: CapturedPile;
  readonly goCount: number;
  readonly lastGoScore: number;
  readonly shakes: number;
  readonly bombs: number;
  readonly bombTokens: number;
  readonly ppeokCount: number;
  readonly turnsLeft: number;
  readonly score: ScoreBreakdown;
}

export interface FirstPickView {
  readonly poolSize: number;
  readonly picks: readonly [number | null, number | null];
  readonly ties: number;
}

export interface PlayerView {
  readonly viewer: Seat;
  readonly phase: Phase;
  readonly rules: RuleOptions;
  readonly dealer: Seat | null;
  readonly turn: Seat;
  readonly seats: readonly [SeatView, SeatView];
  readonly floor: readonly FloorGroup[];
  readonly deckCount: number;
  readonly pending: Pending | null;
  readonly ctx: TurnCtx | null;
  readonly firstPick: FirstPickView | null;
  readonly round: { readonly number: number; readonly carry: number };
  readonly instantPayouts: readonly InstantPayout[];
  readonly result: RoundResult | null;
  /** 보는 좌석의 합법 수 (FR-12 하이라이트용) */
  readonly legal: readonly Action[];
  readonly eventSeq: number;
}

function seatView(state: GameState, seat: Seat, viewer: Seat): SeatView {
  const s = state.seats[seat];
  return {
    handCount: s.hand.length,
    hand: seat === viewer ? s.hand : null,
    captured: s.captured,
    goCount: s.goCount,
    lastGoScore: s.lastGoScore,
    shakes: s.shakes,
    bombs: s.bombs,
    bombTokens: s.bombTokens,
    ppeokCount: s.ppeokTurns.length,
    turnsLeft: unitsLeft(s),
    score: s.score,
  };
}

/** 총통 선택 중인 월은 본인만 안다(계속하기를 고르면 끝까지 숨긴 채 친다). */
function pendingView(pending: Pending | null, viewer: Seat): Pending | null {
  if (pending?.kind === 'chongtong' && pending.seat !== viewer) {
    return { ...pending, months: [] };
  }
  return pending;
}

export function playerView(state: GameState, viewer: Seat): PlayerView {
  const fp = state.firstPick;
  return {
    viewer,
    phase: state.phase,
    rules: state.rules,
    dealer: state.dealer,
    turn: state.turn,
    seats: [seatView(state, 0, viewer), seatView(state, 1, viewer)],
    floor: state.floor,
    deckCount: state.deck.length,
    pending: pendingView(state.pending, viewer),
    ctx: state.ctx,
    firstPick: fp === null ? null : { poolSize: fp.pool.length, picks: fp.picks, ties: fp.ties },
    round: { number: state.round.number, carry: state.round.carry },
    instantPayouts: state.instantPayouts,
    result: state.result,
    legal: legalActions(state, viewer),
    eventSeq: state.eventSeq,
  };
}

/**
 * 상대에게 보내는 이벤트에서 상대가 몰라야 할 카드를 가린다:
 * 보너스 보충으로 손패에 들어온 카드, 계속하기를 고른 총통의 월과 카드.
 */
export function redactEvent(event: EngineEvent, viewer: Seat): EngineEvent {
  if (event.seat === viewer) {
    return event;
  }
  if (event.type === 'CardDrawn') {
    return { ...event, cards: [] };
  }
  if (event.type === 'Chongtong' && event.choice === 'continue') {
    return { ...event, cards: [], months: [] };
  }
  return event;
}
