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
import type { ErrorCode, GuestMessage, HostMessage, RoundStatus } from './messages.ts';
import { isRelayFrame, type RelayNotice } from './relay.ts';
import type { Transport } from './transport.ts';
import {
  checkRound,
  eventDigest,
  settlementDigest,
  viewDigest,
  type ObservedRound,
  type VerifyFailure,
} from './verify.ts';
import type { BoardView, SettlementView } from './view-types.ts';

export type RoundCheck =
  | { readonly round: number; readonly result: 'verified' }
  | { readonly round: number; readonly result: 'unverifiable'; readonly reason: 'noCommitment' }
  | { readonly round: number; readonly result: 'failed'; readonly reason: VerifyFailure };

interface Commitment {
  readonly round: number;
  hostHash: string;
  readonly guestHash: string;
  readonly guestSecret: string;
  revealed: boolean;
}
interface MutableObservation {
  readonly round: number;
  readonly events: Record<string, string>;
  readonly views: Record<string, string>;
  readonly sent: Action[];
  settlement: string | null;
}

/** GuestSession.toJSON()의 모양. 탭 수명 저장소(sessionStorage)에 두고 restore로 넘긴다 */
export interface GuestSessionState {
  readonly v: 1;
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

const CHECK_LIMIT = 100;
const ERROR_LIMIT = 200;

export class GuestSession {
  readonly transport: Transport;
  readonly name: string;
  readonly random32: () => Uint8Array;
  token: string | undefined;
  seq: number;
  /** 마지막으로 본 호스트 세대 */
  epoch: string | null = null;
  view: BoardView | null = null;
  /** 원장 요약 (잔액·최근 항목). 전체 이력은 requestLedgerHistory() → ledgerHistory */
  ledger: LedgerSummary | null = null;
  rules: RuleOptions | null = null;
  names: readonly [string, string] | null = null;
  /** 정산 화면. 다음 판 첫 이벤트가 올 때까지 유지된다 */
  settlement: SettlementView | null = null;
  status: RoundStatus | null = null;
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
  private readonly outbox = new Map<string, GuestMessage>();
  /**
   * 보냈지만 호스트 응답을 아직 못 본 요청과 보낸 시각. ping에는 답하면서 요청을 버리는 호스트(인증을 잃은 소켓 등, #40)를
   * 알아채기 위한 감시다. 응답이 오면 지우고, 시간이 지나면 hello로 다시 인증한 뒤 다시 보낸다.
   */
  private readonly inflight = new Map<string, { message: GuestMessage; since: number }>();
  private now = 0;
  private readonly ackTimeout: number;
  private observations: MutableObservation[] = [];
  private readonly changeHandlers = new Set<(guest: GuestSession) => void>();
  private readonly logLine: (line: string) => void;
  constructor(transport: Transport, options: GuestSessionOptions) {
    this.transport = transport;
    this.name = options.name;
    this.random32 = options.random32;
    this.logLine = options.log ?? (() => {});
    this.ackTimeout = options.ackTimeoutMs ?? 5_000;
    this.token = options.sessionToken;
    this.seq = options.lastSeq ?? 0;
    const saved = options.restore;
    if (saved && saved.v === 1) {
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
    this.settlement = null;
    this.status = null;
    this.bankruptcy = null;
    this.ended = null;
    this.connection = 'joining';
    this.outbox.clear();
    this.inflight.clear();
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
    this.sendGame({ t: 'action', seq: this.seq, payload });
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
    if (this.linked) {
      this.inflight.set(message.t, { message, since: this.now });
      this.send(message);
    } else this.outbox.set(message.t, message);
  }
  /** 받은 호스트 메시지가 응답해 주는 요청을 감시 목록에서 지운다 */
  private settle(t: HostMessage['t']): void {
    const answers: Record<string, readonly string[]> = {
      events: ['action', 'bankruptcy'],
      snapshot: ['action', 'bankruptcy', 'ready'],
      reject: ['action', 'bankruptcy', 'ready', 'ledgerGet'],
      status: ['ready', 'bankruptcy'],
      ledgerPage: ['ledgerGet'],
      sessionEnd: ['action', 'bankruptcy', 'ready', 'ledgerGet'],
    };
    for (const request of answers[t] ?? []) this.inflight.delete(request);
  }
  /**
   * 외부 시계가 호출한다(호스트의 advanceTime과 같은 방식). 응답 없는 요청이 ackTimeoutMs를 넘으면 hello를 다시 보내고
   * 요청은 welcome 뒤에 다시 보낸다. 호스트가 이미 적용했으면 다시 보낸 액션은 STALE_SEQ로 무해하게 거부된다.
   */
  advanceTime(nowMs: number): void {
    if (nowMs < this.now) return;
    this.now = nowMs;
    const stale = [...this.inflight.values()].filter((f) => nowMs - f.since >= this.ackTimeout);
    if (stale.length === 0) return;
    this.logLine(`응답 없는 요청 ${stale.map((f) => f.message.t).join(',')}: hello로 다시 인증`);
    for (const { message } of this.inflight.values()) this.outbox.set(message.t, message);
    this.inflight.clear();
    this.linked = false;
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
      v: 1,
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
      })),
      checks: this.checks.slice(-CHECK_LIMIT),
    };
  }

  // ---- 수신 ----

  private relayNotice(notice: RelayNotice): void {
    // 새 소켓(present)이거나 호스트 소켓이 바뀌었다(joined·left): hello로 다시 인증할 때까지 미룬다.
    // absent는 프레임 하나를 전달하지 못했다는 뜻일 뿐이라 인증 상태를 바꾸지 않는다(#40).
    if (notice.peer !== 'absent') this.linked = false;
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
  private observe(view: BoardView, settlement: SettlementView | undefined): void {
    let observed = this.observation(view.round);
    if (observed === undefined) {
      if (!this.commitmentFor(view.round)?.revealed) return;
      observed = { round: view.round, events: {}, views: {}, sent: [], settlement: null };
      this.observations = [...this.observations.slice(-1), observed];
    }
    observed.views[String(view.eventSeq)] = viewDigest(view);
    if (settlement) observed.settlement = settlementDigest(settlement);
  }
  private accept(m: Extract<HostMessage, { t: 'snapshot' | 'events' }>, seq: number): void {
    this.seq = seq;
    this.view = m.view;
    this.ledger = m.ledger;
    this.settlement = m.settlement ?? null;
    this.applyStatus(m.status);
    this.observe(m.view, m.settlement);
    const observed = this.observation(m.view.round);
    if (m.t === 'events' && observed)
      for (const event of m.list) observed.events[String(event.seq)] = eventDigest(event);
  }
  private welcome(m: Extract<HostMessage, { t: 'welcome' }>): void {
    this.token = m.sessionToken;
    this.rules = m.rules;
    this.ledger = m.ledger;
    this.names = m.names;
    this.connection = 'joined';
    const restarted = this.epoch !== null && this.epoch !== m.epoch;
    this.epoch = m.epoch;
    if (restarted && m.seq < this.seq) {
      // 호스트가 저장본에서 복원돼 순번이 되감겼다(#25). 호스트 순번을 따르고, 되감긴 구간의 관찰은 버린다.
      this.logLine(`호스트 복원 감지: 순번 ${this.seq} → ${m.seq}`);
      this.seq = m.seq;
      this.status = null;
      for (const o of this.observations) {
        for (const key of Object.keys(o.events)) if (Number(key) > m.seq) delete o.events[key];
        for (const key of Object.keys(o.views)) if (Number(key) > m.seq) delete o.views[key];
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
      });
      check = result.ok
        ? { round: m.round, result: 'verified' }
        : { round: m.round, result: 'failed', reason: result.reason };
    }
    this.recordCheck(check);
  }
  private receive(raw: string): void {
    if (isRelayFrame(raw)) return; // 전송이 거르지 못한 알림은 메시지로 쓰지 않는다
    const parsed = decode(raw, 'host');
    if (!parsed.ok) {
      this.error(parsed.reason);
      if (parsed.reason === 'VERSION_MISMATCH') this.connection = 'versionMismatch';
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
    this.settle(m.t);
    switch (m.t) {
      case 'welcome':
        this.welcome(m);
        this.linked = true;
        this.inflight.clear();
        for (const pending of this.outbox.values()) this.sendGame(pending);
        this.outbox.clear();
        break;
      case 'snapshot':
        if (m.seq >= this.seq) this.accept(m, m.seq);
        else this.applyStatus(m.status);
        break;
      case 'events':
        if (m.to <= this.seq) {
          this.applyStatus(m.status);
          break;
        }
        if (m.from !== this.seq + 1) {
          // 빈틈: 토큰과 lastSeq로 다시 hello (호스트가 차분이나 스냅샷을 보낸다)
          this.error('STALE_SEQ');
          this.join();
          break;
        }
        this.accept(m, m.to);
        break;
      case 'status':
        this.applyStatus(m.status);
        break;
      case 'reject':
        this.error(m.reason);
        if (m.reason === 'TOKEN_INVALID') this.connection = 'tokenRejected';
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
      case 'bankruptcyPrompt':
        this.bankruptcy = { round: m.round, seats: m.seats, balances: m.balances };
        break;
      case 'sessionEnd':
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
    this.changed();
  }
}
