// FR-RP-06: Mac 크기에서도 기존 BoardView → 액션 계약과 키보드 경로를 그대로 쓴다.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { layoutExtras, layoutFixture } from '../lib/layout-fixtures.ts';
import Board from './Board.svelte';

beforeEach(() => {
  document.documentElement.dataset['speed'] = 'instant';
});
afterEach(() => {
  delete document.documentElement.dataset['speed'];
});

for (const [width, height] of [
  [1440, 900],
  [720, 450],
] as const) {
  test(`${width}×${height}: 손패 Enter/Space, 바닥 후보, 고/스톱 키보드 액션`, async () => {
    await page.viewport(width, height);
    const onaction = vi.fn();
    const screen = await render(Board, {
      view: layoutFixture('play'),
      extras: layoutExtras('play'),
      onaction,
    });
    expect(screen.container.querySelector('.rotate-notice')).toBeNull();
    const hand = screen.container.querySelector<HTMLButtonElement>('.hand button:not(:disabled)')!;
    hand.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onaction).toHaveBeenCalledTimes(2);
    expect(onaction.mock.calls[0]?.[0]).toEqual(onaction.mock.calls[1]?.[0]);

    await screen.rerender({ view: layoutFixture('target'), extras: layoutExtras('target') });
    const target = screen.container.querySelector<HTMLButtonElement>('.floor-choice')!;
    target.focus();
    await userEvent.keyboard('{Enter}');
    expect(onaction.mock.calls.at(-1)?.[0]?.type).toBe('chooseTarget');

    await screen.rerender({ view: layoutFixture('gostop'), extras: layoutExtras('gostop') });
    const stop = screen.container.querySelector<HTMLButtonElement>('[data-choice="stop"]')!;
    stop.focus();
    await userEvent.keyboard(' ');
    expect(onaction.mock.calls.at(-1)?.[0]?.type).toBe('stop');
    const go = screen.container.querySelector<HTMLButtonElement>('[data-choice="go"]')!;
    go.focus();
    await userEvent.keyboard('{Enter}');
    expect(onaction.mock.calls.at(-1)?.[0]?.type).toBe('go');
  });
}
