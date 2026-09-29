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
import { toBoardView } from './view.ts';
import type { BoardView, SettlementView } from './view-types.ts';

export interface Commitments {
  readonly host: string;
  readonly guest: string;
}
export interface Reveals {
  readonly host: string;
  readonly guest: string;
}

/** 게스트가 한 판 동안 관찰한 것의 요약. 키는 세션 순번(문자열). JSON으로 저장할 수 있다 */
export interface ObservedRound {
  readonly round: number;
  /** 순번 → 받은(가린) 이벤트 요약 */
  readonly events: Readonly<Record<string, string>>;
  /** 뷰의 eventSeq → 받은 뷰의 카드 배치 요약 */
  readonly views: Readonly<Record<string, string>>;
  /** 게스트가 이 판에 보낸 좌석 1 액션 (거절된 것 포함) */
  readonly sent: readonly Action[];
  /** 받은 정산 요약 */
  readonly settlement: string | null;
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
  | { readonly ok: true }
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
    if (observed === undefined) {
      const result = replay(input.rules, input.seed, input.actions, input.options);
      return result.ok && result.state.phase === 'end' ? { ok: true } : fail('replay');
    }
    const firstSeq = input.firstSeq ?? 1;
    const start = newRound(input.rules, input.seed, input.options);
    let state = start.state;
    const events: EngineEvent[] = [...start.events];
    const layouts = new Map<number, Set<string>>();
    const record = () => {
      const seq = firstSeq + events.length - 1;
      const set = layouts.get(seq) ?? new Set<string>();
      set.add(stateDigest(state, viewer));
      layouts.set(seq, set);
    };
    record();
    for (const action of input.actions) {
      const result = reduce(state, action);
      if (!result.ok) return fail('replay');
      state = result.state;
      events.push(...result.events);
      record();
    }
    if (state.phase !== 'end') return fail('replay');
    // 게스트 좌석의 수는 게스트가 실제로 보낸 것이어야 한다(호스트가 게스트 수를 지어낼 수 없다).
    const guestMoves = input.actions.filter((a) => a.seat === viewer);
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
    return { ok: true };
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
