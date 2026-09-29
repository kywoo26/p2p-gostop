// 개발·E2E용 WebSocket 중계 서버. Android Ktor 중계(SmokeServer.kt RelayRoles)와 같은 규칙이다(#15·#24, plan.md 1.1).
// - /ws?role=host|guest. 역할마다 **최신 연결 하나**: 같은 역할이 다시 붙으면 이전 소켓을 4001 "replaced"로 닫는다.
//   교체된 소켓에서 늦게 도착한 프레임은 버린다. 교체는 상대에게 left를 보내지 않는다(joined만).
// - 알림 {"t":"relay","peer":…}: 새로 붙은 쪽에 present(상대 있음)·absent(없음), 상대에게 joined, 끊기면 상대에게 left.
//   상대가 없을 때 보낸 프레임은 버리고 보낸 쪽에 absent를 한 번만 알린다.
// - 호스트 메시지는 게스트로, 게스트 메시지는 호스트로 그대로 전달한다(내용은 해석하지 않는다).
//   단, 클라이언트가 보낸 relay 모양 프레임은 알림 위조가 되므로 전달하지 않는다.
// - 텍스트만(바이너리 1003), 64KB 초과 1009, 호스트 역할은 루프백 주소에서만(1008).
import { createServer, type IncomingMessage } from 'node:http';
import { RoomAuth, validToken } from './auth.ts';
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
  readonly publicMode?: {
    readonly creationSecret: string;
    readonly allowedOrigins: readonly string[];
  };
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
  if (options.publicMode) return startPublicRelay(options);
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

/** 공개 모드는 별도 HTTP 서버와 방별 인증된 소켓을 사용한다. LAN 분기는 그대로 둔다. */
function startPublicRelay(options: RelayOptions): Promise<Relay> {
  const config = options.publicMode!;
  const auth = new RoomAuth(config.creationSecret);
  const seats = new Map<string, Partial<Record<Role, WebSocket>>>();
  const absence = new Set<WebSocket>();
  const allowed = new Set(config.allowedOrigins);
  if (allowed.size === 0 || [...allowed].some((origin) => !origin.startsWith('https://')))
    throw new Error('HTTPS allowed origins required');
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    const url = new URL(request.url ?? '/', 'http://relay.invalid');
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      const credential = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
      if (!auth.canCreate(credential)) {
        response.writeHead(401).end('{"error":"unauthorized"}');
        return;
      }
      const { room, hostToken } = auth.create();
      response.writeHead(201).end(JSON.stringify({ roomId: room.id, hostToken }));
      return;
    }
    const match = /^\/api\/rooms\/([A-Za-z0-9_-]{22})\/credentials$/.exec(url.pathname);
    if (request.method === 'POST' && match) {
      const room = auth.rooms.get(match[1]!);
      const hostToken = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
      if (!room || !auth.isHost(room, hostToken)) {
        response.writeHead(401).end('{"error":"unauthorized"}');
        return;
      }
      let body = '';
      try {
        for await (const chunk of request) {
          body += String(chunk);
          if (body.length > 2048) throw new Error('too large');
        }
        const data: unknown = JSON.parse(body);
        if (!data || typeof data !== 'object') throw new Error('invalid');
        const { token, permission, expiresAt } = data as {
          token?: unknown;
          permission?: unknown;
          expiresAt?: unknown;
        };
        if (
          (permission !== 'invite' && permission !== 'resume') ||
          typeof expiresAt !== 'number' ||
          !auth.register(room, hostToken, token, permission, expiresAt)
        )
          throw new Error('invalid');
        response.writeHead(201).end('{"ok":true}');
      } catch {
        response.writeHead(400).end('{"error":"invalid request"}');
      }
      return;
    }
    response.writeHead(404).end('{"error":"not found"}');
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxPayload ?? RELAY_MAX_PAYLOAD_BYTES,
  });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://relay.invalid');
    if (url.pathname !== RELAY_PATH || !allowed.has(request.headers.origin ?? '')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });
  wss.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '/', 'http://relay.invalid');
    const role = url.searchParams.get('role');
    const roomId = url.searchParams.get('room');
    if ((role !== 'host' && role !== 'guest') || !roomId || !auth.rooms.has(roomId)) {
      socket.close(CLOSE_INVALID_ROLE);
      return;
    }
    const room = auth.rooms.get(roomId)!;
    let authenticated = false;
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => socket.close(CLOSE_INVALID_ROLE),
      5000,
    );
    socket.on('message', (data, binary) => {
      if (binary) {
        socket.close(CLOSE_UNSUPPORTED);
        return;
      }
      const text = toText(data);
      if (!authenticated) {
        let token: unknown;
        try {
          const frame: unknown = JSON.parse(text);
          if (frame && typeof frame === 'object' && (frame as { t?: unknown }).t === 'relay-auth')
            token = (frame as { token?: unknown }).token;
        } catch {
          /* invalid auth */
        }
        if (!validToken(token) || auth.authenticate(room, role, token) === null) {
          socket.close(CLOSE_INVALID_ROLE);
          return;
        }
        authenticated = true;
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        const pair = seats.get(room.id) ?? {};
        const old = pair[role];
        pair[role] = socket;
        seats.set(room.id, pair);
        if (old) {
          absence.delete(old);
          old.close(CLOSE_REPLACED, 'replaced');
        }
        const peer = pair[other(role)];
        if (!peer) absence.add(socket);
        else absence.delete(peer);
        notify(socket, peer ? 'present' : 'absent');
        notify(peer, 'joined');
        return;
      }
      const pair = seats.get(room.id);
      if (pair?.[role] !== socket || isRelayFrame(text)) return;
      const peer = pair[other(role)];
      if (!peer || peer.readyState !== WebSocket.OPEN) {
        if (!absence.has(socket)) {
          absence.add(socket);
          notify(socket, 'absent');
        }
        return;
      }
      absence.delete(socket);
      peer.send(text);
    });
    socket.on('close', () => {
      if (timer) clearTimeout(timer);
      absence.delete(socket);
      const pair = seats.get(room.id);
      if (pair?.[role] !== socket) return;
      delete pair[role];
      notify(pair[other(role)], 'left');
    });
    socket.on('error', () => {});
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      server.off('error', reject);
      resolve({
        port: (() => {
          const address = server.address();
          return typeof address === 'object' && address !== null ? address.port : 0;
        })(),
        close: () =>
          new Promise<void>((done, fail) => {
            for (const ws of wss.clients) ws.terminate();
            wss.close((error) => {
              if (error) {
                fail(error);
                return;
              }
              server.close((serverError) => (serverError ? fail(serverError) : done()));
            });
          }),
      });
    });
  });
}
