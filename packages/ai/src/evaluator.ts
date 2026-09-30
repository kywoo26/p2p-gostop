// 평가 함수 Evaluator(view, seat) → 점수 단위의 추정 우위 (spec AI-03, intent/plan.md 1.5).
// 특징: 양측 족보 진행도(광·고도리·단·열끗·띠·피), 흔들기·폭탄·고박 배수, 피박·광박 위험(양방향),
// 고 가산, 내 손패로 먹을 기회, 바닥 카드를 상대가 먹을 확률(남은 카드 분포 추정). 가중치는 weights/default.json.
import {
  getCard,
  settle,
  type CardId,
  type GameState,
  type PlayerView,
  type Seat,
} from '@p2p-gostop/engine';
import { Valuer, countsOf, holdProbability, potentialOf, type Counts } from './features.ts';
import { determinize, otherSeat } from './knowledge.ts';
import { Rng } from './rng.ts';
import { DEFAULT_WEIGHTS, type Weights } from './weights.ts';

/** 끝난 판에서 seat가 받는(+) 또는 내는(−) 점수: 판 정산 + 이번 판 즉시 정산 */
export function terminalPoints(state: GameState, seat: Seat): number {
  const s = settle(state);
  let points = 0;
  if (s.winner !== null) {
    points = s.winner === seat ? s.finalPoints : -s.finalPoints;
  }
  for (const p of state.instantPayouts) {
    points += p.to === seat ? p.points : -p.points;
  }
  return points;
}

/** 이 좌석이 아는 월별 카드 장수 (손패는 knownHand가 있을 때만) */
function knownByMonth(state: GameState, knownHand: readonly CardId[] | null): Uint8Array {
  const known = new Uint8Array(13);
  const add = (id: CardId): void => {
    const month = getCard(id).month;
    if (month !== null) {
      known[month] = (known[month] ?? 0) + 1;
    }
  };
  for (const id of knownHand ?? []) {
    add(id);
  }
  for (const g of state.floor) {
    g.cards.forEach(add);
  }
  for (const seat of state.seats) {
    const c = seat.captured;
    c.gwang.forEach(add);
    c.yeol.forEach(add);
    c.tti.forEach(add);
    c.pi.forEach(add);
  }
  const ctx = state.ctx;
  if (ctx !== null) {
    for (const id of [ctx.played, ctx.flipped]) {
      if (id !== null && !state.floor.some((g) => g.cards.includes(id))) {
        add(id);
      }
    }
  }
  return known;
}

function sq(x: number): number {
  return x * x;
}

/** 배수 기대: 이기면 흔들기·폭탄 ×2^n, 상대가 고를 불렀으면 고박 ×2 */
function winMultiplier(shakes: number, bombs: number, oppWentGo: boolean): number {
  return 2 ** (shakes + bombs) * (oppWentGo ? 2 : 1);
}

/**
 * 결정화 상태(또는 실제 상태)를 seat 관점에서 평가한다. 상대 손패는 장수만 쓰고 내용은 보지 않는다.
 * useHand=false면 자기 손패 내용도 쓰지 않는다(다른 좌석 관점 평가).
 */
export function evaluateState(
  state: GameState,
  seat: Seat,
  w: Weights = DEFAULT_WEIGHTS,
  useHand = true,
): number {
  if (state.phase === 'end') {
    return terminalPoints(state, seat);
  }
  const opp = otherSeat(seat);
  const me = state.seats[seat];
  const op = state.seats[opp];
  const m = countsOf(me.captured, me.score.gukjinAsPi);
  const t = countsOf(op.captured, op.score.gukjinAsPi);
  const cw = w.combo;
  const pm = potentialOf(m, t, cw) + w.risk.goBonus * me.goCount;
  const pt = potentialOf(t, m, cw) + w.risk.goBonus * op.goCount;
  const mm = winMultiplier(me.shakes, me.bombs, op.goCount > 0);
  const mt = winMultiplier(op.shakes, op.bombs, me.goCount > 0);
  let v = pm * mm - pt * mt;
  // 고박: 고를 부른 쪽은 지면 두 배로 잃는다(mt에 이미 반영). 고 이후 상대 잠재력에 추가 경계.
  if (me.goCount > 0) {
    v -= w.risk.goBak * pt;
  }
  if (op.goCount > 0) {
    v += w.risk.goBak * pm;
  }
  v += bakTerms(m, t, state.rules.piBakThreshold, w, mm, mt);
  v += tacticalTerms(state, seat, m, t, w, useHand);
  return v;
}

/** 피 10장(피 점수 문턱)까지의 진행도 */
function piProg(c: Counts): number {
  return Math.min(1, c.pi / 10);
}

/** 광 3장(광 점수 문턱)까지의 진행도² */
function gwangProg(c: Counts): number {
  return sq(Math.min(3, c.gwang) / 3);
}

function bakTerms(m: Counts, t: Counts, threshold: number, w: Weights, mm: number, mt: number) {
  const risk = (c: Counts): number =>
    c.pi <= threshold ? (threshold + 1 - c.pi) / (threshold + 1) : 0;
  let v = 0;
  v -= w.risk.piBak * risk(m) * sq(piProg(t)) * mt;
  v += w.risk.piBak * risk(t) * sq(piProg(m)) * mm;
  if (m.gwang === 0) {
    v -= w.risk.gwangBak * gwangProg(t) * mt;
  }
  if (t.gwang === 0) {
    v += w.risk.gwangBak * gwangProg(m) * mm;
  }
  return v;
}

function tacticalTerms(
  state: GameState,
  seat: Seat,
  m: Counts,
  t: Counts,
  w: Weights,
  useHand: boolean,
): number {
  const me = state.seats[seat];
  const oppHand = state.seats[otherSeat(seat)].hand.length;
  const hand = useHand ? me.hand : null;
  const known = knownByMonth(state, hand);
  const unknownTotal = oppHand + state.deck.length;
  const oppMovesNext = state.pending !== null && state.turn !== seat;
  const mine = new Valuer(m, t, w);
  const theirs = new Valuer(t, m, w);
  let v = 0;
  for (const group of state.floor) {
    const unknownOfMonth = 4 - (known[group.month] ?? 0);
    const p = holdProbability(unknownOfMonth, unknownTotal, oppHand);
    if (p > 0) {
      v -= w.tactic.exposure * p * theirs.group(group) * (oppMovesNext ? 1 : 0.5);
    }
  }
  if (hand !== null) {
    for (const id of hand) {
      v += w.tactic.handMatch * captureValueOfCard(state, id, mine);
    }
  }
  return v;
}

/** 손패 카드 한 장을 냈을 때 바닥에서 바로 얻는 가치(뒤집기 제외). 먹을 게 없으면 0 */
function captureValueOfCard(state: GameState, id: CardId, v: Valuer): number {
  const card = getCard(id);
  if (card.month === null) {
    return v.card(id) + v.steal();
  }
  const group = state.floor.find((g) => g.month === card.month);
  if (group === undefined) {
    return 0;
  }
  const own = v.card(id);
  if (group.kind === 'loose' && group.cards.length === 2) {
    return own + Math.max(v.card(group.cards[0] ?? 0), v.card(group.cards[1] ?? 0));
  }
  return own + v.group(group);
}

/**
 * 공개 API: 보는 좌석의 뷰로 seat 관점의 우위를 점수 단위로 추정한다(양수 = seat 유리).
 * 다른 좌석 관점은 보는 좌석 관점 값의 부호를 뒤집는다(보는 좌석의 정보만 쓴다).
 */
export function evaluate(view: PlayerView, seat: Seat, w: Weights = DEFAULT_WEIGHTS): number {
  // 모르는 카드는 계산에 장수만 쓰므로 어떤 결정화든 결과가 같다. 고정 시드로 상태 모양만 만든다.
  const shell = determinize(view, new Rng(0));
  const value = evaluateState(shell, view.viewer, w, true);
  return seat === view.viewer ? value : -value;
}
