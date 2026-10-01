import { legalActions, playerView, reduce, type Action, type GameState } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { toBoardView } from '../game/adapter.ts';
import type { GameController } from '../game/controller.ts';
import { Playback } from '../game/playback.svelte.ts';
import Game from './Game.svelte';
import '../styles/skin-fan.css';

const board = (state: GameState) =>
  toBoardView(playerView(state, 0), { names: ['좌석0', '좌석1'], balances: [100000, 100000] });
const controller = (playback: Playback, submit: GameController['submit']): GameController => ({
  mode: 'solo',
  playback,
  canAct: true,
  thinking: false,
  bankrupt: false,
  notice: null,
  pushDecision: null,
  stats: {
    round: playback.board.round,
    phase: 'playing',
    roundsPlayed: 0,
    balances: [100000, 100000],
    refilled: [0, 0],
    startBalance: 100000,
    seq: 0,
  },
  submit,
  nextRound: () => {},
  choosePush: () => {},
  refill: () => {},
  end: () => {},
  attach: (root) => playback.attach(root),
  skipAnimations: () => playback.skip(),
  autoAdvance: () => {},
});
const floorIds = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.floor [data-card-id]')]
    .map((e) => Number(e.dataset['cardId']))
    .sort((a, b) => a - b);
function twelveMonths() {
  let state = createScenario({
    roundNumber: 2,
    hands: [
      [32, 1, 5, 9, 13, 17, 21, 25, 29, 33],
      [40, 2, 6, 10, 14, 18, 22, 26, 30, 41],
    ],
    floor: [0, 4, 8, 12, 16, 20, 24, 28],
    deck: [36, 44],
  });
  expect(state.deck).toHaveLength(23);
  for (const action of [
    { type: 'play', seat: 0, card: 32 },
    { type: 'play', seat: 1, card: 40 },
  ] as const) {
    expect(legalActions(state, action.seat)).toContainEqual(action);
    const next = reduce(state, action);
    if (!next.ok) throw Error(next.message);
    expect(next.events.some((e) => e.type === 'Captured')).toBe(false);
    state = next.state;
  }
  return state;
}

test('Game opt-in은 합법 구성12월 전체 ID를 실제 Playback snapshot으로 표시하고 resize/복원 후 유지한다', async () => {
  await page.viewport(360, 780);
  const state = twelveMonths(),
    view = board(state),
    expected = view.floor.flatMap((g) => g.cards).sort((a, b) => a - b);
  const playback = new Playback(view, { viewer: 0, names: () => ['좌석0', '좌석1'] });
  const screen = await render(Game, {
    controller: controller(playback, () => false),
    monthStacks: true,
  });
  await vi.waitFor(() => expect(floorIds(screen.container)).toEqual(expected));
  for (const [width, height] of [
    [390, 734],
    [360, 780],
  ]) {
    await page.viewport(width!, height!);
    await vi.waitFor(() =>
      expect(screen.container.querySelector('.table')?.getAttribute('data-floor-fits')).toBe(
        'true',
      ),
    );
    expect(floorIds(screen.container)).toEqual(expected);
    expect(screen.container.querySelector('.layout-diagnostic')).toBeNull();
  }
  playback.reset(view);
  await vi.waitFor(() => expect(floorIds(screen.container)).toEqual(expected));
  expect(screen.container.querySelectorAll('.hand .card')).not.toHaveLength(0);
  for (const card of screen.container.querySelectorAll('.hand .card'))
    expect(card.getBoundingClientRect().width).toBe(48);
  playback.dispose();
});

test('Game 기본 경로는 opt-in을 활성화하지 않는다', async () => {
  await page.viewport(360, 780);
  const playback = new Playback(board(createScenario({ hands: [[0], [4]], floor: [8] })), {
    viewer: 0,
    names: () => ['좌석0', '좌석1'],
  });
  const screen = await render(Game, { controller: controller(playback, () => false) });
  await vi.waitFor(() => expect(floorIds(screen.container)).toEqual([8]));
  expect(screen.container.querySelector('.table')?.hasAttribute('data-floor-strategy')).toBe(false);
  playback.dispose();
});

test('Game native 선택 전체48px·원ID는 실제 engine 수락/Playback 완료와 다음 snapshot에 연결된다', async () => {
  await page.viewport(360, 780);
  let state = createScenario({
    hands: [
      [0, 4, 8],
      [12, 16, 20],
    ],
    floor: [1, 2, 5],
    deck: [24, 28],
  });
  const start = reduce(state, { type: 'play', seat: 0, card: 0 });
  if (!start.ok) throw Error(start.message);
  state = start.state;
  const playback = new Playback(board(state), { viewer: 0, names: () => ['좌석0', '좌석1'] });
  const sent: Action[] = [];
  const screen = await render(Game, {
    monthStacks: true,
    controller: controller(playback, (action) => {
      const next = reduce(state, action);
      if (!next.ok) return false;
      sent.push(action);
      state = next.state;
      playback.enqueue(next.events, board(state), { action });
      return true;
    }),
  });
  await vi.waitFor(() =>
    expect(screen.container.querySelector<HTMLDialogElement>('.floor-target dialog')?.open).toBe(
      true,
    ),
  );
  const buttons = [
    ...screen.container.querySelectorAll<HTMLButtonElement>('.floor-target dialog button'),
  ];
  expect(buttons).toHaveLength(2);
  expect(screen.container.querySelectorAll('.floor-target [data-card-id]')).toHaveLength(0);
  for (const button of buttons) {
    expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(48);
    expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
    expect(button.querySelector('img')!.getBoundingClientRect().width).toBe(48);
  }
  await userEvent.click(buttons[0]!);
  expect(sent).toEqual([{ type: 'chooseTarget', seat: 0, card: 1 }]);
  await vi.waitFor(() => expect(playback.idle).toBe(true), { timeout: 10000 });
  expect(playback.board.seats[0].captured.gwang).toContain(0);
  expect(playback.board.seats[0].captured.tti).toContain(1);
  await vi.waitFor(() =>
    expect(floorIds(screen.container)).toEqual(
      board(state)
        .floor.flatMap((g) => g.cards)
        .sort((a, b) => a - b),
    ),
  );
  expect(screen.container.querySelector('.table')?.getAttribute('data-floor-reserved')).toBe('0');
  playback.reset(board(state));
  await vi.waitFor(() => expect(screen.container.querySelector('.floor-target dialog')).toBeNull());
  expect(sent).toHaveLength(1);
  playback.dispose();
});

test('390×734 Game fresh 12월도 긴급0도 배치로 전체 CardId와 덱·손패·HUD 여백을 보존한다', async () => {
  await page.viewport(390, 734);
  const view = board(twelveMonths());
  const playback = new Playback(view, { viewer: 0, names: () => ['좌석0', '좌석1'] });
  const screen = await render(Game, {
    controller: controller(playback, () => false),
    monthStacks: true,
  });
  await vi.waitFor(() =>
    expect(floorIds(screen.container)).toEqual(
      view.floor.flatMap((g) => g.cards).sort((a, b) => a - b),
    ),
  );
  const table = screen.container.querySelector<HTMLElement>('.table')!;
  await vi.waitFor(() => expect(JSON.parse(table.dataset['floorModelBounds']!).width).toBe(366));
  expect(table.dataset['floorStrategy']).toBe('boundary');
  const bounds = table.getBoundingClientRect();
  const cards = [...screen.container.querySelectorAll<HTMLElement>('.floor [data-card-id]')];
  const blockers = [...screen.container.querySelectorAll('.hand-zone,.mine-hud,.opponent-hud')].map(
    (e) => e.getBoundingClientRect(),
  );
  const cross = (a: DOMRect, b: DOMRect) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    expect(r.left).toBeGreaterThanOrEqual(bounds.left);
    expect(r.right).toBeLessThanOrEqual(bounds.right);
    expect(r.top).toBeGreaterThanOrEqual(bounds.top);
    expect(r.bottom).toBeLessThanOrEqual(bounds.bottom);
    expect(
      JSON.parse(card.closest<HTMLElement>('.stack-card')!.dataset['floorModelPose']!).angle,
    ).toBe(0);
    for (const other of cards)
      if (card !== other) expect(cross(r, other.getBoundingClientRect())).toBe(false);
    for (const b of blockers) expect(cross(r, b)).toBe(false);
  }
  for (const group of screen.container.querySelectorAll<HTMLElement>('.captured .group'))
    expect(getComputedStyle(group).rowGap).toBe('2px');
  playback.dispose();
});
