// 앱이 어느 역할로 열렸는지 (spec 2.1·2.2, plan.md 1.1).
// - Android WebView는 루프백 origin에서 `/?role=host&build=…`를 연다 → 호스트 앱(홈·혼자 연습·방 열기).
// - iPhone은 QR로 `http://<핫스팟 IP>:17777/`을 연다 → 루프백이 아닌 origin이면 조작 없이 게스트 화면.
// - `?role=guest`는 같은 기기에서 게스트를 시험할 때(E2E·개발), `?relay=host:port`는 개발 중계 주소를 덮어쓴다.
import { RELAY_PATH, type Role } from '@p2p-gostop/protocol';

export type AppMode = 'host' | 'guest';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

function isLoopback(hostname: string): boolean {
  return LOOPBACK.has(hostname);
}

export function detectMode(loc: Pick<Location, 'search' | 'hostname'> = location): AppMode {
  const role = new URLSearchParams(loc.search).get('role');
  if (role === 'guest') return 'guest';
  if (role === 'host') return 'host';
  return isLoopback(loc.hostname) ? 'host' : 'guest';
}

export interface RelayAddress {
  readonly host: string;
  readonly port: number;
}

/** 중계 주소: `?relay=host:port`가 있으면 그것, 없으면 페이지를 연 주소 (Android는 같은 17777 포트가 정적 파일과 /ws를 함께 준다) */
export function relayAddress(
  loc: Pick<Location, 'search' | 'hostname' | 'port' | 'protocol'> = location,
): RelayAddress {
  const override = new URLSearchParams(loc.search).get('relay');
  const match = override?.match(/^([\w.-]+|\[[0-9a-f:]+\]):(\d{1,5})$/i);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    return { host: match[1], port: Number(match[2]) };
  }
  const port = loc.port === '' ? (loc.protocol === 'https:' ? 443 : 80) : Number(loc.port);
  return { host: loc.hostname, port };
}

export function relayUrl(role: Role, address: RelayAddress = relayAddress()): string {
  return `ws://${address.host}:${address.port}${RELAY_PATH}?role=${role}`;
}

/**
 * 게스트가 여는 게임 주소 (URL QR). 번들 외부 URL 검사(scripts/check-bundle.mjs)가 `http://` 리터럴 뒤의
 * 템플릿 자리를 외부 주소로 오인하지 않도록 조각을 이어 붙인다. 주소는 핫스팟의 사설 IP뿐이다.
 */
export function guestUrl(ip: string, port: number): string {
  return ['http:', '', `${ip}:${port}`, ''].join('/');
}
