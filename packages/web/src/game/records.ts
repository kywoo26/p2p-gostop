// 솔로 세션 기록 → 정산 화면 (spec 6.2, FR-18·FR-19). 정산 뷰(국진 위치 포함)는 M3 어댑터의 toSettlementView를 쓰고,
// 즉시 정산 줄과 나가리 다음 판 배수를 붙인다.
import { INSTANT_LABEL } from '../ui/settle-labels.ts';
import { toSettlementView } from './adapter.ts';
import type { MoneyUnit } from '../lib/view-types.ts';
import type { RoundSummary } from './playback.svelte.ts';
import type { RoundRecord } from './session.ts';

export interface SettlementInput {
  readonly record: RoundRecord;
  readonly names: readonly [string, string];
  readonly unit: MoneyUnit;
  readonly perPoint: number;
}

/** 솔로 판 기록 → 정산 화면 */
export function soloSummary({ record, names, unit, perPoint }: SettlementInput): RoundSummary {
  const s = record.settlement;
  return {
    view: toSettlementView({
      settlement: s,
      captured: record.captured,
      names,
      unit,
      perPoint,
      amount: record.amount,
      before: record.before,
      after: record.after,
    }),
    instant: s.instantPayouts.map((p) => ({
      label: INSTANT_LABEL[p.kind] ?? p.kind,
      name: names[p.to],
      points: p.points,
    })),
    nextCarry: record.winner === null ? s.nextCarry : null,
  };
}
