// 솔로 세션 기록 → 정산 화면·기록 화면 (spec 6.2, FR-18·FR-19). 판이 끝난 시점의 획득 패와 원장 기록으로 만든다.
import { scoreCaptured, type EndReason, type Seat } from '@p2p-gostop/engine';
import type { MoneyUnit, RecordRow, ScoreRowKind, SettlementView } from '../lib/view-types.ts';
import { INSTANT_LABEL } from '../ui/settle-labels.ts';
import type { RoundSummary } from './playback.svelte.ts';
import type { RoundRecord } from './session.ts';

const SCORE_ROWS: readonly ScoreRowKind[] = [
  'gwang',
  'godori',
  'hongdan',
  'cheongdan',
  'chodan',
  'yeol',
  'tti',
  'pi',
];

/** 엔진 종료 사유 → 화면 사유 (바닥·양측 총통은 총통으로 묶는다) */
function reasonOf(reason: EndReason): SettlementView['reason'] {
  return reason === 'floorChongtong' || reason === 'bothChongtong' ? 'chongtong' : reason;
}

export interface SettlementInput {
  readonly record: RoundRecord;
  readonly names: readonly [string, string];
  readonly unit: MoneyUnit;
  readonly perPoint: number;
}

/** 솔로 판 기록 → 정산 화면 */
export function soloSummary({ record, names, unit, perPoint }: SettlementInput): RoundSummary {
  const s = record.settlement;
  const isStop = s.reason === 'stop' || s.reason === 'autoStop';
  const winner = s.winner;
  const score =
    winner !== null && isStop ? scoreCaptured(record.captured[winner], s.gukjinAsPi[winner]) : null;
  const breakdown =
    score === null
      ? []
      : SCORE_ROWS.filter((kind) => score[kind] > 0).map((kind) => ({ kind, points: score[kind] }));
  const view: SettlementView = {
    winner,
    loser: s.loser,
    reason: reasonOf(s.reason),
    names,
    breakdown,
    steps: s.steps,
    finalPoints: s.finalPoints,
    pointValue: perPoint,
    amount: record.amount,
    unit,
    balances: [
      { before: record.before[0], after: record.after[0] },
      { before: record.before[1], after: record.after[1] },
    ],
  };
  return {
    view,
    instant: s.instantPayouts.map((p) => ({
      label: INSTANT_LABEL[p.kind] ?? p.kind,
      name: names[p.to],
      points: p.points,
    })),
    nextCarry: winner === null ? s.nextCarry : null,
  };
}

export interface RecordInput {
  readonly round: number;
  readonly winner: Seat | null;
  readonly reason: EndReason;
  readonly points: number;
  readonly before: readonly [number, number];
  readonly after: readonly [number, number];
}

/** 기록 한 줄: 금액은 좌석 0 기준 잔액 변화(즉시 정산 포함) */
export function toRecordRow(r: RecordInput): RecordRow {
  return {
    round: r.round,
    winner: r.winner,
    reason: r.winner === null ? 'nagari' : reasonOf(r.reason),
    points: r.points,
    amount: r.after[0] - r.before[0],
  };
}
