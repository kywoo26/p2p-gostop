// 갤러리 회귀(spec AC-05) + axe. D1 변경 화면은 접근성 트리 기준값과 cards.spec.ts 기하/대비로 검증한다.
// 새 PNG는 test-results 첨부에만 둔다. 변경 없는 화면은 기존 픽셀 회귀를 유지한다.
// 기준 이미지: e2e/__screenshots__/gallery.spec.ts/<이름>-<chromium|webkit>.png
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const CARD_ART_PAGES = new Set([
  'gallery-index',
  'cards',
  'card-sizes',
  'board',
  'board-target',
  'board-gostop',
  'license',
]);

const PORTRAIT = { width: 390, height: 844 };
const PORTRAIT_LARGE = { width: 430, height: 932 };

interface GalleryPage {
  readonly name: string;
  /** 해시 경로 */
  readonly hash: string;
  readonly viewports?: readonly { width: number; height: number }[];
  /** 빌드마다 바뀌는 요소 */
  readonly mask?: readonly string[];
}

const PAGES: readonly GalleryPage[] = [
  { name: 'gallery-index', hash: '#/dev/gallery' },
  { name: 'cards', hash: '#/dev/gallery/cards' },
  { name: 'card-sizes', hash: '#/dev/gallery/card-sizes' },
  { name: 'board', hash: '#/dev/gallery/board', viewports: [PORTRAIT, PORTRAIT_LARGE] },
  { name: 'board-target', hash: '#/dev/gallery/board-target' },
  { name: 'board-gostop', hash: '#/dev/gallery/board-gostop' },
  { name: 'banners', hash: '#/dev/gallery/banners' },
  { name: 'settlement', hash: '#/dev/gallery/settlement' },
  { name: 'home', hash: '#/dev/gallery/home', mask: ['[data-testid="build-id"]', 'footer time'] },
  { name: 'host', hash: '#/dev/gallery/host' },
  { name: 'guest', hash: '#/dev/gallery/guest' },
  { name: 'records', hash: '#/dev/gallery/records' },
  { name: 'settings', hash: '#/dev/gallery/settings' },
  { name: 'diagnostics', hash: '#/dev/gallery/diagnostics' },
  { name: 'license', hash: '#/license' },
];

// 기준 이미지를 작게 유지하려고 1배율로 찍는다(레이아웃 회귀 검출이 목적).
test.use({ deviceScaleFactor: 1, viewport: PORTRAIT });

/** 카드 SVG와 글꼴이 모두 그려질 때까지 */
async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
  );
}

for (const { name, hash, viewports = [PORTRAIT], mask = [] } of PAGES) {
  for (const viewport of viewports) {
    const id = viewports.length > 1 ? `${name}-${viewport.width}x${viewport.height}` : name;

    test(`갤러리 ${id}: 스크린샷·axe`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.goto(`./${hash}`);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await settled(page);

      if (CARD_ART_PAGES.has(name)) {
        expect(await page.locator('body').ariaSnapshot()).toMatchSnapshot(`${id}.aria.txt`);
        await info.attach(id, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      } else {
        await expect(page).toHaveScreenshot(`${id}.png`, {
          fullPage: true,
          mask: mask.map((selector) => page.locator(selector)),
        });
      }

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        blocking.map(
          (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  }
}
