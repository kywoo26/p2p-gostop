// WsTransport: 가짜 WebSocket으로 재접속 정책·중계 알림·pong 감시를 검사하고(#24),
// Android 중계 규칙을 흉내 낸 가짜 중계 위에서 HostSession·GuestSession을 실제로 붙여 본다(리뷰 T-6).
// Node(test:net)와 브라우저 모드(Chromium·WebKit) 양쪽에서 돈다: DOM 표준 EventTarget·CloseEvent만 쓴다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESETS } from '@p2p-gostop/engine';
import { GuestSession, HostSession } from '@p2p-gostop/protocol';
import { WsTransport, type ConnectionEvent } from './index.ts';

class FakeSocket extends EventTarget {
  readonly url: string;
  readyState = 0;
  readonly sent: string[] = [];
  onSend: ((data: string) => void) | null = null;
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
  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close', { code, reason }));
  }
  send(data: string): void {
    this.sent.push(data);
    this.onSend?.(data);
  }
}
const sockets: FakeSocket[] = [];
const factory = (url: string) => {
  const socket = new FakeSocket(url);
  sockets.push(socket);
  return socket as unknown as WebSocket;
};
const last = () => sockets.at(-1)!;
const noDom = { visibility: new EventTarget() as Document, pages: new EventTarget() as Window };
afterEach(() => {
  vi.useRealTimers();
  sockets.length = 0;
});

describe('WsTransport (가짜 WebSocket)', () => {
  it('25초 ping, 수신, 큐 flush와 500/1000ms 재시도', () => {
    vi.useFakeTimers();
    const logs: string[] = [];
    const transport = new WsTransport({
      role: 'guest',
      host: '192.168.49.1',
      socketFactory: factory,
      log: (line) => logs.push(line),
      ...noDom,
    });
    expect(sockets[0]?.url).toBe('ws://192.168.49.1:17777/ws?role=guest');
    transport.send({ t: 'log', entries: ['a'] });
    sockets[0]!.open();
    expect(sockets[0]!.sent).toEqual(['{"t":"log","entries":["a"]}']);
    const incoming: string[] = [];
    transport.onMessage((raw) => incoming.push(raw));
    sockets[0]!.receive('{"t":"pong"}');
    expect(incoming).toEqual(['{"t":"pong"}']);
    vi.advanceTimersByTime(25_000);
    expect(sockets[0]!.sent).toEqual(['{"t":"log","entries":["a"]}', '{"t":"ping"}']);
    sockets[0]!.close(1006);
    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1]!.close(1006);
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
    // CONNECTING 중 복귀는 소켓을 교체하지 않는다. 첫 연결을 기다린다.
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    pages.dispatchEvent(new Event('pageshow'));
    expect(sockets).toHaveLength(1);
    expect(logs.some((line) => line.includes('socket#1 close'))).toBe(false);
    transport.dispose();
  });

  it('중계 알림(두 형식)은 세션 메시지로 넘기지 않고 onRelay·onConnection으로 알린다', () => {
    const transport = new WsTransport({ role: 'host', socketFactory: factory, ...noDom });
    const incoming: string[] = [];
    const notices: string[] = [];
    const events: ConnectionEvent[] = [];
    transport.onMessage((raw) => incoming.push(raw));
    transport.onRelay((n) => notices.push(n.peer));
    transport.onConnection((e) => events.push(e));
    sockets[0]!.open();
    sockets[0]!.receive('{"t":"relay","peer":"absent"}');
    sockets[0]!.receive('{"type":"relay","peer":"joined"}');
    sockets[0]!.receive('{"t":"relay","peer":"bogus"}');
    sockets[0]!.receive('{"t":"pong"}');
    expect(incoming).toEqual(['{"t":"pong"}']);
    expect(notices).toEqual(['absent', 'joined']);
    expect(transport.peer).toBe('joined');
    expect(events).toContainEqual({ type: 'open', socket: 1 });
    expect(events).toContainEqual({ type: 'peer', socket: 1, peer: 'joined' });
    transport.dispose();
  });

  it('4001(교체됨)이면 자동 재접속하지 않고 멈춘다. 사용자 reconnect()로만 다시 연다', () => {
    vi.useFakeTimers();
    const transport = new WsTransport({ role: 'guest', socketFactory: factory, ...noDom });
    const events: ConnectionEvent[] = [];
    transport.onConnection((e) => events.push(e));
    sockets[0]!.open();
    sockets[0]!.close(4001, 'replaced');
    expect(transport.state).toBe('stopped');
    expect(events).toContainEqual({ type: 'stopped', socket: 1, reason: 'replaced' });
    vi.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(1);
    // 화면 복귀도 멈춘 전송을 되살리지 않는다(두 탭이 서로 밀어내는 진동 방지)
    noDom.pages.dispatchEvent(new Event('pageshow'));
    transport.send({ t: 'ping' });
    expect(sockets).toHaveLength(1);
    transport.reconnect();
    expect(sockets).toHaveLength(2);
    expect(transport.state).toBe('connecting');
    transport.dispose();
  });

  it('1003·1009면 대기열을 버리고(같은 내용 재전송 금지) 재접속, 1008이 3번 이어지면 멈춘다', () => {
    vi.useFakeTimers();
    const transport = new WsTransport({ role: 'guest', socketFactory: factory, ...noDom });
    transport.send({ t: 'hello', v: 2, name: '가' });
    transport.send({ t: 'hello', v: 2, name: '나' }); // hello는 마지막 것 하나만 대기
    sockets[0]!.close(1009);
    vi.advanceTimersByTime(500);
    last().open();
    expect(last().sent).toEqual([]);
    transport.send({ t: 'log', entries: ['x'] });
    expect(last().sent).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      last().close(1008);
      vi.advanceTimersByTime(60_000);
    }
    expect(transport.state).toBe('stopped');
    const count = sockets.length;
    vi.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(count);
    transport.dispose();
  });

  it('대기열의 hello는 하나로 합친다 (리뷰 L-4)', () => {
    const transport = new WsTransport({ role: 'guest', socketFactory: factory, ...noDom });
    transport.send({ t: 'hello', v: 2, name: '가' });
    transport.send({ t: 'log', entries: ['x'] });
    transport.send({ t: 'hello', v: 2, name: '나', lastSeq: 3 });
    transport.send({ t: 'ping' });
    sockets[0]!.open();
    expect(sockets[0]!.sent.map((s) => (JSON.parse(s) as { t: string }).t)).toEqual([
      'log',
      'hello',
    ]);
    expect(sockets[0]!.sent[1]).toContain('"lastSeq":3');
    transport.dispose();
  });

  it('pong 시간 초과: 받은 프레임 없이 ping 두 번이 지나면 열린 소켓이라도 새로 연다', () => {
    vi.useFakeTimers();
    const transport = new WsTransport({ role: 'guest', socketFactory: factory, ...noDom });
    const events: ConnectionEvent[] = [];
    transport.onConnection((e) => events.push(e));
    sockets[0]!.open();
    vi.advanceTimersByTime(25_000); // ping 1
    sockets[0]!.receive('{"t":"pong"}');
    vi.advanceTimersByTime(25_000); // ping 2 (응답 있음)
    vi.advanceTimersByTime(25_000); // 응답 없음 1
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(25_000); // 응답 없음 2 → 새 소켓
    expect(sockets).toHaveLength(2);
    expect(events).toContainEqual({ type: 'pongTimeout', socket: 1 });
    expect(transport.socketNumber).toBe(2);
    transport.dispose();
  });

  it('화면 복귀 때 열린 소켓은 ping으로 확인하고 4초 안에 응답이 없으면 새로 연다 (NF-05)', () => {
    vi.useFakeTimers();
    const visibility = new EventTarget() as EventTarget & { visibilityState: 'visible' | 'hidden' };
    visibility.visibilityState = 'visible';
    const transport = new WsTransport({
      role: 'guest',
      socketFactory: factory,
      visibility: visibility as Document,
      pages: new EventTarget() as Window,
    });
    sockets[0]!.open();
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(sockets[0]!.sent).toEqual(['{"t":"ping"}']);
    sockets[0]!.receive('{"t":"pong"}');
    vi.advanceTimersByTime(5_000);
    expect(sockets).toHaveLength(1);
    visibility.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(4_000);
    expect(sockets).toHaveLength(2);
    transport.dispose();
  });
});

/** Android RelayRoles를 흉내 낸 가짜 중계: 최신 우선 4001, 알림 present·absent·joined·left, relay 모양 프레임 차단 */
class FakeRelay {
  private readonly roles: Partial<Record<'host' | 'guest', FakeSocket>> = {};
  readonly factory = (url: string) => {
    const role = new URL(url).searchParams.get('role') as 'host' | 'guest';
    const socket = new FakeSocket(url);
    socket.onSend = (data) => this.forward(role, socket, data);
    setTimeout(() => this.join(role, socket), 0);
    return socket as unknown as WebSocket;
  };
  private notice(socket: FakeSocket | undefined, peer: string): void {
    if (socket?.readyState === 1) socket.receive(`{"t":"relay","peer":"${peer}"}`);
  }
  private join(role: 'host' | 'guest', socket: FakeSocket): void {
    if (socket.readyState !== 0) return;
    const old = this.roles[role];
    this.roles[role] = socket;
    old?.close(4001, 'replaced');
    socket.open();
    const peer = this.roles[role === 'host' ? 'guest' : 'host'];
    this.notice(socket, peer ? 'present' : 'absent');
    this.notice(peer, 'joined');
    socket.addEventListener('close', () => {
      if (this.roles[role] !== socket) return;
      delete this.roles[role];
      this.notice(this.roles[role === 'host' ? 'guest' : 'host'], 'left');
    });
  }
  private readonly dead = new Set<FakeSocket>();
  private forward(role: 'host' | 'guest', socket: FakeSocket, data: string): void {
    if (this.roles[role] !== socket || this.dead.has(socket) || data.includes('"relay"')) return;
    const target = this.roles[role === 'host' ? 'guest' : 'host'];
    if (target?.readyState === 1 && !this.dead.has(target))
      queueMicrotask(() => target.receive(data));
  }
  /** 소켓이 조용히 죽는다(열린 것처럼 보이지만 아무것도 오가지 않음) */
  silence(role: 'host' | 'guest'): void {
    const socket = this.roles[role];
    if (socket) this.dead.add(socket);
  }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400 && !check(); i++) await settle();
  if (!check()) throw new Error(`시간 초과: ${what}`);
}

describe('WsTransport + 가짜 Android 중계 + 세션', () => {
  it('판 진행 중 게스트 탭 교체(4001)·죽은 소켓 복귀를 거쳐 판을 끝내고 검증한다', async () => {
    const relay = new FakeRelay();
    const random = (start: number) => {
      let n = start;
      return () => Uint8Array.from({ length: 32 }, (_, i) => (++n * 17 + i) & 255);
    };
    const hostWire = new WsTransport({ role: 'host', socketFactory: relay.factory, ...noDom });
    const host = new HostSession(hostWire, {
      rules: PRESETS.standard,
      names: ['호스트', '게스트'],
      random32: random(0),
    });
    const tabs: WsTransport[] = [];
    const openGuest = (restore?: ReturnType<GuestSession['toJSON']>) => {
      const wire = new WsTransport({
        role: 'guest',
        host: '192.168.49.1',
        socketFactory: relay.factory,
        probeTimeoutMs: 20,
        ...noDom,
      });
      tabs.push(wire);
      return new GuestSession(wire, {
        name: '게스트',
        random32: random(1000 + tabs.length * 1000),
        ...(restore ? { restore } : {}),
      });
    };
    let guest = openGuest();
    try {
      await until(() => host.stage === 'playing' && guest.view !== null, '첫 판 분배');
      let moves = 0;
      while (host.stage === 'playing' && moves++ < 300) {
        await until(() => guest.seq === host.seq, '동기화');
        if (moves === 6) {
          // 같은 게스트가 새 탭을 연다: 옛 탭은 4001로 멈추고 새 탭이 저장본으로 이어 간다
          const saved = guest.toJSON();
          guest = openGuest(saved);
          await until(() => tabs[0]!.state === 'stopped', '옛 탭 멈춤');
          await until(() => guest.seq === host.seq && guest.view !== null, '새 탭 동기화');
          continue;
        }
        if (moves === 12) {
          // 잠금 복귀: 소켓이 열린 채 죽어 있다 → 확인 ping에 응답이 없으면 새 소켓
          relay.silence('guest');
          tabs.at(-1)!.reconnect(); // 열린 소켓이면 아무것도 하지 않는다
          (noDom.pages as EventTarget).dispatchEvent(new Event('pageshow'));
          await until(() => tabs.at(-1)!.socketNumber === 2, '새 소켓');
          await until(() => guest.seq === host.seq, '복귀 동기화');
          continue;
        }
        const mine = host.hostView()!.legal;
        if (mine.length > 0) host.apply(mine[moves % mine.length]!);
        else {
          const theirs = guest.view!.legal;
          const before = host.state;
          guest.sendAction(theirs[moves % theirs.length]!);
          await until(() => host.state !== before, '게스트 액션');
        }
      }
      expect(host.stage).not.toBe('playing');
      await until(() => guest.checks.length > 0, 'revealHost');
      expect(guest.checks.at(-1)).toEqual({
        round: 1,
        result: 'verified',
        publicTargets: { result: 'unverifiable', reason: 'gap' },
      });
      expect(tabs[0]!.state).toBe('stopped');
      expect(guest.errors.filter((e) => e !== 'STALE_SEQ')).toEqual([]);
    } finally {
      hostWire.dispose();
      for (const tab of tabs) tab.dispose();
    }
  }, 30_000);
});

// NP-SC-01: offline 대화는 게임 pending·ping/probe 응답에 섞이지 않는다.
describe('사회표현 immediate-only 전송', () => {
  const social = { t: 'socialReady', epoch: 'epoch', receiveNonce: 'a'.repeat(32) } as const;
  it('connecting/closed social은 queue0, 열린 연결의 immediate send만 true', () => {
    vi.useFakeTimers();
    const transport = new WsTransport({ role: 'host', socketFactory: factory, ...noDom });
    expect(transport.sendEphemeral(social)).toBe(false);
    transport.send(social);
    last().open();
    expect(last().sent).toEqual([]);
    expect(transport.sendEphemeral(social)).toBe(true);
    expect(last().sent).toHaveLength(1);
    last().close(1006);
    expect(transport.sendEphemeral(social)).toBe(false);
    vi.advanceTimersByTime(500);
    last().open();
    expect(last().sent).toEqual([]);
    transport.dispose();
  });
  it('public socket 인증 완료 전 social send는 false, 인증 후만 true', () => {
    vi.useFakeTimers();
    const transport = new WsTransport({
      role: 'host',
      authToken: 'x'.repeat(43),
      socketFactory: factory,
      ...noDom,
    });
    last().open();
    expect(transport.sendEphemeral(social)).toBe(false);
    last().receive('{"t":"relay","peer":"present"}');
    expect(transport.sendEphemeral(social)).toBe(true);
    transport.dispose();
  });
  it('사회표현 수신은 ping 미응답 감시를 해제하지 않는다', () => {
    vi.useFakeTimers();
    const transport = new WsTransport({ role: 'guest', socketFactory: factory, ...noDom });
    last().open();
    vi.advanceTimersByTime(25000);
    last().receive(JSON.stringify(social));
    vi.advanceTimersByTime(25000);
    last().receive(JSON.stringify(social));
    vi.advanceTimersByTime(25000);
    expect(sockets).toHaveLength(2);
    transport.dispose();
  });
});
