// UX-H01/UX-H05, FR-46~50: 게임 규칙 판정과 분리된 시각 슬롯·그림 무가림.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.use({ deviceScaleFactor: 1 });
for (const [width, height] of [
  [360, 780],
  [390, 734],
  [430, 822],
  [412, 915],
] as const) {
  for (const state of ['play', 'stop']) {
    test(`${width}x${height} ${state}: 점수 위계·표식 별도 행·손패10`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto(`./#/dev/gallery/feedback-${state}`);
      await page.evaluate(() => document.fonts.ready);
      const report = await page.evaluate(() => {
        const overlap = (a: DOMRect, b: DOMRect) =>
          Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
          Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
        const windows = [...document.querySelectorAll('.hand .art-window')].map((el) =>
          el.getBoundingClientRect(),
        );
        const labels = [...document.querySelectorAll('.hand-label')].map((el) =>
          el.getBoundingClientRect(),
        );
        const slots = [...document.querySelectorAll('.hand .slot')].map((el) =>
          el.getBoundingClientRect(),
        );
        return {
          windows: windows.map((r) => ({ width: r.width, height: r.height })),
          labelHeight: labels.map((r) => r.height),
          collisions: labels.filter((label) => windows.some((art) => overlap(label, art))).length,
          slotOverlap: slots.some((r, i) => slots.slice(i + 1).some((other) => overlap(r, other))),
          oldMarks: document.querySelectorAll('.hand .mark, .hand .badge').length,
          inside: slots.every(
            (r) => r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
          ),
          scoreSize: getComputedStyle(document.querySelector('.score b')!).fontSize,
          secondarySize: getComputedStyle(document.querySelector('.balance')!).fontSize,
          tnum: getComputedStyle(document.querySelector('.seat-bar')!).fontVariantNumeric,
        };
      });
      expect(report.windows).toHaveLength(10);
      expect(
        report.windows
          .slice(0, 5)
          .every((r) => r.height >= (width >= 410 ? 56 : 50) && r.width >= 48),
      ).toBe(true);
      expect(report.labelHeight.every((h) => h === 16)).toBe(true);
      if (width === 412 && height === 915)
        expect(report.windows[0]!.height).toBeCloseTo(report.windows[5]!.height, 1);
      expect(report.collisions).toBe(0);
      expect(report.slotOverlap).toBe(false);
      expect(report.oldMarks).toBe(0);
      expect(report.inside).toBe(true);
      expect(report.scoreSize).toBe('24px');
      expect(report.secondarySize).toBe('14px');
      expect(report.tnum).toContain('tabular-nums');
      await expect(page.locator('[data-hand-group="sample-bomb"]')).toHaveCount(3);
      await expect(page.locator('[data-hand-action="shake"]')).toHaveCount(3);
      await expect(page.locator('[data-hand-cue="secured"]')).toHaveCount(1);
      if (state === 'stop')
        await expect(page.locator('[data-choice="stop"]')).toContainText('2,400냥');
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations).toEqual([]);
      await info.attach('손패 그림·표식 배치', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });
      await page.screenshot({
        path: info.outputPath(`feedback-${state}-${width}x${height}.png`),
        fullPage: true,
      });
      if (state === 'play') {
        await page.locator('[data-slot="0"]').focus();
        await expect(page.locator('.group-selected')).toHaveCount(3);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`feedback-group-${width}x${height}.png`),
          fullPage: true,
        });
      }
    });
  }
}
