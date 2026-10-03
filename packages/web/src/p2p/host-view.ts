// 좌석 0의 화면 투영. 전송·저장·반응형 상태를 소유하지 않는다 (NP-02·06, plan §1.3).
import {
  reduce,
  redactEvent,
  settle,
  applySettlement,
  type Action,
  type EngineEvent,
  type GameState,
  type Seat,
} from '@p2p-gostop/engine';
import type { BoardView, HostSession } from '@p2p-gostop/protocol';
import { gukjinPlacements, toSettlementView, withSeatExtras } from '../game/adapter.ts';
import type { RoundSummary } from '../game/playback.svelte.ts';
import { INSTANT_LABEL } from '../ui/settle-labels.ts';

const ME: Seat = 0;

export interface PendingAction {
  readonly before: GameState;
  readonly action: Action;
  readonly tapAt: number | null;
  readonly mine: boolean;
}

/** 좌석 0 화면 + 표시용 좌석 값(국진 위치·폭탄 횟수) */
export function hostBoard(session: HostSession | null): BoardView | null {
  const view = session?.hostView() ?? null;
  const state = session?.state ?? null;
  if (view === null || state === null) return null;
  const stats = (seat: Seat) => ({
    gukjinAsPi: state.seats[seat].score.gukjinAsPi,
    bombs: state.seats[seat].bombs,
  });
  return withSeatExtras(view, [stats(0), stats(1)]);
}

/** 판이 끝났다(settled·bankrupt): 정산 화면을 한 번 띄우고 기록한다 */
export function hostSummary(session: HostSession | null): RoundSummary | null {
  const view = session?.settlementView ?? null;
  const settlement = session?.settlement ?? null;
  const state = session?.state ?? null;
  const board = hostBoard(session);
  if (session === null || view === null || settlement === null || state === null || board === null)
    return null;
  const names = session.names;
  return {
    view: {
      ...view,
      gukjin: gukjinPlacements(settlement, [state.seats[0].captured, state.seats[1].captured]),
    },
    instant: settlement.instantPayouts.map((p) => ({
      label: INSTANT_LABEL[p.kind] ?? p.kind,
      name: names[p.to],
      points: p.points,
    })),
    nextCarry: settlement.winner === null ? settlement.nextCarry : null,
  };
}

/** 받기를 고를 경우의 읽기 전용 표시. 순수 반환값만 쓰며 세션 원장·기록에는 대입하지 않는다. */
export function pendingHostSummary(session: HostSession): RoundSummary | null {
  const state = session.state;
  if (state?.phase !== 'end') return null;
  const settlement = settle(state);
  const ledger = session.ledger;
  const projected = applySettlement(
    {
      perPoint: ledger.perPoint,
      startBalance: ledger.startBalance,
      balances: ledger.balances,
      entries: [],
    },
    settlement,
    session.rules,
  );
  const winner = settlement.winner;
  const names = session.names;
  return {
    view: toSettlementView({
      settlement,
      captured: [state.seats[0].captured, state.seats[1].captured],
      names,
      unit: session.toJSON().unit,
      perPoint: ledger.perPoint,
      amount: winner === null ? 0 : projected.balances[winner] - ledger.balances[winner],
      before: ledger.balances,
      after: projected.balances,
    }),
    instant: settlement.instantPayouts.map((p) => ({
      label: INSTANT_LABEL[p.kind] ?? p.kind,
      name: names[p.to],
      points: p.points,
    })),
    nextCarry: winner === null ? settlement.nextCarry : null,
  };
}

/** 같은 순수 액션에서 호스트가 볼 이벤트를 재구성한다. 분배는 보낸 목록을 쓴다. */
export function hostEvents(
  sent: readonly EngineEvent[],
  pending: PendingAction | null,
): readonly EngineEvent[] {
  let events = sent;
  if (pending !== null) {
    const result = reduce(pending.before, pending.action);
    if (result.ok) events = result.events;
  }
  return events.map((event) => redactEvent(event, ME));
}
