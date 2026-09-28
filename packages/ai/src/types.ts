// 정책 인터페이스 (spec AI-01·AI-02·AI-08).
// 정보 은닉은 구조로 강제한다: 정책은 엔진의 playerView 결과(PlayerView)와 합법 수만 받는다.
// PlayerView에는 더미와 상대 손패가 없으므로(상대 hand = null) 정책이 볼 방법이 없다.
import type { Action, PlayerView } from '@p2p-gostop/engine';
import type { Rng } from './rng.ts';

/** 실력 단계 (spec AI-03): 쉬움 / 보통 / 상용급 */
export type Difficulty = 'easy' | 'normal' | 'commercial';

export const DIFFICULTIES: readonly Difficulty[] = Object.freeze(['easy', 'normal', 'commercial']);

export interface DecisionContext {
  /** 시드 난수. 같은 시드·같은 뷰면 같은 수 (AI-08) */
  readonly rng: Rng;
  /**
   * 시간 제한(ms). 넘으면 그때까지의 최선 수 (AI-05). 없으면 반복 횟수 상한만 쓴다(결정적).
   * 시간 제한 모드는 기기 속도에 따라 결과가 달라질 수 있다.
   */
  readonly timeBudgetMs?: number;
  /** 시계(ms). 기본은 globalThis.performance.now. 테스트에서 주입한다 */
  readonly now?: () => number;
}

export interface Policy {
  /** 로그·시뮬레이션 표시용 이름 */
  readonly name: string;
  /**
   * 합법 수 중 하나를 고른다. legal은 view.legal과 같은 목록이다(엔진 legalActions).
   * 반환값은 항상 legal의 원소다.
   */
  decide(view: PlayerView, legal: readonly Action[], ctx: DecisionContext): Action;
}
