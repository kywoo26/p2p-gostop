import { getCard, type CardId } from '@p2p-gostop/engine';
import { sortHand } from './cards.ts';

/** 월 묶음을 나누지 않고 두 줄에 놓는다. 가능한 한 원래 월 순서를 보존한다. */
export function handRows(cards: readonly CardId[]): CardId[][] {
  const sorted = sortHand(cards);
  if (sorted.length <= 5) return [sorted];
  const groups: CardId[][] = [];
  for (const id of sorted) {
    const month = getCard(id).month;
    const last = groups.at(-1);
    if (month !== null && last && getCard(last[0]!).month === month) last.push(id);
    else groups.push([id]);
  }
  const low = sorted.length === 10 ? 4 : Math.max(1, sorted.length - 6);
  let best: { rows: CardId[][]; inversions: number; imbalance: number; prefix: number } | null =
    null;
  for (let mask = 1; mask < 1 << groups.length; mask++) {
    const first = groups.filter((_, i) => (mask & (1 << i)) !== 0);
    const second = groups.filter((_, i) => (mask & (1 << i)) === 0);
    const firstLength = first.reduce((sum, group) => sum + group.length, 0);
    const secondLength = sorted.length - firstLength;
    if (firstLength < low || firstLength > 6 || secondLength < low || secondLength > 6) continue;
    let inversions = 0;
    for (let i = 0; i < groups.length; i++) {
      if ((mask & (1 << i)) === 0) continue;
      for (let j = 0; j < i; j++) if ((mask & (1 << j)) === 0) inversions++;
    }
    const imbalance = Math.abs(firstLength - secondLength);
    const prefix = groups.findIndex((_, i) => (mask & (1 << i)) === 0);
    if (
      best === null ||
      inversions < best.inversions ||
      (inversions === best.inversions && imbalance < best.imbalance) ||
      (inversions === best.inversions && imbalance === best.imbalance && prefix > best.prefix)
    )
      best = {
        rows: [first.flat(), second.flat()],
        inversions,
        imbalance,
        prefix,
      };
  }
  // 유효한 실제 패(월당 최대 4장, 전체 10장 이하)는 항상 4~6 분할이 가능하다.
  return best?.rows ?? [sorted.slice(0, 6), sorted.slice(6)];
}
