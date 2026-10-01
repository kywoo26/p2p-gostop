// #201: 공개 합성 입력. boundary는 seed2의 합법 진행 바닥이다.
import type { FloorGroupView } from '../lib/view-types.ts';
export const floorGroup = (
  month: FloorGroupView['month'],
  cards: number[],
  kind: FloorGroupView['kind'] = 'loose',
): FloorGroupView => ({ month, cards, kind, owner: kind === 'ppeok' ? 1 : null });
export const stableBefore = [floorGroup(1, [0]), floorGroup(2, [4]), floorGroup(3, [8])];
export const stableAfter = [floorGroup(1, [0]), floorGroup(2, [4, 5]), floorGroup(3, [8])];
export const boundaryBefore = [
  floorGroup(3, [11]),
  floorGroup(4, [12, 15]),
  floorGroup(5, [18]),
  floorGroup(8, [31]),
  floorGroup(9, [33]),
  floorGroup(10, [38]),
  floorGroup(11, [40, 42]),
  floorGroup(12, [46]),
];
export const boundaryAfter = boundaryBefore.map((g) =>
  g.month === 9 ? floorGroup(9, [33, 34, 32], 'ppeok') : g,
);
export const boundarySlots = [
  [12, 5],
  [15, 6],
  [40, 8],
  [42, 9],
  [11, 2],
  [18, 11],
  [31, 12],
  [33, 1],
  [38, 13],
  [46, 3],
] as const;
