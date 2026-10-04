import { isSocialFrame } from './social.ts';
// 게스트 세션. 호스트가 보낸 가린 뷰만 들고, 액션은 요청으로 보낸다(FR-11).
// - commit-reveal 메시지는 중복·재전송을 견딘다: 같은 판·같은 해시면 같은 응답을 다시 보내고 새 난수를 뽑지 않는다(#13).
// - 원문을 공개한 판에 다른 commitHost가 오면 거부한다(재추첨 방지, #16). 공개한 판의 revealHost 없이 다음 판
//   커밋·세션 종료가 오면 그 판을 missingReveal 실패로 기록하고, 판 번호는 1씩만 늘도록 한다(재검토 중요 1).
// - 판마다 받은 이벤트·뷰·정산 요약과 보낸 액션을 기록해 revealHost 때 리플레이와 대조한다(#16).
// - toJSON()을 탭 수명 저장소(sessionStorage 등)에 두면 새로고침 뒤에도 커밋 상태를 잃지 않는다. 잃었으면 그 판은
//   COMMIT_INVALID가 아니라 '검증 불가'로 표시한다.
import type { Action, RuleOptions, Seat } from '@p2p-gostop/engine';
import { PROTOCOL_VERSION, byteLength, decode, tryEncode } from './codec.ts';
import { commit, toHex } from './crypto.ts';
import type { LedgerSummary, SessionLedgerEntry } from './ledger.ts';
import type {
  DecisionClock,
  DecisionKey,
  ErrorCode,
  GuestMessage,
  HostMessage,
  RoundStatus,
  TimerSettings,
  TimeoutResult,
} from './messages.ts';
import { sameDecision, timeoutDigest } from './timer-policy.ts';
import { isRelayFrame, type RelayNotice } from './relay.ts';
import type { Transport } from './transport.ts';
import {
  checkRound,
  eventDigest,
  settlementDigest,
  viewDigest,
  type ObservedRound,
  type PublicTargetObservation,
  type PublicTargetCheck,
  type VerifyFailure,
} from './verify.ts';
import { publicTargetCheckSchema, publicTargetObservationSchema } from './schema.ts';
import { matchesAcceptedPlayTarget } from './view.ts';
import type { AcceptedPlayTarget, BoardView, SettlementView } from './view-types.ts';

export type RoundCheck =
  | {
      readonly round: number;
      readonly result: 'verified';
      readonly time?: 'verified' | 'unverifiable';
      /** 기존 verified와 별도의 새 공개 대상 관찰 결과. 없는 옛 결과는 미관찰. */
      readonly publicTargets?: PublicTargetCheck;
    }
  | { readonly round: number; readonly result: 'aborted'; readonly reason: string }
  | { readonly round: number; readonly result: 'unverifiable'; readonly reason: 'noCommitment' }
  | { readonly round: number; readonly result: 'failed'; readonly reason: VerifyFailure };

interface Commitment {
  readonly round: number;
  hostHash: string;
  readonly guestHash: string;
  readonly guestSecret: string;
  revealed: boolean;
}
interface MutablePublicTargets {
  gap: boolean;
  overflowSeq?: number;
  accepted: Record<string, AcceptedPlayTarget[]>;
  relations: Record<string, Array<{ played: number | null; playTarget: number | null }>>;
}
interface MutableObservation {
  readonly round: number;
  publicTargets?: MutablePublicTargets;
  readonly events: Record<string, string>;
  readonly views: Record<string, string>;
  readonly sent: Action[];
  settlement: string | null;
  timing?: {
    settings: TimerSettings | null;
    gap: boolean;
    running: Array<NonNullable<ObservedRound['timing']>['running'][number]>;
    checks: Array<NonNullable<ObservedRound['timing']>['checks'][number]>;
    acks: Array<NonNullable<ObservedRound['timing']>['acks'][number]>;
  };
}

/** GuestSession.toJSON()의 모양. 탭 수명 저장소(sessionStorage)에 두고 restore로 넘긴다 */
export interface GuestSessionState {
  readonly v: 1 | 2 | 3;
  readonly token: string | null;
  readonly seq: number;
  readonly epoch: string | null;
  /** 최근 두 판의 커밋 (판 전환 중 revealHost가 늦게 와도 검증할 수 있게) */
  readonly commitments: readonly {
    readonly round: number;
    readonly hostHash: string;
    readonly guestHash: string;
    readonly guestSecret: string;
    readonly revealed: boolean;
  }[];
  readonly observations: readonly ObservedRound[];
  readonly checks: readonly RoundCheck[];
  readonly timerSettings?: TimerSettings;
  readonly decision?: DecisionClock | null;
  readonly timeoutHistory?: readonly TimeoutResult[];
  readonly nextRequestId?: number;
}

export interface GuestSessionOptions {
  readonly name: string;
  readonly random32: () => Uint8Array;
  readonly sessionToken?: string;
  readonly lastSeq?: number;
  /** 새로고침 전 toJSON() 결과 */
  readonly restore?: GuestSessionState;
  /**
   * 요청(action·ready·bankruptcy·ledgerGet)에 호스트 응답이 이 시간(ms) 안에 없으면 hello를 다시 보내 소켓을 다시
   * 인증하고 요청을 다시 보낸다. 시각은 advanceTime(nowMs)으로 넣는다. 기본 5000
   */
  readonly ackTimeoutMs?: number;
  readonly log?: (line: string) => void;
}

export type GuestConnection = 'idle' | 'joining' | 'joined' | 'tokenRejected' | 'versionMismatch';

function samePublicTarget(a: AcceptedPlayTarget, b: AcceptedPlayTarget): boolean {
  return a.baseSeq === b.baseSeq && a.seat === b.seat && a.card === b.card && a.target === b.target;
}
function clonePublicTargets(value: PublicTargetObservation, gap = value.gap): MutablePublicTargets {
  return {
    gap,
    ...(value.overflowSeq === undefined ? {} : { overflowSeq: value.overflowSeq }),
    accepted: Object.fromEntries(
      Object.entries(value.accepted).map(([key, targets]) => [
        key,
        targets.map((target) => ({ ...target })),
      ]),
    ),
    relations: Object.fromEntries(
      Object.entries(value.relations).map(([key, relations]) => [
        key,
        relations.map((r) => ({ ...r })),
      ]),
    ),
  };
}

/** 탭 저장 validating reader. wire4/store3는 독립이고 옛 관찰에 새 검증 성공을 붙이지 않는다. */
export function readGuestSessionState(value: unknown): GuestSessionState | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('v' in value) ||
    (value.v !== 1 && value.v !== 2 && value.v !== 3) ||
    !('observations' in value) ||
    !Array.isArray(value.observations) ||
    value.observations.length > 2 ||
    !('checks' in value) ||
    !Array.isArray(value.checks) ||
    value.checks.length > 100 ||
    !('commitments' in value) ||
    !Array.isArray(value.commitments) ||
    value.commitments.length > 2 ||
    !('seq' in value) ||
    !Number.isSafeInteger(value.seq) ||
    Number(value.seq) < 0
  )
    return null;
  if (
    value.v >= 2 &&
    (!('timerSettings' in value) ||
      !('decision' in value) ||
      !('timeoutHistory' in value) ||
      !('nextRequestId' in value))
  )
    return null;
  const observations: unknown[] = [];
  if (value.v === 3) {
    for (const check of value.checks) {
      if (typeof check !== 'object' || check === null) return null;
      if (
        'publicTargets' in check &&
        !publicTargetCheckSchema.safeParse(check.publicTargets).success
      )
        return null;
    }
    for (const observation of value.observations) {
      if (
        typeof observation !== 'object' ||
        observation === null ||
        !('publicTargets' in observation)
      )
        return null;
      const parsed = publicTargetObservationSchema.safeParse(observation.publicTargets);
      if (!parsed.success) return null;
      const targets = parsed.data;
      observations.push({ ...observation, publicTargets: targets });
      if (
        !('round' in observation) ||
        !Number.isSafeInteger(observation.round) ||
        Number(observation.round) < 1
      )
        return null;
      for (const map of [targets.accepted, targets.relations]) {
        const keys = Object.keys(map);
        if (
          keys.length > 401 ||
          keys.some((k) => !/^(0|[1-9][0-9]*)$/.test(k) || !Number.isSafeInteger(Number(k)))
        )
          return null;
      }
      if (
        Object.entries(targets.accepted).some(([key, values]) =>
          values.some((target) => Number(key) !== target.baseSeq),
        ) ||
        Object.values(targets.relations).reduce((sum, items) => sum + items.length, 0) > 401 ||
        Object.values(targets.accepted).reduce((sum, items) => sum + items.length, 0) > 400
      )
        return null;
    }
  }
  // 기존 v1/v2 기본 계약은 유지. 새 영역은 위 스키마로 검증하고 constructor가 복제한다.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { ...value, ...(value.v === 3 ? { observations } : {}) } as GuestSessionState;
}

const CHECK_LIMIT = 100;
const ERROR_LIMIT = 200;
const HELLO_RETRY_MAX_MS = 30_000;

interface PendingRequest {
  readonly message: GuestMessage;
  readonly since: number;
  readonly statusRev: number;
  readonly round: number;
}

export class GuestSession {
  readonly transport: Transport;
  readonly name: string;
  readonly random32: () => Uint8Array;
  token: string | undefined;
  seq: number;
  /** 마지막으로 본 호스트 세대 */
  epoch: string | null = null;
  view: BoardView | null = null;
  /** 이번에 accept한 live 전이만. snapshot/welcome에서 지우며 저장·재연하지 않는다. */
  acceptedPlayTarget: AcceptedPlayTarget | null = null;
  /** 원장 요약 (잔액·최근 항목). 전체 이력은 requestLedgerHistory() → ledgerHistory */
  ledger: LedgerSummary | null = null;
  rules: RuleOptions | null = null;
  names: readonly [string, string] | null = null;
  /** 정산 화면. 다음 판 첫 이벤트가 올 때까지 유지된다 */
  settlement: SettlementView | null = null;
  status: RoundStatus | null = null;
  timerSettings: TimerSettings | null = null;
  decision: DecisionClock | null = null;
  readonly timeoutHistory: TimeoutResult[] = [];
  private renderedAttempt: string | null = null;
  private expiryPending: Extract<HostMessage, { t: 'expiryCheck' }> | null = null;
  private pendingReveal: Extract<HostMessage, { t: 'revealHost' }> | null = null;
  /** 실시간 timeoutResult에는 빈틈이 있을 수 있어 페이지의 연속 오프셋을 별도로 센다. */
  private timeoutPageCursor: { round: number; next: number } | null = null;
  private pendingCommit: Extract<HostMessage, { t: 'commitHost' }> | null = null;
  private pendingEnd: Extract<HostMessage, { t: 'sessionEnd' }> | null = null;
  /** 파산 선택 요청 (seats에 1이 있으면 게스트가 고른다) */
  bankruptcy: {
    readonly round: number;
    readonly seats: readonly Seat[];
    readonly balances: readonly [number, number];
  } | null = null;
  ended: { readonly reason: 'bankruptcy' | 'host'; readonly seat: Seat | null } | null = null;
  connection: GuestConnection = 'idle';
  /** 중계가 알려 준 호스트 소켓 존재 여부 (알림이 없는 전송이면 null) */
  hostPresent: boolean | null = null;
  readonly ledgerHistory: SessionLedgerEntry[] = [];
  ledgerTotal = 0;
  readonly verifiedRounds: number[] = [];
  readonly checks: RoundCheck[] = [];
  readonly errors: ErrorCode[] = [];
  private commitments: Commitment[] = [];
  /**
   * 지금 소켓에서 welcome을 받았는지. 호스트는 소켓마다 hello로 인증하므로(재검토 중요 2) 그 전에 보낸 게임 메시지는
   * 말없이 버려진다. 연결이 끊긴 동안의 요청은 outbox에 두었다가 welcome 뒤에 보낸다(액션은 마지막 것 하나).
   */
  private linked = false;
  /** 현재 welcome 및 resync 완료 여부만. 대화 입력은 게임 요청과 독립이다. */
  get socialAuthenticated(): boolean {
    return this.linked && !this.awaitingResync && this.connection === 'joined';
  }

  /** welcome 뒤 호스트의 재동기화 프레임을 먼저 소비한 뒤 outbox를 보낸다. */
  private awaitingResync = false;
  private readonly outbox = new Map<string, GuestMessage>();
  /**
   * 보냈지만 호스트 응답을 아직 못 본 요청과 보낸 시각. ping에는 답하면서 요청을 버리는 호스트(인증을 잃은 소켓 등, #40)를
   * 알아채기 위한 감시다. 응답이 오면 지우고, 시간이 지나면 hello로 다시 인증한 뒤 다시 보낸다.
   */
  private readonly inflight = new Map<string, PendingRequest>();
  private nextRequestId = 1;
  private now = 0;
  private readonly ackTimeout: number;
  private helloRetryAt: number | null = null;
  private helloRetryDelay: number;
  private observations: MutableObservation[] = [];
  private readonly changeHandlers = new Set<(guest: GuestSession) => void>();
  private readonly logLine: (line: string) => void;
  constructor(transport: Transport, options: GuestSessionOptions) {
    this.transport = transport;
    this.name = options.name;
    this.random32 = options.random32;
    this.logLine = options.log ?? (() => {});
    this.ackTimeout = options.ackTimeoutMs ?? 5_000;
    this.helloRetryDelay = this.ackTimeout;
    this.token = options.sessionToken;
    this.seq = options.lastSeq ?? 0;
    const saved =
      options.restore === undefined ? undefined : readGuestSessionState(options.restore);
    if (options.restore !== undefined && saved === null)
      throw new Error('게스트 저장 형식이 잘못되었습니다');
    if (saved && (saved.v === 1 || saved.v === 2 || saved.v === 3)) {
      if (
        saved.v >= 2 &&
        (saved.timerSettings === undefined ||
          saved.decision === undefined ||
          saved.timeoutHistory === undefined ||
          saved.nextRequestId === undefined)
      )
        throw new Error('게스트 타이머 저장 필드가 빠졌습니다');
      this.nextRequestId = saved.nextRequestId ?? 1;
      this.timerSettings = saved.timerSettings ?? { decisionMs: null, policy: 'fixed-v1' };
      this.decision = saved.decision ?? null;
      this.timeoutHistory.push(...(saved.timeoutHistory ?? []));
      this.token = saved.token ?? this.token;
      this.seq = saved.seq;
      this.epoch = saved.epoch;
      this.commitments = saved.commitments.map((c) => ({ ...c }));
      this.observations = saved.observations.map((o) => ({
        round: o.round,
        events: { ...o.events },
        views: { ...o.views },
        sent: [...o.sent],
        settlement: o.settlement,
        ...(saved.v === 3 && o.publicTargets
          ? { publicTargets: clonePublicTargets(o.publicTargets, true) }
          : {}),
        ...(o.timing
          ? {
              timing: {
                settings: o.timing.settings,
                gap: true,
                running: [...o.timing.running],
                checks: [...o.timing.checks],
                acks: [...o.timing.acks],
              },
            }
          : {}),
      }));
      this.checks.push(...saved.checks);
      for (const check of saved.checks)
        if (check.result === 'verified') this.verifiedRounds.push(check.round);
    }
    transport.onMessage((raw) => this.receive(raw));
    const relays = transport.onRelay !== undefined;
    // 알림이 있는 전송: 호스트가 있다고 알려질 때(present·joined) hello를 보낸다. 끊김마다 hello를 쌓지 않는다(L-4).
    transport.onRelay?.((notice) => this.relayNotice(notice));
    transport.onClose(() => {
      this.markTimeGap();
      this.linked = false;
      // 알림이 없는 전송: 전송이 다시 열리면 대기 중인 hello가 나간다. 백오프 시간은 전송 구현이 정한다.
      if (!relays) this.join();
    });
  }

  onChange(handler: (guest: GuestSession) => void): () => void {
    this.changeHandlers.add(handler);
    return () => {
      this.changeHandlers.delete(handler);
    };
  }
  private changed(): void {
    for (const handler of this.changeHandlers) {
      try {
        handler(this);
      } catch (error) {
        this.logLine(`onChange 처리기 오류: ${String(error)}`);
      }
    }
  }
  private send(message: GuestMessage): void {
    const encoded = tryEncode(message);
    if (!encoded.ok) {
      this.logLine(`송신 생략 ${message.t}: ${encoded.bytes}바이트 상한 초과`);
      return;
    }
    try {
      this.transport.send(message);
    } catch (error) {
      this.logLine(`송신 실패 ${message.t}: ${String(error)}`);
    }
  }
  private error(code: ErrorCode): void {
    this.errors.push(code);
    if (this.errors.length > ERROR_LIMIT) this.errors.shift();
  }

  // ---- 게스트 조작 API ----

  join(): void {
    if (this.decision !== null) this.markTimeGap();
    if (this.connection !== 'tokenRejected' && this.connection !== 'versionMismatch')
      this.connection = 'joining';
    this.send({
      t: 'hello',
      v: PROTOCOL_VERSION,
      name: this.name,
      ...(this.token ? { sessionToken: this.token } : {}),
      lastSeq: this.seq,
      ...(this.epoch ? { epoch: this.epoch } : {}),
    });
  }
  rejoin(): void {
    this.transport.reconnect();
    this.join();
  }
  /** 토큰이 거절됐을 때(호스트가 새 세션을 열었음) 새 게스트로 다시 들어간다 */
  joinFresh(): void {
    this.token = undefined;
    this.seq = 0;
    this.epoch = null;
    this.commitments = [];
    this.observations = [];
    this.view = null;
    this.timerSettings = null;
    this.decision = null;
    this.timeoutHistory.length = 0;
    this.timeoutPageCursor = null;
    this.pendingReveal = null;
    this.pendingCommit = null;
    this.pendingEnd = null;
    this.nextRequestId = 1;
    this.settlement = null;
    this.status = null;
    this.bankruptcy = null;
    this.ended = null;
    this.connection = 'joining';
    this.outbox.clear();
    this.inflight.clear();
    this.helloRetryAt = null;
    this.awaitingResync = false;
    this.join();
    this.changed();
  }
  /** 액션 요청. 화면은 view.legal 안에서만 액션을 만든다(호스트가 다시 검사한다) */
  sendAction(payload: Action): void {
    const observed = this.view === null ? undefined : this.observation(this.view.round);
    if (observed && payload.seat === 1) {
      observed.sent.push(payload);
      // 보내기 전에 저장 기회를 준다: 저장본의 sent가 실제로 보낸 것보다 적으면 검증이 거짓 실패한다.
      this.changed();
    }
    const clock = this.decision;
    this.sendGame({
      t: 'action',
      seq: this.seq,
      payload,
      requestId: this.nextRequestId++,
      ...(clock !== null && clock.seat === payload.seat
        ? { decisionKey: clock.key, decisionAttempt: clock.attempt }
        : {}),
    });
    this.changed();
  }
  /** 뷰가 DOM에 반영되고 입력을 활성화한 같은 전이에서 호출한다. */
  decisionReady(renderedSeq: number): boolean {
    const clock = this.decision;
    if (
      clock === null ||
      clock.state !== 'preparing' ||
      renderedSeq < clock.key.baseSeq ||
      this.connection !== 'joined' ||
      !this.linked
    )
      return false;
    const mark = `${clock.key.epoch}:${clock.key.decisionId}:${clock.attempt}`;
    if (this.renderedAttempt === mark) return true;
    this.renderedAttempt = mark;
    this.send({ t: 'decisionReady', key: clock.key, attempt: clock.attempt, renderedSeq });
    this.changed();
    return true;
  }
  get decisionInputReady(): boolean {
    const clock = this.decision;
    if (clock === null) return true;
    return (
      clock.seat === 1 &&
      clock.remainingMs > 0 &&
      (clock.state === 'preparing' || clock.state === 'running') &&
      this.renderedAttempt === `${clock.key.epoch}:${clock.key.decisionId}:${clock.attempt}`
    );
  }
  decisionUnavailable(reason: 'background' | 'resync'): void {
    this.markTimeGap();
    if (this.decision !== null)
      this.send({ t: 'decisionUnavailable', key: this.decision.key, reason });
    this.renderedAttempt = null;
  }
  /** expiryCheck는 뷰와 foreground를 확인한 뒤에만 답한다. */
  ackExpiry(renderedSeq: number, foreground: boolean): boolean {
    const check = this.expiryPending;
    const clock = this.decision;
    if (
      !foreground ||
      check === null ||
      clock === null ||
      clock.state !== 'checking' ||
      !sameDecision(clock.key, check.key) ||
      clock.attempt !== check.attempt ||
      renderedSeq < check.key.baseSeq ||
      !this.linked
    )
      return false;
    this.send({ t: 'expiryAck', key: check.key, attempt: check.attempt, renderedSeq });
    const timing = this.observation(check.key.round)?.timing;
    if (
      timing &&
      !timing.acks.some((ack) => sameDecision(ack.key, check.key) && ack.attempt === check.attempt)
    )
      timing.acks.push({ key: check.key, attempt: check.attempt });
    this.expiryPending = null;
    this.changed();
    return true;
  }
  private acceptDecision(clock: DecisionClock | null): void {
    if (clock === null) {
      this.decision = null;
      this.renderedAttempt = null;
      return;
    }
    const before = this.decision;
    if (before !== null && sameDecision(before.key, clock.key) && clock.timerRev < before.timerRev)
      return;
    if (
      before !== null &&
      sameDecision(before.key, clock.key) &&
      clock.timerRev > before.timerRev + 1
    )
      this.markTimeGap();
    if (
      before === null ||
      !sameDecision(before.key, clock.key) ||
      before.attempt !== clock.attempt ||
      clock.state === 'paused'
    )
      this.renderedAttempt = null;
    this.decision = clock;
    if (clock.state === 'running' && clock.deadlineMs !== null) {
      const running = this.observation(clock.key.round)?.timing?.running;
      if (
        running &&
        !running.some(
          (item) =>
            sameDecision(item.key, clock.key) &&
            item.attempt === clock.attempt &&
            item.deadlineMs === clock.deadlineMs,
        )
      )
        running.push({
          key: clock.key,
          attempt: clock.attempt,
          deadlineMs: clock.deadlineMs,
          hostNowMs: clock.hostNowMs,
          recoveryGrantMs: clock.recoveryGrantMs,
        });
    }
  }
  private cancelTimedRequest(key: DecisionKey, requestId?: number): void {
    for (const [slot, message] of this.outbox) {
      if (
        message.t === 'action' &&
        message.decisionKey &&
        sameDecision(message.decisionKey, key) &&
        (requestId === undefined || message.requestId === requestId)
      )
        this.outbox.delete(slot);
    }
    for (const [slot, pending] of this.inflight) {
      const message = pending.message;
      if (
        message.t === 'action' &&
        message.decisionKey &&
        sameDecision(message.decisionKey, key) &&
        (requestId === undefined || message.requestId === requestId)
      )
        this.inflight.delete(slot);
    }
  }
  private acceptTimeout(result: TimeoutResult): void {
    if (
      !this.timeoutHistory.some(
        (entry) => sameDecision(entry.key, result.key) && entry.actionIndex === result.actionIndex,
      )
    ) {
      this.timeoutHistory.push(result);
      this.timeoutHistory.sort(
        (a, b) => a.key.round - b.key.round || a.actionIndex - b.actionIndex,
      );
    }
    this.cancelTimedRequest(result.key);
  }
  requestTimeoutPage(round: number, from = 0): void {
    this.sendGame({ t: 'timeoutGet', round, from });
  }
  /** settled에서 승자가 게스트이면 밀기를 요청한다 */
  push(): void {
    const observed = this.view === null ? undefined : this.observation(this.view.round);
    if (observed) {
      observed.sent.push({ type: 'push', seat: 1 });
      this.changed();
    }
    this.sendGame({ t: 'push', seq: this.seq, requestId: this.nextRequestId++ });
    this.changed();
  }
  /** settled 단계에서 다음 판을 요청한다. 시작은 호스트가 한다 */
  requestNextRound(): void {
    if (this.status?.stage === 'settled') this.sendGame({ t: 'ready', round: this.status.round });
  }
  chooseBankruptcy(choice: 'recharge' | 'end'): void {
    this.sendGame({ t: 'bankruptcy', choice });
  }
  /** 원장 전체 이력을 쪽 단위로 받는다 (ledgerHistory에 채워진다) */
  requestLedgerHistory(from = 0): void {
    this.sendGame({ t: 'ledgerGet', from });
  }
  /** 게임 요청: 인증된 소켓이면 바로, 아니면 welcome 뒤로 미룬다 */
  private sendGame(message: GuestMessage): void {
    if (this.linked && !this.awaitingResync) {
      this.inflight.set(message.t, {
        message,
        since: this.now,
        statusRev: this.status?.rev ?? -1,
        round: this.status?.round ?? 0,
      });
      this.send(message);
    } else this.outbox.set(message.t, message);
  }
  private flushOutbox(): void {
    const pending = [...this.outbox.values()];
    this.outbox.clear();
    for (const message of pending) this.sendGame(message);
  }
  private readySatisfied(
    message: Extract<GuestMessage, { t: 'ready' }>,
    status: RoundStatus,
  ): boolean {
    return status.round > message.round || (status.round === message.round && status.ready[1]);
  }
  private pruneSatisfiedReady(status: RoundStatus): void {
    const pending = this.outbox.get('ready');
    if (pending?.t === 'ready' && this.readySatisfied(pending, status)) this.outbox.delete('ready');
    const inflight = this.inflight.get('ready');
    if (inflight?.message.t === 'ready' && this.readySatisfied(inflight.message, status))
      this.inflight.delete('ready');
  }
  /** 응답의 순번·판·원장 위치가 해당 요청을 실제로 덮을 때만 감시를 지운다. */
  private settle(m: HostMessage): void {
    for (const [key, pending] of this.inflight) {
      const request = pending.message;
      let answered = false;
      if (request.t === 'action' || request.t === 'push') {
        const directResponse =
          m.t === 'events' || m.t === 'snapshot' || m.t === 'status' || m.t === 'reject';
        answered =
          directResponse &&
          ((request.requestId !== undefined && m.requestId === request.requestId) ||
            (m.requestId === undefined &&
              (m.t !== 'events' || m.timeoutResult === undefined) &&
              ((m.t === 'events' && m.to > request.seq) ||
                (m.t === 'snapshot' && m.seq > request.seq))));
      } else if (request.t === 'ready') {
        answered =
          (m.t === 'status' || m.t === 'snapshot') &&
          (this.readySatisfied(request, m.status) ||
            (m.status.round >= request.round && m.status.rev > pending.statusRev));
      } else if (request.t === 'bankruptcy') {
        answered =
          ((m.t === 'events' || m.t === 'snapshot' || m.t === 'status') &&
            m.status.round >= pending.round &&
            m.status.rev > pending.statusRev) ||
          (m.t === 'reject' && m.reason === 'BANKRUPT' && m.seq === this.seq);
      } else if (request.t === 'ledgerGet') {
        answered = m.t === 'ledgerPage' && m.from === request.from;
      } else if (request.t === 'timeoutGet') {
        answered = m.t === 'timeoutPage' && m.from === request.from && m.round === request.round;
      }
      if (m.t === 'sessionEnd') answered = true;
      if (answered) this.inflight.delete(key);
    }
  }
  /**
   * 외부 시계가 호출한다(호스트의 advanceTime과 같은 방식). 응답 없는 요청이 ackTimeoutMs를 넘으면 hello를 다시 보내고
   * 요청은 welcome 뒤에 다시 보낸다. 호스트가 이미 적용했으면 다시 보낸 액션은 STALE_SEQ로 무해하게 거부된다.
   */
  advanceTime(nowMs: number): void {
    if (nowMs < this.now) return;
    this.now = nowMs;
    if (this.helloRetryAt !== null && nowMs >= this.helloRetryAt) {
      this.helloRetryDelay = Math.min(this.helloRetryDelay * 2, HELLO_RETRY_MAX_MS);
      this.helloRetryAt = nowMs + this.helloRetryDelay;
      this.join();
    }
    const stale = [...this.inflight.values()].filter((f) => nowMs - f.since >= this.ackTimeout);
    if (stale.length === 0) return;
    this.logLine(`응답 없는 요청 ${stale.map((f) => f.message.t).join(',')}: hello로 다시 인증`);
    for (const { message } of this.inflight.values()) this.outbox.set(message.t, message);
    this.inflight.clear();
    this.linked = false;
    this.helloRetryDelay = this.ackTimeout;
    this.helloRetryAt = nowMs + this.helloRetryDelay;
    this.join();
    this.changed();
  }
  sendLogs(entries: readonly string[]): void {
    let batch: string[] = [];
    let batchBytes = 30;
    for (const entry of entries) {
      let line = '';
      let lineBytes = 0;
      for (const char of entry) {
        const size = byteLength(char);
        if (lineBytes + size > 2_000) break;
        line += char;
        lineBytes += size;
      }
      const size = byteLength(JSON.stringify(line)) + 1;
      if (batch.length > 0 && batchBytes + size > 60 * 1024) {
        this.send({ t: 'log', entries: batch });
        batch = [];
        batchBytes = 30;
      }
      batch.push(line);
      batchBytes += size;
    }
    if (batch.length) this.send({ t: 'log', entries: batch });
  }

  // ---- 저장 ----

  toJSON(): GuestSessionState {
    return {
      v: 3,
      token: this.token ?? null,
      seq: this.seq,
      epoch: this.epoch,
      commitments: this.commitments.map((c) => ({ ...c })),
      observations: this.observations.map((o) => ({
        round: o.round,
        events: { ...o.events },
        views: { ...o.views },
        sent: [...o.sent],
        settlement: o.settlement,
        publicTargets: o.publicTargets
          ? clonePublicTargets(o.publicTargets)
          : { gap: true, accepted: {}, relations: {} },
        ...(o.timing
          ? {
              timing: {
                settings: o.timing.settings,
                gap: o.timing.gap,
                running: [...o.timing.running],
                checks: [...o.timing.checks],
                acks: [...o.timing.acks],
              },
            }
          : {}),
      })),
      checks: this.checks.slice(-CHECK_LIMIT),
      timerSettings: this.timerSettings ?? { decisionMs: null, policy: 'fixed-v1' },
      decision: this.decision,
      timeoutHistory: this.timeoutHistory.slice(-800),
      nextRequestId: this.nextRequestId,
    };
  }

  // ---- 수신 ----

  private relayNotice(notice: RelayNotice): void {
    // 새 소켓(present)이거나 호스트 소켓이 바뀌었다(joined·left): hello로 다시 인증할 때까지 미룬다.
    // absent는 프레임 하나를 전달하지 못했다는 뜻일 뿐이라 인증 상태를 바꾸지 않는다(#40).
    if (notice.peer !== 'absent') {
      this.markTimeGap();
      this.linked = false;
    }
    this.hostPresent = notice.peer === 'present' || notice.peer === 'joined';
    if (this.hostPresent) this.join();
    this.changed();
  }
  private applyStatus(status: RoundStatus): void {
    if (this.status !== null && status.rev < this.status.rev) return;
    this.status = status;
    if (status.stage !== 'bankrupt') this.bankruptcy = null;
  }
  /** 뷰·이벤트·정산 관찰 기록 (그 판의 커밋을 공개한 뒤에만) */
  private get commitment(): Commitment | null {
    return this.commitments.at(-1) ?? null;
  }
  private commitmentFor(round: number): Commitment | undefined {
    return this.commitments.find((c) => c.round === round);
  }
  private observation(round: number): MutableObservation | undefined {
    return this.observations.find((o) => o.round === round);
  }
  private markTimeGap(): void {
    for (const observed of this.observations)
      if (observed.publicTargets) observed.publicTargets.gap = true;
    if (this.decision === null) return;
    const timing = this.observation(this.decision.key.round)?.timing;
    if (timing) timing.gap = true;
  }
  private observe(view: BoardView, settlement: SettlementView | undefined): void {
    let observed = this.observation(view.round);
    if (observed === undefined) {
      if (!this.commitmentFor(view.round)?.revealed) return;
      observed = {
        round: view.round,
        events: {},
        views: {},
        sent: [],
        settlement: null,
        timing: { settings: this.timerSettings, gap: false, running: [], checks: [], acks: [] },
      };
      this.observations = [...this.observations.slice(-1), observed];
    }
    observed.views[String(view.eventSeq)] = viewDigest(view);
    if (settlement) observed.settlement = settlementDigest(settlement);
  }
  private accept(m: Extract<HostMessage, { t: 'snapshot' | 'events' }>, seq: number): void {
    const previousSeq = this.seq;
    this.acceptedPlayTarget = m.t === 'events' ? (m.acceptedPlayTarget ?? null) : null;
    this.seq = seq;
    this.view = m.view;
    this.ledger = m.ledger;
    this.settlement = m.settlement ?? null;
    this.applyStatus(m.status);
    this.observe(m.view, m.settlement);
    this.acceptDecision(m.decision);
    if (m.timeoutResult) this.acceptTimeout(m.timeoutResult);
    const observed = this.observation(m.view.round);
    if (observed) {
      const targets = (observed.publicTargets ??= {
        gap: !(m.t === 'events' && m.list.some((e) => e.type === 'Dealt')),
        accepted: {},
        relations: {},
      });
      if (
        (m.t === 'snapshot' && previousSeq !== seq) ||
        (this.awaitingResync && !(m.t === 'events' && m.list.some((e) => e.type === 'Dealt')))
      )
        targets.gap = true;
      this.observeRelation(observed, m.view, seq);
      if (m.t === 'events' && m.acceptedPlayTarget) {
        const evidence = m.acceptedPlayTarget;
        this.observeAccepted(observed, evidence);
      }
    }
    if (m.t === 'events' && observed)
      for (const event of m.list) observed.events[String(event.seq)] = eventDigest(event);
  }
  private observeRelation(observed: MutableObservation, view: BoardView, seq: number): void {
    const targets = (observed.publicTargets ??= { gap: true, accepted: {}, relations: {} });
    const relation = { played: view.inFlight.played, playTarget: view.inFlight.playTarget };
    const key = String(seq);
    const relations = targets.relations[key] ?? [];
    if (relations.some((r) => r.played === relation.played && r.playTarget === relation.playTarget))
      return;
    if (Object.values(targets.relations).reduce((sum, values) => sum + values.length, 0) >= 401)
      this.targetOverflow(targets, seq);
    else {
      relations.push(relation);
      targets.relations[key] = relations;
    }
  }
  private observeAccepted(
    observed: MutableObservation | undefined,
    evidence: AcceptedPlayTarget,
  ): void {
    if (!observed) return;
    const targets = (observed.publicTargets ??= { gap: true, accepted: {}, relations: {} });
    const key = String(evidence.baseSeq);
    const values = targets.accepted[key] ?? [];
    if (values.some((old) => samePublicTarget(old, evidence))) return;
    if (Object.values(targets.accepted).reduce((sum, items) => sum + items.length, 0) >= 400)
      this.targetOverflow(targets, evidence.baseSeq + 1);
    else {
      values.push({ ...evidence });
      targets.accepted[key] = values;
    }
  }
  private targetOverflow(targets: MutablePublicTargets, seq: number): void {
    targets.gap = true;
    targets.overflowSeq = Math.min(targets.overflowSeq ?? seq, seq);
    this.error('MALFORMED');
  }
  private welcome(m: Extract<HostMessage, { t: 'welcome' }>): void {
    this.token = m.sessionToken;
    this.rules = m.rules;
    this.ledger = m.ledger;
    this.names = m.names;
    this.timerSettings = m.timerSettings;
    this.connection = 'joined';
    const restarted = this.epoch !== null && this.epoch !== m.epoch;
    this.epoch = m.epoch;
    this.acceptedPlayTarget = null;
    if (restarted) this.markTimeGap();
    if (restarted) {
      this.decision = null;
      this.renderedAttempt = null;
    }
    if (restarted && m.seq < this.seq) {
      // 호스트가 저장본에서 복원돼 순번이 되감겼다(#25). 호스트 순번을 따르고, 되감긴 구간의 관찰은 버린다.
      this.logLine(`호스트 복원 감지: 순번 ${this.seq} → ${m.seq}`);
      this.seq = m.seq;
      this.status = null;
      for (const o of this.observations) {
        for (const key of Object.keys(o.events)) if (Number(key) > m.seq) delete o.events[key];
        for (const key of Object.keys(o.views)) if (Number(key) > m.seq) delete o.views[key];
        if (o.publicTargets) {
          if (o.publicTargets.overflowSeq !== undefined && o.publicTargets.overflowSeq > m.seq)
            delete o.publicTargets.overflowSeq;
          for (const key of Object.keys(o.publicTargets.accepted))
            if (Number(key) >= m.seq) delete o.publicTargets.accepted[key];
          for (const key of Object.keys(o.publicTargets.relations))
            if (Number(key) > m.seq) delete o.publicTargets.relations[key];
        }
        o.settlement = null;
      }
    } else if (restarted) this.status = null;
    this.applyStatus(m.status);
  }
  private recordCheck(check: RoundCheck): void {
    this.checks.push(check);
    if (this.checks.length > CHECK_LIMIT) this.checks.shift();
    if (check.result === 'verified') this.verifiedRounds.push(check.round);
    if (check.result === 'failed') {
      this.error('COMMIT_INVALID');
      this.logLine(`판 ${check.round} 검증 실패: ${check.reason}`);
    }
  }
  /**
   * 그 판의 결과가 정해졌는지 (verified·unverifiable·missingReveal 등). roundSkip은 위조된 커밋 메시지에 대한 기록일 뿐
   * 그 번호의 판 결과가 아니므로 세지 않는다: 그 판이 나중에 정상으로 진행되면 따로 검증하고, 공개를 빠뜨리면 따로 잡는다.
   */
  private decided(round: number): boolean {
    return this.checks.some(
      (c) => c.round === round && !(c.result === 'failed' && c.reason === 'roundSkip'),
    );
  }
  /** 원문을 공개했는데 검사 결과가 없는 판을 missingReveal로 기록한다. 기록했으면 true */
  private flagMissingReveal(): boolean {
    const c = this.commitment;
    if (c === null || !c.revealed || this.decided(c.round)) return false;
    this.recordCheck({ round: c.round, result: 'failed', reason: 'missingReveal' });
    return true;
  }
  private commitHost(m: Extract<HostMessage, { t: 'commitHost' }>): void {
    const c = this.commitment;
    if (c !== null && m.round < c.round) return; // 지난 판의 재전송
    if (c !== null && m.round > c.round) {
      if (this.pendingReveal?.round === c.round) {
        this.pendingCommit = m;
        return;
      }
      // 정상 호스트는 판 종료 때(재접속이면 resync에서) revealHost를 다음 commitHost보다 먼저 보낸다.
      // 공개한 판의 결과를 보이지 않고 다음 판으로 넘어가면 게스트 원문으로 덱을 본 뒤 다시 뽑는 재추첨이다.
      if (this.flagMissingReveal()) return;
      if (m.round !== c.round + 1) {
        if (!this.checks.some((x) => x.round === m.round && x.result === 'failed'))
          this.recordCheck({ round: m.round, result: 'failed', reason: 'roundSkip' });
        return;
      }
    }
    if (c !== null && m.round === c.round) {
      if (m.hash !== c.hostHash) {
        if (c.revealed) {
          // 원문을 공개한 판의 호스트 커밋이 바뀌었다: 재추첨 시도로 보고 응답하지 않는다(#16, 리뷰 R2).
          this.error('COMMIT_INVALID');
          this.logLine(`판 ${m.round}: 공개 뒤 다른 commitHost 거부`);
          return;
        }
        // 아직 공개 전이면 호스트 커밋을 새로 받아도 안전하다(게스트 원문은 비밀).
        c.hostHash = m.hash;
      }
      this.send({ t: 'commitGuest', round: c.round, hash: c.guestHash });
      return;
    }
    const secret = this.random32();
    if (secret.length !== 32) {
      this.error('COMMIT_INVALID');
      return;
    }
    const next: Commitment = {
      round: m.round,
      hostHash: m.hash,
      guestHash: commit(secret),
      guestSecret: toHex(secret),
      revealed: false,
    };
    this.commitments = [...this.commitments.slice(-1), next];
    this.send({ t: 'commitGuest', round: m.round, hash: next.guestHash });
  }
  private revealGuestRequest(m: Extract<HostMessage, { t: 'revealGuestRequest' }>): void {
    const c = this.commitment;
    if (c === null || m.round !== c.round) return; // 지난 판·모르는 판: 무시 (commitHost 재전송이 뒤따른다)
    if (m.guestHash !== c.guestHash) {
      // 호스트가 옛 커밋을 들고 있다(새로고침 뒤 재커밋 중): 현재 커밋을 다시 알린다.
      if (!c.revealed) this.send({ t: 'commitGuest', round: c.round, hash: c.guestHash });
      return;
    }
    c.revealed = true;
    this.send({ t: 'revealGuest', round: c.round, secret: c.guestSecret });
  }
  private revealHost(m: Extract<HostMessage, { t: 'revealHost' }>): void {
    const entries = this.timeoutHistory
      .filter((entry) => entry.key.round === m.round)
      .toSorted((a, b) => a.actionIndex - b.actionIndex);
    if (entries.length < m.timeoutCount) {
      if (this.pendingReveal?.round !== m.round) {
        this.pendingReveal = m;
        this.timeoutPageCursor = { round: m.round, next: 0 };
        this.requestTimeoutPage(m.round, 0);
      }
      return;
    }
    // 중복, 또는 이미 missingReveal로 판정한 판(뒤늦은 공개로 되돌리지 않는다). roundSkip은 위조된 커밋 메시지에 대한
    // 기록이라 그 번호의 판이 나중에 정상으로 진행되면 따로 검증한다.
    if (this.decided(m.round)) return;
    const c = this.commitmentFor(m.round);
    let check: RoundCheck;
    if (this.rules === null || c === undefined || !c.revealed) {
      check = { round: m.round, result: 'unverifiable', reason: 'noCommitment' };
    } else if (
      m.hostHash !== c.hostHash ||
      m.guestHash !== c.guestHash ||
      m.guestSecret !== c.guestSecret
    ) {
      check = { round: m.round, result: 'failed', reason: 'commitment' };
    } else if (entries.length !== m.timeoutCount || timeoutDigest(entries) !== m.timeoutDigest) {
      check = { round: m.round, result: 'failed', reason: 'actions' };
    } else {
      // 공개한 판을 하나도 보지 못했다면 "본 것 없음·보낸 것 없음"으로 대조한다(리뷰 R3: 아무 수열이나 통과 금지).
      const observed = this.observation(m.round) ?? {
        round: m.round,
        events: {},
        views: {},
        sent: [],
        settlement: null,
      };
      const result = checkRound({
        commitments: { host: m.hostHash, guest: m.guestHash },
        reveals: { host: m.secret, guest: m.guestSecret },
        seed: m.seed,
        actions: m.actions,
        rules: this.rules,
        options: m.options,
        round: m.round,
        firstSeq: m.firstSeq,
        observed,
        timeoutResults: entries,
      });
      check = result.ok
        ? {
            round: m.round,
            result: 'verified',
            ...(result.time ? { time: result.time } : {}),
            ...(result.publicTargets ? { publicTargets: result.publicTargets } : {}),
          }
        : { round: m.round, result: 'failed', reason: result.reason };
    }
    this.recordCheck(check);
  }
  private finishTimeoutPages(failed: boolean): void {
    const reveal = this.pendingReveal;
    this.pendingReveal = null;
    this.timeoutPageCursor = null;
    if (reveal === null) return;
    if (failed) this.recordCheck({ round: reveal.round, result: 'failed', reason: 'actions' });
    else this.revealHost(reveal);
    const nextCommit = this.pendingCommit;
    this.pendingCommit = null;
    if (nextCommit !== null) this.commitHost(nextCommit);
    const end = this.pendingEnd;
    this.pendingEnd = null;
    if (end !== null) {
      this.ended = { reason: end.reason, seat: end.seat };
      this.flagMissingReveal();
    }
  }
  private receive(raw: string): void {
    // 사회표현은 인증 이후 adapter가 처리한다. 시계·활동·원장·ACK를 건드리지 않는다.
    if (isSocialFrame(raw)) return;
    if (isRelayFrame(raw)) return; // 전송이 거르지 못한 알림은 메시지로 쓰지 않는다
    const parsed = decode(raw, 'host');
    if (!parsed.ok) {
      this.error(parsed.reason);
      if (parsed.reason === 'VERSION_MISMATCH') {
        this.connection = 'versionMismatch';
        this.helloRetryAt = null;
      }
      this.changed();
      return;
    }
    const m = parsed.message;
    if (this.token === undefined && m.t !== 'welcome' && m.t !== 'reject' && m.t !== 'pong') {
      // welcome(토큰)을 받기 전에는 판 메시지에 응답하지 않는다: 토큰 없이 커밋·액션을 보내면 호스트가
      // 게스트를 "확인됨"으로 보고 이후 토큰 없는 hello를 거절해 영영 들어갈 수 없게 된다.
      this.logLine(`welcome 전 ${m.t} 무시`);
      return;
    }
    if (
      m.t === 'reject' &&
      (m.reason === 'DECISION_EXPIRED' || m.reason === 'DECISION_PAUSED') &&
      m.decisionKey
    )
      this.cancelTimedRequest(m.decisionKey, m.requestId);
    // 오래된 프레임을 현재 요청의 응답으로 간주하지 않는다.
    this.settle(m);
    switch (m.t) {
      case 'welcome':
        this.welcome(m);
        this.pruneSatisfiedReady(m.status);
        this.linked = true;
        this.awaitingResync = m.status.stage !== 'lobby';
        if (this.awaitingResync) this.helloRetryAt ??= this.now + this.ackTimeout;
        else {
          this.helloRetryAt = null;
          this.flushOutbox();
        }
        break;
      case 'snapshot':
        if (m.seq >= this.seq) this.accept(m, m.seq);
        else this.applyStatus(m.status);
        break;
      case 'events':
        if (m.to <= this.seq) {
          // 이미 관찰한 seq의 재수신은 뷰/전이 적용과 별개로 상이 관계 증거를 보존한다.
          const observed = this.observation(m.view.round);
          if (observed?.publicTargets?.relations[String(m.to)])
            this.observeRelation(observed, m.view, m.to);
        }
        if (m.to > this.seq && m.from !== this.seq + 1) {
          // 누락된 직전 pending으로 live 수락을 판정하지 않는다. 받은 공개 증거는 남기고
          // 접촉 전이는 재연하지 않은 채 기존 hello 복구로 현재 관계에 수렴한다.
          if (m.acceptedPlayTarget)
            this.observeAccepted(this.observation(m.view.round), m.acceptedPlayTarget);
          this.acceptedPlayTarget = null;
          this.markTimeGap();
          this.error('STALE_SEQ');
          this.join();
          break;
        }
        if (m.acceptedPlayTarget) {
          const evidence = m.acceptedPlayTarget;
          const old = this.observation(m.view.round)?.publicTargets?.accepted[
            String(m.acceptedPlayTarget.baseSeq)
          ];
          if (m.to <= this.seq) {
            if (old && !old.some((value) => samePublicTarget(value, evidence))) {
              this.observeAccepted(this.observation(m.view.round), m.acceptedPlayTarget);
              this.error('MALFORMED');
            }
          } else if (
            this.awaitingResync ||
            this.view === null ||
            this.view.round !== m.view.round ||
            !matchesAcceptedPlayTarget(this.view, m.acceptedPlayTarget) ||
            (m.view.inFlight.playTarget !== null &&
              (m.view.inFlight.playTarget !== m.acceptedPlayTarget.target ||
                m.view.inFlight.played !== m.acceptedPlayTarget.card))
          ) {
            this.observeAccepted(this.observation(m.view.round), m.acceptedPlayTarget);
            this.error('MALFORMED');
            break;
          }
        }
        if (m.to <= this.seq) {
          this.applyStatus(m.status);
          break;
        }
        this.accept(m, m.to);
        break;
      case 'status':
        this.applyStatus(m.status);
        break;
      case 'decisionDeadline':
        this.acceptDecision(m.clock);
        break;
      case 'expiryCheck':
        if (
          this.decision !== null &&
          sameDecision(this.decision.key, m.key) &&
          this.decision.attempt === m.attempt
        ) {
          this.expiryPending = m;
          const checks = this.observation(m.key.round)?.timing?.checks;
          if (
            checks &&
            !checks.some((check) => sameDecision(check.key, m.key) && check.attempt === m.attempt)
          )
            checks.push({ key: m.key, attempt: m.attempt, confirmByMs: m.confirmByMs });
        }
        break;
      case 'timeoutPage':
        if (this.pendingReveal?.round !== m.round || this.timeoutPageCursor?.round !== m.round)
          break;
        if (m.from !== this.timeoutPageCursor.next) break; // 이전 페이지의 중복 응답
        if (
          m.total !== this.pendingReveal.timeoutCount ||
          m.from + m.entries.length > m.total ||
          (m.entries.length === 0 && m.from < m.total) ||
          m.entries.some((entry) => entry.key.round !== m.round)
        ) {
          this.finishTimeoutPages(true);
          break;
        }
        for (const entry of m.entries) this.acceptTimeout(entry);
        this.timeoutPageCursor.next = m.from + m.entries.length;
        if (this.timeoutPageCursor.next < m.total)
          this.requestTimeoutPage(m.round, this.timeoutPageCursor.next);
        else
          this.finishTimeoutPages(
            this.timeoutHistory.filter((entry) => entry.key.round === m.round).length !== m.total,
          );
        break;
      case 'reject':
        this.error(m.reason);
        if (m.reason === 'TOKEN_INVALID') {
          this.connection = 'tokenRejected';
          this.helloRetryAt = null;
        }
        // STALE_SEQ면 호스트가 곧바로 스냅샷을 보낸다. 다시 hello하지 않는다(L-4).
        break;
      case 'commitHost':
        this.commitHost(m);
        break;
      case 'revealGuestRequest':
        this.revealGuestRequest(m);
        break;
      case 'revealHost':
        this.revealHost(m);
        break;
      case 'roundAborted':
        if (!this.decided(m.round))
          this.recordCheck({ round: m.round, result: 'aborted', reason: m.reason });
        break;
      case 'bankruptcyPrompt':
        this.bankruptcy = { round: m.round, seats: m.seats, balances: m.balances };
        break;
      case 'sessionEnd':
        if (this.pendingReveal !== null) {
          this.pendingEnd = m;
          break;
        }
        this.ended = { reason: m.reason, seat: m.seat };
        this.flagMissingReveal();
        break;
      case 'ledgerPage':
        for (const [i, entry] of m.entries.entries()) this.ledgerHistory[m.from + i] = entry;
        this.ledgerTotal = m.total;
        break;
      case 'pong':
        break;
    }
    if (m.t === 'snapshot' || m.t === 'events' || m.t === 'status')
      this.pruneSatisfiedReady(m.status);
    if (this.awaitingResync && (m.t === 'snapshot' || m.t === 'events' || m.t === 'status')) {
      this.awaitingResync = false;
      this.helloRetryAt = null;
      this.flushOutbox();
    }
    this.changed();
  }
}
