// NP-01·NP-05: 브라우저 WebSocket 전송. 세션 메시지의 해석은 protocol이 맡는다.
// 중계 계약(protocol relay.ts, #24):
// - 중계 알림({"t":"relay"}·옛 {"type":"relay"})은 세션 메시지로 넘기지 않고 onRelay·onConnection으로 알린다.
// - 닫힘 코드 정책: 4001(다른 탭·기기가 같은 역할로 접속해 교체됨) → 자동 재접속하지 않고 멈춤(사용자가 reconnect()).
//   1008·1003·1009 → 대기열을 비워 같은 내용을 다시 보내지 않고 백오프 재접속(1008이 3번 이어지면 멈춤).
//   그 밖 → 지수 백오프 재접속(0.5초 → 30초 상한).
// - 게스트는 25초마다 ping. 받은 프레임 없이 ping이 2번 지나면(pong 시간 초과) 소켓 상태와 무관하게 새 소켓을 연다.
//   화면 복귀(visibilitychange·pageshow) 때 소켓이 열려 있어 보여도 ping으로 확인하고 4초 안에 응답이 없으면 새 소켓.
// - 모든 연결 사건에는 소켓 번호(socket#n)가 붙는다. 옛 소켓의 사건은 무시한다.
import {
  RELAY_CLOSE_POLICY,
  RELAY_CLOSE_REPLACED,
  RELAY_CLOSE_TOO_LARGE,
  RELAY_CLOSE_UNSUPPORTED,
  RELAY_PATH,
  RELAY_PORT,
  isRelayFrame,
  parseRelayNotice,
  tryEncode,
  type Message,
  type RelayNotice,
  type RelayPeerState,
  type Role,
  type Transport,
} from '@p2p-gostop/protocol';

type SocketFactory = (url: string) => WebSocket;
interface Scheduler {
  setTimeout(handler: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
  setInterval(handler: () => void, ms: number): ReturnType<typeof setInterval>;
  clearInterval(id: ReturnType<typeof setInterval>): void;
}
export interface WsTransportOptions {
  readonly role: Role;
  readonly host?: string;
  readonly port?: number;
  readonly socketFactory?: SocketFactory;
  readonly scheduler?: Scheduler;
  readonly visibility?: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  >;
  readonly pages?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  readonly log?: (line: string) => void;
  /** 게스트 ping 간격 (기본 25초, NP-05) */
  readonly pingIntervalMs?: number;
  /** 화면 복귀 확인 ping의 응답 대기 (기본 4초, NF-05 5초 복귀) */
  readonly probeTimeoutMs?: number;
}

export type StopReason = 'replaced' | 'policy';
/** 연결 사건. socket은 이 전송이 연 소켓 번호(1부터) */
export type ConnectionEvent =
  | { readonly type: 'connecting'; readonly socket: number }
  | { readonly type: 'open'; readonly socket: number }
  | { readonly type: 'peer'; readonly socket: number; readonly peer: RelayPeerState }
  | {
      readonly type: 'close';
      readonly socket: number;
      readonly code: number;
      readonly reason: string;
      /** 다음 재접속까지 ms. 멈추면 null */
      readonly retryInMs: number | null;
    }
  | { readonly type: 'stopped'; readonly socket: number; readonly reason: StopReason }
  | { readonly type: 'pongTimeout'; readonly socket: number }
  | { readonly type: 'dropped'; readonly socket: number; readonly t: Message['t'] };
export type ConnectionState = 'connecting' | 'open' | 'waiting' | 'stopped' | 'disposed';

const PING_INTERVAL_MS = 25_000;
const PROBE_TIMEOUT_MS = 4_000;
const MISSED_PINGS = 2;
const POLICY_LIMIT = 3;

export class WsTransport implements Transport {
  readonly url: string;
  private readonly role: Role;
  private readonly factory: SocketFactory;
  private readonly scheduler: Scheduler;
  private readonly log: (line: string) => void;
  private readonly visibility: WsTransportOptions['visibility'];
  private readonly pages: WsTransportOptions['pages'];
  private readonly pingInterval: number;
  private readonly probeTimeout: number;
  private readonly messages = new Set<(raw: string) => void>();
  private readonly closes = new Set<() => void>();
  private readonly relays = new Set<(notice: RelayNotice) => void>();
  private readonly connections = new Set<(event: ConnectionEvent) => void>();
  private readonly pending: Message[] = [];
  private socket: WebSocket | null = null;
  private socketId = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private probe: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private policyCloses = 0;
  private missed = 0;
  private awaiting = false;
  private stateValue: ConnectionState = 'connecting';
  private peerValue: RelayPeerState | null = null;
  constructor(options: WsTransportOptions) {
    this.role = options.role;
    const host = options.host ?? globalThis.location?.hostname ?? '127.0.0.1';
    this.url = `ws://${host}:${options.port ?? RELAY_PORT}${RELAY_PATH}?role=${options.role}`;
    this.factory = options.socketFactory ?? ((url) => new WebSocket(url));
    this.scheduler = options.scheduler ?? globalThis;
    this.log = options.log ?? (() => {});
    this.pingInterval = options.pingIntervalMs ?? PING_INTERVAL_MS;
    this.probeTimeout = options.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
    this.visibility = options.visibility ?? globalThis.document;
    this.pages = options.pages ?? globalThis.window;
    this.visibility?.addEventListener('visibilitychange', this.onVisible);
    this.pages?.addEventListener('pageshow', this.onPageShow);
    this.connect();
  }
  /** 현재 연결 상태 */
  get state(): ConnectionState {
    return this.stateValue;
  }
  /** 중계가 마지막으로 알려 준 상대 상태 */
  get peer(): RelayPeerState | null {
    return this.peerValue;
  }
  /** 현재 소켓 번호 */
  get socketNumber(): number {
    return this.socketId;
  }
  private readonly onVisible = () => {
    if (this.visibility?.visibilityState === 'visible') this.resume();
  };
  private readonly onPageShow = () => this.resume();
  private emit(event: ConnectionEvent): void {
    for (const handler of this.connections) {
      try {
        handler(event);
      } catch (error) {
        this.log(`connection handler error ${String(error)}`);
      }
    }
  }
  private clearTimers(): void {
    if (this.retry !== null) this.scheduler.clearTimeout(this.retry);
    if (this.heartbeat !== null) this.scheduler.clearInterval(this.heartbeat);
    if (this.probe !== null) this.scheduler.clearTimeout(this.probe);
    this.retry = null;
    this.heartbeat = null;
    this.probe = null;
  }
  private rawSend(socket: WebSocket, message: Message): void {
    const encoded = tryEncode(message);
    if (!encoded.ok) {
      this.log(`socket#${this.socketId} drop ${message.t} ${encoded.bytes}B`);
      this.emit({ type: 'dropped', socket: this.socketId, t: message.t });
      return;
    }
    try {
      socket.send(encoded.value);
    } catch (error) {
      this.log(`socket#${this.socketId} send error ${String(error)}`);
    }
  }
  private connect(): void {
    if (this.stateValue === 'disposed' || this.stateValue === 'stopped') return;
    this.clearTimers();
    const id = ++this.socketId;
    this.missed = 0;
    this.awaiting = false;
    this.stateValue = 'connecting';
    let socket: WebSocket;
    try {
      socket = this.factory(this.url);
    } catch (error) {
      this.log(`socket#${id} create error ${String(error)}`);
      this.scheduleRetry(id, 1006, 'create failed');
      return;
    }
    this.socket = socket;
    this.log(`socket#${id} connecting ${this.url}`);
    this.emit({ type: 'connecting', socket: id });
    socket.addEventListener('open', () => {
      if (this.socket !== socket || this.stateValue === 'disposed') return;
      this.attempts = 0;
      this.stateValue = 'open';
      this.log(`socket#${id} open`);
      this.emit({ type: 'open', socket: id });
      for (const item of this.pending.splice(0)) this.rawSend(socket, item);
      if (this.role === 'guest') {
        this.heartbeat = this.scheduler.setInterval(() => this.beat(socket, id), this.pingInterval);
      }
    });
    socket.addEventListener('message', (event: MessageEvent) => {
      if (this.socket !== socket || typeof event.data !== 'string') return;
      const raw = event.data;
      // 어떤 프레임이든 받으면 살아 있는 소켓이다.
      this.missed = 0;
      this.awaiting = false;
      if (this.probe !== null) {
        this.scheduler.clearTimeout(this.probe);
        this.probe = null;
      }
      if (isRelayFrame(raw)) {
        const notice = parseRelayNotice(raw);
        if (notice === null) return;
        this.peerValue = notice.peer;
        this.log(`socket#${id} relay peer=${notice.peer}`);
        this.emit({ type: 'peer', socket: id, peer: notice.peer });
        for (const handler of this.relays) handler(notice);
        return;
      }
      for (const handler of this.messages) handler(raw);
    });
    socket.addEventListener('close', (event: CloseEvent) => {
      const stale = this.socket !== socket;
      this.log(`socket#${id} close code=${event.code}${stale ? ' stale' : ''}`);
      if (stale || this.stateValue === 'disposed') return;
      this.socket = null;
      this.peerValue = null;
      this.clearTimers();
      for (const handler of this.closes) handler();
      this.onClosed(id, event.code, event.reason);
    });
    socket.addEventListener('error', () => this.log(`socket#${id} error`));
  }
  private onClosed(id: number, code: number, reason: string): void {
    if (code === RELAY_CLOSE_REPLACED) {
      this.stop(id, 'replaced', code, reason);
      return;
    }
    if (
      code === RELAY_CLOSE_POLICY ||
      code === RELAY_CLOSE_UNSUPPORTED ||
      code === RELAY_CLOSE_TOO_LARGE
    ) {
      // 같은 내용을 다시 보내지 않는다: 닫히기 전 쌓인 대기열을 버린다(세션이 재접속 hello로 다시 맞춘다).
      if (this.pending.length > 0) this.log(`socket#${id} discard ${this.pending.length} queued`);
      this.pending.length = 0;
      if (code === RELAY_CLOSE_POLICY && ++this.policyCloses >= POLICY_LIMIT) {
        this.stop(id, 'policy', code, reason);
        return;
      }
    } else this.policyCloses = 0;
    this.scheduleRetry(id, code, reason);
  }
  private scheduleRetry(id: number, code: number, reason: string): void {
    const delay = Math.min(30_000, 500 * 2 ** Math.min(this.attempts++, 6));
    this.stateValue = 'waiting';
    this.emit({ type: 'close', socket: id, code, reason, retryInMs: delay });
    this.retry = this.scheduler.setTimeout(() => {
      this.retry = null;
      this.connect();
    }, delay);
  }
  private stop(id: number, why: StopReason, code: number, reason: string): void {
    this.stateValue = 'stopped';
    this.pending.length = 0;
    this.log(`socket#${id} stopped (${why})`);
    this.emit({ type: 'close', socket: id, code, reason, retryInMs: null });
    this.emit({ type: 'stopped', socket: id, reason: why });
  }
  private beat(socket: WebSocket, id: number): void {
    if (this.socket !== socket || socket.readyState !== 1) return;
    if (this.awaiting) this.missed++;
    if (this.missed >= MISSED_PINGS) {
      this.log(`socket#${id} pong timeout`);
      this.emit({ type: 'pongTimeout', socket: id });
      this.restart();
      return;
    }
    this.awaiting = true;
    this.rawSend(socket, { t: 'ping' });
  }
  /** 화면 복귀: 닫혀 있으면 곧바로 재접속, 열려 있어 보이면 ping으로 확인 */
  private resume(): void {
    if (this.stateValue === 'disposed' || this.stateValue === 'stopped') return;
    const socket = this.socket;
    if (socket === null || socket.readyState !== 1) {
      this.reconnect();
      return;
    }
    if (this.role !== 'guest' || this.probe !== null) return;
    this.rawSend(socket, { t: 'ping' });
    this.probe = this.scheduler.setTimeout(() => {
      this.probe = null;
      if (this.socket !== socket) return;
      this.log(`socket#${this.socketId} probe timeout`);
      this.emit({ type: 'pongTimeout', socket: this.socketId });
      this.restart();
    }, this.probeTimeout);
  }
  /** 소켓 상태와 무관하게 새 소켓을 연다 (옛 소켓의 사건은 무시된다) */
  private restart(): void {
    const old = this.socket;
    this.socket = null;
    this.connect();
    try {
      old?.close();
    } catch {
      // 이미 닫힌 소켓
    }
  }
  send(message: Message): void {
    if (this.stateValue === 'disposed') return;
    if (this.socket?.readyState === 1) {
      this.rawSend(this.socket, message);
      return;
    }
    if (this.stateValue === 'stopped') return;
    // 재접속 대기 중 hello는 마지막 것 하나만, ping은 쌓지 않는다(리뷰 L-4).
    if (message.t === 'ping') return;
    if (message.t === 'hello') {
      for (let i = this.pending.length - 1; i >= 0; i--)
        if (this.pending[i]!.t === 'hello') this.pending.splice(i, 1);
    }
    this.pending.push(message);
  }
  onMessage(handler: (raw: string) => void): () => void {
    this.messages.add(handler);
    return () => {
      this.messages.delete(handler);
    };
  }
  onClose(handler: () => void): () => void {
    this.closes.add(handler);
    return () => {
      this.closes.delete(handler);
    };
  }
  onRelay(handler: (notice: RelayNotice) => void): () => void {
    this.relays.add(handler);
    return () => {
      this.relays.delete(handler);
    };
  }
  onConnection(handler: (event: ConnectionEvent) => void): () => void {
    this.connections.add(handler);
    return () => {
      this.connections.delete(handler);
    };
  }
  /**
   * 재접속. 멈춘 상태(4001·정책)에서도 사용자 조작으로 다시 시작한다. force면 열린 소켓도 새로 연다.
   * 열린 소켓이 있으면(force 아님) 아무것도 하지 않는다.
   */
  reconnect(force = false): void {
    if (this.stateValue === 'disposed') return;
    if (this.stateValue === 'stopped') {
      this.stateValue = 'waiting';
      this.attempts = 0;
      this.policyCloses = 0;
    }
    if (!force && this.socket?.readyState === 1) return;
    this.restart();
  }
  dispose(): void {
    this.stateValue = 'disposed';
    this.visibility?.removeEventListener('visibilitychange', this.onVisible);
    this.pages?.removeEventListener('pageshow', this.onPageShow);
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
    this.messages.clear();
    this.closes.clear();
    this.relays.clear();
    this.connections.clear();
    this.pending.length = 0;
  }
}
export function createWsTransport(options: WsTransportOptions): WsTransport {
  return new WsTransport(options);
}
