// 개발·E2E용 WebSocket 중계 서버. Android Ktor 중계(SmokeServer.kt RelayRoles)와 같은 규칙이다(#15·#24, plan.md 1.1).
// - /ws?role=host|guest. 역할마다 **최신 연결 하나**: 같은 역할이 다시 붙으면 이전 소켓을 4001 "replaced"로 닫는다.
//   교체된 소켓에서 늦게 도착한 프레임은 버린다. 교체는 상대에게 left를 보내지 않는다(joined만).
// - 알림 {"t":"relay","peer":…}: 새로 붙은 쪽에 present(상대 있음)·absent(없음), 상대에게 joined, 끊기면 상대에게 left.
//   상대가 없을 때 보낸 프레임은 버리고 보낸 쪽에 absent를 한 번만 알린다.
// - 호스트 메시지는 게스트로, 게스트 메시지는 호스트로 그대로 전달한다(내용은 해석하지 않는다).
//   단, 클라이언트가 보낸 relay 모양 프레임은 알림 위조가 되므로 전달하지 않는다.
// - 텍스트만(바이너리 1003), 64KB 초과 1009. LAN 호스트만 루프백 주소로 제한한다(1008).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { newToken, validToken } from './auth.ts';
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
    /** 결정적 경계 테스트용 시계. 운영 시 Date.now와 Node 타이머를 쓴다. */
    readonly clock?: RelayClock;
    /** 송신 완료 지연을 주입하는 테스트 훅. */
    readonly sendFrame?: (socket: WebSocket, value: string, done: () => void) => void;
  };
}

export interface Relay {
  readonly port: number;
  close(): Promise<void>;
}

const other = (role: Role): Role => (role === 'host' ? 'guest' : 'host');
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
interface RelayTimer {
  cancel(): void;
  unref(): void;
}
interface RelayClock {
  now(): number;
  timeout(callback: () => void, delay: number): RelayTimer;
  interval(callback: () => void, delay: number): RelayTimer;
}
const systemClock: RelayClock = {
  now: () => Date.now(),
  timeout(callback, delay) {
    const timer = setTimeout(callback, delay);
    return { cancel: () => clearTimeout(timer), unref: () => timer.unref() };
  },
  interval(callback, delay) {
    const timer = setInterval(callback, delay);
    return { cancel: () => clearInterval(timer), unref: () => timer.unref() };
  },
};

function parseRole(url: string | undefined): Role | null {
  try {
    const role = new URL(url ?? '/', 'http://relay.invalid').searchParams.get('role');
    return role === 'host' || role === 'guest' ? role : null;
  } catch {
    return null;
  }
}

function requestUrl(raw: string | undefined): URL | null {
  try {
    return new URL(raw ?? '/', 'http://relay.invalid');
  } catch {
    return null;
  }
}

function joinNickname(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const cleaned = raw
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  let nickname = '';
  let length = 0;
  for (const { segment } of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(
    cleaned,
  )) {
    if (length >= 20) break;
    nickname += segment;
    length++;
  }
  return nickname.trimEnd() || undefined;
}

function isReservedControlFrame(raw: string): boolean {
  if (isRelayFrame(raw)) return true;
  try {
    const value: unknown = JSON.parse(raw);
    return !!(
      value &&
      typeof value === 'object' &&
      't' in value &&
      typeof value.t === 'string' &&
      value.t.startsWith('relay-')
    );
  } catch {
    return false;
  }
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
    socket.on('error', (error) => log(`socket error: ${error.message}`));
    socket.on('close', () => absenceNotified.delete(socket));
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
  const clock = config.clock ?? systemClock;
  const now = (): number => clock.now();
  const remote =
    options.remoteAddress ?? ((request: IncomingMessage) => request.socket.remoteAddress);
  const rooms = new Rooms(config.creationSecret);
  const site = config.releases ? await StaticSite.load(config.releases) : undefined;
  const limits = new WindowLimit();
  const seats = new Map<string, Partial<Record<Role, WebSocket>>>();
  const absence = new Set<WebSocket>();
  const allowed = new Set(
    config.allowedOrigins.length > 0 ? config.allowedOrigins : ['http://127.0.0.1:17777'],
  );
  if (
    [...allowed].some(
      (origin) =>
        !/^https:\/\/[^/]+$/.test(origin) && !/^http:\/\/127\.0\.0\.1(?::[0-9]+)?$/.test(origin),
    )
  )
    throw new Error('allowed origins required');
  const unauth = new Map<WebSocket, string>();
  const claiming = new Set<WebSocket>();
  const pending = new Map<
    string,
    {
      roomId: string;
      socket: WebSocket;
      kind: 'invite' | 'code';
      inviteKey?: string;
      nickname?: string;
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
    const done = (): void => {
      queue.frames--;
      queue.bytes -= size;
    };
    if (config.sendFrame) config.sendFrame(ws, value, done);
    else ws.send(value, done);
  };
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const url = requestUrl(request.url);
    if (!url) {
      respondError(response, 400, 'invalid request');
      return;
    }
    const corsPath =
      url.pathname === '/health' ||
      url.pathname === '/version' ||
      url.pathname === '/api/rooms' ||
      url.pathname.startsWith('/api/rooms/');
    const origin = request.headers.origin;
    if (corsPath && origin && allowed.has(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      if (!corsPath || !origin || !allowed.has(origin)) {
        respondError(response, 403, 'forbidden');
        return;
      }
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.setHeader('Access-Control-Max-Age', '600');
      response.writeHead(204).end();
      return;
    }
    const ip = remote(request) ?? 'unknown';
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      if (!rooms.auth.canCreate(bearer(request.headers.authorization))) {
        respondError(response, 401, 'unauthorized');
        return;
      }
      rooms.cleanup(now());
      if (rooms.states.size >= 4) {
        respondError(response, 503, 'capacity');
        return;
      }
      if (
        !limits.take('create-minute', 3, 60_000, now()) ||
        !limits.take('create-day', 100, 86_400_000, now())
      ) {
        respondError(response, 429, 'rate limited');
        return;
      }
      const created = rooms.create(now());
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
      const state = rooms.get(match[1]!, now());
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
            (permission === 'invite' && expiresAt > now() + INVITE_LIFETIME) ||
            !rooms.auth.register(
              state.room,
              bearer(request.headers.authorization),
              token,
              permission,
              expiresAt,
              now(),
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
      if (!limits.take(`join-ip:${ip}`, 10, 60_000, now())) {
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
    if (item.kind === 'invite' && item.inviteKey) {
      const state = rooms.get(item.roomId, now());
      if (state) rooms.release(state, item.inviteKey);
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
      const state = rooms.get(roomId, now());
      if (state) delete state.hostLeftAt;
    }
  };
  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {});
    const url = requestUrl(request.url);
    if (
      !url ||
      (url.pathname !== RELAY_PATH && url.pathname !== '/join') ||
      !allowed.has(request.headers.origin ?? '')
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });
  wss.on('connection', (socket, request) => {
    let roomId: string | null = null;
    let role: Role | null = null;
    let authTimer: RelayTimer | undefined;
    let joinTimer: RelayTimer | undefined;
    let heartbeat: RelayTimer | undefined;
    socket.on('error', () => {});
    socket.on('close', () => {
      authTimer?.cancel();
      joinTimer?.cancel();
      heartbeat?.cancel();
      unauth.delete(socket);
      claiming.delete(socket);
      absence.delete(socket);
      outbound.delete(socket);
      for (const [id, item] of pending) if (item.socket === socket) closePending(id);
      if (!roomId || !role) return;
      const pair = seats.get(roomId);
      if (pair?.[role] !== socket) return;
      delete pair[role];
      send(pair[other(role)], encodeRelayNotice('left'));
      if (role === 'host') {
        const current = rooms.get(roomId, now());
        if (current) current.hostLeftAt = now();
      }
    });
    const url = requestUrl(request.url);
    if (!url) {
      socket.close(CLOSE_INVALID_ROLE);
      return;
    }
    const ip = remote(request) ?? 'unknown';
    const join = url.pathname === '/join';
    const roleParam = url.searchParams.get('role');
    role = roleParam === 'host' || roleParam === 'guest' ? roleParam : null;
    roomId = url.searchParams.get('room');
    const code = url.searchParams.get('code') ?? '';
    const nickname = join ? joinNickname(url.searchParams.get('name')) : undefined;
    const state = join ? rooms.byCode(code, now()) : roomId ? rooms.get(roomId, now()) : undefined;
    if (!join && ((role !== 'host' && role !== 'guest') || !state)) {
      socket.close(CLOSE_INVALID_ROLE);
      return;
    }
    if (!limits.take(`attempt-ip:${ip}`, 10, 60_000, now())) {
      socket.close(1013);
      return;
    }
    const roomAllowed = state
      ? limits.take(`attempt-room:${state.room.id}`, 10, 60_000, now())
      : true;
    // 코드 채널은 방당 제한에 닿아도 무효 코드와 같은 대기 응답을 보낸다.
    if (!join && !roomAllowed) {
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
    const rate = new SocketLimit();
    let lastPong = now();
    let lastPing = now();
    socket.on('pong', () => {
      lastPong = now();
    });
    authTimer = clock.timeout(() => {
      if (!authenticated && !join) socket.close(CLOSE_INVALID_ROLE);
    }, 5000);
    if (join) {
      send(socket, JSON.stringify({ t: 'relay-join-pending' }));
      if (
        state &&
        roomAllowed &&
        !seats.get(state.room.id)?.guest &&
        [...pending.values()].filter((p) => p.roomId === state.room.id && p.kind === 'code')
          .length < 2
      ) {
        const id = newToken(16);
        pending.set(id, {
          roomId: state.room.id,
          socket,
          kind: 'code',
          ...(nickname ? { nickname } : {}),
          until: now() + 60_000,
        });
        send(
          seats.get(state.room.id)?.host,
          JSON.stringify({
            t: 'relay-join-request',
            requestId: id,
            ...(nickname ? { nickname } : {}),
          }),
        );
      }
      joinTimer = clock.timeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          send(socket, JSON.stringify({ t: 'relay-join-unavailable' }));
          socket.close(1008);
        }
      }, 60_000);
      joinTimer.unref();
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
        const current = roomId ? rooms.get(roomId, now()) : undefined;
        const permission =
          current && (role === 'host' || role === 'guest')
            ? rooms.auth.authenticate(current.room, role, token, now())
            : null;
        if (permission === 'expired') {
          socket.close(4003, 'expired');
          return;
        }
        if (
          !current ||
          !permission ||
          !validToken(token) ||
          !limits.take(`auth:${ip}`, 10, 60_000, now())
        ) {
          socket.close(CLOSE_INVALID_ROLE);
          return;
        }
        unauth.delete(socket);
        authTimer?.cancel();
        authenticated = true;
        if (permission === 'invite') {
          const claimKey = seats.get(current.room.id)?.guest
            ? null
            : rooms.claim(current, token, now());
          if (!claimKey) {
            socket.close(CLOSE_INVALID_ROLE);
            return;
          }
          claiming.add(socket);
          const id = newToken(16);
          pending.set(id, {
            roomId: current.room.id,
            socket,
            kind: 'invite',
            inviteKey: claimKey,
            until: now() + 30_000,
          });
          send(
            seats.get(current.room.id)?.host,
            JSON.stringify({ t: 'relay-claim', requestId: id }),
          );
          send(socket, JSON.stringify({ t: 'relay-claim-pending' }));
        } else if (role) seat(current.room.id, role, socket);
        return;
      }
      const current = roomId ? rooms.get(roomId, now()) : undefined;
      if (!current || !role) {
        socket.close(CLOSE_INVALID_ROLE);
        return;
      }
      const pair = seats.get(current.room.id);
      if (claiming.has(socket)) {
        socket.close(CLOSE_INVALID_ROLE);
        return;
      }
      if (pair?.[role] !== socket) return;
      if (!rate.take(Buffer.byteLength(text), now())) {
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
        if (control?.t === 'relay-deny' && typeof control.requestId === 'string') {
          const item = pending.get(control.requestId);
          if (item?.roomId === current.room.id && item.until > now()) {
            closePending(control.requestId);
            send(
              item.socket,
              JSON.stringify({
                t: item.kind === 'code' ? 'relay-join-denied' : 'relay-claim-denied',
              }),
            );
            item.socket.close(1000);
          }
          return;
        }
        if (
          control?.t === 'relay-accept' &&
          typeof control.requestId === 'string' &&
          validToken(control.token)
        ) {
          const item = pending.get(control.requestId);
          if (
            item?.roomId === current.room.id &&
            item.until > now() &&
            !pair.guest &&
            (item.kind === 'invite'
              ? !!item.inviteKey && rooms.confirm(current, item.inviteKey, control.token, now())
              : rooms.acceptCode(current, control.token, now()))
          ) {
            claiming.delete(item.socket);
            send(
              item.socket,
              JSON.stringify({
                t: 'relay-accepted',
                roomId: current.room.id,
                token: control.token,
              }),
            );
            if (item.kind === 'invite') seat(current.room.id, 'guest', item.socket);
            else item.socket.close(1000);
            pending.delete(control.requestId);
          }
          return;
        }
      }
      if (isReservedControlFrame(text)) return;
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
    heartbeat = clock.interval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const at = now();
      if (at - lastPong >= 60_000) {
        socket.terminate();
        return;
      }
      if (at - lastPing >= 25_000) {
        socket.ping();
        lastPing = at;
      }
    }, 5_000);
    heartbeat.unref();
  });
  const cleanup = clock.interval(() => {
    for (const id of rooms.cleanup(now())) {
      for (const ws of Object.values(seats.get(id) ?? {})) ws?.close(1008);
      seats.delete(id);
    }
    for (const [id, item] of pending)
      if (item.until <= now()) {
        send(item.socket, JSON.stringify({ t: 'relay-join-unavailable' }));
        item.socket.close(1008);
        closePending(id);
      }
    limits.cleanup(now());
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
            cleanup.cancel();
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
