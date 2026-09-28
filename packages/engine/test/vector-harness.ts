// 규칙 벡터 실행기. 벡터 JSON은 카드 이름(names.ts)이나 숫자 ID를 쓸 수 있다.
// 기대값은 rules-commercial.md 12장에서 도출한다(다른 구현의 출력 금지, AGENTS.md 1장).
import { expect } from 'vitest';
import {
  PRESETS,
  applyInstantPayout,
  applySettlement,
  cardId,
  createLedger,
  createScenario,
  deckCardIds,
  legalActions,
  newRound,
  previewStop,
  reduce,
  settle,
  type Action,
  type CardId,
  type EngineEvent,
  type GameState,
  type PresetId,
  type RoundOptions,
  type RuleOptions,
  type ScenarioSetup,
  type Seat,
} from '../src/index.ts';

/** 벡터에서 카드로 해석할 키 */
const CARD_KEYS = new Set([
  'card',
  'cards',
  'hands',
  'hand',
  'floor',
  'deck',
  'captured',
  'capturedIncludes',
  'capturedExcludes',
  'target',
  'options',
  'picks',
  'pickPools',
  'floorCards',
  'includes',
  'excludes',
]);

function resolveDeep(value: unknown, key: string | null): unknown {
  if (typeof value === 'string' && key !== null && CARD_KEYS.has(key)) {
    return cardId(value);
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => resolveDeep(item, key));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(v, k)]));
  }
  return value;
}

export type VectorCase = 'normal' | 'boundary' | 'counter';

interface SeatExpect {
  readonly hand?: readonly CardId[];
  readonly captured?: readonly CardId[];
  readonly capturedIncludes?: readonly CardId[];
  readonly capturedExcludes?: readonly CardId[];
  readonly piCount?: number;
  readonly score?: Record<string, unknown>;
  readonly goCount?: number;
  readonly lastGoScore?: number;
  readonly shakes?: number;
  readonly bombs?: number;
  readonly bombTokens?: number;
  readonly ppeokCount?: number;
  readonly gukjinAsPi?: boolean;
}

interface VectorExpect {
  readonly phase?: string;
  readonly pending?: Record<string, unknown> | null;
  readonly result?: Record<string, unknown> | null;
  readonly dealer?: Seat | null;
  readonly turn?: Seat;
  readonly seats?: readonly [SeatExpect | null, SeatExpect | null];
  readonly floor?: readonly {
    month: number;
    kind?: string;
    owner?: Seat | null;
    cards?: CardId[];
  }[];
  readonly floorCards?: readonly CardId[];
  readonly deckCount?: number;
  readonly events?: readonly Record<string, unknown>[];
  readonly eventCounts?: Record<string, number>;
  readonly noEvents?: readonly string[];
  readonly settlement?: Record<string, unknown> & {
    readonly steps?: readonly { kind: string; value: number }[];
  };
  readonly instantPayouts?: readonly Record<string, unknown>[];
  readonly ledger?: {
    readonly perPoint: number;
    readonly start: readonly [number, number];
    readonly balances: readonly [number, number];
    readonly amounts?: readonly number[];
  };
  readonly legal?: {
    readonly seat: Seat;
    readonly includes?: Action[];
    readonly excludes?: Action[];
  };
  readonly preview?: Record<string, unknown> & { readonly seat: Seat };
  readonly reject?: { readonly index: number; readonly reason: string };
}

export interface RuleVector {
  readonly id: string;
  readonly ruleId: string;
  readonly case: VectorCase;
  readonly toggle?: string;
  readonly description: string;
  readonly preset?: PresetId;
  readonly rulesPatch?: Partial<RuleOptions>;
  readonly setup?: ScenarioSetup;
  readonly deal?: RoundOptions & { readonly seed: number };
  readonly actions?: readonly Action[];
  readonly expect: VectorExpect;
}

const RULE_ID = /^(R|B|S|E|G|M)\d+$/;

/** 최소 형태 검사. 나머지 필드는 실행 중 기대값 비교로 검증된다. */
function isRuleVector(value: unknown): value is RuleVector {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const get = (key: string): unknown => Reflect.get(value, key);
  const ruleId = get('ruleId');
  return (
    typeof get('id') === 'string' &&
    typeof ruleId === 'string' &&
    RULE_ID.test(ruleId) &&
    typeof get('description') === 'string' &&
    typeof get('expect') === 'object'
  );
}

export function parseVectors(raw: unknown, file: string): RuleVector[] {
  if (!Array.isArray(raw)) {
    throw new TypeError(`${file}: 벡터 파일은 배열이어야 합니다`);
  }
  return raw.map((item: unknown) => {
    const v = resolveDeep(item, null);
    if (!isRuleVector(v)) {
      throw new TypeError(`${file}: 잘못된 벡터 ${JSON.stringify(item)}`);
    }
    if (!/[가-힣]/.test(v.description) || !['normal', 'boundary', 'counter'].includes(v.case)) {
      throw new TypeError(`${file}/${v.id}: 한국어 설명과 case가 필요합니다`);
    }
    if ((v.setup === undefined) === (v.deal === undefined)) {
      throw new TypeError(`${file}/${v.id}: setup과 deal 중 하나만 지정합니다`);
    }
    return v;
  });
}

function vectorRules(v: RuleVector): RuleOptions {
  return { ...PRESETS[v.preset ?? 'standard'], ...v.rulesPatch };
}

const sorted = (ids: readonly CardId[]): CardId[] => ids.toSorted((a, b) => a - b);

function allCaptured(state: GameState, seat: Seat): CardId[] {
  const c = state.seats[seat].captured;
  return sorted([...c.gwang, ...c.yeol, ...c.tti, ...c.pi]);
}

function normalizeEvent(event: object): Record<string, unknown> {
  const entries: [string, unknown][] = Object.entries(event);
  return Object.fromEntries(
    entries.map(([k, v]) => [
      k,
      k === 'cards' && Array.isArray(v) ? v.map(Number).toSorted((a, b) => a - b) : v,
    ]),
  );
}

/** 기대값에 적힌 키만 비교한다(객체는 재귀, 배열은 길이와 원소). */
function partialMatch(got: unknown, want: unknown): boolean {
  if (Array.isArray(want)) {
    return (
      Array.isArray(got) &&
      got.length === want.length &&
      want.every((item: unknown, i) => partialMatch(got[i], item))
    );
  }
  if (typeof want === 'object' && want !== null) {
    if (typeof got !== 'object' || got === null) {
      return false;
    }
    return Object.entries(want).every(([k, v]) => partialMatch(Reflect.get(got, k), v));
  }
  return got === want;
}

/** 기대 이벤트들이 실제 이벤트 열에 이 순서대로(사이에 다른 이벤트가 있어도) 나타나는지 */
function expectSubsequence(
  actual: readonly EngineEvent[],
  expected: readonly Record<string, unknown>[],
): void {
  let from = 0;
  for (const want of expected) {
    const norm = normalizeEvent(want);
    const index = actual.findIndex((event, i) => {
      if (i < from) {
        return false;
      }
      return partialMatch(normalizeEvent(event), norm);
    });
    expect({ want, found: index !== -1, actual: actual.map((e) => e.type) }).toMatchObject({
      want,
      found: true,
    });
    from = index + 1;
  }
}

function startState(
  v: RuleVector,
  rules: RuleOptions,
): { state: GameState; events: EngineEvent[] } {
  if (v.setup !== undefined) {
    return { state: createScenario({ ...v.setup, rules }), events: [] };
  }
  const deal = v.deal;
  if (deal === undefined) {
    throw new TypeError('setup 또는 deal이 필요합니다');
  }
  const { seed, ...opts } = deal;
  const top = opts.deck ?? [];
  const rest = deckCardIds(rules.bonusCards).filter((id) => !top.includes(id));
  return newRound(rules, seed, {
    ...opts,
    ...(opts.deck === undefined ? {} : { deck: [...top, ...rest] }),
  });
}

export function runVector(v: RuleVector): void {
  const rules = vectorRules(v);
  const started = startState(v, rules);
  let state = started.state;
  const events: EngineEvent[] = [...started.events];
  const e = v.expect;
  for (const [index, action] of (v.actions ?? []).entries()) {
    const result = reduce(state, action);
    if (e.reject !== undefined && e.reject.index === index) {
      expect(result.ok).toBe(false);
      expect(result.ok ? null : result.reason).toBe(e.reject.reason);
      break;
    }
    if (!result.ok) {
      throw new Error(`${v.id}: 액션 ${index} 거부됨: ${result.message}`);
    }
    state = result.state;
    events.push(...result.events);
  }
  if (e.phase !== undefined) expect(state.phase).toBe(e.phase);
  if (e.pending !== undefined) {
    if (e.pending === null) expect(state.pending).toBeNull();
    else expect(state.pending).toMatchObject(e.pending);
  }
  if (e.result !== undefined) {
    if (e.result === null) expect(state.result).toBeNull();
    else expect(state.result).toMatchObject(e.result);
  }
  if (e.dealer !== undefined) expect(state.dealer).toBe(e.dealer);
  if (e.turn !== undefined) expect(state.turn).toBe(e.turn);
  e.seats?.forEach((want, index) => {
    if (want === null) return;
    const seat = index === 0 ? 0 : 1;
    const got = state.seats[seat];
    const captured = allCaptured(state, seat);
    const actual = {
      seat,
      hand: sorted(got.hand),
      captured,
      piCount: got.score.piCount,
      score: got.score,
      goCount: got.goCount,
      lastGoScore: got.lastGoScore,
      shakes: got.shakes,
      bombs: got.bombs,
      bombTokens: got.bombTokens,
      ppeokCount: got.ppeokTurns.length,
      gukjinAsPi: got.gukjinAsPi,
    };
    const { capturedIncludes = [], capturedExcludes = [], ...rest } = want;
    const expected = Object.fromEntries(
      Object.entries({
        ...rest,
        hand: rest.hand === undefined ? undefined : sorted(rest.hand),
        captured: rest.captured === undefined ? undefined : sorted(rest.captured),
      }).filter(([, value]) => value !== undefined),
    );
    expect(actual).toMatchObject({ seat, ...expected });
    expect({ seat, captured }).toMatchObject({
      seat,
      captured: expect.arrayContaining([...capturedIncludes]),
    });
    expect({ seat, excluded: captured.filter((id) => capturedExcludes.includes(id)) }).toEqual({
      seat,
      excluded: [],
    });
  });
  if (e.floor !== undefined) {
    expect(state.floor.map((g) => ({ ...g, cards: sorted(g.cards) }))).toMatchObject(
      e.floor.map((g) => (g.cards === undefined ? g : { ...g, cards: sorted(g.cards) })),
    );
  }
  if (e.floorCards !== undefined) {
    expect(sorted(state.floor.flatMap((g) => g.cards))).toEqual(sorted(e.floorCards));
  }
  if (e.deckCount !== undefined) expect(state.deck.length).toBe(e.deckCount);
  if (e.events !== undefined) expectSubsequence(events, e.events);
  for (const [type, count] of Object.entries(e.eventCounts ?? {})) {
    expect({ type, count: events.filter((ev) => ev.type === type).length }).toEqual({
      type,
      count,
    });
  }
  for (const type of e.noEvents ?? []) {
    expect(events.map((ev) => ev.type)).not.toContain(type);
  }
  if (e.settlement !== undefined) {
    const { steps, ...rest } = e.settlement;
    const result = settle(state, rules);
    expect(result).toMatchObject(rest);
    if (steps !== undefined) {
      expect(result.steps.map((s) => ({ kind: s.kind, value: s.value }))).toEqual(steps);
    }
  }
  if (e.instantPayouts !== undefined) expect(state.instantPayouts).toEqual(e.instantPayouts);
  if (e.ledger !== undefined) {
    let ledger = createLedger(e.ledger.perPoint, 0);
    ledger = { ...ledger, balances: [e.ledger.start[0], e.ledger.start[1]] };
    for (const payout of state.instantPayouts) {
      ledger = applyInstantPayout(ledger, payout, rules);
    }
    if (state.phase === 'end') {
      ledger = applySettlement(ledger, settle(state, rules), rules);
    }
    expect(ledger.balances).toEqual(e.ledger.balances);
    if (e.ledger.amounts !== undefined) {
      expect(ledger.entries.map((entry) => entry.amount)).toEqual(e.ledger.amounts);
    }
  }
  if (e.legal !== undefined) {
    const legal = legalActions(state, e.legal.seat);
    for (const action of e.legal.includes ?? []) expect(legal).toContainEqual(action);
    for (const action of e.legal.excludes ?? []) expect(legal).not.toContainEqual(action);
  }
  if (e.preview !== undefined) {
    const { seat, ...rest } = e.preview;
    expect(previewStop(state, seat)).toMatchObject(rest);
  }
}
