/* global document, getComputedStyle */
// UX-H05: 검토 전용 CSS/속성 주입. 게임 판정/설정 연결을 완료했다고 주장하지 않는다.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
const cwd = new URL('../', import.meta.url).pathname;
const out = `${cwd}test-results/pro-skin`;
await mkdir(out, { recursive: true });
const glyph = async (name) =>
  `url("data:image/svg+xml;base64,${Buffer.from((await readFile(`${cwd}public/skin/${name}.svg`, 'utf8')).replace('#182e28', '#ffffff')).toString('base64')}")`;
const base = `
:root .board { --mark-bomb:oklch(45% .17 28); --mark-shake:oklch(44% .09 75); --mark-size:22px; --mark-glyph-size:20px; --mark-inset:2px; }
:root .board .slot[data-hand-action=bomb] { --mark-tint:var(--mark-bomb); --mark-glyph:${await glyph('bomb')}; }
:root .board .slot[data-hand-action=shake] { --mark-tint:var(--mark-shake); --mark-glyph:${await glyph('bell')}; }
:root .board .slot:is([data-hand-action=bomb],[data-hand-action=shake]) .art-window::after {
 width:var(--mark-size);height:var(--mark-size);top:var(--mark-inset);right:var(--mark-inset);border-radius:50%;
 background:var(--mark-tint) var(--mark-glyph) center / var(--mark-glyph-size) var(--mark-glyph-size) no-repeat;box-shadow:0 0 0 1px #14251f;
}
`;
const halo = `
:root .board .hand .row { isolation:isolate; }
:root .board .group-bracket { display:block; top:auto; bottom:0; height:0; border:0; z-index:auto; }
:root .board .group-bracket::before { content:''; position:absolute; inset:calc(-1 * var(--card-h-l) - 6px) -4px -4px; border-radius:8px; background:color-mix(in oklch,var(--mark-tint) 34%,transparent); border:1px solid color-mix(in oklch,var(--mark-tint) 75%,transparent); z-index:-1; pointer-events:none; }
@keyframes mark-breath { 0%,100%{box-shadow:0 0 0 1px #14251f,0 0 0 1px transparent;} 50%{box-shadow:0 0 0 1px #14251f,0 0 5px 2px color-mix(in oklch,var(--mark-tint) 50%,transparent);} }
@media(prefers-reduced-motion:no-preference){:root .board[data-effect-intensity=strong] .slot:is([data-hand-action=bomb],[data-hand-action=shake]) .art-window::after { animation:mark-breath 1.6s ease-in-out infinite; }}
`;
const band = `
:root .board .slot:is([data-hand-action=bomb],[data-hand-action=shake]) .art-window::after { top:0;left:0;right:0;width:100%;height:20%;border-radius:2px 2px 0 0;background-position:right 2px center;background-size:16px 16px;box-shadow:none; }
:root .board .slot:is([data-hand-action=bomb],[data-hand-action=shake]) .mark { top:0;bottom:auto;left:0;right:auto;z-index:1;background:transparent; }
`;
const server = spawn(
  process.execPath,
  ['../../node_modules/vite/bin/vite.js', 'preview', '--port', '4187', '--host', '127.0.0.1'],
  { cwd, stdio: 'ignore' },
);
const reports = [];
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch('http://127.0.0.1:4187')).ok) break;
    } catch {
      /* preview starting */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  for (const [engine, type] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ deviceScaleFactor: 1 });
      for (const [width, height] of [
        [360, 780],
        [390, 734],
        [430, 822],
        [412, 915],
      ]) {
        await page.setViewportSize({ width, height });
        for (const [variant, css] of [
          ['a', base],
          ['b', base + halo],
          ['c', base + band],
        ]) {
          await page.goto(
            `http://127.0.0.1:4187/?variant=${variant}&size=${width}#/dev/gallery/feedback-play`,
          );
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map((i) => i.decode()));
            document.querySelector('.floor .group')?.setAttribute('data-hand-link', 'bomb');
            document
              .querySelectorAll('[data-hand-action=shake]')
              .forEach((e) => e.removeAttribute('data-hand-cue'));
          });
          await page.addStyleTag({ content: css });
          await page
            .locator('.board')
            .evaluate((e) => e.setAttribute('data-effect-intensity', 'strong'));
          const metrics = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d');
            const contrast = (color) => {
              ctx.fillStyle = color;
              ctx.fillRect(0, 0, 1, 1);
              const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
              const l = rgb
                .map((v) => {
                  v /= 255;
                  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
                })
                .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
              return 1.05 / (l + 0.05);
            };
            return {
              cards: [...document.querySelectorAll('.hand .card')].map((e) => {
                const r = e.getBoundingClientRect();
                return [r.width, r.height];
              }),
              icons: [
                ...document.querySelectorAll(
                  '.slot[data-hand-action=bomb],.slot[data-hand-action=shake]',
                ),
              ].map((e) => {
                const w = e.querySelector('.art-window');
                const s = getComputedStyle(w, '::after');
                return {
                  action: e.getAttribute('data-hand-action'),
                  width: s.width,
                  height: s.height,
                  glyph: s.backgroundSize,
                  contrastWhite: contrast(s.backgroundColor),
                  animation: s.animationName,
                };
              }),
            };
          });
          await page.screenshot({
            path: `${out}/${engine === 'chromium' ? '' : engine + '-'}marks-${variant}-${width}x${height}.png`,
            animations: 'disabled',
          });
          await page.emulateMedia({ reducedMotion: 'reduce' });
          const reduced = await page
            .locator('.slot[data-hand-action=bomb] .art-window')
            .first()
            .evaluate((e) => getComputedStyle(e, '::after').animationName);
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          await page
            .locator('.board')
            .evaluate((e) => e.setAttribute('data-effect-intensity', 'off'));
          const off = await page
            .locator('.slot[data-hand-action=bomb] .art-window')
            .first()
            .evaluate((e) => getComputedStyle(e, '::after').animationName);
          reports.push({ engine, width, height, variant, ...metrics, reduced, off });
        }
      }
    } finally {
      await browser.close();
    }
  }
  await writeFile(`${out}/marks-measurements.json`, JSON.stringify(reports, null, 2) + '\n');
  console.log(`Saved ${reports.length} comparisons to ${out}`);
} finally {
  server.kill('SIGTERM');
}
