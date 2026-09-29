// Android 셸 브리지 (plan.md 1.7): 웹 no-op 구현과, 가짜 HostBridge 객체로 본 선 계약(요청 id·응답·hotspot 알림).
import { expect, test, vi } from 'vitest';
import { createNativeBridge, getBridge, parseHotspot, type HostBridgeObject } from './bridge.ts';

test('웹 브리지는 no-op: 핫스팟 미지원, 공유 안 됨', async () => {
  const bridge = getBridge();
  expect(bridge.isNative).toBe(false);
  expect((await bridge.startHotspot()).state).toBe('unsupported');
  expect(await bridge.share({ text: '로그' })).toEqual({ shared: false });
  await expect(bridge.gameActive({ active: true })).resolves.toBeUndefined();
  await expect(bridge.vibrate([50])).resolves.toBeUndefined();
  const handle = await bridge.addListener('hotspot', () => {});
  await expect(handle.remove()).resolves.toBeUndefined();
});

/** 앱처럼 응답하는 가짜 HostBridge: 받은 요청을 기록하고 reply로 답한다 */
function fakeHost(reply: (msg: Record<string, unknown>) => Record<string, unknown> | null) {
  const sent: Record<string, unknown>[] = [];
  const host: HostBridgeObject = {
    onmessage: null,
    postMessage(message: string) {
      const msg = JSON.parse(message) as Record<string, unknown>;
      sent.push(msg);
      const answer = reply(msg);
      if (answer !== null) {
        queueMicrotask(() =>
          host.onmessage?.({ data: JSON.stringify({ ...answer, id: msg['id'] }) }),
        );
      }
    },
  };
  const push = (msg: Record<string, unknown>) => host.onmessage?.({ data: JSON.stringify(msg) });
  return { host, sent, push };
}

const HOTSPOT_ON = {
  type: 'hotspot',
  state: 'on',
  ssid: 'DIRECT-ab',
  password: 'pw;1',
  ip: '192.168.49.1',
  port: 17777,
  error: null,
  lanEnabled: true,
  warning: null,
};

test('요청마다 id를 붙이고 같은 id의 응답으로 끝난다: getHotspot·share·gameActive·vibrate·enableLan', async () => {
  const { host, sent } = fakeHost((msg) => {
    switch (msg['type']) {
      case 'getHotspot':
        return HOTSPOT_ON;
      case 'share':
        return { type: 'share', shared: true };
      case 'gameActive':
        return { type: 'gameActive', active: msg['bool'] };
      case 'vibrate':
        return { type: 'vibrate', accepted: true };
      case 'enableLan':
        return { type: 'lan', enabled: msg['bool'] };
      default:
        return { type: 'error', message: 'unknown action' };
    }
  });
  const bridge = createNativeBridge(host);
  expect(bridge.isNative).toBe(true);
  const info = await bridge.getHotspot();
  expect(info).toEqual({
    state: 'on',
    ssid: 'DIRECT-ab',
    password: 'pw;1',
    ip: '192.168.49.1',
    port: 17777,
    error: null,
    lanEnabled: true,
    warning: null,
  });
  expect(await bridge.share({ text: 'log', filename: 'a.txt' })).toEqual({ shared: true });
  await bridge.gameActive({ active: true });
  await bridge.vibrate([60, 40, 60]);
  expect((await bridge.enableLan({ enabled: true })).lanEnabled).toBe(true);
  expect(sent.map((m) => m['type'])).toEqual([
    'getHotspot',
    'share',
    'gameActive',
    'vibrate',
    'enableLan',
  ]);
  expect(new Set(sent.map((m) => m['id'])).size).toBe(sent.length);
  expect(sent[1]).toMatchObject({ text: 'log', filename: 'a.txt' });
  expect(sent[2]).toMatchObject({ bool: true });
  expect(sent[3]).toMatchObject({ pattern: [60, 40, 60] });
});

test('권한이 필요하면 startHotspot은 error{permissionRequired}를 hotspot 오류로 돌려준다', async () => {
  const { host } = fakeHost(() => ({ type: 'error', message: 'permissionRequired' }));
  const info = await createNativeBridge(host).startHotspot();
  expect(info.error).toBe('permissionRequired');
});

test('요청 없이 오는 hotspot 알림(첫 접촉·상태 변경)을 구독자에게 전한다, 옛 키 t도 받는다', async () => {
  const { host, push } = fakeHost(() => null);
  const bridge = createNativeBridge(host);
  const seen: string[] = [];
  const handle = await bridge.addListener('hotspot', (info) => seen.push(info.state));
  push({ ...HOTSPOT_ON, state: 'starting' });
  push({ t: 'hotspot', state: 'on', ssid: 'x', password: 'y', ip: '10.0.0.2', port: 17777 });
  push({ type: 'hotspot', state: 'nonsense' });
  await handle.remove();
  push(HOTSPOT_ON);
  expect(seen).toEqual(['starting', 'on', 'off']);
});

test('응답이 없으면 5초 뒤 포기한다 (앱이 모르는 요청)', async () => {
  vi.useFakeTimers();
  try {
    const { host } = fakeHost(() => null);
    const pending = createNativeBridge(host).getDeviceInfo();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test('parseHotspot: 신뢰 경계 밖 JSON의 모양을 고친다', () => {
  expect(
    parseHotspot({ state: 'addressOnly', ip: '192.168.0.5', port: '17777', ssid: '' }),
  ).toEqual({
    state: 'addressOnly',
    ssid: null,
    password: null,
    ip: '192.168.0.5',
    port: null,
    error: null,
    lanEnabled: null,
    warning: null,
  });
});
