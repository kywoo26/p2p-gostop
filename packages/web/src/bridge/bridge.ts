// Android 셸 브리지 (plan.md 1.7). Capacitor 플러그인 모양의 인터페이스로 두어 향후 전환에 대비한다.
// 모든 메서드는 Promise를 돌려주고, 이벤트는 addListener → PluginListenerHandle.remove()로 구독·해제한다.
//
// 선 계약 (android GameActivity.kt의 HostBridge 주석이 단일 근거):
// - WebView가 루프백 origin(http://127.0.0.1:17777)의 메인 프레임에만 `window.HostBridge`를 주입한다
//   (androidx.webkit addWebMessageListener). 페이지 → 앱: `HostBridge.postMessage(JSON)`, 앱 → 페이지: `HostBridge.onmessage`.
// - 요청은 `{type, id?, ...}`이고 응답은 같은 id를 돌려준다. 앱은 첫 메시지와 상태 변경 때 `hotspot`을 먼저 보낸다.
// - getHotspot/startHotspot → hotspot{state: off|starting|on|failed|addressOnly, ssid, password, ip, port, error,
//   lanEnabled, warning}. 권한이 없으면 startHotspot → error{message:"permissionRequired"} 후 앱이 권한 안내를 띄우고,
//   허용·거절 결과를 같은 id의 hotspot/error로 다시 보낸다(구독자에게 hotspot 알림으로 도착한다).
// - share{text,title?,filename?} → share{shared} / log{role?,level?,message?,entries?} → log{accepted}
// - keepScreenOn{bool} / gameActive{bool}(뒤로 가기 확인·화면 켜짐) / vibrate{pattern}(총 2초 상한)
// - openDiagnostics / getDeviceInfo → deviceInfo{device,version,gitSha,buildTime}
// - LAN 노출은 명시적으로 연다(NF-06): startHotspot이 LAN을 열고, "주소만 표시"는 enableLan{bool} → lan{enabled}.
//   stopHotspot → stopHotspot{stopped}은 서버를 유지한 채 주소만 표시로 내린다. LAN이 열리면 hotspot.warning을 보여 준다.
// 근거: plan.md 1.7 "HostBridge 단일 계약".
// 받는 쪽은 옛 키 `t`도 `type`으로 받아 준다. 브라우저(게스트·개발)에서는 no-op 구현이 된다.
// 게스트 iPhone Safari는 진동이 없다(navigator.vibrate 금지, NF-02). 진동은 이 브리지로만 한다.

export interface PluginListenerHandle {
  remove(): Promise<void>;
}

export type HotspotState = 'unsupported' | 'off' | 'starting' | 'on' | 'failed' | 'addressOnly';

export interface HotspotInfo {
  readonly state: HotspotState;
  readonly ssid: string | null;
  readonly password: string | null;
  readonly ip: string | null;
  readonly port: number | null;
  readonly error: string | null;
  /** 비루프백(핫스팟·같은 Wi-Fi) 접속을 받는지. 모르면 null */
  readonly lanEnabled: boolean | null;
  /** 앱이 붙인 NF-06 경고 (주소만 표시에서 LAN 전체에 열림) */
  readonly warning: string | null;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DeviceInfo {
  readonly device: Readonly<Record<string, string>>;
  readonly version: string;
  readonly gitSha: string;
  readonly buildTime: string;
}

export interface BridgePlugin {
  /** 네이티브 셸 안에서 도는지 */
  readonly isNative: boolean;
  getHotspot(): Promise<HotspotInfo>;
  /** 권한이 필요하면 { ...state, error: 'permissionRequired' } */
  startHotspot(): Promise<HotspotInfo>;
  stopHotspot(): Promise<void>;
  /** 핫스팟 없이 기존 Wi-Fi에서 받는 "주소만 표시" 모드 (서버가 LAN 전체에 열린다, NF-06 경고를 함께 보여 준다) */
  enableLan(options: { enabled: boolean }): Promise<HotspotInfo>;
  /** Android 공유 시트. 웹(비보안 컨텍스트)에서는 Web Share를 쓸 수 없으므로 shared=false. */
  share(options: { text: string; title?: string; filename?: string }): Promise<{ shared: boolean }>;
  log(options: { level: LogLevel; message: string }): Promise<void>;
  /** 게스트가 올린 로그를 앱의 게스트 버퍼에 넣는다 (NP-09, 앱 진단의 로그 공유에 포함) */
  guestLog(entries: readonly string[]): Promise<void>;
  keepScreenOn(options: { enabled: boolean }): Promise<void>;
  /** 게임 중: 뒤로 가기를 확인 창으로 바꾸고 화면을 켜 둔다 (이슈 #10) */
  gameActive(options: { active: boolean }): Promise<void>;
  /** ms 단위 [진동, 쉼, 진동, …] (앱이 총 2초로 자른다) */
  vibrate(pattern: readonly number[]): Promise<void>;
  openDiagnostics(): Promise<void>;
  getDeviceInfo(): Promise<DeviceInfo | null>;
  addListener(
    eventName: 'hotspot',
    listener: (info: HotspotInfo) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const UNSUPPORTED: HotspotInfo = Object.freeze({
  state: 'unsupported',
  ssid: null,
  password: null,
  ip: null,
  port: null,
  error: null,
  lanEnabled: null,
  warning: null,
});

/** 브라우저(게스트·개발)용 no-op 구현. */
const webBridge: BridgePlugin = {
  isNative: false,
  getHotspot: async () => UNSUPPORTED,
  startHotspot: async () => UNSUPPORTED,
  stopHotspot: async () => {},
  enableLan: async () => UNSUPPORTED,
  share: async () => ({ shared: false }),
  log: async ({ level, message }) => {
    console[level](`[bridge] ${message}`);
  },
  guestLog: async () => {},
  keepScreenOn: async () => {},
  gameActive: async () => {},
  vibrate: async () => {},
  openDiagnostics: async () => {},
  getDeviceInfo: async () => null,
  addListener: async () => ({ remove: async () => {} }),
  removeAllListeners: async () => {},
};

/** WebView가 주입하는 객체 (androidx.webkit JavaScript 쪽 모양) */
export interface HostBridgeObject {
  postMessage(message: string): void;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
}

type Reply = Readonly<Record<string, unknown>> & { readonly type: string };

const HOTSPOT_STATES: readonly HotspotState[] = ['off', 'starting', 'on', 'failed', 'addressOnly'];

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** 앱이 보낸 hotspot 메시지(신뢰 경계 밖의 JSON)를 고친다 */
export function parseHotspot(msg: Readonly<Record<string, unknown>>): HotspotInfo {
  const state = msg['state'];
  const port = msg['port'];
  return {
    state: HOTSPOT_STATES.includes(state as HotspotState) ? (state as HotspotState) : 'off',
    ssid: text(msg['ssid']),
    password: text(msg['password']),
    ip: text(msg['ip']),
    port: typeof port === 'number' && Number.isInteger(port) ? port : null,
    error: text(msg['error']),
    lanEnabled: typeof msg['lanEnabled'] === 'boolean' ? msg['lanEnabled'] : null,
    warning: text(msg['warning']),
  };
}

function parseReply(data: unknown): Reply | null {
  if (typeof data !== 'string') return null;
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    const type = record['type'] ?? record['t'];
    return typeof type === 'string' ? { ...record, type } : null;
  } catch {
    return null;
  }
}

const REQUEST_TIMEOUT_MS = 5_000;

/** HostBridge 객체 위의 구현 (테스트는 가짜 객체를 넘긴다) */
export function createNativeBridge(host: HostBridgeObject): BridgePlugin {
  let nextId = 1;
  const pending = new Map<string, (reply: Reply | null) => void>();
  const listeners = new Set<(info: HotspotInfo) => void>();
  let last: HotspotInfo | null = null;

  host.onmessage = (event) => {
    const reply = parseReply(event.data);
    if (reply === null) return;
    if (reply.type === 'hotspot') {
      last = parseHotspot(reply);
      for (const listener of listeners) listener(last);
    }
    const id = reply['id'];
    if (typeof id === 'string' || typeof id === 'number') {
      const resolve = pending.get(String(id));
      if (resolve !== undefined) {
        pending.delete(String(id));
        resolve(reply);
      }
    }
  };

  function request(type: string, payload: Record<string, unknown> = {}): Promise<Reply | null> {
    const id = `w${nextId++}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(null);
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      try {
        host.postMessage(JSON.stringify({ ...payload, type, id }));
      } catch {
        pending.delete(id);
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  const hotspotReply = (reply: Reply | null): HotspotInfo => {
    if (reply?.type === 'hotspot') return parseHotspot(reply);
    const base = last ?? { ...UNSUPPORTED, state: 'off' as const };
    return { ...base, error: text(reply?.['message']) ?? 'noReply' };
  };

  return {
    isNative: true,
    getHotspot: async () => hotspotReply(await request('getHotspot')),
    startHotspot: async () => hotspotReply(await request('startHotspot')),
    stopHotspot: async () => {
      await request('stopHotspot');
    },
    enableLan: async ({ enabled }) => {
      const reply = await request('enableLan', { bool: enabled });
      if (reply?.type === 'hotspot' || reply?.type === 'error' || reply === null)
        return hotspotReply(reply);
      // lan{enabled} 확인만 온다: 상태·경고는 뒤이어 오는 hotspot 알림이 알려 준다
      const base = last ?? { ...UNSUPPORTED, state: 'off' as const };
      return { ...base, lanEnabled: reply['enabled'] === true };
    },
    share: async ({ text: body, title, filename }) => {
      const reply = await request('share', {
        text: body,
        ...(title === undefined ? {} : { title }),
        ...(filename === undefined ? {} : { filename }),
      });
      return { shared: reply?.['shared'] === true };
    },
    log: async ({ level, message }) => {
      await request('log', { level, message });
    },
    guestLog: async (entries) => {
      if (entries.length > 0) await request('log', { role: 'guest', entries: [...entries] });
    },
    keepScreenOn: async ({ enabled }) => {
      await request('keepScreenOn', { bool: enabled });
    },
    gameActive: async ({ active }) => {
      await request('gameActive', { bool: active });
    },
    vibrate: async (pattern) => {
      await request('vibrate', { pattern: [...pattern] });
    },
    openDiagnostics: async () => {
      await request('openDiagnostics');
    },
    getDeviceInfo: async () => {
      const reply = await request('getDeviceInfo');
      if (reply?.type !== 'deviceInfo') return null;
      const device = reply['device'];
      return {
        device:
          typeof device === 'object' && device !== null
            ? Object.fromEntries(Object.entries(device).map(([k, v]) => [k, String(v)]))
            : {},
        version: String(reply['version'] ?? ''),
        gitSha: String(reply['gitSha'] ?? ''),
        buildTime: String(reply['buildTime'] ?? ''),
      };
    },
    addListener: async (_eventName, listener) => {
      listeners.add(listener);
      if (last !== null) listener(last);
      return {
        remove: async () => {
          listeners.delete(listener);
        },
      };
    },
    removeAllListeners: async () => {
      listeners.clear();
    },
  };
}

function findHostBridge(): HostBridgeObject | null {
  const candidate: unknown = (globalThis as { HostBridge?: unknown }).HostBridge;
  if (typeof candidate !== 'object' || candidate === null) return null;
  return typeof (candidate as { postMessage?: unknown }).postMessage === 'function'
    ? (candidate as HostBridgeObject)
    : null;
}

let current: BridgePlugin | null = null;

/** 현재 환경의 브리지: Android WebView면 HostBridge, 아니면 no-op 웹 구현. */
export function getBridge(): BridgePlugin {
  if (current === null) {
    const host = findHostBridge();
    current = host === null ? webBridge : createNativeBridge(host);
  }
  return current;
}
