// 중계 계약 (intent/plan.md 1.1, spec FR-07·NF-05·NF-06, PR #1 결정). Android Ktor 중계와 relay-dev가 같은 규칙을 따른다.
// - 역할(host·guest)마다 최신 연결 하나. 같은 역할이 다시 붙으면 이전 소켓을 4001 "replaced"로 닫는다(최신 우선).
//   좌석 판단(진짜 게스트인지)은 중계가 아니라 세션 토큰으로 한다.
// - 중계가 보내는 알림은 {"t":"relay","peer":"present|absent|joined|left"} 한 줄. 옛 {"type":"relay"} 형식도 알림으로 인식한다.
// - 클라이언트가 보낸 relay 모양 프레임은 전달하지 않는다(알림 위조 방지). 프로토콜 decode도 relay 프레임을 메시지로 받지 않는다.
// - 텍스트 프레임만(바이너리 1003), 64KB 초과 1009, 호스트 역할은 루프백에서만(1008).

/** 같은 역할의 새 연결로 교체됨. 받은 쪽은 자동 재접속하지 않는다 */
export const RELAY_CLOSE_REPLACED = 4001;
/** 역할 오류·호스트 비루프백 (RFC 6455 Policy Violation) */
export const RELAY_CLOSE_POLICY = 1008;
/** 바이너리 프레임 (RFC 6455 Unsupported Data) */
export const RELAY_CLOSE_UNSUPPORTED = 1003;
/** 64KB 초과 (RFC 6455 Message Too Big) */
export const RELAY_CLOSE_TOO_LARGE = 1009;

export type RelayPeerState = 'present' | 'absent' | 'joined' | 'left';
export interface RelayNotice {
  readonly t: 'relay';
  readonly peer: RelayPeerState;
}

function isPeerState(value: unknown): value is RelayPeerState {
  return value === 'present' || value === 'absent' || value === 'joined' || value === 'left';
}

/** relay 모양이면 peer 값(알 수 없으면 undefined)을 담아 돌려주고, 아니면 null */
function relayObject(raw: string): { readonly peer: unknown } | null {
  // 알림은 짧다. 큰 프레임을 매번 JSON.parse하지 않도록 먼저 문자열로 거른다.
  if (raw.length > 256 || !raw.includes('"relay"')) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const relay =
      ('t' in value && value.t === 'relay') || ('type' in value && value.type === 'relay');
    return relay ? { peer: 'peer' in value ? value.peer : undefined } : null;
  } catch {
    return null;
  }
}

/** 중계 알림 모양(t 또는 type이 "relay")인 프레임인지. 중계는 클라이언트발 relay 프레임을 버린다 */
export function isRelayFrame(raw: string): boolean {
  return relayObject(raw) !== null;
}

/** 중계 알림을 읽는다. relay 프레임이지만 peer 값이 알 수 없는 것이면 null(무시) */
export function parseRelayNotice(raw: string): RelayNotice | null {
  const peer = relayObject(raw)?.peer;
  return isPeerState(peer) ? { t: 'relay', peer } : null;
}

/** 중계가 보내는 알림 문자열 (Android SmokeServer와 바이트 단위로 같다) */
export function encodeRelayNotice(peer: RelayPeerState): string {
  return `{"t":"relay","peer":"${peer}"}`;
}
