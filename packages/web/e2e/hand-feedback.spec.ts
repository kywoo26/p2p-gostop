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
    test(`${width}x${height} ${state}: 점수 위계·카드 상태·손패10 @layout`, async ({
      page,
    }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height });
      await page.goto(`./#/dev/gallery/feedback-${state}`);
      await expect(page.locator('.hand .slot')).toHaveCount(10);
      await page.evaluate(() => document.fonts.ready);
      const report = await page.evaluate(() => {
        const overlap = (a: DOMRect, b: DOMRect) =>
          Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
          Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
        const windows = [...document.querySelectorAll('.hand .art-window')].map((el) =>
          el.getBoundingClientRect(),
        );
        const slots = [...document.querySelectorAll('.hand .slot')].map((el) =>
          el.getBoundingClientRect(),
        );
        return {
          windows: windows.map((r) => ({ width: r.width, height: r.height })),
          addOnNodes: document.querySelectorAll(
            '.hand .hand-label, .hand .match-mark, .hand .action-mark',
          ).length,
          slotOverlap: slots.some((r, i) => slots.slice(i + 1).some((other) => overlap(r, other))),
          monthMarks: document.querySelectorAll('.hand .mark').length,
          actionMarks: document.querySelectorAll('.hand [data-hand-action]').length,
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
      if (width === 412 && height === 915)
        expect(report.windows[0]!.height).toBeCloseTo(report.windows[9]!.height, 1);
      expect(report.addOnNodes).toBe(0);
      expect(report.slotOverlap).toBe(false);
      expect(report.monthMarks).toBe(10);
      expect(report.actionMarks).toBe(6);
      await expect(page.locator('.hand')).not.toContainText(/먹기|확정|폭탄|흔들/);
      expect(report.inside).toBe(true);
      expect(report.scoreSize).toBe('24px');
      expect(report.secondarySize).toBe('14px');
      expect(report.tnum).toContain('tabular-nums');
      await expect(page.locator('[data-hand-group="1"]')).toHaveCount(3);
      await expect(page.locator('[data-hand-action="shake"]')).toHaveCount(3);
      await expect(page.locator('[data-hand-action="bomb"]')).toHaveCount(3);
      await expect(page.locator('[data-hand-cue="secured"]')).toHaveCount(1);
      if (state === 'stop') {
        await expect(page.locator('[data-choice="stop"]')).toContainText('2,400냥');
        await expect(page.locator('.risk-kind')).toHaveText('피박 위험');
      } else {
        await expect(page.locator('.idle-slot')).toContainText('내 차례');
        await expect(page.locator('.idle-slot button')).toHaveText('판 정보');
      }
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

for (const width of [360, 390, 412, 430]) {
  for (const fixture of ['groups', 'bonus']) {
    test(`${width}px ${fixture}: 월 묶음과 48px 노출 @layout`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto(`./#/dev/gallery/hand-layout-${fixture}`);
      const rows = await page.locator('.hand .row').evaluateAll((elements) =>
        elements.map((row) => ({
          count: row.querySelectorAll('.slot').length,
          months: [...row.querySelectorAll<HTMLElement>('.slot')].map((slot) =>
            Number(slot.dataset['slot']),
          ),
          slots: [...row.querySelectorAll('.slot')].map((slot) => {
            const rect = slot.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width };
          }),
          artHeights: [...row.querySelectorAll('.art-window')].map(
            (art) => art.getBoundingClientRect().height,
          ),
        })),
      );
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.count >= 4 && row.count <= 6)).toBe(true);
      expect(
        rows
          .flatMap((row) => row.slots)
          .every((slot) => slot.left >= 0 && slot.right <= width && slot.width >= 48),
      ).toBe(true);
      expect(rows[0]!.artHeights.every((height) => height >= 48)).toBe(true);
      for (const month of [0, 1, 2]) {
        const cards = Array.from({ length: 4 }, (_, i) => month * 4 + i);
        const occupied = rows.filter((row) => row.months.some((id) => cards.includes(id)));
        expect(occupied).toHaveLength(1);
      }
      await page.screenshot({ path: info.outputPath(`hand-layout-${fixture}-${width}.png`) });
    });
  }
}
