// VD-04·UX-11/13·NF-01/07/08: 실제 로컬 폰트/숫자/초점 계약.
import { expect, test } from '@playwright/test';

for (const [width, height] of [
  [360, 780],
  [390, 734],
  [430, 822],
  [412, 915],
]) {
  test(`A 폰트 ${width}×${height}: 로컬1종·가변 숫자·대비·초점 @fonts ${width === 360 ? '' : '@full'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const external: string[] = [];
    const fonts = new Set<string>();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname))
        external.push(url.href);
      if (url.pathname.endsWith('.woff2')) fonts.add(url.pathname);
    });
    await page.goto('./#/dev/gallery/home');
    await expect(page.getByRole('link', { name: '핫스팟 대전' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const measured = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const luminance = (color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const rgb = [...ctx.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map((n) => n / 255)
          .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
        return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
      };
      const contrast = (a: string, b: string) => {
        const x = luminance(root.getPropertyValue(`--color-${a}`)),
          y = luminance(root.getPropertyValue(`--color-${b}`));
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const spreads = [400, 500, 700, 800].map((weight) => {
        const widths = [...'0123456789'].map((digit) => {
          const span = document.createElement('span');
          span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:GostopSans;font-size:24px;font-weight:${weight};font-variant-numeric:tabular-nums`;
          // #92 조사와 같은 단일 글리프 계측: Linux Chromium의 최대 1px 편차를 기록한다.
          // 10자리 누적 폭의 완전 일치를 주장하지 않는다. 금액은 고정 열에 우측 정렬한다.
          span.textContent = digit;
          document.body.append(span);
          const value = span.getBoundingClientRect().width;
          span.remove();
          return value;
        });
        return Math.max(...widths) - Math.min(...widths);
      });
      return {
        loaded: [...document.fonts].some(
          (face) => face.family === 'GostopSans' && face.status === 'loaded',
        ),
        spreads,
        text: ['bg', 'surface', 'surface-raised', 'felt'].flatMap((bg) =>
          ['text', 'text-muted'].map((fg) => contrast(fg, bg)),
        ),
        action: contrast('on-accent', 'accent'),
        focus: contrast('focus', 'surface-raised'),
        border: contrast('control-border', 'surface-raised'),
        reduced: root.getPropertyValue('--dur-scale').trim(),
      };
    });
    expect(measured.loaded).toBe(true);
    expect(fonts.size).toBe(1);
    expect(external).toEqual([]);
    for (const spread of measured.spreads) expect(spread).toBeLessThanOrEqual(1);
    for (const ratio of measured.text) expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(measured.action).toBeGreaterThanOrEqual(4.5);
    expect(measured.focus).toBeGreaterThanOrEqual(3);
    expect(measured.border).toBeGreaterThanOrEqual(3);
    expect(measured.reduced).toBe('0');
    await page.keyboard.press('Tab');
    const focus = await page.locator(':focus-visible').evaluate((el) => {
      const rect = el.getBoundingClientRect(),
        style = getComputedStyle(el);
      return {
        width: style.outlineWidth,
        inside:
          rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      };
    });
    expect(focus.width).toBe('2px');
    expect(focus.inside).toBe(true);
  });
}

test('A OFL 원문: 로컬 고지·키보드 열기·원 저작권 @fonts', async ({ page }) => {
  await page.goto('./#/license');
  await expect(page.getByRole('heading', { name: '글꼴' })).toBeVisible();
  const summary = page.getByText('폰트 라이선스 원문', { exact: true });
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('pre')).toContainText('SIL OPEN FONT LICENSE Version 1.1');
  await expect(page.locator('pre')).toContainText('Reserved Font Name Pretendard');
  expect(await page.locator('a[href^="http"]').count()).toBe(0);
});
