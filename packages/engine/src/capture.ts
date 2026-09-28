// 획득과 피 뺏기 (rules 12.2 B3·B4, 12.3 S5, 12.4 E2).
import { getCard, type CardId } from './cards.ts';
import { emit, other, type DraftSeat, type Tx } from './draft.ts';
import type { RuleOptions } from './rules.ts';
import { GUKJIN_ID, seatScore } from './score.ts';
import type { Seat, StealReason } from './state.ts';

/**
 * 뺏기 순위 (B4): 일반피(1) → 쌍피·국진쌍피(2) → 보너스 2피(3) → 보너스 3피(4). 같은 순위는 카드 ID 오름차순
 * (국진 32가 11쌍피 43·12쌍피 47보다 먼저).
 * 국진은 지금 점수 계산이 쌍피로 세고 있고(자동 모드: 총점이 더 큰 쪽, 묻기 모드: 좌석이 고른 쪽)
 * 다른 피가 1장 이상 있을 때만 후보다. 국진이 유일한 피면 열끗 자리에 고정되어 뺏기지 않는다(S5, 결정 D1).
 */
function stealTier(id: CardId): number {
  const card = getCard(id);
  if (card.kind === 'bonus') {
    return card.piValue === 2 ? 3 : 4;
  }
  if (card.isGukjin) {
    return 2;
  }
  return card.piValue === 2 ? 2 : 1;
}

/** 이 좌석의 지금 점수 분해가 국진을 쌍피로 세는지 (뺏기 직전 획득 패로 다시 계산) */
function gukjinCountsAsPi(seat: DraftSeat, rules: RuleOptions): boolean {
  return (
    seat.captured.yeol.includes(GUKJIN_ID) &&
    seatScore(seat.captured, seat.gukjinAsPi, rules).gukjinAsPi
  );
}

function stealCandidates(seat: DraftSeat, rules: RuleOptions): CardId[] {
  const list = [...seat.captured.pi];
  if (list.length > 0 && gukjinCountsAsPi(seat, rules)) {
    list.push(GUKJIN_ID);
  }
  return list.toSorted((a, b) => stealTier(a) - stealTier(b) || a - b);
}

/**
 * 상대(from)의 피를 가장 낮은 것부터 최대 count장 가져온다. 상대 피가 없으면 무효.
 * stopAtDouble: 자뻑처럼 "첫 장이 쌍피 이상이면 그 1장으로 끝" (E2 자체 해석: 뺏은 가치 합이 2 이상이면 중단).
 * 뺏어온 보너스는 뺏기를 다시 발동하지 않는다 (B3 제외 조건).
 */
export function stealPi(
  tx: Tx,
  to: Seat,
  reason: StealReason,
  count: number,
  stopAtDouble = false,
): CardId[] {
  const from = other(to);
  const victim = tx.s.seats[from];
  const thief = tx.s.seats[to];
  const stolen: CardId[] = [];
  let value = 0;
  while (stolen.length < count) {
    const [id] = stealCandidates(victim, tx.s.rules);
    if (id === undefined || (stopAtDouble && value >= 2)) {
      break;
    }
    if (id === GUKJIN_ID) {
      victim.captured.yeol = victim.captured.yeol.filter((c) => c !== id);
      thief.captured.yeol.push(id);
      thief.gukjinAsPi = true;
    } else {
      victim.captured.pi = victim.captured.pi.filter((c) => c !== id);
      thief.captured.pi.push(id);
    }
    stolen.push(id);
    value += getCard(id).piValue;
    emit(tx, { type: 'PiStolen', seat: to, cards: [id], from, to, reason });
  }
  return stolen;
}

function addToPile(seat: DraftSeat, id: CardId): void {
  const kind = getCard(id).kind;
  const pile = kind === 'bonus' ? seat.captured.pi : seat.captured[kind];
  pile.push(id);
}

/**
 * 카드를 좌석의 획득 패로 옮긴다. 보너스는 BonusGained와 함께 뺏기(B3)를 발동한다.
 * bonusSteal: 이 획득 경로에서 보너스 뺏기를 허용하는지(분배 시 바닥 보너스는 별도 토글, B3(d)).
 */
export function gainCards(
  tx: Tx,
  seat: Seat,
  ids: readonly CardId[],
  source: 'hand' | 'flip' | 'floor' | 'deal',
  bonusSteal = tx.s.rules.bonusSteal,
): void {
  if (ids.length === 0) {
    return;
  }
  const target = tx.s.seats[seat];
  for (const id of ids) {
    addToPile(target, id);
  }
  emit(tx, { type: 'Captured', seat, cards: [...ids], to: seat });
  const ctx = tx.s.ctx;
  if (ctx !== null && ctx.seat === seat) {
    ctx.capturedAny = true;
    if (ids.includes(GUKJIN_ID)) {
      ctx.gukjinCaptured = true;
    }
  }
  for (const id of ids) {
    const bonus = getCard(id).bonus;
    if (bonus !== null) {
      emit(tx, { type: 'BonusGained', seat, cards: [id], source });
      if (bonusSteal && bonus.stealsOnGain) {
        stealPi(tx, seat, 'bonus', 1);
      }
    }
  }
}
