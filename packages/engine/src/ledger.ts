// 가상 머니 원장 (spec MN-01·MN-02, rules 12.6 M1~M3). 순수 함수: 새 원장을 돌려준다.
import type { RuleOptions } from './rules.ts';
import type { InstantPayout, Seat, Settlement } from './state.ts';

export interface LedgerEntry {
  readonly kind: 'round' | 'instant';
  /** 정산 사유 (EndReason 또는 즉시 정산 종류) */
  readonly label: string;
  readonly from: Seat;
  readonly to: Seat;
  readonly points: number;
  /** 점수 × 점당 (상한 적용 전) */
  readonly requested: number;
  /** 실제 이동 금액 */
  readonly amount: number;
  /** 상한 때문에 줄었는지 (올인) */
  readonly capped: boolean;
}

export interface Ledger {
  readonly perPoint: number;
  readonly startBalance: number;
  readonly balances: readonly [number, number];
  readonly entries: readonly LedgerEntry[];
}

export function createLedger(perPoint: number, startBalance: number): Ledger {
  return { perPoint, startBalance, balances: [startBalance, startBalance], entries: [] };
}

/**
 * 점수만큼 금액을 옮긴다. M1: 점수 × 점당, M2: 패자 잔액까지(올인), 선택 시 승자 보유액까지(유한책임제), M3: 수수료 없음.
 */
function transfer(
  ledger: Ledger,
  kind: LedgerEntry['kind'],
  label: string,
  from: Seat,
  to: Seat,
  points: number,
  rules: RuleOptions,
): Ledger {
  const requested = points * ledger.perPoint;
  let amount = Math.min(requested, Math.max(0, ledger.balances[from]));
  if (rules.limitedLiability) {
    amount = Math.min(amount, Math.max(0, ledger.balances[to]));
  }
  const balances: [number, number] = [ledger.balances[0], ledger.balances[1]];
  balances[from] -= amount;
  balances[to] += amount;
  const entry: LedgerEntry = {
    kind,
    label,
    from,
    to,
    points,
    requested,
    amount,
    capped: amount < requested,
  };
  return { ...ledger, balances, entries: [...ledger.entries, entry] };
}

/** 즉시 정산(첫뻑·연뻑·3연뻑·첫따닥)을 발생 시점에 원장에 기록한다 (FR-18, 12.8). */
export function applyInstantPayout(
  ledger: Ledger,
  payout: InstantPayout,
  rules: RuleOptions,
): Ledger {
  return transfer(ledger, 'instant', payout.kind, payout.from, payout.to, payout.points, rules);
}

/** 판 정산을 원장에 기록한다. 나가리(승자 없음)와 밀기로 포기한 판(pushed)은 원장을 바꾸지 않는다. */
export function applySettlement(ledger: Ledger, result: Settlement, rules: RuleOptions): Ledger {
  if (result.winner === null || result.loser === null || result.pushed === true) {
    return ledger;
  }
  return transfer(
    ledger,
    'round',
    result.reason,
    result.loser,
    result.winner,
    result.finalPoints,
    rules,
  );
}
