// FR-14·18 / UX-11 / plan .1-A: 계산은 #100 소유. 정산의 가림·읽기·버튼 경계만 검사.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.use({ deviceScaleFactor: 1 });
for (const [width, height] of [
  [360, 780],
  [390, 734],
  [430, 822],
  [412, 915],
] as const) {
  test(`정산 ${width}x${height}: 밀기·받기·민 판·대기·장문 @layout`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    for (const state of [
      'decision',
      'guest',
      'pushed',
      'waiting',
      'capped',
      'nagari',
      'bankrupt',
    ]) {
      // 상태마다 문서를 다시 열어 앞 상태의 상세 스크롤/초점을 물려받지 않는다.
      await page.goto(`./?settlement=${state}#/dev/gallery/settlement-${state}`);
      await page.evaluate(() => document.fonts.ready);
      const details = page.getByRole('region', { name: '정산 내용' });
      await expect(details).toBeVisible();
      expect(
        await page.evaluate(() => ({
          x: document.documentElement.scrollWidth <= innerWidth,
          y: document.documentElement.scrollHeight <= innerHeight + 1,
          details:
            document.querySelector('.body')!.scrollWidth <=
            document.querySelector('.body')!.clientWidth + 1,
        })),
      ).toEqual({ x: true, y: true, details: true });
      const controls = await page.locator('.actions button').evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          const body = document.querySelector('.body')!.getBoundingClientRect();
          return {
            size: r.width >= 48 && r.height >= 48,
            inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            clear: body.bottom <= r.top,
            hit: node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
          };
        }),
      );
      for (const control of controls)
        expect(control).toEqual({ size: true, inside: true, clear: true, hit: true });
      if (state === 'decision' || state === 'guest') {
        await expect(page.locator('[data-choice="accept"]')).toContainText('받기');
        await expect(page.locator('[data-choice="push"]')).toContainText(
          state === 'guest' ? '×4' : '×2',
        );
        await expect(page.getByRole('status')).toContainText('정산 0냥');
      }
      if (state === 'pushed') {
        await expect(page.getByTestId('push-forfeit')).toHaveText(
          '정산 0냥 · 20점 포기 · 다음 판 ×2',
        );
        await expect(page.locator('[data-choice="push"]')).toHaveCount(0);
        await expect(page.getByTestId('balance-0')).toHaveText('51,200');
      }
      if (state === 'waiting') {
        await expect(page.getByRole('status')).toContainText('선택을 기다리는 중');
        await expect(page.locator('.actions button')).toHaveCount(0);
      }
      if (state === 'capped') await expect(page.locator('[data-choice="push"]')).toHaveCount(0);
      if (state === 'nagari')
        await expect(page.getByTestId('settlement-headline')).toContainText('나가리 · 다음 판 ×2');
      if (state === 'bankrupt') await expect(page.locator('[data-choice="refill"]')).toBeVisible();
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations).toEqual([]);
      if (state === 'decision' || state === 'pushed') {
        await expect(page).toHaveScreenshot(`${state}-${width}x${height}.png`);
      }
      if (width === 412) await page.screenshot({ path: info.outputPath(`${state}-412x915.png`) });
      await details.focus();
      await page.keyboard.press('Control+End');
      await page.keyboard.press('End');
      await expect(details).toBeFocused();
      if (state === 'decision' || state === 'pushed' || state === 'bankrupt') {
        await expect(page.getByTestId('balance-1')).toBeInViewport();
      }
    }
  });
}
