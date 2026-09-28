// 합법 수 (code-refs 6.2: 단일 진실원). UI·AI·네트워크 검증이 모두 이 함수를 쓴다.
import { getCard, type Month } from './cards.ts';
import { findGroup } from './floor.ts';
import type { Action, GameState, Seat } from './state.ts';

function bombMonths(state: GameState, seat: Seat): Month[] {
  const counts = new Map<Month, number>();
  for (const id of state.seats[seat].hand) {
    const month = getCard(id).month;
    if (month !== null) {
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
  }
  const months: Month[] = [];
  for (const [month, inHand] of counts) {
    const group = findGroup(state.floor, month);
    if (group?.kind !== 'loose') {
      continue;
    }
    const onFloor = group.cards.length;
    // E9: 손패 3장 + 바닥 1장. E10(토글): 손패 2장 + 바닥 2장
    if (
      (inHand === 3 && onFloor === 1) ||
      (inHand === 2 && onFloor === 2 && state.rules.twoCardBomb !== 'off')
    ) {
      months.push(month);
    }
  }
  return months.toSorted((a, b) => a - b);
}

function playActions(state: GameState, seat: Seat): Action[] {
  const actions: Action[] = [...new Set(state.seats[seat].hand)]
    .toSorted((a, b) => a - b)
    .map((card) => ({ type: 'play', seat, card }));
  for (const month of bombMonths(state, seat)) {
    actions.push({ type: 'bomb', seat, month });
  }
  if (state.seats[seat].bombTokens > 0) {
    actions.push({ type: 'flipOnly', seat });
  }
  return actions;
}

/** 이 좌석이 지금 할 수 있는 모든 액션. 차례가 아니거나 판이 끝났으면 빈 배열. */
export function legalActions(state: GameState, seat: Seat): Action[] {
  const pending = state.pending;
  if (state.phase === 'end' || pending === null) {
    return [];
  }
  if (pending.kind === 'pickFirst') {
    const fp = state.firstPick;
    if (fp === null || !pending.seats.includes(seat)) {
      return [];
    }
    const taken = fp.picks[seat === 0 ? 1 : 0];
    return fp.pool.flatMap((_, index) =>
      index === taken ? [] : [{ type: 'pickFirst', seat, index }],
    );
  }
  if (pending.seat !== seat) {
    return [];
  }
  switch (pending.kind) {
    case 'chongtong':
      return [
        { type: 'chongtong', seat, choice: 'end' },
        { type: 'chongtong', seat, choice: 'continue' },
      ];
    case 'play':
      return playActions(state, seat);
    case 'shake':
      return [
        { type: 'shake', seat, accept: true },
        { type: 'shake', seat, accept: false },
      ];
    case 'target':
      return pending.options.map((card) => ({ type: 'chooseTarget', seat, card }));
    case 'gukjin':
      return [
        { type: 'gukjin', seat, asPi: false },
        { type: 'gukjin', seat, asPi: true },
      ];
  }
  // goStop
  return [
    { type: 'go', seat },
    { type: 'stop', seat },
  ];
}

/** 두 액션이 같은지 (필드 순서 무관). 신뢰할 수 없는 입력의 여분 필드는 무시한다. */
export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type || a.seat !== b.seat) {
    return false;
  }
  switch (a.type) {
    case 'pickFirst':
      return b.type === 'pickFirst' && a.index === b.index;
    case 'chongtong':
      return b.type === 'chongtong' && a.choice === b.choice;
    case 'play':
      return b.type === 'play' && a.card === b.card;
    case 'bomb':
      return b.type === 'bomb' && a.month === b.month;
    case 'shake':
      return b.type === 'shake' && a.accept === b.accept;
    case 'chooseTarget':
      return b.type === 'chooseTarget' && a.card === b.card;
    case 'gukjin':
      return b.type === 'gukjin' && a.asPi === b.asPi;
  }
  // flipOnly·go·stop은 종류와 좌석만 비교한다
  return true;
}
