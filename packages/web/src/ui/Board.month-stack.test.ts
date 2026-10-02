import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Board from './Board.svelte';
import Floor from './Floor.svelte';
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
const targetIdentity = (v: BoardView) => {
  const p = v.pending;
  if (p?.kind !== 'target') throw new Error('target fixture');
  return `${v.round}:${v.eventSeq}:${p.source}:${p.card}:${p.options.join(',')}`;
};
const activeCandidate = (root: HTMLElement, v: BoardView) => {
  const wrapper = [...root.querySelectorAll<HTMLElement>('.floor-target')].find(
    (el) => el.dataset['targetKey'] === targetIdentity(v) && !el.closest('[inert]'),
  );
  return wrapper?.querySelector<HTMLButtonElement>('[data-choice="target-32"]');
};
const activeTarget = (root: HTMLElement, v: BoardView) => {
  const button = activeCandidate(root, v);
  if (!button) throw new Error('current non-inert target');
  return button;
};
const whenActiveTarget = (root: HTMLElement, v: BoardView) =>
  new Promise<HTMLButtonElement>((resolve) => {
    const check = () => {
      const button = activeCandidate(root, v);
      if (!button) return;
      observer.disconnect();
      resolve(button);
    };
    const observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    check();
  });
const nextResize = () =>
  new Promise<void>((resolve) =>
    window.addEventListener('resize', () => queueMicrotask(resolve), { once: true }),
  );
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
  const currentView = { ...fixtures.board.states.target, eventSeq: 111 };
  await screen.rerender({ view: currentView });
  const current = await whenActiveTarget(screen.container, currentView);
  expect(current).not.toBe(old);
  expect(current.closest('[inert]')).toBeNull();
  expect(old.closest('[inert]')).not.toBeNull();
  old.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  old.click();
  expect(submitted).not.toHaveBeenCalled();
  current.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  // repeat preventDefault/2RAF는 취소 증거가 아니다. 실제 resize 전달 뒤 같은 버튼을 검사한다.
  const resized = nextResize();
  await page.viewport(360, 780);
  await resized;
  expect(activeTarget(screen.container, currentView)).toBe(current);
  current.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  expect(submitted).not.toHaveBeenCalled();
  expect(
    current.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', repeat: true }),
    ),
  ).toBe(false);
  expect(submitted).not.toHaveBeenCalled();
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
  await userEvent.click(current);
  expect(submitted).toHaveBeenCalledTimes(1);
});

test('퇴장 popup은 입력·관찰에서 분리하고 현재 popup의 실제 크기 변경만 held key를 취소한다', async () => {
  await page.viewport(360, 780);
  const submitted = vi.fn();
  const seen: Element[] = [];
  const stopped = new Set<ResizeObserver>();
  const owners = new Map<Element, ResizeObserver>();
  const nativeObserve = ResizeObserver.prototype.observe;
  const nativeDisconnect = ResizeObserver.prototype.disconnect;
  const observe = vi.spyOn(ResizeObserver.prototype, 'observe').mockImplementation(function (
    this: ResizeObserver,
    element: Element,
    options?: ResizeObserverOptions,
  ) {
    seen.push(element);
    owners.set(element, this);
    nativeObserve.call(this, element, options);
  });
  const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect').mockImplementation(function (
    this: ResizeObserver,
  ) {
    stopped.add(this);
    nativeDisconnect.call(this);
  });
  try {
    const screen = await render(Board, {
      view: fixtures.board.states.target,
      monthStacks: true,
      onaction: submitted,
    });
    const old = activeTarget(screen.container, fixtures.board.states.target);
    const oldWrapper = old.closest('.floor-target')!;
    const previousObserver = owners.get(oldWrapper)!;
    expect(previousObserver).toBeDefined();
    const mark = seen.length;
    const currentView = { ...fixtures.board.states.target, eventSeq: 111 };
    await screen.rerender({ view: currentView });
    const current = await whenActiveTarget(screen.container, currentView);
    const wrapper = current.closest<HTMLElement>('.floor-target')!;
    expect(screen.container.querySelectorAll('.floor-target')).toHaveLength(2);
    expect(old.isConnected).toBe(true);
    expect(old.closest('[inert]')).not.toBeNull();
    expect(current.closest('[inert]')).toBeNull();
    expect(current).not.toBe(old);
    expect(stopped.has(previousObserver)).toBe(true);
    expect(seen.slice(mark).filter((el) => el.matches('.floor-target'))).toEqual([wrapper]);
    old.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    old.click();
    expect(submitted).not.toHaveBeenCalled();
    // gesture가 없는 현재 AT detail0 선택을 보존한다.
    current.click();
    expect(submitted).toHaveBeenCalledTimes(1);
    submitted.mockClear();
    current.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    const before = current.getBoundingClientRect();
    const changed = new Promise<void>((resolve) => {
      const observer = new ResizeObserver(() => {
        if (Math.abs(current.getBoundingClientRect().width - before.width) <= 1) return;
        observer.disconnect();
        queueMicrotask(resolve);
      });
      observer.observe(wrapper);
    });
    wrapper.style.width = 'calc(100% - 16px)';
    await changed;
    expect(innerWidth).toBe(360); // window resize 없이 현재 wrapper의 실제 RO 경계다.
    expect(activeTarget(screen.container, currentView)).toBe(current);
    current.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(submitted).not.toHaveBeenCalled();
    expect(
      current.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
          repeat: true,
        }),
      ),
    ).toBe(false);
    expect(submitted).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    await userEvent.click(current);
    expect(submitted).toHaveBeenCalledTimes(1);
  } finally {
    observe.mockRestore();
    disconnect.mockRestore();
  }
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

for (const [key, trigger] of [
  ['Enter', 'resize'],
  [' ', 'target'],
] as const) {
  test(`keyup 없는 ${key === ' ' ? 'Space' : key} 취소 뒤 새 pointer는 회복하고 취소 키 click/repeat는 차단한다 (${trigger})`, async () => {
    await page.viewport(360, 780);
    const submitted = vi.fn();
    const screen = await render(Board, {
      view: fixtures.board.states.target,
      monthStacks: true,
      onaction: submitted,
    });
    await settle();
    let currentView = fixtures.board.states.target;
    const button = () => activeTarget(screen.container, currentView);
    button().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
    if (trigger === 'resize') {
      const resized = nextResize();
      await page.viewport(390, 780);
      await resized;
    } else {
      currentView = { ...currentView, eventSeq: 111 };
      await screen.rerender({ view: currentView });
    }
    await whenActiveTarget(screen.container, currentView);
    const repeat = () =>
      button().dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, repeat: true }),
      );
    const keyClick = () =>
      button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(repeat()).toBe(false);
    keyClick();
    expect(submitted).not.toHaveBeenCalled();
    // keyup을 보내지 않는다. provider 실제 pointerdown/capture/up/click만으로 회복해야 한다.
    await userEvent.click(button());
    expect(submitted).toHaveBeenCalledExactlyOnceWith(
      { type: 'chooseTarget', seat: 0, card: 32 },
      expect.any(Number),
    );
    expect(repeat()).toBe(false);
    keyClick();
    expect(submitted).toHaveBeenCalledTimes(1);
    button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(submitted).toHaveBeenCalledTimes(1); // release를 재사용하지 않는다. 제출된 선택도 취소하지 않는다.
  });
}

test('차단중 0높이 측정은 DOM 원ID/예약을 지우지 않고 권위·skip·reset 뒤 현재 ID로 복귀한다', async () => {
  await page.viewport(360, 780);
  const groups = [floorGroup(1, [0]), floorGroup(2, [4]), floorGroup(3, [8])];
  const screen = await render(Floor, {
    compact: true,
    monthStacks: true,
    groups,
    deckCount: 20,
    round: 1,
    snapshotSeq: 100,
  });
  const table = screen.container.querySelector<HTMLElement>('.table')!;
  table.style.width = '336px';
  table.style.height = '245.84375px';
  const ids = () =>
    [...table.querySelectorAll<HTMLElement>('.floor [data-card-id]')].map((e) =>
      Number(e.dataset['cardId']),
    );
  await vi.waitFor(() => expect(table.dataset['floorFits']).toBe('true'));
  const before = [...table.querySelectorAll<HTMLElement>('.stack-card')].map(
    (e) => e.dataset['floorModelPose'],
  );
  const measured = table.dataset['floorModelBounds'];
  await screen.rerender({ layoutSuspended: true, playbackBusy: true });
  table.style.width = '756px';
  table.style.height = '0px';
  await vi.waitFor(() => expect(table.getBoundingClientRect().height).toBe(0));
  expect(table.dataset['floorFits']).toBe('false');
  expect(table.dataset['floorSuspended']).toBe('true');
  expect(ids()).toEqual([0, 4, 8]);
  expect(table.dataset['floorModelBounds']).toBe(measured);
  expect(
    [...table.querySelectorAll<HTMLElement>('.stack-card')].map((e) => e.dataset['floorModelPose']),
  ).toEqual(before);
  await screen.rerender({ groups: groups.slice(1) });
  await vi.waitFor(() => expect(ids()).toEqual([4, 8]));
  expect(table.dataset['floorReserved']).toBe('1');
  expect(table.querySelector('[data-card-id="0"]')).toBeNull();
  await screen.rerender({ playbackBusy: false });
  await vi.waitFor(() => expect(table.dataset['floorReserved']).toBe('0'));
  await screen.rerender({
    groups: [floorGroup(4, [12])],
    round: 2,
    snapshotSeq: 101,
    deckCount: 23,
    playbackBusy: true,
  });
  await vi.waitFor(() => expect(ids()).toEqual([12]));
  expect(table.dataset['floorReserved']).toBe('0');
  expect(table.querySelector('[data-card-id="4"]')).toBeNull();
  await screen.rerender({ layoutSuspended: false, playbackBusy: false });
  expect(table.dataset['floorFits']).toBe('false');
  table.style.width = '336px';
  table.style.height = '245.84375px';
  await vi.waitFor(() => expect(table.dataset['floorFits']).toBe('true'));
  expect(ids()).toEqual([12]);
  expect(table.dataset['floorSuspended']).toBe('false');
  // 양수 영역의 실제 배치 실패는 이전 ID로 가리지 않는다.
  table.style.width = '42px';
  table.style.height = '20px';
  await vi.waitFor(() => expect(table.dataset['floorFits']).toBe('false'));
  expect(ids()).toEqual([]);
  expect(table.dataset['floorSuspended']).toBe('false');
});
