import { expect, test } from '@playwright/test';

const cases = [
  { name: 'game-360x780', width: 360, height: 780, prompt: false },
  { name: 'game-390x734', width: 390, height: 734, prompt: false },
  { name: 'game-430x822', width: 430, height: 822, prompt: false },
  { name: 'prompt-390x734', width: 390, height: 734, prompt: true },
] as const;

for (const scenario of cases) {
  test(`wireframe ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto(
      `file:///work/docs/design/wireframes.html${scenario.prompt ? '?prompt=1' : ''}`,
    );
    await expect(page.locator('.zone')).toHaveCount(6);
    await expect(page.locator('.hand-card')).toHaveCount(10);
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => {
      const floor = document.querySelector('.floor')!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.group')].map((el) =>
        el.getBoundingClientRect(),
      );
      const hand = document.querySelector('.hand')!.getBoundingClientRect();
      const handCards = [...document.querySelectorAll('.hand-card')].map((el) =>
        el.getBoundingClientRect(),
      );
      return {
        floorFits: cards.every((card) => card.top >= floor.top && card.bottom <= floor.bottom),
        handFits: handCards.every((card) => card.top >= hand.top && card.bottom <= hand.bottom),
      };
    });
    expect(layout).toEqual({ floorFits: true, handFits: true });
    await page.screenshot({ path: `/work/docs/design/wireframe-${scenario.name}.png` });
  });
}
