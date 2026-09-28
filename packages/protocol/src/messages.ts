// NP-02: 호스트↔게스트 메시지 타입. 스키마는 schema.ts, 직렬화는 index.ts.
import type { Action, EngineEvent, RoundOptions, RuleOptions, Seat } from '@p2p-gostop/engine';
import type { LedgerSummary, SessionLedgerEntry } from './ledger.ts';
import type { BoardView, SettlementView } from './view-types.ts';

export type Role = 'host' | 'guest';
export type ErrorCode =
  | 'MALFORMED'
  | 'TOO_LARGE'
  | 'VERSION_MISMATCH'
  | 'TOKEN_INVALID'
  | 'STALE_SEQ'
  | 'ILLEGAL_ACTION'
  | 'COMMIT_INVALID'
  | 'ROUND_NOT_READY'
  | 'BANKRUPT';
export const ERROR_CODES: readonly ErrorCode[] = [
  'MALFORMED',
  'TOO_LARGE',
  'VERSION_MISMATCH',
  'TOKEN_INVALID',
  'STALE_SEQ',
  'ILLEGAL_ACTION',
  'COMMIT_INVALID',
  'ROUND_NOT_READY',
  'BANKRUPT',
];

/**
 * 세션 단계 (#26). 판과 판 사이에 명시적 대기(settled)를 둔다.
 * lobby → handshake(commit-reveal) → playing → settled(정산 화면, 호스트 nextRound 대기) → handshake …
 * 잔액 0이면 settled 대신 bankrupt(파산 좌석의 선택 대기), 종료 선택·호스트 종료면 ended.
 */
export type SessionStage = 'lobby' | 'handshake' | 'playing' | 'settled' | 'bankrupt' | 'ended';
export interface RoundStatus {
  /** 호스트가 단계·준비·파산 상태를 바꿀 때마다 1씩 는다. 게스트는 더 작은 rev를 무시한다(순서 바뀜 대비) */
  readonly rev: number;
  readonly stage: SessionStage;
  /** 진행 중(또는 방금 끝난) 판 번호. lobby에서는 첫 판 번호 */
  readonly round: number;
  /** settled에서 다음 판을 요청한 좌석 (게스트 ready, 호스트는 nextRound가 곧 확정) */
  readonly ready: readonly [boolean, boolean];
  /** bankrupt에서 선택을 기다리는 좌석 */
  readonly bankrupt: readonly Seat[];
  /** ended의 이유 */
  readonly endReason: 'bankruptcy' | 'host' | null;
}

export type GuestMessage =
  | {
      readonly t: 'hello';
      readonly v: number;
      readonly name: string;
      readonly sessionToken?: string;
      readonly lastSeq?: number;
      /** 게스트가 마지막으로 본 호스트 세대 (호스트 복원 감지용, 진단) */
      readonly epoch?: string;
    }
  | { readonly t: 'action'; readonly seq: number; readonly payload: Action }
  | { readonly t: 'push'; readonly seq: number }
  | { readonly t: 'ping' }
  | { readonly t: 'log'; readonly entries: readonly string[] }
  | { readonly t: 'commitGuest'; readonly round: number; readonly hash: string }
  | { readonly t: 'revealGuest'; readonly round: number; readonly secret: string }
  /** settled 단계에서 다음 판을 요청한다 (시작은 호스트 nextRound) */
  | { readonly t: 'ready'; readonly round: number }
  | { readonly t: 'bankruptcy'; readonly choice: 'recharge' | 'end' }
  /** 원장 전체 이력 요청 (ledger.get). from = 시작 색인 */
  | { readonly t: 'ledgerGet'; readonly from: number };

export type HostMessage =
  | {
      readonly t: 'welcome';
      readonly v: number;
      readonly seat: Seat;
      readonly sessionToken: string;
      readonly rules: RuleOptions;
      readonly ledger: LedgerSummary;
      readonly names: readonly [string, string];
      /** 호스트 세대. 생성·복원(fromJSON)마다 바뀐다 */
      readonly epoch: string;
      /** 호스트의 현재 순번. 게스트 lastSeq보다 작으면 호스트가 되감긴 것(복원) */
      readonly seq: number;
      readonly status: RoundStatus;
    }
  | {
      readonly t: 'snapshot';
      readonly seq: number;
      readonly view: BoardView;
      readonly ledger: LedgerSummary;
      readonly settlement?: SettlementView;
      readonly status: RoundStatus;
    }
  | {
      readonly t: 'events';
      readonly from: number;
      readonly to: number;
      readonly list: readonly EngineEvent[];
      readonly view: BoardView;
      readonly ledger: LedgerSummary;
      readonly settlement?: SettlementView;
      readonly status: RoundStatus;
    }
  /** 뷰는 그대로이고 단계·준비·파산 상태만 바뀜 */
  | { readonly t: 'status'; readonly seq: number; readonly status: RoundStatus }
  | {
      readonly t: 'reject';
      readonly seq: number;
      readonly reason: ErrorCode;
      readonly message: string;
    }
  | { readonly t: 'pong' }
  | { readonly t: 'commitHost'; readonly round: number; readonly hash: string }
  | { readonly t: 'revealGuestRequest'; readonly round: number; readonly guestHash: string }
  | { readonly t: 'roundAborted'; readonly round: number; readonly reason: string }
  | {
      readonly t: 'revealHost';
      readonly round: number;
      readonly secret: string;
      readonly guestSecret: string;
      readonly seed: readonly [number, number, number, number];
      readonly actions: readonly Action[];
      readonly hostHash: string;
      readonly guestHash: string;
      readonly options: RoundOptions;
      /** 이 판 첫 이벤트의 세션 순번. 게스트가 받은 이벤트와 리플레이 이벤트를 맞춰 보는 기준 */
      readonly firstSeq: number;
    }
  | {
      readonly t: 'bankruptcyPrompt';
      readonly balances: readonly [number, number];
      readonly round: number;
      /** 선택할 좌석 (잔액 0). 게스트는 자기 좌석(1)이 있을 때만 고른다 */
      readonly seats: readonly Seat[];
    }
  | { readonly t: 'sessionEnd'; readonly reason: 'bankruptcy' | 'host'; readonly seat: Seat | null }
  | {
      readonly t: 'ledgerPage';
      readonly from: number;
      readonly total: number;
      readonly entries: readonly SessionLedgerEntry[];
    };
export type Message = GuestMessage | HostMessage;
