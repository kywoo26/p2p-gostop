// FR-40 / ui-spec §14. 공용 baseline은 .1-D 소유; 이 PR의 캡처는 실행 아티팩트로만 남긴다.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });

for (const state of ['board', 'board-target', 'board-gostop']) {
  test(`HUD ${state}: 메뉴 예약·무가림·대비`, async ({ page }, info) => {
    await page.goto(`./#/dev/gallery/${state}`);
    await expect(page.getByTestId('my-score')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    const layout = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const reserved = box('[data-testid="menu-reserved"]');
      const scoreboard = box('.scoreboard');
      const selectors = ['.scoreboard', '.captured-zone', '.floor', '.hand', '.prompt'];
      const areas = [...document.querySelectorAll(selectors.join(','))].map((el) =>
        el.getBoundingClientRect(),
      );
      const overlap = areas.some((a, i) =>
        areas
          .slice(i + 1)
          .some(
            (b) =>
              Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
              Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top),
          ),
      );
      // Canvas는 브라우저가 해석한 OKLCH를 sRGB로 변환한다. 렌더링 표면 기준 대비를 계측한다.
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      const luminance = (color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const rgb = [...ctx.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map((n) => n / 255)
          .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
        return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
      };
      const style = getComputedStyle(document.documentElement);
      const color = (token: string) => style.getPropertyValue(`--color-${token}`);
      const contrast = (a: string, b: string) => {
        const x = luminance(a),
          y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      return {
        menu: [reserved.width, reserved.height, reserved.left - scoreboard.right],
        overlap,
        inside: areas.every((a) => a.left >= 0 && a.right <= innerWidth && a.bottom <= innerHeight),
        overflow: document.documentElement.scrollHeight - innerHeight,
        text: ['hud-text', 'hud-muted', 'hud-mine'].map((token) =>
          contrast(color(token), color('hud')),
        ),
        chips: [
          contrast(color('hud-muted'), color('hud-chip')),
          contrast(color('hud-complete'), color('hud-complete-bg')),
          contrast(color('hud-near'), color('hud-near-bg')),
        ],
        centered: Math.abs(
          (box('.center').top + box('.center').bottom) / 2 -
            (box('.floor').top + box('.floor').bottom) / 2,
        ),
        progress: contrast(color('hud-muted'), color('felt-highlight')),
        outline: [
          contrast(color('hud-outline'), color('hud')),
          contrast(color('hud-outline'), color('felt-highlight')),
        ],
      };
    });
    expect(layout.menu).toEqual([48, 48, 8]);
    expect(layout.overlap).toBe(false);
    expect(layout.inside).toBe(true);
    expect(layout.overflow).toBe(0);
    expect(layout.centered).toBeLessThan(1);
    for (const ratio of [...layout.text, ...layout.chips, layout.progress])
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    for (const ratio of layout.outline) expect(ratio).toBeGreaterThanOrEqual(3);
    const { violations } = await new AxeBuilder({ page })
      .include('.scoreboard')
      .include('.progress')
      .analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await info.attach('HUD geometry and contrast', {
      body: JSON.stringify(layout, null, 2),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath(`${state}-412x915.png`), fullPage: true });
  });
}

// #88 통합: 갤러리는 Board만 렌더하므로 실제 Game의 버튼도 별도로 검증한다.
test('HUD 실제 메뉴: 예약 위치 일치·클릭·복귀', async ({ page }, info) => {
  await page.goto('./?speed=instant#/');
  await page.getByRole('button', { name: '혼자 연습' }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.getByTestId('my-score')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const menu = page.getByTestId('game-menu');
  const geometry = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="game-menu"]')!;
    const actual = button.getBoundingClientRect();
    const reserved = document
      .querySelector('[data-testid="menu-reserved"]')!
      .getBoundingClientRect();
    const scoreboard = document.querySelector('.scoreboard')!.getBoundingClientRect();
    return {
      actual: [actual.x, actual.y, actual.width, actual.height],
      reserved: [reserved.x, reserved.y, reserved.width, reserved.height],
      gap: actual.left - scoreboard.right,
      hittable: button.contains(document.elementFromPoint(actual.x + 24, actual.y + 24)),
    };
  });
  expect(geometry.actual).toEqual(geometry.reserved);
  expect(geometry.actual.slice(2)).toEqual([48, 48]);
  expect(geometry.gap).toBe(8);
  expect(geometry.hittable).toBe(true);
  await page.screenshot({ path: info.outputPath('game-menu-412x915.png'), fullPage: true });
  await menu.click();
  await expect(page.locator('.board-wrap')).toHaveAttribute('inert', '');
  await page.locator('[data-menu="settings"]').click();
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();
  await page.getByRole('link', { name: '뒤로' }).click();
  await expect(menu).toBeVisible();
  await expect(page.locator('.board-wrap')).not.toHaveAttribute('inert', '');
  await info.attach('Actual menu and reserved geometry', {
    body: JSON.stringify(geometry, null, 2),
    contentType: 'application/json',
  });
});
