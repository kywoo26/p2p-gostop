// 화면 어댑터 (M4 I1): 게임판 뷰의 단일 근거는 `@p2p-gostop/protocol`의 toBoardView다(호스트·게스트·솔로 공통).
// 이 파일은 protocol 위에 M3 표시 코드(display·Board·SeatBar·Settlement)가 쓰는 표시용 값만 더한다.
// - 좌석의 국진 위치·폭탄 횟수(ui/seat-stats.ts SeatExtras, M3 리뷰 S-2·I-4): 엔진 상태를 가진 솔로·호스트만 채운다.
//   게스트는 protocol SeatView에 이 필드가 생기면 받는다(그 전에는 없는 값으로 그린다).
// - 정산에 쓴 국진 위치(SettlementDisplay.gukjin): 판을 다 본 솔로·호스트만 안다.
import {
  applySettlement,
  GUKJIN_ID,
  settle,
  type CapturedPile,
  type GameState,
  type Ledger,
  type PlayerView,
  type Seat,
  type Settlement,
} from '@p2p-gostop/engine';
import {
  toBoardView as protocolBoardView,
  toSettlementView as protocolSettlementView,
  type BoardView,
  type SeatView,
  type SettlementInput,
  type SettlementView,
} from '@p2p-gostop/protocol';
import type { SeatExtras } from '../ui/seat-stats.ts';

export {
  inFlightOf,
  toBoardExtras,
  toRecordRow,
  type BoardExtras,
  type InFlight,
} from '@p2p-gostop/protocol';

/** 솔로·호스트의 좌석: protocol SeatView + 표시용 값 */
export type AdapterSeatView = SeatView & Required<SeatExtras>;

type SeatStats = { readonly gukjinAsPi: boolean; readonly bombs: number };

/** 엔진 좌석 상태에서 표시용 값을 붙인다 */
export function withSeatExtras(
  board: BoardView,
  seats: readonly [SeatStats, SeatStats],
): BoardView & { readonly seats: readonly [AdapterSeatView, AdapterSeatView] } {
  return {
    ...board,
    seats: [
      { ...board.seats[0], ...seats[0] },
      { ...board.seats[1], ...seats[1] },
    ],
  };
}

/** PlayerView → BoardView (protocol) + 좌석 표시용 값 */
export function toBoardView(
  view: PlayerView,
  meta: { readonly names: readonly [string, string]; readonly balances: readonly [number, number] },
): BoardView & { readonly seats: readonly [AdapterSeatView, AdapterSeatView] } {
  const stats = (seat: Seat): SeatStats => ({
    gukjinAsPi: view.seats[seat].score.gukjinAsPi,
    bombs: view.seats[seat].bombs,
  });
  return withSeatExtras(protocolBoardView(view, meta), [stats(0), stats(1)]);
}

/** 정산에 쓴 국진 위치 (rules S5·해석 29: 승자는 점수 최대, 패자는 피박 회피 쪽). 국진을 가진 좌석만 */
export interface GukjinPlacement {
  readonly seat: Seat;
  readonly asPi: boolean;
}

/** 정산 화면 뷰 + 국진 위치 (protocol SettlementView에는 없다: M3 리뷰 S-2) */
export type SettlementDisplay = SettlementView & { readonly gukjin?: readonly GukjinPlacement[] };

export function gukjinPlacements(
  settlement: Settlement,
  captured: readonly [CapturedPile, CapturedPile],
): GukjinPlacement[] {
  return ([0, 1] as const)
    .filter((seat) => captured[seat].yeol.includes(GUKJIN_ID))
    .map((seat) => ({ seat, asPi: settlement.gukjinAsPi[seat] }));
}

export function toSettlementView(input: SettlementInput): SettlementDisplay {
  return {
    ...protocolSettlementView(input),
    gukjin: gukjinPlacements(input.settlement, input.captured),
  };
}

/** 선택 대기 중 받기를 고르면 옮길 실제 금액(올인 상한 포함). 원장은 바꾸지 않는다. */
export function pushOffer(
  game: GameState,
  ledger: Pick<Ledger, 'perPoint' | 'startBalance' | 'balances'>,
): { readonly points: number; readonly amount: number } {
  const settlement = settle(game);
  const winner = settlement.winner;
  const next = applySettlement({ ...ledger, entries: [] }, settlement, game.rules);
  return {
    points: settlement.finalPoints,
    amount: winner === null ? 0 : next.balances[winner] - ledger.balances[winner],
  };
}
