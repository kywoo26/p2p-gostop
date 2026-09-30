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
    const dialog = screen.container.querySelector<HTMLElement>('.prompt, .table.choosing')!;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(dialog.querySelector('h2') ?? dialog),
    );
    for (const selector of kind === 'target'
      ? ['.hud', '.hand-zone']
      : ['.hud', '.hand-zone', '.center']) {
      expect(screen.container.querySelector(selector)!.closest('[inert]')).not.toBeNull();
    }
    // 글꼴 배치와 ResizeObserver의 스크롤 영역 tabindex 결정 뒤 순환을 검증한다.
    // 압축된 선택 행에서는 초기 버튼 순서가 첫 렌더 직후 바뀔 수 있다.
    await document.fonts.ready;
    await Promise.all(
      [...dialog.querySelectorAll('img')].map((image) =>
        image.complete ? Promise.resolve() : image.decode(),
      ),
    );
    const content = dialog.querySelector<HTMLElement>('.prompt-content');
    if (content)
      await vi.waitFor(() =>
        expect(content.tabIndex).toBe(content.scrollHeight > content.clientHeight + 1 ? 0 : -1),
      );
    // 설명이 넘치면 스크롤 영역도 Tab 순서에 포함된다.
    buttons.at(-1)!.focus();
    await userEvent.keyboard('{Tab}');
    const firstTab = dialog.querySelector<HTMLElement>('[tabindex="0"], button:not(:disabled)')!;
    expect(document.activeElement).toBe(firstTab);
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(buttons.at(-1));
    await userEvent.keyboard('{Tab}');
    await userEvent.keyboard('{Escape}');
    expect(
      dialog.matches('dialog')
        ? dialog.hasAttribute('open')
        : dialog.classList.contains('choosing'),
    ).toBe(true);
    opener.focus(); // inert 속성은 프로그램 focus도 막는다.
    expect(document.activeElement).toBe(firstTab);
    await screen.rerender({ view: layoutFixture('play'), extras: layoutExtras('play') });
    if (kind === 'first') {
      // 선 고르기에는 손패가 없으므로 제거된 opener 대신 유효 제어로 돌아간다.
      await vi.waitFor(() =>
        expect(
          document.activeElement === screen.container.querySelector('.board') ||
            document.activeElement?.matches('.hand button'),
        ).toBe(true),
      );
    } else {
      await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-slot')).toBe('6'));
    }
    expect(screen.container.querySelector('.hand-zone')!.closest('[inert]')).toBeNull();
  });
}

for (const kind of ['target', 'gostop', 'shake']) {
  test(`${kind}: 선택과 가로 잠금 합성, 선택 해제 뒤 가로 유지·세로 복구`, async () => {
    const original = window.matchMedia.bind(window);
    let landscape = false;
    let notify = () => {};
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      if (!query.includes('(orientation: landscape)')) return original(query);
      return {
        media: query,
        get matches() {
          return landscape;
        },
        addEventListener(_type: string, callback: EventListenerOrEventListenerObject) {
          notify = () => {
            if (typeof callback === 'function') callback(new Event('change'));
            else callback.handleEvent(new Event('change'));
          };
        },
        removeEventListener() {},
      } as unknown as MediaQueryList;
    });
    try {
      const onaction = vi.fn();
      const screen = await render(Board, {
        view: layoutFixture(kind),
        extras: layoutExtras(kind),
        onaction,
      });
      const hand = screen.container.querySelector<HTMLElement>('.hand-zone')!;
      const dialog = screen.container.querySelector<HTMLElement>('.prompt, .table.choosing')!;
      await vi.waitFor(() => expect(hand.inert).toBe(true));
      landscape = true;
      notify();
      expect(hand.inert).toBe(true);
      landscape = false;
      notify();
      expect(hand.inert).toBe(true);
      expect(dialog.contains(document.activeElement)).toBe(true);
      landscape = true;
      notify();
      await screen.rerender({ view: layoutFixture('play'), extras: layoutExtras('play') });
      expect(hand.inert).toBe(true);
      screen.container.querySelector<HTMLButtonElement>('.hand button')!.click();
      expect(onaction).not.toHaveBeenCalled();
      landscape = false;
      notify();
      await vi.waitFor(() => expect(hand.inert).toBe(false));
    } finally {
      vi.restoreAllMocks();
    }
  });
}

test('폭탄 카드는 Enter로 즉시 폭탄, Shift+Enter로 해당 한 장만 낸다', async () => {
  const onaction = vi.fn();
  const screen = await render(Board, {
    view: layoutFixture('bomb'),
    extras: layoutExtras('bomb'),
    onaction,
  });
  const opener = screen.container.querySelector<HTMLButtonElement>('[data-slot="2"]')!;
  opener.focus();
  await userEvent.keyboard('{Enter}');
  expect(onaction).toHaveBeenCalledTimes(1);
  expect(onaction.mock.calls[0]?.[0]).toEqual({ type: 'bomb', seat: 0, month: 1 });
  expect(screen.container.querySelector('.prompt')).toBeNull();
  await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
  expect(onaction).toHaveBeenCalledTimes(2);
  expect(onaction.mock.calls[1]?.[0]).toEqual({ type: 'play', seat: 0, card: 2 });
});

test('폭탄 카드 초점에서 보조 버튼으로 한 장만 내기를 선택할 수 있다', async () => {
  const onaction = vi.fn();
  const screen = await render(Board, {
    view: layoutFixture('bomb'),
    extras: layoutExtras('bomb'),
    onaction,
  });
  screen.container.querySelector<HTMLButtonElement>('[data-slot="2"]')!.focus();
  await userEvent.click(screen.getByRole('button', { name: '선택 카드 한 장만 내기' }));
  expect(onaction).toHaveBeenCalledTimes(1);
  expect(onaction.mock.calls[0]?.[0]).toEqual({ type: 'play', seat: 0, card: 2 });
});

test('길게 누른 폭탄 카드는 한 장만, 일반 카드는 미리보기만; pointercancel은 입력0', async () => {
  const onaction = vi.fn();
  const screen = await render(Board, {
    view: layoutFixture('bomb'),
    extras: layoutExtras('bomb'),
    onaction,
  });
  const bomb = screen.container.querySelector<HTMLButtonElement>('[data-slot="2"]')!;
  pointer(bomb, 'pointerdown');
  pointer(bomb, 'pointercancel');
  pointer(bomb, 'pointerup');
  bomb.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(onaction).not.toHaveBeenCalled();
  pointer(bomb, 'pointerdown');
  await new Promise((resolve) => setTimeout(resolve, 410));
  pointer(bomb, 'pointerup');
  bomb.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(onaction).toHaveBeenCalledTimes(1);
  expect(onaction.mock.calls[0]?.[0]).toEqual({ type: 'play', seat: 0, card: 2 });
  const ordinary = screen.container.querySelector<HTMLButtonElement>('[data-slot="6"]')!;
  pointer(ordinary, 'pointerdown');
  await new Promise((resolve) => setTimeout(resolve, 410));
  pointer(ordinary, 'pointerup');
  ordinary.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(onaction).toHaveBeenCalledTimes(1);
});

for (const cancel of ['pointerleave', 'pointercancel'] as const) {
  for (const key of ['{Enter}', ' '] as const) {
    test(`${cancel} 뒤 click이 없어도 첫 ${key === ' ' ? 'Space' : 'Enter'}로 즉시 낸다`, async () => {
      const onaction = vi.fn();
      const screen = await render(Board, { view: layoutFixture('play'), onaction });
      const card = screen.container.querySelector<HTMLButtonElement>('[data-slot="6"]')!;
      pointer(card, 'pointerdown');
      pointer(card, cancel);
      expect(onaction).not.toHaveBeenCalled();
      card.focus();
      await userEvent.keyboard(key);
      expect(onaction).toHaveBeenCalledTimes(1);
      expect(onaction.mock.calls[0]?.[0]).toEqual({ type: 'play', seat: 0, card: 6 });
    });
  }
}

test('120ms 재탭 취소는 일반·폭탄 모두 전송 전만 적용하고 busy·뷰 교체 때 폐기', async () => {
  const onaction = vi.fn();
  const screen = await render(Board, {
    view: layoutFixture('bomb'),
    extras: layoutExtras('bomb'),
    confirmDelay: true,
    onaction,
  });
  const bomb = screen.container.querySelector<HTMLButtonElement>('[data-slot="2"]')!;
  bomb.click();
  bomb.click();
  await new Promise((resolve) => setTimeout(resolve, 140));
  expect(onaction).not.toHaveBeenCalled();
  bomb.click();
  await screen.rerender({ busy: true });
  await new Promise((resolve) => setTimeout(resolve, 140));
  expect(onaction).not.toHaveBeenCalled();
  await screen.rerender({ busy: false });
  screen.container.querySelector<HTMLButtonElement>('[data-slot="6"]')!.click();
  await vi.waitFor(() => expect(onaction).toHaveBeenCalledTimes(1));
  expect(onaction.mock.calls[0]?.[0]).toEqual({ type: 'play', seat: 0, card: 6 });
});

test('뷰 교체 전에 시작한 포인터는 교체 뒤 click에서 내지 않는다', async () => {
  const onaction = vi.fn();
  const view = layoutFixture('play');
  const screen = await render(Board, { view, onaction });
  const card = screen.container.querySelector<HTMLButtonElement>('[data-slot="6"]')!;
  pointer(card, 'pointerdown');
  await screen.rerender({ view: { ...view, eventSeq: view.eventSeq + 1 } });
  pointer(card, 'pointerup');
  card.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(onaction).not.toHaveBeenCalled();
  pointer(card, 'pointerdown');
  pointer(card, 'pointerup');
  card.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(onaction).toHaveBeenCalledTimes(1);
});

test('뒤집기만 버튼은 합법 수와 남은 횟수, 유일 자동 수에 맞춰 표시한다', async () => {
  const view = layoutFixture('flip');
  const screen = await render(Board, { view, extras: layoutExtras('flip') });
  expect(screen.getByRole('button', { name: '뒤집기만 2회' })).toBeTruthy();
  await screen.rerender({ view: { ...view, legal: [{ type: 'flipOnly', seat: 0 }] } });
  expect(screen.container.querySelector('[data-choice="flipOnly"]')).toBeNull();
  await screen.rerender({
    view: { ...view, seats: [{ ...view.seats[0], bombTokens: 0 }, view.seats[1]] },
  });
  expect(screen.container.querySelector('[data-choice="flipOnly"]')).toBeNull();
});

test('선택 연쇄와 선택 후 busy: 초점은 다음 창, 이후 유효 판 정보로 복귀', async () => {
  const screen = await render(Board, { view: layoutFixture('play') });
  screen.container.querySelector<HTMLButtonElement>('[data-slot="6"]')!.focus();
  await screen.rerender({ view: layoutFixture('target') });
  await screen.rerender({ view: layoutFixture('gostop') });
  await vi.waitFor(() => expect(document.activeElement?.textContent).toContain('고 하시겠습니까?'));
  await screen.rerender({ view: layoutFixture('play'), busy: true });
  await vi.waitFor(() =>
    expect(
      document.activeElement === screen.container.querySelector('.board') ||
        document.activeElement?.matches('.hand button'),
    ).toBe(true),
  );
  expect(screen.container.querySelector('.hand-zone')!.closest('[inert]')).toBeNull();
});

function pointer(node: Element, type: string, id = 7, x = 0) {
  const box = node.getBoundingClientRect();
  node.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: id,
      button: 0,
      clientX: box.x + box.width / 2 + x,
      clientY: box.y + box.height / 2,
    }),
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
    '.mine-hud',
  ]) {
    const node = screen.container.querySelector(selector)!;
    pointer(node, 'pointerdown');
    expect(onskip).not.toHaveBeenCalled();
    pointer(node, 'pointerup');
    expect(onskip).not.toHaveBeenCalled();
  }
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

test('등장/사라짐을 빠르게 되돌려도 재등장한 선택 창의 잠금과 초점 유지', async () => {
  document.documentElement.dataset['speed'] = 'normal';
  const screen = await render(Board, { view: layoutFixture('target') });
  await screen.rerender({ busy: true });
  await screen.rerender({ busy: false });
  await vi.waitFor(() => {
    const dialog = screen.container.querySelector(
      '.prompt:not([inert]), .table.choosing:not([inert])',
    )!;
    expect(dialog).not.toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.container.querySelector('.hand-zone')!.closest('[inert]')).not.toBeNull();
  });
  await screen.rerender({ view: layoutFixture('play') });
  await vi.waitFor(() =>
    expect(screen.container.querySelector('.hand-zone')!.closest('[inert]')).toBeNull(),
  );
});

for (const kind of ['gostop', 'shake']) {
  test(`${kind}: 30ms 뒤 반전한 선택 창은 같은 노드에서 초점·클릭·키보드 입력 복구`, async () => {
    document.documentElement.dataset['speed'] = 'normal';
    const onaction = vi.fn();
    const screen = await render(Board, {
      view: layoutFixture(kind),
      extras: layoutExtras(kind),
      onaction,
    });
    const dialog = screen.container.querySelector<HTMLDialogElement>('.prompt')!;
    const hand = screen.container.querySelector<HTMLElement>('.hand-zone')!;
    const delay = (milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
    await delay(300);
    await screen.rerender({ busy: true });
    expect(dialog.inert).toBe(true);
    await delay(30);
    await screen.rerender({ busy: false });
    await delay(350);
    expect(screen.container.querySelector('.prompt')).toBe(dialog);
    expect(dialog.inert).toBe(false);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(hand.inert).toBe(true);
    expect(onaction).not.toHaveBeenCalled();
    const button = dialog.querySelector<HTMLButtonElement>(
      kind === 'gostop' ? '[data-choice="go"]' : '[data-choice="shake"]',
    )!;
    const bounds = button.getBoundingClientRect();
    expect(
      button.contains(
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
      ),
    ).toBe(true);
    await userEvent.click(button);
    expect(onaction).toHaveBeenCalledTimes(1);
    button.focus();
    await userEvent.keyboard('{Tab}{Shift>}{Tab}{/Shift}{Enter}');
    expect(onaction).toHaveBeenCalledTimes(2);
    expect(onaction.mock.calls.map(([action]) => action)).toEqual([
      kind === 'gostop' ? { type: 'go', seat: 0 } : { type: 'shake', seat: 0, accept: true },
      kind === 'gostop' ? { type: 'go', seat: 0 } : { type: 'shake', seat: 0, accept: true },
    ]);
    await screen.rerender({ view: layoutFixture('play'), extras: layoutExtras('play') });
    await vi.waitFor(() => expect(screen.container.querySelector('.prompt')).toBeNull());
    expect(hand.inert).toBe(false);
    expect(
      document.activeElement === screen.container.querySelector('.board') ||
        document.activeElement?.matches('.hand button'),
    ).toBe(true);
  });
}
