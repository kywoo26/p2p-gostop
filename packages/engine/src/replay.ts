// 리플레이 (plan.md 원칙 6, FR-33): 규칙 + 시드 + 액션 열 → 상태. 같은 입력이면 같은 이벤트 열.
import { newRound, type RoundOptions } from './deal.ts';
import type { Seed } from './rng.ts';
import type { RuleOptions } from './rules.ts';
import { reduce } from './reduce.ts';
import type { Action, EngineEvent, GameState, RejectReason } from './state.ts';

export type ReplayResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly EngineEvent[] }
  | {
      readonly ok: false;
      /** 거부된 액션의 위치 */
      readonly index: number;
      readonly reason: RejectReason;
      readonly message: string;
      /** 거부 직전 상태와 그때까지의 이벤트 */
      readonly state: GameState;
      readonly events: readonly EngineEvent[];
    };

export function replay(
  rules: RuleOptions,
  seed: Seed,
  actions: readonly Action[],
  opts: RoundOptions = {},
): ReplayResult {
  const start = newRound(rules, seed, opts);
  let state = start.state;
  const events: EngineEvent[] = [...start.events];
  for (const [index, action] of actions.entries()) {
    const result = reduce(state, action);
    if (!result.ok) {
      return { ok: false, index, reason: result.reason, message: result.message, state, events };
    }
    state = result.state;
    events.push(...result.events);
  }
  return { ok: true, state, events };
}
