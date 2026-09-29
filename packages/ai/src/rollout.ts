// 빠른 휴리스틱 정책과 롤아웃 (ISMCTS의 상대 모델·롤아웃, 쉬움·보통의 보조).
// 결정화 상태(GameState) 위에서 돈다. 자기 손패와 공개 정보, 상대 손패 "장수"만 읽고 상대 손패 내용·더미 순서는 보지 않는다.
import {
  applyUnchecked,
  getCard,
  legalActions,
  reduce,
  type Action,
  type CardId,
  type GameState,
  type Seat,
} from '@p2p-gostop/engine';
import {
  Valuer,
  countsOf,
  holdProbability,
  pointsOf,
  potentialOf,
  type Counts,
} from './features.ts';
import { actingSeat, otherSeat } from './knowledge.ts';
import type { Rng } from './rng.ts';
import type { Weights } from './weights.ts';

/** 합법 수를 적용한다. 합법 수만 넣으므로 거부는 버그다. */
export function step(state: GameState, action: Action, debugReduce = false): GameState {
  if (!debugReduce) {
    return applyUnchecked(state, action).state;
  }
  const result = reduce(state, action);
  if (!result.ok) {
    throw new Error(`AI가 합법 수를 적용하지 못함: ${result.message}`);
  }
  return result.state;
}

interface SeatCounts {
  readonly m: Counts;
  readonly t: Counts;
}

function seatCounts(state: GameState, seat: Seat): SeatCounts {
  const me = state.seats[seat];
  const op = state.seats[otherSeat(seat)];
  return {
    m: countsOf(me.captured, me.score.gukjinAsPi),
    t: countsOf(op.captured, op.score.gukjinAsPi),
  };
}

/** 이 좌석에게 보이는 월별 카드 장수 (자기 손패·바닥·양측 획득패) */
function visibleByMonth(state: GameState, seat: Seat): Uint8Array {
  const known = new Uint8Array(13);
  const add = (id: CardId): void => {
    const month = getCard(id).month;
    if (month !== null) {
      known[month] = (known[month] ?? 0) + 1;
    }
  };
  state.seats[seat].hand.forEach(add);
  for (const g of state.floor) {
    g.cards.forEach(add);
  }
  for (const s of state.seats) {
    s.captured.gwang.forEach(add);
    s.captured.yeol.forEach(add);
    s.captured.tti.forEach(add);
    s.captured.pi.forEach(add);
  }
  return known;
}

/** 한 결정 동안 공유하는 계산 (내 관점·상대 관점 카드 가치, 보이는 월 장수) */
class DecisionScratch {
  readonly state: GameState;
  readonly seat: Seat;
  readonly mine: Valuer;
  readonly theirs: Valuer;
  private visible: Uint8Array | null = null;

  constructor(state: GameState, seat: Seat, w: Weights) {
    this.state = state;
    this.seat = seat;
    const { m, t } = seatCounts(state, seat);
    this.mine = new Valuer(m, t, w);
    this.theirs = new Valuer(t, m, w);
  }

  /** 상대가 이 월 카드를 1장 이상 들고 있을 확률(이 좌석이 아는 정보 기준) */
  oppHolds(month: number): number {
    this.visible ??= visibleByMonth(this.state, this.seat);
    const oppHand = this.state.seats[otherSeat(this.seat)].hand.length;
    const unknownTotal = oppHand + this.state.deck.length;
    return holdProbability(4 - (this.visible[month] ?? 0), unknownTotal, oppHand);
  }
}

/** 낼 카드 후보 하나의 즉시 가치 (롤아웃·쉬움·보통 공용) */
function playActionValue(action: Action, d: DecisionScratch, w: Weights): number {
  const state = d.state;
  const v = d.mine;
  switch (action.type) {
    case 'flipOnly':
      return w.rollout.flipOnly;
    case 'bomb': {
      const group = state.floor.find((g) => g.month === action.month);
      let value = w.rollout.bomb + v.steal();
      for (const id of state.seats[d.seat].hand) {
        if (getCard(id).month === action.month) {
          value += v.card(id);
        }
      }
      return group === undefined ? value : value + v.group(group);
    }
    case 'play': {
      const card = getCard(action.card);
      if (card.month === null) {
        return w.rollout.bonus + v.card(action.card) + v.steal();
      }
      const group = state.floor.find((g) => g.month === card.month);
      if (group === undefined) {
        return -w.rollout.discard * d.oppHolds(card.month) * d.theirs.card(action.card);
      }
      const own = v.card(action.card);
      if (group.kind === 'loose' && group.cards.length === 2) {
        return own + Math.max(v.card(group.cards[0] ?? 0), v.card(group.cards[1] ?? 0));
      }
      return own + v.group(group);
    }
    default:
      return 0;
  }
}

/** 규칙 기반 고/스톱 (롤아웃·보통). 공개 정보와 자기 상태만 쓴다. */
export function ruleGoStop(state: GameState, seat: Seat, w: Weights): 'go' | 'stop' {
  const me = state.seats[seat];
  const op = state.seats[otherSeat(seat)];
  const g = w.goStop;
  if (me.hand.length + me.bombTokens < g.minTurns || me.goCount >= g.maxGo) {
    return 'stop';
  }
  if (op.score.total >= g.oppScoreStop) {
    return 'stop';
  }
  const { m, t } = seatCounts(state, seat);
  return potentialOf(t, m, w.combo) >= g.oppPotentialStop ? 'stop' : 'go';
}

/** 국진을 피로 쓸지: 점수가 큰 쪽, 같으면 피가 모자랄 때(피박 방지) 피 */
function gukjinAsPi(state: GameState, seat: Seat): boolean {
  const me = state.seats[seat];
  const asYeol = countsOf(me.captured, false);
  const asPi = countsOf(me.captured, true);
  const diff = pointsOf(asPi) - pointsOf(asYeol);
  return diff !== 0 ? diff > 0 : asYeol.pi <= 7;
}

function find(legal: readonly Action[], pred: (a: Action) => boolean): Action {
  const found = legal.find(pred);
  if (found !== undefined) {
    return found;
  }
  const first = legal[0];
  if (first === undefined) {
    throw new Error('합법 수가 없습니다');
  }
  return first;
}

/**
 * 빠른 휴리스틱 수 선택. noise는 가치에 더하는 균등 잡음의 크기(0이면 결정적 최선).
 */
export function heuristicAction(
  state: GameState,
  seat: Seat,
  legal: readonly Action[],
  rng: Rng,
  w: Weights,
  noise = w.rollout.noise,
): Action {
  const first = legal[0];
  if (first === undefined) {
    throw new Error('합법 수가 없습니다');
  }
  if (legal.length === 1) {
    return first;
  }
  switch (first.type) {
    case 'pickFirst':
      return rng.pick(legal);
    case 'chongtong':
      return find(legal, (a) => a.type === 'chongtong' && a.choice === 'end');
    case 'shake':
      return find(legal, (a) => a.type === 'shake' && a.accept);
    case 'gukjin': {
      const asPi = gukjinAsPi(state, seat);
      return find(legal, (a) => a.type === 'gukjin' && a.asPi === asPi);
    }
    case 'go':
    case 'stop': {
      const choice = ruleGoStop(state, seat, w);
      return find(legal, (a) => a.type === choice);
    }
    default:
      break;
  }
  const d = new DecisionScratch(state, seat, w);
  let best: Action = first;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const action of legal) {
    const base =
      action.type === 'chooseTarget' ? d.mine.card(action.card) : playActionValue(action, d, w);
    const value = noise > 0 ? base + noise * rng.float() : base;
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best;
}

const MAX_STEPS = 400;

/** 판 끝까지 양측 모두 휴리스틱으로 둔다. */
export function rollout(state: GameState, rng: Rng, w: Weights, debugReduce = false): GameState {
  let s = state;
  for (let i = 0; s.phase !== 'end'; i++) {
    if (i > MAX_STEPS) {
      throw new Error('롤아웃이 끝나지 않습니다');
    }
    const seat = actingSeat(s);
    if (seat === null) {
      throw new Error('입력할 좌석이 없습니다');
    }
    const legal = legalActions(s, seat);
    s = step(s, heuristicAction(s, seat, legal, rng, w), debugReduce);
  }
  return s;
}
