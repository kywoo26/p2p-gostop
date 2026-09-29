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
    test(`${width}x${height} ${state}: 점수 위계·카드 상태·손패10`, async ({ page }, info) => {
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
        const board = document.querySelector('.board')!;
        const boardRect = board.getBoundingClientRect();
        const frame = getComputedStyle(board, '::after');
        const frameTop = boardRect.top + parseFloat(frame.top) + parseFloat(frame.borderTopWidth);
        const frameLeft =
          boardRect.left + parseFloat(frame.left) + parseFloat(frame.borderLeftWidth);
        const frameRight =
          boardRect.right - parseFloat(frame.right) - parseFloat(frame.borderRightWidth);
        const frameBottom =
          boardRect.bottom - parseFloat(frame.bottom) - parseFloat(frame.borderBottomWidth);
        const panelsInsideFrame = [
          ...document.querySelectorAll('.scoreboard, .decision-area, .captured-zone, .hand-zone'),
        ].every((el) => {
          const r = el.getBoundingClientRect();
          // 1px 외곽선까지 포함하고 프레임 안쪽과 최소2px 분리한다.
          return (
            r.top - 1 >= frameTop + 2 &&
            r.left - 1 >= frameLeft + 2 &&
            r.right + 1 <= frameRight - 2 &&
            r.bottom + 1 <= frameBottom - 2
          );
        });
        return {
          panelsInsideFrame,
          myCountersClear: [...document.querySelectorAll('.captured-zone.mine .counter')].every(
            (counter) =>
              windows.every((window) => !overlap(counter.getBoundingClientRect(), window)),
          ),
          cardSizes: [...document.querySelectorAll('.hand .card')].map((el) => {
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height };
          }),
          windows: windows.map((r) => ({ width: r.width, height: r.height })),
          addOnNodes: document.querySelectorAll(
            '.hand .hand-label, .hand .match-mark, .hand .action-mark',
          ).length,
          slotOverlap: slots.some((r, i) => slots.slice(i + 1).some((other) => overlap(r, other))),
          monthMarks: document.querySelectorAll('.hand .mark').length,
          actionMarks: document.querySelectorAll('.hand [data-hand-action]').length,
          stateStyles: [
            ...document.querySelectorAll(
              '.slot[data-hand-cue="matchable"], .slot[data-hand-cue="secured"]',
            ),
          ].map((el) => {
            const style = getComputedStyle(el.querySelector('.art-window')!);
            return {
              cue: el.getAttribute('data-hand-cue'),
              action: el.getAttribute('data-hand-action'),
              lift: style.translate,
              line: style.outlineStyle,
            };
          }),
          actionIcons: [
            ...document.querySelectorAll(
              '.slot[data-hand-action="bomb"], .slot[data-hand-action="shake"]',
            ),
          ].map((el) => {
            const art = el.querySelector('.art-window')!;
            const rect = art.getBoundingClientRect();
            const style = getComputedStyle(art, '::after');
            const w = parseFloat(style.width),
              h = parseFloat(style.height);
            const x =
              style.left === 'auto'
                ? rect.right - parseFloat(style.right) - w
                : rect.left + parseFloat(style.left);
            const y = rect.top + parseFloat(style.top);
            const icon = new DOMRect(x, y, w, h);
            return {
              action: el.getAttribute('data-hand-action'),
              image: style.backgroundImage,
              width: w,
              height: h,
              inside:
                x >= rect.left && x + w <= rect.right && y >= rect.top && y + h <= rect.bottom,
              otherCardOverlap: windows.some(
                (other) => other.left !== rect.left && overlap(icon, other),
              ),
            };
          }),
          groupFrames: ['bomb', 'shake'].map((action) => {
            const members = [
              ...document.querySelectorAll(`.hand .slot[data-hand-action="${action}"]`),
            ];
            const cards = members.map((member) =>
              member.querySelector('.card')!.getBoundingClientRect(),
            );
            const first = members[0]!;
            const plate = getComputedStyle(first, '::before');
            const left = first.getBoundingClientRect().left + parseFloat(plate.left);
            const right = left + parseFloat(plate.width);
            const last = members.at(-1)!.getBoundingClientRect();
            const neighbor = first.parentElement!.querySelector('.slot:not([data-hand-action])');
            return {
              action,
              count: members.length,
              aligned: cards.every((card) => Math.abs(card.top - cards[0]!.top) < 0.02),
              sameSize: cards.every(
                (card) =>
                  Math.abs(card.width - cards[0]!.width) < 0.02 &&
                  Math.abs(card.height - cards[0]!.height) < 0.02,
              ),
              evenGap: cards
                .slice(1)
                .every((card, index) => Math.abs(card.left - cards[index]!.right - 8) < 0.02),
              border: parseFloat(plate.borderTopWidth),
              color: plate.borderTopColor,
              background: plate.backgroundColor,
              joined: right >= last.right + 2,
              separate: !neighbor || right < neighbor.getBoundingClientRect().left,
              content: plate.content,
            };
          }),
          inside: slots.every(
            (r) => r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
          ),
          scoreSize: getComputedStyle(document.querySelector('.score b')!).fontSize,
          secondarySize: getComputedStyle(document.querySelector('.balance')!).fontSize,
          tnum: getComputedStyle(document.querySelector('.seat-bar')!).fontVariantNumeric,
        };
      });
      expect(report.windows).toHaveLength(10);
      for (const r of report.cardSizes) {
        expect(r.width).toBeCloseTo(report.cardSizes[0]!.width, 2);
        expect(r.height).toBeCloseTo(report.cardSizes[0]!.height, 2);
      }
      for (const r of report.windows) {
        expect(r.width).toBeCloseTo(report.cardSizes[0]!.width, 2);
        expect(r.height).toBeCloseTo(report.cardSizes[0]!.height, 2);
      }
      expect(report.panelsInsideFrame).toBe(true);
      expect(report.myCountersClear).toBe(true);
      expect(
        report.windows
          .slice(0, 5)
          .every((r) => r.height >= (width >= 410 ? 56 : 50) && r.width >= 48),
      ).toBe(true);
      if (width === 412 && height === 915)
        expect(report.windows[0]!.height).toBeCloseTo(report.windows[9]!.height, 1);
      expect(report.addOnNodes).toBe(0);
      expect(report.slotOverlap).toBe(false);
      expect(report.monthMarks).toBe(0);
      expect(report.actionMarks).toBe(6);
      await expect(page.locator('.hand')).not.toContainText(/먹기|확정|폭탄|흔들/);
      expect(
        report.stateStyles
          .filter((s) => s.cue === 'matchable' && !s.action)
          .every((s) => s.lift === '0px -2px' && s.line === 'solid'),
      ).toBe(true);
      expect(
        report.stateStyles
          .filter((s) => s.cue === 'secured' && !s.action)
          .every((s) => s.lift === '0px -4px' && s.line === 'double'),
      ).toBe(true);
      expect(report.actionIcons).toHaveLength(6);
      for (const icon of report.actionIcons) {
        expect(icon.image).toContain(
          icon.action === 'bomb' ? '/skin/bomb-illustrated.webp' : '/skin/bell-illustrated.webp',
        );
        expect(icon.width).toBe(22);
        expect(icon.height).toBe(22);
        expect(icon.otherCardOverlap).toBe(false);
        expect(icon.inside).toBe(true);
      }
      expect(report.groupFrames).toHaveLength(2);
      expect(report.groupFrames.every((f) => f.count === 3 && f.border === 2)).toBe(true);
      expect(report.groupFrames.every((f) => f.aligned && f.sameSize && f.evenGap)).toBe(true);
      expect(report.groupFrames.every((f) => f.content !== 'none' && f.joined && f.separate)).toBe(
        true,
      );
      expect(report.groupFrames[0]!.color).not.toBe(report.groupFrames[1]!.color);
      expect(report.groupFrames[0]!.background).not.toBe(report.groupFrames[1]!.background);
      const actionArt = page.locator('.hand .slot[data-hand-action="bomb"] .art-window').first();
      const animation = () =>
        actionArt.evaluate((el) => getComputedStyle(el, '::after').animationName);
      await page
        .locator('.app-root')
        .evaluate((el) => el.setAttribute('data-effect-intensity', 'subtle'));
      expect(await animation()).toBe('none');
      await page
        .locator('.app-root')
        .evaluate((el) => el.setAttribute('data-effect-intensity', 'strong'));
      expect(await animation()).toBe('skin-action-breath');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await animation()).toBe('none');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page
        .locator('.app-root')
        .evaluate((el) => el.setAttribute('data-effect-intensity', 'off'));
      expect(await animation()).toBe('none');
      await expect(page.locator('.hand')).not.toContainText(/대기|폭3|흔3/);
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
    test(`${width}px ${fixture}: 월 묶음과 48px 노출`, async ({ page }, info) => {
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
