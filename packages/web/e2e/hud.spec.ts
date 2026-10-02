// FR-40 / ui-spec §14. 공용 baseline은 .1-D 소유; 이 PR의 캡처는 실행 아티팩트로만 남긴다.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { auditLayout } from './layout-audit.ts';

test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });

for (const state of ['board', 'board-target', 'board-gostop']) {
  test(`HUD ${state}: 메뉴 예약·무가림·대비 @layout`, async ({ page }, info) => {
    await page.goto(`./#/dev/gallery/${state}`);
    await expect(page.getByTestId('my-score')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    const report = await page.evaluate(auditLayout);
    expect(report.issues).toEqual([]);
    const layout = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const reserved = box('[data-testid="menu-reserved"]');
      const heading = box('.table-heading');
      // 실제 배경 알파를 조상부터 합성한다. 차례·진영이 달라도 같은 대비 하한을 적용한다.
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      const rgba = (color: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      };
      const over = (front: number[], back: number[]) =>
        front.slice(0, 3).map((c, i) => c * (front[3]! / 255) + back[i]! * (1 - front[3]! / 255));
      const luminance = (rgb: number[]) => {
        const linear = rgb
          .map((c) => c / 255)
          .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
      };
      const contrasts = [
        ...document.querySelectorAll<HTMLElement>(
          '.seat-bar .who, .seat-bar .name, .seat-bar .balance, .seat-bar .delta, .seat-bar .score b, .seat-bar .go, .seat-bar .counter, .seat-bar .timer',
        ),
      ].map((el) => {
        const ancestors: HTMLElement[] = [];
        for (let p: HTMLElement | null = el; p; p = p.parentElement) ancestors.unshift(p);
        let background = [255, 255, 255];
        for (const ancestor of ancestors)
          background = over(rgba(getComputedStyle(ancestor).backgroundColor), background);
        const foreground = over(rgba(getComputedStyle(el).color), background);
        const a = luminance(foreground),
          b = luminance(background);
        return { text: el.textContent, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      });
      return {
        menu: [reserved.width, reserved.height, reserved.left - heading.right],
        contrasts,
        scoreFont: getComputedStyle(document.querySelector('.score b')!).fontSize,
      };
    });
    expect(layout.menu).toEqual([48, 48, 4]);
    expect(layout.scoreFont).toBe('24px');
    for (const contrast of layout.contrasts)
      expect(contrast.ratio, contrast.text ?? '').toBeGreaterThanOrEqual(4.5);
    const { violations } = await new AxeBuilder({ page }).include('.scoreboard').analyze();
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
  await page.getByRole('link', { name: '혼자 연습' }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.getByTestId('my-score')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const menu = page.getByTestId('game-menu');
  const prompt = page.getByRole('dialog', { name: '선 고르기' });
  await expect(prompt.locator('h2')).toBeFocused();
  await expect(prompt).toHaveAttribute('aria-modal', 'true');
  await expect(prompt).toHaveAttribute('aria-owns', (await menu.getAttribute('id'))!);
  // 상위 메뉴는 선택창의 접근성 소유 관계와 Tab 순서에 포함된다.
  await page.keyboard.press('Shift+Tab');
  await expect(menu).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(prompt.locator('[tabindex="0"], button:enabled').first()).toBeFocused();
  const geometry = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="game-menu"]')!;
    const actual = button.getBoundingClientRect();
    const reserved = document
      .querySelector('[data-testid="menu-reserved"]')!
      .getBoundingClientRect();
    const heading = document.querySelector('.table-heading')!.getBoundingClientRect();
    return {
      actual: [actual.x, actual.y, actual.width, actual.height],
      reserved: [reserved.x, reserved.y, reserved.width, reserved.height],
      gap: actual.left - heading.right,
      hittable: button.contains(document.elementFromPoint(actual.x + 24, actual.y + 24)),
    };
  });
  expect(geometry.actual).toEqual(geometry.reserved);
  expect(geometry.actual.slice(2)).toEqual([48, 48]);
  expect(geometry.gap).toBe(4);
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
