// 공개 정보 → 결정화(determinization) (spec AI-01·AI-03, intent/plan.md 1.5).
// 보이지 않는 카드(엔진 unseenCards = 덱 − 내 손패·바닥·양측 획득패·진행 중인 턴의 공개 카드)를
// 시드 난수로 섞어 상대 손패(장수는 공개)와 더미에 균등하게 나누고, 엔진 determinize로 뷰와 일관된 GameState를 만든다.
// 결정화한 상태는 AI 내부의 가상 세계일 뿐이며 실제 상태와 무관하다.
import {
  determinize as engineDeterminize,
  unseenCards,
  type CardId,
  type GameState,
  type PlayerView,
  type Seat,
} from '@p2p-gostop/engine';
import type { Rng } from './rng.ts';

export const otherSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

/** 지금 입력해야 하는 좌석 (선 고르기는 아직 고르지 않은 첫 좌석) */
export function actingSeat(state: { readonly pending: GameState['pending'] }): Seat | null {
  const pending = state.pending;
  if (pending === null) {
    return null;
  }
  return pending.kind === 'pickFirst' ? (pending.seats[0] ?? null) : pending.seat;
}

/** 보는 좌석이 모르는 카드 (상대 손패 ∪ 더미). ID 오름차순 */
export function unknownCards(view: PlayerView): CardId[] {
  return unseenCards(view);
}

/**
 * 뷰와 일관된 가상 상태 하나를 만든다. 상대 손패는 모르는 카드 중 handCount장, 나머지는 더미(무작위 순서).
 * 표본이 뷰와 모순되면 엔진이 RangeError를 던진다(버그).
 */
export function determinize(view: PlayerView, rng: Rng): GameState {
  const opp = otherSeat(view.viewer);
  const oppCount = view.seats[opp].handCount - view.seats[opp].revealed.length; // 공개 카드는 엔진이 손패에 고정
  const unknown = view.phase === 'chooseFirst' ? [] : rng.shuffleInPlace(unseenCards(view));
  return engineDeterminize(
    view,
    { opponentHand: unknown.slice(0, oppCount), deck: unknown.slice(oppCount) },
    rng.nextU32(),
  );
}
