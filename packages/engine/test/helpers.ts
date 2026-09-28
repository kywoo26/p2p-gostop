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

export function playRandomRound(
  rules: RuleOptions,
  seed: number,
  opts: RoundOptions,
  policySeed: number,
  onStep?: (state: GameState, action: Action | null) => void,
): PlayedRound {
  const started = newRound(rules, seed, opts);
  let state = started.state;
  const events: EngineEvent[] = [...started.events];
  const actions: Action[] = [];
  let rng = createRng(policySeed);
  onStep?.(state, null);
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
    const result = reduce(state, action);
    if (!result.ok) {
      throw new Error(`합법 수가 거부됨: ${result.message}`);
    }
    actions.push(action);
    events.push(...result.events);
    state = result.state;
    onStep?.(state, action);
  }
  return { start: started.state, state, actions, events };
}

export const flipSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export function mirrorAction(action: Action): Action {
  return { ...action, seat: flipSeat(action.seat) };
}
