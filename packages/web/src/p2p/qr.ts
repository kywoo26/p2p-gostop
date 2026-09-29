// 방 열기 화면의 QR 두 개 (spec FR-03): Wi-Fi 접속(WIFI: 스킴, 항상 T:WPA)과 게임 주소.
// QR 행렬은 uqr(plan.md 1.8)로 만들고 그림은 SVG 경로 하나로 그린다(외부 요청·canvas 없음).
import { encode } from 'uqr';

/** WIFI: 스킴의 특수 문자(\ ; , : ")는 역슬래시로 이스케이프한다 (Android WifiQr.kt와 같은 규칙) */
function escapeWifi(value: string): string {
  return value.replace(/[\\;,:"]/g, (ch) => `\\${ch}`);
}

/**
 * iOS 카메라가 인식하는 Wi-Fi QR 문자열. T:SAE·T:WPA3는 iOS가 인식하지 못해 WPA로 적는다 (FR-03).
 * 비밀번호가 없으면 개방 네트워크(T:nopass).
 */
export function wifiQrText(ssid: string, password: string | null): string {
  return password === null || password === ''
    ? `WIFI:T:nopass;S:${escapeWifi(ssid)};;`
    : `WIFI:T:WPA;S:${escapeWifi(ssid)};P:${escapeWifi(password)};;`;
}

export interface QrPath {
  /** 가장자리 여백 포함 한 변의 모듈 수 */
  readonly size: number;
  /** 검은 모듈을 1×1 사각형으로 이은 SVG 경로 */
  readonly d: string;
}

/** 텍스트 → SVG 경로 (오류 정정 M, 여백 2모듈) */
export function qrPath(text: string): QrPath {
  const { data, size } = encode(text, { ecc: 'M', border: 2 });
  const parts: string[] = [];
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x} ${y}h1v1h-1z`);
    });
  });
  return { size, d: parts.join('') };
}
