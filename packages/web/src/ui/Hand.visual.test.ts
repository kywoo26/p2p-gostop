import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
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

test('CF11 두 독점 보유 카드와 즉시 확정은 이름만 다르고 실제 청록 4px 이중선이 같다', async () => {
  const onplay = vi.fn();
  const onpreview = vi.fn();
  const screen = await render(Hand, {
    compact: true,
    cards: [0, 1, 8],
    playable: [0, 1, 8],
    matchable: [0, 1],
    visualGroups: [
      { id: 'heldPair-1', kind: 'heldPair', cards: [0, 1] },
      { id: 'secured-8', kind: 'secured', cards: [8] },
      // 겹친 슬롯도 접근성 이름은 독점 보유 하나만 우선한다.
      { id: 'secured-0', kind: 'secured', cards: [0] },
    ],
    selectedGroup: 'heldPair-1',
    onplay,
    onpreview,
  });
  screen.container.classList.add('board');
  const slot = (id: number) =>
    screen.container.querySelector<HTMLButtonElement>(`[data-slot="${id}"]`)!;
  const outline = (id: number) => {
    const style = getComputedStyle(slot(id).querySelector<HTMLElement>('.card')!);
    return { color: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth };
  };
  const reference = outline(8);
  expect(reference.style).toBe('double');
  expect(reference.width).toBe('4px');
  expect(reference.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(screen.container.querySelectorAll('[data-hand-cue="secured"]')).toHaveLength(3);
  for (const id of [0, 1]) {
    expect(outline(id)).toEqual(reference);
    expect(slot(id).getAttribute('aria-label')).toContain('독점 보유 짝');
    expect(slot(id).getAttribute('aria-label')).not.toMatch(/확정 획득|먹을 수 있음/);
    expect(slot(id).hasAttribute('data-hand-action')).toBe(false);
  }
  expect(slot(8).getAttribute('aria-label')).toContain('확정 획득 짝');
  expect(slot(8).getAttribute('aria-label')).not.toContain('독점');
  expect(screen.container.querySelector('.group-selected')).toBeNull();
  expect(onplay).not.toHaveBeenCalled();
  slot(0).focus();
  await vi.waitFor(() => expect(onpreview).toHaveBeenCalledWith(0));
  expect(document.activeElement).toBe(slot(0));
  expect(outline(0)).toEqual(reference);
  expect(onplay).not.toHaveBeenCalled();
  await userEvent.keyboard('{Enter}');
  expect(onplay).toHaveBeenCalledTimes(1);
  expect(onplay.mock.calls[0]?.[0]).toBe(0);
  await screen.getByRole('button', { name: '1월 홍단, 독점 보유 짝, 내기' }).click();
  expect(onplay).toHaveBeenCalledTimes(2);
  expect(onplay.mock.calls[1]?.[0]).toBe(1);
  await screen.rerender({ cuesEnabled: false });
  expect(
    screen.container.querySelectorAll('[data-hand-cue], [data-hand-action], [data-hand-group]'),
  ).toHaveLength(0);
  expect(slot(0).getAttribute('aria-label')).toBe('1월 광, 내기');
  expect(outline(0).style).not.toBe('double');
  expect(onplay).toHaveBeenCalledTimes(2);
  await screen.rerender({ cuesEnabled: true, playable: [] });
  for (const id of [0, 1, 8]) {
    expect(slot(id).disabled).toBe(true);
    expect(slot(id).hasAttribute('data-hand-action')).toBe(false);
    expect(slot(id).getAttribute('aria-label')).not.toContain('독점 보유');
  }
  // 기존 secured는 명시적으로 전달된 표시 슬롯이다. 입력 제한과 분리해 유지한다.
  for (const id of [0, 8]) {
    expect(slot(id).getAttribute('data-hand-cue')).toBe('secured');
    expect(outline(id)).toEqual(reference);
  }
  expect(slot(0).getAttribute('aria-label')).toBe('1월 광, 확정 획득 짝, 내기');
  expect(slot(8).getAttribute('aria-label')).toBe('3월 광, 확정 획득 짝, 내기');
  // heldPair만 전달된 카드는 비합법 입력에서 표식과 독점 이름을 함께 제거한다.
  expect(slot(1).hasAttribute('data-hand-cue')).toBe(false);
  expect(slot(1).getAttribute('aria-label')).toBe('1월 홍단, 내기');
  expect(outline(1).style).not.toBe('double');
  expect(screen.container.querySelectorAll('[data-hand-cue="secured"]')).toHaveLength(2);
  expect(onplay).toHaveBeenCalledTimes(2);
});
