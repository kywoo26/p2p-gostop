// 호스트↔게스트 메시지 (spec 5장 NP-01~NP-09). 전송 계층은 해석하지 않고 그대로 중계한다(plan.md 1.1).
// TODO(M4): zod/mini 스키마로 입력 검증, commit-reveal(NP-06), 재동기화(NP-03).
import type { Action, EngineEvent, RuleOptions, Seat } from '@p2p-gostop/engine';

/** 프로토콜 버전 (NP-04). 호환되지 않게 바뀌면 올린다. */
export const PROTOCOL_VERSION = 1;

/** 게임 메시지 크기 상한 (NP-07). */
export const MAX_MESSAGE_BYTES = 16 * 1024;

/** 중계 서버가 거절하는 크기 상한 (plan.md 1.1, NP-09 로그 업로드 포함). */
export const RELAY_MAX_PAYLOAD_BYTES = 64 * 1024;

/** 기본 포트와 WebSocket 경로 (plan.md 1.1). */
export const RELAY_PORT = 17777;
export const RELAY_PATH = '/ws';

export type Role = 'host' | 'guest';

/** 게스트 → 호스트 (NP-02, NP-09) */
export type GuestMessage =
  | {
      readonly t: 'hello';
      readonly v: number;
      readonly name: string;
      readonly sessionToken?: string;
    }
  | { readonly t: 'action'; readonly seq: number; readonly payload: Action }
  | { readonly t: 'ping' }
  | { readonly t: 'log'; readonly entries: readonly string[] };

/** 호스트 → 게스트 (NP-02) */
export type HostMessage =
  | {
      readonly t: 'welcome';
      readonly v: number;
      readonly seat: Seat;
      readonly sessionToken: string;
      readonly rules: RuleOptions;
    }
  | { readonly t: 'snapshot'; readonly view: unknown }
  | { readonly t: 'events'; readonly from: number; readonly list: readonly EngineEvent[] }
  | { readonly t: 'reject'; readonly seq: number; readonly reason: string }
  | { readonly t: 'pong' };

/** UTF-8 바이트 길이. 메시지 크기 검사에 쓴다. 플랫폼 API 없이 계산한다(브라우저·Node 공통). */
export function byteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function encode(message: GuestMessage | HostMessage): string {
  const text = JSON.stringify(message);
  const limit = message.t === 'log' ? RELAY_MAX_PAYLOAD_BYTES : MAX_MESSAGE_BYTES;
  if (byteLength(text) > limit) {
    throw new RangeError(`메시지가 ${limit}바이트를 넘습니다: ${message.t}`);
  }
  return text;
}
