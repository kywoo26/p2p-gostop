// UX-06: 중앙 더미(7번)를 비운 5×3 격자. 같은 월은 인접 셀, 흩뿌림은 셀 내부만 사용한다.
import type { CardId, FloorGroupView } from '../lib/view-types.ts';
export interface FloorCell extends FloorGroupView {
  slot: number;
  anchor: number;
  x: number;
  y: number;
  angle: number;
  dx: number;
  dy: number;
}
// 더미 좌/우 → 상/하 → 대각 → 바깥 열. 동일 입력은 동일 슬롯을 선택한다.
const SLOT_ORDER = [6, 8, 2, 12, 1, 3, 11, 13, 5, 9, 0, 4, 10, 14];
const adjacent = (a: number, b: number, diagonal: boolean) => {
  const dx = Math.abs((a % 5) - (b % 5));
  const dy = Math.abs(Math.floor(a / 5) - Math.floor(b / 5));
  return diagonal ? Math.max(dx, dy) === 1 : dx + dy === 1;
};

function placements(count: number, diagonal: boolean): number[][] {
  const result: number[][] = [];
  const add = (at: number, slots: number[]) => {
    if (slots.length === count) {
      const reached = new Set([slots[0]!]);
      for (let i = 0; i < slots.length; i++)
        for (const a of reached)
          for (const b of slots) if (adjacent(a, b, diagonal)) reached.add(b);
      if (reached.size === count) result.push(slots);
      return;
    }
    for (let i = at; i <= SLOT_ORDER.length - (count - slots.length); i++)
      add(i + 1, [...slots, SLOT_ORDER[i]!]);
  };
  add(0, []);
  const rank = (slots: number[]) => {
    const rows = slots.map((n) => Math.floor(n / 5));
    return (
      (Math.max(...rows) - Math.min(...rows)) * 1000 +
      Math.min(...slots.map((n) => SLOT_ORDER.indexOf(n))) * 30 +
      slots.reduce((sum, n) => sum + SLOT_ORDER.indexOf(n), 0)
    );
  };
  return result.sort((a, b) => rank(a) - rank(b));
}
// 크기·패와 무관한 작은 슬롯 조합은 한 번만 만든다.
const choices = [false, true].map((diagonal) =>
  [1, 2, 3, 4].map((count) => placements(count, diagonal)),
);

export function floorLayout(
  groups: readonly FloorGroupView[],
  options: readonly CardId[],
  width: number,
  height: number,
  cardWidth: number,
  previous: readonly FloorCell[] = [],
  reserved: readonly number[] = [],
): { cells: FloorCell[]; fits: boolean; folded: boolean; conflict: boolean; searches: number } {
  const folded = groups.reduce((n, group) => n + group.cards.length, 0) > 14;
  const blocks = groups.map((group) => {
    const chunks: CardId[][] = [];
    for (const id of [...group.cards].sort((a, b) => a - b)) {
      const previous = chunks.at(-1);
      if (
        folded &&
        previous?.length === 1 &&
        !options.includes(id) &&
        !options.includes(previous[0]!)
      )
        previous.push(id);
      else chunks.push([id]);
    }
    const old = previous.find((cell) => cell.month === group.month);
    const anchorCards =
      previous.find((cell) => cell.month === group.month && cell.slot === old?.anchor)?.cards ?? [];
    const at = chunks.findIndex((cards) => cards.some((id) => anchorCards.includes(id)));
    if (at > 0) chunks.unshift(chunks.splice(at, 1)[0]!);
    return { group, chunks };
  });
  // 과밀 바닥패도 버리지 않는다. 2장 묶음으로 14칸을 넘으면 같은 월 3장까지 접는다.
  while (blocks.reduce((n, block) => n + block.chunks.length, 0) > 14) {
    const block = blocks.find(
      (b) =>
        b.chunks.length > 1 &&
        b.group.cards.length <= 3 &&
        b.group.cards.every((id) => !options.includes(id)),
    );
    if (!block) break;
    block.chunks = [block.chunks.flat()];
  }
  blocks.sort((a, b) => b.chunks.length - a.chunks.length || a.group.month - b.group.month);
  let assigned: number[][] = [];
  const cardSlots = new Map(
    previous.flatMap((cell) => cell.cards.map((id) => [id, cell.slot] as const)),
  );
  const anchors = new Map(previous.map((cell) => [cell.month, cell.anchor]));
  const unchanged = blocks.map((block) => {
    const ids = previous
      .filter((cell) => cell.month === block.group.month)
      .flatMap((cell) => cell.cards);
    return (
      ids.length === block.group.cards.length && ids.every((id) => block.group.cards.includes(id))
    );
  });
  const less = (a: readonly number[], b: readonly number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
    return false;
  };
  const cost = (ordered: readonly number[], index: number) => {
    const block = blocks[index]!;
    let unrelated = 0,
      distance = 0;
    for (let i = 0; i < ordered.length; i++) {
      for (const id of block.chunks[i]!) {
        const old = cardSlots.get(id),
          slot = ordered[i]!;
        if (old === undefined || old === slot) continue;
        if (unchanged[index]) unrelated++;
        distance +=
          Math.abs((old % 5) - (slot % 5)) + Math.abs(Math.floor(old / 5) - Math.floor(slot / 5));
      }
    }
    const anchor = anchors.get(block.group.month);
    return [unrelated, anchor !== undefined && anchor !== ordered[0] ? 1 : 0, distance];
  };
  const permutations = (slots: number[]): number[][] =>
    slots.length < 2
      ? [slots]
      : slots.flatMap((slot, i) =>
          permutations(slots.filter((_, at) => at !== i)).map((tail) => [slot, ...tail]),
        );
  const orderedCache = new Map<string, number[]>();
  const orderSlots = (slots: readonly number[], index: number) => {
    const key = index + ':' + slots.join(',');
    const cached = orderedCache.get(key);
    if (cached) return cached;
    let best = [...slots].sort((a, b) => a - b);
    if (previous.length)
      for (const candidate of permutations([...slots])) {
        if (less([...cost(candidate, index), ...candidate], [...cost(best, index), ...best]))
          best = candidate;
      }
    orderedCache.set(key, best);
    return best;
  };
  const reservedMask = reserved.reduce((mask, slot) => mask | (1 << slot), 0);
  let searches = 0;
  const search = (strict: boolean) => {
    let best: number[] | null = null;
    for (const candidates of choices) {
      const failed = new Set<string>();
      const prefixes = new Map<string, number[]>();
      const current: number[][] = [];
      const menus = blocks.map((block, index) =>
        (candidates[block.chunks.length - 1] ?? [])
          .map((slots) => ({
            slots,
            score: cost(orderSlots(slots, index), index),
            mask: slots.reduce((n, slot) => n | (1 << slot), 0),
          }))
          .filter((entry) => !strict || !unchanged[index] || entry.score[0] === 0)
          .sort((a, b) => (less(a.score, b.score) ? -1 : less(b.score, a.score) ? 1 : 0)),
      );
      const place = (index: number, used: number, score: number[]): boolean => {
        searches++;
        if (best && !less(score, best)) return false;
        if (index === blocks.length) {
          best = score;
          assigned = current.map((slots) => [...slots]);
          return strict;
        }
        const key = `${index}:${used}`;
        if (failed.has(key)) return false;
        const prefix = prefixes.get(key);
        if (prefix && !less(score, prefix)) return false;
        prefixes.set(key, score);
        for (const entry of menus[index]!) {
          if ((used & entry.mask) !== 0) continue;
          current[index] = entry.slots;
          if (
            place(
              index + 1,
              used | entry.mask,
              score.map((n, i) => n + entry.score[i]!),
            )
          )
            return true;
        }
        if (strict) failed.add(key);
        return false;
      };
      if (place(0, reservedMask, [0, 0, 0])) return;
    }
  };
  search(true);
  if (assigned.length !== blocks.length) search(false);
  const conflict = assigned.length !== blocks.length;
  let fallbackIndex = 0;
  const cells = blocks.flatMap((block, index) => {
    const slots = assigned[index] ? orderSlots(assigned[index]!, index) : [];
    return block.chunks.map((cards, i) => {
      const slot = slots[i] ?? SLOT_ORDER[fallbackIndex++ % 14]!;
      return {
        ...block.group,
        cards,
        slot,
        anchor: slots[0] ?? slot,
        x: 0,
        y: 0,
        angle: 0,
        dx: 0,
        dy: 0,
      };
    });
  });
  return { ...projectFloor(cells, options, width, height, cardWidth), folded, conflict, searches };
}

/** 슬롯 소유권은 그대로 두고 viewport와 선택 강조만 투영한다. 탐색은 없다. */
export function projectFloor(
  input: readonly FloorCell[],
  options: readonly CardId[],
  width: number,
  height: number,
  cardWidth: number,
) {
  const cardHeight = cardWidth / 0.614;
  const cellWidth = Math.min(cardWidth * 1.25, width / 5);
  const cellHeight = Math.min(cardHeight + cardWidth / 4, height / 3);
  const offsetX = (width - 5 * cellWidth) / 2;
  const offsetY = (height - 3 * cellHeight) / 2;
  let fits = cellWidth >= cardWidth + 0.5 && cellHeight >= cardHeight + 0.5;
  const cells = input.map((source) => {
    const { cards, slot } = source;
    const left = offsetX + (slot % 5) * cellWidth;
    const top = offsetY + Math.floor(slot / 5) * cellHeight;
    const stackWidth = cardWidth + (cards.length - 1) * 5;
    fits &&= cellWidth >= stackWidth + 0.5;
    const x = left + (cellWidth - stackWidth) / 2;
    const y = top + (cellHeight - cardHeight) / 2;
    const cell: FloorCell = { ...source, x, y, angle: 0, dx: 0, dy: 0 };
    // 선택 후보·과밀 스택은 회전하지 않는다. 일반 카드는 변환된 경계도 자기 셀 안에 둔다.
    if (cards.length > 1 || options.includes(cards[0]!)) return cell;
    const id = cards[0]!;
    for (const factor of [1, 0.5, 0.25]) {
      const angle = (((id * 7 + 3) % 9) - 4) * factor;
      const dx = (((id * 5 + 1) % 7) - 3) * factor;
      const dy = (((id * 3 + 2) % 7) - 3) * factor;
      const radians = (Math.abs(angle) * Math.PI) / 180;
      const w = cardWidth * Math.cos(radians) + cardHeight * Math.sin(radians);
      const h = cardHeight * Math.cos(radians) + cardWidth * Math.sin(radians);
      const right = x + dx + (cardWidth + w) / 2;
      const bottom = y + dy + (cardHeight + h) / 2;
      if (
        right - w < left + 0.25 ||
        right > left + cellWidth - 0.25 ||
        bottom - h < top + 0.25 ||
        bottom > top + cellHeight - 0.25
      )
        continue;
      return { ...cell, angle, dx, dy };
    }
    return cell;
  });
  return {
    cells,
    fits: cells.length === 0 || fits,
    folded: cells.some((cell) => cell.cards.length > 1),
  };
}
