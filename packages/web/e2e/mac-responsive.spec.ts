// FR-RP-06: Mac 가로 창과 200% 확대 상당의 CSS 뷰포트에서 동일한 판을 감사한다.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { auditLayout } from './layout-audit.ts';

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 30; step++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((node) => node === document.activeElement)) break;
  }
  await expect(target).toBeFocused();
  const visible = await target.evaluate((node) => {
    const style = getComputedStyle(node);
    return (
      (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
      style.boxShadow !== 'none'
    );
  });
  expect(visible).toBe(true);
}

async function assertTrap(page: Page, controls: Locator) {
  const first = controls.first();
  const last = controls.last();
  await tabTo(page, first);
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
}

for (const [width, height] of [
  [1440, 900],
  [1024, 450],
  [720, 450],
] as const) {
  for (const state of ['play', 'target', 'gostop'] as const) {
    test(`${width}×${height} ${state}: 재배치·필수 입력·접근성 @mac`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`./#/dev/gallery/fan-${state}`);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.rotate-notice')).toHaveCount(0);
      await expect(page.locator('.table')).toHaveAttribute('data-floor-fits', 'true');
      const report = await page.evaluate(auditLayout);
      expect(report.issues).toEqual([]);
      expect(
        await page
          .locator('.seat-bar .balance')
          .evaluateAll((items) => items.every((item) => item.scrollWidth <= item.clientWidth + 1)),
      ).toBe(true);
      expect(report.handCount).toBe(10);
      expect(report.floorCount).toBe(10);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
      ).toEqual([]);
      if (width === 1440) await expect(page).toHaveScreenshot(`mac-${state}.png`);
      if (state === 'play') {
        const hand = page.locator('.hand button:not([disabled])');
        await tabTo(page, hand.first());
        await tabTo(page, hand.nth(1));
        await page.keyboard.press('Shift+Tab');
        await expect(hand.first()).toBeFocused();
      } else if (state === 'target') {
        await assertTrap(page, page.locator('.table.choosing .floor-choice'));
      } else {
        const controls = page.locator('.prompt [tabindex="0"], .prompt button:enabled');
        await assertTrap(page, controls);
        await tabTo(page, page.locator('[data-choice="stop"]'));
        await tabTo(page, page.locator('[data-choice="go"]'));
      }
    });
  }
}

for (const [width, height] of [
  [1440, 900],
  [720, 450],
] as const) {
  for (const prompt of ['gukjin', 'shake', 'chongtong', 'first'] as const) {
    test(`${width}×${height} ${prompt}: 프롬프트 Tab 순환과 초점 표시 @mac`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`./#/dev/gallery/layout-${prompt}`);
      await expect(page.locator('.prompt')).toBeVisible();
      const controls = page.locator('.prompt [tabindex="0"], .prompt button:enabled');
      expect(await controls.count()).toBeGreaterThanOrEqual(2);
      await assertTrap(page, controls);
      for (const button of await page.locator('.prompt button:enabled').all())
        await tabTo(page, button);
    });
  }
}

for (const [width, height] of [
  [1440, 900],
  [1024, 450],
  [720, 450],
] as const) {
  test(`${width}×${height}: 가로 영역 간격 0 반례 @mac`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('./#/dev/gallery/fan-play');
    await page.evaluate(() => document.fonts.ready);
    expect((await page.evaluate(auditLayout)).issues).toEqual([]);
    await page.locator('.board').evaluate((board) => {
      board.style.columnGap = '0px';
    });
    expect((await page.evaluate(auditLayout)).issues).toContainEqual(
      expect.stringContaining('wide region gap: opponent hud/center'),
    );
    await page.locator('.board').evaluate((board) => {
      board.style.removeProperty('column-gap');
      board.style.rowGap = '0px';
    });
    expect((await page.evaluate(auditLayout)).issues).toContainEqual(
      expect.stringContaining('wide region gap: center/hand'),
    );
  });
}
