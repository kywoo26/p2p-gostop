// 개발·E2E용 WebSocket 중계 서버 (plan.md 1.1 중계 규칙, Android Ktor 중계와 같은 동작).
// - /ws?role=host 소켓 1개, /ws?role=guest 소켓 1개만 받는다. 같은 역할이 이미 있으면 거절한다.
// - 호스트의 메시지는 게스트로, 게스트의 메시지는 호스트로 그대로 전달한다(내용은 해석하지 않는다).
// - 상대가 없으면 버린다(버퍼링 없음). 64KB를 넘는 메시지는 연결을 닫는다(1009).
import { RELAY_MAX_PAYLOAD_BYTES, RELAY_PATH, type Role } from '@p2p-gostop/protocol';
import { WebSocket, WebSocketServer } from 'ws';

/** 역할 파라미터가 없거나 잘못됨 (RFC 6455 1008 Policy Violation) */
export const CLOSE_INVALID_ROLE = 1008;
/** 같은 역할이 이미 연결되어 있음 (애플리케이션 정의 코드) */
export const CLOSE_ROLE_TAKEN = 4409;

export interface RelayOptions {
  readonly port?: number;
  readonly host?: string;
  readonly maxPayload?: number;
  readonly log?: (line: string) => void;
}

export interface Relay {
  readonly port: number;
  close(): Promise<void>;
}

const other = (role: Role): Role => (role === 'host' ? 'guest' : 'host');

function parseRole(url: string | undefined): Role | null {
  const role = new URL(url ?? '/', 'http://relay.invalid').searchParams.get('role');
  return role === 'host' || role === 'guest' ? role : null;
}

export function startRelay(options: RelayOptions = {}): Promise<Relay> {
  const log = options.log ?? (() => {});
  const sockets: Partial<Record<Role, WebSocket>> = {};
  const wss = new WebSocketServer({
    port: options.port ?? 0,
    host: options.host ?? '127.0.0.1',
    path: RELAY_PATH,
    maxPayload: options.maxPayload ?? RELAY_MAX_PAYLOAD_BYTES,
  });

  wss.on('connection', (socket, request) => {
    const role = parseRole(request.url);
    if (role === null) {
      socket.close(CLOSE_INVALID_ROLE, 'role must be host or guest');
      return;
    }
    if (sockets[role] !== undefined) {
      log(`reject duplicate ${role}`);
      socket.close(CLOSE_ROLE_TAKEN, `${role} already connected`);
      return;
    }
    sockets[role] = socket;
    log(`${role} connected`);

    socket.on('message', (data, isBinary) => {
      const peer = sockets[other(role)];
      if (peer !== undefined && peer.readyState === WebSocket.OPEN) {
        peer.send(data, { binary: isBinary });
      }
    });
    socket.on('close', (code) => {
      if (sockets[role] === socket) {
        delete sockets[role];
      }
      log(`${role} closed (${code})`);
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
