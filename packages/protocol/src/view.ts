// 엔진의 가려진 PlayerView를 화면 계약으로 바꾼다. 이름·원장은 세션 문맥에서만 온다.
import {
  getCard,
  type CardId,
  type EngineEvent,
  type Ledger,
  type PlayerView,
  type Seat,
  type Settlement,
} from '@p2p-gostop/engine';
import type {
  BoardView,
  CapturedView,
  InFlight,
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
// STUB(I1): fix/protocol-review가 대체한다 (M3 web 어댑터와 같은 계산)
const otherSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

/** 족보 진행도 (spec 6.1: 광 n/3, 고도리 n/3, 단 n/3, 피 n/10). 국진을 쌍피로 세면 피에 2를 더한다 */
export function progressOf(captured: CapturedView, gukjinAsPi = false): JokboProgress {
  const hasGukjin = captured.yeol.some((id) => getCard(id).isGukjin);
  const ribbons = captured.tti.map((id) => getCard(id).ribbon);
  const dan = Math.max(
    0,
    ...(['hong', 'cheong', 'cho'] as const).map((r) => ribbons.filter((x) => x === r).length),
  );
  const piValue = captured.pi.reduce((sum, id) => sum + getCard(id).piValue, 0);
  return {
    gwang: captured.gwang.length,
    godori: captured.yeol.filter((id) => getCard(id).isGodori).length,
    dan,
    pi: piValue + (gukjinAsPi && hasGukjin ? 2 : 0),
  };
}

/**
 * 지금 스톱하면 적용될 보는 좌석의 배수 (spec 6.1 "현재 배수").
 * 고/스톱 중이면 엔진 미리보기, 아니면 흔들기·폭탄·고·이월·대박판의 곱.
 */
function currentMultiplier(view: PlayerView): number {
  if (view.stopPreview !== null) return view.stopPreview.multiplier;
  const seat = view.seats[view.viewer];
  let m = 2 ** (seat.shakes + seat.bombs);
  if (seat.goCount >= 3) m *= 2 ** (seat.goCount - 2);
  m *= view.round.carry;
  const jackpot = view.rules.jackpotRound;
  if (jackpot !== null && jackpot.every > 0 && view.round.number % jackpot.every === 0) {
    m *= jackpot.multiplier;
  }
  return m;
}

function prompt(view: PlayerView): PromptView | null {
  const p = view.pending;
  if (p === null || p.kind === 'pickFirst') return null;
  switch (p.kind) {
    case 'play':
      return { kind: 'play', seat: p.seat };
    case 'target':
      return { kind: 'target', seat: p.seat, source: p.source, card: p.card, options: p.options };
    case 'goStop':
      return {
        kind: 'goStop',
        seat: p.seat,
        score: p.score,
        goCount: view.seats[p.seat].goCount,
        stopAmount: view.stopPreview?.money ?? view.stopPreview?.requested ?? 0,
      };
    case 'shake':
      return { kind: 'shake', seat: p.seat, card: p.card, month: p.month };
    case 'gukjin':
      return { kind: 'gukjin', seat: p.seat };
    default:
      return { kind: 'chongtong', seat: p.seat, months: p.months };
  }
}

/** 보는 좌석의 합법 수에서 프롬프트 밖의 입력 정보를 뽑는다 */
function extrasOf(view: PlayerView) {
  const picks = view.legal.filter((a) => a.type === 'pickFirst');
  const preview = view.stopPreview;
  return {
    pickFirst:
      picks.length > 0 && view.firstPick !== null
        ? {
            poolSize: view.firstPick.poolSize,
            taken: view.firstPick.picks[otherSeat(view.viewer)],
          }
        : null,
    bombMonths: view.legal.flatMap((a) => (a.type === 'bomb' ? [a.month] : [])),
    canFlipOnly: view.legal.some((a) => a.type === 'flipOnly'),
    goStop:
      preview === null
        ? null
        : {
            points: preview.points,
            steps: preview.steps,
            multiplier: preview.multiplier,
            money: preview.money,
            capped: preview.capped,
          },
    dealer: view.dealer,
  } as const;
}

/** 대상 고르기 동안 손을 떠났지만 아직 바닥·획득패에 없는 카드 (낸 패, 뒤집은 패, 들고 있는 보너스) */
export function inFlightOf(view: PlayerView): InFlight {
  const ctx = view.ctx;
  if (ctx === null) return { played: null, staged: [] };
  const visible = new Set<CardId>(view.floor.flatMap((g) => g.cards));
  for (const s of view.seats) {
    const c = s.captured;
    for (const id of [...c.gwang, ...c.yeol, ...c.tti, ...c.pi, ...(s.hand ?? [])]) visible.add(id);
  }
  const played = ctx.played !== null && !visible.has(ctx.played) ? ctx.played : null;
  const staged = [...ctx.heldBonuses, ...(ctx.flipped === null ? [] : [ctx.flipped])].filter(
    (id) => !visible.has(id),
  );
  return { played, staged };
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
      progress: progressOf(current.captured, current.score.gukjinAsPi),
      gukjinAsPi: current.score.gukjinAsPi,
      bombs: current.bombs,
    };
  };
  const seats: BoardView['seats'] = [seatView(0), seatView(1)];
  const extras = extrasOf(view);
  return {
    viewer: view.viewer,
    turn: view.turn,
    seats,
    floor: view.floor,
    deckCount: view.deckCount,
    multiplier: currentMultiplier(view),
    pending: prompt(view),
    playable: [...new Set(view.legal.flatMap((a) => (a.type === 'play' ? [a.card] : [])))],
    round: view.round.number,
    eventSeq: view.eventSeq,
    legal: view.legal,
    firstPick: extras.pickFirst,
    inFlight: inFlightOf(view),
    goStop: extras.goStop,
    bombMonths: extras.bombMonths,
    canFlipOnly: extras.canFlipOnly,
    dealer: extras.dealer,
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
