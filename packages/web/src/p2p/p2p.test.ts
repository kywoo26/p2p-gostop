// 친구와 대전 도구: 역할 판정(루트 라우팅), 중계 주소, 중계 알림·연결 상태, Wi-Fi QR, 게스트 토큰 프래그먼트.
import { expect, test } from 'vitest';
import { linkStateOf } from './link.ts';
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

test('연결 사건 → 화면 상태: 4001 교체는 replaced로 멈추고, 재시도 예정 닫힘은 closed (이슈 #15)', () => {
  expect(linkStateOf({ type: 'connecting', socket: 1 })).toBe('connecting');
  expect(linkStateOf({ type: 'open', socket: 1 })).toBe('open');
  expect(linkStateOf({ type: 'close', socket: 1, code: 1006, reason: '', retryInMs: 500 })).toBe(
    'closed',
  );
  expect(linkStateOf({ type: 'stopped', socket: 1, reason: 'replaced' })).toBe('replaced');
  expect(linkStateOf({ type: 'stopped', socket: 1, reason: 'policy' })).toBe('stopped');
  expect(linkStateOf({ type: 'pongTimeout', socket: 1 })).toBe('connecting');
  expect(linkStateOf({ type: 'peer', socket: 1, peer: 'joined' })).toBeNull();
});
