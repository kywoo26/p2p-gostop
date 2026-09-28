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
import { PRESETS } from '@p2p-gostop/engine';
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
  utf8,
} from '../src/index.ts';
import { Picker, guestMoves, hostMoves, ledgerBalanced, secrets } from './helpers.ts';

const secret = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (n + i) & 255);

describe('NP-02/03/04/06/09 계약 벡터', () => {
  it.each(vectors)('$id $description', (vector) => {
    const result =
      vector.from === 'guest'
        ? decode(JSON.stringify(vector.value), 'guest')
        : decode(JSON.stringify(vector.value), 'host');
    expect(result.ok).toBe(vector.valid);
    expect(result.ok ? null : result.reason).toBe('reason' in vector ? vector.reason : null);
    // decode는 파싱한 객체를 돌려준다: 모르는 필드는 지워진다(#23).
    const wanted = 'parsed' in vector ? vector.parsed : null;
    expect(result.ok && wanted !== null ? result.message : null).toEqual(wanted);
  });
  it('SHA-256 NIST 벡터: 빈 입력, abc, 2블록 448비트, 55·56·64바이트 경계 (L-2)', () => {
    expect(toHex(sha256(new Uint8Array()))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(toHex(sha256(utf8('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(toHex(sha256(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(toHex(sha256(utf8('a'.repeat(55))))).toBe(
      '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318',
    );
    expect(toHex(sha256(utf8('a'.repeat(56))))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    );
    expect(toHex(sha256(utf8('a'.repeat(64))))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
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
        expect(decode(text, 'guest').ok).toBe(false);
        expect(decode(text, 'host').ok).toBe(false);
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

describe('HostSession + GuestSession (동기 메모리 전송)', () => {
  it('20판: 게스트는 자기 BoardView.legal만으로 모든 판을 끝낸다(선 고르기 포함), 원장 제로섬, 순번 연속, 끊김·토큰 복귀', () => {
    const [hostWire, guestWire] = createMemoryTransportPair();
    const host = new HostSession(hostWire, {
      rules: PRESETS.standard,
      names: ['호스트', '게스트'],
      random32: secrets(0),
      startBalance: 1_000_000_000,
    });
    const guest = new GuestSession(guestWire, { name: '게스트', random32: secrets(1000) });
    guest.join();
    expect(host.stage).toBe('playing');
    // 첫 판은 선 고르기부터: 게스트 화면에 후보 장수와 합법 수가 있어야 한다(리뷰 R11).
    expect(guest.view?.phase).toBe('chooseFirst');
    expect(guest.view?.firstPick?.poolSize).toBeGreaterThan(0);
    expect(guest.view?.legal.every((a) => a.type === 'pickFirst' && a.seat === 1)).toBe(true);
    const picker = new Picker(42);
    let steps = 0;
    let dropped = false;
    let observedGap = false;
    let guestMovesMade = 0;
    const kinds = new Set<string>();
    const settledChecks: unknown[] = [];
    const applied: boolean[] = [];
    while (guest.verifiedRounds.length < 20 && steps++ < 5000) {
      if (host.stage === 'settled') {
        const shown = guest.settlement !== null && guest.status?.stage === 'settled';
        guest.requestNextRound();
        settledChecks.push({ shown, ready: host.guestReady, next: host.nextRound() });
        continue;
      }
      expect(host.stage).toBe('playing');
      // 게스트가 받은 화면은 호스트가 좌석 1에 대해 계산한 화면과 같다.
      expect(guest.view).toEqual(host.guestView());
      const mine = hostMoves(host);
      const theirs = guestMoves(guest);
      const action = mine.length > 0 ? picker.pick(mine) : picker.pick(theirs);
      if (!action) throw new Error('양쪽 모두 합법 수 없음');
      kinds.add(action.type);
      if (!dropped && steps > 50 && action.seat === 0) {
        guestWire.disconnect();
        applied.push(host.apply(action));
        observedGap = guest.seq < host.seq;
        guest.rejoin();
        dropped = true;
      } else if (action.seat === 0) applied.push(host.apply(action));
      else {
        guest.sendAction(action);
        guestMovesMade++;
      }
      expect(ledgerBalanced(host)).toBe(true);
      expect(guest.errors).toEqual([]);
      expect(guest.seq).toBe(host.seq);
      expect(guest.ledger?.balances).toEqual(host.ledger.balances);
    }
    expect(dropped).toBe(true);
    expect(observedGap).toBe(true);
    expect(applied.every(Boolean)).toBe(true);
    expect(settledChecks).toEqual(
      Array.from({ length: 19 }, () => ({ shown: true, ready: true, next: true })),
    );
    expect(guest.verifiedRounds).toHaveLength(20);
    expect(guest.checks.every((c) => c.result === 'verified')).toBe(true);
    expect(host.roundNumber).toBe(20);
    expect(guestMovesMade).toBeGreaterThan(100);
    expect(kinds.has('pickFirst')).toBe(true);
    expect(steps).toBeLessThan(5000);
  });
  it('호스트 apply는 좌석 0·합법 수만 받는다 (L-7)', () => {
    const [hostWire, guestWire] = createMemoryTransportPair();
    const host = new HostSession(hostWire, {
      rules: PRESETS.standard,
      names: ['호스트', '게스트'],
      random32: secrets(0),
    });
    const guest = new GuestSession(guestWire, { name: '게스트', random32: secrets(9) });
    guest.join();
    const guestAction = guest.view!.legal[0]!;
    expect(host.apply(guestAction)).toBe(false);
    expect(host.apply({ type: 'play', seat: 0, card: 99 })).toBe(false);
  });
});
