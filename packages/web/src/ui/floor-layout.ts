// UX-06: 중앙 더미(7번)를 비운 5×3 격자. 같은 월은 인접 셀, 흩뿌림은 셀 내부만 사용한다.
import type { CardId, FloorGroupView } from '../lib/view-types.ts';
import { getCard } from '@p2p-gostop/engine';
export interface FloorSlot extends FloorGroupView {
  slot: number;
  anchor: number;
}
export interface FloorCell extends FloorSlot {
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

export function assignFloor(
  groups: readonly FloorGroupView[],
  options: readonly CardId[],
  previous: readonly FloorSlot[] = [],
  reserved: readonly number[] = [],
) {
  const folded = groups.reduce((n, group) => n + group.cards.length, 0) > 14;
  const blocks = [...groups]
    .sort((a, b) => a.month - b.month)
    .map((group) => {
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
      const anchorCards =
        previous.find((cell) => cell.month === group.month && cell.slot === cell.anchor)?.cards ??
        [];
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
        const prefix = prefixes.get(key);
        if (prefix && (strict || !less(score, prefix))) return false;
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
      };
    });
  });
  return { cells, folded, conflict, searches };
}

export function floorLayout(
  groups: readonly FloorGroupView[],
  options: readonly CardId[],
  width: number,
  height: number,
  cardWidth: number,
  previous: readonly FloorSlot[] = [],
  reserved: readonly number[] = [],
) {
  const assigned = assignFloor(groups, options, previous, reserved);
  return {
    ...assigned,
    ...projectFloor(assigned.cells, options, width, height, cardWidth),
    folded: assigned.folded,
  };
}

/** 슬롯 소유권은 그대로 두고 viewport와 선택 강조만 투영한다. 탐색은 없다. */
export function projectFloor(
  input: readonly FloorSlot[],
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
    // 흩뿌림은 CSS translate로 유지해 기존 SVG 합성 경로를 보존한다.
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
      if (w + 2 * Math.abs(dx) + 0.5 > cellWidth || h + 2 * Math.abs(dy) + 0.5 > cellHeight)
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

/** #202 opt-in 검토: 원본/저장 배열·그림의 층·영역 소유를 분리한다. */
export interface FloorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FloorCardPose extends FloorRect {
  id: CardId;
  index: number;
  angle: number;
  z: number;
  /** DOM에는 회전 전 local 좌표를 적용한다. x/y/width/height는 실제 회전 AABB다. */
  localX: number;
  localY: number;
}
export interface MonthFloorCell extends FloorGroupView {
  /** 과거 격자 좌표가 아닌 내부 영역 표식. 원본·월 identity나 DOM key가 아니다. */
  slot: number;
  anchor: number;
  x: number;
  y: number;
  angle: number;
  dx: 0;
  dy: 0;
  origin: { x: number; y: number };
  localWidth: number;
  localHeight: number;
  poses: FloorCardPose[];
  actual: FloorRect;
  /** 표시 선까지 포함한 현재 묶음. 모든 두 장을7장 크기로 예약하지 않는다. */
  footprint: FloorRect;
}
export interface MonthFloorBounds {
  width: number;
  height: number;
  cardWidth: number;
  obstacles: readonly FloorRect[];
  paintPadding?: number;
}
interface MonthFloorResult extends MonthFloorBounds {
  strategy: 'scatter' | 'boundary';
  searches: number;
  exhausted: boolean;
  reprojected: boolean;
  relocated: number;
  capacityPrunes: number;
}
export interface MonthFloorPlaced extends MonthFloorResult {
  status: 'placed';
  fits: true;
  cells: MonthFloorCell[];
}
export interface MonthFloorFailed extends MonthFloorResult {
  status: 'failed';
  fits: false;
  /** 실패의 임의 좌표는 placement/후속 anchor로 전달하지 않는다. */
  cells: [];
  failure: { reason: 'unmeasured' | 'not-found' | 'budget'; cardIds: CardId[] };
}
export type MonthFloorLayout = MonthFloorPlaced | MonthFloorFailed;
const STACK_SEARCH_LIMIT = 8192;
const STACK_GAP = 12.125;
const STACK_EDGE = 2;
export const floorRectsOverlap = (a: FloorRect, b: FloorRect, gap = 0) =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y;
const shifted = (r: FloorRect, x: number, y: number): FloorRect => ({
  ...r,
  x: r.x + x,
  y: r.y + y,
});
const union = (rects: readonly FloorRect[]): FloorRect => {
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
};
const sameCards = (a: readonly CardId[], b: readonly CardId[]) =>
  a.length === b.length && a.every((id) => b.includes(id));
const sameInstance = (a: FloorGroupView, b: FloorGroupView) =>
  a.month === b.month && a.cards.some((id) => b.cards.includes(id));
const inside = (r: FloorRect, bounds: MonthFloorBounds) =>
  r.x >= STACK_EDGE &&
  r.y >= STACK_EDGE &&
  r.x + r.width <= bounds.width - STACK_EDGE &&
  r.y + r.height <= bounds.height - STACK_EDGE;

/** E1/B2 저장 순서는 시간순이 아니다. 마지막 월패 아래에 직전에 뒤집힌 보너스를 배치한다. */
export function floorPresentationOrder(group: FloorGroupView): CardId[] {
  const ids = [...group.cards];
  if (group.kind !== 'ppeok') return ids;
  const monthly = ids.filter((id) => getCard(id).kind !== 'bonus');
  const final = monthly[2];
  if (final === undefined) return ids;
  const at = ids.indexOf(final),
    tail = ids.slice(at + 1);
  return [
    ...ids.slice(0, at),
    ...tail.filter((id) => getCard(id).kind === 'bonus'),
    final,
    ...tail.filter((id) => getCard(id).kind !== 'bonus'),
  ];
}
const rotateRect = (r: FloorRect, angle: number): FloorRect => {
  const radians = (angle * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians);
  const points = [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x, r.y + r.height],
    [r.x + r.width, r.y + r.height],
  ].map(([x, y]) => ({ x: x! * cos - y! * sin, y: x! * sin + y! * cos }));
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
};
function monthShape(
  group: FloorGroupView,
  bounds: MonthFloorBounds,
  previous?: MonthFloorCell,
  angleOverride?: number,
) {
  const width = bounds.cardWidth,
    height = width / 0.614,
    scale = width / 48;
  const angle = angleOverride ?? previous?.angle ?? (((group.cards[0]! * 5 + 3) % 7) - 3) / 2;
  let next = previous ? Math.max(...previous.poses.map((p) => p.index)) + 1 : 0;
  const indices = new Map<CardId, number>(previous?.poses.map((p) => [p.id, p.index]) ?? []);
  for (const id of floorPresentationOrder(group)) if (!indices.has(id)) indices.set(id, next++);
  const visual = floorPresentationOrder(group);
  const poses: FloorCardPose[] = group.cards.map((id) => {
    const index = indices.get(id)!,
      localX = index * 12 * scale,
      localY = index * 6 * scale;
    return {
      ...rotateRect({ x: localX, y: localY, width, height }, angle),
      id,
      index,
      localX,
      localY,
      angle,
      z: visual.indexOf(id) + 1,
    };
  });
  const actual = union(poses),
    localWidth = width + Math.max(...poses.map((p) => p.localX)),
    localHeight = height + Math.max(...poses.map((p) => p.localY));
  const padding = bounds.paintPadding ?? 1;
  const footprint = union(
    poses.map((pose) =>
      rotateRect(
        {
          x: pose.localX - padding,
          y: pose.localY - padding,
          width: width + 2 * padding,
          height: height + 2 * padding,
        },
        angle,
      ),
    ),
  );
  return { poses, actual, footprint, angle, localWidth, localHeight };
}
function stackCell(
  group: FloorGroupView,
  shape: ReturnType<typeof monthShape>,
  origin: { x: number; y: number },
  slot: number,
): MonthFloorCell {
  return {
    ...group,
    slot,
    anchor: slot,
    x: origin.x,
    y: origin.y,
    angle: shape.angle,
    dx: 0,
    dy: 0,
    origin,
    localWidth: shape.localWidth,
    localHeight: shape.localHeight,
    footprint: shifted(shape.footprint, origin.x, origin.y),
    actual: shifted(shape.actual, origin.x, origin.y),
    poses: shape.poses.map((p) => ({ ...p, x: p.x + origin.x, y: p.y + origin.y })),
  };
}
const validStacks = (
  cells: readonly MonthFloorCell[],
  bounds: MonthFloorBounds,
  reserved: readonly MonthFloorCell[],
) =>
  cells.every(
    (c, i) =>
      inside(c.footprint, bounds) &&
      !bounds.obstacles.some((b) => floorRectsOverlap(c.footprint, b, STACK_GAP)) &&
      !cells.slice(i + 1).some((b) => floorRectsOverlap(c.footprint, b.footprint, STACK_GAP)) &&
      !reserved.some(
        (r) => !sameInstance(c, r) && floorRectsOverlap(c.footprint, r.footprint, STACK_GAP),
      ),
  );
const fraction = (index: number, base: number) => {
  let value = 0,
    weight = 1 / base;
  for (let n = index; n > 0; n = Math.floor(n / base)) {
    value += (n % base) * weight;
    weight /= base;
  }
  return value;
};

/** 예약 자체의 측정 좌표계를 사용한다. 마지막 성공 배치와 수명이 다를 수 있다. */
export function projectMonthFloorReservations(
  cells: readonly MonthFloorCell[],
  from: MonthFloorBounds,
  to: MonthFloorBounds,
): MonthFloorCell[] {
  if (from.width === to.width && from.height === to.height && from.cardWidth === to.cardWidth)
    return [...cells];
  return cells.map((cell) =>
    stackCell(
      cell,
      monthShape(cell, to, cell),
      { x: (cell.origin.x * to.width) / from.width, y: (cell.origin.y * to.height) / from.height },
      cell.slot,
    ),
  );
}

/** 격자/fixture 좌표 대신 현재 영역·장애 영역의 경계와 결정적 비정렬 후보를 사용한다. */
export function layoutMonthFloor(
  groups: readonly FloorGroupView[],
  bounds: MonthFloorBounds,
  previous?: MonthFloorLayout,
  reserved: readonly MonthFloorCell[] = [],
): MonthFloorLayout {
  const prior = previous?.fits ? previous.cells : [];
  const resized =
    !!previous &&
    (previous.width !== bounds.width ||
      previous.height !== bounds.height ||
      previous.cardWidth !== bounds.cardWidth);
  const oldFor = (g: FloorGroupView) => prior.find((c) => sameInstance(g, c));
  const preferred = (g: FloorGroupView) => {
    const old = oldFor(g);
    return old
      ? {
          x: old.origin.x * (resized ? bounds.width / previous!.width : 1),
          y: old.origin.y * (resized ? bounds.height / previous!.height : 1),
        }
      : undefined;
  };
  // 예약은 호출자가 현재 bounds로 재투영한다. 이전 성공 배치 기준으로 이중 투영하지 않는다.
  const reservations = reserved;
  let capacityPrunes = 0;
  let strategy: 'scatter' | 'boundary' = 'scatter';
  const result = (
    cells: MonthFloorCell[] | null,
    searches: number,
    exhausted: boolean,
    reprojected = false,
  ): MonthFloorLayout => {
    const common = { ...bounds, strategy, searches, exhausted, reprojected, capacityPrunes };
    if (cells && validStacks(cells, bounds, reservations) && cells.length === groups.length)
      return {
        ...common,
        status: 'placed',
        fits: true,
        cells,
        relocated: cells.filter((c) => {
          const wanted = preferred(c),
            old = oldFor(c);
          return (
            !!old &&
            sameCards(old.cards, c.cards) &&
            !!wanted &&
            (c.origin.x !== wanted.x || c.origin.y !== wanted.y)
          );
        }).length,
      };
    return {
      ...common,
      status: 'failed',
      fits: false,
      cells: [],
      relocated: 0,
      failure: {
        reason:
          bounds.width <= 0 || bounds.height <= 0
            ? 'unmeasured'
            : exhausted
              ? 'budget'
              : 'not-found',
        cardIds: groups.flatMap((g) => g.cards),
      },
    };
  };
  if (!groups.length) return result([], 0, false);
  if (bounds.width <= 0 || bounds.height <= 0) return result(null, 0, false);
  const blocks = groups.map((group) => ({
    group,
    old: oldFor(group),
    shape: monthShape(group, bounds, oldFor(group)),
  }));
  if (blocks.every((b) => b.old)) {
    const projected = blocks.map((b) =>
      stackCell(b.group, b.shape, preferred(b.group)!, b.old!.slot),
    );
    if (validStacks(projected, bounds, reservations)) {
      strategy = previous!.strategy;
      return result(projected, 0, false, resized);
    }
  }
  // 무관 월은 먼저 고정해 변경 월의 공간 탐색이 그 자리를 차지하지 않게 한다.
  blocks.sort(
    (a, b) =>
      Number(!!b.old && sameCards(b.old.cards, b.group.cards)) -
        Number(!!a.old && sameCards(a.old.cards, a.group.cards)) ||
      b.shape.footprint.width * b.shape.footprint.height -
        a.shape.footprint.width * a.shape.footprint.height ||
      a.group.month - b.group.month,
  );
  let searches = 0,
    exhausted = false;
  const found: { cells: MonthFloorCell[] | null } = { cells: null };
  const candidates = (
    block: (typeof blocks)[number],
    placed: readonly MonthFloorCell[],
    strict: boolean,
  ) => {
    const { group, old, shape } = block,
      local = shape.footprint,
      wanted = preferred(group);
    const blockers = [
      ...bounds.obstacles,
      ...placed.map((c) => c.footprint),
      ...reservations.filter((r) => !sameInstance(r, group)).map((r) => r.footprint),
    ];
    const origins: { x: number; y: number }[] = [];
    if (wanted) origins.push(wanted);
    if (!strict || !old || !sameCards(old.cards, group.cards)) {
      const loX = STACK_EDGE - local.x,
        loY = STACK_EDGE - local.y,
        hiX = bounds.width - STACK_EDGE - local.width - local.x,
        hiY = bounds.height - STACK_EDGE - local.height - local.y;
      const seed = group.month * 7 + group.cards[0]!;
      for (let i = 1; i <= 96; i++)
        origins.push({
          x: loX + fraction(i + seed, 2) * (hiX - loX),
          y: loY + fraction(i + seed, 3) * (hiY - loY),
        });
      const xs = new Set([
        loX,
        hiX,
        ...blockers.flatMap((r) => [
          r.x - STACK_GAP - local.width - local.x,
          r.x + r.width + STACK_GAP - local.x,
        ]),
      ]);
      const ys = new Set([
        loY,
        hiY,
        ...blockers.flatMap((r) => [
          r.y - STACK_GAP - local.height - local.y,
          r.y + r.height + STACK_GAP - local.y,
        ]),
      ]);
      for (const x of xs) for (const y of ys) origins.push({ x, y });
    }
    const angle = ((group.month * 0.61803398875) % 1) * Math.PI * 2;
    const ideal = {
      x:
        bounds.width / 2 +
        ((Math.cos(angle) * (bounds.width - local.width)) / 2) * 0.88 -
        local.width / 2 -
        local.x,
      y:
        bounds.height / 2 +
        ((Math.sin(angle) * (bounds.height - local.height)) / 2) * 0.88 -
        local.height / 2 -
        local.y,
    };
    const seen = new Set<string>();
    return origins
      .filter((p) => {
        const key = `${p.x}:${p.y}`;
        if (seen.has(key)) return false;
        seen.add(key);
        const rect = shifted(local, p.x, p.y);
        return inside(rect, bounds) && !blockers.some((b) => floorRectsOverlap(rect, b, STACK_GAP));
      })
      .sort((a, b) => {
        const reference = wanted ?? ideal;
        const da = Math.hypot(a.x - reference.x, a.y - reference.y),
          db = Math.hypot(b.x - reference.x, b.y - reference.y);
        return da - db || a.y - b.y || a.x - b.x;
      });
  };
  // 현재 장애 영역 뒤의 최대 빈 사각형을 덮개로 만든다. 겹치는 덮개는 용량을 과대평가할 뿐
  // 유효 해를 잘라내지 않는다. 최소 묶음 크기의 origin 격자당 하나만 배치할 수 있는 상한이다.
  const capacityEnough = (i: number, placed: readonly MonthFloorCell[]) => {
    if (i === blocks.length) return true;
    let regions: FloorRect[] = [
      {
        x: STACK_EDGE,
        y: STACK_EDGE,
        width: bounds.width - 2 * STACK_EDGE,
        height: bounds.height - 2 * STACK_EDGE,
      },
    ];
    const blockers = [
      ...bounds.obstacles,
      ...placed.map((c) => c.footprint),
      ...reservations
        .filter((r) => !blocks.slice(i).some((b) => sameInstance(b.group, r)))
        .map((c) => c.footprint),
    ];
    for (const source of blockers) {
      const obstacle = {
        x: source.x - STACK_GAP,
        y: source.y - STACK_GAP,
        width: source.width + 2 * STACK_GAP,
        height: source.height + 2 * STACK_GAP,
      };
      const split = regions.flatMap((r) => {
        if (!floorRectsOverlap(r, obstacle)) return [r];
        const out: FloorRect[] = [];
        const left = Math.min(r.x + r.width, obstacle.x),
          right = Math.max(r.x, obstacle.x + obstacle.width),
          top = Math.min(r.y + r.height, obstacle.y),
          bottom = Math.max(r.y, obstacle.y + obstacle.height);
        if (left > r.x) out.push({ ...r, width: left - r.x });
        if (right < r.x + r.width) out.push({ ...r, x: right, width: r.x + r.width - right });
        if (top > r.y) out.push({ ...r, height: top - r.y });
        if (bottom < r.y + r.height) out.push({ ...r, y: bottom, height: r.y + r.height - bottom });
        return out;
      });
      regions = split.filter(
        (r, at) =>
          !split.some(
            (other, j) =>
              j !== at &&
              other.x <= r.x &&
              other.y <= r.y &&
              other.x + other.width >= r.x + r.width &&
              other.y + other.height >= r.y + r.height &&
              (j < at || other.width > r.width || other.height > r.height),
          ),
      );
    }
    const remaining = blocks.slice(i),
      w = Math.min(...remaining.map((b) => b.shape.footprint.width)),
      h = Math.min(...remaining.map((b) => b.shape.footprint.height));
    // 각 카드가 어느 덮개 하나 안에 완전히 든다. 서로 겹친 덮개도 합산해 보수적 상한만 쓴다.
    const capacity = regions.reduce(
      (n, r) =>
        n +
        Math.max(0, Math.floor((r.width + STACK_GAP) / (w + STACK_GAP))) *
          Math.max(0, Math.floor((r.height + STACK_GAP) / (h + STACK_GAP))),
      0,
    );
    return capacity >= remaining.length;
  };
  const visit = (i: number, placed: MonthFloorCell[], strict: boolean): boolean => {
    if (++searches > STACK_SEARCH_LIMIT) {
      exhausted = true;
      return false;
    }
    if (i === blocks.length) {
      found.cells = placed;
      return true;
    }
    if (!capacityEnough(i, placed)) {
      capacityPrunes++;
      return false;
    }
    const b = blocks[i]!;
    for (const origin of candidates(b, placed, strict)) {
      if (
        visit(
          i + 1,
          [...placed, stackCell(b.group, b.shape, origin, b.old?.slot ?? b.group.month - 1)],
          strict,
        )
      )
        return true;
      if (exhausted) return false;
    }
    return false;
  };
  visit(0, [], true);
  if (!found.cells && !exhausted) visit(0, [], false);
  // 탐색 실패 뒤에도 실제 크기와 현재 영역으로 만든 유한 배치를 검사한다.
  // 각 위치는 실제 카드·예약·더미 검사를 통과해야 한다. 이전 유효 배치가 먼저다.
  if (!found.cells) {
    const boundaryBlocks = blocks.map((b) => ({
      ...b,
      shape: monthShape(b.group, bounds, b.old, 0),
    }));
    const edge = STACK_EDGE + 0.000001;
    const w = Math.max(...boundaryBlocks.map((b) => b.shape.footprint.width));
    const h = Math.max(...boundaryBlocks.map((b) => b.shape.footprint.height));
    const columns = Math.min(
      boundaryBlocks.length,
      Math.floor((bounds.width - 2 * edge + STACK_GAP) / (w + STACK_GAP)),
    );
    const rows = Math.min(
      boundaryBlocks.length,
      Math.floor((bounds.height - 2 * edge + STACK_GAP) / (h + STACK_GAP)),
    );
    const slots: { x: number; y: number }[] = [];
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++)
        slots.push({
          x: edge + (columns === 1 ? 0 : (column * (bounds.width - 2 * edge - w)) / (columns - 1)),
          y: edge + (rows === 1 ? 0 : (row * (bounds.height - 2 * edge - h)) / (rows - 1)),
        });
    const options = boundaryBlocks.map((b) =>
      slots
        .map((slot, at) => ({
          at,
          cell: stackCell(
            b.group,
            b.shape,
            { x: slot.x - b.shape.footprint.x, y: slot.y - b.shape.footprint.y },
            b.old?.slot ?? b.group.month - 1,
          ),
        }))
        .filter(({ cell }) => validStacks([cell], bounds, reservations)),
    );
    const assigned = new Map<number, { block: number; cell: MonthFloorCell }>();
    const assign = (block: number, seen: Set<number>): boolean => {
      for (const { at, cell } of options[block]!) {
        if (seen.has(at)) continue;
        seen.add(at);
        const occupied = assigned.get(at);
        if (!occupied || assign(occupied.block, seen)) {
          assigned.set(at, { block, cell });
          return true;
        }
      }
      return false;
    };
    const order = boundaryBlocks
      .map((_, i) => i)
      .sort(
        (a, b) =>
          options[a]!.length - options[b]!.length ||
          boundaryBlocks[a]!.group.month - boundaryBlocks[b]!.group.month,
      );
    if (order.every((block) => assign(block, new Set()))) {
      const cells = [...assigned.values()].map(({ cell }) => cell);
      if (validStacks(cells, bounds, reservations)) {
        found.cells = cells;
        strategy = 'boundary';
      }
    }
  }
  // 후보 미발견은 불가능 증명이 아니다. 실패는 별도 상태이며 개발 진단만 그린다.
  return result(
    found.cells ? found.cells.sort((a, b) => a.month - b.month) : null,
    searches,
    exhausted,
  );
}
