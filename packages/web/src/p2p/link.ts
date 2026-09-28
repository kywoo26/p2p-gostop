// 세션이 쓰는 전송 (NP-01·NP-05, NF-04·NF-05). WsTransport 하나를 감싸 세션에는 늘 같은 Transport로 보인다.
// - 중계 알림 `{"t":"relay","peer":…}`(Android 중계·relay-dev)을 게임 메시지에서 걸러 onRelay로 알린다.
// - 연결 상태(connecting/open/closed/replaced)를 onState로 알린다. 같은 역할의 새 연결이 이 연결을 교체하면(4001)
//   자동 재접속하지 않는다(두 탭이 서로를 계속 밀어내지 않게, 이슈 #15). 사용자가 reconnect()로 되찾는다.
// - 게스트는 60초 동안 호스트에게서 아무것도 받지 못하면(25초 ping의 pong도 없으면) 소켓을 새로 연다(NP-05).
// WsTransport(src/net)가 연결 이벤트를 직접 내게 되면(fix/protocol-review) 로그 줄 해석을 그 이벤트로 바꾼다.
import type { Message, Role, Transport } from '@p2p-gostop/protocol';
import { WsTransport } from '../net/index.ts';
import { relayAddress, type RelayAddress } from './role.ts';

export type RelayPeer = 'absent' | 'present' | 'joined' | 'left';
export type LinkState = 'connecting' | 'open' | 'closed' | 'replaced';

/** 같은 역할의 새 연결에 자리를 넘길 때 중계가 쓰는 닫기 코드 (Android RelayRoles) */
const CLOSE_REPLACED = 4001;
/** 호스트 무응답 판정 (NP-05) */
const SILENCE_MS = 60_000;

const PEERS: readonly string[] = ['absent', 'present', 'joined', 'left'];

/** 중계 알림이면 상대 상태, 아니면 null */
export function parseRelayNotice(raw: string): RelayPeer | null {
  if (raw.length > 64 || !raw.includes('"relay"')) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { t, peer } = value as { t?: unknown; peer?: unknown };
    return t === 'relay' && typeof peer === 'string' && PEERS.includes(peer)
      ? (peer as RelayPeer)
      : null;
  } catch {
    return null;
  }
}

/** WsTransport 로그 줄 → 연결 상태 (오래된 소켓의 닫힘은 무시) */
export function stateFromLog(line: string): { state: LinkState; code?: number } | null {
  if (/^socket#\d+ connecting /.test(line)) return { state: 'connecting' };
  if (/^socket#\d+ open$/.test(line)) return { state: 'open' };
  const close = line.match(/^socket#\d+ close code=(\d+)(?! stale)$/);
  if (close?.[1] !== undefined) {
    const code = Number(close[1]);
    return { state: code === CLOSE_REPLACED ? 'replaced' : 'closed', code };
  }
  return null;
}

export interface LinkOptions {
  readonly role: Role;
  readonly address?: RelayAddress;
  readonly log?: (line: string) => void;
  /** 테스트용: 실제 WebSocket 대신 */
  readonly transportFactory?: (options: {
    role: Role;
    host: string;
    port: number;
    log: (line: string) => void;
  }) => Transport & { dispose(): void };
  readonly now?: () => number;
}

export class Link implements Transport {
  state: LinkState = 'connecting';
  lastMessageAt: number;
  private inner: (Transport & { dispose(): void }) | null = null;
  private readonly options: LinkOptions;
  private readonly now: () => number;
  private readonly messages = new Set<(raw: string) => void>();
  private readonly closes = new Set<() => void>();
  private readonly relays = new Set<(peer: RelayPeer) => void>();
  private readonly states = new Set<(state: LinkState) => void>();
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(options: LinkOptions) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
    this.lastMessageAt = this.now();
    this.open();
    if (options.role === 'guest') {
      this.watchdog = setInterval(() => this.checkSilence(), 15_000);
    }
  }

  private open(): void {
    const address = this.options.address ?? relayAddress();
    // WsTransport는 생성자 안에서 곧바로 "connecting"을 적는다: 아직 transport가 없을 때는 상태를 바꾸지 않는다
    let created: (Transport & { dispose(): void }) | null = null;
    const log = (line: string) => {
      this.options.log?.(line);
      const next = stateFromLog(line);
      if (next !== null && created !== null && this.inner === created) this.setState(next.state);
    };
    const factory =
      this.options.transportFactory ??
      ((o: { role: Role; host: string; port: number; log: (line: string) => void }) =>
        new WsTransport(o));
    const transport = factory({
      role: this.options.role,
      host: address.host,
      port: address.port,
      log,
    });
    created = transport;
    this.inner = transport;
    this.lastMessageAt = this.now();
    transport.onMessage((raw) => {
      if (this.inner !== transport) return;
      this.lastMessageAt = this.now();
      const peer = parseRelayNotice(raw);
      if (peer !== null) {
        for (const handler of this.relays) handler(peer);
        return;
      }
      for (const handler of this.messages) handler(raw);
    });
    transport.onClose(() => {
      if (this.inner !== transport) return;
      for (const handler of this.closes) handler();
    });
  }

  private setState(state: LinkState): void {
    if (state === this.state) return;
    this.state = state;
    if (state === 'open') this.lastMessageAt = this.now();
    if (state === 'replaced') {
      // 다른 창·기기가 같은 역할을 가져갔다: 자동 재접속을 멈춘다
      this.inner?.dispose();
    }
    for (const handler of this.states) handler(state);
  }

  private checkSilence(): void {
    if (this.disposed || this.state !== 'open') return;
    if (this.now() - this.lastMessageAt >= SILENCE_MS) {
      this.options.log?.(`link: ${SILENCE_MS / 1000}초 무응답 → 새 소켓`);
      this.restart();
    }
  }

  send(message: Message): void {
    if (!this.disposed && this.state !== 'replaced') this.inner?.send(message);
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

  onRelay(handler: (peer: RelayPeer) => void): () => void {
    this.relays.add(handler);
    return () => {
      this.relays.delete(handler);
    };
  }

  onState(handler: (state: LinkState) => void): () => void {
    this.states.add(handler);
    return () => {
      this.states.delete(handler);
    };
  }

  /** 끊겼으면 바로 다시 붙는다. 교체(4001)된 뒤라면 새 소켓을 연다(사용자가 "다시 연결"을 눌렀을 때) */
  reconnect(): void {
    if (this.disposed) return;
    if (this.state === 'replaced') this.restart();
    else this.inner?.reconnect();
  }

  /** 소켓을 버리고 새로 연다 (무응답·교체 복구) */
  restart(): void {
    if (this.disposed) return;
    const old = this.inner;
    this.inner = null;
    old?.dispose();
    this.setState('connecting');
    this.open();
    for (const handler of this.closes) handler();
  }

  dispose(): void {
    this.disposed = true;
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.inner?.dispose();
    this.inner = null;
    this.messages.clear();
    this.closes.clear();
    this.relays.clear();
    this.states.clear();
  }
}
