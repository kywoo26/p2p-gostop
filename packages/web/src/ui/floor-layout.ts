// UX-06: 공개 바닥만으로 결정하는 비겹침 배치. 난수 없이 같은 크기·같은 패는 같은 자리에 놓는다.
import type { CardId, FloorGroupView } from '../lib/view-types.ts';
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FloorCell extends FloorGroupView {
  x: number;
  y: number;
  angle?: number;
  dx?: number;
  dy?: number;
}
const seeds = [
  [0.12, 0.16],
  [0.84, 0.72],
  [0.52, 0.03],
  [0.24, 0.92],
  [0.86, 0.2],
  [0.08, 0.62],
  [0.68, 0.94],
  [0.72, 0.45],
  [0.02, 0.38],
  [0.98, 0.48],
  [0.32, 0.06],
  [0.46, 0.96],
] as const;
export function floorLayout(
  groups: readonly FloorGroupView[],
  options: readonly CardId[],
  width: number,
  height: number,
  cardWidth: number,
): { cells: FloorCell[]; fits: boolean; folded: boolean } {
  const cardHeight = cardWidth / 0.614;
  // 같은 월은 하나의 덩어리: 내부 2px, 월 묶음 사이는 최소 4px.
  const monthGap = 2;
  const folded = groups.reduce((sum, g) => sum + g.cards.length, 0) > 14;
  if (width < cardWidth || height < cardHeight)
    return { cells: [], fits: groups.length === 0, folded };
  const blocks = groups
    .map((group, index) => {
      const chunks: CardId[][] = [];
      for (const id of group.cards) {
        const last = chunks.at(-1);
        if (folded && !options.includes(id) && last?.length === 1 && !options.includes(last[0]!))
          last.push(id);
        else chunks.push([id]);
      }
      return { group, chunks, index };
    })
    .sort((a, b) => b.chunks.length - a.chunks.length || a.group.month - b.group.month);
  const deck = {
    x: (width - cardWidth) / 2,
    y: (height - cardHeight) / 2,
    width: cardWidth,
    height: cardHeight,
  };
  // 회전·흩뿌림은 인접 카드·더미와 교차하지 않는 셀 여유 안에서만 허용한다.
  // 짧거나 조밀한 판에서는 범위를 줄여 전체 앞면을 우선한다.
  const scatter = (cells: FloorCell[]): FloorCell[] => {
    const envelopes = cells.map((c) => ({
      x: c.x,
      y: c.y,
      width: cardWidth + (c.cards.length - 1) * 5,
      height: cardHeight,
    }));
    const intersects = (a: Rect, b: Rect) =>
      a.x < b.x + b.width + 1 &&
      a.x + a.width + 1 > b.x &&
      a.y < b.y + b.height + 1 &&
      a.y + a.height + 1 > b.y;
    return cells.map((cell, index) => {
      if (cell.cards.length > 1 || options.includes(cell.cards[0]!)) return cell;
      const id = cell.cards[0]!;
      for (const factor of [1, 0.5, 0.25]) {
        const angle = (((id * 7 + 3) % 9) - 4) * factor;
        const dx = (((id * 5 + 1) % 7) - 3) * factor;
        const dy = (((id * 3 + 2) % 7) - 3) * factor;
        const radians = (Math.abs(angle) * Math.PI) / 180;
        const w = cardWidth * Math.cos(radians) + cardHeight * Math.sin(radians);
        const h = cardHeight * Math.cos(radians) + cardWidth * Math.sin(radians);
        const r = {
          x: cell.x + dx + (cardWidth - w) / 2,
          y: cell.y + dy + (cardHeight - h) / 2,
          width: w,
          height: h,
        };
        if (r.x < 0 || r.y < 0 || r.x + w > width || r.y + h > height || intersects(r, deck))
          continue;
        if (envelopes.some((other, i) => i !== index && intersects(r, other))) continue;
        envelopes[index] = r;
        return { ...cell, angle, dx, dy };
      }
      return cell;
    });
  };
  for (const gap of [12, 8, 6, 4]) {
    const sizes = blocks.map((b) => ({
      width:
        b.chunks.reduce((sum, c) => sum + cardWidth + (c.length - 1) * 5, 0) +
        Math.max(0, b.chunks.length - 1) * monthGap,
      height: cardHeight,
    }));
    const overlaps = (a: Rect, b: Rect) =>
      a.x < b.x + b.width + gap - 0.01 &&
      a.x + a.width + gap > b.x + 0.01 &&
      a.y < b.y + b.height + gap - 0.01 &&
      a.y + a.height + gap > b.y + 0.01;
    const candidates = blocks.map((block, i) => {
      const size = sizes[i]!;
      const [sx, sy] = seeds[(block.group.month - 1) % seeds.length]!;
      const maxX = width - size.width,
        maxY = height - size.height;
      const xs = new Set([
        0,
        maxX,
        maxX * sx,
        deck.x - size.width - gap,
        deck.x + deck.width + gap,
      ]);
      const ys = new Set([
        0,
        maxY,
        maxY * sy,
        deck.y - size.height - gap,
        deck.y + deck.height + gap,
      ]);
      for (let x = 0; x <= maxX; x += 8) xs.add(x);
      for (let y = 0; y <= maxY; y += 8) ys.add(y);
      return [...xs]
        .flatMap((x) => [...ys].map((y) => ({ x, y, ...size })))
        .filter(
          (r) =>
            r.x >= 0 &&
            r.y >= 0 &&
            r.x + r.width <= width + 0.01 &&
            r.y + r.height <= height + 0.01 &&
            !overlaps(r, deck),
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - maxX * sx, a.y - maxY * sy) -
            Math.hypot(b.x - maxX * sx, b.y - maxY * sy),
        );
    });
    const placed: Rect[] = [];
    let visits = 0;
    const place = (index: number): boolean => {
      if (index === blocks.length) return true;
      if (++visits > 5000) return false;
      let attempts = 0;
      for (const r of candidates[index]!) {
        if (placed.some((other) => overlaps(r, other))) continue;
        placed.push(r);
        if (place(index + 1)) return true;
        placed.pop();
        if (++attempts >= 32) break;
      }
      return false;
    };
    if (place(0))
      return {
        folded,
        fits: true,
        cells: scatter(
          blocks.flatMap((b, i) => {
            let x = placed[i]!.x;
            return b.chunks.map((cards) => {
              const cell = { ...b.group, cards, x, y: placed[i]!.y };
              x += cardWidth + (cards.length - 1) * 5 + monthGap;
              return cell;
            });
          }),
        ),
      };
  }
  // 과밀 경계에서만 여유를 일정하게 나눈다. 패를 감추거나 화면 밖으로 밀지 않는다.
  const free = new Set([6, 8, 2, 12, 1, 3, 11, 13, 5, 9, 0, 4, 10, 14]);
  const cells: FloorCell[] = [];
  const stepX = (width - cardWidth - 5) / 4;
  const stepY = (height - cardHeight) / 2;
  for (const block of blocks) {
    const selected: number[] = [];
    for (const slot of free) {
      const candidate = [slot];
      for (let i = 0; i < candidate.length && candidate.length < block.chunks.length; i++) {
        const at = candidate[i]!;
        for (const next of [at % 5 < 4 ? at + 1 : -1, at % 5 > 0 ? at - 1 : -1, at + 5, at - 5]) {
          if (free.has(next) && !candidate.includes(next)) candidate.push(next);
          if (candidate.length === block.chunks.length) break;
        }
      }
      if (candidate.length >= block.chunks.length) {
        selected.push(...candidate.slice(0, block.chunks.length));
        break;
      }
    }
    if (!selected.length) selected.push(...[...free].slice(0, block.chunks.length));
    selected.sort((a, b) => a - b);
    for (const [i, cards] of block.chunks.entries()) {
      const slot = selected[i];
      if (slot === undefined) continue;
      free.delete(slot);
      cells.push({ ...block.group, cards, x: (slot % 5) * stepX, y: Math.floor(slot / 5) * stepY });
    }
  }
  return {
    cells,
    folded,
    fits:
      cells.length === blocks.reduce((n, b) => n + b.chunks.length, 0) &&
      stepX >= cardWidth + 5 &&
      stepY >= cardHeight,
  };
}
