// D1·spec 6.6/NF-01/03/07/08. S25 Ultra 대역: 실기기 확인과 구별한다.
import { readFile, writeFile } from 'node:fs/promises';
import { ALL_CARD_IDS, getCard } from '@p2p-gostop/engine';
import { expect, test } from '@playwright/test';
import { optimize } from 'svgo';
import map from '../src/cards/map.json' with { type: 'json' };
import svgoConfig from '../svgo.config.mjs';

test('51장 ID·엔진 메타데이터·파일·독립 SVG 일치, 자체 제작 SVGO 재현', async ({ request }) => {
  expect(map.cards.map((c) => c.id)).toEqual([...ALL_CARD_IDS]);
  const bodies = [];
  for (const card of map.cards) {
    const engine = getCard(card.id);
    expect({ month: card.month, kind: card.kind, piValue: card.piValue }).toEqual({
      month: engine.month,
      kind: engine.kind,
      piValue: engine.piValue,
    });
    const response = await request.get(`./cards/${card.id}.svg`);
    expect(response.ok()).toBe(true);
    const svg = await response.text();
    expect(svg).toMatch(/<svg\b/);
    expect(svg).not.toMatch(/<(?:script|filter|image|text)\b/);
    expect(
      svg
        .replaceAll('http://www.w3.org/2000/svg', '')
        .replaceAll('http://www.w3.org/1999/xlink', ''),
    ).not.toMatch(/https?:|data:/);
    bodies.push(svg);
    if (card.source === 'original') {
      const source = await readFile(new URL(`../cards-src/${card.file}`, import.meta.url), 'utf8');
      expect(svg).toBe(optimize(source, { ...svgoConfig, path: card.file }).data);
      expect(Buffer.byteLength(svg)).toBeLessThanOrEqual(8192);
    }
  }
  // 복제 파일로 ID 하나가 조용히 대체되는 경우도 검출한다.
  expect(new Set(bodies).size).toBe(51);
  const back = await request.get('./cards/back.svg');
  const source = await readFile(new URL(`../cards-src/${map.back.file}`, import.meta.url), 'utf8');
  expect(await back.text()).toBe(optimize(source, { ...svgoConfig, path: map.back.file }).data);
});

for (const dpr of [2, 3, 3.5]) {
  test.describe(`카드 DPR ${dpr}`, () => {
    test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: dpr });
    test('크기·색인·대비·로컬 요청, PNG는 실행 산출물에만 저장 @layout', async ({ page }, info) => {
      const external: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url());
      });
      await page.goto('./#/dev/gallery/cards');
      await page.waitForFunction(() =>
        [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      );
      await expect(page.locator('.card')).toHaveCount(156);
      const metrics = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        function luminance(color: string, opacity = 1) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(
            '--color-felt',
          );
          ctx.fillRect(0, 0, 1, 1);
          ctx.globalAlpha = opacity;
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((n) => {
            const s = n / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
        }
        function contrast(a: string, b: string, opacity = 1) {
          const x = luminance(a, opacity),
            y = luminance(b, opacity);
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        }
        const root = getComputedStyle(document.documentElement);
        const token = (name: string) => root.getPropertyValue(name).trim();
        const mark = getComputedStyle(document.querySelector('.mark')!);
        return {
          dpr: devicePixelRatio,
          sizes: ['s', 'm', 'l'].map((size) => {
            const el = document.querySelector(`.size-${size}`)!;
            const rect = el.getBoundingClientRect();
            return [rect.width, rect.height];
          }),
          textContrast: contrast(mark.color, mark.backgroundColor),
          dimmedTextContrast: contrast(mark.color, mark.backgroundColor, 0.7),
          ppeokContrast: contrast(token('--color-event-ppeok-text'), token('--color-card-tag')),
          edgeContrast: contrast(token('--color-card-edge'), token('--color-felt')),
          selectionContrast: contrast(token('--color-event-go'), token('--color-felt')),
          tagFont: parseFloat(mark.fontSize),
          tagHeight: parseFloat(mark.lineHeight),
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      expect(metrics.dpr).toBe(dpr);
      expect(metrics.sizes).toEqual([
        [26, 42],
        [44, 72],
        [62, 101],
      ]);
      expect(metrics.textContrast).toBeGreaterThanOrEqual(4.5);
      expect(metrics.dimmedTextContrast).toBeGreaterThanOrEqual(4.5);
      expect(metrics.ppeokContrast).toBeGreaterThanOrEqual(4.5);
      expect(metrics.edgeContrast).toBeGreaterThanOrEqual(3);
      expect(metrics.selectionContrast).toBeGreaterThanOrEqual(3);
      expect(metrics.tagFont).toBeGreaterThanOrEqual(12);
      expect(metrics.tagHeight).toBeGreaterThanOrEqual(16);
      expect(metrics.overflow).toBe(0);
      expect(external).toEqual([]);
      await writeFile(info.outputPath('card-metrics.json'), JSON.stringify(metrics, null, 2));
      await info.attach('card-metrics', {
        body: JSON.stringify(metrics, null, 2),
        contentType: 'application/json',
      });
      await info.attach('cards', {
        body: await page.screenshot({ fullPage: true, path: info.outputPath('cards.png') }),
        contentType: 'image/png',
      });
      await page.goto('./#/dev/gallery/card-sizes');
      await page.waitForFunction(() =>
        [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      );
      await info.attach('hand-size', {
        body: await page
          .locator('section')
          .nth(2)
          .screenshot({ path: info.outputPath('hand-size.png') }),
        contentType: 'image/png',
      });
      await info.attach('card-sizes', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    });
  });
}

test.describe('S25 Ultra 게임판 표식', () => {
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5 });
  test('더미 수는 뒷면 안에, 바닥·손패 앞면 가림과 별도 배지 0 @layout', async ({ page }, info) => {
    await page.goto('./#/dev/gallery/board');
    // Kit의 초기 문서에는 이미지가 없어 every()가 먼저 참일 수 있다. 실제 판부터 기다린다.
    await expect(page.locator('.deck-count')).toBeVisible();
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    const metrics = await page.evaluate(() => {
      const count = document.querySelector('.deck-count')!.getBoundingClientRect();
      const deck = document.querySelector('.deck .card')!.getBoundingClientRect();
      return {
        floorClear: [...document.querySelectorAll('.floor .card')].every((card) => {
          const rect = card.getBoundingClientRect();
          return (
            rect.top >= count.bottom ||
            rect.bottom <= count.top ||
            rect.left >= count.right ||
            rect.right <= count.left
          );
        }),
        deckInside:
          count.top >= deck.top &&
          count.bottom <= deck.bottom &&
          count.left >= deck.left &&
          count.right <= deck.right,
        handMarks: document.querySelectorAll('.hand .mark').length,
        floorMarks: document.querySelectorAll('.floor .mark').length,
        scrollX: document.documentElement.scrollWidth - innerWidth,
        scrollY: document.documentElement.scrollHeight - innerHeight,
      };
    });
    expect(metrics).toEqual({
      floorClear: true,
      deckInside: true,
      handMarks: 0,
      floorMarks: 0,
      scrollX: 0,
      scrollY: 0,
    });
    await info.attach('board', {
      body: await page.screenshot({ path: info.outputPath('board.png') }),
      contentType: 'image/png',
    });
  });
});
