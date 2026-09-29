import { expect, test } from '@playwright/test';

test('PA-01 evaluation assets require an explicit review build', async ({ page }) => {
  const art: string[] = [];
  page.on('request', (r) => {
    if (/\/pro\/.*\.(webp|avif|ogg|m4a)$/.test(r.url())) art.push(r.url());
  });
  await page.goto('/?visual=pro#/dev/gallery/home');
  await expect(page.getByRole('button', { name: '혼자 연습' })).toBeVisible();
  if (process.env['PRO_ASSET_REVIEW'] === '1') {
    await expect(page.locator('[data-pro-ready=true]')).toBeVisible();
    expect(art.length).toBeGreaterThan(0);
  } else {
    await expect(page.locator('.pro-scene')).toHaveCount(0);
    expect(art).toEqual([]);
    const response = await page.request.get('/pro/felt-1x.webp');
    expect(response.headers()['content-type']).not.toContain('image/webp');
  }
});
