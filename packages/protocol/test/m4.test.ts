import { describe, expect, it } from 'vitest';
import {
  assert,
  boolean,
  constant,
  integer,
  oneof,
  property,
  string,
  uint8Array,
} from 'fast-check';
import { PRESETS, legalActions, type Action } from '@p2p-gostop/engine';
import vectors from './vectors/wire.json';
import {
  HostSession,
  GuestSession,
  byteLength,
  combineSeed,
  commit,
  createMemoryTransportPair,
  decode,
  fromHex,
  sha256,
  toHex,
} from '../src/index.ts';

const secret = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (n + i) & 255);
const random = () => {
  let n = 0;
  return () => secret(++n);
};

describe('NP-02/03/04/06/09 계약 벡터', () => {
  it.each(vectors)('$id $description', (vector) => {
    const result =
      vector.from === 'guest'
        ? decode(JSON.stringify(vector.value), 'guest')
        : decode(JSON.stringify(vector.value), 'host');
    expect(result.ok).toBe(vector.valid);
    expect(result.ok ? null : result.reason).toBe('reason' in vector ? vector.reason : null);
  });
  it('SHA-256 NIST 빈 입력과 abc', () => {
    expect(toHex(sha256(new Uint8Array()))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(toHex(sha256(new Uint8Array([97, 98, 99])))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('시드 결합은 결정적이며 양측 순서를 구별한다', () => {
    expect(combineSeed(secret(1), secret(2))).toEqual(combineSeed(secret(1), secret(2)));
    expect(combineSeed(secret(1), secret(2))).not.toEqual(combineSeed(secret(2), secret(1)));
    expect(commit(secret(1))).toBe(toHex(sha256(secret(1))));
    expect(fromHex(toHex(secret(1)))).toEqual(secret(1));
  });
  it('임의 바이트와 스키마 모양 오류는 예외 없이 거부한다', () => {
    assert(
      property(uint8Array({ maxLength: 300 }), (bytes) => {
        const text = String.fromCharCode(...bytes);
        const guest = decode(text, 'guest');
        const host = decode(text, 'host');
        expect(guest.ok).toBe(false);
        expect(host.ok).toBe(false);
      }),
      { numRuns: 500 },
    );
    assert(
      property(
        oneof(
          string(),
          integer().filter((n) => n < 0 || n > 50),
          boolean(),
          constant(null),
        ),
        (bad) => {
          const guest = decode(
            JSON.stringify({ t: 'action', seq: 0, payload: { type: 'play', seat: 1, card: bad } }),
            'guest',
          );
          expect(guest.ok).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });
  it('UTF-8 크기 상한은 한글도 바이트로 센다', () => expect(byteLength('맞고')).toBe(6));
});

describe('HostSession + GuestSession', () => {
  it('20판, 원장 제로섬, 순번 연속, 중간 끊김과 토큰 재접속', () => {
    const [hostWire, guestWire] = createMemoryTransportPair();
    const host = new HostSession(hostWire, {
      rules: PRESETS.standard,
      names: ['호스트', '게스트'],
      random32: random(),
      startBalance: 1_000_000_000,
    });
    const guest = new GuestSession(guestWire, { name: '게스트', random32: random() });
    guest.join();
    expect(host.state).not.toBeNull();
    let steps = 0;
    let dropped = false;
    let observedGap = false;
    let observedResync = false;
    while (guest.verifiedRounds.length < 20 && steps++ < 3000) {
      const state = host.state;
      if (!state) throw new Error('판 준비 실패');
      const first = legalActions(state, 0);
      const second = legalActions(state, 1);
      const action: Action | undefined = first[0] ?? second[0];
      if (!action) throw new Error('합법 수 없음');
      if (!dropped && steps > 50 && action.seat === 0) {
        guestWire.disconnect();
        host.apply(action);
        observedGap = guest.seq < host.seq;
        guest.rejoin();
        observedResync = guest.seq === host.seq;
        dropped = true;
      } else if (action.seat === 0) host.apply(action);
      else guest.sendAction(action);
      expect(host.ledger.balances[0] + host.ledger.balances[1]).toBe(2_000_000_000);
      expect(guest.errors).toEqual([]);
      expect(guest.seq).toBe(host.seq);
    }
    expect(dropped).toBe(true);
    expect(observedGap).toBe(true);
    expect(observedResync).toBe(true);
    expect(guest.verifiedRounds).toHaveLength(20);
    expect(host.roundNumber).toBe(21);
    expect(steps).toBeLessThan(3000);
  });
});
