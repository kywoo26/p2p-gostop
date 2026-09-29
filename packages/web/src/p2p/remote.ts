// RP-04B: 공개 중계의 방/역할 인증 수명. 게임 hello·snapshot은 기존 HostGame/GuestGame이 맡는다.
import type { WsTransport } from '../net/ws-transport.ts';
import type { HealthResult, RelayHealthErrorCode, SettingsStore } from '../net/index.ts';

/** 원격 방 연결의 UI 상태. */
export type RemoteState =
  | 'idle'
  | 'checking'
  | 'creating'
  | 'waiting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'error';

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

/** 호스트의 승인 대기 항목. 초대 링크도 로비 진입 전에 승인한다. */
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
  error?: RemoteErrorCode;
  room?: RemoteRoom;
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
  onTransport: (transport: WsTransport) => void;
  fetcher?: typeof fetch;
  socketFactory?: (url: string) => WebSocket;
  now?: () => number;
}

/** allowedOrigin은 사용자가 확인한 중계 주소다. 링크의 주소만으로 신뢰하지 않는다. */
export interface RemoteGuestDeps {
  allowedOrigin: string;
  storage: SettingsStore;
  onTransport: (transport: WsTransport, nickname: string) => void;
  socketFactory?: (url: string) => WebSocket;
  now?: () => number;
}

/** 설정 확인 후 원격 호스트 연결을 만든다. */
export function createRemoteHost(_deps: RemoteHostDeps): RemoteHostController {
  throw new Error('RP-04B implementation pending');
}

/** 명시적 링크/코드 참여 또는 저장된 자격으로 복귀한다. */
export function createRemoteGuest(_deps: RemoteGuestDeps): RemoteGuestController {
  throw new Error('RP-04B implementation pending');
}
