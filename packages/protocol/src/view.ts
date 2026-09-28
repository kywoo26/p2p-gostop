// 엔진의 가려진 PlayerView를 화면 계약으로 바꾼다. 이름·원장은 세션 문맥에서만 온다.
import {
  getCard,
  type EngineEvent,
  type Ledger,
  type PlayerView,
  type Settlement,
} from '@p2p-gostop/engine';
import type {
  BoardView,
  JokboProgress,
  MoneyUnit,
  PromptView,
  SettlementView,
} from './view-types.ts';

export interface ViewContext {
  readonly names: readonly [string, string];
  readonly ledger: Ledger;
  readonly unit?: MoneyUnit;
}
function progress(view: PlayerView, seat: 0 | 1): JokboProgress {
  const captured = view.seats[seat].captured;
  const all = [...captured.gwang, ...captured.yeol, ...captured.tti, ...captured.pi];
  const ribbons = all.map((id) => getCard(id).ribbon);
  return {
    gwang: captured.gwang.length,
    godori: all.filter((id) => getCard(id).isGodori).length,
    dan: Math.max(
      ...(['hong', 'cheong', 'cho'] as const).map(
        (kind) => ribbons.filter((r) => r === kind).length,
      ),
    ),
    pi:
      captured.pi.reduce((n, id) => n + getCard(id).piValue, 0) +
      (view.seats[seat].score.gukjinAsPi ? 2 : 0),
  };
}
function prompt(view: PlayerView): PromptView | null {
  const p = view.pending;
  if (p === null || p.kind === 'pickFirst') return null;
  if (p.kind === 'goStop')
    return { ...p, stopAmount: view.stopPreview?.money ?? 0, goCount: view.seats[p.seat].goCount };
  if (p.kind === 'chongtong') return { kind: p.kind, seat: p.seat, months: p.months };
  return p;
}
export function toBoardView(view: PlayerView, ctx: ViewContext): BoardView {
  const seatView = (seat: 0 | 1) => {
    const current = view.seats[seat];
    return {
      name: ctx.names[seat],
      handCount: current.handCount,
      hand: current.hand,
      captured: current.captured,
      score: current.score.total,
      goCount: current.goCount,
      shakes: current.shakes,
      ppeokCount: current.ppeokCount,
      balance: ctx.ledger.balances[seat],
      progress: progress(view, seat),
    };
  };
  const seats: BoardView['seats'] = [seatView(0), seatView(1)];
  const active = view.seats[view.turn];
  const multiplier =
    view.stopPreview?.multiplier ??
    view.round.carry * 2 ** (active.shakes + active.bombs + Math.max(0, active.goCount - 2));
  return {
    viewer: view.viewer,
    turn: view.turn,
    seats,
    floor: view.floor,
    deckCount: view.deckCount,
    multiplier,
    pending: prompt(view),
    playable: view.legal.flatMap((action) => (action.type === 'play' ? [action.card] : [])),
    round: view.round.number,
    eventSeq: view.eventSeq,
  };
}
export function toSettlementView(
  settlement: Settlement,
  view: PlayerView,
  before: Ledger,
  after: Ledger,
  ctx: Pick<ViewContext, 'names' | 'unit'>,
): SettlementView {
  const winner = settlement.winner;
  const breakdown =
    winner === null
      ? []
      : (['gwang', 'yeol', 'godori', 'tti', 'hongdan', 'cheongdan', 'chodan', 'pi'] as const)
          .map((kind) => ({ kind, points: view.seats[winner].score[kind] }))
          .filter((row) => row.points > 0);
  return {
    winner,
    loser: settlement.loser,
    reason:
      settlement.reason === 'floorChongtong' || settlement.reason === 'bothChongtong'
        ? 'chongtong'
        : settlement.reason,
    names: ctx.names,
    breakdown,
    steps: settlement.steps,
    finalPoints: settlement.finalPoints,
    pointValue: before.perPoint,
    amount: after.entries.at(-1)?.kind === 'round' ? after.entries.at(-1)!.amount : 0,
    unit: ctx.unit ?? '냥',
    balances: [
      { before: before.balances[0], after: after.balances[0] },
      { before: before.balances[1], after: after.balances[1] },
    ],
  };
}
/** 애니메이션 타입의 단일 근거는 엔진 이벤트다. */
export type ProtocolEvent = EngineEvent;
