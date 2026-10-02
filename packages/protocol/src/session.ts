// 세션 공개 모듈 (옛 경로 호환). 구현은 host.ts·guest.ts.
export { HostSession, type HostSessionOptions, type HostSessionState } from './host.ts';
export {
  GuestSession,
  readGuestSessionState,
  type GuestConnection,
  type GuestSessionOptions,
  type GuestSessionState,
  type RoundCheck,
} from './guest.ts';
