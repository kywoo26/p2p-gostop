// 상용급 (spec AI-03·AI-05·AI-06, plan.md 1.5): 불완전 정보 몬테카를로 탐색.
// 반복마다 공개 정보와 일관된 결정화 하나를 뽑는다(모르는 카드 = 엔진 unseenCards를 상대 손패·더미에 균등 분배).
// 루트 탐색 두 가지:
//  - halving(기본): 공통 난수 + 순차 반감. 라운드마다 결정화 하나·롤아웃 난수 하나를 남은 후보 전부에 똑같이 쓰고
//    (짝 비교로 분산 감소) 평균 하위 절반을 버린다. 셀프플레이에서 UCT보다 강했다(docs/ai-tuning.md).
//  - uct: 자기 결정만 트리(SO-ISMCTS, 가용 횟수 UCB), 상대 수·뒤집기는 결정화 세계에서 휴리스틱으로 진행. 최종 = 방문 최다.
// 트리 밖은 휴리스틱 롤아웃으로 판 끝까지 두고 settle로 보상을 구한다.
// 고/스톱은 표본 롤아웃의 기대값 비교(AI-06)로 따로 판단한다.
import {
  legalActions,
  type Action,
  type GameState,
  type PlayerView,
  type Seat,
} from '@p2p-gostop/engine';
import { terminalPoints } from '../evaluator.ts';
import { actingSeat, determinize } from '../knowledge.ts';
import { heuristicAction, rollout, ruleGoStop, step } from '../rollout.ts';
import { Rng } from '../rng.ts';
import type { DecisionContext, Policy } from '../types.ts';
import { DEFAULT_WEIGHTS, type SearchWeights, type Weights } from '../weights.ts';
import { actionKey, clockOf, firstOf, onlyAction } from './common.ts';

export interface IsmctsOptions {
  /** 결정 1회당 반복 상한 (결정적 모드의 기준). 기본 DEFAULT_ISMCTS_ITERATIONS */
  readonly maxIterations?: number;
  /** ctx.timeBudgetMs가 없을 때 쓸 시간 제한(ms). null이면 시간 제한 없음(완전 결정적) */
  readonly defaultTimeBudgetMs?: number | null;
  readonly weights?: Weights;
  /** 고/스톱 판단: ev = 표본 롤아웃 기대값 비교(AI-06, 기본) / rule = 규칙 기반 / search = 일반 트리 탐색 */
  readonly goStopMode?: 'ev' | 'rule' | 'search';
  /** 루트 탐색: halving = 공통 난수 + 순차 반감(기본) / uct = 자기 결정 트리 UCT */
  readonly searchMode?: 'uct' | 'halving';
}

/** 기본 반복 상한: Node 기준 p95 ≤ 0.7s를 맞추는 값 (docs/ai-tuning.md) */
export const DEFAULT_ISMCTS_ITERATIONS = 2000;
/** 기본 시간 제한 (plan.md 1.5: 1.0s). 느린 기기에서의 안전장치 */
export const DEFAULT_TIME_BUDGET_MS = 1000;
/** 시계 확인 주기(반복 수) */
const CLOCK_EVERY = 16;
/** 고/스톱 분석은 롤아웃 한 번이 탐색 반복 한 번과 비슷한 비용이다 */
const GO_STOP_MIN_SAMPLES = 64;

interface Edge {
  readonly action: Action;
  visits: number;
  total: number;
  /** 이 수가 합법이었던 반복 수 (ISMCTS 가용 횟수) */
  avail: number;
  child: TreeNode | null;
}

interface TreeNode {
  readonly edges: Map<string, Edge>;
}

const newNode = (): TreeNode => ({ edges: new Map() });

/** 점수 → [−1, 1] 보상 (승패 부호와 점수 크기의 혼합) */
export function utility(points: number, s: SearchWeights): number {
  return s.winWeight * Math.sign(points) + (1 - s.winWeight) * Math.tanh(points / s.pointScale);
}

export interface GoStopAnalysis {
  /** 지금 스톱하면 받는 점수 */
  readonly stopPoints: number;
  /** 고를 불렀을 때의 표본 평균 점수(나가리 0 포함) */
  readonly goEv: number;
  readonly pWin: number;
  readonly pLose: number;
  readonly pNagari: number;
  /** 이겼을 때 평균 획득, 졌을 때 평균 손실(양수, 고박 포함) */
  readonly meanGain: number;
  readonly meanLoss: number;
  readonly samples: number;
  readonly decision: 'go' | 'stop';
}

/**
 * AI-06 고/스톱 기대값 비교: 스톱 획득 vs P(승)·증가액 − P(패)·손실(고박 포함).
 * 결정화 표본마다 고를 적용하고 판 끝까지 롤아웃한다. 스톱 값은 공개 정보로 정확히 계산된다.
 */
export function analyzeGoStop(
  view: PlayerView,
  rng: Rng,
  samples: number,
  w: Weights,
  deadline: { readonly now: () => number; readonly until: number } | null = null,
): GoStopAnalysis {
  const me = view.viewer;
  const sunk = view.instantPayouts.reduce(
    (sum, p) => sum + (p.to === me ? p.points : -p.points),
    0,
  );
  const base = determinize(view, rng);
  // 스톱 값은 공개 정보로 정확히 정해진다: 엔진의 stopPreview(FR-14)
  const stopPoints =
    view.stopPreview?.points ?? terminalPoints(step(base, { type: 'stop', seat: me }), me) - sunk;
  let wins = 0;
  let losses = 0;
  let nagari = 0;
  let gain = 0;
  let loss = 0;
  let n = 0;
  for (; n < samples; n++) {
    if (deadline !== null && n >= 8 && n % CLOCK_EVERY === 0 && deadline.now() >= deadline.until) {
      break;
    }
    const det = n === 0 ? base : determinize(view, rng);
    const end = rollout(step(det, { type: 'go', seat: me }), rng, w);
    const points = terminalPoints(end, me) - sunk;
    const winner = end.result?.winner ?? null;
    if (winner === me) {
      wins++;
      gain += points;
    } else if (winner === null) {
      nagari++;
    } else {
      losses++;
      loss -= points;
    }
  }
  const goEv = (gain - loss) / n;
  const decision = goEv > stopPoints * (1 + w.goStop.evMargin) ? 'go' : 'stop';
  return {
    stopPoints,
    goEv,
    pWin: wins / n,
    pLose: losses / n,
    pNagari: nagari / n,
    meanGain: wins > 0 ? gain / wins : 0,
    meanLoss: losses > 0 ? loss / losses : 0,
    samples: n,
    decision,
  };
}

export interface SearchStats {
  readonly iterations: number;
  readonly edges: readonly {
    readonly action: Action;
    readonly visits: number;
    readonly mean: number;
  }[];
}

export class IsmctsPolicy implements Policy {
  readonly name = 'ismcts';
  private readonly maxIterations: number;
  private readonly defaultTimeBudgetMs: number | null;
  private readonly weights: Weights;
  private readonly goStopMode: 'ev' | 'rule' | 'search';
  private readonly searchMode: 'uct' | 'halving';
  /** 마지막 탐색 통계 (디버그·테스트용) */
  lastStats: SearchStats | null = null;
  lastGoStop: GoStopAnalysis | null = null;

  constructor(options: IsmctsOptions = {}) {
    this.maxIterations = options.maxIterations ?? DEFAULT_ISMCTS_ITERATIONS;
    this.defaultTimeBudgetMs =
      options.defaultTimeBudgetMs === undefined
        ? DEFAULT_TIME_BUDGET_MS
        : options.defaultTimeBudgetMs;
    this.weights = options.weights ?? DEFAULT_WEIGHTS;
    this.goStopMode = options.goStopMode ?? 'ev';
    this.searchMode = options.searchMode ?? 'halving';
  }

  decide(view: PlayerView, legal: readonly Action[], ctx: DecisionContext): Action {
    this.lastStats = null;
    this.lastGoStop = null;
    const only = onlyAction(legal);
    if (only !== null) {
      return only;
    }
    const first = firstOf(legal);
    if (first.type === 'pickFirst') {
      return ctx.rng.pick(legal);
    }
    const now = clockOf(ctx);
    const budget = ctx.timeBudgetMs ?? this.defaultTimeBudgetMs;
    const deadline = budget === null ? null : { now, until: now() + budget };
    if ((first.type === 'go' || first.type === 'stop') && this.goStopMode === 'rule') {
      const choice = ruleGoStop(determinize(view, ctx.rng), view.viewer, this.weights);
      return legal.find((a) => a.type === choice) ?? first;
    }
    if ((first.type === 'go' || first.type === 'stop') && this.goStopMode === 'ev') {
      const samples = Math.max(GO_STOP_MIN_SAMPLES, this.maxIterations);
      const analysis = analyzeGoStop(view, ctx.rng, samples, this.weights, deadline);
      this.lastGoStop = analysis;
      return legal.find((a) => a.type === analysis.decision) ?? first;
    }
    return this.searchMode === 'halving'
      ? this.searchHalving(view, legal, ctx.rng, deadline)
      : this.search(view, legal, ctx.rng, deadline);
  }

  private search(
    view: PlayerView,
    legal: readonly Action[],
    rng: Rng,
    deadline: { readonly now: () => number; readonly until: number } | null,
  ): Action {
    const me = view.viewer;
    const root = newNode();
    let iterations = 0;
    for (; iterations < this.maxIterations; iterations++) {
      if (
        deadline !== null &&
        iterations >= legal.length &&
        iterations % CLOCK_EVERY === 0 &&
        deadline.now() >= deadline.until
      ) {
        break;
      }
      this.iterate(root, determinize(view, rng), legal, me, rng);
    }
    let best: Edge | null = null;
    for (const action of legal) {
      const edge = root.edges.get(actionKey(action));
      if (edge === undefined) {
        continue;
      }
      const better =
        best === null ||
        edge.visits > best.visits ||
        (edge.visits === best.visits &&
          edge.total / Math.max(1, edge.visits) > best.total / Math.max(1, best.visits));
      if (better) {
        best = edge;
      }
    }
    this.lastStats = {
      iterations,
      edges: [...root.edges.values()].map((e) => ({
        action: e.action,
        visits: e.visits,
        mean: e.visits > 0 ? e.total / e.visits : 0,
      })),
    };
    return best?.action ?? firstOf(legal);
  }

  /**
   * 루트 순차 반감(sequential halving) + 공통 난수: 라운드마다 새 결정화 표본을 뽑아 남은 후보 전부를
   * 같은 결정화·같은 롤아웃 난수로 평가하고(짝 비교라 분산이 작다) 평균 하위 절반을 버린다.
   */
  private searchHalving(
    view: PlayerView,
    legal: readonly Action[],
    rng: Rng,
    deadline: { readonly now: () => number; readonly until: number } | null,
  ): Action {
    const me = view.viewer;
    const w = this.weights;
    let alive = legal.map((action) => ({ action, total: 0, n: 0 }));
    const rounds = Math.max(1, Math.ceil(Math.log2(legal.length)));
    let used = 0;
    let stopped = false;
    for (let r = 0; r < rounds && alive.length > 1 && !stopped; r++) {
      const perCandidate = Math.max(
        1,
        Math.floor((this.maxIterations - used) / ((rounds - r) * alive.length)),
      );
      for (let i = 0; i < perCandidate; i++) {
        if (deadline !== null && used > 0 && i % 4 === 0 && deadline.now() >= deadline.until) {
          stopped = true;
          break;
        }
        const det = determinize(view, rng);
        const seed = rng.nextU32();
        for (const c of alive) {
          const end = rollout(step(det, c.action), new Rng(seed), w);
          c.total += utility(terminalPoints(end, me), w.search);
          c.n++;
          used++;
        }
      }
      if (!stopped) {
        alive = alive
          .toSorted((a, b) => b.total / b.n - a.total / a.n)
          .slice(0, Math.max(1, Math.ceil(alive.length / 2)));
      }
    }
    const ranked = alive.toSorted(
      (a, b) => b.total / Math.max(1, b.n) - a.total / Math.max(1, a.n),
    );
    this.lastStats = {
      iterations: used,
      edges: ranked.map((c) => ({
        action: c.action,
        visits: c.n,
        mean: c.total / Math.max(1, c.n),
      })),
    };
    return ranked[0]?.action ?? firstOf(legal);
  }

  /** 반복 1회: 선택 → 확장 → (상대·뒤집기 진행) → 롤아웃 → 역전파 */
  private iterate(
    root: TreeNode,
    det: GameState,
    rootLegal: readonly Action[],
    me: Seat,
    rng: Rng,
  ): void {
    const w = this.weights;
    const c = w.search.ucbC;
    const path: Edge[] = [];
    let node = root;
    let state = det;
    let legal: readonly Action[] = rootLegal;
    for (;;) {
      const untried: Edge[] = [];
      const available: Edge[] = [];
      for (const action of legal) {
        const key = actionKey(action);
        let edge = node.edges.get(key);
        if (edge === undefined) {
          edge = { action, visits: 0, total: 0, avail: 0, child: null };
          node.edges.set(key, edge);
        }
        edge.avail++;
        available.push(edge);
        if (edge.visits === 0) {
          untried.push(edge);
        }
      }
      let chosen: Edge;
      const expanding = untried.length > 0;
      if (expanding) {
        chosen = untried.length === 1 ? firstOf(untried) : rng.pick(untried);
      } else {
        chosen = firstOf(available);
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const edge of available) {
          const score =
            edge.total / edge.visits + c * Math.sqrt(Math.log(edge.avail) / edge.visits);
          if (score > bestScore) {
            bestScore = score;
            chosen = edge;
          }
        }
      }
      path.push(chosen);
      state = advanceToMe(step(state, chosen.action), me, rng, w);
      if (state.phase === 'end' || expanding) {
        break;
      }
      chosen.child ??= newNode();
      node = chosen.child;
      legal = legalActions(state, me);
    }
    const end = state.phase === 'end' ? state : rollout(state, rng, w);
    const reward = utility(terminalPoints(end, me), w.search);
    for (const edge of path) {
      edge.visits++;
      edge.total += reward;
    }
  }
}

/** 상대 수와 한 장짜리 자기 수를 휴리스틱으로 진행해 내가 여러 수 중 골라야 하는 지점(또는 판 끝)까지 간다. */
function advanceToMe(state: GameState, me: Seat, rng: Rng, w: Weights): GameState {
  let s = state;
  for (let i = 0; i < 400 && s.phase !== 'end'; i++) {
    const seat = actingSeat(s);
    if (seat === null) {
      throw new Error('입력할 좌석이 없습니다');
    }
    const legal = legalActions(s, seat);
    if (seat === me && legal.length > 1) {
      return s;
    }
    s = step(s, heuristicAction(s, seat, legal, rng, w));
  }
  return s;
}
