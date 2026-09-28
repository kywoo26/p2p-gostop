// NP-01·NP-05: 브라우저 WebSocket 전송. 세션 메시지의 해석은 protocol이 맡는다.
import {
  encode,
  RELAY_PATH,
  RELAY_PORT,
  type Message,
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
}
export class WsTransport implements Transport {
  readonly url: string;
  private readonly role: Role;
  private readonly factory: SocketFactory;
  private readonly scheduler: Scheduler;
  private readonly log: (line: string) => void;
  private readonly visibility: WsTransportOptions['visibility'];
  private readonly pages: WsTransportOptions['pages'];
  private readonly messages = new Set<(raw: string) => void>();
  private readonly closes = new Set<() => void>();
  private readonly pending: Message[] = [];
  private socket: WebSocket | null = null;
  private socketId = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;
  private disposed = false;
  constructor(options: WsTransportOptions) {
    this.role = options.role;
    const host = options.host ?? globalThis.location?.hostname ?? '127.0.0.1';
    this.url = `ws://${host}:${options.port ?? RELAY_PORT}${RELAY_PATH}?role=${options.role}`;
    this.factory = options.socketFactory ?? ((url) => new WebSocket(url));
    this.scheduler = options.scheduler ?? globalThis;
    this.log = options.log ?? (() => {});
    this.visibility = options.visibility ?? globalThis.document;
    this.pages = options.pages ?? globalThis.window;
    this.visibility?.addEventListener('visibilitychange', this.onVisible);
    this.pages?.addEventListener('pageshow', this.onPageShow);
    this.connect();
  }
  private readonly onVisible = () => {
    if (this.visibility?.visibilityState === 'visible') this.reconnect();
  };
  private readonly onPageShow = () => this.reconnect();
  private connect(): void {
    if (this.disposed) return;
    if (this.retry !== null) {
      this.scheduler.clearTimeout(this.retry);
      this.retry = null;
    }
    const id = ++this.socketId;
    const socket = this.factory(this.url);
    this.socket = socket;
    this.log(`socket#${id} connecting ${this.url}`);
    socket.addEventListener('open', () => {
      if (this.socket !== socket || this.disposed) return;
      this.attempts = 0;
      this.log(`socket#${id} open`);
      for (const item of this.pending.splice(0)) socket.send(encode(item));
      if (this.role === 'guest') {
        if (this.heartbeat !== null) this.scheduler.clearInterval(this.heartbeat);
        this.heartbeat = this.scheduler.setInterval(() => {
          if (this.socket === socket && socket.readyState === 1) socket.send(encode({ t: 'ping' }));
        }, 25_000);
      }
    });
    socket.addEventListener('message', (event: MessageEvent) => {
      if (this.socket !== socket || typeof event.data !== 'string') return;
      for (const handler of this.messages) handler(event.data);
    });
    socket.addEventListener('close', (event: CloseEvent) => {
      this.log(`socket#${id} close code=${event.code}${this.socket === socket ? '' : ' stale'}`);
      if (this.socket !== socket || this.disposed) return;
      this.socket = null;
      if (this.heartbeat !== null) {
        this.scheduler.clearInterval(this.heartbeat);
        this.heartbeat = null;
      }
      for (const handler of this.closes) handler();
      const delay = Math.min(30_000, 500 * 2 ** Math.min(this.attempts++, 6));
      this.retry = this.scheduler.setTimeout(() => {
        this.retry = null;
        this.connect();
      }, delay);
    });
    socket.addEventListener('error', () => this.log(`socket#${id} error`));
  }
  send(message: Message): void {
    if (this.disposed) return;
    if (this.socket?.readyState === 1) this.socket.send(encode(message));
    else this.pending.push(message);
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
  reconnect(): void {
    if (this.disposed || this.socket?.readyState === 1) return;
    const old = this.socket;
    this.connect();
    old?.close();
  }
  dispose(): void {
    this.disposed = true;
    this.visibility?.removeEventListener('visibilitychange', this.onVisible);
    this.pages?.removeEventListener('pageshow', this.onPageShow);
    if (this.retry !== null) this.scheduler.clearTimeout(this.retry);
    if (this.heartbeat !== null) this.scheduler.clearInterval(this.heartbeat);
    this.socket?.close();
    this.messages.clear();
    this.closes.clear();
    this.pending.length = 0;
  }
}
export function createWsTransport(options: WsTransportOptions): WsTransport {
  return new WsTransport(options);
}
