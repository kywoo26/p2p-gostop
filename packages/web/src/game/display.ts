// 화면에 그리는 판(DisplayBoard)과 이벤트 재생 리듀서 (spec 4.5·6.4, intent/plan.md 1.6).
// "엔진 이벤트 열을 애니메이션 큐가 소비하고, 큐가 비면 최신 뷰로 보정한다": 이벤트 하나를 적용한 중간 모습을 만들어
// 애니메이션 단계마다 커밋하고, 묶음이 끝나면 권위 있는 뷰(BoardView)로 스냅한다.
// 입력은 보는 좌석에게 가려진 이벤트(redactEvent)라서 게스트(M4)도 같은 리듀서를 쓸 수 있다.
// 순수 함수. 엔진이 한 번의 reduce로 낸 이벤트를 모두 적용하면 새 뷰의 카드 배치와 같아진다(display.test.ts가 검사).
import { getCard, type CardId, type EngineEvent, type Month, type Seat } from '@p2p-gostop/engine';
import type { BoardView, CapturedView, FloorGroupView, SeatView } from '../lib/view-types.ts';
import { cardLabel } from '../ui/cards.ts';
import {
  capturedStats,
  gukjinAsPiOf,
  hasGukjin,
  seatStats,
  type SeatExtras,
} from '../ui/seat-stats.ts';
import type { InFlight } from './adapter.ts';

/** 화면 좌석: 프로토콜 SeatView + 표시용 값 (M3 리뷰 S-2·I-4) */
export interface DisplaySeat extends SeatView {
  /** 국진을 쌍피로 세는지 (엔진 score.gukjinAsPi). 획득패 칸 배치·숫자가 이 값을 따른다 */
  readonly gukjinAsPi: boolean;
  /** 배수가 붙는 폭탄 횟수. 프로토콜 뷰에 아직 없으면 null */
  readonly bombs: number | null;
}

export interface DisplayBoard extends BoardView {
  readonly seats: readonly [DisplaySeat, DisplaySeat];
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
  const seats: DisplayBoard['seats'] = [displaySeat(board.seats[0]), displaySeat(board.seats[1])];
  return { ...board, seats, floor, staging: inFlight?.staged ?? [], highlight: [] };
}

/** 좌석 뷰 → 화면 좌석. 어댑터가 넣은 값이 없으면(프로토콜 뷰) 진행도에서 국진 위치를 읽는다 */
function displaySeat(seat: SeatView & SeatExtras): DisplaySeat {
  return { ...seat, gukjinAsPi: gukjinAsPiOf(seat), bombs: seat.bombs ?? null };
}

function updateSeat(board: DisplayBoard, seat: Seat, patch: (s: DisplaySeat) => DisplaySeat) {
  const seats: [DisplaySeat, DisplaySeat] = [board.seats[0], board.seats[1]];
  seats[seat] = patch(seats[seat]);
  return seats;
}

function removeFromHand(s: DisplaySeat, ids: readonly CardId[], count: number): DisplaySeat {
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

/**
 * 이벤트 하나를 화면 판에 적용한다. 카드 배치를 바꾸는 이벤트는 이전 강조를 지운다.
 * 배치가 바뀌지 않는 이벤트(점수·흔들기·고 등)는 강조를 남긴다: 애니메이션 단계는 이런 이벤트를 앞 단계에 붙여
 * 한꺼번에 커밋하므로(choreo.ts planSteps), 여기서 지우면 매칭·피 뺏기 강조가 한 번도 그려지지 않는다.
 */
export function applyEvent(input: DisplayBoard, event: EngineEvent): DisplayBoard {
  // 재생 중에는 입력을 받지 않는다: 프롬프트와 낼 수 있는 카드는 스냅 때 돌아온다
  const kept: DisplayBoard = { ...input, pending: null, playable: [] };
  const board: DisplayBoard = { ...kept, highlight: [] };
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
      // 뺏긴 카드를 잠깐 강조한다(M3 리뷰 I-4): 같은 단계의 뺏기가 여럿이면 모두
      const ids = event.cards;
      const seats: [DisplaySeat, DisplaySeat] = [board.seats[0], board.seats[1]];
      seats[event.from] = {
        ...seats[event.from],
        captured: removeCaptured(seats[event.from].captured, ids),
      };
      seats[event.to] = {
        ...seats[event.to],
        captured: addCaptured(seats[event.to].captured, ids),
      };
      const stolen = input.highlight.filter(
        (id) => !ids.includes(id) && placeOf(input, id) !== 'floor',
      );
      return { ...board, seats, highlight: [...stolen, ...ids] };
    }
    case 'ScoreChanged': {
      if (event.seat === null) return kept;
      const b = event.breakdown;
      const seats = updateSeat(kept, event.seat, (s) => ({
        ...s,
        score: b.total,
        gukjinAsPi: b.gukjinAsPi,
        progress: capturedStats(s.captured, b.gukjinAsPi).progress,
      }));
      return { ...kept, seats };
    }
    case 'GukjinPlaced': {
      if (event.seat === null) return kept;
      const asPi = event.asPi;
      return { ...kept, seats: updateSeat(kept, event.seat, (s) => ({ ...s, gukjinAsPi: asPi })) };
    }
    case 'Shake': {
      if (event.seat === null) return kept;
      return {
        ...kept,
        seats: updateSeat(kept, event.seat, (s) => ({ ...s, shakes: s.shakes + 1 })),
      };
    }
    case 'Go': {
      if (event.seat === null) return kept;
      const count = event.count;
      return { ...kept, seats: updateSeat(kept, event.seat, (s) => ({ ...s, goCount: count })) };
    }
    default:
      // Dealt·Redealt·선 고르기(분배 연출은 스냅 + 분배 애니메이션), BonusGained·PpeokTaken·SelfPpeok·Sseul·
      // InstantPayout·Chongtong·Hudang·GoStopPrompt·Stop·RoundEnded·Settled·Nagari: 배치 변화 없음
      return kept;
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

function capturedIds(c: CapturedView): CardId[] {
  return [...c.gwang, ...c.yeol, ...c.tti, ...c.pi];
}

/**
 * 판이 바뀔 때 짧게 알릴 문구 (M3 리뷰 S-2·I-4). 토스트 표시·지우기는 부르는 쪽이 한다.
 * - 국진 위치가 바뀜(같은 좌석이 국진을 가진 채 열끗 ↔ 쌍피): "상대 국진 → 쌍피"
 * - 피 뺏기(상대 획득패에 있던 카드가 이쪽 획득패로): "피 뺏음: 3월 피" / "피 뺏김: 3월 피"
 * 판 번호가 바뀌면(새 판) 알리지 않는다.
 */
export function boardNotices(
  prev: BoardView & { readonly seats: readonly [SeatView & SeatExtras, SeatView & SeatExtras] },
  next: BoardView & { readonly seats: readonly [SeatView & SeatExtras, SeatView & SeatExtras] },
): string[] {
  if (prev.round !== next.round) return [];
  const notices: string[] = [];
  for (const seat of [0, 1] as const) {
    const before = prev.seats[seat];
    const after = next.seats[seat];
    const whose = seat === next.viewer ? '내' : '상대';
    if (hasGukjin(before.captured) && hasGukjin(after.captured)) {
      const was = seatStats(before).gukjinAsPi;
      const now = seatStats(after).gukjinAsPi;
      if (was !== now) notices.push(`${whose} 국진 → ${now ? '쌍피' : '열끗'}`);
    }
    const other = prev.seats[seat === 0 ? 1 : 0];
    const had = new Set(capturedIds(before.captured));
    const fromOther = new Set(capturedIds(other.captured));
    const stolen = capturedIds(after.captured).filter((id) => !had.has(id) && fromOther.has(id));
    if (stolen.length > 0) {
      const label = stolen.map((id) => cardLabel(id)).join(', ');
      notices.push(`${seat === next.viewer ? '피 뺏음' : '피 뺏김'}: ${label}`);
    }
  }
  return notices;
}
