// 테스트 공용: 무작위 합법 정책으로 한 판을 끝까지 둔다.
import {
  createRng,
  legalActions,
  newRound,
  nextInt,
  reduce,
  type Action,
  type EngineEvent,
  type GameState,
  type RoundOptions,
  type RuleOptions,
  type Seat,
} from '../src/index.ts';

/** 지금 입력해야 하는 좌석(선 고르기에서는 아직 고르지 않은 첫 좌석) */
function actingSeat(state: GameState): Seat | null {
  const pending = state.pending;
  if (pending === null) {
    return null;
  }
  return pending.kind === 'pickFirst' ? (pending.seats[0] ?? null) : pending.seat;
}

export interface PlayedRound {
  readonly start: GameState;
  readonly state: GameState;
  readonly actions: Action[];
  readonly events: EngineEvent[];
}

const MAX_STEPS = 500;

/** 객체 그래프 전체를 얼린다. 얼린 상태로 reduce를 부르면 입력을 바꾸는 순간 TypeError가 난다(불변성 검사). */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

/**
 * onStep(state, action, events, before): 매 단계 뒤(처음에는 action = null, events = 분배 이벤트, before = null).
 * 모든 상태를 reduce에 넘기기 전에 deepFreeze한다.
 * 판이 끝난 뒤 승자가 밀기(push)를 할 수 있으면 정책 난수로 절반쯤 민다(12.7 밀기 경로도 같은 불변식으로 검사).
 */
export function playRandomRound(
  rules: RuleOptions,
  seed: number,
  opts: RoundOptions,
  policySeed: number,
  onStep?: (
    state: GameState,
    action: Action | null,
    events: readonly EngineEvent[],
    before: GameState | null,
  ) => void,
): PlayedRound {
  const started = newRound(rules, seed, opts);
  let state = started.state;
  const events: EngineEvent[] = [...started.events];
  const actions: Action[] = [];
  let rng = createRng(policySeed);
  onStep?.(state, null, started.events, null);
  const apply = (action: Action): void => {
    const before = deepFreeze(state);
    const result = reduce(before, action);
    if (!result.ok) {
      throw new Error(`합법 수가 거부됨: ${result.message}`);
    }
    actions.push(action);
    events.push(...result.events);
    state = result.state;
    onStep?.(state, action, result.events, before);
  };
  for (let step = 0; state.phase !== 'end'; step++) {
    if (step > MAX_STEPS) {
      throw new Error('판이 끝나지 않습니다');
    }
    const seat = actingSeat(state);
    if (seat === null) {
      throw new Error('입력할 좌석이 없는데 판이 끝나지 않았습니다');
    }
    const legal = legalActions(state, seat);
    const [index, next] = nextInt(rng, legal.length);
    rng = next;
    const action = legal[index];
    if (action === undefined) {
      throw new Error('합법 수가 없습니다');
    }
    apply(action);
  }
  const winner = state.result?.winner ?? null;
  const push = winner === null ? undefined : legalActions(state, winner)[0];
  if (push !== undefined) {
    const [coin] = nextInt(rng, 2);
    if (coin === 1) {
      apply(push);
    }
  }
  return { start: started.state, state, actions, events };
}

export const flipSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export function mirrorAction(action: Action): Action {
  return { ...action, seat: flipSeat(action.seat) };
}
