// 좌석별 뷰 (spec 4.5, FR-11): 상대 손패 ID와 더미 순서를 가리고 장수만 남긴다.
import type { CardId } from './cards.ts';
import { unitsLeft } from './draft.ts';
import { applySettlement, type Ledger } from './ledger.ts';
import { legalActions } from './legal.ts';
import type { RuleOptions } from './rules.ts';
import { previewStop } from './settle.ts';
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
  SettleStep,
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
  /** 뻑을 싼 자기 턴 번호들 (Ppeok 이벤트로 공개된 값, 결정화용) */
  readonly ppeokTurns: readonly number[];
  readonly turnsLeft: number;
  /** 지금까지 시작한 자기 턴 수 (공개 정보, 결정화용) */
  readonly turnsTaken: number;
  /** 연속 무획득 턴 수 (E14 허당, 공개 정보, 결정화용) */
  readonly noCaptureStreak: number;
  /** 국진 '매번 묻기'에서 고른 위치 (GukjinPlaced로 공개). 자동 모드에서는 score.gukjinAsPi가 현재 위치 */
  readonly gukjinAsPi: boolean;
  readonly score: ScoreBreakdown;
  /**
   * 규칙상 공개된 손패 중 아직 손에 있는 카드 (SeatState.revealed: 흔들기 Shake·총통 끝내기로 보여 준 카드).
   * 양쪽 모두 보인다(공개 정보). 결정화는 상대 손패 표본에서 이 카드를 고정한다(unseenCards에서 빠짐).
   */
  readonly revealed: readonly CardId[];
}

export interface FirstPickView {
  readonly poolSize: number;
  readonly picks: readonly [number | null, number | null];
  readonly ties: number;
  /** 밤일낮장에서 밤인지 (호출자가 넘긴 공개 정보) */
  readonly isNight: boolean;
}

/** 고/스톱 프롬프트 중인 좌석이 지금 스톱하면 받을 정산 (FR-14, 12.6 M4) */
export interface StopPreview {
  /** 최종 점수 (settlement.finalPoints) */
  readonly points: number;
  readonly basePoints: number;
  readonly multiplier: number;
  readonly steps: readonly SettleStep[];
  /** 점당 금액. playerView 옵션으로 perPoint나 ledger를 주지 않았으면 null */
  readonly perPoint: number | null;
  /** points × perPoint (상한 전) */
  readonly requested: number | null;
  /** 실제로 받을 금액: ledger를 주었으면 패자 잔액(유한책임제면 승자 잔액) 상한 적용, 아니면 requested */
  readonly money: number | null;
  /** 상한 때문에 줄었는지 */
  readonly capped: boolean;
}

export interface PlayerViewOptions {
  /** 스톱 미리보기 금액 계산용 점당 금액 */
  readonly perPoint?: number;
  /** 스톱 미리보기 금액을 현재 잔액 상한까지 계산할 원장 (주면 perPoint보다 우선) */
  readonly ledger?: Ledger;
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
  /** 상대의 흔들기·총통(차례인 좌석) 프롬프트는 카드 내기 대기(play)로 보인다. 아래 pendingView 참조 */
  readonly pending: Pending | null;
  readonly ctx: TurnCtx | null;
  readonly firstPick: FirstPickView | null;
  readonly round: { readonly number: number; readonly carry: number };
  readonly instantPayouts: readonly InstantPayout[];
  readonly result: RoundResult | null;
  /** 보는 좌석의 합법 수 (FR-12 하이라이트용) */
  readonly legal: readonly Action[];
  readonly eventSeq: number;
  /** 보는 좌석이 고/스톱 프롬프트 중일 때만 값이 있다 (FR-14) */
  readonly stopPreview: StopPreview | null;
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
    ppeokTurns: s.ppeokTurns,
    turnsLeft: unitsLeft(s),
    turnsTaken: s.turnsTaken,
    noCaptureStreak: s.noCaptureStreak,
    gukjinAsPi: s.gukjinAsPi,
    score: s.score,
    revealed: s.revealed,
  };
}

/**
 * 상대의 비공개 프롬프트를 가린다 (M1 리뷰 F-1·F-6).
 * - 흔들기: 응답 전에는 카드 내기 대기(play)로 보인다. 흔들기 질문이 있었다는 사실만으로 뒤이어 낼 카드의 월에
 *   3장 이상을 쥐고 있다는 것이 드러나기 때문이다. 흔들면 Shake 이벤트로 공개된다.
 * - 총통: 차례인 좌석의 총통(선의 분배 직후 총통, 보너스로 만든 총통)은 play로 보인다. 선의 첫 턴 전에
 *   후 좌석이 고르는 총통은 기다린다는 사실 자체가 드러나므로 종류는 남기고 월만 지운다.
 */
function pendingView(state: GameState, viewer: Seat): Pending | null {
  const pending = state.pending;
  if (pending === null || pending.kind === 'pickFirst' || pending.seat === viewer) {
    return pending;
  }
  if (pending.kind === 'shake') {
    return { kind: 'play', seat: pending.seat };
  }
  if (pending.kind === 'chongtong') {
    return pending.seat === state.turn
      ? { kind: 'play', seat: pending.seat }
      : { ...pending, months: [] };
  }
  return pending;
}

function stopPreviewFor(
  state: GameState,
  viewer: Seat,
  options: PlayerViewOptions,
): StopPreview | null {
  const pending = state.pending;
  if (pending?.kind !== 'goStop' || pending.seat !== viewer) {
    return null;
  }
  const settlement = previewStop(state, viewer);
  const ledger = options.ledger ?? null;
  const perPoint = ledger?.perPoint ?? options.perPoint ?? null;
  let requested: number | null = null;
  let money: number | null = null;
  if (ledger !== null) {
    // 원장 규칙(M1·M2)과 같은 상한: 실제로 옮겨질 금액 = 적용 후 잔액 − 적용 전 잔액
    const after = applySettlement(ledger, settlement, state.rules);
    requested = settlement.finalPoints * ledger.perPoint;
    money = after.balances[viewer] - ledger.balances[viewer];
  } else if (perPoint !== null) {
    requested = settlement.finalPoints * perPoint;
    money = requested;
  }
  return {
    points: settlement.finalPoints,
    basePoints: settlement.basePoints,
    multiplier: settlement.multiplier,
    steps: settlement.steps,
    perPoint,
    requested,
    money,
    capped: requested !== null && money !== null && money < requested,
  };
}

/**
 * 좌석 하나가 볼 수 있는 정보만 담은 뷰. 상대 손패 ID·더미 순서·PRNG·선 고르기 후보·상대의 비공개 프롬프트를 가린다.
 * 같은 공개 정보 + 같은 자기 손패면 숨은 카드 배치와 무관하게 같은 뷰가 나온다(속성 테스트로 강제).
 */
export function playerView(
  state: GameState,
  viewer: Seat,
  options: PlayerViewOptions = {},
): PlayerView {
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
    pending: pendingView(state, viewer),
    ctx: state.ctx,
    firstPick:
      fp === null
        ? null
        : { poolSize: fp.pool.length, picks: fp.picks, ties: fp.ties, isNight: fp.isNight },
    round: { number: state.round.number, carry: state.round.carry },
    instantPayouts: state.instantPayouts,
    result: state.result,
    legal: legalActions(state, viewer),
    eventSeq: state.eventSeq,
    stopPreview: stopPreviewFor(state, viewer, options),
  };
}

/**
 * 상대에게 보내는 이벤트에서 상대가 몰라야 할 카드를 가린다: 보너스 보충으로 손패에 들어온 카드.
 * 흔들기 거절·총통 계속하기는 엔진이 이벤트를 내지 않는다(F-1·F-6). 아래의 총통 계속하기 가림은
 * 이전 버전 엔진이 남긴 이벤트 로그를 다시 보낼 때를 위한 것이다.
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
