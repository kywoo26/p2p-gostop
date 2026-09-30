// PA-06 / UX-09: 사건 콜아웃은 예약 레일에 머물고 핵심 정보를 가리지 않는다.
import { expect, test } from '@playwright/test';
import { auditLayout } from './layout-audit.ts';

for (const [width, height] of [
  [360, 780],
  [390, 734],
  [412, 915],
  [430, 822],
  [412, 840],
] as const) {
  test(`${width}×${height} 사건 콜아웃 비가림 @layout`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./#/dev/gallery/layout-event', { waitUntil: 'domcontentloaded' });
    const callout = page.locator('.event-rail .banner');
    await expect(callout).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(auditLayout);
    expect(report.issues).toEqual([]);
    const covered = await callout.evaluate((element) => {
      const a = element.getBoundingClientRect();
      return [...document.querySelectorAll('.hand-zone .card, .captured-zone .card, .timer')]
        .filter((node) => {
          const b = node.getBoundingClientRect();
          return (
            Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
            Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1
          );
        })
        .map((node) => node.className);
    });
    expect(covered).toEqual([]);
    await callout.evaluate((element) => {
      element.classList.replace('kind-ppeok', 'kind-go');
      const label = element.querySelector('strong');
      if (label) label.textContent = '2고!';
    });
    expect((await page.evaluate(auditLayout)).issues).toEqual([]);
  });
  test(`${width}×${height} 대상 선택 중 콜아웃 보류 @layout`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('./#/dev/gallery/layout-event-target');
    await expect(page.locator('.event-rail .banner')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: '먹을 바닥패 선택' })).toBeVisible();
  });
}
