// 세션은 전송 API만 안다. I/O는 브라우저 WebSocket(web src/net) 또는 테스트 전송이 담당한다.
import { tryEncode } from './codec.ts';
import type { SocialMessage } from './social.ts';
import type { Message } from './messages.ts';
import type { RelayNotice, RelayPeerState } from './relay.ts';

export interface Transport {
  /** 보낸다. 상한 초과 등으로 보낼 수 없으면 조용히 버리고 예외를 던지지 않는다 */
  send(message: Message): void;
  /** 열린 연결에만 즉시 송신. 구현이 없으면 대화는 사용할 수 없다. */
  sendEphemeral?(message: SocialMessage): boolean;
  /** 프로토콜 메시지(중계 알림 제외) 수신 */
  onMessage(handler: (raw: string) => void): () => void;
  onClose(handler: () => void): () => void;
  reconnect(): void;
  /** 중계 알림(상대 present·absent·joined·left). 이 기능이 있는 전송만 구현한다 */
  onRelay?(handler: (notice: RelayNotice) => void): () => void;
}

// ---- 동기 메모리 전송: 보내면 즉시 상대 핸들러를 부른다 (단위 테스트) ----

export interface MemoryTransport extends Transport {
  disconnect(): void;
  readonly sent: readonly Message[];
}
interface InternalTransport extends MemoryTransport {
  readonly connected: boolean;
  readonly messages: Set<(raw: string) => void>;
  setPeer(value: InternalTransport): void;
}
function make(): InternalTransport {
  const messages = new Set<(raw: string) => void>();
  const closes = new Set<() => void>();
  const sent: Message[] = [];
  let connected = true;
  let peer: InternalTransport | null = null;
  return {
    get sent() {
      return sent;
    },
    send(message: Message) {
      if (message.t === 'social' || message.t === 'socialReady') {
        const encoded = tryEncode(message);
        if (encoded.ok && connected && peer?.connected)
          for (const handler of peer.messages) handler(encoded.value);
        return;
      }
      sent.push(message);
      const encoded = tryEncode(message);
      if (encoded.ok && connected && peer?.connected)
        for (const handler of peer.messages) handler(encoded.value);
    },
    sendEphemeral(message: SocialMessage) {
      const encoded = tryEncode(message);
      if (!encoded.ok || !connected || !peer?.connected) return false;
      for (const handler of peer.messages) handler(encoded.value);
      return true;
    },
    onMessage(handler: (raw: string) => void) {
      messages.add(handler);
      return () => {
        messages.delete(handler);
      };
    },
    onClose(handler: () => void) {
      closes.add(handler);
      return () => {
        closes.delete(handler);
      };
    },
    reconnect() {
      connected = true;
    },
    disconnect() {
      connected = false;
      for (const handler of closes) handler();
    },
    get connected() {
      return connected;
    },
    messages,
    setPeer(value: InternalTransport) {
      peer = value;
    },
  };
}
export function createMemoryTransportPair(): readonly [MemoryTransport, MemoryTransport] {
  const a = make();
  const b = make();
  a.setPeer(b);
  b.setPeer(a);
  return [a, b];
}

// ---- 대기열 전송: 프레임을 쌓아 두고 테스트가 배달·유실·중복·순서 바꿈을 고른다 (#13 상태 기계 테스트) ----

export interface QueuedFrame {
  /** 받는 쪽 (0 = 첫 번째 전송, 1 = 두 번째) */
  readonly to: 0 | 1;
  readonly raw: string;
}
export interface QueuedLink {
  /** 배달 대기 중인 프레임 (보낸 순서). 테스트가 직접 들여다본다 */
  readonly queue: readonly QueuedFrame[];
  /** queue[index]를 배달한다. 핸들러가 새로 보낸 프레임은 뒤에 쌓인다 */
  deliver(index?: number): boolean;
  drop(index?: number): void;
  duplicate(index?: number): void;
  /** queue[index]를 맨 뒤로 보낸다 (순서 바뀜) */
  defer(index?: number): void;
  /** 대기열이 빌 때까지 순서대로 배달한다. 배달한 개수 */
  flush(limit?: number): number;
  /** 중계 알림을 흉내 낸다 */
  notify(to: 0 | 1, peer: RelayPeerState): void;
  /** 임의 프레임을 대기열 끝에 넣는다 (위조·조작 시나리오) */
  inject(to: 0 | 1, raw: string): void;
}
export interface QueuedTransport extends Transport {
  readonly side: 0 | 1;
  /** 상한 초과로 보내지 못한 메시지 (전송은 예외를 던지지 않는다) */
  readonly dropped: readonly Message[];
  /** 끊김을 흉내 낸다: 대기 중인 이 쪽 방향 프레임을 버리고 onClose를 부른다 */
  disconnect(): void;
  /** 프로세스 종료를 흉내 낸다: 이 쪽 핸들러를 모두 떼고 대기 프레임을 버린다(같은 전송에 새 세션을 붙인다) */
  reset(): void;
}
function subscribe<T>(set: Set<T>): (handler: T) => () => void {
  return (handler: T) => {
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  };
}
export function createQueuedTransportPair(): readonly [
  QueuedTransport,
  QueuedTransport,
  QueuedLink,
] {
  const queue: QueuedFrame[] = [];
  const handlers = [new Set<(raw: string) => void>(), new Set<(raw: string) => void>()] as const;
  const closes = [new Set<() => void>(), new Set<() => void>()] as const;
  const relays = [
    new Set<(notice: RelayNotice) => void>(),
    new Set<(notice: RelayNotice) => void>(),
  ] as const;
  const connected = [true, true];
  const side = (index: 0 | 1): QueuedTransport => {
    const dropped: Message[] = [];
    const peer: 0 | 1 = index === 0 ? 1 : 0;
    return {
      side: index,
      dropped,
      send(message: Message) {
        const encoded = tryEncode(message);
        if (message.t === 'social' || message.t === 'socialReady') {
          if (connected[index] && connected[peer] && encoded.ok)
            queue.push({ to: peer, raw: encoded.value });
          return;
        }
        if (encoded.ok) queue.push({ to: peer, raw: encoded.value });
        else dropped.push(message);
      },
      sendEphemeral(message: SocialMessage) {
        const encoded = tryEncode(message);
        if (!connected[index] || !connected[peer] || !encoded.ok) return false;
        queue.push({ to: peer, raw: encoded.value });
        return true;
      },
      onMessage: subscribe(handlers[index]),
      onClose: subscribe(closes[index]),
      onRelay: subscribe(relays[index]),
      reconnect() {
        connected[index] = true;
      },
      disconnect() {
        connected[index] = false;
        for (let i = queue.length - 1; i >= 0; i--)
          if (queue[i]!.to === index || queue[i]!.to === peer) queue.splice(i, 1);
        for (const handler of closes[index]) handler();
      },
      reset() {
        connected[index] = false;
        for (let i = queue.length - 1; i >= 0; i--)
          if (queue[i]!.to === index || queue[i]!.to === peer) queue.splice(i, 1);
        handlers[index].clear();
        closes[index].clear();
        relays[index].clear();
      },
    };
  };
  const at = (index: number) => (index < 0 ? queue.length + index : index);
  const link: QueuedLink = {
    queue,
    deliver(index = 0) {
      const [frame] = queue.splice(at(index), 1);
      if (!frame) return false;
      for (const handler of handlers[frame.to]) handler(frame.raw);
      return true;
    },
    drop(index = 0) {
      queue.splice(at(index), 1);
    },
    duplicate(index = 0) {
      const frame = queue[at(index)];
      if (frame) queue.splice(at(index) + 1, 0, frame);
    },
    defer(index = 0) {
      const [frame] = queue.splice(at(index), 1);
      if (frame) queue.push(frame);
    },
    flush(limit = 100_000) {
      let n = 0;
      while (queue.length > 0 && n < limit) {
        link.deliver(0);
        n++;
      }
      return n;
    },
    notify(to, peer) {
      for (const handler of relays[to]) handler({ t: 'relay', peer });
    },
    inject(to, raw) {
      queue.push({ to, raw });
    },
  };
  return [side(0), side(1), link];
}
