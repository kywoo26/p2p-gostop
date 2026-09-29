// 호스트 권위 세션. 엔진과 원장은 이 안에서만 갱신하고 게스트에는 가린 뷰(BoardView)를 보낸다.
// 설계 요점 (M4 리뷰 수정 라운드):
// - 판 사이 commit-reveal은 단계별로 재전송할 수 있고 모든 처리가 멱등이다(#13). 재접속 hello에 빠진 것을 다시 보낸다.
// - 판이 끝나면 settled 단계에서 멈춘다. 다음 판은 호스트 nextRound()로 시작하고 게스트는 ready로 요청만 한다(#26).
// - 파산은 잔액 0인 좌석이 고른다(호스트 좌석은 chooseBankruptcy, 게스트는 bankruptcy 메시지). 재충전은 그 좌석만(#26).
// - 게임 메시지에는 원장 요약만 싣고, 모든 송신은 상한을 먼저 검사해 예외 없이 폴백한다(#23).
// - toJSON/fromJSON으로 순번·판·원장·commit 상태를 저장·복원하고, onChange에서 저장한다(#25).
import {
  legalActions,
  newRound,
  playerView,
  redactEvent,
  reduce,
  replay,
  sameAction,
  settle,
  type Action,
  type EngineEvent,
  type GameState,
  type Ledger,
  type RoundOptions,
  type RuleOptions,
  type Seat,
  type Settlement,
} from '@p2p-gostop/engine';
import { PROTOCOL_VERSION, byteLength, tryEncode, decode } from './codec.ts';
import { commit, combineSeed, fromHex, toHex } from './crypto.ts';
import {
  createSessionLedger,
  engineLedger,
  summarizeLedger,
  withInstantPayout,
  withRecharge,
  withSettlement,
  type SessionLedger,
  type SessionLedgerEntry,
} from './ledger.ts';
import type {
  ErrorCode,
  GuestMessage,
  HostMessage,
  RoundStatus,
  SessionStage,
} from './messages.ts';
import { isRelayFrame, type RelayNotice } from './relay.ts';
import type { Transport } from './transport.ts';
import { toBoardView, toSettlementView } from './view.ts';
import type { BoardView, MoneyUnit, SettlementView } from './view-types.ts';

export interface HostSessionOptions {
  readonly rules: RuleOptions;
  readonly names: readonly [string, string];
  /** 32바이트 난수 (웹: crypto.getRandomValues). 커밋·토큰·세대 id에 쓴다 */
  readonly random32: () => Uint8Array;
  readonly ledger?: SessionLedger | Ledger;
  readonly perPoint?: number;
  readonly startBalance?: number;
  readonly sessionToken?: string;
  readonly roundNumber?: number;
  readonly dealer?: Seat;
  readonly carry?: number;
  /** 첫 hello에 첫 판을 자동으로 시작한다(기본 true). 로비 화면이 있으면 false로 두고 start()를 부른다 */
  readonly autoStart?: boolean;
  readonly unit?: MoneyUnit;
  /** 진단 로그 (송신 실패·무시한 메시지 등) */
  readonly log?: (line: string) => void;
}

type RevealHostMessage = Extract<HostMessage, { t: 'revealHost' }>;

/** 진행 중인 판(또는 핸드셰이크)의 비밀 상태. 저장·복원의 핵심 */
interface RoundRecord {
  readonly hostSecret: string;
  readonly hostHash: string;
  guestHash: string | null;
  guestSecret: string | null;
  options: RoundOptions;
  /** 이 판 첫 이벤트의 세션 순번 */
  firstSeq: number;
  readonly actions: Action[];
  /** 판 시작 전(즉시 정산 전) 잔액 — 정산 화면의 before */
  startBalances: readonly [number, number];
}

/** HostSession.toJSON()의 모양. JSON.stringify로 저장하고 HostSession.fromJSON으로 복원한다 */
export interface HostSessionState {
  readonly v: 1;
  readonly rules: RuleOptions;
  readonly names: readonly [string, string];
  readonly token: string;
  readonly seq: number;
  readonly roundNumber: number;
  readonly dealer: Seat | null;
  readonly carry: number;
  readonly ledger: SessionLedger;
  readonly stage: SessionStage;
  readonly rev: number;
  readonly guestName: string | null;
  readonly guestConfirmed: boolean;
  readonly guestReady: boolean;
  readonly bankrupt: readonly Seat[];
  readonly endReason: RoundStatus['endReason'];
  readonly autoStart: boolean;
  readonly unit: MoneyUnit;
  readonly round: {
    readonly hostSecret: string;
    readonly hostHash: string;
    readonly guestHash: string | null;
    readonly guestSecret: string | null;
    readonly options: RoundOptions;
    readonly firstSeq: number;
    readonly actions: readonly Action[];
    readonly startBalances: readonly [number, number];
  } | null;
  readonly settlementView: SettlementView | null;
  readonly lastReveal: RevealHostMessage | null;
}

const RESYNC_EVENT_LIMIT = 40;
const LEDGER_PAGE_BYTES = 56 * 1024;
const DIAGNOSTIC_LIMIT = 200;

export class HostSession {
  readonly transport: Transport;
  readonly rules: RuleOptions;
  readonly names: readonly [string, string];
  readonly token: string;
  /** 호스트 세대. 생성·복원마다 새 값 (welcome에 실어 게스트가 복원을 알아챈다) */
  readonly epoch: string;
  ledger: SessionLedger;
  /** 최신 엔진 상태. settled·handshake 단계에서는 방금 끝난 판의 상태가 남는다(정산 화면용) */
  state: GameState | null = null;
  seq = 0;
  /** 진행 중(또는 방금 끝난) 판 번호 */
  roundNumber: number;
  dealer: Seat | undefined;
  carry: number;
  guestName: string | null = null;
  /**
   * 게스트가 토큰을 받았음이 확인됐는지: 토큰을 실은 hello나 welcome 뒤에만 보낼 수 있는 메시지를 받으면 true.
   * 확인 전에는 welcome을 잃은 게스트의 토큰 없는 hello를 다시 받아 준다. 확인 뒤에는 토큰 없는 hello를 거절한다(NF-06).
   */
  guestConfirmed = false;
  /**
   * 지금 게스트 소켓이 인증됐는지: 이 소켓에서 받아들인 hello(토큰이 생긴 뒤에는 토큰 hello)가 있어야 true.
   * 중계 알림 joined·left와 전송 끊김에서 false로 되돌린다(absent는 되돌리지 않는다, #40). false인 동안에는 hello·ping만
   * 처리하고 나머지는 응답 없이 버린다: 최신 우선 중계에서 LAN의 다른 기기가 게스트 자리를 밀어내도
   * 손패가 든 스냅샷을 받거나 게스트 좌석으로 둘 수 없다(재검토 중요 2, NF-06).
   */
  authenticated = false;
  /** 중계가 마지막으로 알려 준 게스트 소켓 상태 (알림이 없는 전송이면 null) */
  peer: RelayNotice['peer'] | null = null;
  guestLogs: string[] = [];
  ended = false;
  settlement: Settlement | null = null;
  /** 정산 화면 데이터. 다음 판이 실제로 분배될 때까지 유지한다(#26) */
  settlementView: SettlementView | null = null;
  connected = false;
  /** settled 단계에서 게스트가 다음 판을 요청했는지 */
  guestReady = false;
  readonly diagnostics: string[] = [];
  private stageValue: SessionStage = 'lobby';
  private rev = 0;
  private bankrupt: Seat[] = [];
  private endReason: RoundStatus['endReason'] = null;
  private readonly autoStart: boolean;
  private readonly unit: MoneyUnit;
  private logicalTime = 0;
  private lastGuestActivity = 0;
  private guestLogBytes = 0;
  private readonly random32: () => Uint8Array;
  private readonly logLine: (line: string) => void;
  private current: RoundRecord | null = null;
  private lastReveal: RevealHostMessage | null = null;
  /** 현재 판의 가린 이벤트(세션 순번). 재동기화 차분용(L-8: 판이 바뀌면 비운다) */
  private events: EngineEvent[] = [];
  private readonly changeHandlers = new Set<(host: HostSession) => void>();
  private readonly logLimit = 256 * 1024;
  constructor(transport: Transport, options: HostSessionOptions) {
    this.transport = transport;
    this.rules = options.rules;
    this.names = options.names;
    this.random32 = options.random32;
    this.logLine = options.log ?? (() => {});
    this.ledger =
      options.ledger ??
      createSessionLedger(options.perPoint ?? 100, options.startBalance ?? 50_000);
    this.token = options.sessionToken ?? toHex(this.random32());
    this.epoch = toHex(this.random32()).slice(0, 16);
    this.roundNumber = options.roundNumber ?? 1;
    this.dealer = options.dealer;
    this.carry = options.carry ?? 1;
    this.autoStart = options.autoStart ?? true;
    this.unit = options.unit ?? '냥';
    transport.onMessage((raw) => this.receive(raw));
    transport.onClose(() => {
      this.connected = false;
      this.authenticated = false;
      this.changed();
    });
    transport.onRelay?.((notice) => this.relayNotice(notice));
  }

  // ---- 상태 조회 ----

  get stage(): SessionStage {
    return this.stageValue;
  }
  get status(): RoundStatus {
    return {
      rev: this.rev,
      stage: this.stageValue,
      round: this.roundNumber,
      ready: [false, this.guestReady],
      bankrupt: [...this.bankrupt],
      endReason: this.endReason,
    };
  }
  /** 호환: 파산 선택을 기다리는지 */
  get bankruptcyPending(): boolean {
    return this.stageValue === 'bankrupt';
  }
  /** 좌석 0(호스트) 화면 */
  hostView(): BoardView | null {
    return this.viewFor(0);
  }
  /** 좌석 1(게스트)에게 보내는 화면 (테스트·진단용) */
  guestView(): BoardView | null {
    return this.viewFor(1);
  }
  /** 상태가 바뀔 때마다 부른다. 호스트 UI 갱신과 저장(toJSON)을 여기서 한다 */
  onChange(handler: (host: HostSession) => void): () => void {
    this.changeHandlers.add(handler);
    return () => {
      this.changeHandlers.delete(handler);
    };
  }

  // ---- 호스트 조작 API ----

  /** 로비에서 첫 판을 시작한다 (commit-reveal부터). 게스트가 아직 없으면 hello 때 이어서 보낸다 */
  start(): boolean {
    if (this.stageValue !== 'lobby') return false;
    this.beginRound();
    this.changed();
    return true;
  }
  /** 좌석 0 액션 (L-7: 좌석·단계·합법성 검사). 적용하면 true */
  apply(action: Action): boolean {
    if (action.seat !== 0) return false;
    const ok = this.applyAction(action);
    if (ok) this.changed();
    return ok;
  }
  applyHost(action: Action): boolean {
    return this.apply(action);
  }
  /** settled에서 다음 판을 시작한다 (#26). 게스트 ready 없이도 호스트가 시작할 수 있다 */
  nextRound(): boolean {
    if (this.stageValue !== 'settled') return false;
    this.roundNumber++;
    this.beginRound();
    this.changed();
    return true;
  }
  /** 호스트 좌석(0)이 파산했을 때의 선택 */
  chooseBankruptcy(choice: 'recharge' | 'end'): boolean {
    if (this.stageValue !== 'bankrupt' || !this.bankrupt.includes(0)) return false;
    this.resolveBankruptcy(0, choice);
    this.changed();
    return true;
  }
  /** 호스트가 세션을 끝낸다 */
  end(): void {
    if (this.stageValue === 'ended') return;
    this.finishSession('host', null);
    this.changed();
  }

  // ---- 송신 ----

  private diag(line: string): void {
    this.diagnostics.push(line);
    if (this.diagnostics.length > DIAGNOSTIC_LIMIT) this.diagnostics.shift();
    this.logLine(line);
  }
  /** 모든 송신의 단일 지점: 상한을 먼저 검사하고 전송 예외도 삼킨다(#23) */
  private send(message: HostMessage): boolean {
    const encoded = tryEncode(message);
    if (!encoded.ok) {
      this.diag(`송신 생략 ${message.t}: ${encoded.bytes}바이트 상한 초과`);
      return false;
    }
    try {
      this.transport.send(message);
      return true;
    } catch (error) {
      this.diag(`송신 실패 ${message.t}: ${String(error)}`);
      return false;
    }
  }
  private reject(reason: ErrorCode, seq = this.seq, message: string = reason): void {
    this.send({ t: 'reject', seq, reason, message: message.slice(0, 200) });
  }
  private changed(): void {
    for (const handler of this.changeHandlers) {
      try {
        handler(this);
      } catch (error) {
        this.diag(`onChange 처리기 오류: ${String(error)}`);
      }
    }
  }
  private bump(): void {
    this.rev++;
  }
  private setStage(stage: SessionStage): void {
    this.stageValue = stage;
    this.bump();
  }
  private viewFor(seat: Seat): BoardView | null {
    if (this.state === null) return null;
    return {
      ...toBoardView(playerView(this.state, seat, { ledger: engineLedger(this.ledger) }), {
        names: this.names,
        ledger: this.ledger,
      }),
      eventSeq: this.seq,
    };
  }
  private snapshot(): void {
    const view = this.viewFor(1);
    if (view === null) {
      this.sendStatus();
      return;
    }
    const sent = this.send({
      t: 'snapshot',
      seq: this.seq,
      view,
      ledger: summarizeLedger(this.ledger),
      ...(this.settlementView ? { settlement: this.settlementView } : {}),
      status: this.status,
    });
    if (!sent) this.sendStatus();
  }
  private sendStatus(): void {
    this.send({ t: 'status', seq: this.seq, status: this.status });
  }
  private publish(events: readonly EngineEvent[]): void {
    if (this.state === null) return;
    if (events.length === 0) {
      this.snapshot();
      return;
    }
    const from = this.seq + 1;
    const list = events.map((event) => ({ ...redactEvent(event, 1), seq: ++this.seq }));
    this.events.push(...list);
    const view = this.viewFor(1);
    if (view === null) return;
    const sent = this.send({
      t: 'events',
      from,
      to: this.seq,
      list,
      view,
      ledger: summarizeLedger(this.ledger),
      ...(this.settlementView ? { settlement: this.settlementView } : {}),
      status: this.status,
    });
    if (!sent) this.snapshot();
  }

  // ---- 판 흐름 ----

  private beginRound(): void {
    const secret = this.random32();
    if (secret.length !== 32) {
      this.diag('random32가 32바이트가 아니라 판을 시작하지 않았다');
      return;
    }
    this.current = {
      hostSecret: toHex(secret),
      hostHash: commit(secret),
      guestHash: null,
      guestSecret: null,
      options: {},
      firstSeq: this.seq + 1,
      actions: [],
      startBalances: this.ledger.balances,
    };
    this.guestReady = false;
    this.setStage('handshake');
    this.sendStatus();
    this.sendCommit();
  }
  private sendCommit(): void {
    if (this.current === null) return;
    this.send({ t: 'commitHost', round: this.roundNumber, hash: this.current.hostHash });
  }
  private dealRound(): void {
    const round = this.current;
    if (round === null || round.guestSecret === null) return;
    const options: RoundOptions = {
      roundNumber: this.roundNumber,
      carry: this.carry,
      ...(this.dealer === undefined ? {} : { dealer: this.dealer }),
    };
    round.options = options;
    round.firstSeq = this.seq + 1;
    round.startBalances = this.ledger.balances;
    const start = newRound(this.rules, this.seedOf(round), options);
    this.state = start.state;
    this.settlement = null;
    this.settlementView = null;
    this.events = [];
    this.setStage('playing');
    this.publish(start.events);
    if (this.state.phase === 'end') this.finishRound();
  }
  private seedOf(round: RoundRecord): readonly [number, number, number, number] {
    return combineSeed(fromHex(round.hostSecret)!, fromHex(round.guestSecret ?? '')!);
  }
  private finishRound(): void {
    const round = this.current;
    if (this.state?.phase !== 'end' || this.stageValue !== 'playing' || round === null) return;
    const result = settle(this.state);
    this.settlement = result;
    const applied = withSettlement(this.ledger, result, this.rules);
    this.ledger = applied.ledger;
    this.settlementView = toSettlementView({
      settlement: result,
      captured: [this.state.seats[0].captured, this.state.seats[1].captured],
      names: this.names,
      unit: this.unit,
      perPoint: this.ledger.perPoint,
      amount: applied.entry?.amount ?? 0,
      before: round.startBalances,
      after: this.ledger.balances,
    });
    this.dealer = result.nextDealer;
    this.carry = result.nextCarry;
    this.bankrupt = ([0, 1] as const).filter((seat) => this.ledger.balances[seat] <= 0);
    const bankrupt = this.bankrupt.length > 0;
    this.setStage(bankrupt ? 'bankrupt' : 'settled');
    this.snapshot();
    if (round.guestSecret !== null && round.guestHash !== null) {
      this.lastReveal = {
        t: 'revealHost',
        round: this.roundNumber,
        secret: round.hostSecret,
        guestSecret: round.guestSecret,
        seed: this.seedOf(round),
        actions: [...round.actions],
        hostHash: round.hostHash,
        guestHash: round.guestHash,
        options: round.options,
        firstSeq: round.firstSeq,
      };
      this.send(this.lastReveal);
    }
    if (bankrupt) this.sendBankruptcyPrompt();
  }
  private sendBankruptcyPrompt(): void {
    this.send({
      t: 'bankruptcyPrompt',
      balances: this.ledger.balances,
      round: this.roundNumber,
      seats: [...this.bankrupt],
    });
  }
  private resolveBankruptcy(seat: Seat, choice: 'recharge' | 'end'): void {
    if (choice === 'end') {
      this.finishSession('bankruptcy', seat);
      return;
    }
    this.ledger = withRecharge(this.ledger, seat);
    this.bankrupt = this.bankrupt.filter((s) => s !== seat);
    if (this.bankrupt.length === 0) this.setStage('settled');
    else this.bump();
    this.snapshot();
  }
  private finishSession(reason: 'bankruptcy' | 'host', seat: Seat | null): void {
    this.ended = true;
    this.endReason = reason;
    this.bankrupt = [];
    this.setStage('ended');
    this.sendStatus();
    this.send({ t: 'sessionEnd', reason, seat });
  }
  private applyAction(action: Action): boolean {
    if (this.state === null || this.stageValue !== 'playing' || this.current === null) return false;
    if (!legalActions(this.state, action.seat).some((a) => sameAction(a, action))) return false;
    const result = reduce(this.state, action);
    if (!result.ok) return false;
    const oldCount = this.state.instantPayouts.length;
    this.state = result.state;
    this.current.actions.push(action);
    for (const payout of this.state.instantPayouts.slice(oldCount))
      this.ledger = withInstantPayout(this.ledger, payout, this.rules);
    this.publish(result.events);
    if (this.state.phase === 'end') this.finishRound();
    return true;
  }

  // ---- 수신 ----

  private acceptAction(message: Extract<GuestMessage, { t: 'action' }>): void {
    if (message.seq !== this.seq) {
      this.reject('STALE_SEQ', message.seq);
      this.snapshot();
      return;
    }
    if (this.stageValue !== 'playing' || this.state === null || this.state.phase === 'end') {
      this.reject('ROUND_NOT_READY', message.seq);
      return;
    }
    if (message.payload.seat !== 1 || !this.applyAction(message.payload))
      this.reject('ILLEGAL_ACTION', message.seq);
  }
  /** 재접속 hello: 단계마다 게스트에게 빠졌을 수 있는 것을 모두 다시 보낸다(멱등, #13) */
  private resync(lastSeq: number | undefined): void {
    switch (this.stageValue) {
      case 'lobby':
        return;
      case 'handshake':
        if (this.state !== null) this.snapshot();
        else this.sendStatus();
        if (this.lastReveal) this.send(this.lastReveal);
        this.sendCommit();
        if (this.current?.guestHash)
          this.send({
            t: 'revealGuestRequest',
            round: this.roundNumber,
            guestHash: this.current.guestHash,
          });
        return;
      case 'playing':
        this.resyncEvents(lastSeq);
        return;
      case 'settled':
      case 'bankrupt':
      case 'ended':
        this.snapshot();
        if (this.lastReveal) this.send(this.lastReveal);
        if (this.stageValue === 'bankrupt') this.sendBankruptcyPrompt();
        if (this.stageValue === 'ended' && this.endReason !== null)
          this.send({ t: 'sessionEnd', reason: this.endReason, seat: null });
        return;
    }
  }
  private resyncEvents(lastSeq: number | undefined): void {
    const view = this.viewFor(1);
    if (view === null) return;
    if (lastSeq === undefined || lastSeq >= this.seq || lastSeq < 0) {
      this.snapshot();
      return;
    }
    const list = this.events.filter((e) => e.seq > lastSeq);
    if (list.length !== this.seq - lastSeq || list.length > RESYNC_EVENT_LIMIT) {
      this.snapshot();
      return;
    }
    const sent = this.send({
      t: 'events',
      from: lastSeq + 1,
      to: this.seq,
      list,
      view,
      ledger: summarizeLedger(this.ledger),
      ...(this.settlementView ? { settlement: this.settlementView } : {}),
      status: this.status,
    });
    if (!sent) this.snapshot();
  }
  private hello(message: Extract<GuestMessage, { t: 'hello' }>): void {
    if (message.sessionToken !== undefined && message.sessionToken !== this.token) {
      this.reject('TOKEN_INVALID');
      return;
    }
    if (message.sessionToken === undefined && this.guestConfirmed) {
      this.reject('TOKEN_INVALID');
      return;
    }
    if (message.sessionToken === this.token) this.guestConfirmed = true;
    this.authenticated = true;
    this.guestName = message.name;
    this.send({
      t: 'welcome',
      v: PROTOCOL_VERSION,
      seat: 1,
      sessionToken: this.token,
      rules: this.rules,
      ledger: summarizeLedger(this.ledger),
      names: this.names,
      epoch: this.epoch,
      seq: this.seq,
      status: this.status,
    });
    if (this.stageValue === 'lobby' && this.autoStart) {
      this.beginRound();
      return;
    }
    this.resync(message.lastSeq);
  }
  private commitGuest(message: Extract<GuestMessage, { t: 'commitGuest' }>): void {
    const round = this.current;
    if (this.stageValue !== 'handshake' || round === null || message.round !== this.roundNumber) {
      if (message.round > this.roundNumber) this.reject('ROUND_NOT_READY');
      else this.diag(`지난 commitGuest 무시 (판 ${message.round})`);
      return;
    }
    // 분배 전에는 게스트가 다시 커밋해도 된다(새로고침으로 원문을 잃은 경우). 호스트 원문은 아직 비밀이다.
    if (round.guestHash !== message.hash) round.guestHash = message.hash;
    this.send({ t: 'revealGuestRequest', round: this.roundNumber, guestHash: message.hash });
  }
  private revealGuest(message: Extract<GuestMessage, { t: 'revealGuest' }>): void {
    const round = this.current;
    if (this.stageValue !== 'handshake' || round === null || message.round !== this.roundNumber) {
      if (message.round > this.roundNumber) this.reject('ROUND_NOT_READY');
      else this.diag(`지난 revealGuest 무시 (판 ${message.round})`);
      return;
    }
    const secret = fromHex(message.secret);
    if (!secret || round.guestHash === null || commit(secret) !== round.guestHash) {
      this.reject('COMMIT_INVALID');
      return;
    }
    round.guestSecret = message.secret;
    this.dealRound();
  }
  private ledgerPage(from: number): void {
    const entries: SessionLedgerEntry[] = [];
    let bytes = 0;
    for (const entry of this.ledger.entries.slice(from)) {
      const size = byteLength(JSON.stringify(entry)) + 1;
      if (bytes + size > LEDGER_PAGE_BYTES) break;
      entries.push(entry);
      bytes += size;
    }
    this.send({ t: 'ledgerPage', from, total: this.ledger.entries.length, entries });
  }
  private relayNotice(notice: RelayNotice): void {
    this.peer = notice.peer;
    // 게스트 소켓이 바뀌었거나(joined) 없어졌을 때(left)만 인증을 되돌린다. present는 호스트 자신의 새 소켓에서만 오고
    // 그 전에 끊김(onClose)으로 이미 되돌렸다. absent는 중계가 프레임 하나를 전달하지 못했다는 뜻일 뿐 게스트 소켓은
    // 그대로일 수 있다(Android RelayRoles.forward): 여기서 인증을 되돌리면 게스트는 hello를 다시 보낼 계기가 없어
    // 이후 액션이 말없이 버려진다(#40). 상대 상태만 기록한다.
    if (notice.peer === 'joined' || notice.peer === 'left') this.authenticated = false;
    if (notice.peer === 'left' || notice.peer === 'absent') this.connected = false;
    this.changed();
  }
  receive(raw: string): void {
    if (isRelayFrame(raw)) {
      // 전송 계층이 거르지 못한 relay 모양 프레임은 게스트가 위조한 것일 수 있다: 알림으로도, 메시지로도 쓰지 않는다.
      this.diag('relay 모양 프레임을 메시지 경로에서 받아 버림');
      return;
    }
    const parsed = decode(raw, 'guest');
    if (!parsed.ok) {
      // 인증 전 소켓에는 버전 안내(NP-04)만 답한다.
      if (this.authenticated || parsed.reason === 'VERSION_MISMATCH') this.reject(parsed.reason);
      else this.diag(`인증 전 잘못된 메시지 버림 (${parsed.reason})`);
      return;
    }
    const message = parsed.message;
    if (!this.authenticated && message.t !== 'hello' && message.t !== 'ping') {
      this.diag(`인증 전 ${message.t} 버림`);
      return;
    }
    this.lastGuestActivity = this.logicalTime;
    this.connected = true;
    // welcome 뒤에만 보낼 수 있는 메시지: 게스트가 토큰을 가졌다는 증거
    if (message.t !== 'hello' && message.t !== 'ping' && message.t !== 'log')
      this.guestConfirmed = true;
    switch (message.t) {
      case 'hello':
        this.hello(message);
        break;
      case 'commitGuest':
        this.commitGuest(message);
        break;
      case 'revealGuest':
        this.revealGuest(message);
        break;
      case 'action':
        this.acceptAction(message);
        break;
      case 'ping':
        this.send({ t: 'pong' });
        break;
      case 'log':
        for (const line of message.entries) {
          this.guestLogs.push(line);
          this.guestLogBytes += byteLength(line) + 1;
          while (this.guestLogBytes > this.logLimit && this.guestLogs.length > 0)
            this.guestLogBytes -= byteLength(this.guestLogs.shift()!) + 1;
        }
        break;
      case 'ready':
        if (this.stageValue === 'settled' && message.round === this.roundNumber) {
          if (!this.guestReady) {
            this.guestReady = true;
            this.bump();
          }
          this.sendStatus();
        } else {
          // 무시하더라도 현재 단계를 알려 준다: 게스트의 응답 감시(advanceTime)가 요청을 되풀이하지 않게.
          this.diag(`ready 무시 (단계 ${this.stageValue}, 판 ${message.round})`);
          this.sendStatus();
        }
        break;
      case 'bankruptcy':
        if (this.stageValue !== 'bankrupt' || !this.bankrupt.includes(1)) {
          this.reject('BANKRUPT');
          return;
        }
        this.resolveBankruptcy(1, message.choice);
        break;
      case 'ledgerGet':
        this.ledgerPage(message.from);
        break;
    }
    this.changed();
  }
  /** 외부 시계가 호출한다. 60초 무응답은 재접속 대기 상태로 표시한다(NP-05). */
  advanceTime(nowMs: number): void {
    if (nowMs < this.logicalTime) return;
    this.logicalTime = nowMs;
    if (this.connected && nowMs - this.lastGuestActivity >= 60_000) {
      this.connected = false;
      this.changed();
    }
  }

  // ---- 저장·복원 (MN-05, #25) ----

  toJSON(): HostSessionState {
    const round = this.current;
    return {
      v: 1,
      rules: this.rules,
      names: this.names,
      token: this.token,
      seq: this.seq,
      roundNumber: this.roundNumber,
      dealer: this.dealer ?? null,
      carry: this.carry,
      ledger: this.ledger,
      stage: this.stageValue,
      rev: this.rev,
      guestName: this.guestName,
      guestConfirmed: this.guestConfirmed,
      guestReady: this.guestReady,
      bankrupt: [...this.bankrupt],
      endReason: this.endReason,
      autoStart: this.autoStart,
      unit: this.unit,
      round:
        round === null
          ? null
          : {
              hostSecret: round.hostSecret,
              hostHash: round.hostHash,
              guestHash: round.guestHash,
              guestSecret: round.guestSecret,
              options: round.options,
              firstSeq: round.firstSeq,
              actions: [...round.actions],
              startBalances: round.startBalances,
            },
      settlementView: this.settlementView,
      lastReveal: this.lastReveal,
    };
  }

  /**
   * 저장한 상태로 세션을 되살린다. 진행 중인 판은 시드+액션 리플레이로 다시 만든다.
   * 세대(epoch)는 새로 뽑는다: 게스트는 welcome의 세대·순번으로 호스트 복원을 알아채고, 자기 순번이 더 크면 되감는다.
   * 저장본이 깨졌으면 Error를 던진다(호출자가 새 세션으로 시작한다).
   */
  static fromJSON(
    transport: Transport,
    data: HostSessionState,
    options: Pick<HostSessionOptions, 'random32' | 'log'>,
  ): HostSession {
    if (data.v !== 1) throw new Error('지원하지 않는 세션 저장 형식');
    const host = new HostSession(transport, {
      rules: data.rules,
      names: data.names,
      random32: options.random32,
      ledger: data.ledger,
      sessionToken: data.token,
      roundNumber: data.roundNumber,
      ...(data.dealer === null ? {} : { dealer: data.dealer }),
      carry: data.carry,
      autoStart: data.autoStart,
      unit: data.unit,
      ...(options.log ? { log: options.log } : {}),
    });
    host.restore(data);
    return host;
  }
  private restore(data: HostSessionState): void {
    this.seq = data.seq;
    this.stageValue = data.stage;
    this.rev = data.rev + 1;
    this.guestName = data.guestName;
    this.guestConfirmed = data.guestConfirmed;
    this.guestReady = data.guestReady;
    this.bankrupt = [...data.bankrupt];
    this.endReason = data.endReason;
    this.ended = data.stage === 'ended';
    this.settlementView = data.settlementView;
    this.lastReveal = data.lastReveal;
    const round = data.round;
    this.current =
      round === null
        ? null
        : {
            hostSecret: round.hostSecret,
            hostHash: round.hostHash,
            guestHash: round.guestHash,
            guestSecret: round.guestSecret,
            options: round.options,
            firstSeq: round.firstSeq,
            actions: [...round.actions],
            startBalances: round.startBalances,
          };
    const dealt = this.current !== null && this.current.guestSecret !== null;
    if (dealt && data.stage !== 'handshake') {
      const result = replay(
        this.rules,
        this.seedOf(this.current!),
        this.current!.actions,
        this.current!.options,
      );
      if (!result.ok) throw new Error('저장된 판을 리플레이할 수 없습니다');
      this.state = result.state;
      this.events = result.events.map((event, i) => ({
        ...redactEvent(event, 1),
        seq: this.current!.firstSeq + i,
      }));
      if (this.current!.firstSeq + result.events.length - 1 !== this.seq)
        throw new Error('저장된 순번과 리플레이 이벤트 수가 맞지 않습니다');
      if (this.state.phase === 'end') this.settlement = settle(this.state);
    } else if (this.lastReveal !== null) {
      // 핸드셰이크 중이면 방금 끝난 판을 화면에 남긴다.
      const last = this.lastReveal;
      const result = replay(this.rules, last.seed, last.actions, last.options);
      if (result.ok) {
        this.state = result.state;
        this.settlement = settle(result.state);
      }
    }
  }
}
