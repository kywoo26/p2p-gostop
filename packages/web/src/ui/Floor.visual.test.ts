import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Floor from './Floor.svelte';

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
