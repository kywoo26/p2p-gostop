import { afterEach, beforeEach, expect, test } from 'vitest';
import { playerView } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Floor from './Floor.svelte';
import Board from './Board.svelte';
import { toBoardView } from '../game/adapter.ts';
import { settings } from '../settings/settings.svelte.ts';
import '../styles/skin-fan.css';
import '../styles/skin-marks.css';

const original = settings.value;
beforeEach(() => settings.update({ hintLevel: 'basic' }));
afterEach(() => settings.update(original));

for (const monthStacks of [false, true]) {
  test(`월 래퍼 ${monthStacks}: 폭탄 짝의 기존 외곽과 해제는 원본 ID/위치를 보존한다`, async () => {
    await page.viewport(360, 780);
    const game = createScenario({
      hands: [
        [0, 1, 2, 8, 9, 10, 24, 32, 36, 44],
        [4, 12, 16, 20, 28, 40, 48, 49, 50, 38],
      ],
      floor: [3, 25, 33, 45],
      captured: [[26, 27], []],
    });
    const view = toBoardView(playerView(game, 0), {
      names: ['나', '상대'],
      balances: [1000, 1000],
    });
    const screen = await render(Board, { view, monthStacks });
    const card = () => screen.container.querySelector<HTMLElement>('.floor [data-card-id="3"]')!;
    await expect.element(page.elementLocator(card())).toBeVisible();
    expect(card().closest('[data-month]')!.getAttribute('data-hand-link')).toBe('bomb');
    expect(getComputedStyle(card()).outlineWidth).toBe('3px');
    expect(getComputedStyle(card()).boxShadow).toContain('4px');
    expect(
      getComputedStyle(screen.container.querySelector('.floor [data-card-id="25"]')!).outlineWidth,
    ).toBe('1px');
    const poses = () =>
      [...screen.container.querySelectorAll<HTMLElement>('.floor [data-card-id]')].map((el) => {
        const r = el.getBoundingClientRect();
        return [el.dataset['cardId'], r.x, r.y, r.width, r.height];
      });
    const before = poses();
    expect(before).toHaveLength(4);
    await screen.rerender({ busy: true });
    expect(card().closest('[data-month]')!.hasAttribute('data-hand-link')).toBe(false);
    expect(getComputedStyle(card()).outlineWidth).toBe('1px');
    expect(getComputedStyle(card()).boxShadow).toBe('none');
    expect(poses()).toEqual(before);
  });
}

test('폭탄 짝 바닥 월에만 공개 연결 속성과 전체 낭독 설명을 준다', async () => {
  const screen = await render(Floor, {
    compact: true,
    groups: [{ month: 1, cards: [3], kind: 'loose', owner: null }],
    deckCount: 10,
    handLinks: { 1: 'bomb' },
  });
  const group = screen.container.querySelector('.floor .group')!;
  expect(group.getAttribute('data-hand-link')).toBe('bomb');
  expect(group.getAttribute('aria-label')).toContain('손패 폭탄 후보의 짝');
  await screen.rerender({ handLinks: {} });
  expect(group.hasAttribute('data-hand-link')).toBe(false);
  expect(group.getAttribute('aria-label')).toBe('1월 1장');
});
