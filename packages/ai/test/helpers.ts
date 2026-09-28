// 테스트 공용: 무작위 진행으로 다양한 결정 지점 상태를 만든다.
import {
  PRESETS,
  createRng,
  legalActions,
  newRound,
  nextInt,
  reduce,
  shuffleWith,
  type GameState,
  type PresetId,
  type RuleOptions,
} from '@p2p-gostop/engine';
import { actingSeat } from '../src/index.ts';

/** 프롬프트 종류를 골고루 만나도록 일부 토글을 켠 규칙 */
export function rulesFor(preset: PresetId, variant: number): RuleOptions {
  const base = PRESETS[preset];
  switch (variant % 4) {
    case 1:
      return { ...base, gukjin: 'ask' };
    case 2:
      return { ...base, twoCardBomb: 'double', chongtongContinue: true };
    case 3:
      return { ...base, bonusCards: 2, gukjin: 'ask' };
    default:
      return base;
  }
}

/** 시드로 판을 시작해 무작위 합법 수를 steps번 둔 상태 (판이 끝나면 직전 상태). 선 고르기 판도 섞는다 */
export function randomState(rules: RuleOptions, seed: number, steps: number): GameState {
  let state = newRound(rules, seed, seed % 5 === 0 ? {} : { dealer: seed % 2 === 0 ? 0 : 1 }).state;
  let rng = createRng(seed ^ 0x5bd1e995);
  for (let i = 0; i < steps && state.phase !== 'end'; i++) {
    const seat = actingSeat(state);
    if (seat === null) {
      break;
    }
    const legal = legalActions(state, seat);
    const [k, next] = nextInt(rng, legal.length);
    rng = next;
    const action = legal[k];
    if (action === undefined) {
      break;
    }
    const result = reduce(state, action);
    if (!result.ok || result.state.phase === 'end') {
      break;
    }
    state = result.state;
  }
  return state;
}

/**
 * 숨은 정보만 바꾼 상태: 보는 좌석(viewer)이 모르는 카드(상대 손패 ∪ 더미)를 다시 섞어 나눈다.
 * 공개 정보(장수 포함)는 그대로다.
 */
export function resampleHidden(state: GameState, viewer: 0 | 1, seed: number): GameState {
  const opp = viewer === 0 ? 1 : 0;
  const hidden = [...state.seats[opp].hand, ...state.deck];
  const { items } = shuffleWith(createRng(seed), hidden);
  const oppHand = items.slice(0, state.seats[opp].hand.length);
  const deck = items.slice(oppHand.length);
  const seats: [GameState['seats'][0], GameState['seats'][1]] = [state.seats[0], state.seats[1]];
  seats[opp] = { ...state.seats[opp], hand: oppHand };
  return { ...state, seats, deck };
}
