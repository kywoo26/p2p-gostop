// 호스트 권위 세션. 엔진과 원장은 이 안에서만 갱신하고 게스트에는 가린 뷰를 보낸다.
import {
  applyInstantPayout,
  applySettlement,
  createLedger,
  legalActions,
  newRound,
  playerView,
  redactEvent,
  reduce,
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
import { commit, combineSeed, fromHex, toHex, verifyRound } from './crypto.ts';
import {
  decode,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  byteLength,
  type ErrorCode,
  type GuestMessage,
  type HostMessage,
} from './index.ts';
import type { Transport } from './transport.ts';
import { toBoardView, toSettlementView } from './view.ts';
import type { BoardView, SettlementView } from './view-types.ts';

export interface HostSessionOptions {
  readonly rules: RuleOptions;
  readonly names: readonly [string, string];
  readonly random32: () => Uint8Array;
  readonly ledger?: Ledger;
  readonly perPoint?: number;
  readonly startBalance?: number;
  readonly sessionToken?: string;
  readonly roundNumber?: number;
  readonly dealer?: Seat;
  readonly carry?: number;
}
type EventRecord = EngineEvent;
export class HostSession {
  readonly transport: Transport;
  readonly rules: RuleOptions;
  readonly names: readonly [string, string];
  readonly token: string;
  ledger: Ledger;
  state: GameState | null = null;
  seq = 0;
  roundNumber: number;
  dealer: Seat | undefined;
  carry: number;
  guestName: string | null = null;
  guestLogs: string[] = [];
  bankruptcyPending = false;
  ended = false;
  settlement: Settlement | null = null;
  settlementView: SettlementView | null = null;
  connected = false;
  private logicalTime = 0;
  private lastGuestActivity = 0;
  private readonly random32: () => Uint8Array;
  private hostSecret: Uint8Array | null = null;
  private guestSecret: Uint8Array | null = null;
  private guestHash: string | null = null;
  private hostHash: string | null = null;
  private actions: Action[] = [];
  private currentOptions: RoundOptions = {};
  private events: EventRecord[] = [];
  private readonly logLimit = 256 * 1024;
  constructor(transport: Transport, options: HostSessionOptions) {
    this.transport = transport;
    this.rules = options.rules;
    this.names = options.names;
    this.random32 = options.random32;
    this.ledger =
      options.ledger ?? createLedger(options.perPoint ?? 100, options.startBalance ?? 50_000);
    this.token = options.sessionToken ?? toHex(this.random32());
    this.roundNumber = options.roundNumber ?? 1;
    this.dealer = options.dealer;
    this.carry = options.carry ?? 1;
    transport.onMessage((raw) => this.receive(raw));
    transport.onClose(() => {
      this.connected = false;
    });
  }
  private send(message: HostMessage): void {
    this.transport.send(message);
  }
  private reject(reason: ErrorCode, seq = this.seq, message = reason): void {
    this.send({ t: 'reject', seq, reason, message });
  }
  private board(): BoardView {
    if (this.state === null) throw new Error('판이 없습니다');
    return {
      ...toBoardView(playerView(this.state, 1, { ledger: this.ledger }), {
        names: this.names,
        ledger: this.ledger,
      }),
      eventSeq: this.seq,
    };
  }
  hostView(): BoardView | null {
    return this.state === null
      ? null
      : {
          ...toBoardView(playerView(this.state, 0, { ledger: this.ledger }), {
            names: this.names,
            ledger: this.ledger,
          }),
          eventSeq: this.seq,
        };
  }
  private snapshot(): void {
    if (this.state === null) return;
    this.send({
      t: 'snapshot',
      seq: this.seq,
      view: this.board(),
      ledger: this.ledger,
      ...(this.settlementView ? { settlement: this.settlementView } : {}),
    });
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
    const message: HostMessage = {
      t: 'events',
      from,
      to: this.seq,
      list,
      view: this.board(),
      ledger: this.ledger,
      ...(this.settlementView ? { settlement: this.settlementView } : {}),
    };
    if (byteLength(JSON.stringify(message)) <= MAX_MESSAGE_BYTES) this.send(message);
    else this.snapshot();
  }
  private beginRound(): void {
    if (this.ended || this.bankruptcyPending) return;
    this.state = null;
    const secret = this.random32();
    if (secret.length !== 32) throw new RangeError('random32는 32바이트여야 합니다');
    this.hostSecret = secret;
    this.hostHash = commit(secret);
    this.guestHash = null;
    this.guestSecret = null;
    this.actions = [];
    this.settlement = null;
    this.settlementView = null;
    this.send({ t: 'commitHost', round: this.roundNumber, hash: this.hostHash });
  }
  private dealRound(): void {
    if (!this.hostSecret || !this.guestSecret) return;
    const options: RoundOptions = {
      roundNumber: this.roundNumber,
      carry: this.carry,
      ...(this.dealer === undefined ? {} : { dealer: this.dealer }),
    };
    this.currentOptions = options;
    const start = newRound(this.rules, combineSeed(this.hostSecret, this.guestSecret), options);
    this.state = start.state;
    this.publish(start.events);
    if (this.state.phase === 'end') this.finishRound();
  }
  private finishRound(): void {
    if (this.state?.phase !== 'end' || this.settlement) return;
    const result = settle(this.state);
    this.settlement = result;
    const before = this.ledger;
    this.ledger = applySettlement(this.ledger, result, this.rules);
    this.settlementView = toSettlementView(
      result,
      playerView(this.state, 1, { ledger: before }),
      before,
      this.ledger,
      { names: this.names },
    );
    this.dealer = result.nextDealer;
    this.carry = result.nextCarry;
    this.snapshot();
    if (this.hostSecret && this.guestSecret && this.hostHash && this.guestHash) {
      this.send({
        t: 'revealHost',
        round: this.roundNumber,
        secret: toHex(this.hostSecret),
        guestSecret: toHex(this.guestSecret),
        seed: combineSeed(this.hostSecret, this.guestSecret),
        actions: this.actions,
        hostHash: this.hostHash,
        guestHash: this.guestHash,
        options: this.currentOptions,
      });
    }
    this.roundNumber++;
    this.bankruptcyPending = this.ledger.balances.some((n) => n === 0);
    if (this.bankruptcyPending)
      this.send({ t: 'bankruptcyPrompt', balances: this.ledger.balances });
    else this.beginRound();
  }
  private acceptAction(message: Extract<GuestMessage, { t: 'action' }>): void {
    if (message.seq !== this.seq) {
      this.reject('STALE_SEQ', message.seq);
      this.snapshot();
      return;
    }
    if (this.state === null || this.state.phase === 'end') {
      this.reject('ROUND_NOT_READY', message.seq);
      return;
    }
    if (
      message.payload.seat !== 1 ||
      !legalActions(this.state, 1).some((a) => sameAction(a, message.payload))
    ) {
      this.reject('ILLEGAL_ACTION', message.seq);
      return;
    }
    this.apply(message.payload);
  }
  apply(action: Action): boolean {
    if (this.state === null) return false;
    const result = reduce(this.state, action);
    if (!result.ok) return false;
    const oldCount = this.state.instantPayouts.length;
    this.state = result.state;
    this.actions.push(action);
    for (const payout of this.state.instantPayouts.slice(oldCount))
      this.ledger = applyInstantPayout(this.ledger, payout, this.rules);
    this.publish(result.events);
    if (this.state.phase === 'end') this.finishRound();
    return true;
  }
  private resync(lastSeq: number | undefined): void {
    if (this.state === null) {
      if (this.hostHash)
        this.send({ t: 'commitHost', round: this.roundNumber, hash: this.hostHash });
      else this.beginRound();
      return;
    }
    if (lastSeq === undefined || lastSeq > this.seq || lastSeq < 0) {
      this.snapshot();
      return;
    }
    if (lastSeq === this.seq) {
      this.snapshot();
      return;
    }
    const list = this.events.filter((e) => e.seq > lastSeq);
    const message: HostMessage = {
      t: 'events',
      from: lastSeq + 1,
      to: this.seq,
      list,
      view: this.board(),
      ledger: this.ledger,
      ...(this.settlementView ? { settlement: this.settlementView } : {}),
    };
    if (
      list.length !== this.seq - lastSeq ||
      list.length > 40 ||
      byteLength(JSON.stringify(message)) > MAX_MESSAGE_BYTES
    )
      this.snapshot();
    else this.send(message);
  }
  receive(raw: string): void {
    const parsed = decode(raw, 'guest');
    if (!parsed.ok) {
      this.reject(parsed.reason);
      return;
    }
    this.lastGuestActivity = this.logicalTime;
    this.connected = true;
    const message = parsed.message;
    switch (message.t) {
      case 'hello':
        if (this.guestName !== null && message.sessionToken !== this.token) {
          this.reject('TOKEN_INVALID');
          return;
        }
        if (message.sessionToken && message.sessionToken !== this.token) {
          this.reject('TOKEN_INVALID');
          return;
        }
        this.guestName = message.name;
        this.send({
          t: 'welcome',
          v: PROTOCOL_VERSION,
          seat: 1,
          sessionToken: this.token,
          rules: this.rules,
          ledger: this.ledger,
          names: this.names,
        });
        this.resync(message.lastSeq);
        break;
      case 'commitGuest':
        if (message.round !== this.roundNumber || !this.hostSecret || this.state) {
          this.reject('ROUND_NOT_READY');
          return;
        }
        this.guestHash = message.hash;
        this.send({ t: 'revealGuestRequest', round: this.roundNumber, guestHash: message.hash });
        break;
      case 'revealGuest': {
        const secret = fromHex(message.secret);
        if (
          message.round !== this.roundNumber ||
          !secret ||
          !this.guestHash ||
          commit(secret) !== this.guestHash
        ) {
          this.reject('COMMIT_INVALID');
          return;
        }
        this.guestSecret = secret;
        this.dealRound();
        break;
      }
      case 'action':
        this.acceptAction(message);
        break;
      case 'ping':
        this.send({ t: 'pong' });
        break;
      case 'log':
        for (const line of message.entries) {
          this.guestLogs.push(line);
          while (byteLength(this.guestLogs.join('\n')) > this.logLimit) this.guestLogs.shift();
        }
        break;
      case 'bankruptcy':
        if (!this.bankruptcyPending) {
          this.reject('BANKRUPT');
          return;
        }
        this.bankruptcyPending = false;
        if (message.choice === 'end') {
          this.ended = true;
          break;
        }
        this.ledger = {
          ...this.ledger,
          balances: [this.ledger.startBalance, this.ledger.startBalance],
        };
        this.snapshot();
        this.beginRound();
        break;
    }
  }
  /** 외부 시계가 호출한다. 60초 무응답은 재접속 대기 상태로 표시한다(NP-05). */
  advanceTime(nowMs: number): void {
    if (nowMs < this.logicalTime) return;
    this.logicalTime = nowMs;
    if (this.connected && nowMs - this.lastGuestActivity >= 60_000) this.connected = false;
  }
}

export interface GuestSessionOptions {
  readonly name: string;
  readonly random32: () => Uint8Array;
  readonly sessionToken?: string;
  readonly lastSeq?: number;
}
export class GuestSession {
  readonly transport: Transport;
  readonly name: string;
  readonly random32: () => Uint8Array;
  token: string | undefined;
  seq: number;
  view: BoardView | null = null;
  ledger: Ledger | null = null;
  rules: RuleOptions | null = null;
  names: readonly [string, string] | null = null;
  settlement: SettlementView | null = null;
  readonly verifiedRounds: number[] = [];
  readonly errors: ErrorCode[] = [];
  private guestSecret: Uint8Array | null = null;
  private hostHash: string | null = null;
  private guestHash: string | null = null;
  private round = 0;
  constructor(transport: Transport, options: GuestSessionOptions) {
    this.transport = transport;
    this.name = options.name;
    this.random32 = options.random32;
    this.token = options.sessionToken;
    this.seq = options.lastSeq ?? 0;
    transport.onMessage((raw) => this.receive(raw));
    // 전송이 다시 열리면 대기 중인 hello를 보낸다. 백오프 시간은 전송 구현이 정한다.
    transport.onClose(() => this.join());
  }
  join(): void {
    this.transport.send({
      t: 'hello',
      v: PROTOCOL_VERSION,
      name: this.name,
      ...(this.token ? { sessionToken: this.token } : {}),
      lastSeq: this.seq,
    });
  }
  rejoin(): void {
    this.transport.reconnect();
    this.join();
  }
  sendAction(payload: Action): void {
    this.transport.send({ t: 'action', seq: this.seq, payload });
  }
  sendLogs(entries: readonly string[]): void {
    let batch: string[] = [];
    for (const entry of entries) {
      let line = '';
      for (const char of entry) {
        if (byteLength(line + char) > 2_048) break;
        line += char;
      }
      if (byteLength(JSON.stringify({ t: 'log', entries: [...batch, line] })) > 64 * 1024) {
        this.transport.send({ t: 'log', entries: batch });
        batch = [];
      }
      batch.push(line);
    }
    if (batch.length) this.transport.send({ t: 'log', entries: batch });
  }
  chooseBankruptcy(choice: 'recharge' | 'end'): void {
    this.transport.send({ t: 'bankruptcy', choice });
  }
  private receive(raw: string): void {
    const parsed = decode(raw, 'host');
    if (!parsed.ok) {
      this.errors.push(parsed.reason);
      return;
    }
    const m = parsed.message;
    switch (m.t) {
      case 'welcome':
        this.token = m.sessionToken;
        this.rules = m.rules;
        this.ledger = m.ledger;
        this.names = m.names;
        break;
      case 'snapshot':
        if (m.seq >= this.seq) {
          this.seq = m.seq;
          this.view = m.view;
          this.ledger = m.ledger;
          this.settlement = m.settlement ?? null;
        }
        break;
      case 'events':
        if (m.from !== this.seq + 1 || m.to !== m.from + m.list.length - 1) {
          this.errors.push('STALE_SEQ');
          this.join();
          break;
        }
        this.seq = m.to;
        this.view = m.view;
        this.ledger = m.ledger;
        this.settlement = m.settlement ?? null;
        break;
      case 'reject':
        this.errors.push(m.reason);
        if (m.reason === 'STALE_SEQ') this.join();
        break;
      case 'commitHost': {
        if (m.round === this.round && m.hash === this.hostHash) break;
        const secret = this.random32();
        if (secret.length !== 32) {
          this.errors.push('COMMIT_INVALID');
          break;
        }
        this.round = m.round;
        this.hostHash = m.hash;
        this.guestSecret = secret;
        this.guestHash = commit(secret);
        this.transport.send({ t: 'commitGuest', round: m.round, hash: this.guestHash });
        break;
      }
      case 'revealGuestRequest':
        if (m.round !== this.round || m.guestHash !== this.guestHash || !this.guestSecret) {
          this.errors.push('COMMIT_INVALID');
          break;
        }
        this.transport.send({ t: 'revealGuest', round: m.round, secret: toHex(this.guestSecret) });
        break;
      case 'revealHost':
        if (
          !this.rules ||
          m.round !== this.round ||
          m.hostHash !== this.hostHash ||
          m.guestHash !== this.guestHash ||
          !verifyRound(
            { host: m.hostHash, guest: m.guestHash },
            { host: m.secret, guest: m.guestSecret },
            m.seed,
            m.actions,
            this.rules,
            m.options,
          )
        )
          this.errors.push('COMMIT_INVALID');
        else this.verifiedRounds.push(m.round);
        break;
      case 'pong':
      case 'bankruptcyPrompt':
        break;
    }
  }
}
