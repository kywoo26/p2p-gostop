// FR-41·46~48·NF-08 / UX-H05·UX-A01: 색/판정 경계와 승인된 preview 조건의 회귀.
import { cardId, playerView, reduce } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { toBoardView } from '../game/adapter.ts';
import { displayedHintLevel, type HintLevel } from '../game/assist.ts';
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

// CF11 / #115: 보드에 실제 표시된 기본 표식만 이력으로 기록한다.
const exclusiveState = () =>
  createScenario({
    hands: [
      [c('5열'), c('5초'), c('12열')],
      [c('10열'), c('10청')],
    ],
    floor: [c('7열')],
    captured: [[c('5피a'), c('5피b')], []],
    deck: [c('8광'), c('11광'), c('6열')],
  });

test('독점 보유: busy·끔·한 장 legal·늦은 솔로 뷰에서는 숨기고 복원 후 실제 표시만 basic 기록', async () => {
  const state = exclusiveState();
  const solo = playerView(state, 0);
  const board = toBoardView(solo, metadata);
  let usage: HintLevel = 'off';
  const onhintdisplayed = vi.fn((level: HintLevel) => {
    usage = displayedHintLevel(usage, level, true);
  });
  const onaction = vi.fn();
  const onnotice = vi.fn();
  const screen = await render(Board, {
    view: board,
    busy: true,
    onhintdisplayed,
    onaction,
    onnotice,
  });
  const cues = () => screen.container.querySelectorAll('[data-hand-cue="secured"]');
  expect(cues()).toHaveLength(0);
  expect(onhintdisplayed).not.toHaveBeenCalled();
  settings.update({ hintLevel: 'off' });
  await screen.rerender({ busy: false });
  expect(cues()).toHaveLength(0);
  expect(usage).toBe('off');
  const restricted = {
    view: {
      ...board,
      legal: board.legal.filter((action) => action.type !== 'play' || action.card !== c('5초')),
    },
  };
  // 끔 상태에서 제한 뷰를 먼저 적용해, 두 장이 합법인 중간 뷰를 실제 표시하지 않는다.
  await screen.rerender(restricted);
  expect(cues()).toHaveLength(0);
  expect(onhintdisplayed).not.toHaveBeenCalled();
  settings.update({ hintLevel: 'detail' });
  await screen.rerender(restricted);
  expect(cues()).toHaveLength(0);
  expect(onhintdisplayed).not.toHaveBeenCalled();
  await screen.rerender({ view: board, soloPlayerView: { ...solo, eventSeq: solo.eventSeq + 1 } });
  expect(cues()).toHaveLength(0);
  expect(onhintdisplayed).not.toHaveBeenCalled();
  await screen.rerender({
    view: JSON.parse(JSON.stringify(board)),
    soloPlayerView: JSON.parse(JSON.stringify(solo)),
  });
  await vi.waitFor(() => expect(cues()).toHaveLength(2));
  expect([...cues()].map((el) => el.getAttribute('aria-label'))).toEqual([
    '5월 열끗, 독점 보유 짝, 내기',
    '5월 초단, 독점 보유 짝, 내기',
  ]);
  await vi.waitFor(() => expect(onhintdisplayed).toHaveBeenCalledWith('basic'));
  expect(onhintdisplayed.mock.calls.every(([level]) => level === 'basic')).toBe(true);
  expect(usage).toBe('basic');
  expect(onaction).not.toHaveBeenCalled();
  expect(onnotice).not.toHaveBeenCalled();
  expect(screen.container.querySelectorAll('[data-hand-action="heldPair"]')).toHaveLength(0);
  for (const root of screen.container.querySelectorAll(
    '.opponent-hud, [data-anchor="opp-hand"], [aria-live], [role="status"], [role="alert"]',
  )) {
    expect(root.querySelector('[data-hand-cue]')).toBeNull();
    expect(root.textContent).not.toContain('독점 보유');
    expect(root.outerHTML).not.toContain('독점 보유');
  }
  onhintdisplayed.mockClear();
  await screen.rerender({ busy: true });
  expect(cues()).toHaveLength(0);
  expect(onhintdisplayed).not.toHaveBeenCalled();
  expect(usage).toBe('basic');
});

test('독점 보유 실제 내기 후 상대 차례 제거, 다음 자기 차례는 확정 획득 이름으로 재계산', async () => {
  const state = exclusiveState();
  const screen = await render(Board, { view: toBoardView(playerView(state, 0), metadata) });
  expect(screen.container.querySelectorAll('[data-hand-cue="secured"]')).toHaveLength(2);
  const first = reduce(state, { type: 'play', seat: 0, card: c('5열') });
  if (!first.ok) throw new Error(first.message);
  await screen.rerender({ view: toBoardView(playerView(first.state, 0), metadata) });
  expect(screen.container.querySelector('[data-hand-cue="secured"]')).toBeNull();
  expect(
    screen.container.querySelector(`[data-slot="${c('5초')}"]`)?.getAttribute('aria-label'),
  ).not.toContain('독점 보유');
  const next = reduce(first.state, { type: 'play', seat: 1, card: c('10열') });
  if (!next.ok) throw new Error(next.message);
  const board = toBoardView(playerView(next.state, 0), metadata);
  await screen.rerender({ view: board });
  const remaining = screen.container.querySelector(`[data-slot="${c('5초')}"]`)!;
  expect(remaining.getAttribute('data-hand-cue')).toBe('secured');
  expect(remaining.getAttribute('aria-label')).toContain('확정 획득 짝');
  expect(remaining.getAttribute('aria-label')).not.toContain('독점 보유');
  // 종료 공개 뷰는 손패가 남아 있어도 활성 표식이나 이력을 추가하지 않는다.
  const onhintdisplayed = vi.fn();
  await screen.rerender({
    view: { ...board, phase: 'end', pending: null, playable: [], legal: [] },
    onhintdisplayed,
  });
  expect(screen.container.querySelector('[data-hand-cue]')).toBeNull();
  expect(onhintdisplayed).not.toHaveBeenCalled();
});

test('독점 보유의 숨은 손패/더미 교환은 실제 DOM·ARIA 서명과 표시 등급이 같다', async () => {
  const first = exclusiveState();
  const second = createScenario({
    hands: [first.seats[0].hand, [c('8광'), c('10청')]],
    floor: [c('7열')],
    captured: [[c('5피a'), c('5피b')], []],
    deck: [c('10열'), c('11광'), c('6열')],
  });
  const onhintdisplayed = vi.fn();
  const onnotice = vi.fn();
  const screen = await render(Board, {
    view: toBoardView(playerView(first, 0), metadata),
    onhintdisplayed,
    onnotice,
  });
  const signature = () =>
    [...screen.container.querySelectorAll('[aria-label], [data-hand-cue], [data-hand-action]')].map(
      (el) => ({
        label: el.getAttribute('aria-label'),
        text: el.textContent,
        cue: el.getAttribute('data-hand-cue'),
        action: el.getAttribute('data-hand-action'),
      }),
    );
  const before = signature();
  await screen.rerender({ view: toBoardView(playerView(second, 0), metadata) });
  expect(signature()).toEqual(before);
  expect(screen.container.querySelectorAll('[data-hand-cue="secured"]')).toHaveLength(2);
  expect(onhintdisplayed.mock.calls.every(([level]) => level === 'basic')).toBe(true);
  expect(onnotice).not.toHaveBeenCalled();
});
