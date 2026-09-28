// Android 셸 브리지 (plan.md 1.7). Capacitor 플러그인 모양의 인터페이스로 두어 향후 전환에 대비한다.
// 모든 메서드는 Promise를 돌려주고, 이벤트는 addListener → PluginListenerHandle.remove()로 구독·해제한다.
// TODO(M4): Android WebView(addWebMessageListener, origin http://127.0.0.1:17777 한정) 구현 연결.

export interface PluginListenerHandle {
  remove(): Promise<void>;
}

export type HotspotState = 'unsupported' | 'off' | 'starting' | 'on' | 'failed';

export interface HotspotInfo {
  readonly state: HotspotState;
  readonly ssid: string | null;
  readonly password: string | null;
  readonly ip: string | null;
  readonly port: number | null;
  readonly error: string | null;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface BridgePlugin {
  /** 네이티브 셸 안에서 도는지 */
  readonly isNative: boolean;
  getHotspot(): Promise<HotspotInfo>;
  startHotspot(): Promise<HotspotInfo>;
  stopHotspot(): Promise<void>;
  /** Android 공유 시트. 웹(비보안 컨텍스트)에서는 Web Share를 쓸 수 없으므로 shared=false. */
  share(options: { text: string; title?: string }): Promise<{ shared: boolean }>;
  log(options: { level: LogLevel; message: string }): Promise<void>;
  keepScreenOn(options: { enabled: boolean }): Promise<void>;
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
});

/** 브라우저(게스트·개발)용 no-op 구현. */
const webBridge: BridgePlugin = {
  isNative: false,
  getHotspot: async () => UNSUPPORTED,
  startHotspot: async () => UNSUPPORTED,
  stopHotspot: async () => {},
  share: async () => ({ shared: false }),
  log: async ({ level, message }) => {
    console[level](`[bridge] ${message}`);
  },
  keepScreenOn: async () => {},
  addListener: async () => ({ remove: async () => {} }),
  removeAllListeners: async () => {},
};

/** 현재 환경의 브리지. 지금은 항상 웹 구현. */
export function getBridge(): BridgePlugin {
  return webBridge;
}
