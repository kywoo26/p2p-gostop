import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RelayHealthError } from './index.ts';
import {
  checkPublicHealth,
  createPublicJoinChannel,
  createPublicTransport,
  loadRemoteHostSettings,
  parseRelayOrigin,
  publicWsUrl,
  saveRemoteHostSettings,
} from './index.ts';

const token = 't'.repeat(43);
const resumeToken = 'u'.repeat(43);
const room = 'r'.repeat(22);
const requestId = 'q'.repeat(22);
const origin = 'https://relay.example.test';
const endpoint = { baseUrl: origin, allowedOrigin: origin, role: 'host' as const, room, token };

class FakeSocket extends EventTarget {
  readonly sent: string[] = [];
  readonly url: string;
  onSend: ((raw: string) => void) | null = null;
  readyState = 0;
  constructor(url: string) {
    super();
    this.url = url;
  }
  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  send(raw: string): void {
    this.sent.push(raw);
    this.onSend?.(raw);
  }
  receive(raw: string): void {
    this.dispatchEvent(new MessageEvent('message', { data: raw }));
  }
  close(code = 1000, reason = ''): void {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close', { code, reason }));
  }
}

const sockets: FakeSocket[] = [];
const socketFactory = (url: string) => {
  const socket = new FakeSocket(url);
  sockets.push(socket);
  return socket as unknown as WebSocket;
};
const noDom = { visibility: new EventTarget() as Document, pages: new EventTarget() as Window };
afterEach(() => {
  sockets.length = 0;
  vi.useRealTimers();
});

describe('NP-RP-01 공개 transport', () => {
  it('설정 origin만 WSS에 사용하고 토큰을 URL·로그에서 제외한다', () => {
    expect(publicWsUrl(endpoint)).toBe(`wss://relay.example.test/ws?role=host&room=${room}`);
    for (const bad of [
      'http://relay.example.test',
      'https://user@relay.example.test',
      'https://relay.example.test/path',
      'https://relay.example.test/?token=x',
      'https://relay.example.test/#x',
    ]) {
      expect(() => parseRelayOrigin(bad)).toThrow();
    }
    expect(() => publicWsUrl({ ...endpoint, room: '../x' })).toThrow();
    expect(() =>
      publicWsUrl({ ...endpoint, allowedOrigin: 'https://other.example.test' }),
    ).toThrow();
  });

  it('첫 relay-auth 뒤 relay 알림을 인증 성공으로 처리하고 게임 프레임을 분리한다', () => {
    vi.useFakeTimers();
    const logs: string[] = [];
    const messages: string[] = [];
    const transport = createPublicTransport(
      { ...endpoint, role: 'guest' },
      { socketFactory, log: (line) => logs.push(line), ...noDom },
    );
    transport.onMessage((raw) => messages.push(raw));
    transport.send({ t: 'log', entries: ['before-auth'] });
    sockets[0]!.open();
    expect(sockets[0]!.sent).toEqual([JSON.stringify({ t: 'relay-auth', token })]);
    sockets[0]!.receive('{"t":"relay-claim-pending"}');
    expect(messages).toEqual([]);
    expect(transport.state).toBe('connecting');
    const controls: string[] = [];
    transport.onControl((control) => controls.push(control.t));
    sockets[0]!.receive(JSON.stringify({ t: 'relay-accepted', token: resumeToken }));
    sockets[0]!.receive('{"t":"relay","peer":"present"}');
    expect(transport.state).toBe('open');
    expect(sockets[0]!.sent[1]).toBe(JSON.stringify({ t: 'log', entries: ['before-auth'] }));
    sockets[0]!.receive('{"t":"pong"}');
    expect(messages).toEqual(['{"t":"pong"}']);
    expect(controls).toEqual(['relay-accepted']);
    sockets[0]!.close(1006);
    vi.advanceTimersByTime(500);
    sockets[1]!.open();
    expect(sockets[1]!.sent[0]).toBe(JSON.stringify({ t: 'relay-auth', token: resumeToken }));
    expect(logs.join(' ')).not.toContain(token);
    expect(logs.join(' ')).not.toContain(resumeToken);
    transport.dispose();
  });

  it('4001은 자동 재접속하지 않고, 명시적 reconnect에서 다시 인증한다', () => {
    vi.useFakeTimers();
    const transport = createPublicTransport(endpoint, { socketFactory, ...noDom });
    sockets[0]!.open();
    sockets[0]!.receive('{"t":"relay","peer":"absent"}');
    sockets[0]!.close(4001, 'replaced');
    vi.advanceTimersByTime(30_000);
    expect(sockets).toHaveLength(1);
    transport.reconnect();
    sockets[1]!.open();
    expect(sockets[1]!.sent[0]).toBe(JSON.stringify({ t: 'relay-auth', token }));
    transport.dispose();
  });

  it('호스트 제어 콜백과 relay-accept 송신은 게임 프레임과 격리한다', () => {
    const transport = createPublicTransport(endpoint, { socketFactory, ...noDom });
    const messages: string[] = [];
    const controls: string[] = [];
    transport.onMessage((raw) => messages.push(raw));
    transport.onControl((control) => controls.push(control.t));
    sockets[0]!.open();
    sockets[0]!.receive('{"t":"relay","peer":"absent"}');
    sockets[0]!.receive(JSON.stringify({ t: 'relay-claim', requestId }));
    sockets[0]!.receive(JSON.stringify({ t: 'relay-join-request', requestId }));
    expect(transport.sendControl({ t: 'relay-accept', requestId, token: resumeToken })).toBe(true);
    expect(sockets[0]!.sent[1]).toBe(
      JSON.stringify({ t: 'relay-accept', requestId, token: resumeToken }),
    );
    expect(controls).toEqual(['relay-claim', 'relay-join-request']);
    expect(messages).toEqual([]);
    transport.dispose();
  });

  it('코드 참여 채널은 join 제어만 수신하고 수락 시 roomId를 요구한다', () => {
    const join = createPublicJoinChannel(origin, origin, 'ABCD-EFGH-JKLM', socketFactory);
    expect(sockets[0]!.url).toBe('wss://relay.example.test/join?code=ABCDEFGHJKLM');
    const controls: string[] = [];
    join.onControl((control) => controls.push(control.t));
    sockets[0]!.open();
    sockets[0]!.receive('{"t":"relay-join-pending"}');
    sockets[0]!.receive(JSON.stringify({ t: 'relay-accepted', token: resumeToken, roomId: room }));
    expect(controls).toEqual(['relay-join-pending', 'relay-accepted']);
    join.dispose();
  });

  it('가짜 공개 중계가 인증 뒤 기존 게임 프레임을 그대로 전달한다', () => {
    const seats = new Map<string, FakeSocket>();
    const relayFactory = (url: string) => {
      const socket = new FakeSocket(url);
      const role = new URL(url).searchParams.get('role')!;
      let authenticated = false;
      socket.onSend = (raw) => {
        const frame: unknown = JSON.parse(raw);
        if (typeof frame !== 'object' || frame === null) return;
        const value = frame as Record<string, unknown>;
        if (!authenticated) {
          if (value.t !== 'relay-auth' || value.token !== token) {
            socket.close(1008);
            return;
          }
          authenticated = true;
          const peer = seats.get(role === 'host' ? 'guest' : 'host');
          seats.set(role, socket);
          socket.receive(JSON.stringify({ t: 'relay', peer: peer ? 'present' : 'absent' }));
          peer?.receive('{"t":"relay","peer":"joined"}');
          return;
        }
        if (typeof value.t === 'string' && value.t.startsWith('relay-')) return;
        seats.get(role === 'host' ? 'guest' : 'host')?.receive(raw);
      };
      sockets.push(socket);
      return socket as unknown as WebSocket;
    };
    const host = createPublicTransport(endpoint, { socketFactory: relayFactory, ...noDom });
    const guest = createPublicTransport(
      { ...endpoint, role: 'guest' },
      { socketFactory: relayFactory, ...noDom },
    );
    const received: string[] = [];
    host.onMessage((raw) => received.push(raw));
    sockets[0]!.open();
    sockets[1]!.open();
    guest.send({ t: 'log', entries: ['game-frame'] });
    expect(received).toEqual(['{"t":"log","entries":["game-frame"]}']);
    expect(host.peer).toBe('joined');
    expect(guest.peer).toBe('present');
    host.dispose();
    guest.dispose();
  });
});

describe('NP-RP-02/08 설정과 health', () => {
  it('호스트 설정은 주입한 개인 저장소에만 읽고 쓴다', () => {
    const values = new Map<string, string>();
    const store = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    expect(loadRemoteHostSettings(store)).toBeNull();
    saveRemoteHostSettings(store, { baseUrl: `${origin}/`, creationSecret: token });
    expect(loadRemoteHostSettings(store)).toEqual({ baseUrl: origin, creationSecret: token });
  });

  it('health는 사용자 호출 때만 같은 origin·정해진 형태를 확인하고 redirect를 거절한다', async () => {
    const signal = new AbortController().signal;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      expect(init?.mode).toBe('cors');
      expect(init?.credentials).toBe('omit');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(String(_input)).toBe(`${origin}/health`);
      return Response.json({ relay: 'p2p-gostop', ready: true, controlVersion: 1, wireVersion: 2 });
    });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(checkPublicHealth(origin, signal, fetcher)).resolves.toEqual({
      relay: 'p2p-gostop',
      ready: true,
      controlVersion: 1,
      wireVersion: 2,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    await expect(
      checkPublicHealth(origin, signal, async () =>
        Response.json({ relay: 'p2p-gostop', ready: true, controlVersion: 1, wireVersion: 3 }),
      ),
    ).rejects.toThrow();
  });

  it('CORS 거절과 서버 연결 실패를 읽기 없는 health 진단으로 구분한다', async () => {
    const signal = new AbortController().signal;
    const modes: RequestMode[] = [];
    const blocked: typeof fetch = async (_input, init) => {
      modes.push(init?.mode ?? 'same-origin');
      expect(init?.credentials).toBe('omit');
      if (init?.mode === 'cors') throw new TypeError('Failed to fetch');
      return Response.json({});
    };
    await expect(checkPublicHealth(origin, signal, blocked)).rejects.toMatchObject({
      code: 'cors',
    } satisfies Partial<RelayHealthError>);
    expect(modes).toEqual(['cors', 'no-cors']);
    await expect(
      checkPublicHealth(origin, signal, async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toMatchObject({ code: 'network' } satisfies Partial<RelayHealthError>);
  });
});
