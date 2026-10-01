import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Board from './Board.svelte';
import { fixtures } from '../lib/fixtures.ts';
import type { BoardView } from '../lib/view-types.ts';
import { boundaryAfter, floorGroup } from './floor-stability-fixtures.ts';
import '../styles/skin-fan.css';
const settle = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const view = (floor: BoardView['floor'], seq = 100): BoardView => ({
  ...fixtures.board.states.play,
  floor,
  eventSeq: seq,
});
const poses = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.floor [data-card-id]')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      id: Number(el.dataset['cardId']),
      month: Number(el.closest('[data-month]')!.getAttribute('data-month')),
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
    };
  });
const overlap = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test('실제 Board 합법 혼잡 fixture의 타월·덱·손패/HUD 교차0, 6↔7 손패 변경은 위치0px', async () => {
  await page.viewport(360, 780);
  const screen = await render(Board, { view: view(boundaryAfter), monthStacks: true });
  await settle();
  const before = poses(screen.container);
  expect(before).toHaveLength(12);
  expect(screen.container.querySelector('.table')!.getAttribute('data-floor-fits')).toBe('true');
  const floor = screen.container.querySelector('.table')!.getBoundingClientRect();
  const cards = [...screen.container.querySelectorAll<HTMLElement>('.floor .card')];
  const blockers = [
    ...screen.container.querySelectorAll('.deck,.hand-zone,.mine-hud,.opponent-hud'),
  ].map((e) => e.getBoundingClientRect());
  for (const a of cards) {
    const r = a.getBoundingClientRect();
    expect(r.left).toBeGreaterThanOrEqual(floor.left);
    expect(r.right).toBeLessThanOrEqual(floor.right);
    expect(r.top).toBeGreaterThanOrEqual(floor.top);
    expect(r.bottom).toBeLessThanOrEqual(floor.bottom);
    for (const b of blockers) expect(overlap(r, b)).toBe(false);
    for (const b of cards)
      if (a.closest('[data-month]') !== b.closest('[data-month]'))
        expect(overlap(r, b.getBoundingClientRect())).toBe(false);
  }
  for (const count of [6, 7, 6]) {
    const v = view(boundaryAfter);
    const hand = [0, 1, 2, 4, 5, 6, 7].slice(0, count);
    await screen.rerender({
      view: { ...v, seats: [{ ...v.seats[0], hand, handCount: count }, v.seats[1]] },
    });
    await settle();
    expect(poses(screen.container)).toEqual(before);
  }
});

test('동일 seq 재생 삭제 예약은 snapshot 전 유지, 완료/seq/round에서 해제하며 원본 숨김과 구분한다', async () => {
  await page.viewport(360, 780);
  const groups = [floorGroup(1, [0]), floorGroup(2, [4]), floorGroup(3, [8])];
  const screen = await render(Board, { view: view(groups), monthStacks: true });
  await settle();
  await screen.rerender({ view: view(groups.slice(1)), playbackBusy: true });
  await settle();
  expect(screen.container.querySelector('.table')!.getAttribute('data-floor-reserved')).toBe('1');
  expect(screen.container.querySelector('.floor [data-card-id="0"]')).toBeNull(); // beforepose는 별도 #200 준비 수명이다.
  await screen.rerender({
    view: view([...groups.slice(1), floorGroup(4, [12])]),
    playbackBusy: true,
  });
  await settle();
  expect(screen.container.querySelector('.table')!.getAttribute('data-floor-reserved')).toBe('1');
  await screen.rerender({ playbackBusy: false });
  await settle();
  expect(screen.container.querySelector('.table')!.getAttribute('data-floor-reserved')).toBe('0');
  await screen.rerender({ view: { ...view(groups, 101), round: 2 }, playbackBusy: true });
  await settle();
  expect(screen.container.querySelector('.table')!.getAttribute('data-floor-reserved')).toBe('0');
});

test('기존 native dialog의 두 후보는 전체48px·원ID를 유지하고 측정용 data-card-id를 복제하지 않는다', async () => {
  await page.viewport(360, 780);
  const submitted = vi.fn();
  const screen = await render(Board, {
    view: fixtures.board.states.target,
    monthStacks: true,
    onaction: submitted,
  });
  await settle();
  const popup = screen.container.querySelector<HTMLDialogElement>('.floor-target dialog')!;
  expect(popup.tagName).toBe('DIALOG');
  expect(popup.open).toBe(true);
  expect(popup.querySelectorAll('[data-card-id]')).toHaveLength(0);
  const buttons = [...popup.querySelectorAll<HTMLButtonElement>('button')];
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    const r = button.getBoundingClientRect(),
      img = button.querySelector('img')!.getBoundingClientRect();
    expect(r.width).toBeGreaterThanOrEqual(48);
    expect(r.height).toBeGreaterThanOrEqual(48);
    expect(img.width).toBe(48);
    expect(img.height).toBeCloseTo(78.171875, 2);
  }
  expect(popup.getBoundingClientRect().height).toBeLessThan(140);
  for (const el of screen.container.querySelectorAll('.hand-zone,.mine-hud,.opponent-hud'))
    expect(overlap(popup.getBoundingClientRect(), el.getBoundingClientRect())).toBe(false);
  const table = screen.container.querySelector('.table')!;
  expect(table.closest('[inert]')).not.toBeNull();
  expect(table.getAttribute('role')).toBe('group');
  await userEvent.click(buttons[0]!);
  expect(submitted).toHaveBeenCalledExactlyOnceWith(
    { type: 'chooseTarget', seat: 0, card: 32 },
    expect.any(Number),
  );
});

test('pointercancel/resize 중 누름·old candidate click·held Enter repeat는 선택을 새 권위에 넘기지 않는다', async () => {
  await page.viewport(360, 780);
  const submitted = vi.fn();
  const screen = await render(Board, {
    view: fixtures.board.states.target,
    monthStacks: true,
    onaction: submitted,
  });
  await settle();
  const button = () =>
    screen.container.querySelector<HTMLButtonElement>('[data-choice="target-32"]')!;
  button().dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, button: 0 }),
  );
  button().dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 7 }));
  button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(submitted).not.toHaveBeenCalled();
  button().dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, button: 0 }),
  );
  await page.viewport(390, 780);
  await settle();
  button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(submitted).not.toHaveBeenCalled();
  const old = button();
  await screen.rerender({ view: { ...fixtures.board.states.target, eventSeq: 111 } });
  await settle();
  old.click();
  expect(submitted).not.toHaveBeenCalled();
  button().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  await page.viewport(360, 780);
  await settle();
  expect(
    button().dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', repeat: true }),
    ),
  ).toBe(false);
  button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  expect(submitted).not.toHaveBeenCalled();
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
  await userEvent.click(button());
  expect(submitted).toHaveBeenCalledTimes(1);
});

test('NotFoundError는 늦은 up/click을 취소하고 실제 pointer 재입력과 이미 수락된 선택을 보존한다', async () => {
  await page.viewport(360, 780);
  const submitted = vi.fn();
  const screen = await render(Board, {
    view: fixtures.board.states.target,
    monthStacks: true,
    onaction: submitted,
  });
  await settle();
  const button = screen.container.querySelector<HTMLButtonElement>('[data-choice="target-32"]')!;
  const capture = vi.spyOn(button, 'setPointerCapture').mockImplementation(() => {
    throw new DOMException('종료된 포인터', 'NotFoundError');
  });
  const late = () => {
    button.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerId: 99, button: 0 }),
    );
    const r = button.getBoundingClientRect();
    button.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 99,
        button: 0,
        clientX: r.x + 5,
        clientY: r.y + 5,
      }),
    );
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  };
  late();
  expect(submitted).not.toHaveBeenCalled();
  expect(button.disabled).toBe(false);
  capture.mockRestore();
  // dispatchEvent는 active pointer를 만들지 않는다. 이 정상 경로는 provider의 실제 pointer 입력이다.
  await userEvent.click(button);
  expect(submitted).toHaveBeenCalledTimes(1);
  const again = vi.spyOn(button, 'setPointerCapture').mockImplementation(() => {
    throw new DOMException('종료된 포인터', 'NotFoundError');
  });
  late();
  expect(submitted).toHaveBeenCalledTimes(1); // 이미 상위로 제출된 선택을 rollback하지 않는다.
  again.mockRestore();
});
