// 평가 특징 (spec AI-03 "평가 함수", intent/plan.md 1.5 Evaluator).
// 획득패를 "장수 벡터"(Counts)로 줄여 족보 점수·진행도를 빠르게 계산한다. 롤아웃에서도 쓰므로 할당을 줄였다.
import {
  GUKJIN_ID,
  getCard,
  type CapturedPile,
  type CardId,
  type FloorGroup,
} from '@p2p-gostop/engine';
import type { ComboWeights, Weights } from './weights.ts';

/** 족보 계산에 필요한 장수 */
export interface Counts {
  gwang: number;
  /** 비광 보유 여부(0/1) */
  bi: number;
  birds: number;
  hong: number;
  cheong: number;
  cho: number;
  yeol: number;
  tti: number;
  /** 피 가치 합(쌍피 2, 보너스 2·3, 국진을 피로 쓰면 2) */
  pi: number;
}

const TOTAL_GWANG = 5;
const TOTAL_YEOL = 9;
const TOTAL_TTI = 10;
const COUNT_THRESHOLD = 5;
const PI_THRESHOLD = 10;
const MEONGTTA = 7;

function emptyCounts(): Counts {
  return { gwang: 0, bi: 0, birds: 0, hong: 0, cheong: 0, cho: 0, yeol: 0, tti: 0, pi: 0 };
}

/** 카드 한 장을 장수에 더한다(제자리). gukjinAsPi면 국진을 피 2로 센다 */
function addCard(c: Counts, id: CardId, gukjinAsPi = false): void {
  const card = getCard(id);
  switch (card.kind) {
    case 'gwang':
      c.gwang += 1;
      c.bi += card.isBiGwang ? 1 : 0;
      return;
    case 'yeol':
      if (card.isGukjin && gukjinAsPi) {
        c.pi += card.piValue;
        return;
      }
      c.yeol += 1;
      c.birds += card.isGodori ? 1 : 0;
      return;
    case 'tti':
      c.tti += 1;
      c.hong += card.ribbon === 'hong' ? 1 : 0;
      c.cheong += card.ribbon === 'cheong' ? 1 : 0;
      c.cho += card.ribbon === 'cho' ? 1 : 0;
      return;
    default:
      c.pi += card.piValue;
  }
}

export function countsOf(pile: CapturedPile, gukjinAsPi: boolean): Counts {
  const c = emptyCounts();
  for (const list of [pile.gwang, pile.yeol, pile.tti, pile.pi]) {
    for (const id of list) {
      addCard(c, id, gukjinAsPi && id === GUKJIN_ID);
    }
  }
  return c;
}

/** 문턱 t장부터 1점, 이후 1장당 +1 */
function over(n: number, t: number): number {
  return n >= t ? n - t + 1 : 0;
}

/** 장수로 계산한 족보 점수 (rules 12.3 S1~S4, 엔진 score.ts와 같은 표) */
export function pointsOf(c: Counts): number {
  let gwang = 0;
  if (c.gwang >= 5) {
    gwang = 15;
  } else if (c.gwang === 4) {
    gwang = 4;
  } else if (c.gwang === 3) {
    gwang = c.bi > 0 ? 2 : 3;
  }
  return (
    gwang +
    over(c.yeol, COUNT_THRESHOLD) +
    (c.birds === 3 ? 5 : 0) +
    over(c.tti, COUNT_THRESHOLD) +
    (c.hong === 3 ? 3 : 0) +
    (c.cheong === 3 ? 3 : 0) +
    (c.cho === 3 ? 3 : 0) +
    over(c.pi, PI_THRESHOLD)
  );
}

function tupleAt(t: readonly [number, number, number], k: number): number {
  return k >= 0 && k < 3 ? (t[k] ?? 0) : 0;
}

/** 아직 완성되지 않았지만 살아 있는 족보의 부분 가치 (o = 상대 장수: 상대가 가진 카드는 죽은 카드) */
function partialOf(c: Counts, o: Counts, w: ComboWeights): number {
  let v = 0;
  const gwangAlive = TOTAL_GWANG - c.gwang - o.gwang;
  if (c.gwang < 3) {
    if (c.gwang + gwangAlive >= 3) {
      v += tupleAt(w.gwangPartial, c.gwang);
    }
  } else if (c.gwang < 5 && gwangAlive > 0) {
    v += w.gwangNext;
  }
  if (o.birds === 0 && c.birds < 3) {
    v += tupleAt(w.godoriPartial, c.birds);
  }
  if (o.hong === 0 && c.hong < 3) {
    v += tupleAt(w.danPartial, c.hong);
  }
  if (o.cheong === 0 && c.cheong < 3) {
    v += tupleAt(w.danPartial, c.cheong);
  }
  if (o.cho === 0 && c.cho < 3) {
    v += tupleAt(w.danPartial, c.cho);
  }
  if (c.yeol < COUNT_THRESHOLD) {
    if (TOTAL_YEOL - o.yeol >= COUNT_THRESHOLD) {
      const r = c.yeol / COUNT_THRESHOLD;
      v += w.countProgress * r * r;
    }
  } else if (c.yeol < MEONGTTA) {
    v += w.meongttaStep * (c.yeol - COUNT_THRESHOLD + 1);
  }
  if (c.tti < COUNT_THRESHOLD && TOTAL_TTI - o.tti >= COUNT_THRESHOLD) {
    const r = c.tti / COUNT_THRESHOLD;
    v += w.countProgress * r * r;
  }
  if (c.pi < PI_THRESHOLD) {
    v += w.piUnit * c.pi;
  }
  return v;
}

/** 족보 잠재력 = 현재 점수 + 부분 가치 */
export function potentialOf(c: Counts, o: Counts, w: ComboWeights): number {
  return w.score * pointsOf(c) + partialOf(c, o, w);
}

function copyInto(dst: Counts, src: Counts): Counts {
  dst.gwang = src.gwang;
  dst.bi = src.bi;
  dst.birds = src.birds;
  dst.hong = src.hong;
  dst.cheong = src.cheong;
  dst.cho = src.cho;
  dst.yeol = src.yeol;
  dst.tti = src.tti;
  dst.pi = src.pi;
  return dst;
}

/**
 * 한 관점(mine vs theirs)에서 카드 가치를 계산·캐시한다. 결정 하나(또는 평가 하나) 동안만 쓴다.
 * 카드 가치 = 내 잠재력 증가 + 상대 족보를 죽이는 몫 + denial × (상대가 가져갔을 때 상대의 잠재력 증가).
 */
export class Valuer {
  readonly mine: Counts;
  readonly theirs: Counts;
  private readonly w: Weights;
  private readonly baseMine: number;
  private readonly baseTheirs: number;
  private readonly scratch = emptyCounts();
  private readonly values = new Float64Array(51).fill(Number.NaN);
  private stealCached = Number.NaN;

  constructor(mine: Counts, theirs: Counts, w: Weights) {
    this.mine = mine;
    this.theirs = theirs;
    this.w = w;
    this.baseMine = potentialOf(mine, theirs, w.combo);
    this.baseTheirs = potentialOf(theirs, mine, w.combo);
  }

  card(id: CardId): number {
    const cached = this.values[id] ?? Number.NaN;
    if (!Number.isNaN(cached)) {
      return cached;
    }
    const cw = this.w.combo;
    const next = copyInto(this.scratch, this.mine);
    addCard(next, id);
    const selfGain =
      potentialOf(next, this.theirs, cw) -
      this.baseMine +
      (this.baseTheirs - potentialOf(this.theirs, next, cw));
    const theirNext = copyInto(this.scratch, this.theirs);
    addCard(theirNext, id);
    const oppGain = potentialOf(theirNext, this.mine, cw) - this.baseTheirs;
    const value = selfGain + this.w.tactic.denial * oppGain;
    this.values[id] = value;
    return value;
  }

  /** 상대 피 1장(가치 1)을 뺏어올 때의 가치 */
  steal(): number {
    if (Number.isNaN(this.stealCached)) {
      this.stealCached = stealValue(this.mine, this.theirs, this.w);
    }
    return this.stealCached;
  }

  /** 바닥 무더기를 먹을 때 얻는 가치 합 (뻑 무더기면 뺏기 포함) */
  group(group: FloorGroup): number {
    let v = 0;
    for (const id of group.cards) {
      v += this.card(id);
    }
    return group.kind === 'loose' ? v : v + this.steal();
  }
}

/** 카드 한 장의 가치 (단발 계산용. 반복 계산은 Valuer) */
export function cardValue(id: CardId, mine: Counts, theirs: Counts, w: Weights): number {
  return new Valuer(mine, theirs, w).card(id);
}

/** 상대 피 1장(가치 1)을 뺏어올 때의 가치 */
function stealValue(mine: Counts, theirs: Counts, w: Weights): number {
  if (theirs.pi <= 0) {
    return 0;
  }
  const cw = w.combo;
  const mineNext = { ...mine, pi: mine.pi + 1 };
  const theirsNext = { ...theirs, pi: theirs.pi - 1 };
  const gain =
    potentialOf(mineNext, theirsNext, cw) -
    potentialOf(mine, theirs, cw) +
    (potentialOf(theirs, mine, cw) - potentialOf(theirsNext, mineNext, cw));
  return w.tactic.steal * gain;
}

/**
 * 상대 손패 h장이 모르는 카드 U장에서 균등하게 뽑혔을 때 특정 월 카드(모르는 것 k장)를 1장 이상 가질 확률.
 * 1 − C(U−k, h) / C(U, h)
 */
export function holdProbability(
  unknownOfMonth: number,
  unknownTotal: number,
  hand: number,
): number {
  if (unknownOfMonth <= 0 || hand <= 0 || unknownTotal <= 0) {
    return 0;
  }
  let none = 1;
  for (let i = 0; i < hand; i++) {
    const rest = unknownTotal - unknownOfMonth - i;
    if (rest <= 0) {
      return 1;
    }
    none *= rest / (unknownTotal - i);
  }
  return 1 - none;
}
