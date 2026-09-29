// 개발·E2E용 WebSocket 중계 서버. Android Ktor 중계(SmokeServer.kt RelayRoles)와 같은 규칙이다(#15·#24, plan.md 1.1).
// - /ws?role=host|guest. 역할마다 **최신 연결 하나**: 같은 역할이 다시 붙으면 이전 소켓을 4001 "replaced"로 닫는다.
//   교체된 소켓에서 늦게 도착한 프레임은 버린다. 교체는 상대에게 left를 보내지 않는다(joined만).
// - 알림 {"t":"relay","peer":…}: 새로 붙은 쪽에 present(상대 있음)·absent(없음), 상대에게 joined, 끊기면 상대에게 left.
//   상대가 없을 때 보낸 프레임은 버리고 보낸 쪽에 absent를 한 번만 알린다.
// - 호스트 메시지는 게스트로, 게스트 메시지는 호스트로 그대로 전달한다(내용은 해석하지 않는다).
//   단, 클라이언트가 보낸 relay 모양 프레임은 알림 위조가 되므로 전달하지 않는다.
// - 텍스트만(바이너리 1003), 64KB 초과 1009, 호스트 역할은 루프백 주소에서만(1008).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { newToken, tokenHash, validToken } from './auth.ts';
import { Rooms, displayCode, INVITE_LIFETIME } from './rooms.ts';
import { SocketLimit, WindowLimit } from './limits.ts';
import { StaticSite, type ReleaseConfig } from './static.ts';
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
    readonly releases?: readonly ReleaseConfig[];
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

function respondError(response: ServerResponse, code: number, message: string): void {
  response.writeHead(code).end(JSON.stringify({ error: message }));
}
function bearer(header: string | undefined): string {
  return header?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1] ?? '';
}

/** 공개 모드: 방/역할 인증과 수명은 LAN 중계와 독립적이다. */
async function startPublicRelay(options: RelayOptions): Promise<Relay> {
  const config = options.publicMode!;
  const rooms = new Rooms(config.creationSecret);
  const site = config.releases ? await StaticSite.load(config.releases) : undefined;
  const limits = new WindowLimit();
  const seats = new Map<string, Partial<Record<Role, WebSocket>>>();
  const absence = new Set<WebSocket>();
  const allowed = new Set(config.allowedOrigins);
  if (
    allowed.size === 0 ||
    [...allowed].some(
      (origin) =>
        !/^https:\/\/[^/]+$/.test(origin) && !/^http:\/\/127\.0\.0\.1(?::[0-9]+)?$/.test(origin),
    )
  )
    throw new Error('allowed origins required');
  const unauth = new Map<WebSocket, string>();
  const pending = new Map<
    string,
    {
      roomId: string;
      socket: WebSocket;
      kind: 'invite' | 'code';
      inviteToken?: string;
      until: number;
    }
  >();
  const outbound = new Map<WebSocket, { frames: number; bytes: number }>();
  const send = (ws: WebSocket | undefined, value: string): void => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const queue = outbound.get(ws) ?? { frames: 0, bytes: 0 };
    const size = Buffer.byteLength(value);
    if (
      queue.frames >= 64 ||
      queue.bytes + size > 1_048_576 ||
      ws.bufferedAmount + size > 1_048_576
    ) {
      ws.close(1009);
      return;
    }
    queue.frames++;
    queue.bytes += size;
    outbound.set(ws, queue);
    ws.send(value, () => {
      queue.frames--;
      queue.bytes -= size;
    });
  };
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(request.url ?? '/', 'http://relay.invalid');
    const ip = request.socket.remoteAddress ?? 'unknown';
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      if (!rooms.auth.canCreate(bearer(request.headers.authorization))) {
        respondError(response, 401, 'unauthorized');
        return;
      }
      if (!limits.take('create-minute', 3, 60_000) || !limits.take('create-day', 100, 86_400_000)) {
        respondError(response, 429, 'rate limited');
        return;
      }
      const created = rooms.create();
      if (!created) {
        respondError(response, 503, 'capacity');
        return;
      }
      response.writeHead(201).end(
        JSON.stringify({
          roomId: created.state.room.id,
          hostToken: created.hostToken,
          code: displayCode(created.state.code),
          expiresAt: created.state.expiresAt,
        }),
      );
      return;
    }
    const match = /^\/api\/rooms\/([A-Za-z0-9_-]{22})(?:\/(credentials))?$/.exec(url.pathname);
    if (match) {
      const state = rooms.get(match[1]!);
      if (!state || !rooms.auth.isHost(state.room, bearer(request.headers.authorization))) {
        respondError(response, 401, 'unauthorized');
        return;
      }
      if (request.method === 'DELETE' && !match[2]) {
        rooms.delete(state.room.id);
        for (const ws of Object.values(seats.get(state.room.id) ?? {})) ws?.close(1008);
        seats.delete(state.room.id);
        response.writeHead(204).end();
        return;
      }
      if (request.method === 'POST' && match[2] === 'credentials') {
        try {
          let body = '';
          for await (const chunk of request) {
            body += String(chunk);
            if (body.length > 2048) throw new Error('large');
          }
          const data: unknown = JSON.parse(body);
          if (!data || typeof data !== 'object') throw new Error('invalid');
          const { token, permission, expiresAt } = data as {
            token?: unknown;
            permission?: unknown;
            expiresAt?: unknown;
          };
          if (
            !validToken(token) ||
            (permission !== 'invite' && permission !== 'resume') ||
            typeof expiresAt !== 'number' ||
            expiresAt > state.expiresAt ||
            (permission === 'invite' && expiresAt > Date.now() + INVITE_LIFETIME) ||
            !rooms.auth.register(
              state.room,
              bearer(request.headers.authorization),
              token,
              permission,
              expiresAt,
            )
          )
            throw new Error('invalid');
          response.writeHead(201).end('{"ok":true}');
        } catch {
          respondError(response, 400, 'invalid request');
        }
        return;
      }
    }
    if (site?.handle(request, response)) return;
    // 존재/부재/점유를 구분하는 HTTP 조회 경로는 제공하지 않는다.
    if (request.method === 'POST' && url.pathname === '/api/join') {
      if (!limits.take(`join-ip:${ip}`, 10, 60_000)) {
        respondError(response, 429, 'rate limited');
        return;
      }
      respondError(response, 404, 'use join channel');
      return;
    }
    respondError(response, 404, 'not found');
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxPayload ?? RELAY_MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });
  const closePending = (id: string): void => {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    if (item.kind === 'invite' && item.inviteToken) {
      const state = rooms.get(item.roomId);
      if (state) rooms.release(state, item.inviteToken);
    }
  };
  const seat = (roomId: string, role: Role, socket: WebSocket): void => {
    const pair = seats.get(roomId) ?? {};
    const old = pair[role];
    pair[role] = socket;
    seats.set(roomId, pair);
    if (old) {
      absence.delete(old);
      old.close(CLOSE_REPLACED, 'replaced');
    }
    const peer = pair[other(role)];
    if (!peer) absence.add(socket);
    else absence.delete(peer);
    send(socket, encodeRelayNotice(peer ? 'present' : 'absent'));
    send(peer, encodeRelayNotice('joined'));
    if (role === 'host') {
      const state = rooms.get(roomId);
      if (state) delete state.hostLeftAt;
    }
  };
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://relay.invalid');
    if (
      (url.pathname !== RELAY_PATH && url.pathname !== '/join') ||
      !allowed.has(request.headers.origin ?? '')
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });
  wss.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '/', 'http://relay.invalid');
    const ip = request.socket.remoteAddress ?? 'unknown';
    const join = url.pathname === '/join';
    const roleParam = url.searchParams.get('role');
    const role: Role | null = roleParam === 'host' || roleParam === 'guest' ? roleParam : null;
    const roomId = url.searchParams.get('room');
    const code = url.searchParams.get('code') ?? '';
    const state = join ? rooms.byCode(code) : roomId ? rooms.get(roomId) : undefined;
    if (!join && ((role !== 'host' && role !== 'guest') || !state)) {
      socket.close(CLOSE_INVALID_ROLE);
      return;
    }
    if (
      !limits.take(`attempt-ip:${ip}`, 10, 60_000) ||
      (state && !limits.take(`attempt-room:${state.room.id}`, 10, 60_000))
    ) {
      socket.close(1013);
      return;
    }
    if (!join) {
      const perRoom = [...unauth.values()].filter((id) => id === roomId).length;
      if (unauth.size >= 8 || perRoom >= 2) {
        socket.close(1013);
        return;
      }
      unauth.set(socket, roomId!);
    }
    let authenticated = false;
    let waitClaim = false;
    const rate = new SocketLimit();
    let lastPong = Date.now();
    socket.on('pong', () => {
      lastPong = Date.now();
    });
    const authTimer = setTimeout(() => {
      if (!authenticated && !join) socket.close(CLOSE_INVALID_ROLE);
    }, 5000);
    if (join) {
      send(socket, JSON.stringify({ t: 'relay-join-pending' }));
      if (
        state &&
        !seats.get(state.room.id)?.guest &&
        [...pending.values()].filter((p) => p.roomId === state.room.id && p.kind === 'code')
          .length < 2
      ) {
        const id = newToken(16);
        pending.set(id, {
          roomId: state.room.id,
          socket,
          kind: 'code',
          until: Date.now() + 60_000,
        });
        send(
          seats.get(state.room.id)?.host,
          JSON.stringify({ t: 'relay-join-request', requestId: id }),
        );
      }
      setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          send(socket, JSON.stringify({ t: 'relay-join-unavailable' }));
          socket.close(1008);
        }
      }, 60_000).unref();
    }
    socket.on('message', (data, binary) => {
      if (binary) {
        socket.close(CLOSE_UNSUPPORTED);
        return;
      }
      if (join) {
        socket.close(CLOSE_INVALID_ROLE);
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
          /* invalid */
        }
        const current = roomId ? rooms.get(roomId) : undefined;
        const permission =
          current && (role === 'host' || role === 'guest')
            ? rooms.auth.authenticate(current.room, role, token)
            : null;
        if (
          !current ||
          !permission ||
          !validToken(token) ||
          !limits.take(`auth:${ip}`, 10, 60_000)
        ) {
          socket.close(CLOSE_INVALID_ROLE);
          return;
        }
        unauth.delete(socket);
        clearTimeout(authTimer);
        authenticated = true;
        if (permission === 'invite') {
          if (seats.get(current.room.id)?.guest || !rooms.claim(current, token)) {
            socket.close(CLOSE_INVALID_ROLE);
            return;
          }
          waitClaim = true;
          const id = newToken(16);
          pending.set(id, {
            roomId: current.room.id,
            socket,
            kind: 'invite',
            inviteToken: token,
            until: Date.now() + 30_000,
          });
          send(
            seats.get(current.room.id)?.host,
            JSON.stringify({ t: 'relay-claim', requestId: id }),
          );
          send(socket, JSON.stringify({ t: 'relay-claim-pending' }));
        } else if (role) seat(current.room.id, role, socket);
        return;
      }
      const current = roomId ? rooms.get(roomId) : undefined;
      if (!current || !role) {
        socket.close(CLOSE_INVALID_ROLE);
        return;
      }
      const pair = seats.get(current.room.id);
      if (waitClaim) {
        socket.close(CLOSE_INVALID_ROLE);
        return;
      }
      if (pair?.[role] !== socket) return;
      if (!rate.take(Buffer.byteLength(text))) {
        socket.close(1013);
        return;
      }
      if (role === 'host') {
        let control: { t?: unknown; requestId?: unknown; token?: unknown } | undefined;
        try {
          const parsed: unknown = JSON.parse(text);
          if (parsed && typeof parsed === 'object') control = parsed;
        } catch {
          /* game frame */
        }
        if (
          control?.t === 'relay-accept' &&
          typeof control.requestId === 'string' &&
          validToken(control.token)
        ) {
          const item = pending.get(control.requestId);
          if (
            item?.roomId === current.room.id &&
            item.until > Date.now() &&
            !pair.guest &&
            rooms.registerResume(current, control.token)
          ) {
            if (item.kind === 'invite' && item.inviteToken) {
              const key = tokenHash(item.inviteToken).toString('hex');
              current.room.credentials.delete(key);
              rooms.release(current, item.inviteToken);
            }
            current.joined = true;
            send(item.socket, JSON.stringify({ t: 'relay-accepted', token: control.token }));
            if (item.kind === 'invite') seat(current.room.id, 'guest', item.socket);
            else item.socket.close(1000);
            pending.delete(control.requestId);
          }
          return;
        }
      }
      if (isRelayFrame(text) || /"t"\s*:\s*"relay-/.test(text)) return;
      const peer = pair[other(role)];
      if (!peer || peer.readyState !== WebSocket.OPEN) {
        if (!absence.has(socket)) {
          absence.add(socket);
          send(socket, encodeRelayNotice('absent'));
        }
        return;
      }
      absence.delete(socket);
      send(peer, text);
    });
    socket.on('close', () => {
      clearTimeout(authTimer);
      unauth.delete(socket);
      absence.delete(socket);
      outbound.delete(socket);
      for (const [id, item] of pending) if (item.socket === socket) closePending(id);
      if (!roomId || (role !== 'host' && role !== 'guest')) return;
      const pair = seats.get(roomId);
      if (pair?.[role] !== socket) return;
      delete pair[role];
      send(pair[other(role)], encodeRelayNotice('left'));
      if (role === 'host') {
        const current = rooms.get(roomId);
        if (current) current.hostLeftAt = Date.now();
      }
    });
    socket.on('error', () => {});
    const heartbeat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPong >= 60_000) {
        socket.terminate();
        return;
      }
      socket.ping();
    }, 25_000);
    heartbeat.unref();
    socket.on('close', () => clearInterval(heartbeat));
  });
  const cleanup = setInterval(() => {
    for (const id of rooms.cleanup()) {
      for (const ws of Object.values(seats.get(id) ?? {})) ws?.close(1008);
      seats.delete(id);
    }
    for (const [id, item] of pending)
      if (item.until <= Date.now()) {
        send(item.socket, JSON.stringify({ t: 'relay-join-unavailable' }));
        item.socket.close(1008);
        closePending(id);
      }
    limits.cleanup();
  }, 10_000);
  cleanup.unref();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      resolve({
        port: typeof address === 'object' && address !== null ? address.port : 0,
        close: () =>
          new Promise<void>((done, fail) => {
            clearInterval(cleanup);
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
