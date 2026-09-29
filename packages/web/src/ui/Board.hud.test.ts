// FR-40 / UX-H01~04. 핵심 수치와 메뉴 예약, 선택 패널의 현황판 가림 회귀.
import { afterEach, beforeEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { fixtures } from '../lib/fixtures.ts';
import Board from './Board.svelte';

// 이동 중 사각형이 아니라 최종 HUD 배치를 검증한다. 애니메이션 계약은 기존 테스트 소유.
let previousSpeed: string | undefined;
beforeEach(() => {
  previousSpeed = document.documentElement.dataset['speed'];
  document.documentElement.dataset['speed'] = 'instant';
});
afterEach(() => {
  if (previousSpeed === undefined) delete document.documentElement.dataset['speed'];
  else document.documentElement.dataset['speed'] = previousSpeed;
});

const { play, target, goStop } = fixtures.board.states;
const intersects = (a: DOMRect, b: DOMRect) =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
  Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

for (const [label, view] of Object.entries({ play, target, goStop })) {
  test(`HUD ${label}: 412×915 메뉴 예약·점수·현황판·입력 무가림`, async () => {
    await page.viewport(412, 915);
    const screen = await render(Board, { view });
    const reserved = screen.getByTestId('menu-reserved').element().getBoundingClientRect();
    const scoreboard = screen.container.querySelector('.scoreboard')!.getBoundingClientRect();
    expect(scoreboard.height).toBe(60);
    expect(reserved.width).toBeGreaterThanOrEqual(48);
    expect(reserved.height).toBeGreaterThanOrEqual(48);
    expect(reserved.left - scoreboard.right).toBeGreaterThanOrEqual(8);
    expect(reserved.right).toBeLessThanOrEqual(412 - 8);
    expect(reserved.top).toBeGreaterThanOrEqual(8);
    const areas = [
      ...screen.container.querySelectorAll('.scoreboard, .captured-zone, .floor, .hand, .prompt'),
    ];
    for (const [i, a] of areas.entries()) {
      const rect = a.getBoundingClientRect();
      expect(rect.bottom).toBeLessThanOrEqual(915);
      for (const b of areas.slice(i + 1))
        expect(intersects(rect, b.getBoundingClientRect())).toBe(false);
    }
    expect(getComputedStyle(screen.container.querySelector('.balance')!).fontSize).toBe('14px');
    await expect
      .element(screen.getByTestId('my-score'))
      .toHaveTextContent(String(view.seats[view.viewer].score));
    const scoreCells = [...screen.container.querySelectorAll('.score')].map((el) =>
      el.getBoundingClientRect(),
    );
    expect(scoreCells[0]!.left).toBe(scoreCells[1]!.left);
  });
}

test('좌석 1에서도 내/상대 수치, 미제공 배수·0고·0잔액이 정확하다', async () => {
  await page.viewport(412, 915);
  const screen = await render(Board, {
    view: {
      ...play,
      viewer: 1,
      seats: [play.seats[0], { ...play.seats[1], score: 0, goCount: 0, balance: 0 }],
    },
  });
  await expect.element(screen.getByTestId('my-score')).toHaveTextContent('0');
  await expect
    .element(screen.getByTestId('opponent-score'))
    .toHaveTextContent(String(play.seats[0].score));
  expect(screen.container.querySelector('[aria-label="나 잔액 0냥"]')).not.toBeNull();
  expect(screen.container.querySelector('[aria-label="나 고 0회"]')).not.toBeNull();
  expect(screen.container.querySelector('[aria-label="상대 배수 미제공"]')?.textContent).toBe('—');
  expect(screen.container.querySelector('.scoreboard')?.textContent).not.toContain('null');
});

test('긴 이름·큰 잔액은 숫자나 메뉴를 덮지 않고, 전체 이름을 보존한다', async () => {
  await page.viewport(360, 780);
  const name = '가나다라마바사아자차카타파하';
  const screen = await render(Board, {
    view: { ...play, seats: [{ ...play.seats[0], name, balance: 999_999_999 }, play.seats[1]] },
  });
  expect(screen.container.querySelector('.me')?.getAttribute('aria-label')).toContain(name);
  const reservation = screen.getByTestId('menu-reserved').element().getBoundingClientRect();
  const cells = [...screen.container.querySelectorAll('.me > *')];
  for (const [i, a] of cells.entries()) {
    expect(intersects(a.getBoundingClientRect(), reservation)).toBe(false);
    for (const b of cells.slice(i + 1))
      expect(intersects(a.getBoundingClientRect(), b.getBoundingClientRect())).toBe(false);
  }
  const scoreboard = screen.container.querySelector('.scoreboard')!;
  expect(scoreboard.scrollWidth).toBeLessThanOrEqual(scoreboard.clientWidth + 1);
});

test('배수 의미는 스톱 선택 여부를 따라 바뀌며 숫자·현황은 busy에도 유지한다', async () => {
  const screen = await render(Board, { view: play, busy: true, thinking: true });
  expect(screen.container.querySelector('.me .multiplier')?.getAttribute('aria-label')).toContain(
    '누적 배수, 박 제외',
  );
  expect(screen.container.querySelectorAll('[role="status"]')).toHaveLength(1);
  await expect.element(screen.getByText('상대 차례 · 생각 중')).toBeVisible();
  await screen.rerender({ view: goStop, busy: false, thinking: false });
  expect(screen.container.querySelector('.me .multiplier')?.getAttribute('aria-label')).toContain(
    '스톱 배수',
  );
  const progress = screen.getByRole('list', { name: '내 족보 진행도' });
  await expect.element(progress).toBeVisible();
});

test('첫 족보 기준 미달·한 장 남음·달성 칩은 공개 획득패를 따라 되돌아간다', async () => {
  await page.viewport(412, 915);
  const screen = await render(Board, { view: play });
  const mine = () => screen.getByRole('list', { name: '내 족보 진행도' }).element();
  expect(mine().querySelector('[data-stat="gwang"]')?.getAttribute('data-state')).toBe(
    'incomplete',
  );
  expect(mine().querySelector('[data-stat="godori"]')?.getAttribute('data-state')).toBe('complete');
  expect(mine().querySelector('[data-stat="dan"]')?.getAttribute('data-state')).toBe('complete');
  const captured = {
    ...play.seats[0].captured,
    gwang: [0, 8],
    pi: [3, 7, 11, 15, 19, 23, 27, 31, 35],
  };
  await screen.rerender({
    view: { ...play, seats: [{ ...play.seats[0], captured }, play.seats[1]] },
  });
  expect(mine().querySelector('[data-stat="gwang"]')?.getAttribute('aria-label')).toContain(
    '1장 남음',
  );
  expect(mine().querySelector('[data-stat="pi"]')?.getAttribute('aria-label')).toContain(
    '1피 남음',
  );
  expect(mine().querySelector('[data-stat="pi"]')?.getAttribute('data-state')).toBe('near');
  await screen.rerender({ view: play });
  expect(mine().querySelector('[data-stat="pi"]')?.getAttribute('data-state')).toBe('incomplete');
  expect(screen.container.querySelector('.me .identity')?.textContent?.trim()).toBe('나');
  const theirs = screen.getByRole('list', { name: '상대 족보 진행도' }).element();
  for (const key of ['gwang', 'godori', 'dan', 'pi']) {
    const a = mine().querySelector(`[data-stat="${key}"]`)!.getBoundingClientRect();
    const b = theirs.querySelector(`[data-stat="${key}"]`)!.getBoundingClientRect();
    expect(a.left).toBe(b.left);
    expect(a.width).toBe(b.width);
  }
});

// UX-H01a: HUD 자체의 높이 상한과 추가 높이 회수만 검증한다.
// #46/#47의 12무더기·손패10장·6행 최소 화면 fixture 완료를 대신하지 않는다.
for (const width of [360, 390, 430]) {
  for (const [label, view] of Object.entries({ target, goStop })) {
    test(`${width}px ${label}: 긴 금액 HUD 84px·공통 열·바닥 높이 보존`, async () => {
      await page.viewport(width, 915);
      const screen = await render(Board, { view });
      const box = (selector: string) =>
        screen.container.querySelector(selector)!.getBoundingClientRect();
      expect(box('.scoreboard').height).toBe(width >= 410 ? 60 : 56);
      const floorHeight = box('.center').height;
      const promptHeight = box('.prompt').height;
      const name = '긴 이름 가나다라 마바사아 자차카타';
      await screen.rerender({
        view: {
          ...view,
          seats: [
            { ...view.seats[0], name, balance: Number.MAX_SAFE_INTEGER },
            { ...view.seats[1], balance: Number.MAX_SAFE_INTEGER },
          ],
        },
      });
      expect(box('.scoreboard').height).toBe(84);
      expect(box('.center').height).toBeCloseTo(floorHeight, 1);
      expect(promptHeight - box('.prompt').height).toBe(width >= 410 ? 24 : 28);
      const reserved = box('.menu-reserved');
      for (const field of ['score', 'go', 'multiplier', 'balance']) {
        const cells = [...screen.container.querySelectorAll(`.seat-bar .${field}`)];
        expect(cells[0]!.getBoundingClientRect().x).toBe(cells[1]!.getBoundingClientRect().x);
        for (const cell of cells) {
          expect(cell.scrollWidth, `${field}: ${cell.textContent}`).toBeLessThanOrEqual(
            cell.clientWidth,
          );
          expect(intersects(cell.getBoundingClientRect(), reserved)).toBe(false);
        }
      }
      expect(screen.container.querySelector('.me')?.getAttribute('aria-label')).toContain(name);
      expect(screen.container.querySelector('.me .balance')?.textContent).toBe(
        '9,007,199,254,740,991냥',
      );
      for (const zone of screen.container.querySelectorAll('.captured-zone'))
        expect(intersects(box('.prompt'), zone.getBoundingClientRect())).toBe(false);
      for (const button of screen.container.querySelectorAll('.prompt button'))
        expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
    });
  }
}
