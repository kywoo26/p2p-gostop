// NP-RP-01/02/08: 사용자 설정 공개 중계의 주소·자격 증명은 번들에 없다.
import { PROTOCOL_VERSION, type Role } from '@p2p-gostop/protocol';
import {
  WsTransport,
  parseRelayControl,
  type RelayControl,
  type WsTransportOptions,
} from './ws-transport.ts';

export interface PublicEndpoint {
  readonly baseUrl: string;
  /** 호스트 설정 또는 사용자가 확인한 초대 origin. 링크의 endpoint만으로 결정하지 않는다. */
  readonly allowedOrigin: string;
  readonly room: string;
  readonly role: Role;
  readonly token: string;
}

export interface RemoteHostSettings {
  readonly baseUrl: string;
  readonly creationSecret: string;
}

export interface SettingsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SETTINGS_KEY = 'p2p-gostop.remote-host.v1';
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const ROOM = /^[A-Za-z0-9_-]{22}$/;

/** HTTPS origin만 허용한다. 경로·query·fragment·userinfo를 설정에 보존하지 않는다. */
export function parseRelayOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new Error('invalid relay origin');
  return url.origin;
}

export function saveRemoteHostSettings(store: SettingsStore, value: RemoteHostSettings): void {
  const baseUrl = parseRelayOrigin(value.baseUrl);
  if (!SECRET.test(value.creationSecret)) throw new Error('invalid creation secret');
  store.setItem(SETTINGS_KEY, JSON.stringify({ baseUrl, creationSecret: value.creationSecret }));
}

export function loadRemoteHostSettings(store: SettingsStore): RemoteHostSettings | null {
  const raw = store.getItem(SETTINGS_KEY);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.baseUrl !== 'string' || typeof record.creationSecret !== 'string')
      return null;
    const baseUrl = parseRelayOrigin(record.baseUrl);
    if (!SECRET.test(record.creationSecret)) return null;
    return { baseUrl, creationSecret: record.creationSecret };
  } catch {
    return null;
  }
}

export function clearRemoteHostSettings(store: SettingsStore): void {
  store.removeItem(SETTINGS_KEY);
}

export function publicWsUrl(endpoint: PublicEndpoint): string {
  const origin = parseRelayOrigin(endpoint.baseUrl);
  if (origin !== parseRelayOrigin(endpoint.allowedOrigin))
    throw new Error('untrusted relay origin');
  if (!ROOM.test(endpoint.room) || !SECRET.test(endpoint.token))
    throw new Error('invalid relay credentials');
  if (endpoint.role !== 'host' && endpoint.role !== 'guest') throw new Error('invalid role');
  const url = new URL('/ws', origin);
  url.protocol = 'wss:';
  url.searchParams.set('role', endpoint.role);
  url.searchParams.set('room', endpoint.room);
  return url.href;
}

export function createPublicTransport(
  endpoint: PublicEndpoint,
  options: Omit<WsTransportOptions, 'role' | 'host' | 'port' | 'url' | 'authToken'> = {},
): WsTransport {
  return new WsTransport({
    ...options,
    role: endpoint.role,
    url: publicWsUrl(endpoint),
    authToken: endpoint.token,
  });
}

/** 코드 참여는 게임 좌석이 없는 제어 소켓이다. 명시적 참여 동작에서만 만든다. */
export class PublicJoinChannel {
  readonly url: string;
  private readonly socket: WebSocket;
  private readonly controls = new Set<(control: RelayControl) => void>();
  private readonly closes = new Set<(code: number) => void>();
  private disposed = false;

  constructor(
    baseUrl: string,
    allowedOrigin: string,
    code: string,
    socketFactory: (url: string) => WebSocket = (url) => new WebSocket(url),
  ) {
    const origin = parseRelayOrigin(baseUrl);
    if (origin !== parseRelayOrigin(allowedOrigin)) throw new Error('untrusted relay origin');
    const normalized = code.replaceAll('-', '').toUpperCase();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(normalized))
      throw new Error('invalid room code');
    const url = new URL('/join', origin);
    url.protocol = 'wss:';
    url.searchParams.set('code', normalized);
    this.url = url.href;
    this.socket = socketFactory(this.url);
    this.socket.addEventListener('message', (event: MessageEvent) => {
      if (this.disposed || typeof event.data !== 'string') return;
      const control = parseRelayControl(event.data);
      if (!control.isControl || control.value === null) {
        this.socket.close(1008, 'invalid join control');
        return;
      }
      if (control.value.t === 'relay-accepted' && control.value.roomId === undefined) {
        this.socket.close(1008, 'missing room');
        return;
      }
      if (
        control.value.t !== 'relay-join-pending' &&
        control.value.t !== 'relay-join-denied' &&
        control.value.t !== 'relay-join-unavailable' &&
        control.value.t !== 'relay-accepted'
      ) {
        this.socket.close(1008, 'invalid join control');
        return;
      }
      for (const handler of this.controls) handler(control.value);
    });
    this.socket.addEventListener('close', (event: CloseEvent) => {
      if (!this.disposed) for (const handler of this.closes) handler(event.code);
    });
  }

  onControl(handler: (control: RelayControl) => void): () => void {
    this.controls.add(handler);
    return () => {
      this.controls.delete(handler);
    };
  }

  onClose(handler: (code: number) => void): () => void {
    this.closes.add(handler);
    return () => {
      this.closes.delete(handler);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.socket.close();
    this.controls.clear();
    this.closes.clear();
  }
}

export function createPublicJoinChannel(
  baseUrl: string,
  allowedOrigin: string,
  code: string,
  socketFactory?: (url: string) => WebSocket,
): PublicJoinChannel {
  return new PublicJoinChannel(baseUrl, allowedOrigin, code, socketFactory);
}

export interface HealthResult {
  readonly relay: string;
  readonly ready: boolean;
  readonly controlVersion: number;
  readonly wireVersion: number;
}

/** 화면 안내용 코드. cors는 동일 주소의 읽기 없는 진단 GET이 도달했을 때의 추정이다. */
export type RelayHealthErrorCode =
  'cancelled' | 'timeout' | 'cors' | 'network' | 'http' | 'invalidResponse' | 'incompatible';

export class RelayHealthError extends Error {
  readonly code: RelayHealthErrorCode;
  constructor(code: RelayHealthErrorCode, options?: ErrorOptions) {
    super(`relay health ${code}`, options);
    this.name = 'RelayHealthError';
    this.code = code;
  }
}

/** 원격 화면 진입/수동 재시도에서만 호출한다. 호출자는 화면 종료 때 signal을 취소한다. */
export async function checkPublicHealth(
  baseUrl: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<HealthResult> {
  const origin = parseRelayOrigin(baseUrl);
  const healthUrl = new URL('/health', origin);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    cancel();
  }, 5_000);
  try {
    let response: Response;
    try {
      response = await fetcher(healthUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      if (signal.aborted) throw new RelayHealthError('cancelled', { cause: error });
      if (timedOut || controller.signal.aborted)
        throw new RelayHealthError('timeout', { cause: error });
      // Fetch는 CORS 거절과 접속 실패를 모두 reject한다. 같은 공개 health에
      // 자격 없는 읽기 불가 GET만 한 번 시도해 서버 도달 여부를 가른다.
      try {
        await fetcher(healthUrl, {
          method: 'GET',
          mode: 'no-cors',
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal: controller.signal,
        });
        throw new RelayHealthError('cors', { cause: error });
      } catch (probeError) {
        if (probeError instanceof RelayHealthError) throw probeError;
        if (signal.aborted) throw new RelayHealthError('cancelled', { cause: error });
        if (timedOut || controller.signal.aborted)
          throw new RelayHealthError('timeout', { cause: error });
        throw new RelayHealthError('network', { cause: error });
      }
    }
    if (!response.ok || (response.url && new URL(response.url).origin !== origin))
      throw new RelayHealthError('http');
    let value: unknown;
    try {
      value = await response.json();
    } catch (error) {
      if (signal.aborted) throw new RelayHealthError('cancelled', { cause: error });
      if (timedOut || controller.signal.aborted)
        throw new RelayHealthError('timeout', { cause: error });
      throw new RelayHealthError('invalidResponse', { cause: error });
    }
    if (typeof value !== 'object' || value === null) throw new RelayHealthError('invalidResponse');
    const record = value as Record<string, unknown>;
    if (
      record.relay !== 'p2p-gostop' ||
      record.ready !== true ||
      record.wireVersion !== PROTOCOL_VERSION ||
      typeof record.controlVersion !== 'number'
    )
      throw new RelayHealthError('incompatible');
    return {
      relay: 'p2p-gostop',
      ready: true,
      controlVersion: record.controlVersion,
      wireVersion: PROTOCOL_VERSION,
    };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
