// 게임 화면(routes/Game.svelte)이 쓰는 공통 모양: 솔로·호스트·게스트가 같은 게임판·정산 화면을 쓴다(docs/design/ui-spec.md 13장).
// 화면은 playback(재생 큐의 반응형 상태)과 아래 값만 읽고, 입력은 submit/nextRound/refill/end로만 올린다.
import {
  equivalentTargets,
  sameAction,
  uniqueLegalAction,
  type Action,
  type PlayerView,
} from '@p2p-gostop/engine';
import type { BoardView } from '@p2p-gostop/protocol';
import type { DecisionClock, TimeoutResult } from '@p2p-gostop/protocol';
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

export interface PushDecision {
  readonly winner: boolean;
  readonly canPush: boolean;
  readonly nextMultiplier: number;
  readonly acceptAmount: number | null;
  readonly forfeitedPoints: number | null;
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
  /** 판 종료 뒤 승자의 수동 받기/밀기 선택. loser는 기다린다. */
  readonly pushDecision: PushDecision | null;
  readonly stats: GameStats;
  readonly decisionClock?: DecisionClock | null;
  readonly timerDecisionMs?: number | null;
  readonly timerRemainingMs?: number | null;
  readonly timerUncertain?: boolean;
  readonly timeoutResult?: TimeoutResult | null;
  /** 최신 뷰와 입력 상태를 DOM에 반영한 뒤 확인한다. */
  decisionRendered?(): void;
  submit(action: Action, tapAt?: number): boolean;
  /** 정산 화면 → 다음 판 */
  nextRound(): void;
  choosePush(push: boolean): void;
  /** 3분 이상 부재한 게스트 승자의 대리 받기는 호스트가 명시적으로 고른다. */
  acceptAbsentWinner?(): void;
  /** 장시간 중단 또는 시계 연속성 소실 때 진행 중인 판을 수동 무효로 한다. */
  abortRound?(): void;
  /** MN-02 재충전 */
  refill(): void;
  /** 세션 종료 */
  end(): void;
  attach(root: HTMLElement | null): void;
  skipAnimations(): void;
  /** C01·C02: 재생 후 최신 권위 뷰에서만 자동 입력을 예약한다. */
  autoAdvance(held: boolean): void;
}

/** BoardView의 floor/target pending은 PlayerView와 같은 공개 구조다. */
export function automaticAction(view: BoardView): Action | null {
  if (view.pending?.seat !== view.viewer || view.phase !== 'turn') return null;
  if (view.pending.kind === 'target') {
    const target = equivalentTargets(view as unknown as PlayerView, view.pending).representative;
    const action: Action | null =
      target === null ? null : { type: 'chooseTarget', seat: view.viewer, card: target };
    return action !== null && view.legal.some((legal) => sameAction(legal, action)) ? action : null;
  }
  if (view.pending.kind !== 'play') return null;
  return uniqueLegalAction(view.legal);
}

/** 같은 권위 순번의 입력은 한 번만 보낸다. 예약 사이에 뷰/보류 조건이 바뀌면 버린다. */
export class AutoChoice {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sent = new Set<string>();
  private readonly current: () => { view: BoardView | null; ready: boolean };
  private readonly submit: (action: Action) => boolean;
  private readonly onSent: ((action: Action) => void) | undefined;

  constructor(
    current: () => { view: BoardView | null; ready: boolean },
    submit: (action: Action) => boolean,
    onSent?: (action: Action) => void,
  ) {
    this.current = current;
    this.submit = submit;
    this.onSent = onSent;
  }

  advance(held: boolean): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (held) return;
    const { view, ready } = this.current();
    const action = ready && view !== null ? automaticAction(view) : null;
    if (view === null || action === null) return;
    const key = `${view.round}:${view.eventSeq}:${view.viewer}:${JSON.stringify(action)}`;
    if (this.sent.has(key)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const latest = this.current();
      const next = latest.ready && latest.view !== null ? automaticAction(latest.view) : null;
      if (
        latest.view?.round !== view.round ||
        latest.view.eventSeq !== view.eventSeq ||
        next === null ||
        !sameAction(next, action)
      )
        return;
      if (this.submit(action)) {
        this.sent.add(key);
        this.onSent?.(action);
      }
    }, 0);
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
