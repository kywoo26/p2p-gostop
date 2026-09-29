import { expect, test } from '@playwright/test';

for (const size of [
  { width: 360, height: 780, floor: 254 },
  { width: 390, height: 734, floor: 208 },
  { width: 430, height: 822, floor: 252 },
]) {
  for (const prompt of [false, true]) {
    for (const long of [false, true]) {
      test(`wireframe ${size.width}x${size.height} prompt=${prompt} long=${long}`, async ({
        page,
      }, info) => {
        await page.setViewportSize(size);
        await page.goto(
          `file:///work/docs/design/wireframes.html?${prompt ? 'prompt=1&' : ''}${long ? 'long=1' : ''}`,
        );
        await expect(page.locator('.zone')).toHaveCount(6);
        await expect(page.locator('.hand-card')).toHaveCount(10);
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.evaluate(() => {
          const rect = (selector: string) =>
            document.querySelector(selector)!.getBoundingClientRect();
          const inside = (outer: DOMRect, selector: string) =>
            [...document.querySelectorAll(selector)].every((el) => {
              const r = el.getBoundingClientRect();
              return r.top >= outer.top && r.bottom <= outer.bottom;
            });
          const menu = rect('.menu-reserved');
          const fields = [...document.querySelectorAll('.hud-line > span')];
          return {
            floorFits: inside(rect('.floor'), '.group'),
            handFits: inside(rect('.hand'), '.hand-card'),
            hudHeight: rect('.hud').height,
            floorHeight: rect('.floor').height,
            menu: [menu.width, menu.height],
            menuClear: fields.every((el) => el.getBoundingClientRect().right <= menu.left - 8),
            columns: ['score', 'go', 'mult', 'money'].map((field) => {
              const rows = [...document.querySelectorAll(`.hud-${field}`)];
              return rows[0]!.getBoundingClientRect().x - rows[1]!.getBoundingClientRect().x;
            }),
            valuesFit: fields.every((el) =>
              el.classList.contains('hud-name') ? true : el.scrollWidth <= el.clientWidth,
            ),
            promptFits: inside(rect('.action'), '.prompt-button'),
            documentFits: document.documentElement.scrollHeight <= window.innerHeight,
          };
        });
        expect(layout.floorFits).toBe(true);
        expect(layout.handFits).toBe(true);
        expect(layout.hudHeight).toBe(long ? 84 : size.width >= 410 ? 60 : 56);
        expect(layout.floorHeight).toBe(size.floor + (prompt ? 0 : size.width >= 410 ? 80 : 76));
        expect(layout.menu).toEqual([48, 48]);
        expect(layout.menuClear).toBe(true);
        expect(layout.columns).toEqual([0, 0, 0, 0]);
        expect(layout.valuesFit).toBe(true);
        expect(layout.documentFits).toBe(true);
        if (prompt) expect(layout.promptFits).toBe(true);
        await expect(page.locator('.hud-mult').first()).toHaveText('—');
        await expect(page.locator('.hud-go').first()).toHaveText('0고');
        await expect(page.locator('.hud-money').last()).toHaveText(
          long ? '9,007,199,254,740,991냥' : '51,200냥',
        );
        await page.screenshot({ path: info.outputPath('wireframe.png') });
      });
    }
  }
}
