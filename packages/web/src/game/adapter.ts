// 엔진 PlayerView → 화면 BoardView 어댑터 — 잠정(provisional).
// TODO(M4): `@p2p-gostop/protocol`의 `toBoardView`(plan.md "M3 준비 결과가 M4에 넘기는 입력")로 교체하고 이 파일을 지운다.
// 필드 이름은 lib/view-types.ts와 fixtures/board.json에 맞춘다. 엔진에 없는 값(이름·잔액)은 BoardMeta로 받는다.
// BoardView에 아직 자리가 없는 값(선 고르기·폭탄·폭탄패 뒤집기·스톱 미리보기 분해)은 BoardExtras로 따로 낸다.
// protocol이 이 값들을 BoardView에 넣으면 BoardExtras도 함께 없앤다(docs/ui.md 4장).
import {
  getCard,
  scoreCaptured,
  type CapturedPile,
  type CardId,
  type EndReason,
  type Month,
  type PlayerView,
  type Seat,
  type Settlement,
} from '@p2p-gostop/engine';
import type {
  BoardView,
  CapturedView,
  JokboProgress,
  MoneyUnit,
  PromptView,
  RecordRow,
  ScoreRowKind,
  SeatView,
  SettleStepView,
  SettlementView,
} from '../lib/view-types.ts';

/** 뷰에 엔진 밖의 값(좌석 이름, 원장 잔액)을 붙인다 */
export interface BoardMeta {
  readonly names: readonly [string, string];
  readonly balances: readonly [number, number];
}

/** 고/스톱 모달의 스톱 미리보기 분해 (FR-14) */
export interface GoStopDetail {
  /** 스톱하면 받을 최종 점수 */
  readonly points: number;
  readonly steps: readonly SettleStepView[];
  readonly multiplier: number;
  /** 원장 상한까지 적용한 실제 금액 */
  readonly money: number | null;
  /** 상대 잔액 부족으로 줄었는지 (올인, MN-02) */
  readonly capped: boolean;
}

/** BoardView에 아직 없는 입력 정보 (M4 protocol에 넣을 후보) */
export interface BoardExtras {
  /** 선 고르기(R4): 내가 고를 차례면 후보 장수와 상대가 이미 고른 자리 */
  readonly pickFirst: { readonly poolSize: number; readonly taken: number | null } | null;
  /** 폭탄(E9·E10)을 할 수 있는 월 */
  readonly bombMonths: readonly Month[];
  /** 폭탄패로 뒤집기만 할 수 있는지 (E9) */
  readonly canFlipOnly: boolean;
  /** 내 고/스톱 프롬프트의 스톱 미리보기 */
  readonly goStop: GoStopDetail | null;
  readonly dealer: Seat | null;
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

/** 지금 스톱하면 적용될 배수 (spec 6.1 "현재 배수"). 고/스톱 중이면 엔진 미리보기, 아니면 흔들기·폭탄·고·이월·대박판의 곱 */
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
    case 'chongtong':
      return { kind: 'chongtong', seat: p.seat, months: p.months };
  }
}

function seatOf(view: PlayerView, seat: Seat, meta: BoardMeta): SeatView {
  const s = view.seats[seat];
  return {
    name: meta.names[seat],
    handCount: s.handCount,
    hand: s.hand,
    captured: s.captured,
    score: s.score.total,
    goCount: s.goCount,
    shakes: s.shakes,
    ppeokCount: s.ppeokCount,
    balance: meta.balances[seat],
    progress: progressOf(s.captured, s.score.gukjinAsPi),
  };
}

/** PlayerView → BoardView (spec 6.1·6.2, FR-12) */
export function toBoardView(view: PlayerView, meta: BoardMeta): BoardView {
  const playable = [...new Set(view.legal.flatMap((a) => (a.type === 'play' ? [a.card] : [])))];
  return {
    viewer: view.viewer,
    turn: view.turn,
    seats: [seatOf(view, 0, meta), seatOf(view, 1, meta)],
    floor: view.floor,
    deckCount: view.deckCount,
    multiplier: currentMultiplier(view),
    pending: promptOf(view),
    playable,
    round: view.round.number,
    eventSeq: view.eventSeq,
  };
}

export function toBoardExtras(view: PlayerView): BoardExtras {
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
  };
}

/**
 * 진행 중인 턴에서 아직 바닥에 놓이지 않은 카드 (spec 4.3 MATCH_PLAY·MATCH_FLIP의 대상 고르기 동안).
 * 엔진은 낸 패·뒤집은 패·들고 있는 보너스를 턴 작업 공간(ctx)에 두므로 floor에 없다. 화면은 낸 패를 그 월 무더기 위에,
 * 뒤집은 패를 더미 옆 뒤집기 자리에 둔다(display.ts의 이벤트 재생과 같은 자리). BoardView에는 아직 자리가 없다(M4 후보).
 */
export interface InFlight {
  readonly played: CardId | null;
  readonly staged: readonly CardId[];
}

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
  /** 원장에서 실제로 옮겨진 판 정산 금액 (올인 상한 적용) */
  readonly amount: number;
  /** 판 시작 전(즉시 정산 포함 전) 잔액 → 정산 후 잔액 */
  readonly before: readonly [number, number];
  readonly after: readonly [number, number];
}

export function toSettlementView(input: SettlementInput): SettlementView {
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
