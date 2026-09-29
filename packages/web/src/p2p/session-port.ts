import type { Message, RelayNotice, Transport } from '@p2p-gostop/protocol';

/** 한 HostSession이 쓰는 전송 창구. 세션을 다시 만들면 새 창구로 바꾸고 옛 처리기는 버린다 */
export class SessionPort implements Transport {
  readonly messages = new Set<(raw: string) => void>();
  readonly closes = new Set<() => void>();
  readonly relays = new Set<(notice: RelayNotice) => void>();
  private readonly out: (message: Message) => void;
  private readonly again: () => void;
  constructor(out: (message: Message) => void, reconnect: () => void) {
    this.out = out;
    this.again = reconnect;
  }
  send(message: Message): void {
    this.out(message);
  }
  onMessage(handler: (raw: string) => void): () => void {
    this.messages.add(handler);
    return () => this.messages.delete(handler);
  }
  onClose(handler: () => void): () => void {
    this.closes.add(handler);
    return () => this.closes.delete(handler);
  }
  onRelay(handler: (notice: RelayNotice) => void): () => void {
    this.relays.add(handler);
    return () => this.relays.delete(handler);
  }
  reconnect(): void {
    this.again();
  }
}
