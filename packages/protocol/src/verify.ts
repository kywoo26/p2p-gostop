// NP-06 v0.5 검증: 공개된 시드와 액션 열로 리플레이해 **게스트가 실제로 본 판**과 대조한다(#16).
// 해시·시드 일치만으로는 호스트가 조작한 판을 진행한 뒤 시드에 맞는 아무 합법 수열이나 보낼 수 있다(리뷰 R3).
// 그래서 게스트는 판마다 받은 이벤트·뷰(카드 배치)·정산의 요약과 자기가 보낸 액션을 기록해 두고, 리플레이와 맞춰 본다.
import {
  newRound,
  playerView,
  reduce,
  redactEvent,
  replay,
  sameAction,
  settle,
  type Action,
  type EngineEvent,
  type GameState,
  type RoundOptions,
  type RuleOptions,
  type Seat,
  type Seed,
  type Settlement,
} from '@p2p-gostop/engine';
import { combineSeed, commit, fromHex, sha256, toHex, utf8 } from './crypto.ts';
import { acceptedPlayTargetOf, toBoardView } from './view.ts';
import { timeoutAction } from './timer-policy.ts';
import type { DecisionKey, TimeoutResult, TimerSettings } from './messages.ts';
import type { AcceptedPlayTarget, BoardView, InFlight, SettlementView } from './view-types.ts';

export interface Commitments {
  readonly host: string;
  readonly guest: string;
}
export interface Reveals {
  readonly host: string;
  readonly guest: string;
}

/** 게스트가 한 판 동안 관찰한 것의 요약. 키는 세션 순번(문자열). JSON으로 저장할 수 있다 */
export interface PublicTargetObservation {
  readonly gap: boolean;
  /** 관찰 계약 한도 초과는 덮어쓰지 않고 별도 모순으로 보존한다. */
  readonly overflowSeq?: number;
  /** 같은 baseSeq의 상이 재수신도 덮어쓰지 않아 모순 증거를 보존한다. */
  readonly accepted: Readonly<Record<string, readonly AcceptedPlayTarget[]>>;
  /** 0-event 액션의 합법 복수 관계를 잃지 않도록 기존 layouts Set처럼 대조한다. */
  readonly relations: Readonly<Record<string, readonly Pick<InFlight, 'played' | 'playTarget'>[]>>;
}
export type PublicTargetCheck =
  | { readonly result: 'verified'; readonly scope: 'complete' }
  | { readonly result: 'unverifiable'; readonly reason: 'noObservation' | 'gap' }
  | { readonly result: 'conflict'; readonly reason: 'accepted' | 'relations' | 'observationLimit' };

export interface ObservedRound {
  readonly round: number;
  /** guest 저장 v3의 별도 공개 관찰. 기존 digest에 포함하지 않는다. */
  readonly publicTargets?: PublicTargetObservation;
  /** 순번 → 받은(가린) 이벤트 요약 */
  readonly events: Readonly<Record<string, string>>;
  /** 뷰의 eventSeq → 받은 뷰의 카드 배치 요약 */
  readonly views: Readonly<Record<string, string>>;
  /** 게스트가 이 판에 보낸 좌석 1 액션 (거절된 것 포함) */
  readonly sent: readonly Action[];
  /** 받은 정산 요약 */
  readonly settlement: string | null;
  /** 실제 수신·송신한 시간 증거. 옛 저장본에는 없을 수 있다. */
  readonly timing?: {
    readonly settings: TimerSettings | null;
    /** 소켓/렌더러 공백에서 놓친 clock·확인이 있을 수 있다. */
    readonly gap: boolean;
    readonly running: readonly {
      readonly key: DecisionKey;
      readonly attempt: number;
      readonly deadlineMs: number;
      readonly hostNowMs: number;
      readonly recoveryGrantMs: number;
    }[];
    readonly checks: readonly {
      readonly key: DecisionKey;
      readonly attempt: number;
      readonly confirmByMs: number;
    }[];
    readonly acks: readonly { readonly key: DecisionKey; readonly attempt: number }[];
  };
}

export type VerifyFailure =
  | 'commitment'
  | 'seed'
  | 'options'
  | 'replay'
  | 'events'
  | 'views'
  | 'actions'
  | 'settlement'
  /** 원문을 공개한 판의 revealHost 없이 다음 판 커밋이나 세션 종료가 왔다 (재추첨 의심) */
  | 'missingReveal'
  /** 판 번호가 1보다 크게 뛰었다 */
  | 'roundSkip';
export type VerifyResult =
  | {
      readonly ok: true;
      readonly time?: 'verified' | 'unverifiable';
      readonly publicTargets?: PublicTargetCheck;
    }
  | { readonly ok: false; readonly reason: VerifyFailure };

/** 키 순서와 무관한 JSON (파싱한 객체와 엔진 객체의 키 순서가 달라도 같은 요약이 나오게) */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item: unknown) => canonical(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries: [string, unknown][] = Object.entries(value);
    return `{${entries
      .filter(([, item]) => item !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
const fail = (reason: VerifyFailure): VerifyResult => ({ ok: false, reason });
const shortHash = (text: string): string => toHex(sha256(utf8(text))).slice(0, 16);

/** 이벤트 요약: 순번을 뺀 내용 */
export function eventDigest(event: EngineEvent): string {
  const { seq: _seq, ...rest } = event;
  return shortHash(canonical(rest));
}
/** 뷰 요약: 카드 배치·점수·배수·선. 잔액·프롬프트·합법 수처럼 이벤트 없이 바뀔 수 있는 값은 뺀다 */
export function viewDigest(view: BoardView): string {
  return shortHash(
    canonical({
      round: view.round,
      phase: view.phase,
      dealer: view.dealer,
      deckCount: view.deckCount,
      multiplier: view.multiplier,
      pushes: view.pushes,
      floor: view.floor,
      seats: view.seats.map((s) => ({
        handCount: s.handCount,
        hand: s.hand,
        captured: s.captured,
        score: s.score,
        goCount: s.goCount,
        shakes: s.shakes,
        bombs: s.bombs,
        // v2 저장 관찰 해시 호환: 표시용 bombTokens는 검증 요약에 넣지 않는다.
        gukjinAsPi: s.gukjinAsPi,
        revealed: s.revealed,
        ppeokCount: s.ppeokCount,
      })),
    }),
  );
}
/** 정산 요약: 승패·사유·최종 점수·배수 단계 (금액은 원장 상한에 따라 달라 뺀다) */
export function settlementDigest(settlement: SettlementView | Settlement): string {
  const reason =
    settlement.reason === 'floorChongtong' || settlement.reason === 'bothChongtong'
      ? 'chongtong'
      : settlement.reason;
  return shortHash(
    canonical({
      winner: settlement.winner,
      loser: settlement.loser,
      reason,
      finalPoints: settlement.finalPoints,
      steps: settlement.steps,
      gukjinAsPi: settlement.gukjinAsPi,
      pushed: settlement.pushed ?? false,
      forfeitedPoints: settlement.forfeitedPoints ?? 0,
      nextPushes: settlement.nextPushes ?? 0,
    }),
  );
}

function stateDigest(state: GameState, viewer: Seat): string {
  return viewDigest(toBoardView(playerView(state, viewer), { names: ['', ''], balances: [0, 0] }));
}

function isSubsequence(needle: readonly Action[], hay: readonly Action[]): boolean {
  let j = 0;
  for (const action of needle) {
    while (j < hay.length && !sameAction(hay[j]!, action)) j++;
    if (j === hay.length) return false;
    j++;
  }
  return true;
}

export interface RoundCheckInput {
  readonly commitments: Commitments;
  readonly reveals: Reveals;
  readonly seed: Seed;
  readonly actions: readonly Action[];
  readonly rules: RuleOptions;
  readonly options: RoundOptions;
  /** 판 번호. options.roundNumber와 같아야 한다 */
  readonly round?: number;
  /** 이 판 첫 이벤트의 세션 순번 (observed가 있으면 필요) */
  readonly firstSeq?: number;
  readonly observed?: ObservedRound;
  /** 관찰한 좌석 (기본 1 = 게스트) */
  readonly viewer?: Seat;
  readonly timeoutResults?: readonly TimeoutResult[];
}

function sameKey(a: DecisionKey, b: DecisionKey): boolean {
  return (
    a.epoch === b.epoch &&
    a.round === b.round &&
    a.decisionId === b.decisionId &&
    a.baseSeq === b.baseSeq
  );
}

/** 실제 경과시간의 증명이 아니라 게스트가 보존한 호스트 시계·확인 교환과의 모순 검사다. */
function checkTimeoutTime(
  results: readonly TimeoutResult[],
  observed: ObservedRound,
): 'verified' | 'unverifiable' | 'conflict' {
  if (results.length === 0) return 'verified';
  const timing = observed.timing;
  if (timing === undefined || timing.settings === null) return 'unverifiable';
  const decisionMs = timing.settings.decisionMs;
  if (decisionMs === null) return 'conflict';
  let incomplete = false;
  for (const result of results) {
    const checks = timing.checks.filter((check) => sameKey(check.key, result.key));
    const acked = checks.filter((check) =>
      timing.acks.some((ack) => sameKey(ack.key, check.key) && ack.attempt === check.attempt),
    );
    const matchingWindow = acked.filter(
      (check) =>
        result.confirmedAtMs >= check.confirmByMs - 2_000 &&
        result.confirmedAtMs <= check.confirmByMs,
    );
    if (acked.length > 0) {
      const beforeObservedCheck =
        result.confirmedAtMs < Math.min(...acked.map((check) => check.confirmByMs - 2_000));
      const afterObservedCheck =
        result.confirmedAtMs > Math.max(...acked.map((check) => check.confirmByMs));
      if (beforeObservedCheck || afterObservedCheck) {
        if (!timing.gap) return 'conflict';
        incomplete = true;
        continue;
      }
    }
    if (matchingWindow.length === 0) {
      incomplete = true;
      continue;
    }
    const clocks = timing.running.filter(
      (clock) =>
        sameKey(clock.key, result.key) &&
        matchingWindow.some((check) => check.attempt === clock.attempt),
    );
    if (clocks.length === 0) {
      incomplete = true;
      continue;
    }
    if (
      clocks.some(
        (clock) =>
          clock.deadlineMs !== result.deadlineMs ||
          clock.deadlineMs < clock.hostNowMs ||
          clock.deadlineMs - clock.hostNowMs > decisionMs + clock.recoveryGrantMs,
      )
    )
      return 'conflict';
  }
  return incomplete ? 'unverifiable' : 'verified';
}

/** commit-reveal·시드·리플레이·관찰 대조를 모두 검사하고 실패 이유를 돌려준다. 예외를 던지지 않는다 */
export function checkRound(input: RoundCheckInput): VerifyResult {
  try {
    const host = fromHex(input.reveals.host);
    const guest = fromHex(input.reveals.guest);
    if (
      host?.length !== 32 ||
      guest?.length !== 32 ||
      commit(host) !== input.commitments.host ||
      commit(guest) !== input.commitments.guest
    )
      return fail('commitment');
    if (JSON.stringify(combineSeed(host, guest)) !== JSON.stringify(input.seed))
      return fail('seed');
    if (
      input.round !== undefined &&
      input.options.roundNumber !== undefined &&
      input.options.roundNumber !== input.round
    )
      return fail('options');
    const viewer = input.viewer ?? 1;
    const observed = input.observed;
    const timeouts = input.timeoutResults ?? [];
    if (observed === undefined) {
      const result = replay(input.rules, input.seed, input.actions, input.options);
      if (!result.ok || result.state.phase !== 'end') return fail('replay');
      return timeouts.length > 0 ? { ok: true, time: 'unverifiable' } : { ok: true };
    }
    const firstSeq = input.firstSeq ?? 1;
    const start = newRound(input.rules, input.seed, input.options);
    let state = start.state;
    const events: EngineEvent[] = [...start.events];
    const layouts = new Map<number, Set<string>>();
    const targetRelations = new Map<number, Set<string>>();
    const acceptedTargets = new Map<number, AcceptedPlayTarget>();
    const record = () => {
      const seq = firstSeq + events.length - 1;
      const set = layouts.get(seq) ?? new Set<string>();
      set.add(stateDigest(state, viewer));
      layouts.set(seq, set);
      const relation = toBoardView(playerView(state, viewer), {
        names: ['', ''],
        balances: [0, 0],
      }).inFlight;
      const targets = targetRelations.get(seq) ?? new Set<string>();
      targets.add(canonical({ played: relation.played, playTarget: relation.playTarget }));
      targetRelations.set(seq, targets);
    };
    record();
    const timeoutByIndex = new Map<number, TimeoutResult>();
    for (const entry of timeouts) {
      if (
        timeoutByIndex.has(entry.actionIndex) ||
        entry.reason !== 'timeout' ||
        entry.policy !== 'fixed-v1' ||
        entry.key.round !== input.round ||
        entry.key.baseSeq !== entry.baseSeq ||
        entry.confirmedAtMs < entry.deadlineMs
      )
        return fail('actions');
      timeoutByIndex.set(entry.actionIndex, entry);
    }
    if (timeouts.length > input.actions.length) return fail('actions');
    for (const [index, action] of input.actions.entries()) {
      const timed = timeoutByIndex.get(index);
      const beforeSeq = firstSeq + events.length - 1;
      if (timed !== undefined) {
        const view = toBoardView(playerView(state, action.seat), {
          names: ['', ''],
          balances: [0, 0],
        });
        const expected = timeoutAction(view);
        if (
          timed.seat !== action.seat ||
          timed.baseSeq !== beforeSeq ||
          expected === null ||
          !sameAction(expected, action) ||
          !sameAction(timed.action, action)
        )
          return fail('actions');
      }
      const result = reduce(state, action);
      if (!result.ok) return fail('replay');
      const accepted = acceptedPlayTargetOf(state.pending, action, beforeSeq);
      if (accepted) acceptedTargets.set(beforeSeq, accepted);
      state = result.state;
      events.push(...result.events);
      if (timed !== undefined && timed.toSeq !== firstSeq + events.length - 1)
        return fail('actions');
      record();
    }
    if (state.phase !== 'end') return fail('replay');
    // 게스트 좌석의 수는 게스트가 실제로 보낸 것이어야 한다(호스트가 게스트 수를 지어낼 수 없다).
    const guestMoves = input.actions.filter((a, i) => a.seat === viewer && !timeoutByIndex.has(i));
    if (!isSubsequence(guestMoves, observed.sent)) return fail('actions');
    for (const [key, digest] of Object.entries(observed.events)) {
      const event = events[Number(key) - firstSeq];
      if (event === undefined || eventDigest(redactEvent(event, viewer)) !== digest)
        return fail('events');
    }
    for (const [key, digest] of Object.entries(observed.views))
      if (!layouts.get(Number(key))?.has(digest)) return fail('views');
    if (observed.settlement !== null && settlementDigest(settle(state)) !== observed.settlement)
      return fail('settlement');
    const time = checkTimeoutTime(timeouts, observed);
    if (time === 'conflict') return fail('actions');
    // 새 증거의 모순은 gap이 있어도 검출한다. 기존 verified/실패 이유는 변경하지 않는다.
    const targetObservation = observed.publicTargets;
    let publicTargets: PublicTargetCheck;
    if (!targetObservation) publicTargets = { result: 'unverifiable', reason: 'noObservation' };
    else if (targetObservation.overflowSeq !== undefined)
      publicTargets = { result: 'conflict', reason: 'observationLimit' };
    else if (
      Object.entries(targetObservation.accepted).some(([key, values]) =>
        values.some((value) => canonical(acceptedTargets.get(Number(key))) !== canonical(value)),
      )
    )
      publicTargets = { result: 'conflict', reason: 'accepted' };
    else if (
      Object.entries(targetObservation.relations).some(([key, values]) =>
        values.some((value) => !targetRelations.get(Number(key))?.has(canonical(value))),
      )
    )
      publicTargets = { result: 'conflict', reason: 'relations' };
    else if (targetObservation.gap) publicTargets = { result: 'unverifiable', reason: 'gap' };
    else if (Object.keys(targetObservation.relations).length === 0)
      publicTargets = { result: 'unverifiable', reason: 'noObservation' };
    else if ([...acceptedTargets.keys()].some((key) => !targetObservation.accepted[String(key)]))
      publicTargets = { result: 'unverifiable', reason: 'gap' };
    else publicTargets = { result: 'verified', scope: 'complete' };
    return {
      ok: true,
      ...(timeouts.length === 0 ? {} : { time }),
      ...(targetObservation ? { publicTargets } : {}),
    };
  } catch {
    return fail('replay');
  }
}

/**
 * 옛 시그니처 호환. observed(와 firstSeq)를 주면 게스트가 본 판과 대조까지 한다.
 * 세션은 실패 이유가 필요하므로 checkRound를 쓴다.
 */
export function verifyRound(
  commitments: Commitments,
  reveals: Reveals,
  seed: Seed,
  actions: readonly Action[],
  rules: RuleOptions,
  options: RoundOptions = {},
  observed?: ObservedRound & { readonly firstSeq: number },
): boolean {
  return checkRound({
    commitments,
    reveals,
    seed,
    actions,
    rules,
    options,
    ...(observed ? { observed, firstSeq: observed.firstSeq } : {}),
  }).ok;
}
