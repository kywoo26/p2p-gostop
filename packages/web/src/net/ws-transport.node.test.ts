import { afterEach, describe, expect, it, vi } from 'vitest';
import { WsTransport } from './index.ts';

class FakeSocket extends EventTarget {
  readonly url: string;
  readyState = 0;
  readonly sent: string[] = [];
  constructor(url: string) {
    super();
    this.url = url;
  }
  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  receive(data: string): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close', { code: 1000 }));
  }
  send(data: string): void {
    this.sent.push(data);
  }
}
const sockets: FakeSocket[] = [];
const factory = (url: string) => {
  const socket = new FakeSocket(url);
  sockets.push(socket);
  return socket as unknown as WebSocket;
};
afterEach(() => {
  vi.useRealTimers();
  sockets.length = 0;
});
describe('WsTransport (Node fake WebSocket)', () => {
  it('25초 ping, 수신, 큐 flush와 500/1000ms 재시도', () => {
    vi.useFakeTimers();
    const logs: string[] = [];
    const transport = new WsTransport({
      role: 'guest',
      host: '192.168.49.1',
      socketFactory: factory,
      log: (line) => logs.push(line),
    });
    expect(sockets[0]?.url).toBe('ws://192.168.49.1:17777/ws?role=guest');
    transport.send({ t: 'ping' });
    sockets[0]!.open();
    expect(sockets[0]!.sent).toEqual(['{"t":"ping"}']);
    const incoming: string[] = [];
    transport.onMessage((raw) => incoming.push(raw));
    sockets[0]!.receive('{"t":"pong"}');
    expect(incoming).toEqual(['{"t":"pong"}']);
    vi.advanceTimersByTime(25_000);
    expect(sockets[0]!.sent).toHaveLength(2);
    sockets[0]!.close();
    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1]!.close();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(3);
    expect(logs.some((line) => line.includes('socket#2 close'))).toBe(true);
    transport.dispose();
  });
  it('visibilitychange/pageshow 재접속, 오래된 socket close 구별', () => {
    vi.useFakeTimers();
    const visibility = new EventTarget() as EventTarget & { visibilityState: 'visible' | 'hidden' };
    visibility.visibilityState = 'hidden';
    const pages = new EventTarget();
    const logs: string[] = [];
    const transport = new WsTransport({
      role: 'host',
      host: '127.0.0.1',
      socketFactory: factory,
      visibility: visibility as Document,
      pages: pages as Window,
      log: (line) => logs.push(line),
    });
    visibility.visibilityState = 'visible';
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(sockets).toHaveLength(2);
    expect(logs.some((line) => line.includes('socket#1 close') && line.includes('stale'))).toBe(
      true,
    );
    sockets[1]!.open();
    pages.dispatchEvent(new Event('pageshow'));
    expect(sockets).toHaveLength(2);
    transport.dispose();
  });
});
