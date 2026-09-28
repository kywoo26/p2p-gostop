// 세션 테스트 도우미. 양쪽 정책은 **자기 화면(BoardView.legal)만 보고** 수를 고른다(리뷰 T-1).
import { createRng, nextInt, type Action, type RngState } from '@p2p-gostop/engine';
import type { GuestSession, HostSession } from '../src/index.ts';

/** JSON 왕복 (저장소에 문자열로 두었다가 읽는 것과 같다) */
export function viaJson<T>(value: T): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(JSON.stringify(value)) as T;
}
/** 프레임의 t 값 */
export function frameType(raw: string): string {
  const value: unknown = JSON.parse(raw);
  return typeof value === 'object' && value !== null && 't' in value && typeof value.t === 'string'
    ? value.t
    : '';
}

/** 결정적 32바이트 난수 공급기 */
export function secrets(start = 0): () => Uint8Array {
  let n = start;
  return () => {
    n++;
    return Uint8Array.from({ length: 32 }, (_, i) => (n * 31 + i * 7) & 255);
  };
}

export class Picker {
  private rng: RngState;
  constructor(seed: number) {
    this.rng = createRng(seed);
  }
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    const [index, next] = nextInt(this.rng, items.length);
    this.rng = next;
    return items[index];
  }
  int(n: number): number {
    const [index, next] = nextInt(this.rng, n);
    this.rng = next;
    return index;
  }
}

/** 호스트 좌석 0의 합법 수 (호스트 화면 기준) */
export function hostMoves(host: HostSession): readonly Action[] {
  return host.stage === 'playing' ? (host.hostView()?.legal ?? []) : [];
}
/** 게스트 좌석 1의 합법 수 (게스트가 받은 화면 기준) */
export function guestMoves(guest: GuestSession): readonly Action[] {
  return guest.status?.stage === 'playing' && guest.view?.phase !== 'end'
    ? (guest.view?.legal ?? [])
    : [];
}

/** 제로섬 대조: 잔액 합 = 시작 잔액 × 2 + 재충전 합 */
export function ledgerBalanced(host: HostSession): boolean {
  const recharged = host.ledger.entries.reduce(
    (sum, e) => sum + (e.kind === 'recharge' ? e.amount : 0),
    0,
  );
  return (
    host.ledger.balances[0] + host.ledger.balances[1] === host.ledger.startBalance * 2 + recharged
  );
}
