// 게임판: 픽스처 상태별 조작 요소와 실제 레이아웃의 터치 영역(spec 6.1 48×48) 검사.
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
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
  const progress = screen.getByRole('list', { name: '족보 진행도' });
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
