// FR-41·46~48·NF-08 / UX-H05·UX-A01: 색/판정 경계와 승인된 preview 조건의 회귀.
import { cardId, playerView, reduce } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { toBoardView } from '../game/adapter.ts';
import { settings } from '../settings/settings.svelte.ts';
import Board from './Board.svelte';

const original = settings.value;
const c = cardId;
const metadata = { names: ['나', '상대'] as const, balances: [1000, 1000] as const };
beforeEach(async () => {
  settings.update({ hintLevel: 'basic' });
  document.documentElement.dataset['speed'] = 'instant';
  await page.viewport(390, 844);
});
afterEach(() => {
  settings.update(original);
  delete document.documentElement.dataset['speed'];
});

for (const hintLevel of ['off', 'basic', 'detail'] as const) {
  test(`${hintLevel}: 초점 예고만 제거하고 필수 대상·view.highlight는 유지한다`, async () => {
    settings.update({ hintLevel });
    const game = createScenario({ hands: [[c('8피a')], [c('10열')]], floor: [c('8광'), c('8고')] });
    const screen = await render(Board, { view: toBoardView(playerView(game, 0), metadata) });
    const hand = screen.container.querySelector<HTMLButtonElement>(`[data-slot="${c('8피a')}"]`)!;
    hand.focus();
    await vi.waitFor(() =>
      expect(screen.container.querySelectorAll('.floor .highlight')).toHaveLength(
        hintLevel === 'off' ? 0 : 2,
      ),
    );
    expect(document.activeElement).toBe(hand);
    const next = reduce(game, { type: 'play', seat: 0, card: c('8피a') });
    if (!next.ok) throw new Error(next.message);
    await screen.rerender({ view: toBoardView(playerView(next.state, 0), metadata) });
    await expect.element(screen.getByRole('dialog', { name: '먹을 바닥패 선택' })).toBeVisible();
    expect(screen.container.querySelectorAll('.floor-choice .highlight')).toHaveLength(2);
    for (const button of screen.container.querySelectorAll<HTMLButtonElement>('.floor-choice'))
      expect(button.disabled).toBe(false);
    await screen.rerender({
      view: { ...toBoardView(playerView(game, 0), metadata), highlight: [c('8광')] },
    });
    expect(
      screen.container.querySelector(`.floor .highlight[data-card-id="${c('8광')}"]`),
    ).not.toBeNull();
  });
}

test('힌트 끔에도 폭탄 Shift+Enter는 한 장만 내고 실제 초점·48px 입력을 유지한다', async () => {
  settings.update({ hintLevel: 'off' });
  const game = createScenario({ hands: [[0, 1, 2, 8], [12]], floor: [3] });
  const onaction = vi.fn();
  const screen = await render(Board, {
    view: toBoardView(playerView(game, 0), metadata),
    onaction,
  });
  const card = screen.container.querySelector<HTMLButtonElement>('[data-slot="0"]')!;
  card.focus();
  expect(card.getBoundingClientRect().width).toBeGreaterThanOrEqual(48);
  expect(
    screen.container.querySelectorAll('[data-hand-cue], [data-hand-action], [data-hand-link]'),
  ).toHaveLength(0);
  await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
  expect(onaction.mock.calls[0]?.[0]).toEqual({ type: 'play', seat: 0, card: 0 });
  expect(onaction).toHaveBeenCalledOnce();
});

test('공개 상대 월·삼광 점수는 매칭을 확정으로 올리지 않는다', async () => {
  const game = createScenario({
    hands: [[c('8피a')], [c('8피b')]],
    floor: [c('8고')],
    captured: [[c('1광'), c('3광'), c('8광')], []],
    seats: [{}, { revealed: [c('8피b')] }],
  });
  const screen = await render(Board, { view: toBoardView(playerView(game, 0), metadata) });
  const card = screen.container.querySelector(`[data-slot="${c('8피a')}"]`)!;
  expect(card.getAttribute('data-hand-cue')).toBe('matchable');
  expect(card.getAttribute('aria-label')).not.toContain('확정');
});

test('동일 공개 뷰의 숨은 상대·더미 교환은 UI/ARIA 표식에 차이가 없다', async () => {
  const first = createScenario({
    hands: [[c('8광')], [c('10열')]],
    floor: [c('8피a')],
    deck: [c('11광')],
  });
  const second = createScenario({
    hands: [[c('8광')], [c('11광')]],
    floor: [c('8피a')],
    deck: [c('10열')],
  });
  const screen = await render(Board, { view: toBoardView(playerView(first, 0), metadata) });
  const signature = () =>
    [
      ...screen.container.querySelectorAll(
        '[aria-label], [data-hand-cue], [data-hand-action], [data-hand-link]',
      ),
    ].map((el) => ({
      label: el.getAttribute('aria-label'),
      text: el.textContent,
      cue: el.getAttribute('data-hand-cue'),
      action: el.getAttribute('data-hand-action'),
      link: el.getAttribute('data-hand-link'),
    }));
  const before = signature();
  await screen.rerender({ view: toBoardView(playerView(second, 0), metadata) });
  expect(signature()).toEqual(before);
});
