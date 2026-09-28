// 판 시작: 선 고르기(R4), 분배(R2), 바닥 보너스(R3), 바닥·손패 총통(R6·E12·E13).
import { gainCards } from './capture.ts';
import { deckCardIds, getCard, type CardId, type Month } from './cards.ts';
import { emit, invariant, other, type Draft, type DraftSeat, type Tx } from './draft.ts';
import { buildFloor, placeLoose } from './floor.ts';
import { createRng, nextInt, shuffleWith, type Seed } from './rng.ts';
import type { RuleOptions } from './rules.ts';
import { scoreCaptured } from './score.ts';
import type { EngineEvent, GameState, Seat } from './state.ts';
import { endRound, offerChongtong, promptPlay, recomputeScores } from './turn.ts';

export const HAND_SIZE = 10;
export const FLOOR_SIZE = 8;
/** 선 고르기 후보 장수 (R4 "바닥에 깐 뒤 각자 1장 선택") */
export const FIRST_PICK_POOL_SIZE = 8;
/** 동월로 다시 고르는 최대 횟수. 넘으면 시드 난수로 정한다 (R4 동월 처리, 자체 결정). */
export const FIRST_PICK_MAX_TIES = 3;
/** 바닥 총통 '재분배' 반복 상한. 넘으면 나가리로 처리한다 (자체 결정). */
const MAX_REDEALS = 16;

export interface RoundOptions {
  /** 선. 생략하면 첫 판으로 보고 선 고르기(R4)부터 한다. 이후 판은 settle().nextDealer (R5) */
  readonly dealer?: Seat;
  /** 이번 판 나가리 배수 (settle().nextCarry, G9). 기본 1 */
  readonly carry?: number;
  /** 세션 안의 판 번호(1부터). 대박판 판정 */
  readonly roundNumber?: number;
  /** 밤일낮장(firstDealer = 'timeOfDay')에서 밤이면 낮은 월이 선. 엔진은 시각을 읽지 않는다 */
  readonly isNight?: boolean;
  /** 테스트용: 셔플 대신 쓸 덱 순서(0번이 먼저 나눠짐). 선 손패 10 → 후 손패 10 → 바닥 8 → 더미 */
  readonly deck?: readonly CardId[];
  /** 테스트용: 선 고르기 후보를 차례로 고정 */
  readonly pickPools?: readonly (readonly CardId[])[];
}

function emptySeat(): DraftSeat {
  const captured = { gwang: [], yeol: [], tti: [], pi: [] };
  return {
    hand: [],
    captured,
    goCount: 0,
    lastGoScore: 0,
    shakes: 0,
    bombs: 0,
    bombTokens: 0,
    ppeokTurns: [],
    turnsTaken: 0,
    noCaptureStreak: 0,
    gukjinAsPi: false,
    score: scoreCaptured(captured, false),
    revealed: [],
  };
}

export function blankDraft(rules: RuleOptions, seed: Seed, opts: RoundOptions): Draft {
  return {
    phase: 'turn',
    rules,
    rng: createRng(seed),
    dealer: null,
    turn: 0,
    seats: [emptySeat(), emptySeat()],
    floor: [],
    deck: [],
    pending: null,
    ctx: null,
    firstPick: null,
    round: {
      number: opts.roundNumber ?? 1,
      carry: opts.carry ?? 1,
      fixedDeck: opts.deck === undefined ? null : [...opts.deck],
    },
    instantPayouts: [],
    result: null,
    eventSeq: 0,
  };
}

const isBonus = (id: CardId): boolean => getCard(id).kind === 'bonus';

function shuffledDeck(tx: Tx): CardId[] {
  const { items, rng } = shuffleWith(tx.s.rng, deckCardIds(tx.s.rules.bonusCards));
  tx.s.rng = rng;
  return items;
}

/**
 * 새 판을 시작한다. 같은 규칙·시드·옵션이면 항상 같은 상태와 이벤트가 나온다.
 * dealer가 없으면 선 고르기 프롬프트(pickFirst)에서 멈춘다.
 */
export function newRound(
  rules: RuleOptions,
  seed: Seed,
  opts: RoundOptions = {},
): { state: GameState; events: EngineEvent[] } {
  const tx: Tx = { s: blankDraft(rules, seed, opts), events: [] };
  if (opts.dealer === undefined) {
    startFirstPick(tx, opts.pickPools ?? [], opts.isNight ?? false);
  } else {
    deal(tx, opts.dealer);
  }
  return { state: tx.s, events: tx.events };
}

function startFirstPick(tx: Tx, pools: readonly (readonly CardId[])[], isNight: boolean): void {
  tx.s.phase = 'chooseFirst';
  tx.s.firstPick = { pool: [], picks: [null, null], ties: 0, nextPools: pools, isNight };
  nextPickPool(tx);
}

function nextPickPool(tx: Tx): void {
  const fp = tx.s.firstPick;
  if (fp === null) {
    return;
  }
  const [fixed, ...rest] = fp.nextPools;
  const pool = fixed === undefined ? shuffledDeck(tx).slice(0, FIRST_PICK_POOL_SIZE) : [...fixed];
  tx.s.firstPick = { ...fp, pool, picks: [null, null], nextPools: rest };
  tx.s.pending = { kind: 'pickFirst', seats: [0, 1] };
}

/** R4: 높은 월이 선(밤일낮장 밤이면 낮은 월), 보너스를 고르면 무조건 선, 같은 월이면 다시 고른다. */
export function actPickFirst(tx: Tx, seat: Seat, index: number): void {
  const fp = tx.s.firstPick;
  const pending = tx.s.pending;
  if (fp === null || pending?.kind !== 'pickFirst') {
    return;
  }
  const picks: [number | null, number | null] = [fp.picks[0], fp.picks[1]];
  picks[seat] = index;
  tx.s.firstPick = { ...fp, picks };
  const waiting = pending.seats.filter((s) => s !== seat);
  if (waiting.length > 0) {
    tx.s.pending = { kind: 'pickFirst', seats: waiting };
    return;
  }
  const a = fp.pool[picks[0] ?? -1];
  const b = fp.pool[picks[1] ?? -1];
  invariant(a !== undefined && b !== undefined, '선 고르기 후보 위치가 잘못되었습니다');
  emit(tx, { type: 'FirstPicked', seat: null, cards: [a, b], picks: [a, b] });
  const decided = compareFirstPick(a, b, tx.s.rules.firstDealer === 'timeOfDay' && fp.isNight);
  if (decided !== null) {
    chooseDealer(tx, decided.seat, decided.reason);
    return;
  }
  const ties = fp.ties + 1;
  tx.s.firstPick = { ...fp, picks, ties };
  emit(tx, { type: 'FirstPickTie', seat: null, cards: [a, b], ties });
  if (ties >= FIRST_PICK_MAX_TIES) {
    const [value, rng] = nextInt(tx.s.rng, 2);
    tx.s.rng = rng;
    chooseDealer(tx, value === 0 ? 0 : 1, 'random');
    return;
  }
  nextPickPool(tx);
}

function compareFirstPick(
  a: CardId,
  b: CardId,
  lowWins: boolean,
): { seat: Seat; reason: 'month' | 'bonus' } | null {
  const ma = getCard(a).month;
  const mb = getCard(b).month;
  if (ma === null || mb === null) {
    return ma === mb ? null : { seat: ma === null ? 0 : 1, reason: 'bonus' };
  }
  if (ma === mb) {
    return null;
  }
  const aWins = lowWins ? ma < mb : ma > mb;
  return { seat: aWins ? 0 : 1, reason: 'month' };
}

function chooseDealer(tx: Tx, seat: Seat, reason: 'month' | 'bonus' | 'random'): void {
  emit(tx, { type: 'FirstPickerChosen', seat, cards: [], reason });
  tx.s.firstPick = null;
  tx.s.phase = 'turn';
  deal(tx, seat);
}

/** R2 분배 + R3 바닥 보너스 보충. 바닥 같은 월 4장이면 true. */
function dealCards(tx: Tx, dealer: Seat, deck: readonly CardId[]): boolean {
  const s = tx.s;
  const rest = [...deck];
  const take = (n: number): CardId[] => rest.splice(0, n);
  s.seats = [emptySeat(), emptySeat()];
  s.seats[dealer].hand = take(HAND_SIZE);
  s.seats[other(dealer)].hand = take(HAND_SIZE);
  const floorIds = take(FLOOR_SIZE);
  s.deck = rest;
  s.floor = buildFloor(floorIds.filter((id) => !isBonus(id)));
  emit(tx, {
    type: 'Dealt',
    seat: dealer,
    cards: floorIds,
    dealer,
    handCounts: [HAND_SIZE, HAND_SIZE],
    deckCount: s.deck.length,
  });
  // R3: 바닥 보너스는 선이 즉시 획득(B3(d)는 토글), 더미에서 1장 보충(보충 패가 보너스면 반복)
  let bonuses = floorIds.filter(isBonus);
  while (bonuses.length > 0) {
    const steal = s.rules.bonusSteal && s.rules.dealFloorBonusSteal;
    gainCards(tx, dealer, bonuses, 'deal', steal);
    const refills = s.deck.splice(0, bonuses.length);
    emit(tx, { type: 'CardFlipped', seat: dealer, cards: refills });
    bonuses = refills.filter(isBonus);
    for (const id of refills.filter((c) => !isBonus(c))) {
      placeLoose(s.floor, id);
    }
  }
  for (const group of s.floor) {
    if (group.cards.length === 3) {
      group.kind = 'natural';
    }
  }
  return s.floor.some((g) => g.cards.length === 4);
}

function chongtongMonths(seat: DraftSeat): Month[] {
  const counts = new Map<Month, number>();
  for (const id of seat.hand) {
    const month = getCard(id).month;
    if (month !== null) {
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
  }
  return [...counts].filter(([, n]) => n === 4).map(([m]) => m);
}

/** 분배 후 바닥 총통(R6)·양측 총통(E13)·손패 총통(E12)을 판정하고 첫 턴을 연다. */
function deal(tx: Tx, dealer: Seat): void {
  const s = tx.s;
  s.dealer = dealer;
  s.turn = dealer;
  let deck = s.round.fixedDeck ?? shuffledDeck(tx);
  for (let redeals = 0; dealCards(tx, dealer, deck); redeals++) {
    const option = s.rules.floorChongtong;
    if (option === 'redeal' && redeals < MAX_REDEALS) {
      emit(tx, { type: 'Redealt', seat: dealer, cards: [] });
      deck = shuffledDeck(tx);
      continue;
    }
    endRound(tx, 'floorChongtong', option === 'dealerWins' ? dealer : null);
    return;
  }
  recomputeScores(tx);
  const months: [Month[], Month[]] = [chongtongMonths(s.seats[0]), chongtongMonths(s.seats[1])];
  if (months[0].length > 0 && months[1].length > 0) {
    endRound(tx, 'bothChongtong', s.rules.bothChongtong === 'dealerWins' ? dealer : null);
    return;
  }
  for (const seat of [dealer, other(dealer)]) {
    if (months[seat].length > 0) {
      offerChongtong(tx, seat, months[seat], 'deal');
      return;
    }
  }
  promptPlay(tx, dealer);
}
