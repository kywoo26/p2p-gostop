import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Hand from './Hand.svelte';
import { flipMove } from '../anim/flip.ts';

test('폭탄 시각 묶음은 3장에만 적용하고 액션 판정을 대신하지 않는다 (FR-46~50)', async () => {
  const onplay = vi.fn();
  const screen = await render(Hand, {
    compact: true,
    cards: [0, 1, 2, 8],
    playable: [0, 1, 2, 8],
    matchable: [0],
    visualGroups: [
      { id: 'bomb-1', kind: 'bomb', cards: [0, 1, 2] },
      { id: 'secured-1', kind: 'secured', cards: [0] },
    ],
    selectedGroup: 'bomb-1',
    onplay,
  });
  expect(screen.container.querySelectorAll('.group-selected')).toHaveLength(3);
  expect(screen.container.querySelectorAll('.mark, .badge')).toHaveLength(0);
  expect(screen.container.querySelector('[data-slot="0"]')?.getAttribute('data-hand-cue')).toBe(
    'secured',
  );
  expect(screen.container.querySelector('[data-slot="0"]')?.getAttribute('data-hand-action')).toBe(
    'bomb',
  );
  await screen.getByRole('button', { name: '1월 광 (확정 획득 짝) (폭탄 가능) 내기' }).click();
  expect(onplay).toHaveBeenCalledTimes(1);
  expect(onplay.mock.calls[0]?.[0]).toBe(0);
  await screen.rerender({ visualGroups: [{ id: 'bomb-1', kind: 'bomb', cards: [0, 1] }] });
  expect(screen.container.querySelector('[data-slot="0"] .hand-cue')?.textContent).toBe('폭2');
  await screen.rerender({ selectedGroup: null, visualGroups: [] });
  expect(screen.container.querySelectorAll('.group-selected')).toHaveLength(0);
  expect(screen.container.querySelector('[data-hand-cue="secured"]')).toBeNull();
});

test('compact 그림 창은 FLIP 이동을 자르지 않고 취소 뒤 표식을 복구한다 (UX-15)', async () => {
  const screen = await render(Hand, { compact: true, cards: [0], playable: [0] });
  screen.container.style.paddingTop = '120px';
  const card = screen.container.querySelector<HTMLElement>('.card')!;
  card.style.setProperty('--dur-scale', '1');
  const frame = screen.container.querySelector('.art-window')!;
  const label = screen.container.querySelector('.hand-label')!;
  const to = card.getBoundingClientRect();
  const animation = flipMove(card, new DOMRect(to.x, to.y - 80, to.width, to.height), to, {
    duration: 1000,
  });
  animation.pause();
  animation.currentTime = 0;
  expect(getComputedStyle(frame).overflow).toBe('visible');
  expect(getComputedStyle(label).visibility).toBe('hidden');
  const flying = card.getBoundingClientRect();
  expect(card.contains(document.elementFromPoint(flying.x + 24, flying.y + 24))).toBe(true);
  animation.cancel();
  await expect.poll(() => getComputedStyle(frame).overflow).toBe('hidden');
  expect(getComputedStyle(label).visibility).toBe('visible');
});
