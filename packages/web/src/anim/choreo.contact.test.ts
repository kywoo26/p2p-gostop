// #252: 공개 replay 입력과 실제 DOM/WAAPI로 contact 소유권·원본 fallback을 구분한다.
// 엔진 판정/시간/WAAPI를 대체하지 않고, production pair/실제 paint 검증과 분모를 분리한다.
import { getCard, type CardId, type EngineEvent, type Seat } from '@p2p-gostop/engine';
import { afterEach, expect, test } from 'vitest';
import { applyEvent, snap, type DisplayBoard } from '../game/display.ts';
import { fixtures } from '../lib/fixtures.ts';
import { replay, skip, type ReplayHost } from './choreo.ts';
import { LandingScene } from './landing.ts';

const priorSpeed = document.documentElement.dataset['speed'];
let root: HTMLDivElement | undefined;
let scene: LandingScene | undefined;
let pending: Promise<DisplayBoard> | undefined;

function board(mine = false, contact = true): DisplayBoard {
  const base = snap(fixtures.board.states.play);
  const month = getCard(15).month;
  if (month === null) throw new Error('공개 target 월 없음');
  const empty = () => ({ gwang: [], yeol: [], tti: [], pi: [] });
  return {
    ...base,
    viewer: 0,
    floor: contact ? [{ month, cards: [15], kind: 'loose', owner: null }] : [],
    staging: [],
    highlight: [],
    pending: null,
    playable: [],
    seats: [
      { ...base.seats[0], hand: mine ? [12] : [], handCount: mine ? 1 : 0, captured: empty() },
      { ...base.seats[1], hand: null, handCount: mine ? 0 : 1, captured: empty() },
    ],
  };
}

function events(seat: Seat = 1): EngineEvent[] {
  // 관측된 공개 카드 전이의 재생 입력. 금액/점수/규칙 기대값은 만들지 않는다.
  return [
    { type: 'CardPlayed', seq: 34, seat, cards: [12], bonus: false },
    { type: 'CardFlipped', seq: 35, seat, cards: [27] },
    { type: 'Matched', seq: 36, seat, cards: [12, 15], source: 'play', target: 15 },
    { type: 'Placed', seq: 37, seat, cards: [27], source: 'flip' },
    { type: 'Captured', seq: 38, seat, cards: [15, 12], to: seat },
  ];
}

function mount(from: DisplayBoard, blocked = false) {
  document.documentElement.dataset['speed'] = 'normal';
  root = document.createElement('div');
  root.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:400px;';
  const table = document.createElement('div');
  table.className = 'table';
  table.style.cssText = 'position:absolute;inset:0;';
  root.append(table);
  document.body.append(root);
  const currentRoot = root;
  const zone = (name: string, x: number, y: number, width = 42, height = 68.375) => {
    const el = document.createElement('div');
    el.dataset['anchor'] = name;
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;`;
    table.append(el);
    return el;
  };
  zone('opp-hand', 20, 20, 80, 70);
  zone('deck', 280, 120);
  const floor = zone('floor', 0, 0, 400, 400);
  floor.setAttribute('aria-label', '바닥');
  const staging = zone('staging', 280, 120);
  staging.className = 'staging';
  const hand = zone('hand', 60, 300);
  hand.setAttribute('aria-label', '내 손패');
  const captured = [zone('captured0', 80, 300), zone('captured1', 80, 20)];
  captured.forEach((el) => (el.className = 'captured-zone'));
  if (blocked) {
    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.style.cssText = 'position:absolute;inset:0;';
    table.append(hud);
  }
  const card = (parent: HTMLElement, id: CardId, x = 0, y = 0) => {
    const el = document.createElement('span');
    el.dataset['cardId'] = String(id);
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:42px;height:68.375px;`;
    const inner = document.createElement('span');
    inner.className = 'inner';
    inner.style.cssText = 'position:absolute;inset:0;';
    const back = document.createElement('span');
    back.className = 'back';
    back.style.cssText = 'position:absolute;inset:0;opacity:0;';
    inner.append(back);
    el.append(inner);
    parent.append(el);
  };
  const render = (view: DisplayBoard) => {
    for (const el of [floor, staging, hand, ...captured]) el.replaceChildren();
    for (const group of view.floor)
      for (const id of group.cards)
        card(floor, id, id === 15 ? 160 : id === 12 ? 170 : 280, id === 12 ? 190 : 180);
    for (const id of view.staging) card(staging, id);
    for (const id of view.seats[0].hand ?? []) card(hand, id);
    for (const seat of [0, 1] as const) {
      const parent = captured[seat];
      if (!parent) throw new Error('획득 DOM 없음');
      const pile = view.seats[seat].captured;
      for (const id of [...pile.gwang, ...pile.yeol, ...pile.tti, ...pile.pi])
        card(parent, id, id === 12 ? 12 : 0);
    }
  };
  render(from);
  scene = new LandingScene(currentRoot);
  const currentScene = scene;
  let current = true;
  const commits: DisplayBoard[] = [];
  const emitted: EngineEvent[] = [];
  const host: ReplayHost = {
    root: currentRoot,
    async commit(view) {
      commits.push(view);
      render(view);
      await Promise.resolve(); // DOM 커밋 뒤 microtask 경계만 제공하며 시간을 지연하지 않는다.
    },
    onEvent(event) {
      emitted.push(event);
    },
    isCurrent: () => current,
  };
  return {
    root: currentRoot,
    commits,
    emitted,
    native: () => currentRoot.querySelector<HTMLElement>('[data-card-id="12"]'),
    ghost: () => currentRoot.querySelector<HTMLElement>('[data-motion-card-id="12"]'),
    run(input: readonly EngineEvent[]) {
      pending = replay(host, from, input, { scene: currentScene });
      return pending;
    },
    dispose() {
      current = false;
      currentScene.dispose();
    },
  };
}

function moving(el: HTMLElement | null) {
  return el?.getAnimations().some((a) => a.playState === 'running' || a.pending) ?? false;
}

function final(expected: DisplayBoard, actual: DisplayBoard) {
  expect(actual).toEqual(expected);
  expect(root?.querySelector('[data-motion-card-id="12"]')).toBeNull();
  expect(root?.querySelector('[data-landing-scene]')).toBeNull();
  expect(
    root?.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' || a.pending),
  ).toHaveLength(0);
  expect(
    [...(root?.querySelectorAll<HTMLElement>('[data-card-id]') ?? [])].some(
      (el) => el.style.visibility === 'hidden',
    ),
  ).toBe(false);
}

afterEach(async () => {
  scene?.dispose();
  if (root) skip(root);
  try {
    await pending;
  } finally {
    root?.remove();
    root = undefined;
    scene = undefined;
    pending = undefined;
    if (priorSpeed === undefined) delete document.documentElement.dataset['speed'];
    else document.documentElement.dataset['speed'] = priorSpeed;
  }
});

test('새 상대 안전 contact는 native WAAPI0·ghost 앞면 연속 이동 뒤 공개 final로 끝난다', async () => {
  const from = board();
  const run = mount(from);
  const input = events();
  const result = run.run(input);
  await expect.poll(() => moving(run.ghost())).toBe(true);
  expect(run.native()?.style.visibility).toBe('hidden');
  expect(run.native()?.getAnimations({ subtree: true })).toHaveLength(0);
  const ghost = run.ghost();
  expect(ghost).not.toBeNull();
  const before = ghost!.getBoundingClientRect();
  await expect
    .poll(() => run.ghost() === ghost && ghost!.getBoundingClientRect().y !== before.y)
    .toBe(true);
  expect(run.ghost()).toBe(ghost);
  expect(getComputedStyle(ghost!.querySelector<HTMLElement>('.back')!).opacity).toBe('0');
  expect(ghost!.querySelector('.inner')!.getAnimations({ subtree: true })).toHaveLength(0);
  final(input.reduce(applyEvent, from), await result);
  expect(run.emitted).toEqual(input);
});

test('막힌 새 상대 contact는 native fallback 이동·reveal을 유지하고 가림을 남기지 않는다', async () => {
  const from = board();
  const run = mount(from, true);
  const input = events();
  const result = run.run(input);
  await expect.poll(() => moving(run.native())).toBe(true);
  expect(run.native()?.style.visibility).toBe('');
  expect(run.native()?.getAnimations({ subtree: true })).toHaveLength(3);
  expect(run.ghost()).toBeNull();
  final(input.reduce(applyEvent, from), await result);
  expect(run.emitted).toEqual(input);
});

test('내패 contact는 기존 hand ghost·native WAAPI0 경로를 유지한다', async () => {
  const from = board(true);
  const run = mount(from);
  const input = events(0);
  const result = run.run(input);
  await expect.poll(() => moving(run.ghost())).toBe(true);
  expect(run.native()?.style.visibility).toBe('hidden');
  expect(run.native()?.getAnimations({ subtree: true })).toHaveLength(0);
  expect(run.ghost()!.querySelector('.inner')!.getAnimations({ subtree: true })).toHaveLength(0);
  final(input.reduce(applyEvent, from), await result);
});

test('상대 no-contact는 기존 native 이동·reveal을 유지한다', async () => {
  const from = board(false, false);
  const run = mount(from);
  const input = events().slice(0, 1);
  const result = run.run(input);
  await expect.poll(() => moving(run.native())).toBe(true);
  expect(run.native()?.style.visibility).toBe('');
  expect(run.native()?.getAnimations({ subtree: true })).toHaveLength(3);
  expect(run.ghost()).toBeNull();
  final(input.reduce(applyEvent, from), await result);
});

test('새 상대 안전 contact 중 skip은 원시간표를 건너뛰고 final·가림·ghost를 마감한다', async () => {
  const from = board();
  const run = mount(from);
  const input = events();
  const result = run.run(input);
  await expect.poll(() => moving(run.ghost())).toBe(true);
  skip(run.root);
  final(input.reduce(applyEvent, from), await result);
  expect(run.emitted).toEqual(input);
});

test('새 상대 안전 contact 중 generation dispose는 후속 이벤트·commit 없이 원본을 복원한다', async () => {
  const from = board();
  const run = mount(from);
  const input = events();
  const result = run.run(input);
  await expect.poll(() => moving(run.ghost())).toBe(true);
  run.dispose();
  const played = input[0];
  if (!played) throw new Error('공개 내기 입력 없음');
  final(applyEvent(from, played), await result);
  expect(run.emitted).toEqual([played]);
  expect(run.commits).toEqual([applyEvent(from, played)]);
});
