// 친구와 대전 도구: 역할 판정(루트 라우팅), 중계 주소, 중계 알림·연결 상태, Wi-Fi QR, 게스트 토큰 프래그먼트.
import type { Message, Role, Transport } from '@p2p-gostop/protocol';
import { expect, test } from 'vitest';
import { Link, parseRelayNotice, stateFromLog, type LinkState, type RelayPeer } from './link.ts';
import { qrPath, wifiQrText } from './qr.ts';
import { detectMode, guestUrl, relayAddress, relayUrl } from './role.ts';
import { readTicket } from './ticket.ts';

test('역할: ?role=가 우선, 없으면 루프백 origin은 호스트 앱·그 밖(핫스팟 IP)은 게스트 (spec 2.1·2.2)', () => {
  expect(detectMode({ search: '?role=host&build=abc1234', hostname: '127.0.0.1' })).toBe('host');
  expect(detectMode({ search: '', hostname: '127.0.0.1' })).toBe('host');
  expect(detectMode({ search: '', hostname: 'localhost' })).toBe('host');
  expect(detectMode({ search: '', hostname: '192.168.49.1' })).toBe('guest');
  expect(detectMode({ search: '?role=guest', hostname: '127.0.0.1' })).toBe('guest');
  expect(detectMode({ search: '?role=host', hostname: '192.168.49.1' })).toBe('host');
});

test('중계 주소: 페이지 주소 그대로(Android 17777), ?relay=로 개발 중계를 덮어쓴다', () => {
  const page = { search: '', hostname: '192.168.49.1', port: '17777', protocol: 'http:' };
  expect(relayAddress(page)).toEqual({ host: '192.168.49.1', port: 17777 });
  expect(relayUrl('guest', relayAddress(page))).toBe('ws://192.168.49.1:17777/ws?role=guest');
  expect(relayAddress({ ...page, search: '?relay=127.0.0.1:17778' })).toEqual({
    host: '127.0.0.1',
    port: 17778,
  });
  expect(relayAddress({ ...page, search: '?relay=evil host:1' }).port).toBe(17777);
  expect(relayAddress({ ...page, port: '' }).port).toBe(80);
  expect(guestUrl('192.168.49.1', 17777)).toBe(`${'http'}://192.168.49.1:17777/`);
});

test('Wi-Fi QR: 항상 T:WPA, 특수 문자 이스케이프, 비밀번호 없으면 nopass (FR-03, Android WifiQr.kt와 같은 규칙)', () => {
  expect(wifiQrText('DIRECT-ab', 'k3v9x2ma')).toBe('WIFI:T:WPA;S:DIRECT-ab;P:k3v9x2ma;;');
  expect(wifiQrText('a;b,c', 'p:"\\')).toBe('WIFI:T:WPA;S:a\\;b\\,c;P:p\\:\\"\\\\;;');
  expect(wifiQrText('open', null)).toBe('WIFI:T:nopass;S:open;;');
  const qr = qrPath('WIFI:T:WPA;S:DIRECT-ab;P:k3v9x2ma;;');
  expect(qr.size).toBeGreaterThanOrEqual(21 + 4);
  expect(qr.d).toMatch(/^M\d+ \d+h1v1h-1z/);
});

test('게스트 토큰·이름은 URL 프래그먼트 #g=…&n=… (MN-05)', () => {
  expect(readTicket('#g=0123456789abcdef0123456789abcdef&n=%EB%AF%BC%EC%A7%80')).toEqual({
    token: '0123456789abcdef0123456789abcdef',
    name: '민지',
  });
  expect(readTicket('#/game')).toEqual({ token: null, name: null });
  expect(readTicket('#g=not-hex&n=')).toEqual({ token: null, name: null });
});

test('중계 알림과 연결 상태 로그 해석', () => {
  expect(parseRelayNotice('{"t":"relay","peer":"joined"}')).toBe('joined');
  expect(parseRelayNotice('{"t":"relay","peer":"spectator"}')).toBeNull();
  expect(parseRelayNotice('{"t":"events","relay":1}')).toBeNull();
  expect(stateFromLog('socket#1 connecting ws://h:1/ws?role=guest')).toEqual({
    state: 'connecting',
  });
  expect(stateFromLog('socket#1 open')).toEqual({ state: 'open' });
  expect(stateFromLog('socket#2 close code=1006')).toEqual({ state: 'closed', code: 1006 });
  expect(stateFromLog('socket#2 close code=4001')).toEqual({ state: 'replaced', code: 4001 });
  expect(stateFromLog('socket#1 close code=1000 stale')).toBeNull();
});

/** Link 아래에 넣는 가짜 WsTransport: 로그 줄과 수신을 테스트가 흉내 낸다 */
function fakeFactory() {
  const made: {
    log: (line: string) => void;
    receive: (raw: string) => void;
    close: () => void;
    disposed: boolean;
    sent: Message[];
  }[] = [];
  const factory = (o: { role: Role; host: string; port: number; log: (line: string) => void }) => {
    // 실제 WsTransport처럼 생성자 안에서 곧바로 로그를 적는다
    o.log(`socket#${made.length + 1} connecting ws://${o.host}:${o.port}/ws?role=${o.role}`);
    const messages = new Set<(raw: string) => void>();
    const closes = new Set<() => void>();
    const entry = {
      log: o.log,
      receive: (raw: string) => messages.forEach((h) => h(raw)),
      close: () => closes.forEach((h) => h()),
      disposed: false,
      sent: [] as Message[],
    };
    made.push(entry);
    const transport: Transport & { dispose(): void } = {
      send: (m) => entry.sent.push(m),
      onMessage: (h) => (messages.add(h), () => messages.delete(h)),
      onClose: (h) => (closes.add(h), () => closes.delete(h)),
      reconnect: () => {},
      dispose: () => {
        entry.disposed = true;
      },
    };
    return transport;
  };
  return { made, factory };
}

test('Link: 중계 알림은 게임 메시지에서 걸러 내고, 4001 교체면 자동 재접속을 멈춘다 (이슈 #15)', () => {
  const { made, factory } = fakeFactory();
  const link = new Link({
    role: 'host',
    address: { host: '127.0.0.1', port: 17777 },
    transportFactory: factory,
  });
  const messages: string[] = [];
  const peers: RelayPeer[] = [];
  const states: LinkState[] = [];
  link.onMessage((raw) => messages.push(raw));
  link.onRelay((peer) => peers.push(peer));
  link.onState((state) => states.push(state));
  const inner = made[0]!;
  inner.log('socket#1 open');
  inner.receive('{"t":"relay","peer":"present"}');
  inner.receive('{"t":"pong"}');
  expect(messages).toEqual(['{"t":"pong"}']);
  expect(peers).toEqual(['present']);
  inner.log('socket#1 close code=4001');
  expect(states).toEqual(['open', 'replaced']);
  expect(inner.disposed).toBe(true);
  link.send({ t: 'ping' });
  expect(inner.sent).toEqual([]);
  // 사용자가 "다시 연결"을 누르면 새 소켓을 연다
  link.reconnect();
  expect(made).toHaveLength(2);
  expect(link.state).toBe('connecting');
  link.dispose();
});

test('Link: 게스트는 60초 동안 아무것도 못 받으면 소켓을 새로 연다 (NP-05)', async () => {
  const { made, factory } = fakeFactory();
  let now = 0;
  const link = new Link({
    role: 'guest',
    address: { host: '192.168.49.1', port: 17777 },
    transportFactory: factory,
    now: () => now,
  });
  let closes = 0;
  link.onClose(() => closes++);
  made[0]!.log('socket#1 open');
  now = 59_000;
  (link as unknown as { checkSilence(): void }).checkSilence();
  expect(made).toHaveLength(1);
  now = 60_000;
  (link as unknown as { checkSilence(): void }).checkSilence();
  expect(made).toHaveLength(2);
  expect(made[0]!.disposed).toBe(true);
  // 세션이 hello를 다시 보내도록 닫힘을 알린다
  expect(closes).toBe(1);
  link.dispose();
});
