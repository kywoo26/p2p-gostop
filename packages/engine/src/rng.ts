// 시드 PRNG: xoshiro128** (Blackman & Vigna, 2018)을 직접 구현한다 (plan.md 1.4).
// 상태는 JSON 직렬화 가능한 uint32 4개이며, 엔진 상태에 그대로 저장한다. 모든 함수는 순수 함수다.

/** xoshiro128** 내부 상태. 모두 uint32, 전부 0이면 안 된다. */
export type RngState = readonly [number, number, number, number];

/** 시드: uint32 하나 또는 uint32 4개(commit-reveal로 합친 128비트 시드, spec NP-06). */
export type Seed = number | readonly [number, number, number, number];

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** splitmix32: 32비트 시드를 128비트 상태로 펼친다. */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

export function createRng(seed: Seed): RngState {
  let state: [number, number, number, number];
  if (typeof seed === 'number') {
    const next = splitmix32(seed);
    state = [next(), next(), next(), next()];
  } else {
    state = [seed[0] >>> 0, seed[1] >>> 0, seed[2] >>> 0, seed[3] >>> 0];
  }
  if (state.every((v) => v === 0)) {
    // 전부 0인 상태는 영원히 0만 낸다. 고정 상수로 대체한다.
    state = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x71374491];
  }
  return state;
}

/** 다음 uint32와 새 상태를 돌려준다. */
export function nextUint32(rng: RngState): [value: number, next: RngState] {
  let [s0, s1, s2, s3] = rng;
  const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  s2 = (s2 ^ s0) >>> 0;
  s3 = (s3 ^ s1) >>> 0;
  s1 = (s1 ^ s2) >>> 0;
  s0 = (s0 ^ s3) >>> 0;
  s2 = (s2 ^ t) >>> 0;
  s3 = rotl(s3, 11);
  return [result, [s0, s1, s2, s3]];
}

/** [0, bound) 범위의 균등 정수. 거부 샘플링으로 편향을 없앤다. */
export function nextInt(rng: RngState, bound: number): [value: number, next: RngState] {
  if (!Number.isInteger(bound) || bound <= 0 || bound > 0x1_0000_0000) {
    throw new RangeError(`bound는 1 이상 2^32 이하 정수여야 합니다: ${bound}`);
  }
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % bound);
  let state = rng;
  for (;;) {
    const [value, next] = nextUint32(state);
    state = next;
    if (value < limit) {
      return [value % bound, state];
    }
  }
}

function swap(items: unknown[], i: number, j: number): void {
  const tmp = items[i];
  items[i] = items[j];
  items[j] = tmp;
}

/** Fisher–Yates 셔플. 입력은 바꾸지 않고 새 배열과 다음 PRNG 상태를 돌려준다. */
export function shuffleWith<T>(rng: RngState, items: readonly T[]): { items: T[]; rng: RngState } {
  const out = items.slice();
  let state = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = nextInt(state, i + 1);
    state = next;
    swap(out, i, j);
  }
  return { items: out, rng: state };
}
