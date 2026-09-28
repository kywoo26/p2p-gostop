// NP-06: 비보안 컨텍스트에서도 실행되는 순수 JS SHA-256. 난수는 호출자가 제공한다.
import {
  replay,
  type Action,
  type RoundOptions,
  type RuleOptions,
  type Seed,
} from '@p2p-gostop/engine';

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const H = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];
const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
export function sha256(input: Uint8Array): Uint8Array {
  const size = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(size);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const bitLength = BigInt(input.length) * 8n;
  for (let i = 0; i < 8; i++) bytes[size - 1 - i] = Number((bitLength >> BigInt(i * 8)) & 255n);
  const h = [...H];
  const w = new Uint32Array(64);
  for (let off = 0; off < size; off += 64) {
    for (let i = 0; i < 16; i++) {
      const p = off + i * 4;
      w[i] =
        ((bytes[p]! << 24) | (bytes[p + 1]! << 16) | (bytes[p + 2]! << 8) | bytes[p + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      w[i] =
        (w[i - 16]! +
          (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) +
          w[i - 7]! +
          (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>>
        0;
    }
    let [a, b, c, d, e, f, g, j] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const t1 =
        (j + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      j = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    for (const [i, value] of [a, b, c, d, e, f, g, j].entries()) h[i] = (h[i]! + value) >>> 0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = h[i]! >>> 24;
    out[i * 4 + 1] = h[i]! >>> 16;
    out[i * 4 + 2] = h[i]! >>> 8;
    out[i * 4 + 3] = h[i]!;
  }
  return out;
}
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
export function fromHex(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}
export function commit(secret: Uint8Array): string {
  if (secret.length !== 32) throw new RangeError('난수는 32바이트여야 합니다');
  return toHex(sha256(secret));
}
/** 순서가 고정된 양측 난수 결합: SHA-256(host || guest)의 앞 128비트. */
export function combineSeed(
  host: Uint8Array,
  guest: Uint8Array,
): readonly [number, number, number, number] {
  if (host.length !== 32 || guest.length !== 32)
    throw new RangeError('각 난수는 32바이트여야 합니다');
  const joined = new Uint8Array(64);
  joined.set(host);
  joined.set(guest, 32);
  const hash = sha256(joined);
  const word = (i: number) =>
    ((hash[i]! << 24) | (hash[i + 1]! << 16) | (hash[i + 2]! << 8) | hash[i + 3]!) >>> 0;
  return [word(0), word(4), word(8), word(12)];
}
export interface Commitments {
  readonly host: string;
  readonly guest: string;
}
export interface Reveals {
  readonly host: string;
  readonly guest: string;
}
export function verifyRound(
  commitments: Commitments,
  reveals: Reveals,
  seed: Seed,
  actions: readonly Action[],
  rules: RuleOptions,
  options: RoundOptions = {},
): boolean {
  const host = fromHex(reveals.host);
  const guest = fromHex(reveals.guest);
  if (
    host?.length !== 32 ||
    guest?.length !== 32 ||
    commit(host) !== commitments.host ||
    commit(guest) !== commitments.guest
  )
    return false;
  const computed = combineSeed(host, guest);
  if (JSON.stringify(computed) !== JSON.stringify(seed)) return false;
  try {
    const result = replay(rules, seed, actions, options);
    return result.ok && result.state.phase === 'end';
  } catch {
    return false;
  }
}
