// 개발 갤러리 스크린샷 회귀(spec AC-05) + 접근성(axe, serious·critical 0건). 도커 e2e 이미지 안에서만 결정적이다.
// 기준 이미지: e2e/__screenshots__/gallery.spec.ts/<이름>-<chromium|webkit>.png
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

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

    test(`갤러리 ${id}: 스크린샷·axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`./${hash}`);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await settled(page);

      await expect(page).toHaveScreenshot(`${id}.png`, {
        fullPage: true,
        mask: mask.map((selector) => page.locator(selector)),
      });

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
