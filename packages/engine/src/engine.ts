// 엔진 공개 API 골격 (AGENTS.md 4장, plan.md 1.4). 모두 순수 함수.
// TODO(M1, spec 4.3): 상태 기계 구현. 규칙 벡터(test/vectors/*.json)를 먼저 쓰고 구현한다.
import type { RuleOptions } from './rules.ts';
import type { Action, EngineEvent, GameState, Seat, Settlement } from './state.ts';

const notImplemented = (name: string): never => {
  throw new Error(`${name}: M1에서 구현 예정 (spec 4.3)`);
};

export function reduce(
  _state: GameState,
  _action: Action,
): { state: GameState; events: EngineEvent[] } {
  return notImplemented('reduce');
}

export function legalActions(_state: GameState, _seat: Seat): Action[] {
  return notImplemented('legalActions');
}

/** 상대 손패와 더미 순서를 가린 뷰 (spec 4.5). TODO(M1): 뷰 타입 확정. */
export function playerView(_state: GameState, _seat: Seat): unknown {
  return notImplemented('playerView');
}

export function settle(_state: GameState, _rules: RuleOptions): Settlement {
  return notImplemented('settle');
}
