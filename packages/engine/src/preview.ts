// 낼 카드 미리보기 (FR-12 "먹게 될 바닥 카드 예고", M1 리뷰 5.2 경미): UI의 길게 누르기·하이라이트가 월 매칭 규칙을
// 다시 구현하지 않게 엔진이 한 곳에서 계산한다. 낸 카드의 매칭(spec 4.3 MATCH_PLAY)까지만 본다. 뒤집은 카드가 같은 월이면
// 결과가 바뀔 수 있다(쪽·뻑·따닥, E1·E6·E7): 그것은 더미 순서라 미리 알 수 없다.
import { getCard, type CardId } from './cards.ts';
import { findGroup } from './floor.ts';
import type { FloorGroup, Seat } from './state.ts';

export interface MatchPreview {
  /**
   * - place: 바닥에 같은 월이 없어 낸 카드가 바닥에 놓인다(뒤집은 카드가 같은 월이면 쪽, E7)
   * - take: 바닥 1장을 먹는다(뒤집은 카드가 같은 월이면 뻑, E1)
   * - choose: 바닥 같은 월 2장 중 1장을 고른다(대상 선택 프롬프트, FR-13. 뒤집은 카드가 같은 월이면 따닥, E6)
   * - pile: 뻑·자연뻑 무더기(3장 + 묻힌 보너스)를 통째로 먹는다(E2·R7)
   * - bonus: 보너스 카드라 바로 획득하고 더미에서 1장을 받아 다시 낸다(B1)
   */
  readonly kind: 'place' | 'take' | 'choose' | 'pile' | 'bonus';
  /** 하이라이트할 바닥 카드: take는 1장, choose는 후보 2장(그중 1장을 먹음), pile은 무더기 전체, 그 밖에는 빈 배열 */
  readonly floor: readonly CardId[];
  /** 이 카드를 내면 흔들기 질문이 나오는지 (E11: 손패에 같은 월 3장 이상 + 바닥에 그 월 없음). 손패를 모르면 false */
  readonly shake: boolean;
}

/** 미리보기에 필요한 표 정보. GameState와 PlayerView 모두 이 모양을 만족한다. */
export interface MatchPreviewTable {
  readonly floor: readonly FloorGroup[];
  readonly seats: readonly [
    { readonly hand: readonly CardId[] | null },
    { readonly hand: readonly CardId[] | null },
  ];
}

/**
 * 좌석 seat가 손패의 card를 내면 바닥에서 무엇을 먹게 되는지. `matchPreview(state, seat, card)`와
 * `matchPreview(playerView(state, seat), seat, card)`는 같은 값을 준다.
 * 손패를 아는데(GameState, 또는 뷰의 자기 좌석) 그 카드가 없으면 RangeError. 합법 수 여부(차례·프롬프트)는 보지 않는다.
 */
export function matchPreview(table: MatchPreviewTable, seat: Seat, card: CardId): MatchPreview {
  const month = getCard(card).month;
  const hand = table.seats[seat].hand;
  if (hand !== null && !hand.includes(card)) {
    throw new RangeError(`좌석 ${seat}의 손패에 없는 카드: ${card}`);
  }
  if (month === null) {
    return { kind: 'bonus', floor: [], shake: false };
  }
  const group = findGroup(table.floor, month);
  if (group === undefined) {
    const sameMonth = hand?.filter((id) => getCard(id).month === month).length ?? 0;
    return { kind: 'place', floor: [], shake: sameMonth >= 3 };
  }
  if (group.kind !== 'loose') {
    return { kind: 'pile', floor: [...group.cards], shake: false };
  }
  return {
    kind: group.cards.length === 2 ? 'choose' : 'take',
    floor: [...group.cards],
    shake: false,
  };
}
