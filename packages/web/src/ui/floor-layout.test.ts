import { expect, test } from 'vitest';
import fc from 'fast-check';
import type { FloorGroupView } from '../lib/view-types.ts';
import { floorLayout } from './floor-layout.ts';

const groups = (counts: number[]): FloorGroupView[] =>
  counts.flatMap((count, month) =>
    count
      ? [
          {
            month: (month + 1) as FloorGroupView['month'],
            kind: 'loose',
            owner: null,
            cards: Array.from({ length: count }, (_, i) => month * 4 + i),
          },
        ]
      : [],
  );

test('중앙 7번을 비우고 좌우·상하·대각·바깥 순서로 결정적으로 채운다', () => {
  const input = groups(Array(12).fill(1));
  const result = floorLayout(input, [], 336, 244, 48);
  expect(result.fits).toBe(true);
  expect(result.cells.map((c) => c.slot)).toEqual([6, 8, 2, 12, 1, 3, 11, 13, 5, 9, 0, 4]);
  expect(floorLayout([...input].reverse(), [], 336, 244, 48)).toEqual(result);
});

test('14장은 독립 셀, 15장부터만 같은 월 스택을 허용하고 후보는 독립 셀이다', () => {
  for (const counts of [
    [2, 2, 2, 2, 2, 2, 2],
    [4, 3, 3, 2, 2],
  ]) {
    const result = floorLayout(groups(counts), [], 336, 244, 48);
    expect(result.fits).toBe(true);
    expect(result.folded).toBe(false);
    expect(new Set(result.cells.map((c) => c.slot)).size).toBe(14);
    expect(result.cells.every((c) => c.cards.length === 1)).toBe(true);
  }
  const result = floorLayout(groups([3, 3, 3, 3, 3]), [0, 1], 336, 244, 48);
  expect(result.fits).toBe(true);
  expect(result.folded).toBe(true);
  for (const id of [0, 1])
    expect(result.cells.find((c) => c.cards.includes(id))?.cards).toEqual([id]);
});

test('월별 연결·카드 보존·회전한 경계의 셀 내부 포함을 다양한 바닥에서 보장한다', () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc
          .uniqueArray(fc.integer({ min: 0, max: 47 }), { maxLength: 14 })
          .map((cards) =>
            Array.from(
              { length: 12 },
              (_, month) => cards.filter((id) => Math.floor(id / 4) === month).length,
            ),
          ),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 12, maxLength: 12 }),
      ),
      (counts) => {
        // 정상 바닥(14장)과 각 월 최대 3장의 과밀 경계를 함께 검사한다.
        const input = groups(counts);
        for (const height of [244, 304]) {
          const result = floorLayout(input, [], 336, height, 48);
          expect(result.fits).toBe(true);
          expect(result.cells.flatMap((c) => c.cards).sort((a, b) => a - b)).toEqual(
            input.flatMap((g) => g.cards),
          );
          expect(new Set(result.cells.map((c) => c.slot)).size).toBe(result.cells.length);
          expect(result.cells.every((c) => c.slot !== 7)).toBe(true);
          const cw = 60,
            ch = Math.min(48 / 0.614 + 12, height / 3);
          for (const cell of result.cells) {
            const left = 18 + (cell.slot % 5) * cw;
            const top = (height - 3 * ch) / 2 + Math.floor(cell.slot / 5) * ch;
            const angle = (Math.abs(cell.angle) * Math.PI) / 180;
            const width = 48 + (cell.cards.length - 1) * 5,
              cardHeight = 48 / 0.614;
            const w = width * Math.cos(angle) + cardHeight * Math.sin(angle);
            const h = cardHeight * Math.cos(angle) + width * Math.sin(angle);
            const x = cell.x + cell.dx + width / 2,
              y = cell.y + cell.dy + cardHeight / 2;
            expect(Math.abs(cell.angle)).toBeLessThanOrEqual(4);
            expect(Math.abs(cell.dx)).toBeLessThanOrEqual(3);
            expect(Math.abs(cell.dy)).toBeLessThanOrEqual(3);
            expect(x - w / 2).toBeGreaterThanOrEqual(left);
            expect(x + w / 2).toBeLessThanOrEqual(left + cw);
            expect(y - h / 2).toBeGreaterThanOrEqual(top);
            expect(y + h / 2).toBeLessThanOrEqual(top + ch);
          }
          for (const group of input) {
            const slots = result.cells.filter((c) => c.month === group.month).map((c) => c.slot);
            const reached = new Set([slots[0]!]);
            for (let i = 0; i < slots.length; i++)
              for (const a of reached)
                for (const b of slots)
                  if (
                    Math.max(
                      Math.abs((a % 5) - (b % 5)),
                      Math.abs(Math.floor(a / 5) - Math.floor(b / 5)),
                    ) === 1
                  )
                    reached.add(b);
            expect(reached.size).toBe(slots.length);
          }
        }
      },
    ),
    { numRuns: 200 },
  );
});
