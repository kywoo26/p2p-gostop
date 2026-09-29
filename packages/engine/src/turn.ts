// 턴 진행 (spec 4.3 TURN: PLAY → MATCH_PLAY → FLIP → MATCH_FLIP → RESOLVE → SCORE → NEXT).
// 프롬프트가 필요하면 pending을 세우고 멈춘다. 응답 액션이 오면 멈춘 지점부터 이어간다.
import { gainCards, stealPi } from './capture.ts';
import { getCard, type CardId, type Month } from './cards.ts';
import { emit, invariant, other, unitsLeft, type DraftCtx, type Tx } from './draft.ts';
import {
  findGroup,
  groupSize,
  monthOf,
  placeGroup,
  placeLoose,
  removeGroup,
  removeLooseCard,
} from './floor.ts';
import { BASE_POINTS, INSTANT_UNIT_POINTS, WINNING_SCORE } from './rules.ts';
import { endRound, recomputeScores } from './round-end.ts';
import { settle } from './settle.ts';
import type { InstantPayout, InstantPayoutKind, Seat, StealReason } from './state.ts';

/** 3뻑(통산) 즉시 승리 (E5) */
const THREE_PPEOK = 3;
/** 허당: 연속 5턴 무획득 (E14) */
const HUDANG_TURNS = 5;

const isBonus = (id: CardId): boolean => getCard(id).kind === 'bonus';

export function promptPlay(tx: Tx, seat: Seat): void {
  tx.s.turn = seat;
  tx.s.pending = { kind: 'play', seat };
}

/** 이 턴의 작업 공간. 턴의 첫 액션(보너스 내기 포함)에서 만들고 턴 번호를 센다. */
function ensureCtx(tx: Tx, seat: Seat): DraftCtx {
  if (tx.s.ctx !== null) {
    return tx.s.ctx;
  }
  const state = tx.s.seats[seat];
  state.turnsTaken += 1;
  const ctx: DraftCtx = {
    seat,
    index: state.turnsTaken,
    lastTurn: false,
    mode: 'card',
    played: null,
    playBefore: 0,
    playTarget: null,
    heldBonuses: [],
    flipped: null,
    flipTarget: null,
    capturedAny: false,
    gukjinCaptured: false,
  };
  tx.s.ctx = ctx;
  return ctx;
}

function removeFromHand(tx: Tx, seat: Seat, ids: readonly CardId[]): void {
  const state = tx.s.seats[seat];
  for (const id of ids) {
    const index = state.hand.indexOf(id);
    invariant(index !== -1, `손패에 없는 카드 ${id}`);
    state.hand.splice(index, 1);
  }
  // 공개된 손패(revealed)는 "아직 손에 있는 것"만 둔다
  if (state.revealed.length > 0) {
    state.revealed = state.revealed.filter((id) => !ids.includes(id));
  }
}

/** 규칙상 공개된 손패를 기록한다 (흔들기·총통 끝내기, SeatState.revealed) */
function reveal(tx: Tx, seat: Seat, ids: readonly CardId[]): void {
  const state = tx.s.seats[seat];
  for (const id of ids) {
    if (!state.revealed.includes(id)) {
      state.revealed.push(id);
    }
  }
}

function drawTop(tx: Tx): CardId {
  const id = tx.s.deck.shift();
  invariant(id !== undefined, '더미가 모자랍니다 (12.8)');
  return id;
}

function monthCountInHand(tx: Tx, seat: Seat, month: Month): number {
  return tx.s.seats[seat].hand.filter((id) => getCard(id).month === month).length;
}

/** PLAY: 카드 한 장 내기. 보너스면 B1, 흔들기 대상이면 PROMPT_SHAKE (E11). */
export function actPlay(tx: Tx, seat: Seat, card: CardId): void {
  if (isBonus(card)) {
    playBonus(tx, seat, card);
    return;
  }
  const month = monthOf(card);
  if (monthCountInHand(tx, seat, month) >= 3 && groupSize(tx.s.floor, month) === 0) {
    tx.s.pending = { kind: 'shake', seat, card, month };
    return;
  }
  playCard(tx, seat, card);
}

/** B1: 보너스를 내면 즉시 획득(뺏기) → 더미 1장을 손패로 → 같은 턴에 다시 낸다. B5: 그 드로로 총통이 되면 선택. */
function playBonus(tx: Tx, seat: Seat, card: CardId): void {
  const ctx = ensureCtx(tx, seat);
  removeFromHand(tx, seat, [card]);
  emit(tx, { type: 'CardPlayed', seat, cards: [card], bonus: true });
  gainCards(tx, seat, [card], 'hand');
  const drawn = drawTop(tx);
  tx.s.seats[seat].hand.push(drawn);
  emit(tx, { type: 'CardDrawn', seat, cards: [drawn] });
  const rule = tx.s.rules.bonusChongtong;
  if (
    !isBonus(drawn) &&
    monthCountInHand(tx, seat, monthOf(drawn)) === 4 &&
    (rule === 'always' || (rule === 'firstTurn' && ctx.index === 1))
  ) {
    offerChongtong(tx, seat, [monthOf(drawn)], 'turn');
    return;
  }
  recomputeScores(tx);
  promptPlay(tx, seat);
}

/** E12: 총통 끝내기/계속하기. 계속하기가 꺼져 있으면 즉시 승리. */
export function offerChongtong(
  tx: Tx,
  seat: Seat,
  months: readonly Month[],
  resume: 'deal' | 'turn',
): void {
  if (!tx.s.rules.chongtongContinue) {
    const cards = chongtongCards(tx, seat, months);
    reveal(tx, seat, cards);
    emit(tx, { type: 'Chongtong', seat, cards, months, choice: 'auto' });
    endRound(tx, 'chongtong', seat);
    return;
  }
  tx.s.pending = { kind: 'chongtong', seat, months, resume };
}

function chongtongCards(tx: Tx, seat: Seat, months: readonly Month[]): CardId[] {
  return tx.s.seats[seat].hand.filter((id) => {
    const month = getCard(id).month;
    return month !== null && months.includes(month);
  });
}

/**
 * 총통 응답. 끝내기는 공개 이벤트(Chongtong)와 함께 판을 끝낸다.
 * 계속하기는 이벤트를 내지 않는다: 상대가 "총통을 들고 있다"는 사실을 알면 안 되기 때문이다(M1 리뷰 F-6).
 * 계속한 좌석 자신은 액션으로 알고, 월은 4장 흔들기(E12)를 고를 때에만 공개된다.
 */
export function actChongtong(tx: Tx, seat: Seat, choice: 'end' | 'continue'): void {
  const pending = tx.s.pending;
  invariant(pending?.kind === 'chongtong', '총통 프롬프트가 아닙니다');
  if (choice === 'end') {
    const cards = chongtongCards(tx, seat, pending.months);
    reveal(tx, seat, cards);
    emit(tx, { type: 'Chongtong', seat, cards, months: pending.months, choice });
    endRound(tx, 'chongtong', seat);
    return;
  }
  promptPlay(tx, pending.resume === 'deal' ? tx.s.turn : seat);
}

/**
 * 흔들기 응답 (E11). 흔들면 그 월 카드를 모두 보여 주는 공개 이벤트(Shake)를 낸다.
 * 흔들지 않으면 이벤트를 내지 않는다: 거절 사실만으로도 뒤이은 CardPlayed의 월에 3장 이상을 쥐고 있다는 것이
 * 드러나기 때문이다(M1 리뷰 F-1). 상대 뷰에서는 흔들기 프롬프트도 카드 내기 대기로 보인다(view.ts).
 */
export function actShake(tx: Tx, seat: Seat, accept: boolean): void {
  const pending = tx.s.pending;
  invariant(pending?.kind === 'shake', '흔들기 프롬프트가 아닙니다');
  if (accept) {
    tx.s.seats[seat].shakes += 1;
    const shown = tx.s.seats[seat].hand.filter((id) => getCard(id).month === pending.month);
    reveal(tx, seat, shown);
    emit(tx, { type: 'Shake', seat, cards: shown, month: pending.month, accepted: true });
  }
  playCard(tx, seat, pending.card);
}

/** MATCH_PLAY: 낸 카드의 월에 바닥 2장이면 PROMPT_TARGET, 아니면 FLIP */
function playCard(tx: Tx, seat: Seat, card: CardId): void {
  const ctx = ensureCtx(tx, seat);
  removeFromHand(tx, seat, [card]);
  ctx.mode = 'card';
  ctx.played = card;
  ctx.lastTurn = unitsLeft(tx.s.seats[seat]) === 0;
  emit(tx, { type: 'CardPlayed', seat, cards: [card], bonus: false });
  const month = monthOf(card);
  ctx.playBefore = groupSize(tx.s.floor, month);
  const group = findGroup(tx.s.floor, month);
  if (ctx.playBefore === 2 && group !== undefined) {
    tx.s.pending = { kind: 'target', seat, source: 'play', card, options: [...group.cards] };
    return;
  }
  flipStep(tx);
}

/** E9·E10: 폭탄. 손패 3장(또는 2장) + 바닥 1장(또는 2장)을 한 번에 먹고 피 1장, 폭탄패를 받는다. */
export function actBomb(tx: Tx, seat: Seat, month: Month): void {
  const ctx = ensureCtx(tx, seat);
  const state = tx.s.seats[seat];
  const handCards = state.hand.filter((id) => getCard(id).month === month);
  removeFromHand(tx, seat, handCards);
  const group = removeGroup(tx.s.floor, month);
  invariant(group !== undefined, '폭탄 대상 바닥 카드가 없습니다');
  state.bombTokens += handCards.length - 1;
  ctx.mode = 'bomb';
  ctx.lastTurn = unitsLeft(state) === 0;
  if (handCards.length === 3 || tx.s.rules.twoCardBomb === 'double') {
    state.bombs += 1;
  }
  const cards = [...handCards, ...group.cards];
  emit(tx, { type: 'Bomb', seat, cards, month, handCards: handCards.length });
  gainCards(tx, seat, cards, 'floor');
  stealPi(tx, seat, 'bomb', 1);
  flipStep(tx);
}

/** 폭탄패 턴: 손패 대신 뒤집기만 한다 (12.8). */
export function actFlipOnly(tx: Tx, seat: Seat): void {
  const ctx = ensureCtx(tx, seat);
  const state = tx.s.seats[seat];
  state.bombTokens -= 1;
  ctx.mode = 'flipOnly';
  ctx.lastTurn = unitsLeft(state) === 0;
  flipStep(tx);
}

export function actTarget(tx: Tx, card: CardId): void {
  const pending = tx.s.pending;
  const ctx = tx.s.ctx;
  invariant(pending?.kind === 'target' && ctx !== null, '대상 선택 프롬프트가 아닙니다');
  if (pending.source === 'play') {
    ctx.playTarget = card;
    flipStep(tx);
  } else {
    ctx.flipTarget = card;
    resolve(tx);
  }
}

/** FLIP → MATCH_FLIP: 보너스면 들고 다시 뒤집는다(B2). 다른 월 바닥 2장이면 PROMPT_TARGET. */
function flipStep(tx: Tx): void {
  const ctx = tx.s.ctx;
  invariant(ctx !== null, '턴 작업 공간이 없습니다');
  let flipped = drawTop(tx);
  emit(tx, { type: 'CardFlipped', seat: ctx.seat, cards: [flipped] });
  while (isBonus(flipped)) {
    ctx.heldBonuses.push(flipped);
    flipped = drawTop(tx);
    emit(tx, { type: 'CardFlipped', seat: ctx.seat, cards: [flipped] });
  }
  ctx.flipped = flipped;
  const month = monthOf(flipped);
  if (ctx.played !== null && monthOf(ctx.played) === month) {
    resolve(tx);
    return;
  }
  const group = findGroup(tx.s.floor, month);
  if (groupSize(tx.s.floor, month) === 2 && group !== undefined) {
    tx.s.pending = {
      kind: 'target',
      seat: ctx.seat,
      source: 'flip',
      card: flipped,
      options: [...group.cards],
    };
    return;
  }
  resolve(tx);
}

interface StealOrder {
  readonly reason: StealReason;
  readonly count: number;
  readonly stopAtDouble: boolean;
}

/** 한 장(낸 카드 또는 뒤집은 카드)이 다른 카드와 겹치지 않을 때의 매칭. 먹은 카드를 captures에 더한다. */
function matchSingle(
  tx: Tx,
  ctx: DraftCtx,
  card: CardId,
  target: CardId | null,
  source: 'play' | 'flip',
  captures: CardId[],
  steals: StealOrder[],
): void {
  const floor = tx.s.floor;
  const month = monthOf(card);
  const group = findGroup(floor, month);
  const seat = ctx.seat;
  if (group === undefined) {
    placeLoose(floor, card);
    emit(tx, { type: 'Placed', seat, cards: [card], source });
    return;
  }
  if (group.kind === 'loose') {
    const matched = group.cards.length === 2 ? target : group.cards[0];
    invariant(matched !== null && matched !== undefined, '대상이 정해지지 않았습니다');
    removeLooseCard(floor, matched);
    emit(tx, { type: 'Matched', seat, cards: [card, matched], source, target: matched });
    captures.push(matched, card);
    return;
  }
  // 뻑·자연뻑 무더기 먹기 (E2·E3·R7)
  removeGroup(floor, month);
  const [first] = group.cards;
  emit(tx, { type: 'Matched', seat, cards: [card, ...group.cards], source, target: first ?? card });
  captures.push(...group.cards, card);
  const stealAllowed = !ctx.lastTurn || tx.s.rules.lastTurnPpeokSteal;
  if (group.kind === 'natural') {
    emit(tx, { type: 'PpeokTaken', seat, cards: [...group.cards], pileOwner: null, natural: true });
    if (stealAllowed && tx.s.rules.naturalPpeokSteal) {
      steals.push({ reason: 'naturalPpeok', count: 1, stopAtDouble: false });
    }
  } else if (group.owner === seat) {
    emit(tx, { type: 'SelfPpeok', seat, cards: [...group.cards] });
    if (stealAllowed) {
      steals.push({ reason: 'selfPpeok', count: 2, stopAtDouble: true });
    }
  } else {
    emit(tx, {
      type: 'PpeokTaken',
      seat,
      cards: [...group.cards],
      pileOwner: group.owner,
      natural: false,
    });
    if (stealAllowed) {
      steals.push({ reason: 'ppeokTaken', count: 1, stopAtDouble: false });
    }
  }
}

function recordPayout(tx: Tx, seat: Seat, kind: InstantPayoutKind, points: number): void {
  const payout: InstantPayout = { kind, to: seat, from: other(seat), points };
  tx.s.instantPayouts.push(payout);
  emit(tx, { type: 'InstantPayout', seat, cards: [], kind, points, from: payout.from });
}

const PPEOK_PAYOUT_KINDS: readonly InstantPayoutKind[] = [
  'firstPpeok',
  'secondPpeok',
  'thirdPpeok',
];

/** E4: 첫 턴부터 연속된 뻑이면 첫뻑/연뻑/3연뻑 즉시 정산 */
function ppeokPayout(tx: Tx, seat: Seat, turnIndex: number): void {
  const turns = tx.s.seats[seat].ppeokTurns;
  const kind = PPEOK_PAYOUT_KINDS[turnIndex - 1];
  const fromFirstTurn = turns.length === turnIndex && turns.every((t, i) => t === i + 1);
  const mode = tx.s.rules.ppeokPayout;
  if (kind === undefined || !fromFirstTurn || mode === 'off') {
    return;
  }
  // 'points': 7/14/21점, 'baseMultiple': 기본점수(7) × 1/2/3 (결정 D3: 지금은 같은 값)
  const unit = mode === 'points' ? INSTANT_UNIT_POINTS : BASE_POINTS;
  recordPayout(tx, seat, kind, unit * turnIndex);
}

/** RESOLVE: 획득 이동, 뻑·쪽·따닥·쓸 판정, 피 뺏기, 즉시 정산 */
function resolve(tx: Tx): void {
  const ctx = tx.s.ctx;
  invariant(ctx !== null && ctx.flipped !== null, '뒤집은 카드가 없습니다');
  tx.s.pending = null;
  const seat = ctx.seat;
  const floor = tx.s.floor;
  const played = ctx.played;
  const flipped = ctx.flipped;
  const captures: CardId[] = [];
  const steals: StealOrder[] = [];
  let ppeokMade = false;
  let ttadak = false;

  if (played !== null && monthOf(played) === monthOf(flipped)) {
    const month = monthOf(played);
    const group = findGroup(floor, month);
    const floorCards = group === undefined ? [] : [...group.cards];
    if (ctx.playBefore === 0) {
      // E7 쪽: 먹을 게 없어 낸 패를 뒤집은 패로 바로 먹음
      captures.push(played, flipped);
      if (!ctx.lastTurn) {
        emit(tx, { type: 'Jjok', seat, cards: [played, flipped] });
        steals.push({ reason: 'jjok', count: 1, stopAtDouble: false });
      }
    } else if (ctx.playBefore === 1 && !ctx.lastTurn) {
      // E1 뻑: 세 장을 바닥에 남긴다. 들고 있던 보너스도 묻힌다(B2).
      removeGroup(floor, month);
      const pile = [...floorCards, played, flipped, ...ctx.heldBonuses];
      placeGroup(floor, { month, cards: pile, kind: 'ppeok', owner: seat });
      ppeokMade = true;
      const state = tx.s.seats[seat];
      state.ppeokTurns.push(ctx.index);
      emit(tx, {
        type: 'Ppeok',
        seat,
        cards: pile,
        count: state.ppeokTurns.length,
        turnIndex: ctx.index,
      });
    } else {
      // 마지막 턴 뻑(불성립, 3장 획득) 또는 E6 따닥(바닥 2장 + 낸 패 + 뒤집은 패)
      removeGroup(floor, month);
      captures.push(...floorCards, played, flipped);
      ttadak = ctx.playBefore === 2 && !ctx.lastTurn;
      if (ttadak) {
        emit(tx, { type: 'Ttadak', seat, cards: [...floorCards, played, flipped] });
        steals.push({ reason: 'ttadak', count: 1, stopAtDouble: false });
      }
    }
  } else {
    if (played !== null) {
      matchSingle(tx, ctx, played, ctx.playTarget, 'play', captures, steals);
    }
    matchSingle(tx, ctx, flipped, ctx.flipTarget, 'flip', captures, steals);
  }

  gainCards(tx, seat, captures, 'floor');
  if (!ppeokMade) {
    gainCards(tx, seat, ctx.heldBonuses, 'flip');
  }
  if (ppeokMade) {
    ppeokPayout(tx, seat, ctx.index);
  }
  if (ttadak && ctx.index === 1 && tx.s.rules.firstTtadakPayout) {
    recordPayout(tx, seat, 'firstTtadak', INSTANT_UNIT_POINTS);
  }
  // E8 쓸: 바닥을 모두 쓸어감(마지막 턴 제외). 다른 이벤트와 중복되면 각각 뺏는다.
  if (floor.length === 0 && ctx.capturedAny && !ctx.lastTurn) {
    emit(tx, { type: 'Sseul', seat, cards: [] });
    steals.push({ reason: 'sseul', count: 1, stopAtDouble: false });
  }
  for (const order of steals) {
    stealPi(tx, seat, order.reason, order.count, order.stopAtDouble);
  }
  if (ctx.gukjinCaptured && tx.s.rules.gukjin === 'ask') {
    tx.s.pending = { kind: 'gukjin', seat };
    return;
  }
  finishTurn(tx);
}

export function actGukjin(tx: Tx, seat: Seat, asPi: boolean): void {
  tx.s.seats[seat].gukjinAsPi = asPi;
  emit(tx, { type: 'GukjinPlaced', seat, cards: [], asPi });
  finishTurn(tx);
}

/** SCORE → NEXT: 3뻑·허당 종료, 고/스톱 판정(G1·G2), 다음 턴 */
function finishTurn(tx: Tx): void {
  const ctx = tx.s.ctx;
  invariant(ctx !== null, '턴 작업 공간이 없습니다');
  const seat = ctx.seat;
  const state = tx.s.seats[seat];
  recomputeScores(tx);
  if (state.ppeokTurns.length >= THREE_PPEOK) {
    endRound(tx, 'threePpeok', seat);
    return;
  }
  state.noCaptureStreak = ctx.capturedAny ? 0 : state.noCaptureStreak + 1;
  if (tx.s.rules.hudang && state.noCaptureStreak >= HUDANG_TURNS) {
    emit(tx, { type: 'Hudang', seat, cards: [] });
    endRound(tx, 'hudang', seat);
    return;
  }
  const score = state.score.total;
  const threshold = state.goCount === 0 ? WINNING_SCORE : state.lastGoScore + 1;
  if (score >= threshold) {
    if (unitsLeft(state) === 0) {
      // 해석: 자기 손패가 없으면 더 칠 수 없으므로 고를 부를 수 없고 자동 스톱한다.
      emit(tx, { type: 'Stop', seat, cards: [], auto: true });
      endRound(tx, 'autoStop', seat);
      return;
    }
    tx.s.pending = { kind: 'goStop', seat, score };
    emit(tx, { type: 'GoStopPrompt', seat, cards: [], score });
    return;
  }
  nextTurn(tx);
}

function nextTurn(tx: Tx): void {
  const ctx = tx.s.ctx;
  invariant(ctx !== null, '턴 작업 공간이 없습니다');
  tx.s.ctx = null;
  const [a, b] = tx.s.seats;
  if (unitsLeft(a) === 0 && unitsLeft(b) === 0) {
    // G9: 모든 패를 쓸 때까지 아무도 나지 못하면 나가리
    endRound(tx, 'exhausted', null);
    return;
  }
  const next = other(ctx.seat);
  promptPlay(tx, unitsLeft(tx.s.seats[next]) > 0 ? next : ctx.seat);
}

export function actGo(tx: Tx, seat: Seat): void {
  const state = tx.s.seats[seat];
  state.goCount += 1;
  state.lastGoScore = state.score.total;
  emit(tx, { type: 'Go', seat, cards: [], count: state.goCount, score: state.lastGoScore });
  nextTurn(tx);
}

export function actStop(tx: Tx, seat: Seat): void {
  emit(tx, { type: 'Stop', seat, cards: [], auto: false });
  endRound(tx, 'stop', seat);
}

/**
 * 밀기 (rules-commercial §10.1 한게임 신맞고, 12.7 토글 push): 끝난 판의 승자가 이번 판 정산을 포기하고 다음 판을
 * ×2^(연속 밀기 횟수)로 키운다. 즉시 정산은 이미 발생 시점에 원장에 들어갔으므로 그대로다.
 * 포기한 정산(pushed)으로 Settled를 한 번 더 낸다: 호출자는 마지막 Settled(또는 settle(state))를 원장에 넣는다.
 */
export function actPush(tx: Tx, seat: Seat): void {
  const result = tx.s.result;
  invariant(result !== null && result.winner === seat, '밀기는 끝난 판의 승자만 할 수 있습니다');
  tx.s.result = { ...result, pushed: true };
  const settlement = settle(tx.s);
  const pushes = settlement.nextPushes ?? 0;
  emit(tx, {
    type: 'Pushed',
    seat,
    cards: [],
    pushes,
    multiplier: 2 ** pushes,
    forfeitedPoints: settlement.forfeitedPoints ?? 0,
  });
  emit(tx, { type: 'Settled', seat, cards: [], settlement });
}
