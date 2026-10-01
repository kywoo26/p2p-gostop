import { expect, test } from 'vitest';
import { DEFAULT_RULES, legalActions, newRound, playerView, reduce } from '@p2p-gostop/engine';
import { toBoardView } from '../game/adapter.ts';
import { applyEvent, snap } from '../game/display.ts';
import { planSteps } from '../anim/choreo.ts';
import { floorLayout, type FloorCell } from './floor-layout.ts';

test('합법 FIFO의 중간 commit: 예약 셀과 현재 바닥 셀을 동시에 보존한다', () => {
  for (let seed = 1; seed <= 12; seed++) {
    let state = newRound(DEFAULT_RULES, seed, { dealer: 0 }).state;
    const meta = { names: ['좌석0', '좌석1'] as const, balances: [100000, 100000] as const };
    let board = snap(toBoardView(playerView(state, 0), meta));
    let placed = floorLayout(board.floor, [], 300, 243.76, 48).cells;
    let reserved: FloorCell[] = [];
    for (let turn = 0; turn < 12; turn++) {
      const legal = [...legalActions(state, 0), ...legalActions(state, 1)];
      if (!legal.length) break;
      const action = legal[(seed * 31 + turn * 17) % legal.length]!;
      const result = reduce(state, action);
      if (!result.ok) throw Error(result.reason);
      for (const step of planSteps(result.events)) {
        for (const event of step.events) board = applyEvent(board, event);
        const ids = new Set(board.floor.flatMap((g) => g.cards));
        reserved = reserved.filter((c) => c.cards.every((id) => !ids.has(id)));
        reserved.push(...placed.filter((c) => c.cards.every((id) => !ids.has(id))));
        const layout = floorLayout(
          board.floor,
          [],
          300,
          243.76,
          48,
          placed,
          reserved.map((c) => c.slot),
        );
        expect(
          layout.conflict,
          JSON.stringify({
            seed,
            turn,
            action,
            step: step.kind,
            reserved: reserved.map((c) => c.slot),
            cards: board.floor.flatMap((g) => g.cards),
          }),
        ).toBe(false);
        placed = layout.cells;
      }
      reserved = [];
      state = result.state;
      board = snap(toBoardView(playerView(state, 0), meta));
    }
  }
});

// 실제 Playback과 실제 Board/Floor의 Svelte commit을 통과시킨다.
import { tick } from 'svelte';
import { afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Playback } from '../game/playback.svelte.ts';
import ReplayBoard from './floor-testing/ReplayBoard.svelte';
import * as floorMath from './floor-layout.ts';
vi.mock('./floor-layout.ts', { spy: true });
let pb: Playback | undefined;
afterEach(() => {
  pb?.dispose();
  pb = undefined;
  vi.restoreAllMocks();
  delete document.documentElement.dataset['speed'];
});
for (const mode of ['fifo', 'skip', 'reset'] as const) {
  test(`실제 Playback seed1 4묶음 ${mode}: 완료 snapshot 경계에서만 예약을 해제한다`, async () => {
    document.documentElement.dataset['speed'] = 'instant';
    const solver = vi.mocked(floorMath.assignFloor);
    solver.mockClear();
    const meta = { names: ['좌석0', '좌석1'] as const, balances: [100000, 100000] as const };
    let state = newRound(DEFAULT_RULES, 1, { dealer: 0 }).state;
    const initial = toBoardView(playerView(state, 0), meta);
    pb = new Playback(initial, { viewer: 0, names: () => meta.names });
    const screen = await render(ReplayBoard, { playback: pb });
    let final = initial;
    for (let turn = 0; turn < 4; turn++) {
      const legal = [...legalActions(state, 0), ...legalActions(state, 1)];
      const action = legal[(31 + turn * 17) % legal.length]!;
      const result = reduce(state, action);
      if (!result.ok) throw Error(result.reason);
      if (turn === 3) expect(action).toEqual({ type: 'play', seat: 1, card: 21 });
      state = result.state;
      final = toBoardView(playerView(state, 0), meta);
      pb.enqueue(result.events, final);
    }
    expect(pb.busy).toBe(true);
    if (mode === 'skip') pb.skip();
    if (mode === 'reset') pb.reset(final);
    await vi.waitFor(() => expect(pb!.busy).toBe(false));
    await tick();
    expect(pb.board.eventSeq).toBe(final.eventSeq);
    expect(pb.board.floor).toEqual(final.floor);
    const outcomes = solver.mock.results
      .filter((r) => r.type === 'return')
      .map((r) => r.value as ReturnType<typeof floorMath.assignFloor>);
    expect(outcomes.length).toBeGreaterThan(1);
    expect(outcomes.every((layout) => !layout.conflict)).toBe(true);
    const ids = [...screen.container.querySelectorAll<HTMLElement>('.floor [data-card-id]')]
      .map((el) => Number(el.dataset['cardId']))
      .sort((a, b) => a - b);
    expect(ids).toEqual(final.floor.flatMap((g) => g.cards).sort((a, b) => a - b));
  });
}

import Board from './Board.svelte';
import { page } from 'vitest/browser';
import { fixtures } from '../lib/fixtures.ts';
import { floorGroup, stableBefore } from './floor-stability-fixtures.ts';
for (const seq of [100, 101, 109, 2]) {
  test(`snapshot seq ${seq}: 같은 seq 예약 유지·완료 증가/점프/복원 감소 해제`, async () => {
    const initial = { ...fixtures.board.states.play, floor: stableBefore, eventSeq: 100 };
    const screen = await render(Board, { view: initial });
    const kept = { ...initial, floor: stableBefore.slice(1) };
    await screen.rerender({ view: kept, playbackBusy: true });
    await screen.rerender({ view: { ...kept, eventSeq: seq } });
    await screen.rerender({
      view: { ...kept, eventSeq: seq, floor: [...kept.floor, floorGroup(4, [12])] },
    });
    const slot = Number(
      screen.container.querySelector('[data-month="4"]')?.getAttribute('data-floor-slot'),
    );
    if (seq === 100) expect(slot).not.toBe(6);
    else expect(slot).toBe(6);
  });
}
test('투영·선택·메타데이터·busy/snapshot 변경은 전체 슬롯 탐색을 반복하지 않는다', async () => {
  const solver = vi.mocked(floorMath.assignFloor);
  solver.mockClear();
  const initial = { ...fixtures.board.states.play, floor: stableBefore };
  const screen = await render(Board, { view: initial });
  const count = solver.mock.calls.length;
  expect(count).toBe(1);
  for (const [width, height] of [
    [360, 780],
    [390, 780],
    [412, 840],
    [780, 360],
    [360, 780],
  ]) {
    await page.viewport(width!, height!);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }
  await screen.rerender({
    view: { ...initial, floor: initial.floor.map((g) => ({ ...g, kind: 'natural' as const })) },
    playbackBusy: true,
  });
  await screen.rerender({
    view: { ...initial, eventSeq: initial.eventSeq + 1 },
    playbackBusy: false,
  });
  await screen.rerender({
    view: {
      ...initial,
      pending: { kind: 'target', seat: 0, source: 'flip', card: 5, options: [4] },
    },
  });
  expect(solver.mock.calls).toHaveLength(count);
  await screen.rerender({ view: { ...initial, floor: [...initial.floor, floorGroup(4, [12])] } });
  expect(solver.mock.calls).toHaveLength(count + 1);
});
