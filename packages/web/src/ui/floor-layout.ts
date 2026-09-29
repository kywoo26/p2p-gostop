// UX-06: 중앙 더미(7번)를 비운 5×3 격자. 같은 월은 인접 셀, 흩뿌림은 셀 내부만 사용한다.
import type { CardId, FloorGroupView } from '../lib/view-types.ts';
export interface FloorCell extends FloorGroupView {
  slot: number;
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
): { cells: FloorCell[]; fits: boolean; folded: boolean } {
  const cardHeight = cardWidth / 0.614;
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
  for (const candidates of choices) {
    const failed = new Set<string>();
    const place = (index: number, used: number): boolean => {
      if (index === blocks.length) return true;
      const key = `${index}:${used}`;
      if (failed.has(key)) return false;
      for (const slots of candidates[blocks[index]!.chunks.length - 1] ?? []) {
        const mask = slots.reduce((n, slot) => n | (1 << slot), 0);
        if ((used & mask) !== 0) continue;
        assigned[index] = slots;
        if (place(index + 1, used | mask)) return true;
      }
      failed.add(key);
      return false;
    };
    if (place(0, 0)) break;
    assigned = [];
  }
  const cellWidth = Math.min(cardWidth * 1.25, width / 5);
  const cellHeight = Math.min(cardHeight + cardWidth / 4, height / 3);
  const offsetX = (width - 5 * cellWidth) / 2;
  const offsetY = (height - 3 * cellHeight) / 2;
  let fits =
    assigned.length === blocks.length &&
    cellWidth >= cardWidth + 0.5 &&
    cellHeight >= cardHeight + 0.5;
  let fallbackIndex = 0;
  const cells = blocks.flatMap((block, index) => {
    const slots = [...(assigned[index] ?? [])].sort((a, b) => a - b);
    return block.chunks.map((cards, i) => {
      const slot = slots[i] ?? SLOT_ORDER[fallbackIndex++ % 14]!;
      const left = offsetX + (slot % 5) * cellWidth;
      const top = offsetY + Math.floor(slot / 5) * cellHeight;
      const stackWidth = cardWidth + (cards.length - 1) * 5;
      fits &&= cellWidth >= stackWidth + 0.5;
      const x = left + (cellWidth - stackWidth) / 2;
      const y = top + (cellHeight - cardHeight) / 2;
      const cell: FloorCell = { ...block.group, cards, slot, x, y, angle: 0, dx: 0, dy: 0 };
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
  });
  return { cells, folded, fits: groups.length === 0 || fits };
}
