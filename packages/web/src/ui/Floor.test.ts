import { tick } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { BoardView, FloorGroupView } from '../lib/view-types.ts';
import { fixtures } from '../lib/fixtures.ts';
import Board from './Board.svelte';
import { Playback } from '../game/playback.svelte.ts';
import ReplayBoard from './floor-testing/ReplayBoard.svelte';
import { stableBefore, stableAfter, floorGroup } from './floor-stability-fixtures.ts';
import '../styles/skin-fan.css';

const view = (floor: readonly FloorGroupView[], deckCount = 14): BoardView => ({
  ...fixtures.board.states.play,
  seats: fixtures.board.states.play.seats.map((s) => ({
    ...s,
    captured: { gwang: [], yeol: [], tti: [], pi: [] },
  })) as unknown as BoardView['seats'],
  floor,
  deckCount,
});
const slot = (root: HTMLElement, id: number) =>
  Number(
    root
      .querySelector(`[data-card-id="${id}"]`)
      ?.closest('[data-floor-slot]')
      ?.getAttribute('data-floor-slot'),
  );
let playback: Playback | undefined;
afterEach(() => {
  playback?.dispose();
  playback = undefined;
  delete document.documentElement.dataset['speed'];
});

test('기존 월 노드·앵커를 보존하고 선택 첫 ID 교체 뒤 최신 후보만 제출한다', async () => {
  await page.viewport(360, 780);
  const submitted = vi.fn();
  const screen = await render(Board, { view: view(stableBefore), onaction: submitted });
  const anchor = screen.container.querySelector('[data-month="2"]');
  const old = [slot(screen.container, 0), slot(screen.container, 8)];
  await screen.rerender({ view: view(stableAfter) });
  expect([slot(screen.container, 0), slot(screen.container, 8)]).toEqual(old);
  expect(screen.container.querySelector('[data-month="2"]')).toBe(anchor);
  const target = {
    ...view(stableAfter),
    pending: {
      kind: 'target' as const,
      seat: 0 as const,
      source: 'play' as const,
      card: 6,
      options: [4, 5],
    },
  };
  await screen.rerender({ view: target });
  const choice = screen.container.querySelector<HTMLButtonElement>('[data-choice="target-4"]')!;
  const selectedSlot = slot(screen.container, 4);
  // 이전 선택의 노드가 제거된 뒤 뒤늦은 click은 이전 CardId를 제출하지 않는다.
  await screen.rerender({
    view: {
      ...target,
      floor: stableAfter.map((g) => (g.month === 2 ? floorGroup(2, [5, 6]) : g)),
      pending: { ...target.pending, options: [5, 6] },
    },
  });
  choice.click();
  expect(submitted).not.toHaveBeenCalled();
  expect(slot(screen.container, 5)).toBe(selectedSlot);
  await screen.getByRole('button', { name: '2월 홍단' }).click();
  expect(submitted).toHaveBeenCalledExactlyOnceWith(
    { type: 'chooseTarget', seat: 0, card: 5 },
    expect.any(Number),
  );
});

test('재생 전용 잠금: 최종 snapshot 전 예약·완료 뒤 빈자리 재사용, 상대 입력 잠금은 예약하지 않는다', async () => {
  const screen = await render(Board, { view: view(stableBefore) });
  await screen.rerender({ view: view(stableBefore.slice(1)), playbackBusy: true, busy: true });
  const next = [...stableBefore.slice(1), floorGroup(4, [12])];
  await screen.rerender({ view: view(next), playbackBusy: true });
  expect(slot(screen.container, 12)).not.toBe(6);
  await screen.rerender({ view: view(stableBefore.slice(1)), playbackBusy: false, busy: true });
  await screen.rerender({ view: view(next) });
  expect(slot(screen.container, 12)).toBe(6);
});

test('새 판·같은 번호 새 게임의 remount·재접속 최신 snapshot은 이전 예약을 제거한다', async () => {
  const screen = await render(Board, { view: view(stableBefore) });
  await screen.rerender({ view: view(stableBefore.slice(1)), playbackBusy: true });
  await screen.rerender({ view: { ...view([floorGroup(4, [12])]), round: 2 }, playbackBusy: true });
  expect(slot(screen.container, 12)).toBe(6);
  await screen.rerender({ view: { ...view([floorGroup(5, [16])], 23), round: 2 } });
  expect(slot(screen.container, 16)).toBe(6);
  await screen.unmount();
  const newGame = await render(Board, { view: { ...view([floorGroup(6, [20])]), round: 2 } });
  expect(slot(newGame.container, 20)).toBe(6);
});

for (const ending of ['complete', 'skip', 'reset', 'reduced'] as const) {
  test(`실제 Playback ${ending}: final snapshot·카드/선택 ID·예약 수렴`, async () => {
    await page.viewport(390, 780);
    document.documentElement.dataset['speed'] = ending === 'reduced' ? 'instant' : 'fast';
    playback = new Playback(view(stableBefore), { viewer: 0, names: () => ['좌석0', '좌석1'] });
    const screen = await render(ReplayBoard, { playback, inputBusy: true });
    const captured = {
      ...view(stableBefore.slice(1)),
      seats: [
        {
          ...fixtures.board.states.play.seats[0],
          captured: { gwang: [0], yeol: [], tti: [], pi: [] },
        },
        fixtures.board.states.play.seats[1],
      ] as const,
    };
    playback.enqueue([{ type: 'Captured', seat: 0, to: 0, cards: [0], seq: 99 }], captured);
    await tick();
    expect(playback.busy).toBe(true);
    if (ending === 'skip') playback.skip();
    if (ending === 'reset') playback.reset(captured);
    await vi.waitFor(() => expect(playback!.busy).toBe(false));
    expect(playback.board.floor).toEqual(captured.floor);
    expect(screen.container.querySelectorAll('.floor [data-card-id="0"]')).toHaveLength(0);
    const next = {
      ...captured,
      floor: [...captured.floor, floorGroup(4, [12])],
      pending: {
        kind: 'target' as const,
        seat: 0 as const,
        source: 'flip' as const,
        card: 13,
        options: [12],
      },
    };
    playback.reset(next);
    await tick();
    expect(slot(screen.container, 12)).toBe(6);
    await screen.rerender({ inputBusy: false });
    expect(screen.container.querySelectorAll('[data-choice="target-12"]')).toHaveLength(1);
  });
}
