import { expect, test } from '@playwright/test';

const cases = [
  { name: 'game-390', width: 390, height: 844, prompt: false },
  { name: 'game-430', width: 430, height: 932, prompt: false },
  { name: 'prompt-390', width: 390, height: 844, prompt: true },
] as const;

for (const scenario of cases) {
  test(`wireframe ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto(`file:///work/docs/design/wireframes.html${scenario.prompt ? '?prompt=1' : ''}`);
    await expect(page.locator('.zone')).toHaveCount(6);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `/work/docs/design/wireframe-${scenario.name}.png` });
  });
}
