/* global Image, document */
// PA-03 / NF-07: derive separate portrait inputs; never alter public/cards.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const out = new URL('assets-src/portraits/', root);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Original viewBox 103.2 x 168.2. Square motif crops omit the card border and 光.
  const crops = [
    [0, -8, 8, 104],
    [4, 8, 25, 86],
    [8, 8, 8, 86],
    [12, 8, 18, 86],
    [16, 8, 42, 86],
    [20, 8, 65, 86],
    [24, 8, 68, 86],
    [29, 8, 20, 86],
    [32, 8, 58, 86],
    [36, 8, 50, 86],
    [40, 8, 8, 86],
    [45, 8, 40, 86],
  ];
  for (const [index, [id, x, y, side]] of crops.entries()) {
    const svg = await readFile(new URL(`public/cards/${id}.svg`, root), 'utf8');
    const data = await page.evaluate(
      async ({ svg, x, y, side }) => {
        const image = new Image();
        image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 384;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 384, 384);
        const left = Math.max(6, x),
          right = Math.min(97, x + side);
        const top = Math.max(6, y),
          bottom = Math.min(162, y + side);
        ctx.drawImage(
          image,
          left,
          top,
          right - left,
          bottom - top,
          ((left - x) * 384) / side,
          ((top - y) * 384) / side,
          ((right - left) * 384) / side,
          ((bottom - top) * 384) / side,
        );
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { svg, x, y, side },
    );
    await writeFile(new URL(`${index + 1}.png`, out), Buffer.from(data, 'base64'));
  }
  await writeFile(new URL('crops.json', out), JSON.stringify(crops, null, 2) + '\n');
} finally {
  await browser.close();
}
