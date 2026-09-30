// 솔로 세션 기록 → 정산 화면 (spec 6.2, FR-18·FR-19). 정산 뷰(국진 위치 포함)는 M3 어댑터의 toSettlementView를 쓰고,
// 즉시 정산 줄과 나가리 다음 판 배수를 붙인다.
import { INSTANT_LABEL } from '../ui/settle-labels.ts';
import { applySettlement, settle } from '@p2p-gostop/engine';
import { toSettlementView } from './adapter.ts';
import type { MoneyUnit } from '../lib/view-types.ts';
import type { RoundSummary } from './playback.svelte.ts';
import type { RoundRecord, SessionConfig, SessionState } from './session.ts';

/** 받기를 고를 경우의 읽기 전용 정산. 기존 원장/기록은 그대로 둔다. */
export function pendingSoloSummary(session: SessionState, unit: MoneyUnit): RoundSummary {
  const settlement = settle(session.game);
  const projected = applySettlement(session.ledger, settlement, session.config.rules);
  return soloSummary(
    {
      winner: settlement.winner,
      settlement,
      captured: [session.game.seats[0].captured, session.game.seats[1].captured],
      before: session.roundStart,
      after: projected.balances,
      amount: Math.abs(projected.balances[0] - session.ledger.balances[0]),
    },
    session.config,
    unit,
  );
}

type SettlementRecord = Pick<
  RoundRecord,
  'settlement' | 'captured' | 'amount' | 'before' | 'after' | 'winner'
>;

/** 솔로 판 기록 → 정산 화면. 확정 기록과 예상 정산은 같은 입력만 변환한다. */
export function soloSummary(
  record: SettlementRecord,
  { names, perPoint }: Pick<SessionConfig, 'names' | 'perPoint'>,
  unit: MoneyUnit,
): RoundSummary {
  const s = record.settlement;
  return {
    view: toSettlementView({
      ...record,
      names,
      unit,
      perPoint,
    }),
    instant: s.instantPayouts.map((p) => ({
      label: INSTANT_LABEL[p.kind] ?? p.kind,
      name: names[p.to],
      points: p.points,
    })),
    nextCarry: record.winner === null ? s.nextCarry : null,
  };
}
