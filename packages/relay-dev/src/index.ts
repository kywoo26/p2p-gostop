// 개발·E2E용 WebSocket 중계 서버. Android Ktor 중계(SmokeServer.kt RelayRoles)와 같은 규칙이다(#15·#24, plan.md 1.1).
// - /ws?role=host|guest. 역할마다 **최신 연결 하나**: 같은 역할이 다시 붙으면 이전 소켓을 4001 "replaced"로 닫는다.
//   교체된 소켓에서 늦게 도착한 프레임은 버린다. 교체는 상대에게 left를 보내지 않는다(joined만).
// - 알림 {"t":"relay","peer":…}: 새로 붙은 쪽에 present(상대 있음)·absent(없음), 상대에게 joined, 끊기면 상대에게 left.
//   상대가 없을 때 보낸 프레임은 버리고 보낸 쪽에 absent를 한 번만 알린다.
// - 호스트 메시지는 게스트로, 게스트 메시지는 호스트로 그대로 전달한다(내용은 해석하지 않는다).
//   단, 클라이언트가 보낸 relay 모양 프레임은 알림 위조가 되므로 전달하지 않는다.
// - 텍스트만(바이너리 1003), 64KB 초과 1009, 호스트 역할은 루프백 주소에서만(1008).
import type { IncomingMessage } from 'node:http';
import {
  RELAY_CLOSE_POLICY,
  RELAY_CLOSE_REPLACED,
  RELAY_CLOSE_UNSUPPORTED,
  RELAY_MAX_PAYLOAD_BYTES,
  RELAY_PATH,
  encodeRelayNotice,
  isRelayFrame,
  type RelayPeerState,
  type Role,
} from '@p2p-gostop/protocol';
import { WebSocket, WebSocketServer, type RawData } from 'ws';

/** 역할 파라미터가 없거나 잘못됨·호스트 비루프백 (RFC 6455 1008 Policy Violation) */
export const CLOSE_INVALID_ROLE = RELAY_CLOSE_POLICY;
/** 같은 역할의 새 연결로 교체됨 (Android와 같은 4001 "replaced") */
export const CLOSE_REPLACED = RELAY_CLOSE_REPLACED;
/** 바이너리 프레임 */
export const CLOSE_UNSUPPORTED = RELAY_CLOSE_UNSUPPORTED;

export interface RelayOptions {
  readonly port?: number;
  readonly host?: string;
  readonly maxPayload?: number;
  readonly log?: (line: string) => void;
  /** 원격 주소 판정 (테스트 주입용, 기본은 소켓 원격 주소) */
  readonly remoteAddress?: (request: IncomingMessage) => string | undefined;
}

export interface Relay {
  readonly port: number;
  close(): Promise<void>;
}

const other = (role: Role): Role => (role === 'host' ? 'guest' : 'host');
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function parseRole(url: string | undefined): Role | null {
  const role = new URL(url ?? '/', 'http://relay.invalid').searchParams.get('role');
  return role === 'host' || role === 'guest' ? role : null;
}

function toText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return (data instanceof ArrayBuffer ? Buffer.from(data) : data).toString('utf8');
}

function notify(socket: WebSocket | undefined, peer: RelayPeerState): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(encodeRelayNotice(peer));
}

export function startRelay(options: RelayOptions = {}): Promise<Relay> {
  const log = options.log ?? (() => {});
  const remote = options.remoteAddress ?? ((request) => request.socket.remoteAddress);
  const sockets: Partial<Record<Role, WebSocket>> = {};
  const absenceNotified = new Set<WebSocket>();
  const wss = new WebSocketServer({
    port: options.port ?? 0,
    host: options.host ?? '127.0.0.1',
    path: RELAY_PATH,
    maxPayload: options.maxPayload ?? RELAY_MAX_PAYLOAD_BYTES,
  });

  wss.on('connection', (socket, request) => {
    const role = parseRole(request.url);
    if (role === null) {
      socket.close(CLOSE_INVALID_ROLE, '{"error":"invalid role"}');
      return;
    }
    const address = remote(request);
    if (role === 'host' && (address === undefined || !LOOPBACK.has(address))) {
      log(`reject host from ${address ?? 'unknown'}`);
      socket.close(CLOSE_INVALID_ROLE, '{"error":"host requires loopback"}');
      return;
    }
    const old = sockets[role];
    if (old !== undefined) {
      absenceNotified.delete(old);
      old.close(CLOSE_REPLACED, 'replaced');
    }
    sockets[role] = socket;
    const peer = sockets[other(role)];
    if (peer === undefined) absenceNotified.add(socket);
    else absenceNotified.delete(peer);
    notify(socket, peer === undefined ? 'absent' : 'present');
    notify(peer, 'joined');
    log(`${role} ${old === undefined ? 'connected' : 'replaced'}`);

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        socket.close(CLOSE_UNSUPPORTED, 'text frames only');
        return;
      }
      if (sockets[role] !== socket) return; // 교체된 소켓에서 늦게 도착한 프레임
      const text = toText(data);
      if (isRelayFrame(text)) {
        log(`drop forged relay frame from ${role}`);
        return;
      }
      const target = sockets[other(role)];
      if (target === undefined || target.readyState !== WebSocket.OPEN) {
        if (!absenceNotified.has(socket)) {
          absenceNotified.add(socket);
          notify(socket, 'absent');
        }
        return;
      }
      absenceNotified.delete(socket);
      target.send(text);
    });
    socket.on('close', (code) => {
      absenceNotified.delete(socket);
      log(`${role} closed (${code})`);
      if (sockets[role] !== socket) return; // 교체된 소켓: 상대에게 left를 보내지 않는다
      delete sockets[role];
      const target = sockets[other(role)];
      if (target !== undefined) {
        absenceNotified.delete(target);
        notify(target, 'left');
      }
    });
    socket.on('error', (error) => log(`${role} error: ${error.message}`));
  });

  return new Promise((resolve, reject) => {
    wss.once('error', reject);
    wss.once('listening', () => {
      wss.off('error', reject);
      const address = wss.address();
      resolve({
        port: typeof address === 'object' && address !== null ? address.port : 0,
        close: () =>
          new Promise<void>((done, fail) => {
            for (const client of wss.clients) {
              client.terminate();
            }
            wss.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
