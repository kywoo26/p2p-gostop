// 판의 점수를 확정하고 종료 이벤트를 발행한다 (FR-10/11, plan §1.4).
// 턴·초기 분배 양쪽이 같은 순서의 점수/정산 경로를 사용한다.
import { emit, other, type Tx } from './draft.ts';
import { seatScore } from './score.ts';
import { settle } from './settle.ts';
import type { EndReason, ScoreBreakdown, Seat } from './state.ts';

/**
 * 점수 분해가 같은지 (필드별 비교). 예전의 JSON.stringify 비교와 결과가 같고(두 값 모두 scoreCaptured가 같은 키로 만든다)
 * 롤아웃에서 reduce 비용의 큰 몫이던 직렬화를 없앤다(ai-tuning.md §6-6).
 */
function sameScore(a: ScoreBreakdown, b: ScoreBreakdown): boolean {
  return (
    a.total === b.total &&
    a.gwang === b.gwang &&
    a.yeol === b.yeol &&
    a.godori === b.godori &&
    a.tti === b.tti &&
    a.hongdan === b.hongdan &&
    a.cheongdan === b.cheongdan &&
    a.chodan === b.chodan &&
    a.pi === b.pi &&
    a.gwangCount === b.gwangCount &&
    a.yeolCount === b.yeolCount &&
    a.ttiCount === b.ttiCount &&
    a.piCount === b.piCount &&
    a.gukjinAsPi === b.gukjinAsPi
  );
}

/** SCORE: 두 좌석 점수를 다시 계산하고 바뀐 좌석마다 ScoreChanged를 낸다(차례인 좌석 먼저: 좌석 대칭). */
export function recomputeScores(tx: Tx): void {
  const first = tx.s.ctx?.seat ?? tx.s.turn;
  for (const seat of [first, other(first)]) {
    const state = tx.s.seats[seat];
    const next = seatScore(state.captured, state.gukjinAsPi, tx.s.rules);
    if (!sameScore(state.score, next)) {
      state.score = next;
      emit(tx, { type: 'ScoreChanged', seat, cards: [], breakdown: next });
    }
  }
}

/** 점수 갱신 → 판 종료 → 정산 → 나가리 순서로 판 결과를 확정한다. */
export function endRound(tx: Tx, reason: EndReason, winner: Seat | null): void {
  recomputeScores(tx);
  const s = tx.s;
  s.phase = 'end';
  s.pending = null;
  s.ctx = null;
  s.result = { reason, winner };
  emit(tx, { type: 'RoundEnded', seat: winner, cards: [], reason, winner });
  const settlement = settle(s);
  emit(tx, { type: 'Settled', seat: winner, cards: [], settlement });
  if (winner === null) {
    emit(tx, { type: 'Nagari', seat: null, cards: [], multiplier: settlement.nextCarry });
  }
}
