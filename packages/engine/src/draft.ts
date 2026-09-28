// 내부 전용: reduce 한 번 동안만 쓰는 변경 가능한 상태 사본과 이벤트 버퍼.
// 공개 API는 항상 새 GameState를 돌려주고 입력 상태를 바꾸지 않는다(순수 함수).
import type { CardId } from './cards.ts';
import type {
  EngineEvent,
  EventInput,
  FloorGroup,
  GameState,
  InstantPayout,
  Seat,
  SeatState,
  TurnCtx,
} from './state.ts';

type Mut<T> = { -readonly [K in keyof T]: T[K] };

export interface DraftPile {
  gwang: CardId[];
  yeol: CardId[];
  tti: CardId[];
  pi: CardId[];
}

export interface DraftSeat extends Mut<Omit<SeatState, 'hand' | 'captured' | 'ppeokTurns'>> {
  hand: CardId[];
  captured: DraftPile;
  ppeokTurns: number[];
}

export interface DraftGroup extends Mut<Omit<FloorGroup, 'cards'>> {
  cards: CardId[];
}

export interface DraftCtx extends Mut<Omit<TurnCtx, 'heldBonuses'>> {
  heldBonuses: CardId[];
}

export interface Draft extends Mut<
  Omit<GameState, 'seats' | 'floor' | 'deck' | 'ctx' | 'instantPayouts'>
> {
  seats: [DraftSeat, DraftSeat];
  floor: DraftGroup[];
  deck: CardId[];
  ctx: DraftCtx | null;
  instantPayouts: InstantPayout[];
}

/** 상태 전이 한 번의 작업 공간 */
export interface Tx {
  readonly s: Draft;
  readonly events: EngineEvent[];
}

function cloneSeat(seat: SeatState): DraftSeat {
  return {
    ...seat,
    hand: [...seat.hand],
    captured: {
      gwang: [...seat.captured.gwang],
      yeol: [...seat.captured.yeol],
      tti: [...seat.captured.tti],
      pi: [...seat.captured.pi],
    },
    ppeokTurns: [...seat.ppeokTurns],
  };
}

function toDraft(state: GameState): Draft {
  return {
    ...state,
    seats: [cloneSeat(state.seats[0]), cloneSeat(state.seats[1])],
    floor: state.floor.map((g) => ({ ...g, cards: [...g.cards] })),
    deck: [...state.deck],
    ctx: state.ctx === null ? null : { ...state.ctx, heldBonuses: [...state.ctx.heldBonuses] },
    instantPayouts: [...state.instantPayouts],
  };
}

export function beginTx(state: GameState): Tx {
  return { s: toDraft(state), events: [] };
}

export function emit(tx: Tx, event: EventInput): void {
  tx.events.push({ ...event, seq: tx.s.eventSeq });
  tx.s.eventSeq += 1;
}

export function other(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

/** 남은 턴 수 = 손패 + 폭탄패 */
export function unitsLeft(seat: {
  readonly hand: readonly CardId[];
  readonly bombTokens: number;
}): number {
  return seat.hand.length + seat.bombTokens;
}

/** 엔진 내부 불변식 위반(규칙 위반이 아님). 버그이므로 예외로 알린다. */
export function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`엔진 불변식 위반: ${message}`);
  }
}
