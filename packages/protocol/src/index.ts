// NP-01~NP-09: JSON 계약, UTF-8 상한, 신뢰할 수 없는 입력의 런타임 검증.
import * as z from 'zod/mini';
import type {
  Action,
  EngineEvent,
  Ledger,
  RoundOptions,
  RuleOptions,
  Seat,
} from '@p2p-gostop/engine';
import type { BoardView, SettlementView } from './view-types.ts';

export * from './crypto.ts';
export * from './view.ts';
export type * from './view-types.ts';
export { HostSession, GuestSession } from './session.ts';
export { createMemoryTransportPair, type Transport } from './transport.ts';

export const PROTOCOL_VERSION = 1;
/** NP-07 목표: 개별 뷰와 엔진 한 수 이벤트. */
export const MAX_MESSAGE_BYTES = 16 * 1024;
/** NP-09와 중계의 최종 UTF-8 프레임 상한. */
export const RELAY_MAX_PAYLOAD_BYTES = 64 * 1024;
export const MAX_LOG_LINE_BYTES = 2 * 1024;
export const GUEST_LOG_BUFFER_BYTES = 256 * 1024;
export const RELAY_PORT = 17777;
export const RELAY_PATH = '/ws';
export type Role = 'host' | 'guest';
export type ErrorCode =
  | 'MALFORMED'
  | 'TOO_LARGE'
  | 'VERSION_MISMATCH'
  | 'TOKEN_INVALID'
  | 'STALE_SEQ'
  | 'ILLEGAL_ACTION'
  | 'COMMIT_INVALID'
  | 'ROUND_NOT_READY'
  | 'BANKRUPT';

export type GuestMessage =
  | {
      readonly t: 'hello';
      readonly v: number;
      readonly name: string;
      readonly sessionToken?: string;
      readonly lastSeq?: number;
    }
  | { readonly t: 'action'; readonly seq: number; readonly payload: Action }
  | { readonly t: 'ping' }
  | { readonly t: 'log'; readonly entries: readonly string[] }
  | { readonly t: 'commitGuest'; readonly round: number; readonly hash: string }
  | { readonly t: 'revealGuest'; readonly round: number; readonly secret: string }
  | { readonly t: 'bankruptcy'; readonly choice: 'recharge' | 'end' };
export type HostMessage =
  | {
      readonly t: 'welcome';
      readonly v: number;
      readonly seat: Seat;
      readonly sessionToken: string;
      readonly rules: RuleOptions;
      readonly ledger: Ledger;
      readonly names: readonly [string, string];
    }
  | {
      readonly t: 'snapshot';
      readonly seq: number;
      readonly view: BoardView;
      readonly ledger: Ledger;
      readonly settlement?: SettlementView;
    }
  | {
      readonly t: 'events';
      readonly from: number;
      readonly to: number;
      readonly list: readonly EngineEvent[];
      readonly view: BoardView;
      readonly ledger: Ledger;
      readonly settlement?: SettlementView;
    }
  | {
      readonly t: 'reject';
      readonly seq: number;
      readonly reason: ErrorCode;
      readonly message: string;
    }
  | { readonly t: 'pong' }
  | { readonly t: 'commitHost'; readonly round: number; readonly hash: string }
  | { readonly t: 'revealGuestRequest'; readonly round: number; readonly guestHash: string }
  | {
      readonly t: 'revealHost';
      readonly round: number;
      readonly secret: string;
      readonly guestSecret: string;
      readonly seed: readonly [number, number, number, number];
      readonly actions: readonly Action[];
      readonly hostHash: string;
      readonly guestHash: string;
      readonly options: RoundOptions;
    }
  | { readonly t: 'bankruptcyPrompt'; readonly balances: readonly [number, number] };
export type Message = GuestMessage | HostMessage;

export function byteLength(value: string): number {
  let bytes = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}
export function encode(message: Message): string {
  const value = JSON.stringify(message);
  const limit = message.t === 'log' ? RELAY_MAX_PAYLOAD_BYTES : MAX_MESSAGE_BYTES;
  if (byteLength(value) > limit) throw new RangeError(`메시지가 ${limit}바이트를 넘습니다`);
  if (message.t === 'log' && message.entries.some((line) => byteLength(line) > MAX_LOG_LINE_BYTES))
    throw new RangeError('로그 줄이 2KB를 넘습니다');
  return value;
}
const seat = z.union([z.literal(0), z.literal(1)]);
const seq = z.number().check(z.int(), z.minimum(0));
const card = z.number().check(z.int(), z.minimum(0), z.maximum(50));
const hex64 = z.string().check(z.regex(/^[0-9a-f]{64}$/));
const round = z.number().check(z.int(), z.minimum(1));
const action = z.union([
  z.object({ type: z.literal('pickFirst'), seat, index: seq }),
  z.object({
    type: z.literal('chongtong'),
    seat,
    choice: z.union([z.literal('end'), z.literal('continue')]),
  }),
  z.object({ type: z.literal('play'), seat, card }),
  z.object({
    type: z.literal('bomb'),
    seat,
    month: z.number().check(z.int(), z.minimum(1), z.maximum(12)),
  }),
  z.object({ type: z.literal('flipOnly'), seat }),
  z.object({ type: z.literal('shake'), seat, accept: z.boolean() }),
  z.object({ type: z.literal('chooseTarget'), seat, card }),
  z.object({ type: z.literal('gukjin'), seat, asPi: z.boolean() }),
  z.object({ type: z.literal('go'), seat }),
  z.object({ type: z.literal('stop'), seat }),
]);
const balances = z.tuple([z.number(), z.number()]);
const ledger = z.object({
  perPoint: z.number(),
  startBalance: z.number(),
  balances,
  entries: z.array(z.unknown()),
});
const board = z.object({
  viewer: seat,
  turn: seat,
  seats: z.tuple([z.unknown(), z.unknown()]),
  floor: z.array(z.unknown()),
  deckCount: seq,
  multiplier: z.number(),
  pending: z.unknown(),
  playable: z.array(card),
  round,
  eventSeq: seq,
});
const event = z.object({
  seq,
  seat: z.union([seat, z.null()]),
  cards: z.array(card),
  type: z.string(),
});
const rules = z.record(z.string(), z.unknown());
const settlement = z.record(z.string(), z.unknown());
const guestSchema = z.union([
  z.object({
    t: z.literal('hello'),
    v: seq,
    name: z.string().check(z.minLength(1), z.maxLength(80)),
    sessionToken: z.optional(z.string()),
    lastSeq: z.optional(seq),
  }),
  z.object({ t: z.literal('action'), seq, payload: action }),
  z.object({ t: z.literal('ping') }),
  z.object({ t: z.literal('log'), entries: z.array(z.string()) }),
  z.object({ t: z.literal('commitGuest'), round, hash: hex64 }),
  z.object({ t: z.literal('revealGuest'), round, secret: hex64 }),
  z.object({
    t: z.literal('bankruptcy'),
    choice: z.union([z.literal('recharge'), z.literal('end')]),
  }),
]);
const hostSchema = z.union([
  z.object({
    t: z.literal('welcome'),
    v: seq,
    seat,
    sessionToken: z.string(),
    rules,
    ledger,
    names: z.tuple([z.string(), z.string()]),
  }),
  z.object({
    t: z.literal('snapshot'),
    seq,
    view: board,
    ledger,
    settlement: z.optional(settlement),
  }),
  z.object({
    t: z.literal('events'),
    from: seq,
    to: seq,
    list: z.array(event),
    view: board,
    ledger,
    settlement: z.optional(settlement),
  }),
  z.object({ t: z.literal('reject'), seq, reason: z.string(), message: z.string() }),
  z.object({ t: z.literal('pong') }),
  z.object({ t: z.literal('commitHost'), round, hash: hex64 }),
  z.object({ t: z.literal('revealGuestRequest'), round, guestHash: hex64 }),
  z.object({
    t: z.literal('revealHost'),
    round,
    secret: hex64,
    guestSecret: hex64,
    seed: z.tuple([seq, seq, seq, seq]),
    actions: z.array(action),
    hostHash: hex64,
    guestHash: hex64,
    options: z.object({ roundNumber: round, carry: seq, dealer: z.optional(seat) }),
  }),
  z.object({ t: z.literal('bankruptcyPrompt'), balances }),
]);
export type ParseResult<T> =
  | { readonly ok: true; readonly message: T }
  | { readonly ok: false; readonly reason: ErrorCode };
export function decode(raw: unknown, from: 'guest'): ParseResult<GuestMessage>;
export function decode(raw: unknown, from: 'host'): ParseResult<HostMessage>;
export function decode(raw: unknown, from: Role): ParseResult<Message> {
  try {
    if (typeof raw !== 'string') return { ok: false, reason: 'MALFORMED' };
    if (byteLength(raw) > RELAY_MAX_PAYLOAD_BYTES) return { ok: false, reason: 'TOO_LARGE' };
    const value: unknown = JSON.parse(raw);
    const parsed = (from === 'guest' ? guestSchema : hostSchema).safeParse(value);
    if (!parsed.success) return { ok: false, reason: 'MALFORMED' };
    // 검증한 원본을 유지해야 이벤트별 추가 필드가 z.object의 strip 과정에서 사라지지 않는다.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const message = value as Message;
    if (message.t !== 'log' && byteLength(raw) > MAX_MESSAGE_BYTES)
      return { ok: false, reason: 'TOO_LARGE' };
    if ((message.t === 'hello' || message.t === 'welcome') && message.v !== PROTOCOL_VERSION)
      return { ok: false, reason: 'VERSION_MISMATCH' };
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
