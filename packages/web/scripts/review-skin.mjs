/* global document, getComputedStyle, Image, requestAnimationFrame */
// PA-05: release captures and renderer-only samples; never a Galaxy/iPhone measurement.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { timingSave, TIMING_FIXTURES } from '../e2e/timing-fixtures.ts';
const cwd = new URL('../', import.meta.url).pathname;
const out = `${cwd}test-results/pro-skin`;
await mkdir(out, { recursive: true });
const server = spawn(
  process.execPath,
  ['../../node_modules/vite/bin/vite.js', 'preview', '--port', '4185', '--host', '127.0.0.1'],
  { cwd, stdio: 'ignore' },
);
const base = 'http://127.0.0.1:4185/';
try {
  for (let n = 0; n < 80; n++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const result = [];
  const cueProposal = await readFile(`${cwd}scripts/skin-cue-proposal.css`, 'utf8');
  const assets = JSON.parse(await readFile(`${cwd}public/skin/manifest.json`, 'utf8'));
  for (const [name, type] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await type.launch();
    for (const dpr of [1, 3.5]) {
      const page = await browser.newPage({
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: dpr,
      });
      const external = [];
      page.on('request', (r) => {
        if (new URL(r.url()).origin !== base.slice(0, -1)) external.push(r.url());
      });
      const screens = [];
      for (const scene of [
        'home',
        'board',
        'layout-play',
        'layout-target',
        'layout-gostop',
        'layout-gostop-expanded',
        'layout-play-expanded',
        'feedback-play',
      ]) {
        await page.goto(`${base}#/dev/gallery/${scene}`);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map((img) => img.decode()));
          const backgrounds = [...document.querySelectorAll('*')].flatMap((el) =>
            [...getComputedStyle(el).backgroundImage.matchAll(/url\("?([^"()]+)"?\)/g)].map(
              (m) => m[1],
            ),
          );
          await Promise.all(
            [...new Set(backgrounds)].map(async (src) => {
              const img = new Image();
              img.src = src;
              await img.decode();
            }),
          );
        });
        if (dpr === 1) await page.screenshot({ path: `${out}/${name}-${scene}.png` });
        screens.push(
          await page.evaluate(
            (scene) => ({
              scene,
              skinResources: performance
                .getEntriesByType('resource')
                .filter((r) => r.name.includes('/skin/'))
                .map((r) => ({ url: new URL(r.name).pathname, bytes: r.encodedBodySize })),
            }),
            scene,
          ),
        );
      }
      if (dpr === 1) {
        for (const scene of ['feedback-play', 'board', 'layout-play']) {
          await page.goto(`${base}#/dev/gallery/${scene}`);
          await page.evaluate(() => document.fonts.ready);
          await page.addStyleTag({ content: cueProposal });
          await page.screenshot({ path: `${out}/${name}-${scene}-proposal.png` });
        }
      }
      if (dpr === 1) {
        await page.goto(`${base}#/dev/gallery/feedback-play`);
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        await page.screenshot({ path: `${out}/${name}-four-states-review.png` });
        for (const [width, height] of [
          [360, 780],
          [390, 734],
          [430, 822],
          [412, 915],
        ]) {
          await page.setViewportSize({ width, height });
          await page.screenshot({ path: `${out}/${name}-card-icons-${width}x${height}.png` });
        }
        await page.setViewportSize({ width: 412, height: 915 });
        await page.getByRole('button', { name: '판 정보', exact: true }).click();
        await page.getByRole('dialog', { name: '판 정보', exact: true }).waitFor();
        await page.screenshot({ path: `${out}/${name}-board-info.png` });
        await page.keyboard.press('Escape');
      }
      const contrast = await page.evaluate(() => {
        const style = getComputedStyle(document.querySelector('.board'));
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const rgb = (value) => {
          ctx.fillStyle = value;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const color = (name) => rgb(style.getPropertyValue(name));
        const luminance = (rgb) =>
          rgb
            .map((v) => {
              const c = v / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            })
            .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
        const ratio = (a, b) => {
          const x = luminance(a),
            y = luminance(b);
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        const muted = color('--color-hud-muted');
        // White is brighter than every leather texel: conservative lower bound, not an averaged texture.
        const overWhite = (base, alpha) => base.map((c) => c * alpha + 255 * (1 - alpha));
        return {
          beforeOpponent: ratio(muted, color('--color-hud')),
          beforeMine: ratio(muted, color('--color-hud-my-surface')),
          afterOpponentLowerBound: ratio(muted, overWhite([14, 25, 22], 232 / 255)),
          afterMineLowerBound: ratio(muted, overWhite([39, 56, 44], 237 / 255)),
        };
      });
      // Existing seed/path, actual playback. 2.5s window includes settling/AI; a renderer proxy only.
      const fixture = TIMING_FIXTURES.find((f) => f.id === 'match-capture');
      const samples = [];
      for (let run = 0; run < (process.env['SKIN_CAPTURE_ONLY'] === '1' ? 0 : 3); run++) {
        await page.goto(base);
        await page.evaluate(
          (save) => localStorage.setItem('gostop.solo.v1', JSON.stringify(save)),
          timingSave(fixture),
        );
        await page.reload();
        await page.getByRole('button', { name: /이어하기/ }).click();
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="solo"]')?.getAttribute('data-can-act') === 'true',
        );
        const sample = page.evaluate(
          () =>
            new Promise((resolve) => {
              const times = [],
                start = performance.now();
              let last = start;
              const tick = (now) => {
                times.push(now - last);
                last = now;
                if (now - start < 2500) requestAnimationFrame(tick);
                else {
                  times.sort((a, b) => a - b);
                  resolve({
                    hz: (times.length * 1000) / (now - start),
                    p95Ms: times[Math.ceil(times.length * 0.95) - 1],
                    maxMs: Math.max(...times),
                  });
                }
              };
              requestAnimationFrame(tick);
            }),
        );
        await page
          .locator(`[aria-label="내 손패"] [data-slot="${fixture.card}"]`)
          .click({ position: { x: 20, y: 20 } });
        samples.push(await sample);
      }
      result.push({ browser: name, dpr, external, screens, samples, contrast });
      if (dpr === 1 && name === 'chromium') {
        // Contact sheet is a review artifact, not a selectable avatar UI.
        await page.goto(base);
        await page.setContent(
          `<style>body{margin:0;background:#182e28;color:#e9d9b5;font:14px sans-serif;padding:20px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}figure{margin:0;display:grid;justify-items:center;gap:8px}img{border-radius:50%;box-shadow:0 0 0 1px #b39b67}</style><main>${assets
            .filter((a) => a.id.startsWith('avatar'))
            .map(
              (a) =>
                `<figure><img width="64" height="64" src="${base}skin/${a.file}"><img width="40" height="40" src="${base}skin/${a.file}"><figcaption>${Number(a.id.slice(-2))}월 · 64/40px</figcaption></figure>`,
            )
            .join('')}</main>`,
        );
        await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
        await page.screenshot({ path: `${out}/portraits.png` });
      }
      await page.close();
    }
    await browser.close();
  }
  await writeFile(`${out}/measurements.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify(
      result.map(({ browser, dpr, samples, external }) => ({ browser, dpr, samples, external })),
      null,
      2,
    ),
  );
} finally {
  server.kill();
}
