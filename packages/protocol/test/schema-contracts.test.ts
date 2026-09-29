// NP-02/04, FR-21/24: 스키마 추론과 공개 계약의 드리프트는 npm run check(TS 7)가 잡는다.
import { assert, double, integer, oneof, property } from 'fast-check';
import type { EngineEvent } from '@p2p-gostop/engine';
import { expect, expectTypeOf, it } from 'vitest';
import type { output } from 'zod/mini';
import { decode } from '../src/codec.ts';
import type { GuestMessage, HostMessage } from '../src/messages.ts';
import type { guestSchema, hostSchema } from '../src/schema.ts';

// JSON은 readonly나 명시적 undefined를 전달하지 않는다. 키의 optional 여부·배열/튜플 모양은 보존한다.
type WireShape<T> = T extends object
  ? { -readonly [K in keyof T]: WireShape<Exclude<T[K], undefined>> }
  : T;
type ByKind<T extends { t: string }> = {
  [Kind in T['t']]: WireShape<Extract<T, { t: Kind }>>;
};
type ParsedHost = output<typeof hostSchema>;

// 현재 wire v2의 의도적인 느슨함만 제외한다. 입력 정책 강화는 별도 기능 변경이다(R3b).
type CheckedHost<T> = T extends { t: 'welcome' }
  ? Omit<T, 'rules'>
  : T extends { t: 'events' }
    ? Omit<T, 'list'>
    : T extends { t: 'revealHost'; options: infer Options }
      ? Omit<T, 'options'> & { options: Omit<Options, 'deck' | 'pickPools'> }
      : T;

it('게스트 전체 메시지의 스키마 출력은 공개 계약과 같다 (NP-02)', () => {
  expectTypeOf<ByKind<output<typeof guestSchema>>>().toEqualTypeOf<ByKind<GuestMessage>>();
});

it('호스트 메시지의 검증 대상 필드는 공개 계약과 같다 (NP-02·NP-04)', () => {
  expectTypeOf<ByKind<CheckedHost<ParsedHost>>>().toEqualTypeOf<ByKind<CheckedHost<HostMessage>>>();
});

it('느슨한 rules·이벤트와 제거하는 테스트용 덱 옵션을 명시한다 (NP-02·NP-06)', () => {
  expectTypeOf<Extract<ParsedHost, { t: 'welcome' }>['rules']>().toEqualTypeOf<
    Record<string, unknown>
  >();
  type Event = Extract<ParsedHost, { t: 'events' }>['list'][number];
  expectTypeOf<Event['type']>().toEqualTypeOf<string>();
  expectTypeOf<Event[string]>().toEqualTypeOf<unknown>();
  expectTypeOf<WireShape<Pick<Event, 'seq' | 'seat' | 'cards'>>>().toEqualTypeOf<
    WireShape<Pick<EngineEvent, 'seq' | 'seat' | 'cards'>>
  >();
  type Options = Extract<ParsedHost, { t: 'revealHost' }>['options'];
  expectTypeOf<Options>().not.toHaveProperty('deck');
  expectTypeOf<Options>().not.toHaveProperty('pickPools');
});

function checkMonth(month: unknown): void {
  const payload = { type: 'bomb', seat: 0, month };
  const result = decode(
    JSON.stringify({ t: 'action', seq: 0, payload: { ...payload, extra: 'strip' } }),
    'guest',
  );
  const valid = typeof month === 'number' && Number.isInteger(month) && month >= 1 && month <= 12;
  expect(result).toEqual(
    valid
      ? { ok: true, message: { t: 'action', seq: 0, payload } }
      : { ok: false, reason: 'MALFORMED' },
  );
}

it('월의 수신 허용 집합은 기존 1~12 정수 범위이며 여분 필드는 제거한다 (NP-02)', () => {
  for (let month = 0; month <= 13; month++) checkMonth(month);
  for (const month of [1.5, '1', null, true, {}, []]) checkMonth(month);
  assert(property(oneof(integer({ min: -20, max: 30 }), double()), checkMonth), {
    seed: 96,
    numRuns: 1_000,
  });
});
