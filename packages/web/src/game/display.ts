// 화면에 그리는 판(DisplayBoard)과 이벤트 재생 리듀서 (spec 4.5·6.4, plan.md 1.6).
// "엔진 이벤트 열을 애니메이션 큐가 소비하고, 큐가 비면 최신 뷰로 보정한다": 이벤트 하나를 적용한 중간 모습을 만들어
// 애니메이션 단계마다 커밋하고, 묶음이 끝나면 권위 있는 뷰(BoardView)로 스냅한다.
// 입력은 보는 좌석에게 가려진 이벤트(redactEvent)라서 게스트(M4)도 같은 리듀서를 쓸 수 있다.
// 순수 함수. 엔진이 한 번의 reduce로 낸 이벤트를 모두 적용하면 새 뷰의 카드 배치와 같아진다(display.test.ts가 검사).
import { getCard, type CardId, type EngineEvent, type Month, type Seat } from '@p2p-gostop/engine';
import type { BoardView, CapturedView, FloorGroupView, SeatView } from '../lib/view-types.ts';
import { progressOf, type InFlight } from './adapter.ts';

export interface DisplayBoard extends BoardView {
  /** 바닥에 놓이기 전 잠시 머무는 카드: 뒤집은 카드, 손패에서 낸 보너스 (더미 옆 자리) */
  readonly staging: readonly CardId[];
  /** 매칭 강조 중인 바닥 카드 (spec 6.4 "매칭 강조 80ms") */
  readonly highlight: readonly CardId[];
}

const monthOf = (id: CardId): Month | null => getCard(id).month;

/**
 * 권위 있는 뷰로 스냅: 강조를 지우고, 대상 고르기 중인 카드(inFlight)는 재생과 같은 자리에 둔다
 * (낸 패는 그 월 무더기 위, 뒤집은 패·들고 있는 보너스는 뒤집기 자리).
 */
export function snap(board: BoardView, inFlight: InFlight | null = null): DisplayBoard {
  const floor = inFlight?.played == null ? board.floor : addToFloor(board.floor, inFlight.played);
  return { ...board, floor, staging: inFlight?.staged ?? [], highlight: [] };
}

function updateSeat(board: DisplayBoard, seat: Seat, patch: (s: SeatView) => SeatView) {
  const seats: [SeatView, SeatView] = [board.seats[0], board.seats[1]];
  seats[seat] = patch(seats[seat]);
  return seats;
}

function removeFromHand(s: SeatView, ids: readonly CardId[], count: number): SeatView {
  if (s.hand === null) {
    return { ...s, handCount: Math.max(0, s.handCount - count) };
  }
  const hand = s.hand.filter((id) => !ids.includes(id));
  return { ...s, hand, handCount: hand.length };
}

function insertGroup(floor: FloorGroupView[], group: FloorGroupView): FloorGroupView[] {
  const index = floor.findIndex((g) => g.month > group.month);
  if (index === -1) return [...floor, group];
  return [...floor.slice(0, index), group, ...floor.slice(index)];
}

/** 카드를 그 월 무더기 위에 놓는다(없으면 새 무더기). 월이 없는 보너스는 바닥에 놓지 않는다 */
function addToFloor(floor: readonly FloorGroupView[], id: CardId): FloorGroupView[] {
  const month = monthOf(id);
  if (month === null) return [...floor];
  const index = floor.findIndex((g) => g.month === month);
  if (index === -1) {
    return insertGroup([...floor], { month, cards: [id], kind: 'loose', owner: null });
  }
  return floor.map((g, i) => (i === index ? { ...g, cards: [...g.cards, id] } : g));
}

function removeFromFloor(floor: readonly FloorGroupView[], ids: readonly CardId[]) {
  return floor
    .map((g) => ({ ...g, cards: g.cards.filter((id) => !ids.includes(id)) }))
    .filter((g) => g.cards.length > 0);
}

/** 스테이징(뒤집은 카드 자리)에 있던 카드를 바닥 무더기로 옮긴다 */
function landFromStaging(board: DisplayBoard, ids: readonly CardId[]): DisplayBoard {
  let floor = [...board.floor];
  const staged = ids.filter((id) => board.staging.includes(id));
  for (const id of staged) floor = addToFloor(floor, id);
  return { ...board, floor, staging: board.staging.filter((id) => !staged.includes(id)) };
}

function pileOf(id: CardId): keyof CapturedView {
  const kind = getCard(id).kind;
  return kind === 'bonus' ? 'pi' : kind;
}

function addCaptured(c: CapturedView, ids: readonly CardId[]): CapturedView {
  const next = { gwang: [...c.gwang], yeol: [...c.yeol], tti: [...c.tti], pi: [...c.pi] };
  for (const id of ids) next[pileOf(id)].push(id);
  return next;
}

function removeCaptured(c: CapturedView, ids: readonly CardId[]): CapturedView {
  const keep = (list: readonly CardId[]) => list.filter((id) => !ids.includes(id));
  return { gwang: keep(c.gwang), yeol: keep(c.yeol), tti: keep(c.tti), pi: keep(c.pi) };
}

/** 이벤트 하나를 화면 판에 적용한다. 화면 모습이 바뀌지 않는 이벤트는 강조만 지운다 */
export function applyEvent(input: DisplayBoard, event: EngineEvent): DisplayBoard {
  // 재생 중에는 입력을 받지 않는다: 프롬프트와 낼 수 있는 카드는 스냅 때 돌아온다
  const board: DisplayBoard = { ...input, pending: null, playable: [], highlight: [] };
  switch (event.type) {
    case 'CardPlayed': {
      const [id] = event.cards;
      if (id === undefined || event.seat === null) return board;
      const seats = updateSeat(board, event.seat, (s) => removeFromHand(s, [id], 1));
      return event.bonus
        ? { ...board, seats, staging: [...board.staging, id] }
        : { ...board, seats, floor: addToFloor(board.floor, id) };
    }
    case 'CardDrawn': {
      if (event.seat === null) return board;
      const drawn = event.cards;
      const seats = updateSeat(board, event.seat, (s) =>
        s.hand === null || drawn.length === 0
          ? { ...s, handCount: s.handCount + 1 }
          : { ...s, hand: [...s.hand, ...drawn], handCount: s.hand.length + drawn.length },
      );
      return { ...board, seats, deckCount: Math.max(0, board.deckCount - 1) };
    }
    case 'CardFlipped':
      return {
        ...board,
        deckCount: Math.max(0, board.deckCount - event.cards.length),
        staging: [...board.staging, ...event.cards],
      };
    case 'Matched': {
      const landed = landFromStaging(board, event.cards);
      return { ...landed, highlight: event.cards.slice(1) };
    }
    case 'Placed':
    case 'Jjok':
    case 'Ttadak':
      return landFromStaging(board, event.cards);
    case 'Ppeok': {
      const pile = event.cards;
      const month = pile.map(monthOf).find((m) => m !== null) ?? null;
      if (month === null || event.seat === null) return board;
      const floor = removeFromFloor(board.floor, pile).filter((g) => g.month !== month);
      const seats = updateSeat(board, event.seat, (s) => ({ ...s, ppeokCount: s.ppeokCount + 1 }));
      return {
        ...board,
        seats,
        staging: board.staging.filter((id) => !pile.includes(id)),
        floor: insertGroup(floor, { month, cards: pile, kind: 'ppeok', owner: event.seat }),
      };
    }
    case 'Bomb': {
      if (event.seat === null) return board;
      const handCards = event.cards.slice(0, event.handCards);
      const seats = updateSeat(board, event.seat, (s) =>
        removeFromHand(s, handCards, handCards.length),
      );
      let floor = [...board.floor];
      for (const id of handCards) floor = addToFloor(floor, id);
      return { ...board, seats, floor };
    }
    case 'Captured': {
      const ids = event.cards;
      const seats = updateSeat(board, event.to, (s) => ({
        ...s,
        captured: addCaptured(s.captured, ids),
      }));
      return {
        ...board,
        seats,
        floor: removeFromFloor(board.floor, ids),
        staging: board.staging.filter((id) => !ids.includes(id)),
      };
    }
    case 'PiStolen': {
      const ids = event.cards;
      const seats: [SeatView, SeatView] = [board.seats[0], board.seats[1]];
      seats[event.from] = {
        ...seats[event.from],
        captured: removeCaptured(seats[event.from].captured, ids),
      };
      seats[event.to] = {
        ...seats[event.to],
        captured: addCaptured(seats[event.to].captured, ids),
      };
      return { ...board, seats };
    }
    case 'ScoreChanged': {
      if (event.seat === null) return board;
      const b = event.breakdown;
      const seats = updateSeat(board, event.seat, (s) => ({
        ...s,
        score: b.total,
        progress: progressOf(s.captured, b.gukjinAsPi),
      }));
      return { ...board, seats };
    }
    case 'Shake': {
      if (event.seat === null) return board;
      return {
        ...board,
        seats: updateSeat(board, event.seat, (s) => ({ ...s, shakes: s.shakes + 1 })),
      };
    }
    case 'Go': {
      if (event.seat === null) return board;
      const count = event.count;
      return { ...board, seats: updateSeat(board, event.seat, (s) => ({ ...s, goCount: count })) };
    }
    default:
      // Dealt·Redealt·선 고르기(분배 연출은 스냅 + 분배 애니메이션), BonusGained·PpeokTaken·SelfPpeok·Sseul·
      // InstantPayout·Chongtong·Hudang·GukjinPlaced·GoStopPrompt·Stop·RoundEnded·Settled·Nagari: 배치 변화 없음
      return board;
  }
}

/** 이 묶음이 판 시작(분배)을 포함하는지: 분배는 이벤트 재생 대신 스냅 + 분배 애니메이션으로 보인다 */
export function isDealBatch(events: readonly EngineEvent[]): boolean {
  return events.some((e) => e.type === 'Dealt' || e.type === 'Redealt');
}

/** 카드가 지금 어디 있는지 (애니메이션 종류 결정) */
export type CardPlace = 'hand' | 'floor' | 'staging' | 'captured0' | 'captured1' | null;

export function placeOf(board: DisplayBoard, id: CardId): CardPlace {
  if (board.staging.includes(id)) return 'staging';
  if (board.floor.some((g) => g.cards.includes(id))) return 'floor';
  for (const seat of [0, 1] as const) {
    const s = board.seats[seat];
    if (s.hand?.includes(id)) return 'hand';
    const c = s.captured;
    if ([c.gwang, c.yeol, c.tti, c.pi].some((pile) => pile.includes(id))) {
      return seat === 0 ? 'captured0' : 'captured1';
    }
  }
  return null;
}
