// PA-05 / UX-11/13 / NF-01/03/07: 본선 자산·오프라인 실패 대안·홈 최소 화면.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const [width, height] of [
  [360, 780],
  [390, 734],
  [430, 822],
  [412, 915],
] as const) {
  test(`skin home ${width}×${height}: 로컬 자산·48px·axe`, async ({ page }, info) => {
    const external: string[] = [];
    const failed: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).hostname !== '127.0.0.1') external.push(r.url());
    });
    page.on('response', (r) => {
      if (r.url().includes('/skin/') && !r.ok()) failed.push(r.url());
    });
    await page.setViewportSize({ width, height });
    await page.goto('./#/dev/gallery/home');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('button', { name: '핫스팟 대전' })).toBeVisible();
    const geometry = await page.locator('.home button, .home a').evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height, right: r.right, left: r.left };
      }),
    );
    expect(
      geometry.every((r) => r.width >= 48 && r.height >= 48 && r.left >= 0 && r.right <= width),
    ).toBe(true);
    expect(
      await page.locator('.hero-art').evaluate((el) => getComputedStyle(el).backgroundImage),
    ).toContain('/skin/key-art-1x.webp');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(external).toEqual([]);
    expect(failed).toEqual([]);
    await page.screenshot({ path: info.outputPath(`home-${width}x${height}.png`), fullPage: true });
  });
}

test('skin 이미지 실패에도 정보·입력·카드가 유지된다', async ({ page }) => {
  await page.route('**/skin/**', (route) => route.abort());
  await page.goto('./#/dev/gallery/board-gostop');
  await expect(page.getByRole('button', { name: /스톱 ·.*냥/ })).toBeVisible();
  await expect(page.locator('.hand .card').first()).toBeVisible();
  expect(
    await page.locator('.board').evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
