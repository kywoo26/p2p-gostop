// #46/#47 · UX-01~09 / plan .1-A: 실제 최소 viewport와 안전 영역 예산.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const [width, height] of [
  [360, 780],
  [390, 734],
  [430, 822],
  [412, 915],
] as const) {
  for (const state of [
    'play',
    'target',
    'gostop',
    'gukjin',
    'shake',
    'chongtong',
    'target-expanded',
    'gostop-expanded',
    'play-expanded',
    'bomb',
    'first',
    'flip',
    'event',
    'event-target',
  ]) {
    test(
      `${width}×${height} ${state}: 6행·12월/뻑·손패10·입력 무가림`,
      { tag: '@visual' },
      async ({ page }, info) => {
        await page.setViewportSize({ width, height });
        await page.goto(`./#/dev/gallery/layout-${state}`);
        await page.evaluate(() => document.fonts.ready);
        if (state === 'bomb') await page.locator('[data-slot="2"]').click();
        // UX-05의 보수적 안전 영역 34+24px. 실기기 env() 측정의 대체가 아님.
        await page.locator('.board').evaluate((el) => {
          (el as HTMLElement).style.setProperty('--board-safe-top', '34px');
          (el as HTMLElement).style.setProperty('--board-safe-bottom', '24px');
        });
        const report = await page.evaluate(() => {
          const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          const intersects = (a: DOMRect, b: DOMRect) =>
            Math.min(a.right, b.right) > Math.max(a.left, b.left) + 0.5 &&
            Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 0.5;
          const selectors = [
            '.hud',
            '.captured-zone',
            '.center',
            '.decision-area',
            '.captured-zone.mine',
            '.hand-zone',
          ];
          const areas = selectors.map(box);
          const collisions: string[] = [];
          for (let i = 0; i < areas.length; i++)
            for (let j = i + 1; j < areas.length; j++)
              if (intersects(areas[i]!, areas[j]!))
                collisions.push(`${selectors[i]} / ${selectors[j]}`);
          const floor = box('.floor');
          const groups = [...document.querySelectorAll('.floor .group')].map((el) =>
            el.getBoundingClientRect(),
          );
          const buttons = [...document.querySelectorAll('.decision-area button')];
          const small = buttons
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width < 48 || r.height < 48;
            })
            .map((el) => el.textContent);
          const clipped = buttons
            .filter((el) => {
              const r = el.getBoundingClientRect(),
                p = box('.decision-area');
              return r.top < p.top - 1 || r.bottom > p.bottom + 1 || r.right > p.right + 1;
            })
            .map((el) => el.textContent);
          const handHit = [...document.querySelectorAll('.hand .slot')].every((el) => {
            const r = el.getBoundingClientRect();
            // 선택 중 배경은 inert라 hit-test에서 빠져야 한다. 그림의 무가림은 위 기하/PNG로 검사.
            const locked = el.closest('[inert]') !== null;
            return [4, 24, 44].every((x) =>
              [4, 24, 44].every(
                (y) => el.contains(document.elementFromPoint(r.left + x, r.top + y)) !== locked,
              ),
            );
          });
          const marks = [...document.querySelectorAll('.hand .row:first-child .slot')].map((el) => {
            const r = el.getBoundingClientRect();
            // 상단 48×48이 다음 손패 줄과 겹치지 않는 유효 영역.
            return [...document.querySelectorAll('.hand .row:nth-child(2) .slot')].every(
              (other) => other.getBoundingClientRect().top >= r.top + 48,
            );
          });
          return {
            collisions,
            small,
            clipped,
            marks,
            handHit,
            floorHeight: box('.center').height,
            groups: groups.length,
            groupsInside: groups.every(
              (r) =>
                r.top >= floor.top - 1 &&
                r.bottom <= floor.bottom + 1 &&
                r.left >= floor.left - 1 &&
                r.right <= floor.right + 1,
            ),
            handCount: document.querySelectorAll('.hand .slot').length,
            inside: areas.every(
              (r) =>
                r.left >= 8 &&
                r.right <= innerWidth - 8 &&
                r.top >= 34 &&
                r.bottom <= innerHeight - 24,
            ),
            overflow: [
              document.documentElement.scrollWidth - innerWidth,
              document.documentElement.scrollHeight - innerHeight,
            ],
            promptGap: document.querySelector('.prompt')
              ? box('.hand').top - box('.prompt').bottom
              : null,
          };
        });
        expect(report.collisions).toEqual([]);
        expect(report.small).toEqual([]);
        expect(report.clipped).toEqual([]);
        expect(report.marks.every(Boolean)).toBe(true);
        expect(report.handHit).toBe(true);
        expect(report.floorHeight).toBeGreaterThanOrEqual(208);
        expect(report.groups).toBe(12);
        expect(report.handCount).toBe(state === 'first' ? 0 : 10);
        expect(report.groupsInside).toBe(true);
        expect(report.inside).toBe(true);
        expect(report.overflow).toEqual([0, 0]);
        if (report.promptGap !== null) expect(report.promptGap).toBeGreaterThanOrEqual(16);
        if (state.includes('target')) {
          for (const id of [32, 33]) {
            const button = page.locator(`[data-choice="target-${id}"]`);
            await expect(button.locator(`img[src$="/${id}.svg"]`)).toBeVisible();
          }
        }
        if (state === 'event') {
          const rail = await page.getByTestId('event-rail').boundingBox();
          const area = await page.locator('.decision-area').boundingBox();
          expect(rail!.y).toBeGreaterThanOrEqual(area!.y);
          expect(rail!.y + rail!.height).toBeLessThanOrEqual(area!.y + area!.height);
        }
        await info.attach('minimum-layout', {
          body: JSON.stringify(report, null, 2),
          contentType: 'application/json',
        });
        if (state === 'target' || state === 'gostop-expanded') {
          const { violations } = await new AxeBuilder({ page }).analyze();
          expect(violations).toEqual([]);
          await expect(page).toHaveScreenshot(`${state}-${width}x${height}.png`);
        }
      },
    );
  }
}

test('압축 획득패 상세: 카드 이름·키보드 닫기·초점 복귀', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 734 });
  await page.goto('./#/dev/gallery/board');
  const opener = page.getByRole('button', { name: '판 정보' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '판 정보' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '내 획득패' })).toBeVisible();
  expect(await dialog.locator('img').count()).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test('가로 방향 입력 잠금·세로 복귀', async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 360 });
  await page.goto('./#/dev/gallery/layout-play');
  await expect(page.getByRole('alert')).toHaveText('세로로 돌려 게임을 계속하세요');
  expect(await page.locator('.hand button:enabled').count()).toBe(0);
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.locator('.hand button:enabled').count()).toBe(10);
});
