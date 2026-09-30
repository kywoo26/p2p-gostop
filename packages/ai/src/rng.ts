// AI 전용 시드 난수 (spec AI-08, intent/plan.md 원칙 6). Math.random 금지(oxlint)라서 xoshiro128**를 쓴다.
// 엔진의 rng.ts와 같은 알고리즘이지만, 탐색 루프에서 배열을 매번 새로 만들지 않도록 변경 가능한 객체로 둔다.
import { createRng, type Seed } from '@p2p-gostop/engine';

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: Seed) {
    // 시드 → 128비트 상태는 엔진 createRng(splitmix32)와 같다: 같은 시드면 엔진과 같은 수열.
    const [a, b, c, d] = createRng(seed);
    this.s0 = a;
    this.s1 = b;
    this.s2 = c;
    this.s3 = d;
  }

  /** 다음 uint32 */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** [0, bound) 균등 정수 (거부 샘플링) */
  int(bound: number): number {
    if (!Number.isInteger(bound) || bound <= 0 || bound > 0x1_0000_0000) {
      throw new RangeError(`bound는 1 이상 2^32 이하 정수여야 합니다: ${bound}`);
    }
    const limit = 0x1_0000_0000 - (0x1_0000_0000 % bound);
    for (;;) {
      const value = this.nextU32();
      if (value < limit) {
        return value % bound;
      }
    }
  }

  /** [0, 1) 실수 (32비트 정밀도) */
  float(): number {
    return this.nextU32() / 0x1_0000_0000;
  }

  /** 배열에서 하나를 고른다 */
  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) {
      throw new RangeError('빈 배열에서 고를 수 없습니다');
    }
    return item;
  }

  /** 제자리 Fisher–Yates 셔플 */
  shuffleInPlace<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const a = items[i];
      const b = items[j];
      if (a !== undefined && b !== undefined) {
        items[i] = b;
        items[j] = a;
      }
    }
    return items;
  }

  /** 이 난수열에서 독립된 자식 난수를 만든다(하위 탐색·롤아웃용). */
  fork(): Rng {
    return new Rng([this.nextU32(), this.nextU32(), this.nextU32(), this.nextU32()]);
  }
}

/** 여러 정수를 하나의 uint32 시드로 섞는다 (판 번호·결정 번호별 시드 파생). */
export function mixSeed(...parts: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    let x = part >>> 0;
    // 32비트 정수 하나를 바이트 단위가 아니라 murmur3 finalizer로 섞는다.
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    x ^= x >>> 16;
    h = Math.imul(h ^ x, 0x01000193) >>> 0;
    h = rotl(h, 13);
  }
  return h >>> 0;
}
