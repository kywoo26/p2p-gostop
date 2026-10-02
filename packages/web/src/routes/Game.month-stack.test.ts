import { legalActions, playerView, reduce, type Action, type GameState } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { toBoardView } from '../game/adapter.ts';
import type { GameController } from '../game/controller.ts';
import { Playback } from '../game/playback.svelte.ts';
import Game from './Game.svelte';
import { PRESETS } from '@p2p-gostop/engine';
import { createSession } from '../game/session.ts';
import { SoloSession } from '../game/solo.svelte.ts';
import type { AiClient } from '../game/ai-client.ts';
import { mixedTwelveMonths } from '../ui/month-stack.test-helper.ts';
import { resultScenario } from '../game/solo-result.test-helper.ts';
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
function assertMeasuredFloor(root: HTMLElement) {
  const table = root.querySelector<HTMLElement>('.table')!;
  const rect = table.getBoundingClientRect();
  const model = JSON.parse(table.dataset['floorModelBounds']!);
  expect(model.width).toBe(rect.width);
  expect(model.height).toBe(rect.height);
  expect(table.dataset['floorFits']).toBe('true');
}
// 실패한 기존 wait 바깥에서만 읽는다. 진단 오류도 원래 단언 오류를 바꾸지 않는다.
function reportMeasuredFloorFailure(
  root: HTMLElement,
  phase: 'initial' | 'resize',
  requested: { width: number; height: number },
  error: unknown,
): never {
  try {
    const table = root.querySelector<HTMLElement>('.table');
    const rect = table?.getBoundingClientRect();
    const style = table ? getComputedStyle(table) : null;
    const viewport = window.visualViewport;
    console.error(
      'MONTH_STACK_RESIZE_FAILURE ' +
        JSON.stringify({
          phase,
          requested,
          inner: { width: window.innerWidth, height: window.innerHeight },
          visualViewport: viewport
            ? {
                width: viewport.width,
                height: viewport.height,
                offsetLeft: viewport.offsetLeft,
                offsetTop: viewport.offsetTop,
                scale: viewport.scale,
              }
            : null,
          visibility: { state: document.visibilityState, hidden: document.hidden },
          hasFocus: document.hasFocus(),
          table: table
            ? {
                connected: table.isConnected,
                ownerDoc: table.ownerDocument === document,
                rect: rect
                  ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                  : null,
                computed: {
                  display: style!.display,
                  visibility: style!.visibility,
                  contentVisibility: style!.contentVisibility,
                  contain: style!.contain,
                },
              }
            : null,
          floor: {
            bounds: table?.dataset['floorModelBounds'] ?? null,
            suspended: table?.dataset['floorSuspended'] ?? null,
            fits: table?.dataset['floorFits'] ?? null,
          },
          landscape: window.matchMedia('(orientation: landscape)').matches,
          coarse: window.matchMedia('(pointer: coarse)').matches,
          fakeTimers: vi.isFakeTimers(),
        }),
    );
  } catch {
    // 조회·JSON·logger가 실패해도 받은 동일 error를 보존한다.
  }
  throw error;
}
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

test('Game 기본 경로는 합법 구성12월 전체 ID를 실제 Playback snapshot으로 표시하고 resize/복원 후 유지한다', async () => {
  await page.viewport(360, 780);
  const state = twelveMonths(),
    view = board(state),
    expected = view.floor.flatMap((g) => g.cards).sort((a, b) => a - b);
  const playback = new Playback(view, { viewer: 0, names: () => ['좌석0', '좌석1'] });
  const screen = await render(Game, {
    controller: controller(playback, () => false),
  });
  try {
    await vi.waitFor(() => {
      expect(floorIds(screen.container)).toEqual(expected);
      expect(window.innerWidth).toBe(360);
      expect(window.innerHeight).toBe(780);
      assertMeasuredFloor(screen.container);
    });
  } catch (error) {
    reportMeasuredFloorFailure(screen.container, 'initial', { width: 360, height: 780 }, error);
  }
  for (const [width, height] of [
    [390, 734],
    [360, 780],
  ]) {
    await page.viewport(width!, height!);
    try {
      await vi.waitFor(() => {
        expect(window.innerWidth).toBe(width);
        expect(window.innerHeight).toBe(height);
        assertMeasuredFloor(screen.container);
      });
    } catch (error) {
      reportMeasuredFloorFailure(
        screen.container,
        'resize',
        { width: width!, height: height! },
        error,
      );
    }
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

test('Game 기본 경로는 월 묶음과 현재 원본 ID를 안전하게 표시한다', async () => {
  await page.viewport(360, 780);
  const playback = new Playback(board(createScenario({ hands: [[0], [4]], floor: [8] })), {
    viewer: 0,
    names: () => ['좌석0', '좌석1'],
  });
  const screen = await render(Game, { controller: controller(playback, () => false) });
  await vi.waitFor(() => expect(floorIds(screen.container)).toEqual([8]));
  expect(screen.container.querySelector('.table')?.getAttribute('data-floor-fits')).toBe('true');
  expect(screen.container.querySelector('.table')?.getAttribute('data-floor-strategy')).toBe(
    'scatter',
  );
  expect(screen.container.querySelector('.layout-diagnostic')).toBeNull();
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

for (const [width, height] of [
  [360, 780],
  [390, 734],
] as const) {
  test(`${width}×${height} 합법 혼합12월16장 actual Game은 모든 ID와 paint 여백·행간을 보존한다`, async () => {
    await page.viewport(width, height);
    const view = board(mixedTwelveMonths());
    const expected = view.floor.flatMap((g) => g.cards).sort((a, b) => a - b);
    expect(expected).toHaveLength(16);
    const playback = new Playback(view, { viewer: 0, names: () => ['좌석0', '좌석1'] });
    const screen = await render(Game, {
      controller: controller(playback, () => false),
    });
    try {
      const table = screen.container.querySelector<HTMLElement>('.table')!;
      await vi.waitFor(() =>
        expect(floorIds(screen.container), table.dataset['floorModelBounds']).toEqual(expected),
      );
      expect(table.dataset['floorFits']).toBe('true');
      expect(table.dataset['floorStrategy']).toBe('boundary');
      const root = screen.container.querySelector<HTMLElement>('.board')!;
      const style = getComputedStyle(root);
      const budget = Number.parseFloat(style.getPropertyValue('--fan-gap'));
      expect(Number.parseFloat(style.rowGap)).toBeCloseTo(budget - 2 / 3, 4);
      expect(style.gridTemplateRows.split(' ')).toHaveLength(7);
      expect(root.getBoundingClientRect().height).toBe(height);
      for (const el of root.querySelectorAll<HTMLElement>('.floor [data-card-id]')) {
        const pose = JSON.parse(el.closest<HTMLElement>('.stack-card')!.dataset['floorModelPose']!);
        expect(pose.angle).toBe(0);
      }
      const cells = [...root.querySelectorAll<HTMLElement>('.floor .group')].map((el) =>
        JSON.parse(el.dataset['floorModelFootprint']!),
      );
      const bounds = JSON.parse(table.dataset['floorModelBounds']!);
      const gap = (a: DOMRect, b: DOMRect) =>
        Math.max(
          a.x - b.x - b.width,
          b.x - a.x - a.width,
          a.y - b.y - b.height,
          b.y - a.y - a.height,
        );
      for (const [i, cell] of cells.entries()) {
        expect(cell.x).toBeGreaterThanOrEqual(2);
        expect(cell.y).toBeGreaterThanOrEqual(2);
        expect(cell.x + cell.width).toBeLessThanOrEqual(bounds.width - 2);
        expect(cell.y + cell.height).toBeLessThanOrEqual(bounds.height - 2);
        for (const other of [...cells.slice(i + 1), ...bounds.obstacles])
          expect(gap(cell, other)).toBeGreaterThanOrEqual(12);
      }
      for (const button of root.querySelectorAll<HTMLElement>('.hand button')) {
        expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(48);
        expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
      }
      for (const group of root.querySelectorAll<HTMLElement>('.captured .group'))
        expect(getComputedStyle(group).rowGap).toBe('2px');
      playback.reset(view);
      await vi.waitFor(() => expect(floorIds(screen.container)).toEqual(expected));
      expect(table.dataset['floorReserved']).toBe('0');
    } finally {
      playback.dispose();
    }
  });
}

test('실제 SoloSession 입력·원target 선택·FIFO 완료·resize·종료는 현재 floor ID를 보존한다', async () => {
  await page.viewport(360, 780);
  let releaseAi: (() => void) | undefined;
  const ai: AiClient = {
    mode: 'inline',
    decide: (request) =>
      new Promise((resolve) => {
        releaseAi = () => resolve({ action: request.view.legal[0]!, ms: 0 });
      }),
    dispose: () => {},
  };
  const session = createSession({
    preset: 'standard',
    rules: PRESETS.standard,
    perPoint: 100,
    startBalance: 100000,
    names: ['좌석0', '좌석1'],
    seed: 1,
  }).session;
  const solo = new SoloSession(
    { ...session, phase: 'playing', game: mixedTwelveMonths() },
    {
      difficulty: 'easy',
      timeBudgetMs: 100,
      ai,
      persist: false,
    },
  );
  const screen = await render(Game, { controller: solo });
  const expected = () =>
    board(solo.state.game)
      .floor.flatMap((g) => g.cards)
      .sort((a, b) => a - b);
  try {
    await vi.waitFor(() => expect(floorIds(screen.container)).toEqual(expected()));
    const hand = screen.container
      .querySelector<HTMLElement>('.hand [data-card-id="2"]')!
      .closest('button')!;
    expect(hand.disabled).toBe(false);
    await userEvent.click(hand);
    await vi.waitFor(() => expect(solo.state.game.pending?.kind).toBe('target'));
    await vi.waitFor(() => expect(solo.playback.idle).toBe(true), { timeout: 10000 });
    const choice = screen.container.querySelector<HTMLButtonElement>(
      '.floor-target [data-candidate-id="0"]',
    )!;
    expect(choice).not.toBeNull();
    expect(choice.getBoundingClientRect().width).toBeGreaterThanOrEqual(48);
    expect(choice.querySelector('img')!.getBoundingClientRect().width).toBe(48);
    await userEvent.click(choice);
    expect(solo.state.actions.at(-1)).toEqual({ type: 'chooseTarget', seat: 0, card: 0 });
    solo.skipAnimations();
    await vi.waitFor(() => expect(solo.playback.idle).toBe(true), { timeout: 10000 });
    await vi.waitFor(() => expect(floorIds(screen.container)).toEqual(expected()));
    expect(screen.container.querySelector('.table')!.getAttribute('data-floor-reserved')).toBe('0');
    expect(solo.state.game.seats[0].captured.gwang).toContain(0);
    for (const captured of screen.container.querySelectorAll<HTMLElement>('.captured .card'))
      expect(captured.getBoundingClientRect().width).toBe(32);
    for (const [width, height] of [
      [390, 734],
      [360, 780],
    ] as const) {
      await page.viewport(width, height);
      await vi.waitFor(() => assertMeasuredFloor(screen.container));
      expect(floorIds(screen.container)).toEqual(expected());
    }
    solo.end();
    await vi.waitFor(() =>
      expect(screen.container.querySelector('.game')!.getAttribute('data-phase')).toBe('ended'),
    );
    const after = solo.state.actions.length;
    hand.click();
    expect(solo.state.actions).toHaveLength(after);
    expect(floorIds(screen.container)).toEqual(expected());
  } finally {
    solo.dispose();
    releaseAi?.();
  }
}, 15000);

test('기본 Game 정산 뒤 실제 새 라운드는 현재 원본 ID·예약·입력을 복원한다', async () => {
  await page.viewport(360, 780);
  const solo = new SoloSession(resultScenario(), {
    difficulty: 'easy',
    timeBudgetMs: 100,
    persist: false,
    ai: {
      mode: 'inline',
      decide: async () => {
        throw Error('CPU 요청 없음');
      },
      dispose() {},
    },
  });
  const screen = await render(Game, { controller: solo });
  const assertCurrentFloor = async () => {
    const expected = () => solo.playback.board.floor.flatMap((g) => g.cards).sort((a, b) => a - b);
    await vi.waitFor(() => expect(floorIds(screen.container)).toEqual(expected()));
    expect(screen.container.querySelector('.table')!.getAttribute('data-floor-fits')).toBe('true');
    expect(screen.container.querySelector('.layout-diagnostic')).toBeNull();
  };
  try {
    await assertCurrentFloor();
    expect(solo.submit({ type: 'play', seat: 0, card: 16 })).toBe(true);
    solo.skipAnimations();
    await vi.waitFor(
      () => expect(screen.container.querySelector('[data-choice="acknowledge"]')).not.toBeNull(),
      { timeout: 10000 },
    );
    await assertCurrentFloor();
    await userEvent.click(
      screen.container.querySelector<HTMLButtonElement>('[data-choice="acknowledge"]')!,
    );
    await vi.waitFor(() =>
      expect(screen.container.querySelector('[data-choice="accept"]')).not.toBeNull(),
    );
    await userEvent.click(
      screen.container.querySelector<HTMLButtonElement>('[data-choice="accept"]')!,
    );
    await vi.waitFor(() => expect(solo.playback.settlement).not.toBeNull());
    expect(solo.state.roundNumber).toBe(1);
    solo.nextRound();
    expect(solo.state.roundNumber).toBe(2);
    solo.skipAnimations();
    await vi.waitFor(() => expect(solo.playback.idle).toBe(true), { timeout: 10000 });
    expect(solo.playback.board.floor.flatMap((g) => g.cards).length).toBeGreaterThan(0);
    await assertCurrentFloor();
    expect(screen.container.querySelector('.table')!.getAttribute('data-floor-reserved')).toBe('0');
    expect(screen.container.querySelector('.table')!.getAttribute('data-floor-round')).toBe('2');
    expect(screen.container.querySelector('.hand button')).not.toBeNull();
    expect(screen.container.querySelector('.overlay')).toBeNull();
  } finally {
    solo.dispose();
  }
}, 15000);

test('390 실제 Game play17 성장16→18은 큐 중간 원본 ID와 resize/복원 수명을 보존한다', async () => {
  await page.viewport(390, 734);
  const session = createSession({
    preset: 'standard',
    rules: PRESETS.standard,
    perPoint: 100,
    startBalance: 100000,
    names: ['좌석0', '좌석1'],
    seed: 1,
  }).session;
  const solo = new SoloSession(
    { ...session, phase: 'playing', game: mixedTwelveMonths(true) },
    {
      difficulty: 'easy',
      timeBudgetMs: 100,
      persist: false,
      ai: { mode: 'inline', decide: () => new Promise(() => {}), dispose() {} },
    },
  );
  const screen = await render(Game, { controller: solo });
  const expected = () => solo.playback.board.floor.flatMap((g) => g.cards).sort((a, b) => a - b);
  const frames: { expected: number[]; actual: number[]; fits: string | null }[] = [];
  let active = true,
    raf = 0;
  const record = () => {
    frames.push({
      expected: expected(),
      actual: floorIds(screen.container),
      fits: screen.container.querySelector('.table')?.getAttribute('data-floor-fits') ?? null,
    });
    if (active) raf = requestAnimationFrame(record);
  };
  try {
    await vi.waitFor(() => expect(floorIds(screen.container)).toEqual(expected()));
    expect(expected()).toHaveLength(16);
    raf = requestAnimationFrame(record);
    await userEvent.click(
      screen.container.querySelector<HTMLElement>('.hand [data-card-id="17"]')!.closest('button')!,
    );
    await vi.waitFor(() => expect(solo.state.game.floor.flatMap((g) => g.cards)).toHaveLength(18));
    await vi.waitFor(() => expect(solo.playback.idle).toBe(true), { timeout: 10000 });
    await vi.waitFor(() => expect(floorIds(screen.container)).toEqual(expected()));
    active = false;
    cancelAnimationFrame(raf);
    record();
    expect(expected()).toHaveLength(18);
    expect(frames.length).toBeGreaterThan(1);
    for (const frame of frames) {
      expect(frame.actual).toEqual(frame.expected);
      expect(frame.fits).toBe('true');
    }
    expect(solo.state.game.floor.find((g) => g.month === 5)?.cards).toEqual([16, 17, 18]);
    expect(screen.container.querySelector('.layout-diagnostic')).toBeNull();
    for (const row of screen.container.querySelectorAll<HTMLElement>('.hand .row'))
      expect(getComputedStyle(row).gap).toBe('4px');
    for (const group of screen.container.querySelectorAll<HTMLElement>('.captured .group'))
      expect(getComputedStyle(group).rowGap).toBe('2px');
    for (const [width, height] of [
      [360, 780],
      [390, 734],
    ] as const) {
      await page.viewport(width, height);
      await vi.waitFor(() => assertMeasuredFloor(screen.container));
      expect(floorIds(screen.container)).toEqual(expected());
      expect(screen.container.querySelector('.table')?.getAttribute('data-floor-reserved')).toBe(
        '0',
      );
    }
    solo.playback.reset(
      toBoardView(playerView(solo.state.game, 0), {
        names: ['좌석0', '좌석1'],
        balances: [100000, 100000],
      }),
    );
    await vi.waitFor(() => expect(floorIds(screen.container)).toEqual(expected()));
  } finally {
    active = false;
    cancelAnimationFrame(raf);
    solo.dispose();
  }
}, 15000);
