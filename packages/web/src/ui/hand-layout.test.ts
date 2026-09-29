import { expect, test } from 'vitest';
import fc from 'fast-check';
import { getCard } from '@p2p-gostop/engine';
import { handRows } from './hand-layout.ts';
import { sortHand } from './cards.ts';

test('10장 손패는 어떤 조합에서도 월 묶음을 보존하고 줄당 4~6장을 둔다 (#114)', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 49 }), { minLength: 10, maxLength: 10 }),
      (cards) => {
        const rows = handRows(cards);
        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.length >= 4 && row.length <= 6)).toBe(true);
        expect(rows.flat().toSorted((a, b) => a - b)).toEqual(cards.toSorted((a, b) => a - b));
        for (let month = 1; month <= 12; month++) {
          const occurrences = rows.map(
            (row) => row.filter((id) => getCard(id).month === month).length,
          );
          expect(occurrences.filter(Boolean)).toHaveLength(
            occurrences.some((count) => count > 0) ? 1 : 0,
          );
        }
        for (const row of rows) {
          for (let i = 1; i < row.length; i++) {
            if (getCard(row[i]!).month === getCard(row[i - 1]!).month)
              expect(sortHand([row[i - 1]!, row[i]!])).toEqual([row[i - 1]!, row[i]!]);
          }
        }
      },
    ),
    { numRuns: 1000 },
  );
});

test('3+4+3, 복수 묶음, 보너스 포함 손패도 월 경계를 넘기지 않는다', () => {
  for (const cards of [
    [0, 1, 2, 4, 5, 6, 7, 8, 9, 10],
    [0, 1, 2, 3, 4, 5, 6, 8, 48, 49],
    [0, 1, 4, 5, 8, 9, 12, 13, 16, 17],
  ]) {
    const rows = handRows(cards);
    expect(rows.every((row) => row.length >= 4 && row.length <= 6)).toBe(true);
    for (let month = 1; month <= 12; month++)
      expect(rows.filter((row) => row.some((id) => getCard(id).month === month))).toHaveLength(
        cards.some((id) => getCard(id).month === month) ? 1 : 0,
      );
  }
});
