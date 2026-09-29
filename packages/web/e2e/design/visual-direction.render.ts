import { expect, test } from '@playwright/test';
import { mkdir, stat, writeFile } from 'node:fs/promises';

// 문서 목업의 렌더 검증. 엔진 규칙·앱 행동을 시험하는 픽스처가 아니다.
for (const theme of ['ink', 'club', 'pop']) {
  for (const scene of ['home', 'game', 'gostop', 'ppeok', 'jjok', 'settlement']) {
    test(`${theme} / ${scene}`, async ({ page }, testInfo) => {
      const external: string[] = [];
      const errors: string[] = [];
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) external.push(request.url());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(
        `file:///work/docs/design/mockups/prototype.html?theme=${theme}&scene=${scene}`,
      );
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(async () => {
        await Promise.all([...document.images].map((img) => img.decode()));
        const font = getComputedStyle(document.body).fontFamily.split(',')[0]!;
        const digits = [...'0123456789'].map((digit) => {
          const el = document.createElement('span');
          el.style.cssText =
            'position:absolute;visibility:hidden;width:max-content;white-space:pre;font-size:24px;font-variant-numeric:tabular-nums';
          el.textContent = digit;
          document.body.append(el);
          const width = el.getBoundingClientRect().width;
          el.remove();
          return width;
        });
        return {
          fontLoaded: document.fonts.check(`16px ${font}`),
          loadedFaces: [...document.fonts].filter((face) => face.status === 'loaded').length,
          images: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
          buttons: [...document.querySelectorAll('button')].every((el) => {
            const r = el.getBoundingClientRect();
            return r.width >= 48 && r.height >= 48 && r.top >= 0 && r.bottom <= 915;
          }),
          scroll:
            document.documentElement.scrollWidth > 412 ||
            document.documentElement.scrollHeight > 915,
          verticalText: [...document.querySelectorAll('#app *')].some((el) =>
            getComputedStyle(el).writingMode.startsWith('vertical'),
          ),
          digitSpread: Math.max(...digits) - Math.min(...digits),
          handOverlap: (() => {
            const hand = document.querySelector('.hand');
            const prompt = document.querySelector('.prompt');
            return hand && prompt
              ? prompt.getBoundingClientRect().bottom > hand.getBoundingClientRect().top
              : false;
          })(),
        };
      });
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
      expect(layout.fontLoaded).toBe(true);
      expect(layout.loadedFaces).toBeGreaterThan(0);
      expect(layout.images).toBe(true);
      expect(layout.buttons).toBe(true);
      expect(layout.scroll).toBe(false);
      expect(layout.verticalText).toBe(false);
      if (scene === 'home') {
        // 기능 라벨 외 홍보 문구가 다시 들어오는 것을 막는다.
        expect(await page.locator('#app').innerText()).toMatch(
          /^◈홈\s*☰\s*맞고\s*친구와 대전\s*↗\s*혼자 연습\s*→\s*기록\s*설정\s*진단$/,
        );
      }
      if (scene === 'settlement') {
        expect(await page.locator('.result-heading').innerText()).toBe('3번째 판 · 스톱\n승리');
        expect(await page.locator('.result-foot').innerText()).toBe('3판 완료');
      }
      expect(layout.handOverlap).toBe(false);
      // Linux Chromium에서는 단일 글리프 측정에 최대 1 CSS px 편차가 관찰된다.
      // 실제 금액은 고정 열에 우측 정렬한다. 실기기 숫자 정렬 검증은 별도다.
      expect(layout.digitSpread).toBeLessThanOrEqual(1);
      if (scene === 'game') {
        const sources = await page
          .locator('.prompt.target img')
          .evaluateAll((images) => images.map((img) => img.getAttribute('src')));
        expect(sources).toEqual([
          '../../../packages/web/public/cards/13.svg',
          '../../../packages/web/public/cards/15.svg',
        ]);
      }
      if (testInfo.project.name === 'chromium') {
        await mkdir('/work/docs/design/mockups/.rendered', { recursive: true });
        await writeFile(
          `/work/docs/design/mockups/.rendered/${theme}-${scene}.txt`,
          await page.locator('#app').innerText(),
        );
        const path = `/work/docs/design/mockups/${theme}-${scene}.png`;
        await page.screenshot({ path, scale: 'css', animations: 'disabled' });
        expect((await stat(path)).size).toBeLessThanOrEqual(300000);
      }
    });
  }
}
