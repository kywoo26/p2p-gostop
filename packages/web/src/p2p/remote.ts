// RP-04B: 공개 중계의 방/역할 인증 수명. 게임 hello·snapshot은 기존 HostGame/GuestGame이 맡는다.
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';
import {
  checkPublicHealth,
  createPublicJoinChannel,
  createPublicTransport,
  loadRemoteHostSettings,
  parseRelayOrigin,
  RelayHealthError,
  type HealthResult,
  type RelayHealthErrorCode,
  type SettingsStore,
} from '../net/index.ts';
import type {
  ConnectionEvent,
  RelayControl,
  WsTransport,
  WsTransportOptions,
} from '../net/ws-transport.ts';

/** 원격 방 연결의 UI 상태. */
export type RemoteState =
  'idle' | 'checking' | 'creating' | 'waiting' | 'connected' | 'reconnecting' | 'ended' | 'error';

/** 원인별 복구/안내에 사용할 코드. 사용자에게 보여 줄 문구는 UI가 결정한다. */
export type RemoteErrorCode =
  | RelayHealthErrorCode
  | 'auth'
  | 'replaced'
  | 'host-absent'
  | 'room-ended'
  | 'version'
  | 'network'
  | 'expired'
  | 'invalid'
  | 'unavailable'
  | 'denied'
  | 'timeout';

/** 방의 공개 정보. inviteLink의 비밀은 URL fragment에만 있다. */
export interface RemoteRoom {
  roomId: string;
  code: string; // XXXX-XXXX-XXXX
  expiresAt: number;
  inviteLink: string;
}

/** 참여 요청. invite는 내부에서 바로 수락하고 code만 UI 승인을 기다린다. */
export interface JoinRequest {
  id: string;
  kind: 'invite' | 'code';
  nickname?: string;
  receivedAt: number;
  expiresAt: number;
}

/** 구독자에게 전달하는 현재 원격 세션 상태. */
export interface RemoteSnapshot {
  state: RemoteState;
  error?: RemoteErrorCode | undefined;
  room?: RemoteRoom | undefined;
  requests: readonly JoinRequest[];
  peerPresent: boolean;
  reconnectAttempt?: number;
}

/** 호스트의 방 생성, 참여 승인, 복구 및 종료 동작. */
export interface RemoteHostController {
  readonly snapshot: RemoteSnapshot;
  subscribe(cb: (s: RemoteSnapshot) => void): () => void;
  checkHealth(): Promise<HealthResult>;
  createRoom(): Promise<RemoteRoom>;
  accept(requestId: string): Promise<void>;
  deny(requestId: string): void;
  retry(): void;
  close(): Promise<void>;
}

/** 참여가 끝나면 기존 GuestGame에 동일 transport를 전달한다. */
export type JoinOutcome = { ok: true } | { ok: false; code: RemoteErrorCode };

/** 게스트의 명시적 참여, 같은 방 복귀 및 종료 동작. */
export interface RemoteGuestController {
  readonly snapshot: RemoteSnapshot;
  subscribe(cb: (s: RemoteSnapshot) => void): () => void;
  joinByLink(url: string, nickname: string): Promise<JoinOutcome>;
  joinByCode(origin: string, code: string, nickname: string): Promise<JoinOutcome>;
  resume(): Promise<JoinOutcome>;
  retry(): void;
  leave(): void;
}

/** 의존성은 UI에서 주입하며, 생성 자격은 settings에만 저장한다. */
export interface RemoteHostDeps {
  settings: SettingsStore;
  storage: SettingsStore;
  /** restored일 때만 같은 roomId의 HostGame 저장 상태를 복원한다. */
  onTransport: (transport: WsTransport, roomId: string, restored: boolean) => void;
  fetcher?: typeof fetch;
  socketFactory?: (url: string) => WebSocket;
  now?: () => number;
}

/** allowedOrigin은 사용자가 확인한 중계 주소다. 링크의 주소만으로 신뢰하지 않는다. */
export interface RemoteGuestDeps {
  allowedOrigin: string;
  storage: SettingsStore;
  /** 기존 GuestGame 복원 상태는 roomId로 분리한다. */
  onTransport: (transport: WsTransport, nickname: string, roomId: string) => void;
  socketFactory?: (url: string) => WebSocket;
  now?: () => number;
}

const HOST_KEY = 'p2p-gostop.remote-room.v1';
const GUEST_ACTIVE_KEY = 'p2p-gostop.remote-guest-active.v1';
const GUEST_KEY = 'p2p-gostop.remote-guest.v1.';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ROOM_ID = /^[A-Za-z0-9_-]{22}$/;
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(?:-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){2}$/;
const INVITE_MS = 15 * 60_000;
const ROOM_MS = 6 * 60 * 60_000;
const empty: RemoteSnapshot = { state: 'idle', requests: [], peerPresent: false };

interface HostRecord {
  readonly origin: string;
  readonly hostToken: string;
  readonly room: RemoteRoom;
}

interface GuestRecord {
  readonly origin: string;
  readonly roomId: string;
  readonly token: string;
  readonly nickname: string;
  readonly expiresAt: number;
}

class RemoteFailure extends Error {
  readonly code: RemoteErrorCode;
  constructor(code: RemoteErrorCode) {
    super(code);
    this.code = code;
  }
}

function codeOf(error: unknown): RemoteErrorCode {
  if (error instanceof RemoteFailure || error instanceof RelayHealthError) return error.code;
  return 'network';
}

function get(store: SettingsStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function put(store: SettingsStore, key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소가 차단되어도 현재 탭의 연결은 계속 사용한다.
  }
}

function remove(store: SettingsStore, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // 저장소가 차단되면 더 이상 복귀 자격을 읽을 수 없다.
  }
}

function token32(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/** 전송층 재접속 타이머를 원격 정책(1→2→4초, 최대 30초)에 맞춘다. */
function remoteTransportOptions(
  socketFactory?: (url: string) => WebSocket,
): Pick<WsTransportOptions, 'socketFactory' | 'scheduler' | 'probeTimeoutMs'> {
  const scheduler = {
    setTimeout(handler: () => void, ms: number): ReturnType<typeof setTimeout> {
      const retry = new Map([
        [500, 1_000],
        [1_000, 2_000],
        [2_000, 4_000],
        [4_000, 8_000],
        [8_000, 16_000],
        [16_000, 30_000],
        [30_000, 30_000],
      ]).get(ms);
      if (retry === undefined) return setTimeout(handler, ms);
      const random = crypto.getRandomValues(new Uint32Array(1))[0]! / 0xffffffff;
      return setTimeout(handler, Math.min(30_000, Math.round(retry * (0.9 + random * 0.2))));
    },
    clearTimeout(id: ReturnType<typeof setTimeout>): void {
      clearTimeout(id);
    },
    setInterval(handler: () => void, ms: number): ReturnType<typeof setInterval> {
      return setInterval(handler, ms);
    },
    clearInterval(id: ReturnType<typeof setInterval>): void {
      clearInterval(id);
    },
  };
  return {
    ...(socketFactory ? { socketFactory } : {}),
    scheduler,
    probeTimeoutMs: 4_001,
  };
}

function validHost(value: unknown, now: number): HostRecord | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<HostRecord>;
  const room = item.room;
  if (
    typeof item.origin !== 'string' ||
    typeof item.hostToken !== 'string' ||
    !TOKEN.test(item.hostToken) ||
    !room ||
    typeof room.roomId !== 'string' ||
    !ROOM_ID.test(room.roomId) ||
    typeof room.code !== 'string' ||
    !CODE.test(room.code) ||
    typeof room.expiresAt !== 'number' ||
    room.expiresAt <= now ||
    room.expiresAt > now + ROOM_MS ||
    typeof room.inviteLink !== 'string'
  )
    return null;
  try {
    if (parseRelayOrigin(item.origin) !== new URL(room.inviteLink).origin) return null;
  } catch {
    return null;
  }
  return item as HostRecord;
}

function validGuest(value: unknown, now: number): GuestRecord | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<GuestRecord>;
  if (
    typeof item.origin !== 'string' ||
    typeof item.roomId !== 'string' ||
    !ROOM_ID.test(item.roomId) ||
    typeof item.token !== 'string' ||
    !TOKEN.test(item.token) ||
    typeof item.nickname !== 'string' ||
    item.nickname.trim() === '' ||
    typeof item.expiresAt !== 'number' ||
    item.expiresAt <= now ||
    item.expiresAt > now + ROOM_MS
  )
    return null;
  try {
    parseRelayOrigin(item.origin);
  } catch {
    return null;
  }
  return item as GuestRecord;
}

function requireNickname(value: string): string {
  const nickname = value.trim();
  if (nickname.length < 1 || nickname.length > 12) throw new RemoteFailure('invalid');
  return nickname;
}

async function responseJson(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  expected: number,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    throw new RemoteFailure('network');
  }
  if (response.status !== expected) {
    if (response.status === 401 || response.status === 403) throw new RemoteFailure('auth');
    if (response.status === 429 || response.status === 503) throw new RemoteFailure('unavailable');
    if (response.status === 404) throw new RemoteFailure('room-ended');
    throw new RemoteFailure('invalid');
  }
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new RemoteFailure('invalid');
    return value as Record<string, unknown>;
  } catch {
    throw new RemoteFailure('invalid');
  }
}

function onConnection(
  event: ConnectionEvent,
  current: RemoteSnapshot,
  update: (patch: Partial<RemoteSnapshot>) => void,
  guest: boolean,
): void {
  if (event.type === 'peer') {
    const present = event.peer === 'present' || event.peer === 'joined';
    update({
      peerPresent: present,
      state: present ? 'connected' : 'waiting',
      ...(present ? { error: undefined } : guest ? { error: 'host-absent' as const } : {}),
      reconnectAttempt: 0,
    });
  } else if (event.type === 'open') {
    update({ state: current.peerPresent ? 'connected' : 'waiting', reconnectAttempt: 0 });
  } else if (event.type === 'close' && event.retryInMs !== null) {
    update({
      state: 'reconnecting',
      peerPresent: false,
      reconnectAttempt: (current.reconnectAttempt ?? 0) + 1,
      error:
        event.code === 1013
          ? 'unavailable'
          : guest && current.error === 'host-absent'
            ? 'host-absent'
            : 'network',
    });
  } else if (event.type === 'stopped') {
    update({
      state: 'error',
      peerPresent: false,
      error: event.reason === 'replaced' ? 'replaced' : 'auth',
    });
  }
}

class SnapshotSource {
  protected value: RemoteSnapshot = empty;
  private readonly listeners = new Set<(value: RemoteSnapshot) => void>();

  get snapshot(): RemoteSnapshot {
    return this.value;
  }
  subscribe(cb: (value: RemoteSnapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.value);
    return () => {
      this.listeners.delete(cb);
    };
  }
  protected update(patch: Partial<RemoteSnapshot>): void {
    this.value = { ...this.value, ...patch };
    for (const listener of this.listeners) listener(this.value);
  }
}

class HostController extends SnapshotSource implements RemoteHostController {
  private readonly deps: RemoteHostDeps;
  private readonly now: () => number;
  private readonly fetcher: typeof fetch;
  private record: HostRecord | null = null;
  private transport: WsTransport | null = null;
  private healthAbort: AbortController | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private readonly requestTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(deps: RemoteHostDeps) {
    super();
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.fetcher = deps.fetcher ?? fetch;
  }

  async checkHealth(): Promise<HealthResult> {
    const settings = loadRemoteHostSettings(this.deps.settings);
    if (!settings) {
      this.update({ state: 'error', error: 'invalid' });
      throw new RemoteFailure('invalid');
    }
    this.healthAbort?.abort();
    const abort = new AbortController();
    this.healthAbort = abort;
    this.update({ state: 'checking', error: undefined });
    try {
      const result = await checkPublicHealth(settings.baseUrl, abort.signal, this.fetcher);
      if (result.controlVersion !== 1) throw new RemoteFailure('version');
      if (this.healthAbort === abort) this.update({ state: 'idle' });
      return result;
    } catch (error) {
      if (this.healthAbort === abort && !abort.signal.aborted)
        this.update({ state: 'error', error: codeOf(error) });
      throw error;
    } finally {
      if (this.healthAbort === abort) this.healthAbort = null;
    }
  }

  async createRoom(): Promise<RemoteRoom> {
    if (this.record && this.transport) return this.record.room;
    const settings = loadRemoteHostSettings(this.deps.settings);
    if (!settings) {
      this.update({ state: 'error', error: 'invalid' });
      throw new RemoteFailure('invalid');
    }
    this.update({ state: 'creating', error: undefined });
    try {
      const stored = validHost(get(this.deps.storage, HOST_KEY), this.now());
      if (stored && stored.origin === settings.baseUrl) {
        this.record = stored;
        this.update({ room: stored.room });
        await this.waitReady(this.connect(stored, true));
        return stored.room;
      }
      remove(this.deps.storage, HOST_KEY);
      const version = await responseJson(
        this.fetcher,
        `${settings.baseUrl}/version`,
        { method: 'GET' },
        200,
      );
      const current = version.current;
      if (
        version.relay !== 'p2p-gostop' ||
        version.controlVersion !== 1 ||
        version.wireVersion !== PROTOCOL_VERSION ||
        !current ||
        typeof current !== 'object' ||
        (current as { wireVersion?: unknown }).wireVersion !== PROTOCOL_VERSION ||
        typeof (current as { path?: unknown }).path !== 'string' ||
        !/^\/r\/[A-Za-z0-9._-]+\/[a-f0-9]{64}\/$/.test((current as { path: string }).path)
      )
        throw new RemoteFailure('version');
      const path = (current as { path: string }).path;
      const created = await responseJson(
        this.fetcher,
        `${settings.baseUrl}/api/rooms`,
        { method: 'POST', headers: { Authorization: `Bearer ${settings.creationSecret}` } },
        201,
      );
      if (
        typeof created.roomId !== 'string' ||
        !ROOM_ID.test(created.roomId) ||
        typeof created.hostToken !== 'string' ||
        !TOKEN.test(created.hostToken) ||
        typeof created.code !== 'string' ||
        !CODE.test(created.code) ||
        typeof created.expiresAt !== 'number' ||
        created.expiresAt <= this.now() ||
        created.expiresAt > this.now() + ROOM_MS
      )
        throw new RemoteFailure('invalid');
      const invite = token32();
      const inviteExpires = Math.min(created.expiresAt, this.now() + INVITE_MS);
      await responseJson(
        this.fetcher,
        `${settings.baseUrl}/api/rooms/${created.roomId}/credentials`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${created.hostToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: invite, permission: 'invite', expiresAt: inviteExpires }),
        },
        201,
      );
      const fragment = new URLSearchParams({ room: created.roomId, t: invite });
      const room: RemoteRoom = {
        roomId: created.roomId,
        code: created.code,
        expiresAt: created.expiresAt,
        inviteLink: `${settings.baseUrl}${path}#/join?${fragment}`,
      };
      const record: HostRecord = { origin: settings.baseUrl, hostToken: created.hostToken, room };
      this.record = record;
      put(this.deps.storage, HOST_KEY, record);
      this.update({ room });
      await this.waitReady(this.connect(record, false));
      return room;
    } catch (error) {
      this.update({ state: 'error', error: codeOf(error) });
      throw error;
    }
  }

  private connect(record: HostRecord, restored: boolean): WsTransport {
    this.transport?.dispose();
    const transport = createPublicTransport(
      {
        baseUrl: record.origin,
        allowedOrigin: record.origin,
        room: record.room.roomId,
        role: 'host',
        token: record.hostToken,
      },
      remoteTransportOptions(this.deps.socketFactory),
    );
    this.transport = transport;
    transport.onConnection((event) => {
      if (this.transport !== transport) return;
      if (event.type === 'close' && event.code === 1008) {
        queueMicrotask(() => {
          if (this.transport === transport) this.end('room-ended');
        });
        return;
      }
      onConnection(event, this.value, (patch) => this.update(patch), false);
    });
    transport.onControl((control) => this.request(control));
    this.update({ state: 'waiting', error: undefined, peerPresent: false });
    this.expiry = setTimeout(
      () => this.end('expired'),
      Math.max(0, record.room.expiresAt - this.now()),
    );
    this.deps.onTransport(transport, record.room.roomId, restored);
    return transport;
  }

  private waitReady(transport: WsTransport): Promise<void> {
    if (transport.state === 'open') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new RemoteFailure('network'));
      }, 7_000);
      const off = transport.onConnection((event) => {
        if (
          event.type !== 'open' &&
          event.type !== 'stopped' &&
          !(event.type === 'close' && event.code === 1008)
        )
          return;
        clearTimeout(timer);
        off();
        if (event.type === 'open') resolve();
        else
          reject(
            new RemoteFailure(
              event.type === 'stopped' && event.reason === 'replaced' ? 'replaced' : 'room-ended',
            ),
          );
      });
    });
  }

  private request(control: RelayControl): void {
    if (control.t !== 'relay-claim' && control.t !== 'relay-join-request') return;
    if (this.value.requests.some((request) => request.id === control.requestId)) return;
    const duration = control.t === 'relay-claim' ? 30_000 : 60_000;
    const receivedAt = this.now();
    const request: JoinRequest = {
      id: control.requestId,
      kind: control.t === 'relay-claim' ? 'invite' : 'code',
      receivedAt,
      expiresAt: receivedAt + duration,
    };
    this.update({ requests: [...this.value.requests, request] });
    this.requestTimers.set(
      request.id,
      setTimeout(() => this.deny(request.id), duration),
    );
    if (request.kind === 'invite') void this.accept(request.id).catch(() => this.deny(request.id));
  }

  async accept(requestId: string): Promise<void> {
    const request = this.value.requests.find((item) => item.id === requestId);
    if (!request || request.expiresAt <= this.now()) {
      this.deny(requestId);
      throw new RemoteFailure('expired');
    }
    if (!this.transport?.sendControl({ t: 'relay-accept', requestId, token: token32() }))
      throw new RemoteFailure('network');
    this.deny(requestId);
  }

  deny(requestId: string): void {
    const timer = this.requestTimers.get(requestId);
    if (timer) clearTimeout(timer);
    this.requestTimers.delete(requestId);
    this.update({ requests: this.value.requests.filter((item) => item.id !== requestId) });
  }

  retry(): void {
    if (
      this.record &&
      this.transport &&
      this.value.error !== 'room-ended' &&
      this.value.error !== 'expired'
    ) {
      this.update({ state: 'reconnecting', error: undefined });
      this.transport.reconnect(true);
    } else {
      void this.checkHealth().catch(() => {});
    }
  }

  private end(error: RemoteErrorCode): void {
    this.transport?.dispose();
    this.transport = null;
    this.record = null;
    remove(this.deps.storage, HOST_KEY);
    if (this.expiry) clearTimeout(this.expiry);
    for (const timer of this.requestTimers.values()) clearTimeout(timer);
    this.requestTimers.clear();
    this.update({ state: 'ended', error, room: undefined, requests: [], peerPresent: false });
  }

  async close(): Promise<void> {
    this.healthAbort?.abort();
    const record = this.record;
    this.end('room-ended');
    if (!record) return;
    try {
      const response = await this.fetcher(`${record.origin}/api/rooms/${record.room.roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${record.hostToken}` },
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      });
      if (response.status !== 204 && response.status !== 404) throw new RemoteFailure('network');
    } catch {
      // 로컬 화면은 닫지만 서버 종료 실패는 호출자에게 알려 준다.
      throw new RemoteFailure('network');
    }
  }
}

/** 초대 fragment를 메모리로 옮기고 현재 주소에서 즉시 제거한다. */
export function readRemoteInviteLink(
  url: string,
  current?: { href: string; pathname: string; search: string },
  historyApi?: Pick<History, 'replaceState' | 'state'>,
): { origin: string; roomId: string; token: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const live = current ?? globalThis.location;
  if (live && parsed.href === live.href) {
    try {
      (historyApi ?? globalThis.history).replaceState(
        (historyApi ?? globalThis.history).state,
        '',
        `${live.pathname}${live.search}`,
      );
    } catch {
      // 화면 주소를 바꾸지 못해도 비밀을 로그/요청에 사용하지 않는다.
    }
  }
  if (!parsed.hash.startsWith('#/join?')) return null;
  const query = new URLSearchParams(parsed.hash.slice('#/join?'.length));
  const roomId = query.get('room');
  const token = query.get('t');
  if (!roomId || !ROOM_ID.test(roomId) || !token || !TOKEN.test(token)) return null;
  try {
    return { origin: parseRelayOrigin(parsed.origin), roomId, token };
  } catch {
    return null;
  }
}

/** 명시적 링크/코드 참여 또는 저장된 자격으로 복귀한다. */
export function createRemoteHost(deps: RemoteHostDeps): RemoteHostController {
  return new HostController(deps);
}

class GuestController extends SnapshotSource implements RemoteGuestController {
  private readonly deps: RemoteGuestDeps;
  private readonly now: () => number;
  private transport: WsTransport | null = null;
  private channel: ReturnType<typeof createPublicJoinChannel> | null = null;
  private record: GuestRecord | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private pendingCancel: (() => void) | null = null;
  private pendingInvite: ReturnType<typeof readRemoteInviteLink> = null;

  constructor(deps: RemoteGuestDeps) {
    super();
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    if (globalThis.location?.href)
      this.pendingInvite = readRemoteInviteLink(globalThis.location.href);
  }

  async joinByLink(url: string, nickname: string): Promise<JoinOutcome> {
    const parsed =
      readRemoteInviteLink(url) ?? (url === globalThis.location?.href ? this.pendingInvite : null);
    if (!parsed) return this.fail('invalid');
    try {
      if (parseRelayOrigin(this.deps.allowedOrigin) !== parsed.origin) return this.fail('invalid');
      nickname = requireNickname(nickname);
    } catch {
      return this.fail('invalid');
    }
    this.stopCurrent();
    this.update({ state: 'waiting', error: undefined, peerPresent: false });
    return new Promise((done) => {
      let settled = false;
      const finish = (result: JoinOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pendingCancel = null;
        done(result);
      };
      const timer = setTimeout(() => {
        this.transport?.dispose();
        this.transport = null;
        finish(this.fail('timeout'));
      }, 35_000);
      this.pendingCancel = () => finish({ ok: false, code: 'denied' });
      const transport = createPublicTransport(
        {
          baseUrl: parsed.origin,
          allowedOrigin: this.deps.allowedOrigin,
          room: parsed.roomId,
          role: 'guest',
          token: parsed.token,
        },
        remoteTransportOptions(this.deps.socketFactory),
      );
      this.transport = transport;
      transport.onControl((control) => {
        if (control.t !== 'relay-accepted' || settled) return;
        this.pendingInvite = null;
        const record: GuestRecord = {
          origin: parsed.origin,
          roomId: parsed.roomId,
          token: control.token,
          nickname,
          expiresAt: this.now() + ROOM_MS,
        };
        this.save(record);
        this.watch(transport, record);
        this.deps.onTransport(transport, nickname, parsed.roomId);
        finish({ ok: true });
      });
      transport.onConnection((event) => {
        if (settled || event.type !== 'close') return;
        if (event.code === 1008) {
          transport.dispose();
          finish(this.fail('invalid'));
        }
      });
    });
  }

  async joinByCode(origin: string, code: string, nickname: string): Promise<JoinOutcome> {
    try {
      origin = parseRelayOrigin(origin);
      if (origin !== parseRelayOrigin(this.deps.allowedOrigin)) return this.fail('invalid');
      nickname = requireNickname(nickname);
    } catch {
      return this.fail('invalid');
    }
    this.stopCurrent();
    this.pendingInvite = null;
    this.update({ state: 'waiting', error: undefined, peerPresent: false });
    return new Promise((done) => {
      let settled = false;
      const finish = (result: JoinOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pendingCancel = null;
        this.channel?.dispose();
        this.channel = null;
        done(result);
      };
      const timer = setTimeout(() => finish(this.fail('timeout')), 61_000);
      this.pendingCancel = () => finish({ ok: false, code: 'denied' });
      try {
        const channel = createPublicJoinChannel(
          origin,
          this.deps.allowedOrigin,
          code,
          this.deps.socketFactory,
        );
        this.channel = channel;
        channel.onControl((control) => {
          if (control.t === 'relay-join-unavailable') finish(this.fail('unavailable'));
          if (control.t !== 'relay-accepted' || !control.roomId || settled) return;
          const record: GuestRecord = {
            origin,
            roomId: control.roomId,
            token: control.token,
            nickname,
            expiresAt: this.now() + ROOM_MS,
          };
          this.save(record);
          this.connect(record);
          finish({ ok: true });
        });
        channel.onClose((closeCode) => {
          if (!settled && closeCode !== 1000) finish(this.fail('network'));
        });
      } catch {
        finish(this.fail('invalid'));
      }
    });
  }

  async resume(): Promise<JoinOutcome> {
    const active = get(this.deps.storage, GUEST_ACTIVE_KEY);
    if (typeof active !== 'string' || !ROOM_ID.test(active)) return this.fail('invalid');
    const record = validGuest(get(this.deps.storage, `${GUEST_KEY}${active}`), this.now());
    if (!record) {
      this.clearGuest(active);
      return this.fail('expired');
    }
    try {
      if (record.origin !== parseRelayOrigin(this.deps.allowedOrigin)) return this.fail('invalid');
      this.stopCurrent();
      this.save(record);
      this.connect(record);
      return { ok: true };
    } catch {
      return this.fail('network');
    }
  }

  private save(record: GuestRecord): void {
    const previous = get(this.deps.storage, GUEST_ACTIVE_KEY);
    if (typeof previous === 'string' && previous !== record.roomId)
      remove(this.deps.storage, `${GUEST_KEY}${previous}`);
    this.record = record;
    put(this.deps.storage, `${GUEST_KEY}${record.roomId}`, record);
    put(this.deps.storage, GUEST_ACTIVE_KEY, record.roomId);
  }

  private connect(record: GuestRecord): void {
    const transport = createPublicTransport(
      {
        baseUrl: record.origin,
        allowedOrigin: this.deps.allowedOrigin,
        room: record.roomId,
        role: 'guest',
        token: record.token,
      },
      remoteTransportOptions(this.deps.socketFactory),
    );
    this.transport = transport;
    this.watch(transport, record);
    this.deps.onTransport(transport, record.nickname, record.roomId);
  }

  private watch(transport: WsTransport, record: GuestRecord): void {
    this.update({ state: 'reconnecting', error: undefined, reconnectAttempt: 0 });
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = setTimeout(() => this.end('expired'), Math.max(0, record.expiresAt - this.now()));
    transport.onConnection((event) => {
      if (this.transport !== transport) return;
      if (event.type === 'close' && event.code === 1008) {
        this.end('room-ended');
        return;
      }
      onConnection(event, this.value, (patch) => this.update(patch), true);
    });
  }

  retry(): void {
    if (this.transport && this.value.error !== 'replaced') {
      this.update({ state: 'reconnecting', error: undefined });
      this.transport.reconnect(true);
    } else if (this.record) {
      this.transport?.dispose();
      this.connect(this.record);
    } else {
      void this.resume();
    }
  }

  private clearGuest(roomId: string): void {
    remove(this.deps.storage, `${GUEST_KEY}${roomId}`);
    if (get(this.deps.storage, GUEST_ACTIVE_KEY) === roomId)
      remove(this.deps.storage, GUEST_ACTIVE_KEY);
  }

  private stopCurrent(): void {
    this.pendingCancel?.();
    this.pendingCancel = null;
    this.channel?.dispose();
    this.channel = null;
    this.transport?.dispose();
    this.transport = null;
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = null;
  }

  private end(error: RemoteErrorCode): void {
    const roomId = this.record?.roomId;
    this.stopCurrent();
    if (roomId) this.clearGuest(roomId);
    this.record = null;
    this.update({ state: 'ended', error, peerPresent: false });
  }

  leave(): void {
    this.pendingInvite = null;
    this.end('room-ended');
  }

  private fail(code: RemoteErrorCode): JoinOutcome {
    this.update({ state: 'error', error: code, peerPresent: false });
    return { ok: false, code };
  }
}

/** 명시적 링크/코드 참여 또는 저장된 자격으로 복귀한다. */
export function createRemoteGuest(deps: RemoteGuestDeps): RemoteGuestController {
  return new GuestController(deps);
}
