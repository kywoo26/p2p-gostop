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
  expect(screen.container.querySelectorAll('.mark')).toHaveLength(4);
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
