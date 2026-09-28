// 상태 전이 (spec 4.3). 규칙 위반은 예외 대신 { ok: false, reason }으로 돌려준다.
// 설계: reduce는 legalActions에 있는 액션만 받는다. 그래서 규칙 검증은 legal.ts 한 곳에만 있다.
import { actPickFirst } from './deal.ts';
import { beginTx } from './draft.ts';
import { legalActions, sameAction } from './legal.ts';
import type { Action, GameState, ReduceResult } from './state.ts';
import {
  actBomb,
  actChongtong,
  actFlipOnly,
  actGo,
  actGukjin,
  actPlay,
  actShake,
  actStop,
  actTarget,
} from './turn.ts';

function reject(
  reason: 'roundOver' | 'notYourTurn' | 'illegalAction',
  action: Action,
): ReduceResult {
  const messages = {
    roundOver: '판이 끝났습니다',
    notYourTurn: '지금 입력할 차례가 아닙니다',
    illegalAction: '합법 수가 아닙니다',
  } as const;
  return { ok: false, reason, message: `${messages[reason]}: ${JSON.stringify(action)}` };
}

/** 액션 하나를 적용한다. 입력 상태는 바뀌지 않는다. */
export function reduce(state: GameState, action: Action): ReduceResult {
  if (state.phase === 'end') {
    return reject('roundOver', action);
  }
  const legal = legalActions(state, action.seat);
  if (legal.length === 0) {
    return reject('notYourTurn', action);
  }
  if (!legal.some((candidate) => sameAction(candidate, action))) {
    return reject('illegalAction', action);
  }
  const tx = beginTx(state);
  switch (action.type) {
    case 'pickFirst':
      actPickFirst(tx, action.seat, action.index);
      break;
    case 'chongtong':
      actChongtong(tx, action.seat, action.choice);
      break;
    case 'play':
      actPlay(tx, action.seat, action.card);
      break;
    case 'bomb':
      actBomb(tx, action.seat, action.month);
      break;
    case 'flipOnly':
      actFlipOnly(tx, action.seat);
      break;
    case 'shake':
      actShake(tx, action.seat, action.accept);
      break;
    case 'chooseTarget':
      actTarget(tx, action.card);
      break;
    case 'gukjin':
      actGukjin(tx, action.seat, action.asPi);
      break;
    case 'go':
      actGo(tx, action.seat);
      break;
    case 'stop':
      actStop(tx, action.seat);
      break;
  }
  return { ok: true, state: tx.s, events: tx.events };
}
