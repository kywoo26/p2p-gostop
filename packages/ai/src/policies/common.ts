// 정책 공용 도우미
import type { Action } from '@p2p-gostop/engine';
import type { DecisionContext } from '../types.ts';

/** 첫 원소 (빈 목록이면 예외) */
export function firstOf<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) {
    throw new Error('합법 수가 없습니다');
  }
  return item;
}

export function onlyAction(legal: readonly Action[]): Action | null {
  const first = firstOf(legal);
  return legal.length === 1 ? first : null;
}

/** 기본 시계: globalThis.performance.now (브라우저·Node 공통). 없으면 0(반복 상한만 적용). */
function defaultNow(): number {
  const perf: unknown = Reflect.get(globalThis, 'performance');
  if (typeof perf === 'object' && perf !== null) {
    const now: unknown = Reflect.get(perf, 'now');
    if (typeof now === 'function') {
      const value: unknown = Reflect.apply(now, perf, []);
      return typeof value === 'number' ? value : 0;
    }
  }
  return 0;
}

export function clockOf(ctx: DecisionContext): () => number {
  return ctx.now ?? defaultNow;
}

/** 액션을 트리 키로 바꾼다(좌석은 항상 자기 자신이라 생략) */
export function actionKey(a: Action): string {
  switch (a.type) {
    case 'pickFirst':
      return `f${a.index}`;
    case 'chongtong':
      return `c${a.choice}`;
    case 'play':
      return `p${a.card}`;
    case 'bomb':
      return `b${a.month}`;
    case 'shake':
      return `s${a.accept ? 1 : 0}`;
    case 'chooseTarget':
      return `t${a.card}`;
    case 'gukjin':
      return `k${a.asPi ? 1 : 0}`;
    default:
      return a.type;
  }
}
