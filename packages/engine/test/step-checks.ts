// 속성 테스트의 매 수 검사 (M1 리뷰 F-1·F-3·F-9·F-11, spec NP-07).
// - 거부: 무작위·형태 오류 액션을 reduce가 받아들이는 것은 legalActions에 있을 때뿐이고, 예외를 던지지 않는다.
// - 뷰 누출: 보는 좌석이 모르는 정보(상대 손패·더미 순서·PRNG·선 고르기 후보)를 바꿔도 뷰가 같다.
// - 이벤트 누출: 상대에게 가는(가린) 이벤트에 아직 숨은 카드 ID가 없고, 흔들기 거절·총통 계속 이벤트가 없다.
// - 결정화: 실제 숨은 정보로 determinize하면 원래 상태, 무작위 표본이면 같은 합법 수.
// - 크기: 뷰와 reduce 한 번의 이벤트가 16KB(UTF-8) 이하.
// - 공개 손패(E1 트랙): SeatState.revealed = 이벤트(흔들기·총통 끝내기)로 공개된 카드 ∩ 손패. 결정화 표본은 공개 카드를 고정한다.
// - 검증 생략 경로: 적용 전 상태에 applyUnchecked ≡ reduce(상태·이벤트 동일).
// - 미리보기: matchPreview가 실제 적용 결과(대상 선택 프롬프트·흔들기 질문·먹은 카드)와 맞는다.
// - 점수(S1~S5, G1·G2): 턴 경계의 점수 분해는 획득 패로 새로 계산한 값과 같고, total = 항목 합, 피 장수는 카드 가치 합
//   (쌍피·보너스 2피 = 2, 3피 = 3, 쌍피로 둔 국진 = 2, 12.3 S4)이며, 턴 시작 시 어느 좌석도 고/스톱 문턱 이상이 아니다
//   (문턱에 닿았는데 묻지 않은 턴이 없다).
import { expect } from 'vitest';
import {
  GUKJIN_ID,
  MAX_PUSHES,
  WINNING_SCORE,
  applyUnchecked,
  createRng,
  deckCardIds,
  determinize,
  getCard,
  legalActions,
  matchPreview,
  nextInt,
  nextUint32,
  playerView,
  reduce,
  redactEvent,
  scoreCaptured,
  seatScore,
  settle,
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
  type Settlement,
} from '../src/index.ts';

/** NP-07 메시지 상한 */
const MAX_MESSAGE_BYTES = 16 * 1024;
/** 매 수마다 시험하는 무작위 액션 수 */
const PROBES = 4;

/** 속성 테스트가 실제로 각 경로를 지나갔는지 세는 전역 카운터 (properties.test.ts가 마지막에 검사) */
export const coverage = {
  steps: 0,
  unchecked: 0,
  revealedSeen: 0,
  previewKinds: new Set<string>(),
  pushes: 0,
  scoreChecks: 0,
};

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

/**
 * 보는 좌석이 모르는 정보만 무작위로 바꾼 상태 (상대의 숨은 손패 ↔ 더미 재배치, 선 고르기 후보, PRNG).
 * 상대가 공개한 손패(revealed)는 공개 정보이므로 손패에 그대로 둔다.
 */
function resampleHidden(checker: StepChecker, state: GameState, viewer: Seat): GameState {
  const opp = other(viewer);
  const { hand, revealed } = state.seats[opp];
  const hiddenHand = hand.filter((id) => !revealed.includes(id));
  const pool = shuffled(checker, [...hiddenHand, ...state.deck]);
  const seats: [GameState['seats'][0], GameState['seats'][1]] = [state.seats[0], state.seats[1]];
  seats[opp] = { ...state.seats[opp], hand: [...revealed, ...pool.slice(0, hiddenHand.length)] };
  const fp = state.firstPick;
  return {
    ...state,
    rng: randomRng(checker),
    seats,
    deck: pool.slice(hiddenHand.length),
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

/** 뷰와 일관된 무작위 표본 (숨은 손패 형식: 공개된 카드는 결정화가 더한다) */
function randomSample(checker: StepChecker, view: PlayerView): DeterminizeSample {
  if (view.phase === 'chooseFirst') {
    return { opponentHand: [], deck: [] };
  }
  const unseen = shuffled(checker, unseenCards(view));
  const opp = view.seats[other(view.viewer)];
  const count = opp.handCount - opp.revealed.length;
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

/** 상태의 공개 손패(revealed) = 이벤트로 공개된 카드 중 아직 손에 있는 것 (독립 오라클: 이벤트 추적) */
function checkRevealed(checker: StepChecker, state: GameState): void {
  for (const seat of [0, 1] as const) {
    const { hand, revealed } = state.seats[seat];
    coverage.revealedSeen += revealed.length > 0 ? 1 : 0;
    const expected = hand.filter((id) => checker.revealed[seat].has(id)).toSorted((a, b) => a - b);
    const actual = revealed.toSorted((a, b) => a - b);
    if (!deepEqual(actual, expected)) {
      expect({ seat, revealed: actual }).toEqual({ seat, revealed: expected });
    }
  }
}

function checkEventLeaks(state: GameState, events: readonly EngineEvent[], viewer: Seat): void {
  const opp = other(viewer);
  const hidden = new Set<CardId>([
    ...state.seats[opp].hand.filter((id) => !state.seats[opp].revealed.includes(id)),
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
  // 공개된 상대 손패는 보이는 카드다: unseenCards에 없다
  const oppRevealed = view.seats[other(view.viewer)].revealed;
  if (oppRevealed.length > 0 && unseenCards(view).some((id) => oppRevealed.includes(id))) {
    expect({ unseen: unseenCards(view), oppRevealed }).toBeNull();
  }
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

/**
 * 점수 분해 검사 (사용자 의심 항목: 피 가치 계산·국진 위치·총점).
 * - 모든 상태: total = 광 + 열끗 + 고도리 + 띠 + 홍단 + 청단 + 초단 + 피, 피 점수 = max(0, 피 장수 − 9)
 *   (S4: 10장 1점, 이후 1장당 +1).
 * - 턴 경계(카드 내기 대기·고/스톱·판 종료. 턴 도중의 프롬프트에서는 점수가 spec 4.3 SCORE 단계 전 값이다):
 *   장수 필드가 획득 패와 맞고 피 장수 = 피 더미 카드 가치 합(+ 쌍피로 둔 국진 2, S4·S5)인 독립 계산과 같으며,
 *   저장된 점수 = 획득 패로 새로 계산한 점수(seatScore, S5 자동 최적 포함).
 * - 턴 시작(카드 내기 대기, 진행 중 턴 없음): 두 좌석 모두 고/스톱 문턱(7점 또는 마지막 고 + 1) 미만(G1·G2 누락 없음).
 */
function checkScores(state: GameState): void {
  const pending = state.pending;
  const boundary =
    state.phase === 'end' ||
    pending?.kind === 'goStop' ||
    (pending?.kind === 'play' && state.ctx === null);
  for (const seat of [0, 1] as const) {
    const s = state.seats[seat];
    const b = s.score;
    const c = s.captured;
    const gukjinMoved = b.gukjinAsPi && c.yeol.includes(GUKJIN_ID);
    const piCount = c.pi.reduce((sum, id) => sum + getCard(id).piValue, 0) + (gukjinMoved ? 2 : 0);
    const sum = b.gwang + b.yeol + b.godori + b.tti + b.hongdan + b.cheongdan + b.chodan + b.pi;
    if (b.total !== sum || b.pi !== Math.max(0, b.piCount - 9)) {
      expect({ seat, score: b }).toMatchObject({ seat, score: { total: sum, pi: b.piCount - 9 } });
    }
    if (boundary) {
      const oracle = {
        piCount,
        yeolCount: c.yeol.length - (gukjinMoved ? 1 : 0),
        gwangCount: c.gwang.length,
        ttiCount: c.tti.length,
      };
      const got = {
        piCount: b.piCount,
        yeolCount: b.yeolCount,
        gwangCount: b.gwangCount,
        ttiCount: b.ttiCount,
      };
      if (!deepEqual(got, oracle)) {
        expect({ seat, score: got }).toEqual({ seat, score: oracle });
      }
      const fresh = seatScore(c, s.gukjinAsPi, state.rules);
      if (!deepEqual(b, fresh)) {
        expect({ seat, stored: b }).toEqual({ seat, stored: fresh });
      }
    }
    if (pending?.kind === 'play' && state.ctx === null) {
      const threshold = s.goCount === 0 ? WINNING_SCORE : s.lastGoScore + 1;
      if (b.total >= threshold) {
        expect({ seat, total: b.total, threshold }).toBeNull();
      }
    }
  }
  coverage.scoreChecks += 1;
}

/** 검증 생략 경로: 같은 (적용 전 상태, 합법 수)에 applyUnchecked ≡ reduce */
function checkUnchecked(
  before: GameState,
  action: Action,
  state: GameState,
  events: readonly EngineEvent[],
): void {
  const fast = applyUnchecked(before, action);
  expectEqual(fast.state, state);
  expectEqual(fast.events, events);
  coverage.unchecked += 1;
  if (action.type === 'push') {
    coverage.pushes += 1;
  }
}

/**
 * matchPreview(상태·뷰 모두)가 실제 적용 결과와 맞는지: 차례인 좌석의 무작위 카드 내기 하나를 적용해 본다.
 * choose ⇔ 대상 선택 프롬프트(낸 패), shake ⇔ 흔들기 질문, take·pile ⇒ 미리 본 바닥 카드가 턴이 끝난 뒤 그 좌석의
 * 획득 패나 그 좌석의 새 뻑 무더기에 있다, place ⇒ 낸 카드가 먹지 못하고 놓였다(Placed) 또는 쪽(Jjok).
 */
function checkMatchPreview(checker: StepChecker, state: GameState): void {
  const pending = state.pending;
  if (pending?.kind !== 'play') {
    return;
  }
  const seat = pending.seat;
  const plays = legalActions(state, seat).filter((a) => a.type === 'play');
  if (plays.length === 0) {
    return;
  }
  const action = pick(checker, plays);
  if (action.type !== 'play') {
    return;
  }
  const preview = matchPreview(state, seat, action.card);
  coverage.previewKinds.add(preview.shake ? `${preview.kind}+shake` : preview.kind);
  expectEqual(matchPreview(playerView(state, seat), seat, action.card), preview);
  let result = applyUnchecked(state, action);
  const shakeAsked = result.state.pending?.kind === 'shake';
  if (shakeAsked !== preview.shake) {
    expect({ card: action.card, preview, shakeAsked }).toBeNull();
  }
  if (shakeAsked) {
    result = applyUnchecked(result.state, { type: 'shake', seat, accept: false });
  }
  const after = result.state.pending;
  const chooseAsked = after?.kind === 'target' && after.source === 'play';
  if (chooseAsked !== (preview.kind === 'choose')) {
    expect({ card: action.card, preview, pending: after }).toBeNull();
  }
  // 뒤집은 카드에 대상 선택이 걸리면(또는 낸 패 대상 선택이면) 아직 해결 전이다
  if (result.state.pending?.kind === 'target') {
    return;
  }
  const mine = result.state.seats[seat].captured;
  const owned = new Set<CardId>([
    ...mine.gwang,
    ...mine.yeol,
    ...mine.tti,
    ...mine.pi,
    ...result.state.floor
      .filter((g) => g.kind === 'ppeok' && g.owner === seat)
      .flatMap((g) => g.cards),
  ]);
  if (preview.kind === 'place') {
    // 놓였거나(Placed), 뒤집은 같은 월 카드로 바로 먹었다(쪽·마지막 턴 쪽)
    const placed = result.events.some((e) => e.type === 'Placed' && e.source === 'play');
    if (!placed && !owned.has(action.card)) {
      expect({ card: action.card, preview, events: result.events.map((e) => e.type) }).toBeNull();
    }
  } else {
    // take·pile: 미리 본 바닥 카드는 턴이 끝나면 그 좌석의 획득 패나 그 좌석이 싼 새 뻑 무더기에 있다
    // (이 턴의 뺏기는 상대 → 이 좌석 방향뿐이다)
    const missing = preview.floor.filter((id) => !owned.has(id));
    if (missing.length > 0) {
      expect({ card: action.card, preview, missing }).toEqual({
        card: action.card,
        preview,
        missing: [],
      });
    }
  }
}

/**
 * 한 수를 둔 직후(또는 분배 직후) 상태와 그 수가 낸 이벤트를 검사한다.
 * before: 그 수를 두기 전 상태(분배 직후면 null) — applyUnchecked ≡ reduce 검사에 쓴다.
 */
export function checkStep(
  checker: StepChecker,
  state: GameState,
  action: Action | null,
  events: readonly EngineEvent[],
  before: GameState | null = null,
): void {
  coverage.steps += 1;
  trackRevealed(checker, events);
  checkRevealed(checker, state);
  checkScores(state);
  if (before !== null && action !== null) {
    checkUnchecked(before, action, state, events);
  }
  checkMatchPreview(checker, state);
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
    checkEventLeaks(state, events, viewer);
    checkDeterminize(checker, state, view);
  }
  checkRejections(checker, state);
}

/**
 * 끝난 판의 정산 검사 (판마다 한 번).
 * - 밀기(12.7, 해석 30): 민 판은 finalPoints 0·steps 없음·이월 1·선은 승자, 포기 점수 = 밀기 전 정산, 다음 연속 밀기 = 이번 + 1
 *   (규칙이 켜져 있고 상한 미만일 때만 가능). 밀지 않은 판의 밀기 배수 = 2^pushes(승자 있음), 다음 연속 밀기는 승자 있으면 0,
 *   나가리면 그대로.
 * - 승자의 기본점수(스톱 승리) = 정산에 쓴 국진 위치로 센 족보 합계 + 고 가산(G3). 그 위치가 경기 중 표시 점수의 위치와
 *   같으면 표시 합계 + 고 가산(해석 29: 정산만 승자 최대·패자 최소).
 */
export function checkSettlement(state: GameState, result: Settlement): void {
  const pushes = state.round.pushes;
  const pushed = state.result?.pushed === true;
  const winner = result.winner;
  const unpushed =
    winner === null ? result : settle({ ...state, result: { reason: result.reason, winner } });
  const pushStep = unpushed.steps.find((step) => step.origin === 'push');
  const got = {
    pushed: result.pushed,
    pushStep: pushStep?.value ?? 1,
    nextPushes: result.nextPushes,
    ...(pushed
      ? {
          zeroed: [result.finalPoints, result.steps, result.nextCarry, result.nextDealer],
          forfeited: result.forfeitedPoints,
          allowed: state.rules.push && pushes < MAX_PUSHES,
        }
      : {}),
  };
  const want = {
    pushed,
    pushStep: winner === null ? 1 : 2 ** pushes,
    nextPushes: pushed ? pushes + 1 : winner === null ? pushes : 0,
    ...(pushed
      ? { zeroed: [0, [], 1, winner], forfeited: unpushed.finalPoints, allowed: true }
      : {}),
  };
  if (!deepEqual(got, want)) {
    expect(got).toEqual(want);
  }
  if (winner === null || (result.reason !== 'stop' && result.reason !== 'autoStop')) {
    return;
  }
  const w = state.seats[winner];
  const goBonus = state.rules.goScoring === 'plusNAndDouble' || w.goCount < 3 ? w.goCount : 0;
  const asPi = unpushed.gukjinAsPi[winner];
  const base = unpushed.basePoints;
  const byPlacement = scoreCaptured(w.captured, asPi).total + goBonus;
  const byDisplay = asPi === w.score.gukjinAsPi ? w.score.total + goBonus : base;
  if (base !== byPlacement || base !== byDisplay) {
    expect({ base, byPlacement, byDisplay }).toEqual({ base, byPlacement: base, byDisplay: base });
  }
}
