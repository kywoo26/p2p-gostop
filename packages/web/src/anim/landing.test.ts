// UX-15~17 / #200: 실제 DOM 크기·회전·원본 선택 위치로 관계 영역을 검증한다.
import { afterEach, expect, test } from 'vitest';
import { LandingScene } from './landing.ts';

let root: HTMLElement;
let scene: LandingScene;
function stage() {
  root = document.createElement('div');
  root.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:400px;';
  const table = document.createElement('div');
  table.className = 'table';
  table.style.cssText = 'position:absolute;inset:0;';
  root.append(table);
  document.body.append(root);
  scene = new LandingScene(root);
  return table;
}
function card(parent: HTMLElement, id: number, x: number, y: number, width = 48, angle = 0) {
  const group = document.createElement('div');
  group.setAttribute('aria-label', '바닥');
  group.style.cssText = `position:absolute;left:${x}px;top:${y}px;rotate:${angle}deg;`;
  const el = document.createElement('span');
  el.dataset['cardId'] = String(id);
  el.style.cssText = `display:block;width:${width}px;height:${width * 1.5}px;outline:1px solid black;`;
  group.append(el);
  parent.append(group);
  return el;
}
function intersects(a: DOMRectReadOnly, b: DOMRectReadOnly, pad = 2) {
  return (
    a.left - pad < b.right &&
    a.right + pad > b.left &&
    a.top - pad < b.bottom &&
    a.bottom + pad > b.top
  );
}
afterEach(() => {
  scene?.dispose();
  root?.remove();
});

test.each([48, 42])('다른 월·가까운 더미·경계를 피한다: 실제 폭 %s', (width) => {
  const table = stage();
  const target = card(table, 8, 184, 180, width);
  const other = card(table, 31, 241, 180, width);
  const deck = document.createElement('div');
  deck.className = 'deck-stack';
  deck.style.cssText = 'position:absolute;left:110px;top:110px;width:48px;height:72px;';
  table.append(deck);
  const before = target.getBoundingClientRect();
  const to = scene.contactPose(8)!;
  expect(to).toBeDefined();
  expect(intersects(to.rect, other.getBoundingClientRect())).toBe(false);
  expect(intersects(to.rect, deck.getBoundingClientRect())).toBe(false);
  expect(to.rect.left).toBeGreaterThan(0);
  expect(Math.abs(to.rect.x - before.x) + Math.abs(to.rect.y - before.y)).toBeGreaterThan(4);
  expect(Math.abs(to.rect.x - before.x)).toBeLessThan(width);
  expect(scene.pose(8)?.rect.x).toBe(before.x);
});

test('회전 AABB와 선택 원본 before 위치를 재적용하거나 settled top으로 덮지 않는다', () => {
  const table = stage();
  const target = card(table, 13, 160, 180, 42, 12);
  const before = target.getBoundingClientRect();
  scene.reserve(13);
  target.parentElement!.style.left = '210px';
  card(table, 12, 215, 190, 42, 12);
  const to = scene.contactPose(13)!;
  expect(to.rect.width).toBeCloseTo(before.width, 5);
  expect(to.rect.height).toBeCloseTo(before.height, 5);
  expect(scene.pose(13)?.rect.x).toBe(before.x);
});

test('유한 후보가 모두 막히면 침범 착지를 만들지 않는다', () => {
  const table = stage();
  card(table, 8, 160, 180);
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.style.cssText = 'position:absolute;inset:0;';
  table.append(hud);
  expect(scene.contactPose(8)).toBeUndefined();
});

test('staging 전용 shadow를 새 부모의 카드 paint에 중복 적용하지 않는다', () => {
  const table = stage();
  const style = document.createElement('style');
  style.textContent = '.staging > span {box-shadow:0 6px 16px black}';
  root.append(style);
  card(table, 31, 340, 180);
  const staging = document.createElement('div');
  staging.className = 'staging';
  table.append(staging);
  const incoming = document.createElement('span');
  incoming.dataset['cardId'] = '30';
  incoming.style.cssText = 'display:block;width:48px;height:72px;outline:1px solid black;';
  staging.append(incoming);
  scene.reserve(30);
  expect(scene.contactPose(31, 30)).toBeDefined();
  expect(
    getComputedStyle(root.querySelector<HTMLElement>('[data-motion-card-id="30"]')!).boxShadow,
  ).toBe('none');
});
