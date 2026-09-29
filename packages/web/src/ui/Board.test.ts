// 게임판: 픽스처 상태별 조작 요소와 실제 레이아웃의 터치 영역(spec 6.1 48×48) 검사.
import type { Action } from '@p2p-gostop/engine';
import { flushSync } from 'svelte';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { fixtures } from '../lib/fixtures.ts';
import type { BoardView } from '../lib/view-types.ts';
import Board from './Board.svelte';

const { play, target, goStop } = fixtures.board.states;

function minTouch(buttons: Element[]) {
  return Math.min(
    ...buttons.flatMap((b) => {
      const r = b.getBoundingClientRect();
      return [r.width, r.height];
    }),
  );
}

test('카드 내기: 손패 5장이 버튼이고 모달이 없다', async () => {
  await page.viewport(390, 844);
  const screen = await render(Board, { view: play });
  const buttons = screen.getByRole('button', { name: /내기$/ }).elements();
  expect(buttons).toHaveLength(5);
  for (const b of buttons) expect((b as HTMLButtonElement).disabled).toBe(false);
  expect(minTouch(buttons)).toBeGreaterThanOrEqual(48);
  expect(screen.getByRole('dialog').elements()).toHaveLength(0);
  await expect.element(screen.getByRole('img', { name: '더미 14장' })).toBeVisible();
  const progress = screen.getByRole('list', { name: '내 족보 진행도' });
  await expect.element(progress).toBeVisible();
  expect(progress.element().textContent).toContain('고도리 3/3');
});

test('대상 고르기: 바닥 2장 선택지, 손패는 잠김', async () => {
  const screen = await render(Board, { view: target });
  const dialog = screen.getByRole('dialog', { name: '어느 패를 먹을까요?' });
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByRole('button', { name: '9월 국진 먹기' })).toBeVisible();
  await expect.element(dialog.getByRole('button', { name: '9월 청단 먹기' })).toBeVisible();
  for (const b of screen.getByRole('button', { name: /내기$/ }).elements()) {
    expect((b as HTMLButtonElement).disabled).toBe(true);
  }
});

test('고/스톱: 2고·스톱 버튼과 스톱 금액', async () => {
  const screen = await render(Board, { view: goStop });
  const dialog = screen.getByRole('dialog', { name: '고? 스톱?' });
  await expect.element(dialog).toBeVisible();
  expect(dialog.element().textContent).toContain('9점');
  expect(dialog.element().textContent).toContain('2,000냥');
  const go = dialog.getByRole('button', { name: '2고' });
  const stop = dialog.getByRole('button', { name: '스톱' });
  expect(minTouch([go.element(), stop.element()])).toBeGreaterThanOrEqual(48);
});

test('손패 10장: 두 줄로 나눠 겹침 스크롤 없이 카드마다 48px 이상', async () => {
  await page.viewport(390, 844);
  const hand = [30, 34, 36, 41, 47, 2, 10, 18, 26, 38];
  const view: BoardView = {
    ...play,
    seats: [{ ...play.seats[0], hand, handCount: hand.length }, play.seats[1]],
    playable: hand,
  };
  const screen = await render(Board, { view });
  const buttons = screen.getByRole('button', { name: /내기$/ }).elements();
  expect(buttons).toHaveLength(10);
  expect(minTouch(buttons)).toBeGreaterThanOrEqual(48);
  const handEl = screen.getByRole('group', { name: '내 손패' }).element();
  expect(handEl.scrollWidth).toBeLessThanOrEqual(handEl.clientWidth + 1);
  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(390);
  }
});

test('손패는 월·종류 순으로 정렬되고 판이 바뀌어도 같은 순서다 (M3 리뷰 I-2)', async () => {
  // 엔진 손패 순서(셔플 순) 그대로: 1월 피 | 6월 청단 | 2월 홍단 | 5월 열끗 | 10월 피 | 5월 피 | 3월 광 | 7월 열끗 | 5월 피 | 1월 홍단
  const hand = [3, 21, 5, 16, 38, 19, 8, 24, 18, 1];
  const view: BoardView = {
    ...play,
    seats: [{ ...play.seats[0], hand, handCount: hand.length }, play.seats[1]],
    playable: hand,
  };
  const screen = await render(Board, { view });
  const order = () =>
    [...screen.container.querySelectorAll<HTMLElement>('[aria-label="내 손패"] [data-slot]')].map(
      (b) => Number(b.dataset['slot']),
    );
  expect(order()).toEqual([1, 3, 5, 8, 16, 18, 19, 21, 24, 38]);
  // 한 장 내고 보충 카드(끝에 붙음)가 들어와도 정렬은 유지된다
  const next = [21, 5, 16, 38, 19, 8, 24, 18, 1, 0];
  await screen.rerender({
    view: { ...view, seats: [{ ...view.seats[0], hand: next }, view.seats[1]], playable: next },
  });
  expect(order()).toEqual([0, 1, 5, 8, 16, 18, 19, 21, 24, 38]);
});

test('건너뛰기 탭은 카드를 내지 않는다: 재생 중 누른 카드는 재생이 끝나도 나가지 않는다 (M3 리뷰 I-3)', async () => {
  const onaction = vi.fn<(action: Action, at: number) => void>();
  const onskip = vi.fn();
  const screen = await render(Board, { view: play, busy: true, onaction, onskip });
  const button = () =>
    screen.container.querySelector<HTMLButtonElement>('[aria-label="내 손패"] [data-slot="30"]')!;
  expect(button().disabled).toBe(true);

  // 1. 재생 중 손패를 누른다 → 건너뛰기
  button().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7 }));
  expect(onskip).toHaveBeenCalledTimes(1);
  // 2. 손가락을 떼기 전에 재생이 끝나 버튼이 풀린다
  await screen.rerender({ busy: false });
  expect(button().disabled).toBe(false);
  // 3. 손을 떼면 click이 이제 활성인 같은 버튼으로 온다 → 내지 않는다
  button().dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }));
  button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  flushSync();
  expect(onaction).not.toHaveBeenCalled();

  // 비활성 버튼에 pointerdown이 오지 않는 브라우저: 누르기 기록 없이 온 포인터 click도 내지 않는다
  await screen.rerender({ busy: true });
  await screen.rerender({ busy: false });
  button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  flushSync();
  expect(onaction).not.toHaveBeenCalled();

  // 판이 멈춘 뒤 새로 탭하면 낸다 (실제 포인터 입력)
  await userEvent.click(button());
  expect(onaction).toHaveBeenCalledTimes(1);
  expect(onaction.mock.calls[0]?.[0]).toEqual({ type: 'play', seat: 0, card: 30 });
});

test('키보드로 고른 카드는 누르기 없이도 낸다', async () => {
  const onaction = vi.fn<(action: Action, at: number) => void>();
  const screen = await render(Board, { view: play, onaction });
  const button = screen.container.querySelector<HTMLButtonElement>('[data-slot="34"]')!;
  button.focus();
  await userEvent.keyboard('{Enter}');
  expect(onaction).toHaveBeenCalledTimes(1);
  expect(onaction.mock.calls[0]?.[0]).toEqual({ type: 'play', seat: 0, card: 34 });
});

test('배너에 주체가 붙고 예약 선택 행 안에 뜬다 (UX-08, M3 리뷰 I-4)', async () => {
  // 같은 레일에서 주체·문구를 교체하며 배너 둘을 겹쳐 쌓지 않는다.
  const screen = await render(Board, {
    view: play,
    banner: { kind: 'jjok', text: '쪽', seat: 1, id: 1 },
  });
  const layer = screen.container.querySelector('.event-rail');
  const bannerWith = (text: string) =>
    [...(layer?.querySelectorAll<HTMLElement>('[role="status"]') ?? [])].find(
      (el) => el.textContent?.trim() === text,
    );
  await vi.waitFor(() => expect(bannerWith('상대 쪽!')).toBeDefined());
  const reserved = screen.container.querySelector('.decision-area')!.getBoundingClientRect();
  expect(layer!.getBoundingClientRect().top).toBeGreaterThanOrEqual(reserved.top);
  await screen.rerender({ banner: { kind: 'ppeok', text: '뻑', seat: 0, id: 2 } });
  await vi.waitFor(() => expect(bannerWith('나 뻑!')).toBeDefined(), { timeout: 5000 });
  expect(layer!.getBoundingClientRect().bottom).toBeLessThanOrEqual(reserved.bottom);
  expect(layer!.querySelectorAll('.banner')).toHaveLength(1);
});

test('상시 정보: 양쪽 족보 진행도·뻑·흔들기·폭탄, 내 배수 (spec 6.1, M3 리뷰 I-4)', async () => {
  await page.viewport(390, 844);
  const screen = await render(Board, { view: play });
  const mine = screen.getByRole('list', { name: '내 족보 진행도' }).element().textContent ?? '';
  const theirs = screen.getByRole('list', { name: '상대 족보 진행도' }).element().textContent ?? '';
  for (const text of [mine, theirs]) {
    for (const label of ['광 ', '고도리 ', '단 ', '피 ', '뻑 ', '흔들 '])
      expect(text).toContain(label);
  }
  // 픽스처: 상대 뻑 1, 광 1·피 5
  expect(theirs).toContain('뻑 1');
  expect(theirs).toContain('피 5/10');
  expect(screen.container.querySelector('.me .multiplier')?.getAttribute('aria-label')).toBe(
    '나 누적 배수, 박 제외 ×2',
  );
  // 한 손 세로 화면: 게임판이 가로로 넘치지 않는다
  const board = screen.getByTestId('board').element();
  expect(board.scrollWidth).toBeLessThanOrEqual(board.clientWidth + 1);
});
