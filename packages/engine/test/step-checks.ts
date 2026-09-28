// 속성 테스트의 매 수 검사 (M1 리뷰 F-1·F-3·F-9·F-11, spec NP-07).
// - 거부: 무작위·형태 오류 액션을 reduce가 받아들이는 것은 legalActions에 있을 때뿐이고, 예외를 던지지 않는다.
// - 뷰 누출: 보는 좌석이 모르는 정보(상대 손패·더미 순서·PRNG·선 고르기 후보)를 바꿔도 뷰가 같다.
// - 이벤트 누출: 상대에게 가는(가린) 이벤트에 아직 숨은 카드 ID가 없고, 흔들기 거절·총통 계속 이벤트가 없다.
// - 결정화: 실제 숨은 정보로 determinize하면 원래 상태, 무작위 표본이면 같은 합법 수.
// - 크기: 뷰와 reduce 한 번의 이벤트가 16KB(UTF-8) 이하.
import { expect } from 'vitest';
import {
  createRng,
  deckCardIds,
  determinize,
  legalActions,
  nextInt,
  nextUint32,
  playerView,
  reduce,
  redactEvent,
  shuffleWith,
  unseenCards,
  type Action,
  type CardId,
  type DeterminizeSample,
  type EngineEvent,
  type GameState,
  type PlayerView,
  type RngState,
  type Seat,
} from '../src/index.ts';

/** NP-07 메시지 상한 */
const MAX_MESSAGE_BYTES = 16 * 1024;
/** 매 수마다 시험하는 무작위 액션 수 */
const PROBES = 4;

export interface StepChecker {
  readonly policySeed: number;
  /** 흔들기·총통 끝내기로 공개된 손패 카드(좌석별): 이후 이벤트에 나와도 누출이 아니다 */
  readonly revealed: [Set<CardId>, Set<CardId>];
  rng?: RngState;
}

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

/** 빠른 구조 비교(키 순서 무관, JSON 값 전용). 매 수 수십만 번 부르므로 expect는 틀렸을 때만 쓴다. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item: unknown, i) => deepEqual(item, b[i]))
    );
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => deepEqual(Reflect.get(a, key), Reflect.get(b, key)))
  );
}

function expectEqual(actual: unknown, expected: unknown): void {
  if (!deepEqual(actual, expected)) {
    expect(actual).toEqual(expected);
  }
}

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function draw(checker: StepChecker, bound: number): number {
  const [value, next] = nextInt(checker.rng ?? createRng(checker.policySeed ^ 0x5bd1e995), bound);
  checker.rng = next;
  return value;
}

function pick<T>(checker: StepChecker, items: readonly T[]): T {
  const item = items[draw(checker, items.length)];
  if (item === undefined) {
    throw new Error('빈 목록');
  }
  return item;
}

function shuffled<T>(checker: StepChecker, items: readonly T[]): T[] {
  const result = shuffleWith(checker.rng ?? createRng(checker.policySeed), items);
  checker.rng = result.rng;
  return result.items;
}

function randomRng(checker: StepChecker): RngState {
  const words: number[] = [];
  let rng = checker.rng ?? createRng(checker.policySeed);
  for (let i = 0; i < 4; i++) {
    const [value, next] = nextUint32(rng);
    words.push(value | 1);
    rng = next;
  }
  checker.rng = rng;
  return [words[0] ?? 1, words[1] ?? 1, words[2] ?? 1, words[3] ?? 1];
}

/** 보는 좌석이 모르는 정보만 무작위로 바꾼 상태 (상대 손패 ↔ 더미 재배치, 선 고르기 후보, PRNG) */
function resampleHidden(checker: StepChecker, state: GameState, viewer: Seat): GameState {
  const opp = other(viewer);
  const oppHand = state.seats[opp].hand;
  const pool = shuffled(checker, [...oppHand, ...state.deck]);
  const seats: [GameState['seats'][0], GameState['seats'][1]] = [state.seats[0], state.seats[1]];
  seats[opp] = { ...state.seats[opp], hand: pool.slice(0, oppHand.length) };
  const fp = state.firstPick;
  return {
    ...state,
    rng: randomRng(checker),
    seats,
    deck: pool.slice(oppHand.length),
    firstPick:
      fp === null
        ? null
        : {
            ...fp,
            pool: shuffled(checker, deckCardIds(state.rules.bonusCards)).slice(0, fp.pool.length),
          },
  };
}

/** 실제 상태의 숨은 정보 (결정화 왕복 검사용) */
function trueSample(state: GameState, view: PlayerView): DeterminizeSample {
  const opp = other(view.viewer);
  const hiddenPending = JSON.stringify(view.pending) !== JSON.stringify(state.pending);
  return {
    opponentHand: state.seats[opp].hand,
    deck: state.deck,
    ...(state.firstPick === null ? {} : { firstPickPool: state.firstPick.pool }),
    ...(hiddenPending && state.pending !== null ? { pending: state.pending } : {}),
  };
}

/** 뷰와 일관된 무작위 표본 */
function randomSample(checker: StepChecker, view: PlayerView): DeterminizeSample {
  if (view.phase === 'chooseFirst') {
    return { opponentHand: [], deck: [] };
  }
  const unseen = shuffled(checker, unseenCards(view));
  const count = view.seats[other(view.viewer)].handCount;
  return { opponentHand: unseen.slice(0, count), deck: unseen.slice(count) };
}

function trackRevealed(checker: StepChecker, events: readonly EngineEvent[]): void {
  for (const event of events) {
    const revealing =
      (event.type === 'Shake' && event.accepted) ||
      (event.type === 'Chongtong' && event.choice !== 'continue');
    if (revealing && event.seat !== null) {
      for (const id of event.cards) {
        checker.revealed[event.seat].add(id);
      }
    }
  }
}

/** 분배 전(선 고르기)·재분배 전 이벤트는 다시 섞인 카드 ID를 가리키므로 마지막 Redealt 이후만 본다. */
function eventsAfterDeal(events: readonly EngineEvent[]): readonly EngineEvent[] {
  const lastRedeal = events.findLastIndex((e) => e.type === 'Redealt');
  return events
    .slice(lastRedeal + 1)
    .filter((e) => e.type !== 'FirstPicked' && e.type !== 'FirstPickTie');
}

function checkEventLeaks(
  checker: StepChecker,
  state: GameState,
  events: readonly EngineEvent[],
  viewer: Seat,
): void {
  const opp = other(viewer);
  const hidden = new Set<CardId>([
    ...state.seats[opp].hand.filter((id) => !checker.revealed[opp].has(id)),
    ...state.deck,
  ]);
  for (const event of eventsAfterDeal(events)) {
    if (event.seat === viewer) {
      continue;
    }
    const sent = redactEvent(event, viewer);
    const leaked = sent.cards.filter((id) => hidden.has(id));
    const hiddenChoice =
      (sent.type === 'Shake' && !sent.accepted) ||
      (sent.type === 'Chongtong' && sent.choice === 'continue');
    if (leaked.length > 0 || hiddenChoice) {
      expect({ event: sent, leaked, hiddenChoice }).toEqual({
        event: sent,
        leaked: [],
        hiddenChoice: false,
      });
    }
  }
}

function checkDeterminize(checker: StepChecker, state: GameState, view: PlayerView): void {
  expectEqual(determinize(view, trueSample(state, view), state.rng), state);
  const legal = legalActions(state, view.viewer);
  if (legal.length === 0) {
    return;
  }
  const det = determinize(view, randomSample(checker, view), draw(checker, 0x7fffffff));
  expectEqual(legalActions(det, view.viewer), legal);
  const result = reduce(det, pick(checker, legal));
  if (!result.ok) {
    expect(result).toMatchObject({ ok: true });
  }
}

const TYPES = [
  'pickFirst',
  'chongtong',
  'play',
  'bomb',
  'flipOnly',
  'shake',
  'chooseTarget',
  'gukjin',
  'go',
  'stop',
  'fly',
] as const;

const MALFORMED: readonly unknown[] = [null, undefined, 42, 'play', [], {}];

/** 형태가 맞거나 틀린 무작위 입력 (네트워크에서 올 수 있는 모든 것) */
function randomInput(checker: StepChecker): unknown {
  const roll = draw(checker, 20);
  if (roll === 0) {
    return MALFORMED[draw(checker, MALFORMED.length)];
  }
  return {
    type: pick(checker, TYPES),
    seat: pick<unknown>(checker, [0, 1, 0, 1, 2, '0']),
    card: draw(checker, 53) - 1,
    month: draw(checker, 14),
    index: draw(checker, 10),
    choice: pick(checker, ['end', 'continue', 'x']),
    accept: pick<unknown>(checker, [true, false, 'yes']),
    asPi: pick<unknown>(checker, [true, false, 1]),
  };
}

function isLegal(state: GameState, input: unknown): boolean {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  const seat: unknown = Reflect.get(input, 'seat');
  if (seat !== 0 && seat !== 1) {
    return false;
  }
  // 독립 오라클: 합법 수의 모든 필드가 입력과 같으면(여분 필드는 무시) 받아들여야 한다
  return legalActions(state, seat).some((action) =>
    Object.entries(action).every(([key, value]) => Reflect.get(input, key) === value),
  );
}

function checkRejections(checker: StepChecker, state: GameState): void {
  for (let i = 0; i < PROBES; i++) {
    const input = randomInput(checker);
    const result = reduce(state, input);
    const legal = isLegal(state, input);
    if (result.ok !== legal) {
      expect({ input, ok: result.ok }).toEqual({ input, ok: legal });
    }
  }
}

/** 한 수를 둔 직후(또는 분배 직후) 상태와 그 수가 낸 이벤트를 검사한다. */
export function checkStep(
  checker: StepChecker,
  state: GameState,
  _action: Action | null,
  events: readonly EngineEvent[],
): void {
  trackRevealed(checker, events);
  const eventBytes = utf8Bytes(JSON.stringify(events));
  if (eventBytes > MAX_MESSAGE_BYTES) {
    expect(eventBytes).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  }
  for (const viewer of [0, 1] as const) {
    const view = playerView(state, viewer);
    const viewBytes = utf8Bytes(JSON.stringify(view));
    if (viewBytes > MAX_MESSAGE_BYTES) {
      expect(viewBytes).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    }
    expectEqual(playerView(resampleHidden(checker, state, viewer), viewer), view);
    checkEventLeaks(checker, state, events, viewer);
    checkDeterminize(checker, state, view);
  }
  checkRejections(checker, state);
}
