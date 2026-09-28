// CPU 상대 (plan.md 1.5). TODO(M2): Evaluator, GreedyPolicy, IsmctsPolicy.
// AI는 legalActions와 playerView만 보고 결정한다(정보 은닉, spec AI 요구사항). 난수는 엔진의 시드 PRNG만 쓴다.
import { createRng, nextInt, type Action, type RngState, type Seed } from '@p2p-gostop/engine';

export type Difficulty = 'easy' | 'normal' | 'commercial';

export interface Policy {
  readonly difficulty: Difficulty;
  /** 합법 수 중 하나를 고른다. 순수 함수: 같은 입력·같은 rng면 같은 결과. */
  choose(legal: readonly Action[], rng: RngState): { action: Action; rng: RngState };
}

/** 합법 수 중 무작위로 고르는 기준선 정책. 속성 테스트·시뮬레이션의 상대로 쓴다. */
export const randomPolicy: Policy = {
  difficulty: 'easy',
  choose(legal, rng) {
    if (legal.length === 0) {
      throw new Error('합법 수가 없습니다');
    }
    const [index, next] = nextInt(rng, legal.length);
    const action = legal[index];
    if (action === undefined) {
      throw new RangeError(`잘못된 인덱스: ${index}`);
    }
    return { action, rng: next };
  },
};

export function createPolicyRng(seed: Seed): RngState {
  return createRng(seed);
}
