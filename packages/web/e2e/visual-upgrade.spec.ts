// VU-01~04 / NF-03·08: 출시 A와 분리된 실제 Home/Board 프로토타입.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { TIMING_FIXTURES, timingSave } from './timing-fixtures.ts';

test.use({ deviceScaleFactor: 1 });
for (const rich of [false, true])
  for (const id of ['match-capture', 'banner'] as const) {
    test(`시각 실험 실제 솔로 ${rich ? 'rich' : 'base'} ${id}: 3D·사건 연결`, async ({ page }) => {
      const fixture = TIMING_FIXTURES.find((item) => item.id === id)!;
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`./?visual=upgrade&${rich ? 'variant=rich&' : ''}speed=normal#/`);
      await page.evaluate(
        (save) => localStorage.setItem('gostop.solo.v1', JSON.stringify(save)),
        timingSave(fixture),
      );
      await page.reload();
      await page.getByRole('button', { name: /이어하기/ }).click();
      await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
      await page.evaluate(() => {
        const observer = new MutationObserver((records) => {
          if (
            records.some((record) => (record.target as HTMLElement).dataset['depthFlip'] === 'true')
          ) {
            document.documentElement.dataset['depthObserved'] = 'true';
            observer.disconnect();
          }
        });
        observer.observe(document.querySelector('.board')!, {
          subtree: true,
          attributes: true,
          attributeFilter: ['data-depth-flip'],
        });
      });
      await page
        .locator(`.hand [data-slot="${fixture.card}"]`)
        .click({ position: { x: 20, y: 20 } });
      await expect(page.locator('html')).toHaveAttribute('data-depth-observed', 'true');
      if (id === 'banner') await expect(page.locator('.impact')).toBeVisible();
      await expect(page.getByTestId('solo')).toHaveAttribute('data-play-timings', /^\d+$/);
      await expect(page.locator('.vu-motion-trail, .vu-sheen')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
for (const state of ['home', 'feedback-play', 'upgrade-ppeok', 'upgrade-jjok']) {
  test(`시각 실험 412×915 ${state}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 412, height: 915 });
    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url());
    });
    await page.goto(`./?visual=upgrade&impact-frame=0.25#/dev/gallery/${state}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    await expect(page.locator('html')).toHaveAttribute('data-visual', 'upgrade');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(external).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${state}-412x915.png`), fullPage: true });
  });
}

for (const rich of [false, true])
  for (const [width, height] of [
    [360, 780],
    [390, 734],
    [430, 822],
    [412, 915],
  ]) {
    test(`시각 실험 ${rich ? 'rich' : 'base'} ${width}×${height} 입력·보조 띠 무가림`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: width!, height: height! });
      await page.goto(`./?visual=upgrade&${rich ? 'variant=rich' : ''}#/dev/gallery/feedback-stop`);
      const result = await page.evaluate(() => {
        const board = document.querySelector('.board')!;
        const hand = [...document.querySelectorAll('.hand .slot')].map((el) =>
          el.getBoundingClientRect(),
        );
        const actions = [...document.querySelectorAll('[data-choice]')].map((el) =>
          el.getBoundingClientRect(),
        );
        return {
          scroll: board.scrollHeight - board.clientHeight,
          hand: hand.length,
          input: [...hand, ...actions].every(
            (r) =>
              r.width >= 48 &&
              r.height >= 48 &&
              r.bottom <= innerHeight &&
              r.left >= 0 &&
              r.right <= innerWidth,
          ),
          floor: document.querySelector('.center')!.getBoundingClientRect().height,
        };
      });
      expect(result).toMatchObject({ scroll: 0, hand: 10, input: true });
      expect(result.floor).toBeGreaterThanOrEqual(208);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }

test('시각 실험 reduced-motion은 사건 정보를 남기고 파티클을 숨긴다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?visual=upgrade#/dev/gallery/upgrade-ppeok');
  await expect(page.locator('.banner')).toContainText('뻑');
  await expect(page.locator('.impact')).toBeHidden();
});

for (const state of [
  'feedback-play',
  'upgrade-ppeok',
  'upgrade-jjok',
  'upgrade-ttadak',
  'upgrade-bomb',
  'upgrade-go',
  'upgrade-motion',
  'settlement',
]) {
  test(`강화 변형 412×915 ${state}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto(`./?visual=upgrade&variant=rich&impact-frame=0.25#/dev/gallery/${state}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    if (state === 'upgrade-motion') {
      await expect(page.locator('.vu-sheen')).toHaveCount(1);
      await expect
        .poll(() =>
          page.locator('.vu-sheen').evaluate((el) => Number(getComputedStyle(el).opacity)),
        )
        .toBeGreaterThan(0.1);
      await expect
        .poll(() =>
          page.locator('.vu-motion-trail').evaluate((el) => Number(getComputedStyle(el).opacity)),
        )
        .toBeGreaterThan(0.1);
    }
    if (state === 'settlement') {
      const amount = page.locator('.amount strong');
      const value = await amount.textContent();
      await page.waitForTimeout(100);
      await expect(amount).toHaveText(value!);
    } else await expect(page.locator('.vu-avatar')).toHaveCount(2);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`rich-${state}-412x915.png`) });
  });
}

test('강화 변형 정산 reduced-motion: 최종 금액·다음 판 유지', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?visual=upgrade&variant=rich#/dev/gallery/settlement');
  await expect(page.locator('.impact')).toBeHidden();
  await expect(page.locator('.amount strong')).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 판' })).toBeEnabled();
});
