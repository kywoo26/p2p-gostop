// FR-40/51·UX-06/11: 진영별 수치·타이머 보존, 큰 잔액·획득 요약·상세 경계.
import { afterEach, beforeEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { fanFixture } from '../lib/layout-fixtures.ts';
import Board from './Board.svelte';
beforeEach(async () => {
  document.documentElement.dataset['speed'] = 'instant';
  await page.viewport(412, 915);
});
afterEach(() => {
  delete document.documentElement.dataset['speed'];
});
for (const state of ['play', 'target', 'gostop'] as const) {
  test(`${state}: 상대/나 획득4종·점수·타이머가 독립적으로 읽힌다`, async () => {
    const view = fanFixture(state);
    const screen = await render(Board, { view, timerSeat: 0, timerText: '남은 7초' });
    const box = (s: string) => screen.container.querySelector(s)!.getBoundingClientRect();
    expect(box('.captured-zone').bottom).toBeLessThanOrEqual(box('.opponent-hud').top);
    expect(box('.mine-hud').bottom).toBeLessThanOrEqual(box('.captured-zone.mine').top);
    expect(
      screen.container.querySelectorAll('.captured-zone .stack[data-count]:not([data-count="0"])'),
    ).toHaveLength(8);
    await expect.element(screen.getByTestId('my-score')).toHaveTextContent('7');
    await expect.element(screen.getByTestId('opponent-score')).toHaveTextContent('0');
    expect(screen.container.querySelector('.me [data-testid="decision-timer"]')?.textContent).toBe(
      '남은 7초',
    );
    expect(box('[data-testid="decision-timer"]').right).toBeLessThanOrEqual(
      box('.me .score-area').left,
    );
    expect(getComputedStyle(screen.container.querySelector('.balance')!).fontSize).toBe('24px');
  });
}
test('좌석 반전에서도 실제 수치와 월·종류 접근성 이름 유지', async () => {
  const view = fanFixture('play');
  const screen = await render(Board, { view: { ...view, viewer: 1 } });
  await expect.element(screen.getByTestId('my-score')).toHaveTextContent('0');
  await expect.element(screen.getByTestId('opponent-score')).toHaveTextContent('7');
  expect(screen.container.querySelector('[aria-label="나 고 0회"]')).not.toBeNull();
  expect(screen.container.querySelector('[aria-label="나 잔액 12,810,000냥"]')).not.toBeNull();
});
for (const width of [360, 390, 412, 430]) {
  test(`${width}: 긴 금액을 축약하고 정확한 값·이름은 보존`, async () => {
    await page.viewport(width, 840);
    const view = fanFixture('play');
    const name = '가나다라마바사아자차카타파하';
    const screen = await render(Board, {
      view: {
        ...view,
        seats: [{ ...view.seats[0], name, balance: Number.MAX_SAFE_INTEGER }, view.seats[1]],
      },
    });
    const balance = screen.container.querySelector<HTMLElement>('.me .balance')!;
    expect(balance.textContent).toBe('9007조1992억냥');
    expect(balance.getAttribute('aria-label')).toContain('9,007,199,254,740,991냥');
    expect(balance.scrollWidth).toBeLessThanOrEqual(balance.clientWidth + 1);
    expect(screen.container.querySelector('.me')?.getAttribute('aria-label')).toContain(name);
  });
}
test('문턱은 판 정보 상세에 보존하고 획득 요약은 실제 전체 장수를 유지', async () => {
  const screen = await render(Board, { view: fanFixture('play') });
  const info = screen.container.querySelector<HTMLDialogElement>('dialog[aria-label="판 정보"]')!;
  expect(info.open).toBe(false);
  info.showModal();
  expect(info.querySelectorAll('.progress')).toHaveLength(2);
  const pi = screen.container.querySelector('.captured-zone.mine [data-pile="pi"]')!;
  expect(pi.getAttribute('data-cards')).toBe('8');
  expect(pi.querySelectorAll('.card')).toHaveLength(4);
  expect(pi.getAttribute('aria-label')).toContain('8장');
  info.close();
});
