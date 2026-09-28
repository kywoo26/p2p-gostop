// 세션은 전송 API만 안다. I/O는 브라우저 WebSocket 또는 테스트 전송이 담당한다.
import { encode, type Message } from './index.ts';
export interface Transport {
  send(message: Message): void;
  onMessage(handler: (raw: string) => void): () => void;
  onClose(handler: () => void): () => void;
  reconnect(): void;
}
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
      sent.push(message);
      if (connected && peer?.connected)
        for (const handler of peer.messages) handler(encode(message));
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
