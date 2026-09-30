import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Board from './Board.svelte';
import { fixtures } from '../lib/fixtures.ts';
import { stableBefore, stableAfter } from './floor-stability-fixtures.ts';
import '../styles/skin-fan.css';

const frame = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.floor [data-card-id]')]
    .map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        id: Number(card.dataset['cardId']),
        slot: Number(card.closest('[data-floor-slot]')!.getAttribute('data-floor-slot')),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    })
    .sort((a, b) => a.id - b.id);

for (const [width, height] of [
  [360, 780],
  [390, 780],
  [412, 840],
]) {
  test(`연속 프레임 ${width}×${height}: 무관 앵커 불변·독립 카드 가림0`, async ({ task }) => {
    await page.viewport(width!, height!);
    const screen = await render(Board, {
      view: { ...fixtures.board.states.play, floor: stableBefore },
    });
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const before = frame(screen.container);
    await page.screenshot({
      element: screen.container.querySelector('.table')!,
      path: `../../.vitest/attachments/floor-slots/${task.file.projectName}-${width}-before.png`,
    });
    await screen.rerender({ view: { ...fixtures.board.states.play, floor: stableAfter } });
    const phase = import.meta.env['VITE_FLOOR_PHASE'] ?? 'after';
    await page.screenshot({
      element: screen.container.querySelector('.table')!,
      path: `../../.vitest/attachments/floor-slots/${task.file.projectName}-${width}-${phase}.png`,
    });
    const frames = [];
    for (let i = 0; i < 6; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const cards = frame(screen.container);
      frames.push(cards);

      for (const a of cards)
        for (const b of cards) {
          if (a.id >= b.id) continue;
          expect(
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) <= 0 ||
              Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) <= 0,
          ).toBe(true);
        }
      expect(cards.every((c) => c.width >= 48)).toBe(true);
    }
    console.info(
      JSON.stringify({
        fixture: 'public-synthetic-201',
        viewport: [width, height],
        before,
        frames,
      }),
    );
    for (const cards of frames)
      for (const id of [0, 8])
        expect(cards.find((c) => c.id === id)).toEqual(before.find((c) => c.id === id));
  });
}
