// #245 · FR-40/42/46/47 · NF-08: 피 가치와 물리 장수의 실제 Board 표시를 구별한다.
// 기대값은 rules-commercial §12 R1/S4/S5에서 손으로 도출했다. 사진 복원·합법 history fixture가 아니다.
import { afterEach, beforeEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { BoardView, CapturedView } from '../lib/view-types.ts';
import { fixtures } from '../lib/fixtures.ts';
import { settings } from '../settings/settings.svelte.ts';
import { cardSrc } from './cards.ts';
import Board from './Board.svelte';
import '../styles/skin-fan.css';

const empty: CapturedView = { gwang: [], yeol: [], tti: [], pi: [] };
const ordinary = [2, 3, 6, 7, 10, 11, 14, 15, 18, 19];
const mixed = [2, 3, 6, 7, 10, 11, 14, 43, 48, 50];
const originalSettings = settings.value;
const cases = [
  {
    title: '#245 같은 값: 10피와 실제 10장을 함께 표시한다',
    captured: { ...empty, pi: ordinary },
    value: 10,
    cards: 10,
    score: 1,
    gukjinAsPi: false,
    viewer: 0,
    hintLevel: 'basic',
    shown: [14, 15, 18, 19],
  },
  {
    title: '#245 다른 단위: 14피와 실제 10장을 함께 표시한다',
    captured: { ...empty, pi: mixed },
    // 일반7 + 쌍피2 + 보너스2 + 보너스3 = 14피, S4 피 점수5. 사진의 5점 정답 판정이 아니다.
    value: 14,
    cards: 10,
    score: 5,
    gukjinAsPi: false,
    viewer: 0,
    hintLevel: 'basic',
    shown: [14, 43, 48, 50],
  },
  {
    title: '#245 명시 국진: 10피와 실제 9장 및 쌍피 역할을 보존한다',
    captured: { ...empty, yeol: [32], pi: ordinary.slice(0, 8) },
    // 일반8 + 국진쌍피2 = 10피, 실제 피 그룹은9장. 국진은 상태의 열끗에 저장된다.
    value: 10,
    cards: 9,
    score: 1,
    gukjinAsPi: true,
    viewer: 0,
    hintLevel: 'basic',
    shown: [11, 14, 15, 32],
  },
  {
    title: '#245 반대 좌석·힌트 끔에도 14피와 실제 10장을 유지한다',
    captured: { ...empty, pi: mixed },
    value: 14,
    cards: 10,
    score: 5,
    gukjinAsPi: false,
    viewer: 1,
    hintLevel: 'off',
    shown: [14, 43, 48, 50],
  },
] as const;

beforeEach(async () => {
  document.documentElement.dataset['speed'] = 'instant';
  await page.viewport(390, 734);
});
afterEach(() => {
  settings.update(originalSettings);
  delete document.documentElement.dataset['speed'];
});

const rect = (element: Pick<Element, 'getBoundingClientRect'>) => {
  const r = element.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
};
const px = (value: string) => (value.endsWith('px') ? Number.parseFloat(value) : Number.NaN);

for (const c of cases) {
  test(c.title, async ({ task }) => {
    settings.update({ hintLevel: c.hintLevel });
    const base = fixtures.board.states.play;
    const view: BoardView = {
      ...base,
      viewer: c.viewer,
      floor: [],
      pending: null,
      playable: [],
      legal: [],
      seats: [
        {
          ...base.seats[0],
          name: '좌석0',
          hand: c.viewer === 0 ? [] : null,
          handCount: 0,
          captured: c.captured,
          gukjinAsPi: c.gukjinAsPi,
          score: c.score,
          progress: { gwang: 0, godori: 0, dan: 0, pi: c.value },
        },
        {
          ...base.seats[1],
          name: '좌석1',
          hand: c.viewer === 1 ? [] : null,
          handCount: 0,
          captured: empty,
          gukjinAsPi: false,
          score: 0,
          progress: { gwang: 0, godori: 0, dan: 0, pi: 0 },
        },
      ],
    };
    const screen = await render(Board, { view });
    // 텍스트 측정의 준비 경계일 뿐 제품의 준비 계약·실기기 수용에 쓰지 않는다.
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const mine = c.viewer === 0;
    const zone = screen.container.querySelector(mine ? '.captured-zone.mine' : '.captured-zone')!;
    const pile = zone.querySelector('[data-pile="pi"]')!;
    const header = pile.querySelector('.name')!;
    const value = header.querySelector<HTMLElement>('.pi-value')!;
    const stack = pile.querySelector<HTMLElement>('.stack')!;
    const valueFontWeight = getComputedStyle(value).fontWeight;
    const cards = [...stack.querySelectorAll<HTMLElement>('[data-card-id]')];
    const badge = getComputedStyle(stack, '::after');
    const stackStyle = getComputedStyle(stack);
    const stackBounds = rect(stack);
    const pileBounds = rect(pile);
    const badgeEdges =
      px(badge.paddingLeft) +
      px(badge.paddingRight) +
      px(badge.borderLeftWidth) +
      px(badge.borderRightWidth);
    // CSSOM의 used width는 box-sizing의 폭이다. pseudo DOMRect나 글리프 경계는 아니다.
    const badgeWidth = px(badge.width);
    const badgeBorderWidth = badgeWidth + (badge.boxSizing === 'border-box' ? 0 : badgeEdges);
    const badgeContentWidth = badgeBorderWidth - badgeEdges;
    const badgeRight =
      stackBounds.right - px(stackStyle.borderRightWidth) - px(badge.right) - px(badge.marginRight);
    const badgeLeft = badgeRight - badgeBorderWidth;
    const aria = `피 가치 ${c.value}피, 실제 ${c.cards}장${c.gukjinAsPi ? ', 국진 쌍피 포함' : ''}`;
    const allPiIds = [...c.captured.pi, ...(c.gukjinAsPi ? [32] : [])];
    const fullPile = screen.container.querySelectorAll('.board-info .info-cards')[mine ? 7 : 3]!;
    const fullCardSources = [...fullPile.querySelectorAll('img')].map((el) =>
      el.getAttribute('src'),
    );
    const headerBounds = rect(header);
    const range = document.createRange();
    range.selectNodeContents(value);
    const textBounds = rect(range);
    const cardBounds = cards.map(rect);
    // 실패한 assertion도 관측 좌표를 남기도록 검증 전에 저장한다.
    (task.meta as Record<string, unknown>)['pi245Geometry'] = {
      fixture: 'constructed presentation counts; not photographed state or legal history',
      viewport: [390, 734],
      preparation: 'fonts.ready + 2RAF for text geometry only',
      viewer: c.viewer,
      hintLevel: c.hintLevel,
      expected: { value: c.value, cards: c.cards, gukjinAsPi: c.gukjinAsPi },
      aria: pile.getAttribute('aria-label'),
      valueFontWeight,
      badgeContent: badge.content,
      badgeBox: {
        width: badge.width,
        minWidth: badge.minWidth,
        boxSizing: badge.boxSizing,
        paddingLeft: badge.paddingLeft,
        paddingRight: badge.paddingRight,
        borderLeftWidth: badge.borderLeftWidth,
        borderRightWidth: badge.borderRightWidth,
        position: badge.position,
        right: badge.right,
        marginRight: badge.marginRight,
        stackBorderRightWidth: stackStyle.borderRightWidth,
        overflowX: badge.overflowX,
        whiteSpace: badge.whiteSpace,
        textOverflow: badge.textOverflow,
        borderBoxWidth: badgeBorderWidth,
        contentBoxWidth: badgeContentWidth,
        left: badgeLeft,
        rightEdge: badgeRight,
        limitation: 'CSSOM-derived box fit only; no pseudo glyph Range or raster clipping proof',
      },
      header: headerBounds,
      text: textBounds,
      stack: stackBounds,
      pile: pileBounds,
      cards: cards.map((element, i) => ({
        id: Number(element.dataset['cardId']),
        ...cardBounds[i],
      })),
      fullPiIds: allPiIds,
      fullCardSources,
    };

    // metadata가 아니라 현재 CSS 가시성과 양수 text bounds를 함께 검사한다.
    await expect.element(value).toBeVisible();
    await expect.element(stack).toBeVisible();
    expect(value.textContent).toBe(`${c.value}피`);
    expect(valueFontWeight).toBe('400');
    expect(pile.getAttribute('aria-label')).toBe(aria);
    expect(pile.getAttribute('data-cards')).toBe(String(c.cards));
    expect(badge.content.replace(/["'\s]/g, '')).toBe(`${c.cards}장`);
    expect(badge.display).not.toBe('none');
    expect(badge.visibility).toBe('visible');
    expect(badge.height).toBe('20px');
    expect(['border-box', 'content-box']).toContain(badge.boxSizing);
    expect(badge.position).toBe('absolute');
    expect(Number.isFinite(badgeBorderWidth)).toBe(true);
    expect(Number.isFinite(badgeLeft)).toBe(true);
    expect(Number.isFinite(badgeRight)).toBe(true);
    expect(badgeContentWidth).toBeGreaterThan(0);
    expect(badgeLeft).toBeGreaterThanOrEqual(stackBounds.x);
    expect(badgeRight).toBeLessThanOrEqual(stackBounds.right);
    expect(badgeLeft).toBeGreaterThanOrEqual(pileBounds.x);
    expect(badgeRight).toBeLessThanOrEqual(pileBounds.right);

    expect(cards.map((el) => Number(el.dataset['cardId']))).toEqual(c.shown);
    expect(cards).toHaveLength(4);
    expect(fullCardSources).toEqual(allPiIds.map(cardSrc));
    if (c.gukjinAsPi) expect(zone.querySelector('.group-yeol [data-card-id="32"]')).toBeNull();
    await expect
      .element(screen.getByTestId(mine ? 'my-score' : 'opponent-score'))
      .toHaveTextContent(String(c.score));
    expect(settings.value.hintLevel).toBe(c.hintLevel);

    // exact base의 짧은 portrait 계약: 제목12px, 카드32px, 나란한 간격6px. 픽셀 기준 갱신은 없다.
    expect(headerBounds.height).toBe(12);
    expect(textBounds.width).toBeGreaterThan(0);
    expect(textBounds.height).toBeGreaterThan(0);
    expect(textBounds.x).toBeGreaterThanOrEqual(headerBounds.x);
    expect(textBounds.right).toBeLessThanOrEqual(headerBounds.right);
    expect(textBounds.bottom).toBeLessThanOrEqual(cardBounds[0]!.y);
    expect(Math.abs(cardBounds[0]!.y - headerBounds.bottom - 2)).toBeLessThanOrEqual(1 / 32);
    for (const [i, bounds] of cardBounds.entries()) {
      expect(bounds.width).toBe(32);
      expect(Math.abs(bounds.height - 32 / 0.614)).toBeLessThanOrEqual(1 / 32);
      expect(Math.abs(bounds.x - cardBounds[0]!.x - i * 6)).toBeLessThanOrEqual(1 / 32);
      expect(bounds.y).toBe(cardBounds[0]!.y);
      expect(bounds.x).toBeGreaterThanOrEqual(rect(pile).x);
      expect(bounds.right).toBeLessThanOrEqual(rect(pile).right);
      expect(bounds.bottom).toBeLessThanOrEqual(rect(pile).bottom);
    }
  });
}
