// 호환 층 (M4 I1): 게임판 뷰는 `@p2p-gostop/protocol`의 toBoardView 하나로 만든다(호스트·게스트·솔로 공통).
// display.ts·display.test.ts(fix/m3-display 소유)가 아직 이 경로를 import 하므로 그 두 파일이 protocol을 직접
// 쓰게 될 때까지 이름만 이어 준다. 새 코드는 protocol을 직접 쓴다.
import type { PlayerView } from '@p2p-gostop/engine';
import { toBoardView as protocolBoardView, type BoardView } from '@p2p-gostop/protocol';

export { inFlightOf, progressOf } from '@p2p-gostop/protocol';
export type { InFlight } from '@p2p-gostop/protocol';

/** Board.svelte(fix/m3-display 소유)의 extras 입력: BoardView의 입력 정보 필드를 모은 것 */
export interface BoardExtras {
  readonly pickFirst: BoardView['firstPick'];
  readonly bombMonths: BoardView['bombMonths'];
  readonly canFlipOnly: boolean;
  readonly goStop: BoardView['goStop'];
  readonly dealer: BoardView['dealer'];
}

/** 옛 호출 모양(이름 + 잔액) → protocol toBoardView */
export function toBoardView(
  view: PlayerView,
  meta: { readonly names: readonly [string, string]; readonly balances: readonly [number, number] },
): BoardView {
  return protocolBoardView(view, {
    names: meta.names,
    ledger: { perPoint: 0, startBalance: 0, balances: meta.balances, entries: [] },
  });
}
