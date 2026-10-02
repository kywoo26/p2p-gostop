// UX-H01/UX-H05, FR-46~50: 게임 규칙 판정과 분리된 시각 슬롯·그림 무가림.
import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { cueSave } from './hand-feedback-fixtures.ts';

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
        const board = document.querySelector('.board')!;
        const boardRect = board.getBoundingClientRect();
        const panelsInsideFrame = [
          ...document.querySelectorAll('.scoreboard, .captured-zone, .hand-zone'),
        ].every((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.top >= boardRect.top &&
            r.left >= boardRect.left &&
            r.right <= boardRect.right &&
            r.bottom <= boardRect.bottom
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
            const style = getComputedStyle(el.querySelector('.card')!);
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
            const art = el.querySelector('.card')!;
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
                .every(
                  (card, index) =>
                    card.left - cards[index]!.right >= 3.9 &&
                    Math.abs(card.left - cards[index]!.right - (cards[1]!.left - cards[0]!.right)) <
                      0.05,
                ),
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
          .every((s) => s.lift === 'none' && s.line === 'solid'),
      ).toBe(true);
      expect(
        report.stateStyles
          .filter((s) => s.cue === 'secured' && !s.action)
          .every((s) => s.lift === 'none' && s.line === 'double'),
      ).toBe(true);
      expect(report.actionIcons).toHaveLength(6);
      for (const icon of report.actionIcons) {
        expect(icon.image).toContain(
          icon.action === 'bomb' ? '/skin/bomb-illustrated.webp' : '/skin/bell-illustrated.webp',
        );
        expect(icon.width).toBe(20);
        expect(icon.height).toBe(20);
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
      const actionArt = page.locator('.hand .slot[data-hand-action="bomb"] .card').first();
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
      expect(report.secondarySize).toBe('16px');
      expect(report.tnum).toContain('tabular-nums');
      await expect(page.locator('[data-hand-group="1"]')).toHaveCount(3);
      await expect(page.locator('[data-hand-action="shake"]')).toHaveCount(3);
      await expect(page.locator('[data-hand-action="bomb"]')).toHaveCount(3);
      await expect(page.locator('[data-hand-cue="secured"]')).toHaveCount(1);
      if (state === 'stop') {
        await expect(page.locator('[data-choice="stop"]')).toHaveAccessibleName('스톱 · 2,400냥');
        await expect(page.locator('.risk-kind')).toHaveAccessibleName('피박 위험');
      } else {
        await expect(page.locator('.board')).toHaveAttribute('data-awaiting', 'me');
        await expect(page.locator('.menu-reserved')).toHaveText('메뉴');
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
      // lazy page의 실제 손패가 생성된 뒤 같은 기하 단언을 실행한다.
      await expect(page.locator('.hand .slot')).toHaveCount(10);
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

// 같은 실제 공개 scenario의 상태별 기준샷. 갤러리 시각 슬롯은 판정 기대값으로 쓰지 않는다.
for (const [width, height] of [
  [360, 780],
  [390, 734],
  [412, 915],
] as const) {
  test(`${width}px 매칭·확정·누름·초점 외곽 @layout`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await openCues(page, 'basic');
    const matching = page.locator('[data-slot="32"]');
    const secured = page.locator('[data-slot="24"]');
    await expect(matching).toHaveAttribute('data-hand-cue', 'matchable');
    await expect(secured).toHaveAttribute('data-hand-cue', 'secured');
    await expect(page.locator('[data-slot="36"]')).not.toHaveAttribute('data-hand-cue');
    await expect(secured).toHaveAccessibleName(/확정 획득 짝/);
    await expect(matching).toHaveAccessibleName(/먹을 수 있음/);
    const before = await page.locator('.hand .slot').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
    );
    const report = await page.evaluate(() => {
      const slots = [...document.querySelectorAll<HTMLElement>('.hand .slot')];
      const art = slots.map((el) => el.querySelector('.art-window')!.getBoundingClientRect());
      const overlap = (a: DOMRect, b: DOMRect) =>
        Math.min(a.right, b.right) > Math.max(a.left, b.left) + 0.01 &&
        Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 0.01;
      const rgb = (color: string) => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const luminance = (color: string) =>
        rgb(color)
          .map((v) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          })
          .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i]!, 0);
      const contrast = (a: string, b: string) => {
        const x = luminance(a),
          y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const styles = slots
        .filter((el) => el.dataset['handCue'])
        .map((el) => {
          const style = getComputedStyle(el.querySelector('.card')!);
          return {
            cue: el.dataset['handCue'],
            action: el.dataset['handAction'],
            width: parseFloat(style.outlineWidth),
            line: style.outlineStyle,
            contrast: contrast(style.outlineColor, style.getPropertyValue('--color-hand-cue-base')),
            animation: style.animationName,
            transform: style.transform,
          };
        });
      const clear = slots.every((el, i) => {
        const r = art[i]!;
        const style = getComputedStyle(el.querySelector('.card')!);
        const extension = style.outlineStyle === 'none' ? 0 : parseFloat(style.outlineWidth) + 1;
        const outer = new DOMRect(
          r.x - extension,
          r.y - extension,
          r.width + 2 * extension,
          r.height + 2 * extension,
        );
        return art.every((other, j) => i === j || !overlap(outer, other));
      });
      const actionGaps = ['bomb', 'shake'].map((action) => {
        const els = slots.filter((el) => el.dataset['handAction'] === action);
        return els.slice(1).map((el, i) => {
          const left = el.querySelector('.card')!;
          const right = els[i]!.querySelector('.card')!;
          return (
            left.getBoundingClientRect().left -
            parseFloat(getComputedStyle(left).outlineWidth) -
            right.getBoundingClientRect().right -
            parseFloat(getComputedStyle(right).outlineWidth)
          );
        });
      });
      return {
        styles,
        clear,
        actionGaps,
        art: art.map((r) => ({ width: r.width, height: r.height })),
        marks: document.querySelectorAll('.hand .mark,.floor .mark').length,
      };
    });
    expect(report.clear).toBe(true);
    expect(report.marks).toBe(0);
    expect(report.art.every((r) => r.width >= 48 && r.height >= 48)).toBe(true);
    expect(
      report.styles
        .filter((s) => s.cue === 'matchable')
        .every((s) => s.width === 3 && s.line === 'solid'),
    ).toBe(true);
    expect(
      report.styles
        .filter((s) => s.cue === 'secured')
        .every((s) => s.width === 4 && s.line === 'double'),
    ).toBe(true);
    expect(report.styles.every((s) => s.contrast >= 3 && s.animation === 'none')).toBe(true);
    for (let i = 0; i < 2; i++)
      expect(Math.abs(report.actionGaps[0]![i]! - report.actionGaps[1]![i]!)).toBeLessThanOrEqual(
        0.02,
      );
    await info.attach('외곽 대비·행동 간격·도상 가림', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
    await writeFile(info.outputPath('cue-measurements.json'), JSON.stringify(report, null, 2));
    await expect(page).toHaveScreenshot(`cues-${width}-normal.png`);
    await page.keyboard.press('Tab');
    await secured.focus();
    await expect(secured).toBeFocused();
    await expect(page.locator('.floor .card.highlight[data-card-id="25"]')).toHaveCount(1);
    expect(await secured.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await secured.locator('.card').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
      'double',
    );
    await expect(page).toHaveScreenshot(`cues-${width}-focus.png`);
    await secured.evaluate((el) => (el as HTMLElement).blur());
    const box = (await matching.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.locator('.floor .card.highlight[data-card-id="33"]')).toHaveCount(1);
    expect(await matching.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed');
    expect(
      await matching.locator('.card').evaluate((el) => getComputedStyle(el).outlineWidth),
    ).toBe('3px');
    await expect(page).toHaveScreenshot(`cues-${width}-press.png`);
    expect(
      await page.locator('.hand .slot').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        }),
      ),
    ).toEqual(before);
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await expect(page.locator('.floor .card.highlight[data-card-id="33"]')).toHaveCount(0);
    for (const intensity of ['off', 'subtle', 'strong']) {
      await page
        .locator('.app-root')
        .evaluate((el, value) => el.setAttribute('data-effect-intensity', value), intensity);
      for (const motion of ['reduce', 'no-preference'] as const) {
        await page.emulateMedia({ reducedMotion: motion });
        expect(
          await secured
            .locator('.card')
            .evaluate((el) => [
              getComputedStyle(el).outlineStyle,
              getComputedStyle(el).outlineWidth,
              getComputedStyle(el).animationName,
            ]),
        ).toEqual(['double', '4px', 'none']);
        expect(
          await matching
            .locator('.card')
            .evaluate((el) => [
              getComputedStyle(el).outlineStyle,
              getComputedStyle(el).outlineWidth,
            ]),
        ).toEqual(['solid', '3px']);
      }
    }
    // 실제 FLIP 계약의 will-change 부착/회수만 소비한다. 시간축·타이머는 만들지 않는다.
    const card = secured.locator('.card');
    await card.evaluate((el) => ((el as HTMLElement).style.willChange = 'transform'));
    await expect
      .poll(() =>
        secured
          .locator('.card')
          .evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).boxShadow]),
      )
      .toEqual(['none', 'none']);
    await card.evaluate((el) => ((el as HTMLElement).style.willChange = ''));
    expect(await secured.locator('.card').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
      'double',
    );
    await page
      .locator('.app-root')
      .evaluate((el) => el.setAttribute('data-effect-intensity', 'off'));
    await page.keyboard.press('Tab');
    await page.locator('[data-slot="0"]').focus();
    await expect(page.locator('.group-selected')).toHaveCount(3);
    await expect(page).toHaveScreenshot(`cues-${width}-group.png`);
  });

  for (const hint of ['off', 'basic', 'detail'] as const) {
    test(`${width}px ${hint}: 누름·키보드 바닥 예고와 입력 @layout`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openCues(page, hint);
      const card = page.locator('[data-slot="32"]');
      await page.keyboard.press('Tab');
      await card.focus();
      await expect(card).toBeFocused();
      await expect(card).toBeEnabled();
      await expect(page.locator('.floor .card.highlight[data-card-id="33"]')).toHaveCount(
        hint === 'off' ? 0 : 1,
      );
      if (hint === 'off') {
        await expect(
          page.locator('.hand [data-hand-cue],.hand [data-hand-action],.floor [data-hand-link]'),
        ).toHaveCount(0);
        await expect(page).toHaveScreenshot(`cues-${width}-off.png`);
      }
      await card.evaluate((el) => (el as HTMLElement).blur());
      const box = (await card.boundingBox())!;
      await page.mouse.move(box.x + 12, box.y + 40);
      await page.mouse.down();
      await expect(page.locator('.floor .card.highlight[data-card-id="33"]')).toHaveCount(
        hint === 'off' ? 0 : 1,
      );
      await page.mouse.move(1, 1);
      await page.mouse.up();
    });
  }
}

async function openCues(page: Page, hint: 'off' | 'basic' | 'detail') {
  await page.addInitScript(
    ({ save, hint }) => {
      localStorage.setItem('gostop.solo.v1', JSON.stringify(save));
      localStorage.setItem(
        'gostop.settings.v1',
        JSON.stringify({ hintLevel: hint, effectIntensity: 'off', sound: false, vibrate: false }),
      );
    },
    { save: cueSave(), hint },
  );
  await page.goto('./?speed=instant#/game');
  await expect(page.locator('[data-slot="32"]')).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}
