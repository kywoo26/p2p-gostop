// Android 핫스팟 상태 (브리지 hotspot 알림, plan.md 1.7). 방 열기 화면과 게임 화면(NF-06 경고)이 같이 읽는다.
import { getBridge, type HotspotInfo, type PluginListenerHandle } from '../bridge/bridge.ts';
import { log } from '../game/log.svelte.ts';

const INITIAL: HotspotInfo = {
  state: 'off',
  ssid: null,
  password: null,
  ip: null,
  port: null,
  error: null,
  lanEnabled: null,
  warning: null,
};

class HotspotStore {
  info = $state.raw<HotspotInfo>(INITIAL);
  busy = $state(false);
  private handle: Promise<PluginListenerHandle> | null = null;

  /** 처음 부를 때 한 번 구독한다 (앱이 끝날 때까지 유지) */
  watch(): void {
    if (this.handle !== null) return;
    const bridge = getBridge();
    this.handle = bridge.addListener('hotspot', (info) => {
      if (info.state !== this.info.state)
        log.info(`핫스팟 ${info.state}${info.error ? ` (${info.error})` : ''}`);
      this.info = info;
    });
    void bridge.getHotspot().then((info) => (this.info = info));
  }

  /** 핫스팟 켜기 (LAN도 연다). 권한이 필요하면 앱이 안내하고 결과를 hotspot 알림으로 다시 보낸다 */
  async start(): Promise<void> {
    this.busy = true;
    try {
      this.info = await getBridge().startHotspot();
    } finally {
      this.busy = false;
    }
  }

  /** 주소만 표시: 핫스팟 없이 기존 Wi-Fi LAN에 연다 (NF-06 경고) */
  async addressOnly(): Promise<void> {
    this.info = await getBridge().enableLan({ enabled: true });
  }
}

export const hotspot = new HotspotStore();
