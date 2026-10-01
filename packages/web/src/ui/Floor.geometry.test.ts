import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Board from './Board.svelte';
import { fixtures } from '../lib/fixtures.ts';
import type { BoardView } from '../lib/view-types.ts';
import '../styles/skin-fan.css';

const settle = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const rect = (el: Element) => {
  const b = el.getBoundingClientRect();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
};
const measure = (root: HTMLElement) => {
  const cards = [...root.querySelectorAll<HTMLElement>('.floor [data-card-id]')].map((el) => ({
    id: Number(el.dataset['cardId']),
    slot: Number(el.closest('[data-floor-slot]')?.getAttribute('data-floor-slot')),
    ...rect(el),
  }));
  const blockers = [
    ...root.querySelectorAll('.deck-stack .card, .hand .card, .captured-zone .card'),
  ].map(rect);
  let overlap = 0;
  for (let i = 0; i < cards.length; i++)
    for (const b of [...cards.slice(i + 1), ...blockers]) {
      const a = cards[i]!;
      if (
        Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
        Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
      )
        overlap++;
    }
  const table = rect(root.querySelector('.table')!);
  const clipped = cards.filter(
    (c) =>
      c.x < table.x ||
      c.y < table.y ||
      c.x + c.width > table.x + table.width ||
      c.y + c.height > table.y + table.height,
  ).length;
  return {
    cards,
    table,
    overlap,
    clipped,
    fits: root.querySelector('.table')!.getAttribute('data-floor-fits'),
    handWidths: [...root.querySelectorAll('.hand .card')].map((el) => getComputedStyle(el).width),
    captureWidths: [...root.querySelectorAll('.captured-zone .card')].map(
      (el) => getComputedStyle(el).width,
    ),
    floorWidths: [...root.querySelectorAll('.floor .card')].map((el) => getComputedStyle(el).width),
    handHidden: [...root.querySelectorAll('.hand .card')].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.bottom > innerHeight || b.right > innerWidth || b.left < 0 || b.top < 0;
    }).length,
  };
};
const makeView = (count: number, round = 1, deckCount = 20): BoardView => {
  const initial = fixtures.board.states.play;
  const hand = Array.from({ length: count }, (_, i) => i * 4 + 1);
  return {
    ...initial,
    round,
    deckCount,
    floor: Array.from({ length: 12 }, (_, i) => ({
      month: (i + 1) as 1,
      kind: 'loose',
      owner: null,
      cards: [i * 4],
    })),
    seats: initial.seats.map((s, i) =>
      i === initial.viewer ? { ...s, hand, handCount: count } : s,
    ) as unknown as BoardView['seats'],
    playable: hand,
  };
};
for (const [width, height] of [
  [360, 780],
  [390, 734],
  [412, 840],
]) {
  test(`fixed floor geometry ${width}x${height}`, async ({ task }) => {
    await page.viewport(width!, height!);
    const results = [];
    for (const count of [6, 7, 10]) {
      const screen = await render(Board, { view: makeView(count) });
      await settle();
      const before = measure(screen.container);
      const changes = [];
      for (const [n, round, deck] of [
        [7, 1, 20],
        [6, 1, 20],
        [10, 2, 30],
        [6, 2, 30],
      ]) {
        await screen.rerender({ view: makeView(n!, round!, deck!) });
        const frames = [];
        for (let f = 0; f < 6; f++) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          frames.push(measure(screen.container));
        }
        const maximum = Math.max(
          ...frames.flatMap((frame) =>
            frame.cards.map((c) => {
              const b = before.cards.find((b) => b.id === c.id)!;
              return Math.max(Math.abs(c.x - b.x), Math.abs(c.y - b.y));
            }),
          ),
        );
        expect(maximum).toBe(0);
        for (const frame of frames) {
          expect(frame.overlap).toBe(0);
          expect(frame.clipped).toBe(0);
          expect(frame.fits).toBe('true');
          expect(new Set(frame.cards.map((c) => c.slot)).size).toBe(12);
          expect(frame.cards.every((c) => c.slot !== 7)).toBe(true);
          expect(frame.floorWidths.every((w) => w === '48px')).toBe(true);
          expect(frame.handWidths.every((w) => w === '48px')).toBe(true);
          expect(frame.captureWidths.every((w) => w === '32px')).toBe(true);
          expect(frame.handHidden).toBe(0);
        }
        changes.push({
          hand: n,
          round,
          deck,
          maximum,
          last: frames.at(-1),
          maximumOverlap: Math.max(...frames.map((f) => f.overlap)),
          maximumClipped: Math.max(...frames.map((f) => f.clipped)),
        });
      }
      await page.viewport(780, 360);
      await settle();
      const rotated = measure(screen.container);
      await page.viewport(width!, height!);
      await settle();
      const returned = measure(screen.container);
      expect(returned.cards).toEqual(before.cards);
      expect(rotated.cards.map((c) => [c.id, c.slot])).toEqual(
        before.cards.map((c) => [c.id, c.slot]),
      );
      results.push({ initial: count, before, changes, rotated, returned });
      await screen.unmount();
    }
    console.info(
      'FLOOR_PROJECTION_EXPERIMENT',
      JSON.stringify({
        candidate: 'board-stable-budget',
        engine: task.file.projectName,
        viewport: [width, height],
        results,
      }),
    );
  });
}

test('first pick retains its budget, play reserves two hand rows without new layout state', async () => {
  await page.viewport(360, 780);
  const initial = { ...makeView(0), floor: [], deckCount: 51 };
  const extras = {
    pickFirst: { poolSize: 12, taken: null },
    bombMonths: [],
    canFlipOnly: false,
    goStop: null,
    dealer: 0 as const,
  };
  const screen = await render(Board, { view: initial, extras });
  const board = screen.container.querySelector('.board')!;
  expect(board.classList.contains('first-pick')).toBe(true);
  expect(board.classList.contains('two-hands')).toBe(false);
  await screen.rerender({ view: makeView(6), extras: { ...extras, pickFirst: null } });
  await settle();
  expect(board.classList.contains('first-pick')).toBe(false);
  expect(board.classList.contains('two-hands')).toBe(true);
  const before = measure(screen.container);
  await screen.rerender({ view: makeView(7) });
  await settle();
  expect(measure(screen.container).cards).toEqual(before.cards);
});
