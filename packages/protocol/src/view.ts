// 엔진의 가려진 PlayerView를 화면 계약(BoardView·SettlementView)으로 바꾼다. 이름·잔액은 세션 문맥에서만 온다.
// M3 솔로 어댑터(packages/web/src/game/adapter.ts)의 계산을 그대로 옮겼다(#12): 배수·진행도·합법 수·inFlight가
// 호스트·게스트·솔로에서 같은 값이 되도록 이 파일이 단일 근거다. 어댑터와 같은 이름·시그니처도 함께 낸다(BoardMeta 등).
import {
  getCard,
  scoreCaptured,
  type CapturedPile,
  type CardId,
  type EndReason,
  type EngineEvent,
  type Ledger,
  type PlayerView,
  type Seat,
  type Settlement,
} from '@p2p-gostop/engine';
import type {
  BoardView,
  CapturedView,
  GoStopDetail,
  InFlight,
  JokboProgress,
  MoneyUnit,
  PromptView,
  RecordRow,
  ScoreRowKind,
  SeatView,
  SettlementView,
} from './view-types.ts';

/** 세션 문맥: 좌석 이름과 원장 잔액 */
export interface ViewContext {
  readonly names: readonly [string, string];
  readonly ledger: Pick<Ledger, 'balances'>;
  readonly unit?: MoneyUnit;
}
/** M3 어댑터와 같은 모양의 문맥 (좌석 이름, 원장 잔액) */
export interface BoardMeta {
  readonly names: readonly [string, string];
  readonly balances: readonly [number, number];
}

const otherSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

/** 족보 진행도 (spec 6.1: 광 n/3, 고도리 n/3, 단 n/3, 피 n/10). 국진을 쌍피로 세면 열끗에서 빼고 피에 2를 더한다 */
export function progressOf(captured: CapturedView, gukjinAsPi = false): JokboProgress {
  const hasGukjin = captured.yeol.some((id) => getCard(id).isGukjin);
  const movesGukjin = gukjinAsPi && hasGukjin;
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
    pi: piValue + (movesGukjin ? 2 : 0),
  };
}

/**
 * 지금 스톱하면 적용될 배수 (spec 6.1 "현재 배수"). **보는 좌석** 기준이다.
 * 고/스톱 중이면 엔진 미리보기, 아니면 흔들기·폭탄·고(3고부터)·나가리 이월·대박판의 곱.
 */
export function currentMultiplier(view: PlayerView): number {
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

function promptOf(view: PlayerView): PromptView | null {
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

function balancesOf(ctx: ViewContext | BoardMeta): readonly [number, number] {
  return 'ledger' in ctx ? ctx.ledger.balances : ctx.balances;
}

function seatOf(
  view: PlayerView,
  seat: Seat,
  names: readonly [string, string],
  balances: readonly [number, number],
): SeatView {
  const s = view.seats[seat];
  return {
    name: names[seat],
    handCount: s.handCount,
    hand: s.hand,
    captured: s.captured,
    score: s.score.total,
    goCount: s.goCount,
    shakes: s.shakes,
    ppeokCount: s.ppeokCount,
    balance: balances[seat],
    progress: progressOf(s.captured, s.score.gukjinAsPi),
  };
}

/**
 * 진행 중인 턴에서 아직 바닥·손패·획득패 어디에도 보이지 않는 카드: 낸 패와 뒤집은 패·들고 있는 보너스.
 * 모두 이미 공개된 카드(CardPlayed·CardFlipped 이벤트)라서 게스트에게 보내도 된다.
 */
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

function goStopOf(view: PlayerView): GoStopDetail | null {
  const preview = view.stopPreview;
  return preview === null
    ? null
    : {
        points: preview.points,
        steps: preview.steps,
        multiplier: preview.multiplier,
        money: preview.money,
        capped: preview.capped,
      };
}

/** PlayerView → BoardView (spec 6.1·6.2, FR-12·FR-14). 합법 수는 보는 좌석의 것만 들어간다 */
export function toBoardView(view: PlayerView, ctx: ViewContext | BoardMeta): BoardView {
  const balances = balancesOf(ctx);
  const playable = [...new Set(view.legal.flatMap((a) => (a.type === 'play' ? [a.card] : [])))];
  const picks = view.legal.some((a) => a.type === 'pickFirst');
  return {
    viewer: view.viewer,
    turn: view.turn,
    seats: [seatOf(view, 0, ctx.names, balances), seatOf(view, 1, ctx.names, balances)],
    floor: view.floor,
    deckCount: view.deckCount,
    multiplier: currentMultiplier(view),
    pending: promptOf(view),
    playable,
    round: view.round.number,
    eventSeq: view.eventSeq,
    legal: view.legal,
    firstPick:
      picks && view.firstPick !== null
        ? { poolSize: view.firstPick.poolSize, taken: view.firstPick.picks[otherSeat(view.viewer)] }
        : null,
    inFlight: inFlightOf(view),
    goStop: goStopOf(view),
    bombMonths: view.legal.flatMap((a) => (a.type === 'bomb' ? [a.month] : [])),
    canFlipOnly: view.legal.some((a) => a.type === 'flipOnly'),
    dealer: view.dealer,
    phase: view.phase,
  };
}

/** M3 어댑터 호환: BoardView 상세 중 BoardExtras 모양만 뽑는다 (새 코드는 BoardView 필드를 직접 쓴다) */
export interface BoardExtras {
  readonly pickFirst: { readonly poolSize: number; readonly taken: number | null } | null;
  readonly bombMonths: readonly BoardView['bombMonths'][number][];
  readonly canFlipOnly: boolean;
  readonly goStop: GoStopDetail | null;
  readonly dealer: Seat | null;
}
export function toBoardExtras(view: PlayerView): BoardExtras {
  const board = toBoardView(view, { names: ['', ''], balances: [0, 0] });
  return {
    pickFirst: board.firstPick,
    bombMonths: board.bombMonths,
    canFlipOnly: board.canFlipOnly,
    goStop: board.goStop,
    dealer: board.dealer,
  };
}

// ---- 정산·기록 (spec 6.2, FR-18·FR-19) ----

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
  readonly settlement: Settlement;
  /** 판이 끝난 시점의 양측 획득 패 (족보 분해 계산) */
  readonly captured: readonly [CapturedPile, CapturedPile];
  readonly names: readonly [string, string];
  readonly unit: MoneyUnit;
  readonly perPoint: number;
  /** 원장에서 실제로 옮겨진 판 정산 금액 (올인 상한 적용, 나가리면 0) */
  readonly amount: number;
  /** 판 시작 전(즉시 정산 포함 전) 잔액 → 정산 후 잔액 */
  readonly before: readonly [number, number];
  readonly after: readonly [number, number];
}

/**
 * 정산 화면 데이터. 두 가지로 부른다.
 * - `toSettlementView(input)`: M3 어댑터와 같은 입력(권장).
 * - `toSettlementView(settlement, view, before, after, ctx)`: 옛 protocol 시그니처. 금액은 승자 잔액 변화(before→after)로 계산한다.
 */
export function toSettlementView(input: SettlementInput): SettlementView;
export function toSettlementView(
  settlement: Settlement,
  view: PlayerView,
  before: Pick<Ledger, 'perPoint' | 'balances'>,
  after: Pick<Ledger, 'balances'>,
  ctx: Pick<ViewContext, 'names' | 'unit'>,
): SettlementView;
export function toSettlementView(
  first: SettlementInput | Settlement,
  view?: PlayerView,
  before?: Pick<Ledger, 'perPoint' | 'balances'>,
  after?: Pick<Ledger, 'balances'>,
  ctx?: Pick<ViewContext, 'names' | 'unit'>,
): SettlementView {
  const input: SettlementInput =
    'settlement' in first
      ? first
      : {
          settlement: first,
          captured: view ? [view.seats[0].captured, view.seats[1].captured] : [EMPTY, EMPTY],
          names: ctx?.names ?? ['', ''],
          unit: ctx?.unit ?? '냥',
          perPoint: before?.perPoint ?? 0,
          amount:
            first.winner === null || !before || !after
              ? 0
              : after.balances[first.winner] - before.balances[first.winner],
          before: before?.balances ?? [0, 0],
          after: after?.balances ?? [0, 0],
        };
  const { settlement: s } = input;
  const isStop = s.reason === 'stop' || s.reason === 'autoStop';
  const breakdown =
    s.winner !== null && isStop
      ? (() => {
          const score = scoreCaptured(input.captured[s.winner], s.gukjinAsPi[s.winner]);
          return SCORE_ROWS.filter((kind) => score[kind] > 0).map((kind) => ({
            kind,
            points: score[kind],
          }));
        })()
      : [];
  return {
    winner: s.winner,
    loser: s.loser,
    reason: reasonOf(s.reason),
    names: input.names,
    breakdown,
    steps: s.steps,
    finalPoints: s.finalPoints,
    pointValue: input.perPoint,
    amount: input.amount,
    unit: input.unit,
    balances: [
      { before: input.before[0], after: input.after[0] },
      { before: input.before[1], after: input.after[1] },
    ],
  };
}
const EMPTY: CapturedPile = { gwang: [], yeol: [], tti: [], pi: [] };

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

/** 애니메이션 타입의 단일 근거는 엔진 이벤트다. */
export type ProtocolEvent = EngineEvent;
