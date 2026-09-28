// 세션 원장 (MN-01·MN-02). 엔진 원장(판·즉시 정산)에 재충전 항목을 더한다.
// 엔진 함수는 항목 없는 원장으로 호출해 새 항목만 받아 붙인다(엔진 Ledger 타입을 바꾸지 않기 위해).
// 게임 메시지에는 전체 이력 대신 요약(LedgerSummary)만 싣는다(#23). 전체 이력은 ledgerGet으로 쪽 단위로 받는다.
import {
  applyInstantPayout,
  applySettlement,
  createLedger,
  type InstantPayout,
  type Ledger,
  type LedgerEntry,
  type RuleOptions,
  type Seat,
  type Settlement,
} from '@p2p-gostop/engine';

/** 파산한 좌석을 시작 잔액으로 되돌린 기록 (MN-02). 상대 잔액은 바꾸지 않는다 */
export interface RechargeEntry {
  readonly kind: 'recharge';
  readonly label: 'recharge';
  readonly seat: Seat;
  /** 더한 금액 (= after − before) */
  readonly amount: number;
  readonly before: number;
  readonly after: number;
}
export type SessionLedgerEntry = LedgerEntry | RechargeEntry;

/** 호스트가 보관하는 권위 원장. 엔진 Ledger와 같은 모양이며 항목에 재충전이 더해진다 */
export interface SessionLedger {
  readonly perPoint: number;
  readonly startBalance: number;
  readonly balances: readonly [number, number];
  readonly entries: readonly SessionLedgerEntry[];
}

/** 게임 메시지에 싣는 원장 요약. 항목은 최근 몇 개만, 전체 개수와 좌석별 재충전 합을 함께 보낸다 */
export interface LedgerSummary {
  readonly perPoint: number;
  readonly startBalance: number;
  readonly balances: readonly [number, number];
  /** 최근 항목 (최대 LEDGER_RECENT_LIMIT개, 오래된 것부터) */
  readonly recent: readonly SessionLedgerEntry[];
  /** 전체 항목 수. recent[0]의 색인은 entryCount − recent.length */
  readonly entryCount: number;
  /** 좌석별 재충전 누적 금액. 잔액 합 = 시작 잔액 × 2 + 재충전 합 (제로섬 대조) */
  readonly recharged: readonly [number, number];
}

export const LEDGER_RECENT_LIMIT = 8;

export function createSessionLedger(perPoint: number, startBalance: number): SessionLedger {
  return createLedger(perPoint, startBalance);
}

/** 엔진 함수에 넘길 항목 없는 원장 (잔액 상한 계산에는 잔액만 쓰인다) */
export function engineLedger(ledger: SessionLedger): Ledger {
  return {
    perPoint: ledger.perPoint,
    startBalance: ledger.startBalance,
    balances: ledger.balances,
    entries: [],
  };
}

function append(ledger: SessionLedger, next: Ledger): SessionLedger {
  return { ...ledger, balances: next.balances, entries: [...ledger.entries, ...next.entries] };
}

/** 판 정산 반영. 나가리면 원장이 그대로이고 entry는 null이다 */
export function withSettlement(
  ledger: SessionLedger,
  settlement: Settlement,
  rules: RuleOptions,
): { readonly ledger: SessionLedger; readonly entry: LedgerEntry | null } {
  const next = applySettlement(engineLedger(ledger), settlement, rules);
  return { ledger: append(ledger, next), entry: next.entries[0] ?? null };
}

export function withInstantPayout(
  ledger: SessionLedger,
  payout: InstantPayout,
  rules: RuleOptions,
): SessionLedger {
  return append(ledger, applyInstantPayout(engineLedger(ledger), payout, rules));
}

/** 파산한 좌석만 시작 잔액으로 되돌리고 recharge 항목을 남긴다 (MN-02, #26) */
export function withRecharge(ledger: SessionLedger, seat: Seat): SessionLedger {
  const before = ledger.balances[seat];
  const after = Math.max(before, ledger.startBalance);
  const balances: [number, number] = [ledger.balances[0], ledger.balances[1]];
  balances[seat] = after;
  const entry: RechargeEntry = {
    kind: 'recharge',
    label: 'recharge',
    seat,
    amount: after - before,
    before,
    after,
  };
  return { ...ledger, balances, entries: [...ledger.entries, entry] };
}

/** 좌석별 순변화: 항목을 모두 더한 값. 원장이 맞으면 balances − startBalance와 같다 (MN-01 대조) */
export function ledgerDelta(entries: readonly SessionLedgerEntry[]): readonly [number, number] {
  const delta: [number, number] = [0, 0];
  for (const entry of entries) {
    if (entry.kind === 'recharge') delta[entry.seat] += entry.amount;
    else {
      delta[entry.from] -= entry.amount;
      delta[entry.to] += entry.amount;
    }
  }
  return delta;
}

export function summarizeLedger(ledger: SessionLedger, limit = LEDGER_RECENT_LIMIT): LedgerSummary {
  const recharged: [number, number] = [0, 0];
  for (const entry of ledger.entries)
    if (entry.kind === 'recharge') recharged[entry.seat] += entry.amount;
  return {
    perPoint: ledger.perPoint,
    startBalance: ledger.startBalance,
    balances: ledger.balances,
    recent: ledger.entries.slice(Math.max(0, ledger.entries.length - limit)),
    entryCount: ledger.entries.length,
    recharged,
  };
}
