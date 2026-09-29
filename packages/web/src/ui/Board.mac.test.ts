// FR-RP-06: Mac 크기에서도 기존 BoardView → 액션 계약과 키보드 경로를 그대로 쓴다.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { layoutExtras, layoutFixture } from '../lib/layout-fixtures.ts';
import Board from './Board.svelte';

async function tabTo(target: HTMLElement) {
  for (let step = 0; step < 30 && document.activeElement !== target; step++)
    await userEvent.keyboard('{Tab}');
  expect(document.activeElement).toBe(target);
  const style = getComputedStyle(target);
  expect(
    (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
      style.boxShadow !== 'none',
  ).toBe(true);
}

async function assertTrap(panel: HTMLElement) {
  const controls = [
    ...panel.querySelectorAll<HTMLElement>('[tabindex="0"], button:not(:disabled)'),
  ];
  expect(controls.length).toBeGreaterThanOrEqual(2);
  await tabTo(controls[0]!);
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
  expect(document.activeElement).toBe(controls.at(-1));
  await userEvent.keyboard('{Tab}');
  expect(document.activeElement).toBe(controls[0]);
}

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
    await tabTo(hand);
    const nextHand = screen.container.querySelectorAll<HTMLButtonElement>(
      '.hand button:not(:disabled)',
    )[1]!;
    await tabTo(nextHand);
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(hand);
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onaction).toHaveBeenCalledTimes(2);
    expect(onaction.mock.calls[0]?.[0]).toEqual(onaction.mock.calls[1]?.[0]);

    await screen.rerender({ view: layoutFixture('target'), extras: layoutExtras('target') });
    const target = screen.container.querySelector<HTMLButtonElement>('.floor-choice')!;
    await assertTrap(screen.container.querySelector<HTMLElement>('.table.choosing')!);
    await tabTo(target);
    await userEvent.keyboard('{Enter}');
    expect(onaction.mock.calls.at(-1)?.[0]?.type).toBe('chooseTarget');

    await screen.rerender({ view: layoutFixture('gostop'), extras: layoutExtras('gostop') });
    const stop = screen.container.querySelector<HTMLButtonElement>('[data-choice="stop"]')!;
    await assertTrap(screen.container.querySelector<HTMLElement>('.prompt')!);
    await tabTo(stop);
    await userEvent.keyboard(' ');
    expect(onaction.mock.calls.at(-1)?.[0]?.type).toBe('stop');
    const go = screen.container.querySelector<HTMLButtonElement>('[data-choice="go"]')!;
    await tabTo(go);
    await userEvent.keyboard('{Enter}');
    expect(onaction.mock.calls.at(-1)?.[0]?.type).toBe('go');
  });

  for (const [prompt, action] of [
    ['gukjin', 'gukjin'],
    ['shake', 'shake'],
    ['chongtong', 'chongtong'],
    ['first', 'pickFirst'],
  ] as const) {
    test(`${width}×${height}: ${prompt} 프롬프트 Tab 순환과 Enter/Space 액션`, async () => {
      await page.viewport(width, height);
      const onaction = vi.fn();
      const screen = await render(Board, {
        view: layoutFixture(prompt),
        extras: layoutExtras(prompt),
        onaction,
      });
      const panel = screen.container.querySelector<HTMLElement>('.prompt')!;
      await assertTrap(panel);
      const buttons = panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      await tabTo(buttons[0]!);
      await userEvent.keyboard('{Enter}');
      expect(onaction.mock.calls.at(-1)?.[0]?.type).toBe(action);
      await tabTo(buttons[1]!);
      await userEvent.keyboard(' ');
      expect(onaction.mock.calls.at(-1)?.[0]?.type).toBe(action);
      expect(onaction).toHaveBeenCalledTimes(2);
    });
  }
}
