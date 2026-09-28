// 상태 전이 (spec 4.3). 규칙 위반은 예외 대신 { ok: false, reason }으로 돌려준다.
// 설계: reduce는 legalActions에 있는 액션만 받는다. 그래서 규칙 검증은 legal.ts 한 곳에만 있다.
// applyUnchecked는 그 검사를 건너뛰는 롤아웃 전용 경로다(호출자가 합법성을 보장).
import { actPickFirst } from './deal.ts';
import { beginTx, type Tx } from './draft.ts';
import { legalActions, sameAction } from './legal.ts';
import type {
  Action,
  ActionType,
  EngineEvent,
  GameState,
  ReduceResult,
  RejectReason,
} from './state.ts';
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

/** 합법성이 확인된 액션을 작업 공간에 적용한다 (reduce·applyUnchecked 공용) */
function applyTo(tx: Tx, action: Action): void {
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
  const legal = legalActions(state, action.seat);
  const accepted = legal.some((candidate) => sameAction(candidate, action));
  if (state.phase === 'end' && !accepted) {
    return reject('roundOver', action);
  }
  if (legal.length === 0) {
    return reject('notYourTurn', action);
  }
  if (!accepted) {
    return reject('illegalAction', action);
  }
  const tx = beginTx(state);
  applyTo(tx, action);
  return { ok: true, state: tx.s, events: tx.events };
}

/** applyUnchecked의 결과 (reduce의 성공 결과와 같은 모양) */
export interface ApplyResult {
  readonly state: GameState;
  readonly events: readonly EngineEvent[];
}

/**
 * 검증 없는 적용 경로 (롤아웃·결정화 탐색 전용, ai-tuning.md §6-6). **호출자가 합법성을 보장한다**:
 * `action`은 반드시 같은 상태의 `legalActions(state, action.seat)`가 낸 것이어야 한다.
 * 형태 검사·판 종료 검사·합법 수 재계산을 모두 건너뛴다. 합법 수에 대해서는 상태·이벤트가 reduce와 똑같다
 * (속성 테스트로 강제). 합법이 아닌 액션을 넣으면 결과는 정의되지 않는다(불변식 예외나 모순된 상태).
 * 신뢰할 수 없는 입력(네트워크·UI)에는 쓰지 말고 reduce를 쓴다.
 */
export function applyUnchecked(state: GameState, action: Action): ApplyResult {
  const tx = beginTx(state);
  applyTo(tx, action);
  return { state: tx.s, events: tx.events };
}
