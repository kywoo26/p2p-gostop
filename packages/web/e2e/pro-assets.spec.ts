import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Evaluation assets are deliberately absent from the default release build.
test.skip(process.env['PRO_ASSET_REVIEW'] !== '1', '평가 빌드 전용: PRO_ASSET_REVIEW=1');

for (const viewport of [
  { width: 360, height: 780 },
  { width: 390, height: 734 },
  { width: 430, height: 822 },
  { width: 412, height: 915 },
]) {
  test(`PA-04 professional assets ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const external: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).hostname !== '127.0.0.1') external.push(r.url());
    });
    for (const screen of ['home', 'board', 'settlement']) {
      await page.goto(`/?visual=pro&still=1#/dev/gallery/${screen}`);
      await expect(page.locator('[data-pro-ready=true]')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (screen === 'board') {
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
        ).toBe(true);
        await expect(page.getByTestId('my-score')).toHaveText('8');
        await expect(page.getByTestId('opponent-score')).toHaveText('0');
      }
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`${screen}-${viewport.width}x${viewport.height}.png`),
      });
    }
    expect(external).toEqual([]);
  });
}

test('PA-03 first screen defers VFX/audio and download failure preserves controls', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.route('**/pro/felt-*.webp', (route) => route.abort());
  await page.goto('/?visual=pro#/dev/gallery/home');
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(page.getByRole('button', { name: '혼자 연습' })).toBeEnabled();
  expect(requests.some((url) => /\.(ogg|m4a)$|\/pro\/(ppeok|jjok|bomb|ttadak)-/.test(url))).toBe(
    false,
  );
  await page.unroute('**/pro/felt-*.webp');
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.locator('[data-pro-ready=true]')).toBeVisible();
});

test('PA-04 reduced motion leaves a stable readable event frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?visual=pro&motion=1#/dev/gallery/pro-ppeok');
  await expect(page.locator('[data-pro-ready=true]')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('뻑');
  await page.waitForTimeout(300);
  const first = await page
    .locator('.pro-sprite')
    .evaluate((node) => (node as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(300);
  expect(
    await page.locator('.pro-sprite').evaluate((node) => (node as HTMLCanvasElement).toDataURL()),
  ).toBe(first);
  expect(
    await page.locator('.pro-sprite').evaluate((node) => getComputedStyle(node).pointerEvents),
  ).toBe('none');
});
