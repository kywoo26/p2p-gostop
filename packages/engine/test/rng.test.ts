import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ALL_CARD_IDS,
  createRng,
  nextInt,
  nextUint32,
  shuffle,
  shuffleWith,
  type RngState,
} from '../src/index.ts';

const take = (rng: RngState, n: number): number[] => {
  const out: number[] = [];
  let state = rng;
  for (let i = 0; i < n; i++) {
    const [value, next] = nextUint32(state);
    out.push(value);
    state = next;
  }
  return out;
};

describe('xoshiro128**', () => {
  it('상태 [1,2,3,4]에서 알고리즘 정의대로 값을 낸다', () => {
    // 손 계산: r = rotl(s1*5, 7)*9, 이후 t=s1<<9; s2^=s0; s3^=s1; s1^=s2; s0^=s3; s2^=t; s3=rotl(s3,11)
    expect(take([1, 2, 3, 4], 3)).toEqual([11520, 0, 5927040]);
  });

  it('같은 시드는 같은 수열, 다른 시드는 다른 수열', () => {
    expect(take(createRng(42), 16)).toEqual(take(createRng(42), 16));
    expect(take(createRng(42), 16)).not.toEqual(take(createRng(43), 16));
    expect(take(createRng([1, 2, 3, 4]), 4)).toEqual(take([1, 2, 3, 4], 4));
  });

  it('전부 0인 시드도 퇴화하지 않는다', () => {
    const values = take(createRng([0, 0, 0, 0]), 8);
    expect(values.some((v) => v !== 0)).toBe(true);
  });

  it('입력 상태를 바꾸지 않는다(순수 함수)', () => {
    const rng = createRng(7);
    const copy = [...rng];
    nextUint32(rng);
    shuffleWith(rng, [1, 2, 3]);
    expect([...rng]).toEqual(copy);
  });

  it('nextInt는 [0, bound) 범위', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 1, max: 1000 }),
        (seed, bound) => {
          const [value] = nextInt(createRng(seed), bound);
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(bound);
        },
      ),
    );
  });
});

describe('shuffle(seed)', () => {
  it('같은 시드는 같은 배열', () => {
    expect(shuffle(2026)).toEqual(shuffle(2026));
    expect(shuffle(2026)).not.toEqual(shuffle(2027));
  });

  it('속성: 셔플 결과는 입력의 순열이다 (카드 유실·복제 없음)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        const deck = shuffle(seed);
        expect(deck).toHaveLength(ALL_CARD_IDS.length);
        expect(deck.toSorted((a, b) => a - b)).toEqual([...ALL_CARD_IDS]);
      }),
      { numRuns: 500 },
    );
  });

  it('속성: 임의 배열에서도 순열이며 입력은 그대로', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer()),
        fc.integer({ min: 0, max: 0xffffffff }),
        (items, seed) => {
          const before = [...items];
          const { items: out } = shuffleWith(createRng(seed), items);
          expect(items).toEqual(before);
          expect(out.toSorted((a, b) => a - b)).toEqual(items.toSorted((a, b) => a - b));
        },
      ),
    );
  });
});
