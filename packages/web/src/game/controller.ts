// 게임 화면(routes/Game.svelte)이 쓰는 공통 모양: 솔로·호스트·게스트가 같은 게임판·정산 화면을 쓴다(docs/design/ui-spec.md 13장).
// 화면은 playback(재생 큐의 반응형 상태)과 아래 값만 읽고, 입력은 submit/nextRound/refill/end로만 올린다.
import type { Action } from '@p2p-gostop/engine';
import type { Playback } from './playback.svelte.ts';

export type GameMode = 'solo' | 'host' | 'guest';

/** E2E·원장 검사가 읽는 요약 (게임 루트 data-* 속성) */
export interface GameStats {
  readonly round: number;
  /** playing | roundOver | bankrupt | ended (솔로 세션 단계와 같은 이름) */
  readonly phase: string;
  readonly roundsPlayed: number;
  readonly balances: readonly [number, number];
  /** 재충전 합 [좌석0, 좌석1]. 모르면 null (게스트) */
  readonly refilled: readonly [number, number] | null;
  readonly startBalance: number;
  /** 마지막으로 반영한 세션 순번 (호스트·게스트) */
  readonly seq: number | null;
}

export interface GameController {
  readonly mode: GameMode;
  readonly playback: Playback;
  /** 지금 이 기기 좌석이 입력할 차례 (재생·상대·연결 대기 중이 아님) */
  readonly canAct: boolean;
  /** 상대가 고르는 중 (CPU 생각 또는 원격 상대 차례) */
  readonly thinking: boolean;
  /** 잔액 0: 재충전·종료 선택 (MN-02) */
  readonly bankrupt: boolean;
  /** 판 밖의 상태 안내 (연결 끊김 등). 없으면 null */
  readonly notice: string | null;
  /** 정산 화면 안내 (셔플 검증 결과·상대 선택 대기 등) */
  readonly settlementNote?: string | null;
  /** 정산 화면의 "다음 판"을 잠근다 (상대의 파산 선택 대기) */
  readonly settlementWaiting?: boolean;
  readonly stats: GameStats;
  submit(action: Action, tapAt?: number): boolean;
  /** 정산 화면 → 다음 판 */
  nextRound(): void;
  /** MN-02 재충전 */
  refill(): void;
  /** 세션 종료 */
  end(): void;
  attach(root: HTMLElement | null): void;
  skipAnimations(): void;
}
