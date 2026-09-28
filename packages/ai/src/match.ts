// 두 정책으로 한 판을 끝까지 둔다 (시뮬레이션·테스트 공용 진행기).
// 정책에는 playerView 결과와 합법 수만 넘긴다(정보 은닉, AI-01). 정책이 합법 수가 아닌 것을 내면 예외.
import {
  applyUnchecked,
  legalActions,
  newRound,
  playerView,
  reduce,
  sameAction,
  type Action,
  type ApplyResult,
  type EngineEvent,
  type GameState,
  type RoundOptions,
  type RuleOptions,
  type Seat,
  type Seed,
} from '@p2p-gostop/engine';
import { actingSeat } from './knowledge.ts';
import { Rng, mixSeed } from './rng.ts';
import type { DecisionContext, Policy } from './types.ts';

export interface DecisionRecord {
  readonly seat: Seat;
  readonly kind: string;
  readonly choices: number;
  readonly ms: number;
}

export interface PlayedRound {
  readonly state: GameState;
  readonly actions: readonly Action[];
  readonly events: readonly EngineEvent[];
  readonly decisions: readonly DecisionRecord[];
}

export interface PlayRoundOptions {
  readonly rules: RuleOptions;
  /** 셔플 시드 */
  readonly seed: Seed;
  readonly round?: RoundOptions;
  /** 좌석별 정책 난수 시드. 결정 n번째의 난수는 mixSeed(policySeed, n)로 파생해 결정마다 독립·재현 가능 */
  readonly policySeeds: readonly [number, number];
  readonly timeBudgetMs?: number;
  readonly now?: () => number;
  /** 결정 시간 측정용 시계(결정에는 영향 없음) */
  readonly clock?: () => number;
  /** 비교·디버그: 합법 수 적용도 reduce로 재검증한다. 기본은 applyUnchecked. */
  readonly debugReduce?: boolean;
  /** 판 시작 시 좌석별 잔액(점 단위). 밀기 결정 전에 즉시 정산을 반영한다. */
  readonly balancePoints?: readonly [number, number];
}

const MAX_STEPS = 500;

function applyKnown(state: GameState, action: Action, debugReduce: boolean): ApplyResult {
  if (!debugReduce) return applyUnchecked(state, action);
  const checked = reduce(state, action);
  if (!checked.ok) throw new Error(`합법 수가 거부됨: ${checked.message}`);
  return checked;
}

function afterInstantPayouts(state: GameState, start: readonly [number, number]): [number, number] {
  const balances: [number, number] = [...start];
  for (const payout of state.instantPayouts) {
    const amount = Math.min(
      payout.points,
      balances[payout.from],
      state.rules.limitedLiability ? balances[payout.to] : Infinity,
    );
    balances[payout.from] -= amount;
    balances[payout.to] += amount;
  }
  return balances;
}

export function playRound(
  policies: readonly [Policy, Policy],
  opts: PlayRoundOptions,
): PlayedRound {
  const started = newRound(opts.rules, opts.seed, opts.round ?? {});
  let state = started.state;
  const events: EngineEvent[] = [...started.events];
  const actions: Action[] = [];
  const decisions: DecisionRecord[] = [];
  const counters = [0, 0];
  for (let i = 0; state.phase !== 'end'; i++) {
    if (i > MAX_STEPS) {
      throw new Error('판이 끝나지 않습니다');
    }
    const seat = actingSeat(state);
    if (seat === null) {
      throw new Error('입력할 좌석이 없습니다');
    }
    const view = playerView(state, seat);
    const legal = view.legal;
    const n = counters[seat] ?? 0;
    counters[seat] = n + 1;
    const ctx: DecisionContext = {
      rng: new Rng(mixSeed(opts.policySeeds[seat], n)),
      ...(opts.timeBudgetMs === undefined ? {} : { timeBudgetMs: opts.timeBudgetMs }),
      ...(opts.now === undefined ? {} : { now: opts.now }),
      ...(opts.balancePoints === undefined ? {} : { balancePoints: opts.balancePoints }),
    };
    const t0 = opts.clock?.() ?? 0;
    const action = policies[seat].decide(view, legal, ctx);
    const ms = (opts.clock?.() ?? 0) - t0;
    if (legal.length > 1) {
      decisions.push({ seat, kind: legal[0]?.type ?? '', choices: legal.length, ms });
    }
    if (!legal.some((a) => sameAction(a, action))) {
      throw new Error(
        `정책 ${policies[seat].name}이 합법 수가 아닌 수를 냈습니다: ${JSON.stringify(action)}`,
      );
    }
    const result = applyKnown(state, action, opts.debugReduce === true);
    state = result.state;
    actions.push(action);
    events.push(...result.events);
  }
  const winner = state.result?.winner;
  if (winner !== null && winner !== undefined) {
    const push = legalActions(state, winner).find((action) => action.type === 'push');
    if (push !== undefined) {
      const n = counters[winner] ?? 0;
      const ctx: DecisionContext = {
        rng: new Rng(mixSeed(opts.policySeeds[winner], n)),
        ...(opts.timeBudgetMs === undefined ? {} : { timeBudgetMs: opts.timeBudgetMs }),
        ...(opts.now === undefined ? {} : { now: opts.now }),
        ...(opts.balancePoints === undefined
          ? {}
          : { balancePoints: afterInstantPayouts(state, opts.balancePoints) }),
      };
      const t0 = opts.clock?.() ?? 0;
      const choosePush = policies[winner].decidePush?.(playerView(state, winner), ctx) ?? false;
      decisions.push({ seat: winner, kind: 'push', choices: 2, ms: (opts.clock?.() ?? 0) - t0 });
      if (choosePush) {
        const result = applyKnown(state, push, opts.debugReduce === true);
        state = result.state;
        actions.push(push);
        events.push(...result.events);
      }
    }
  }
  return { state, actions, events, decisions };
}
