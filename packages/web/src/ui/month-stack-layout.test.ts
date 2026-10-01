import { expect, test } from 'vitest';
import {
  floorPresentationOrder,
  floorRectsOverlap,
  layoutMonthFloor,
  projectMonthFloorReservations,
} from './floor-layout.ts';
import type {
  MonthFloorBounds,
  MonthFloorCell,
  MonthFloorLayout,
  MonthFloorPlaced,
} from './floor-layout.ts';
import { floorGroup, boundaryAfter } from './floor-stability-fixtures.ts';

// actual Board 고정 capture 165412510Z의 부모·paint 측정. 기대 배치 좌표를 solver에 주지 않는다.
const bounds: MonthFloorBounds = {
  width: 336,
  height: 243.78125,
  cardWidth: 44,
  paintPadding: 1,
  obstacles: [
    { x: 146, y: 86.0625, width: 48, height: 75.65625 },
    { x: 145, y: 85.0625, width: 46, height: 73.65625 },
    { x: 163.40625, y: 136.71875, width: 25.59375, height: 20 },
  ],
};
const placed = (result: MonthFloorLayout): MonthFloorPlaced => {
  expect(result.status).toBe('placed');
  if (!result.fits) throw new Error(`미발견: ${result.failure.reason}`);
  return result;
};
const safe = (cells: readonly MonthFloorCell[], size = bounds) => {
  for (const [i, c] of cells.entries()) {
    expect(c.footprint.x).toBeGreaterThanOrEqual(2);
    expect(c.footprint.y).toBeGreaterThanOrEqual(2);
    expect(c.footprint.x + c.footprint.width).toBeLessThanOrEqual(size.width - 2);
    expect(c.footprint.y + c.footprint.height).toBeLessThanOrEqual(size.height - 2);
    for (const b of [...size.obstacles, ...cells.slice(i + 1).map((c) => c.footprint)])
      expect(floorRectsOverlap(c.footprint, b, 12)).toBe(false);
  }
};

test('합법 진행 혼잡 fixture는 전체 ID의 distinct pose와 타월·deck paint 여백을 보존한다', () => {
  const normal = [
    floorGroup(1, [3]),
    floorGroup(2, [7]),
    floorGroup(4, [13, 15, 12, 48, 50], 'ppeok'),
    floorGroup(7, [27]),
    floorGroup(10, [38]),
    floorGroup(12, [45]),
  ];
  const normalResult = placed(layoutMonthFloor(normal, bounds));
  safe(normalResult.cells);
  expect(normalResult.exhausted).toBe(false);
  const result = placed(layoutMonthFloor(boundaryAfter, bounds));
  expect(result.exhausted).toBe(false);
  safe(result.cells);
  expect(result.searches).toBeGreaterThan(0); // 최초 탐색과 안정 후 0을 구분한다.
  for (const cell of result.cells) {
    expect(cell.poses.map((p) => p.id)).toEqual(
      boundaryAfter.find((g) => g.month === cell.month)!.cards,
    );
    expect(new Set(cell.poses.map((p) => `${p.x}:${p.y}`)).size).toBe(cell.cards.length);
    expect(cell.poses.every((p) => p.angle === cell.angle)).toBe(true);
  }
  expect(layoutMonthFloor([...boundaryAfter].reverse(), bounds).cells).toEqual(result.cells);
  const reused = placed(layoutMonthFloor(boundaryAfter, bounds, result));
  expect(reused.searches).toBe(0);
  expect(reused.cells).toEqual(result.cells);
});

test('뻑5·구성6·획득전7은 bonus 중간/최종월 top이며 authority 배열을 변경하지 않는다', () => {
  for (const [cards, expected] of [
    [
      [13, 15, 12, 48, 50],
      [13, 15, 48, 50, 12],
    ],
    [
      [0, 1, 2, 48, 49, 50],
      [0, 1, 48, 49, 50, 2],
    ],
    [
      [0, 1, 2, 48, 49, 50, 3],
      [0, 1, 48, 49, 50, 2, 3],
    ],
  ]) {
    const group = floorGroup(cards![0]! < 4 ? 1 : 4, cards!, 'ppeok');
    const copy = [...group.cards];
    const result = placed(layoutMonthFloor([group], bounds));
    const cell = result.cells[0]!;
    expect([...cell.poses].sort((a, b) => a.z - b.z).map((p) => p.id)).toEqual(expected);
    expect(floorPresentationOrder(group)).toEqual(expected);
    expect(group.cards).toEqual(copy);
    expect(new Set(cell.poses.map((p) => p.index)).size).toBe(copy.length);
    safe(result.cells);
    const snapshot = placed(layoutMonthFloor([{ ...group, cards: [...copy] }], bounds, result));
    expect(snapshot.cells).toEqual(result.cells);
  }
});

test('작은 증가는 원위치·큰 증가는 원본 local pose와 무관월을 보존하며 settled 이동을 구분한다', () => {
  const groups = (cards: number[]) => [
    floorGroup(1, cards, cards.length >= 3 ? 'ppeok' : 'loose'),
    floorGroup(2, [4]),
    floorGroup(3, [8]),
  ];
  let previous = placed(layoutMonthFloor(groups([0]), bounds));
  const unrelated = previous.cells.filter((c) => c.month !== 1);
  for (const cards of [
    [0, 1],
    [0, 1, 2, 48, 49, 50],
    [0, 1, 2, 48, 49, 50, 3],
  ]) {
    const next = placed(layoutMonthFloor(groups(cards), bounds, previous));
    safe(next.cells);
    expect(next.cells.filter((c) => c.month !== 1)).toEqual(unrelated);
    for (const p of previous.cells.find((c) => c.month === 1)!.poses) {
      const q = next.cells.find((c) => c.month === 1)!.poses.find((q) => q.id === p.id)!;
      expect({ localX: q.localX, localY: q.localY, angle: q.angle, index: q.index }).toEqual({
        localX: p.localX,
        localY: p.localY,
        angle: p.angle,
        index: p.index,
      });
      if (cards.length === 2) expect({ x: q.x, y: q.y }).toEqual({ x: p.x, y: p.y });
    }
    if (cards.length === 2)
      expect(next.cells.find((c) => c.month === 1)!.localWidth).toBeLessThan(70); // 두 장에7장 예약을 강제하지 않는다.
    previous = next;
  }
  const shrink = placed(layoutMonthFloor(groups([1, 2, 48, 49, 50, 3]), bounds, previous));
  const before = previous.cells.find((c) => c.month === 1)!,
    after = shrink.cells.find((c) => c.month === 1)!;
  for (const p of after.poses)
    expect(before.poses.find((q) => q.id === p.id)).toEqual(
      expect.objectContaining({ x: p.x, y: p.y, index: p.index }),
    );
});

test('삭제 예약·연속 resize의 좌표계는 마지막 성공 배치와 분리되고 해제 뒤 유효 재사용한다', () => {
  const groups = [floorGroup(1, [0]), floorGroup(2, [4]), floorGroup(3, [8])];
  const initial = placed(layoutMonthFloor(groups, bounds));
  const removed = initial.cells.find((c) => c.month === 1)!;
  const nextGroups = [...groups.slice(1), floorGroup(4, [12])];
  const kept = { ...initial, cells: initial.cells.filter((c) => c.month !== 1) };
  const held = placed(layoutMonthFloor(nextGroups, bounds, kept, [removed]));
  safe(held.cells);
  expect(
    floorRectsOverlap(held.cells.find((c) => c.month === 4)!.footprint, removed.footprint, 12),
  ).toBe(false);
  const bigger = { ...bounds, width: 400, height: 300, obstacles: [] };
  const intermediate = { ...bounds, width: 380, height: 280, obstacles: [] };
  const via = projectMonthFloorReservations(
    projectMonthFloorReservations([removed], bounds, intermediate),
    intermediate,
    bigger,
  );
  const direct = projectMonthFloorReservations([removed], bounds, bigger);
  expect(via[0]!.origin.x).toBeCloseTo(direct[0]!.origin.x, 10);
  expect(via[0]!.origin.y).toBeCloseTo(direct[0]!.origin.y, 10);
  const resized = placed(layoutMonthFloor(nextGroups, bigger, held, via));
  safe(resized.cells, bigger);
  expect(layoutMonthFloor(nextGroups, bigger, resized, via).cells).toEqual(resized.cells);
  safe(placed(layoutMonthFloor(nextGroups, bounds, kept)).cells);
});

test('유효 strict 재투영은 탐색0, 미발견은 fake placement 없이 실패 ID를 전달한다', () => {
  const groups = [floorGroup(1, [0, 1]), floorGroup(2, [4]), floorGroup(3, [8])];
  const initial = placed(layoutMonthFloor(groups, bounds));
  const bigger = { ...bounds, width: 400, height: 300, obstacles: [] };
  const projected = placed(layoutMonthFloor(groups, bigger, initial));
  expect(projected.searches).toBe(0);
  expect(projected.reprojected).toBe(true);
  safe(projected.cells, bigger);
  const failed = layoutMonthFloor([floorGroup(1, [0, 1, 2, 48, 49, 50])], {
    ...bounds,
    height: 70,
    obstacles: [],
  });
  expect(failed.status).toBe('failed');
  expect(failed.cells).toEqual([]);
  if (failed.fits) throw new Error('실패 fixture가 placed로 반환됨');
  expect(failed.failure.cardIds).toEqual([0, 1, 2, 48, 49, 50]);
  const recovered = placed(layoutMonthFloor(groups, bounds, failed));
  safe(recovered.cells);
});

// 빈영역 cover의 상한이 해를 기각하지 않는 작은 구성 증인. 완전성/모든 판 증명이 아니다.
test('pruning 경계는 명시적 유효 구성2·3·4개와 deck 분리 구성을 기각하지 않는다', () => {
  for (const count of [2, 3, 4]) {
    const groups = Array.from({ length: count }, (_, i) =>
      floorGroup(([1, 2, 3, 4] as const)[i]!, [i * 4]),
    );
    const small = {
      width: count * 65 + 4,
      height: 82,
      cardWidth: 44,
      paintPadding: 1,
      obstacles: [],
    };
    const result = placed(layoutMonthFloor(groups, small));
    safe(result.cells, small);
  }
  const split = {
    width: 210,
    height: 82,
    cardWidth: 44,
    paintPadding: 1,
    obstacles: [{ x: 81, y: 0, width: 48, height: 82 }],
  };
  const result = placed(layoutMonthFloor([floorGroup(1, [0]), floorGroup(2, [4])], split));
  safe(result.cells, split);
});

test('남은 카드의 빈 prefix는 footprint에서 빠지되 pose와 별도 삭제 예약은 유지한다', () => {
  const initial = placed(layoutMonthFloor([floorGroup(1, [0, 1])], bounds));
  const before = initial.cells[0]!;
  const after = placed(layoutMonthFloor([floorGroup(1, [1])], bounds, initial)).cells[0]!;
  expect(after.poses[0]).toEqual({ ...before.poses.find((p) => p.id === 1), z: 1 });
  expect(after.footprint.width).toBeLessThan(before.footprint.width - 9);
  expect(after.footprint.height).toBeLessThan(before.footprint.height - 4);
  const next = placed(
    layoutMonthFloor([floorGroup(1, [1]), floorGroup(2, [4])], bounds, initial, [before]),
  );
  expect(floorRectsOverlap(next.cells[1]!.footprint, before.footprint, 12)).toBe(false);
  const noReservation = placed(
    layoutMonthFloor([floorGroup(1, [1]), floorGroup(2, [4])], bounds, next),
  );
  safe(noReservation.cells);
});

test('실제42px 부모의 12월은 탐색 상한 뒤 검증된 경계 배치로 모든 ID를 보존한다', () => {
  const groups = Array.from({ length: 12 }, (_, i) => floorGroup((i + 1) as 1, [i * 4]));
  for (const [width, height, obstacleX, obstacleY] of [
    [336, 243.78125, 147, 87.6953125],
    [366, 241.4375, 162, 86.5234375],
  ]) {
    const current = {
      width: width!,
      height: height!,
      cardWidth: 42,
      paintPadding: 1,
      obstacles: [{ x: obstacleX!, y: obstacleY!, width: 46, height: 72.390625 }],
    };
    const first = placed(layoutMonthFloor(groups, current));
    expect(first.strategy).toBe('boundary');
    expect(first.cells.every((c) => c.angle === 0 && c.poses.every((p) => p.angle === 0))).toBe(
      true,
    );
    expect(first.searches).toBe(129);
    expect(first.primaryLimit).toBe(128);
    expect(first.witnessValid).toBe(true);
    expect(first.witnessSlots).toBeLessThanOrEqual(groups.length ** 2);
    expect(first.witnessCandidates).toBe(groups.length * first.witnessSlots);
    expect(first.witnessChecks).toBe(first.witnessCandidates + 1);
    expect(first.witnessEdges).toBeLessThanOrEqual(groups.length ** 2 * first.witnessSlots);
    expect(first.exhausted).toBe(true);
    safe(first.cells, current);
    expect(first.cells.flatMap((c) => c.cards)).toEqual(groups.flatMap((g) => g.cards));
    expect(placed(layoutMonthFloor([...groups].reverse(), current)).cells).toEqual(first.cells);
    const reused = placed(layoutMonthFloor(groups, current, first));
    expect(reused.searches).toBe(0);
    expect(reused.witnessCandidates).toBe(0);
    expect(reused.witnessChecks).toBe(0);
    expect(reused.strategy).toBe('boundary');
    expect(reused.cells).toEqual(first.cells);
    const impossible = layoutMonthFloor(groups, { ...current, height: 70 }, first);
    expect(impossible.status).toBe('failed');
    expect(impossible.cells).toEqual([]);
  }
});

test('witness는 사용 중 삭제 예약을 건너뛰지 않고 없는 경우 기존 탐색 예산을 유지한다', () => {
  const groups = Array.from({ length: 12 }, (_, i) => floorGroup((i + 1) as 1, [i * 4]));
  const current = {
    width: 336,
    height: 243.78125,
    cardWidth: 42,
    paintPadding: 1,
    obstacles: [{ x: 147, y: 87.6953125, width: 46, height: 72.390625 }],
  };
  const valid = placed(layoutMonthFloor(groups, current));
  const reserved = {
    ...valid.cells[0]!,
    cards: [3],
    footprint: { x: 2, y: 2, width: 332, height: 239.78125 },
  };
  const blocked = layoutMonthFloor(groups, current, valid, [reserved]);
  expect(blocked.status).toBe('failed');
  expect(blocked.witnessValid).toBe(false);
  expect(blocked.primaryLimit).toBe(8192);
  expect(blocked.cells).toEqual([]);
  const recovered = placed(layoutMonthFloor(groups, current, valid));
  expect(recovered.cells).toEqual(valid.cells);
  expect(recovered.witnessCandidates).toBe(0);
});

// 합성51은 유한 비용 상한 probe다. 실제 합법 floor 도달/지원 Board fixture가 아니다.
test('12월·51원본 합성 비용 상한에서 witness 슬롯·카드 pose 생성 수는 유한하다', () => {
  const groups = Array.from({ length: 12 }, (_, i) =>
    floorGroup(
      (i + 1) as 1,
      i === 11 ? [44, 45, 46, 47, 48, 49, 50] : [i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3],
    ),
  );
  const result = placed(
    layoutMonthFloor(groups, {
      width: 4096,
      height: 4096,
      cardWidth: 42,
      paintPadding: 1,
      obstacles: [],
    }),
  );
  expect(result.witnessValid).toBe(true);
  expect(result.witnessSlots).toBe(144);
  expect(result.witnessCandidates).toBe(1728);
  expect(result.witnessEdges).toBeLessThanOrEqual(12 ** 2 * 144);
  expect(result.witnessSlots * groups.flatMap((g) => g.cards).length).toBe(7344);
  expect(
    result.cells
      .flatMap((c) => c.poses)
      .map((p) => p.id)
      .sort((a, b) => a - b),
  ).toEqual(Array.from({ length: 51 }, (_, i) => i));
});
