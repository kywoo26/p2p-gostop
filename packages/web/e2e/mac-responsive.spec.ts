// FR-RP-06: Mac 가로 창과 200% 확대 상당의 CSS 뷰포트에서 동일한 판을 감사한다.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { auditLayout } from './layout-audit.ts';

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
        await hand.first().focus();
        await page.keyboard.press('Tab');
        await expect(hand.nth(1)).toBeFocused();
        expect(await hand.nth(1).evaluate((item) => getComputedStyle(item).outlineStyle)).not.toBe(
          'none',
        );
      }
    });
  }
}
