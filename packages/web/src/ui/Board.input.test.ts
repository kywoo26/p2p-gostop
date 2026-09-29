// PR #104 / UX-07·10·24: 초점/배경 잠금과 스킵의 실제 입력 경계.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { layoutExtras, layoutFixture } from '../lib/layout-fixtures.ts';
import Board from './Board.svelte';

beforeEach(async () => {
  document.documentElement.dataset['speed'] = 'instant';
  await page.viewport(412, 915);
});
afterEach(() => {
  delete document.documentElement.dataset['speed'];
});

for (const kind of ['target', 'gostop', 'gukjin', 'shake', 'chongtong', 'first']) {
  test(`${kind}: 초점 진입·Tab 순환·Escape 유지·배경 잠금·유효 손패 복귀`, async () => {
    const screen = await render(Board, { view: layoutFixture('play') });
    const opener = screen.container.querySelector<HTMLButtonElement>('[data-slot="6"]')!;
    opener.focus();
    await screen.rerender({ view: layoutFixture(kind), extras: layoutExtras(kind) });
    const dialog = screen.container.querySelector<HTMLDialogElement>('.prompt')!;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    await vi.waitFor(() => expect(document.activeElement).toBe(buttons[0]));
    for (const selector of ['.hud', '.hand-zone', '.center', '.info-button']) {
      expect(screen.container.querySelector(selector)!.closest('[inert]')).not.toBeNull();
    }
    // 설명이 넘치면 스크롤 영역도 Tab 순서에 포함된다.
    buttons.at(-1)!.focus();
    await userEvent.keyboard('{Tab}');
    const firstTab = dialog.querySelector<HTMLElement>('[tabindex="0"], button:not(:disabled)')!;
    expect(document.activeElement).toBe(firstTab);
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(buttons.at(-1));
    await userEvent.keyboard('{Tab}');
    await userEvent.keyboard('{Escape}');
    expect(dialog.open).toBe(true);
    opener.focus(); // inert 속성은 프로그램 focus도 막는다.
    expect(document.activeElement).toBe(firstTab);
    await screen.rerender({ view: layoutFixture('play'), extras: layoutExtras('play') });
    if (kind === 'first') {
      // 선 고르기에는 손패가 없으므로 제거된 opener 대신 유효 제어로 돌아간다.
      await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('판 정보'));
    } else {
      await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-slot')).toBe('6'));
    }
    expect(screen.container.querySelector('.hand-zone')!.closest('[inert]')).toBeNull();
  });
}

test('폭탄 확인 중 다른 손패 입력0, 취소 후 시작 카드 복귀', async () => {
  const onaction = vi.fn();
  const screen = await render(Board, {
    view: layoutFixture('bomb'),
    extras: layoutExtras('bomb'),
    onaction,
  });
  const opener = screen.container.querySelector<HTMLButtonElement>('[data-slot="2"]')!;
  opener.focus();
  await userEvent.keyboard('{Enter}');
  const other = screen.container.querySelector<HTMLButtonElement>('[data-slot="6"]')!;
  expect(other.closest('[inert]')).not.toBeNull();
  // 브라우저가 실제 좌표 입력을 inert 배경에 전달하지 않음.
  const rect = other.getBoundingClientRect();
  expect(other.contains(document.elementFromPoint(rect.x + 24, rect.y + 24))).toBe(false);
  other.click(); // synthetic 입력도 Board 경계에서 차단
  expect(onaction).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '취소' }));
  await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  expect(onaction).not.toHaveBeenCalled();
});

test('선택 연쇄와 선택 후 busy: 초점은 다음 창, 이후 유효 판 정보로 복귀', async () => {
  const screen = await render(Board, { view: layoutFixture('play') });
  screen.container.querySelector<HTMLButtonElement>('[data-slot="6"]')!.focus();
  await screen.rerender({ view: layoutFixture('target') });
  await screen.rerender({ view: layoutFixture('gostop') });
  await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-choice')).toBe('go'));
  await screen.rerender({ view: layoutFixture('play'), busy: true });
  await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('판 정보'));
  expect(screen.container.querySelector('.hand-zone')!.closest('[inert]')).toBeNull();
});

function pointer(node: Element, type: string, id = 7, x = 1) {
  node.dispatchEvent(
    new PointerEvent(type, { bubbles: true, pointerId: id, button: 0, clientX: x, clientY: 1 }),
  );
}

test('스킵은 빈 바닥 pointerup만: HUD·손패·카드·선택 행·정보 입력0', async () => {
  const onskip = vi.fn();
  const onaction = vi.fn();
  const screen = await render(Board, { view: layoutFixture('play'), busy: true, onskip, onaction });
  for (const selector of [
    '.hud',
    '.hand .slot',
    '.floor .card',
    '.deck',
    '.decision-area',
    '.info-button',
  ]) {
    const node = screen.container.querySelector(selector)!;
    pointer(node, 'pointerdown');
    expect(onskip).not.toHaveBeenCalled();
    pointer(node, 'pointerup');
    expect(onskip).not.toHaveBeenCalled();
  }
  await userEvent.click(screen.getByRole('button', { name: '판 정보' }));
  expect(onskip).not.toHaveBeenCalled();
  await userEvent.keyboard('{Escape}');
  const empty = screen.container.querySelector('.center')!;
  pointer(empty, 'pointerdown');
  expect(onskip).not.toHaveBeenCalled();
  pointer(empty, 'pointerup');
  expect(onskip).toHaveBeenCalledTimes(1);
  await screen.rerender({ busy: false });
  const hand = screen.container.querySelector('[data-slot="6"]')!;
  hand.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(onaction).not.toHaveBeenCalled();
});

test('빈 바닥 취소·드래그·다른 pointer·카드에서 시작한 연쇄는 스킵0', async () => {
  const onskip = vi.fn();
  const screen = await render(Board, { view: layoutFixture('play'), busy: true, onskip });
  const empty = screen.container.querySelector('.center')!;
  pointer(empty, 'pointerdown');
  pointer(empty, 'pointercancel');
  pointer(empty, 'pointerup');
  pointer(empty, 'pointerdown');
  pointer(empty, 'pointerup', 8);
  pointer(empty, 'pointerdown');
  pointer(empty, 'pointerup', 7, 30);
  pointer(screen.container.querySelector('.card')!, 'pointerdown');
  pointer(empty, 'pointerup');
  expect(onskip).not.toHaveBeenCalled();
});
