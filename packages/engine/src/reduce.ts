// 상태 전이 (spec 4.3). 규칙 위반은 예외 대신 { ok: false, reason }으로 돌려준다.
// 설계: reduce는 legalActions에 있는 액션만 받는다. 그래서 규칙 검증은 legal.ts 한 곳에만 있다.
import { actPickFirst } from './deal.ts';
import { beginTx } from './draft.ts';
import { legalActions, sameAction } from './legal.ts';
import type { Action, ActionType, GameState, ReduceResult, RejectReason } from './state.ts';
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

const ACTION_TYPES: ReadonlySet<string> = new Set<ActionType>([
  'pickFirst',
  'chongtong',
  'play',
  'bomb',
  'flipOnly',
  'shake',
  'chooseTarget',
  'gukjin',
  'go',
  'stop',
]);

/**
 * 신뢰할 수 없는 입력(네트워크 JSON)의 최소 형태 검사: 객체이고 type이 알려진 액션 종류, seat가 0 또는 1.
 * 나머지 필드(카드·월·선택)는 legalActions와의 비교(sameAction, ===)에서 걸러진다.
 */
function isActionShape(value: unknown): value is Action {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const type: unknown = Reflect.get(value, 'type');
  const seat: unknown = Reflect.get(value, 'seat');
  return typeof type === 'string' && ACTION_TYPES.has(type) && (seat === 0 || seat === 1);
}

function describe(action: unknown): string {
  try {
    // JSON.stringify(undefined)는 undefined를 돌려준다
    const text: string | undefined = JSON.stringify(action);
    return text ?? String(action);
  } catch {
    return String(action);
  }
}

function reject(reason: RejectReason, action: unknown): ReduceResult {
  const messages = {
    roundOver: '판이 끝났습니다',
    notYourTurn: '지금 입력할 차례가 아닙니다',
    illegalAction: '합법 수가 아닙니다',
  } as const;
  return { ok: false, reason, message: `${messages[reason]}: ${describe(action)}` };
}

/**
 * 액션 하나를 적용한다. 입력 상태는 바뀌지 않는다.
 * 형태가 잘못된 입력(null, 알 수 없는 type, 좌석 '0' 등)도 예외 없이 illegalAction으로 거부한다(M1 리뷰 F-9).
 * 네트워크에서 받은 검증 전 JSON은 두 번째 시그니처(unknown)로 그대로 넘겨도 된다.
 */
export function reduce(state: GameState, action: Action): ReduceResult;
export function reduce(state: GameState, action: unknown): ReduceResult;
export function reduce(state: GameState, action: unknown): ReduceResult {
  if (!isActionShape(action)) {
    return reject('illegalAction', action);
  }
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
