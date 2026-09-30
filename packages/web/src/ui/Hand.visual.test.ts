import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Hand from './Hand.svelte';

test('폭탄 묶음의 모든 멤버에 공개 상태만 붙이고 액션 판정을 대신하지 않는다 (FR-46~50)', async () => {
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
  expect(screen.container.querySelectorAll('.mark')).toHaveLength(0);
  expect(screen.container.querySelector('[data-slot="0"]')?.getAttribute('data-hand-group')).toBe(
    '1',
  );
  expect(screen.container.querySelector('[data-slot="0"]')?.getAttribute('data-hand-action')).toBe(
    'bomb',
  );
  expect(screen.container.querySelector('[data-slot="0"]')?.getAttribute('data-hand-cue')).toBe(
    'secured',
  );
  expect(screen.container.querySelectorAll('[data-hand-action="bomb"]')).toHaveLength(3);
  expect(screen.container.textContent).not.toContain('폭탄');
  await screen.getByRole('button', { name: '1월 광, 확정 획득 짝, 폭탄 가능, 내기' }).click();
  expect(onplay).toHaveBeenCalledTimes(1);
  expect(onplay.mock.calls[0]?.[0]).toBe(0);
  await screen.rerender({ visualGroups: [{ id: 'bomb-1', kind: 'bomb', cards: [0, 1] }] });
  expect(screen.container.querySelectorAll('.action-mark, .hand-label')).toHaveLength(0);
  expect(screen.container.textContent).not.toContain('대기');
  await screen.rerender({ selectedGroup: null, visualGroups: [] });
  expect(screen.container.querySelectorAll('.group-selected')).toHaveLength(0);
  expect(screen.container.querySelector('[data-hand-cue="secured"]')).toBeNull();
  await screen.rerender({
    cuesEnabled: false,
    visualGroups: [{ id: 'bomb-1', kind: 'bomb', cards: [0, 1, 2] }],
  });
  expect(
    screen.container.querySelectorAll('[data-hand-cue], [data-hand-action], [data-hand-group]'),
  ).toHaveLength(0);
  expect(screen.container.querySelector('[data-slot="0"]')?.getAttribute('aria-label')).toBe(
    '1월 광, 내기',
  );
});

test('재정렬 이동 중 탭은 카드를 내지 않고 완료 후 새 탭만 받는다 (U22)', async () => {
  const onplay = vi.fn();
  const screen = await render(Hand, { compact: true, cards: [0], playable: [0], onplay });
  const card = screen.container.querySelector<HTMLElement>('.card')!;
  card.style.willChange = 'transform';
  await screen.getByRole('button').click();
  expect(onplay).not.toHaveBeenCalled();
  card.style.willChange = '';
  await screen.getByRole('button').click();
  expect(onplay).toHaveBeenCalledOnce();
});

test('총통 외곽은 폭탄 그림 없이 유지하고 확정 선이 행동 선에 덮이지 않는다 (UX-H05)', async () => {
  const screen = await render(Hand, {
    compact: true,
    cards: [0, 1, 2, 3],
    playable: [0, 1, 2, 3],
    visualGroups: [{ id: 'chongtong-1', kind: 'chongtong', cards: [0, 1, 2, 3] }],
  });
  screen.container.classList.add('board');
  expect(screen.container.querySelectorAll('[data-hand-action="chongtong"]')).toHaveLength(4);
  const card = screen.container.querySelector<HTMLElement>('[data-slot="0"] .card')!;
  expect(getComputedStyle(card).outlineStyle).toBe('solid');
  expect(getComputedStyle(card).outlineWidth).toBe('4px');
  expect(getComputedStyle(card, '::after').content).toBe('none');
  await screen.rerender({
    visualGroups: [
      { id: 'chongtong-1', kind: 'chongtong', cards: [0, 1, 2, 3] },
      { id: 'secured-0', kind: 'secured', cards: [0] },
    ],
  });
  expect(getComputedStyle(card).outlineStyle).toBe('double');
  expect(getComputedStyle(card).outlineWidth).toBe('4px');
  card.style.willChange = 'transform, opacity';
  expect(getComputedStyle(card).outlineStyle).toBe('none');
  card.style.removeProperty('will-change');
  expect(getComputedStyle(card).outlineStyle).toBe('double');
});
