// NP-01~NP-09: 직렬화·UTF-8 상한·신뢰할 수 없는 입력의 런타임 검증.
import type { HostMessage, GuestMessage, Message, Role, ErrorCode } from './messages.ts';
import { isRelayFrame } from './relay.ts';
import { guestSchema, headSchema, hostSchema } from './schema.ts';

/** v2: BoardView 상세 필드, 원장 요약, 판 사이 대기(status), revealHost.firstSeq (#12·#23·#26) */
export const PROTOCOL_VERSION = 2;
/** NP-07: 개별 뷰(스냅샷)와 엔진 한 수 이벤트의 상한. */
export const MAX_MESSAGE_BYTES = 16 * 1024;
/** NP-09와 중계의 최종 UTF-8 프레임 상한. log·ledgerPage만 이 한도까지 쓴다. */
export const RELAY_MAX_PAYLOAD_BYTES = 64 * 1024;
export const MAX_LOG_LINE_BYTES = 2 * 1024;
export const GUEST_LOG_BUFFER_BYTES = 256 * 1024;
export const RELAY_PORT = 17777;
export const RELAY_PATH = '/ws';

export function byteLength(value: string): number {
  let bytes = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** 메시지 종류별 바이트 상한: log·ledgerPage는 64KB, 나머지는 16KB */
export function messageLimit(t: Message['t']): number {
  return t === 'log' || t === 'ledgerPage' ? RELAY_MAX_PAYLOAD_BYTES : MAX_MESSAGE_BYTES;
}

export type EncodeResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: 'TOO_LARGE'; readonly bytes: number };

/** 예외 없는 직렬화. 세션·전송은 이것만 쓴다(#23) */
export function tryEncode(message: Message): EncodeResult {
  let value: string;
  try {
    value = JSON.stringify(message);
  } catch {
    return { ok: false, reason: 'TOO_LARGE', bytes: Number.POSITIVE_INFINITY };
  }
  const bytes = byteLength(value);
  if (bytes > messageLimit(message.t)) return { ok: false, reason: 'TOO_LARGE', bytes };
  if (message.t === 'log' && message.entries.some((line) => byteLength(line) > MAX_LOG_LINE_BYTES))
    return { ok: false, reason: 'TOO_LARGE', bytes };
  return { ok: true, value };
}

/** 직렬화. 상한을 넘으면 RangeError를 던진다(테스트·도구용, 세션은 tryEncode를 쓴다) */
export function encode(message: Message): string {
  const result = tryEncode(message);
  if (!result.ok) throw new RangeError(`메시지가 ${messageLimit(message.t)}바이트를 넘습니다`);
  return result.value;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly message: T }
  | { readonly ok: false; readonly reason: ErrorCode };

/**
 * 수신 문자열 검증. 통과하면 스키마로 **파싱한 객체**(모르는 필드 제거)를 돌려준다. 예외를 던지지 않는다.
 * 중계 알림 모양(t 또는 type이 relay) 프레임은 프로토콜 메시지가 아니므로 MALFORMED다(알림은 전송 계층이 따로 처리).
 */
export function decode(raw: unknown, from: 'guest'): ParseResult<GuestMessage>;
export function decode(raw: unknown, from: 'host'): ParseResult<HostMessage>;
export function decode(raw: unknown, from: Role): ParseResult<Message> {
  try {
    if (typeof raw !== 'string') return { ok: false, reason: 'MALFORMED' };
    const bytes = byteLength(raw);
    if (bytes > RELAY_MAX_PAYLOAD_BYTES) return { ok: false, reason: 'TOO_LARGE' };
    if (isRelayFrame(raw)) return { ok: false, reason: 'MALFORMED' };
    const value: unknown = JSON.parse(raw);
    const head = headSchema.safeParse(value);
    if (!head.success) return { ok: false, reason: 'MALFORMED' };
    if ((head.data.t === 'hello' || head.data.t === 'welcome') && head.data.v !== PROTOCOL_VERSION)
      return { ok: false, reason: 'VERSION_MISMATCH' };
    const parsed = (from === 'guest' ? guestSchema : hostSchema).safeParse(value);
    if (!parsed.success) return { ok: false, reason: 'MALFORMED' };
    // zod 출력의 선택 필드(`?: T | undefined`)를 exactOptionalPropertyTypes 메시지 타입으로 좁힌다. 모양은 스키마가 보장한다.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const message = parsed.data as Message;
    if (bytes > messageLimit(message.t)) return { ok: false, reason: 'TOO_LARGE' };
    if (
      message.t === 'log' &&
      message.entries.some((line) => byteLength(line) > MAX_LOG_LINE_BYTES)
    )
      return { ok: false, reason: 'TOO_LARGE' };
    if (
      message.t === 'events' &&
      (message.to !== message.from + message.list.length - 1 ||
        message.list.some((e, i) => e.seq !== message.from + i))
    )
      return { ok: false, reason: 'MALFORMED' };
    return { ok: true, message };
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
}
