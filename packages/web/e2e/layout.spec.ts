// UX-06/11·NF-08: 실제 비겹침 그림, 진영별 획득패, 타이머·긴 금액 회귀.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { auditLayout } from './layout-audit.ts';
import { timingSave, TIMING_FIXTURES } from './timing-fixtures.ts';

for (const [width, height] of [
  [360, 780],
  [390, 734],
  [412, 915],
  [430, 822],
  [412, 840],
] as const) {
  for (const state of [
    'waiting',
    'play',
    'target',
    'gostop',
    'pre-settlement',
    'overflow',
    'empty',
  ]) {
    test(`${width}×${height} ${state}: 전체 앞면·획득4종·겹침 게이트`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto(`./#/dev/gallery/fan-${state}`);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.table')).toHaveAttribute('data-floor-fits', 'true');
      const report = await page.evaluate(auditLayout);
      expect(report.issues).toEqual([]);
      expect(report.scales).toEqual([32, 48]);
      expect(report.minExposure).toBe(1);
      expect(report.handCount).toBe(10);
      if (!['empty', 'overflow'].includes(state)) expect(report.floorCount).toBe(10);
      expect(
        await page.locator('.captured-zone .stack[data-count]:not([data-count="0"])').count(),
      ).toBe(8);
      expect(await page.locator('.hand .mark, .floor .mark').count()).toBe(0);
      if (state === 'overflow')
        await expect(page.locator('.table')).toHaveAttribute('data-floor-folded', 'true');
      if (state === 'target')
        for (const id of [32, 33])
          await expect(
            page.locator(`[data-choice="target-${id}"] img[src$="/${id}.svg"]`),
          ).toBeVisible();
      await info.attach('layout-audit', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });
      if (
        width === 412 &&
        height === 915 &&
        ['play', 'target', 'gostop', 'overflow'].includes(state)
      ) {
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations).toEqual([]);
        await expect(page).toHaveScreenshot(`fan-${state}-${width}x${height}.png`);
      }
    });
  }
  for (const scene of ['home', 'settlement', 'settings', 'guest', 'license', 'game-menu']) {
    test(`${width}×${height} ${scene}: 전체 화면 겹침·입력·텍스트 게이트`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height });
      if (scene === 'game-menu') {
        await page.addInitScript(
          (save) => localStorage.setItem('gostop.solo.v1', JSON.stringify(save)),
          timingSave(TIMING_FIXTURES[0]!),
        );
        await page.goto('./?speed=instant#/game');
        await page.getByTestId('game-menu').click();
      } else {
        await page.goto(scene === 'license' ? './#/license' : `./#/dev/gallery/${scene}`);
      }
      await expect(page.locator('main, .board').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(async () => (await page.evaluate(auditLayout)).issues).toEqual([]);
      const report = await page.evaluate(auditLayout);
      expect(report.elementCount).toBeGreaterThan(0);
      await info.attach('layout-audit', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });
    });
  }
}
for (const state of ['gukjin', 'shake', 'chongtong', 'first', 'flip', 'event', 'event-target']) {
  test(`추가 ${state}: 필수 제어가 화면 안에 남는다`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`./#/dev/gallery/layout-${state}`);
    await page.evaluate(() => document.fonts.ready);
    const issues = await page
      .locator('.prompt button, .floor-choice, .flip-only')
      .evaluateAll((nodes) =>
        nodes.flatMap((node) => {
          const r = node.getBoundingClientRect();
          return r.width < 48 || r.height < 48 || r.top < 0 || r.bottom > innerHeight
            ? [node.textContent]
            : [];
        }),
      );
    expect(issues).toEqual([]);
  });
}
test('판 정보는 메뉴에서 열고 문턱·획득 내역·닫기를 제공', async ({ page }) => {
  await page.addInitScript(
    (save) => localStorage.setItem('gostop.solo.v1', JSON.stringify(save)),
    timingSave(TIMING_FIXTURES[0]!),
  );
  await page.goto('./?speed=instant#/game');
  await page.getByTestId('game-menu').click();
  await page.locator('[data-menu="board-info"]').click();
  const dialog = page.getByRole('dialog', { name: '판 정보' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '내 획득패' })).toBeVisible();
  await expect(dialog.getByRole('list', { name: '내 족보 진행도' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
test('가로 방향 입력 잠금·세로 복귀', async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 360 });
  await page.goto('./#/dev/gallery/layout-play');
  await expect(page.getByRole('alert')).toHaveText('세로로 돌려 게임을 계속하세요');
  expect(await page.locator('.hand button:enabled').count()).toBe(0);
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.locator('.hand button:enabled').count()).toBe(10);
});

for (const state of ['play', 'target', 'gostop']) {
  test(`412×840 시스템 inset ${state}: 카드·입력 안전영역`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 840 });
    await page.goto(`./#/dev/gallery/fan-${state}`);
    const board = page.locator('.board');
    await expect(board).toBeVisible();
    await board.evaluate((el) => {
      el.style.setProperty('--board-safe-top', '34px');
      el.style.setProperty('--board-safe-bottom', '24px');
    });
    await expect(page.locator('.table')).toHaveAttribute('data-floor-fits', 'true');
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(async () => (await page.evaluate(auditLayout)).issues).toEqual([]);
    const edges = await page
      .locator('.hud, .hand-zone')
      .evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().toJSON()));
    expect(edges[0]!.top).toBeGreaterThanOrEqual(34);
    expect(edges[1]!.bottom).toBeLessThanOrEqual(816);
  });
}

// 리뷰 P2: 접근성 트리에서 숨긴 카운터도 실제 화면의 교차 감사에는 포함한다.
test('감사 반례: aria-hidden 카운터가 잔액 위를 덮으면 실패한다', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('./#/dev/gallery/fan-play');
  await expect(page.locator('.table')).toHaveAttribute('data-floor-fits', 'true');
  await page.evaluate(() => document.fonts.ready);
  expect((await page.evaluate(auditLayout)).issues).toEqual([]);
  await page.evaluate(() => {
    const counter = document.querySelector<HTMLElement>('.mine-hud .counter')!;
    const balance = document.querySelector('.mine-hud .balance')!.getBoundingClientRect();
    counter.style.cssText = `position:fixed;left:${balance.left}px;top:${balance.top}px;width:48px;height:24px;z-index:100`;
    counter.setAttribute('aria-hidden', 'true');
  });
  expect(
    (await page.evaluate(auditLayout)).issues.some(
      (issue) =>
        issue.startsWith('overlap:') && issue.includes('counter') && issue.includes('balance'),
    ),
  ).toBe(true);
});

test('감사 반례: aria-hidden 텍스트 교차 검출, display none이면 제외', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('./#/dev/gallery/fan-play');
  await expect(page.locator('.table')).toHaveAttribute('data-floor-fits', 'true');
  await page.evaluate(() => {
    for (const label of ['probe-one', 'probe-two']) {
      const el = document.createElement('span');
      el.textContent = label;
      el.className = label;
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText =
        'position:fixed;left:100px;top:100px;font:14px sans-serif;background:red;color:white;z-index:100';
      document.body.append(el);
    }
  });
  const clashes = () =>
    page
      .evaluate(auditLayout)
      .then((report) =>
        report.issues.filter(
          (issue) =>
            issue.startsWith('overlap:') &&
            issue.includes('probe-one') &&
            issue.includes('probe-two'),
        ),
      );
  expect(await clashes()).toHaveLength(1);
  await page.locator('.probe-two').evaluate((el) => {
    el.style.display = 'none';
  });
  expect(await clashes()).toEqual([]);
});
