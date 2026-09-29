/* global document, location, requestAnimationFrame */
// PA-04: actual app capture + desktop renderer surrogate. Not physical-device FPS.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
const cwd = new URL('../', import.meta.url).pathname;
const out = `${cwd}test-results/pro-assets`;
await mkdir(out, { recursive: true });
const server = spawn(
  process.execPath,
  ['../../node_modules/vite/bin/vite.js', 'preview', '--port', '4175', '--host', '127.0.0.1'],
  { cwd, stdio: 'ignore' },
);
const base = 'http://127.0.0.1:4175/';
try {
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* preview server is starting */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const result = [];
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
        'pro-ppeok',
        'pro-jjok',
        'pro-ttadak',
        'pro-bomb',
        'pro-go',
        'settlement',
      ]) {
        await page.goto(`${base}?visual=pro&still=1#/dev/gallery/${scene}`);
        await page.locator('[data-pro-ready=true]').waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(250);
        if (dpr === 1 && name === 'chromium')
          await page.screenshot({ path: `${out}/${scene}.png` });
        screens.push(
          await page.evaluate((scene) => {
            const resources = performance.getEntriesByType('resource');
            return {
              scene,
              readyMs: performance.getEntriesByName('pro-scene-ready').at(-1)?.startTime,
              transferBytes: resources.reduce((sum, r) => sum + r.transferSize, 0),
              encodedBytes: resources.reduce((sum, r) => sum + r.encodedBodySize, 0),
              assets: resources
                .filter((r) => r.name.includes('/pro/'))
                .map((r) => ({ url: new URL(r.name).pathname, bytes: r.encodedBodySize })),
            };
          }, scene),
        );
      }
      await page.goto(`${base}?visual=pro&motion=1#/dev/gallery/board`);
      await page.locator('[data-pro-ready=true]').waitFor();
      // Warm each atlas before steady-state samples. Cold ready values reported separately above.
      for (const kind of ['ppeok', 'jjok', 'ttadak', 'bomb']) {
        await page.evaluate((k) => (location.hash = `#/dev/gallery/pro-${k}`), kind);
        await page.waitForTimeout(500);
      }
      const samples = [];
      for (let run = 0; run < 3; run++) {
        samples.push(
          await page.evaluate(
            () =>
              new Promise((resolve) => {
                const deltas = [];
                const start = performance.now();
                let last = start;
                let next = start;
                let event = 0;
                const kinds = ['ppeok', 'jjok', 'ttadak', 'bomb'];
                const tick = (now) => {
                  deltas.push(now - last);
                  last = now;
                  if (now >= next) {
                    location.hash = `#/dev/gallery/pro-${kinds[event++ % kinds.length]}`;
                    next = now + 500;
                  }
                  if (now - start < 5000) requestAnimationFrame(tick);
                  else {
                    deltas.sort((a, b) => a - b);
                    resolve({
                      hz: (deltas.length * 1000) / (now - start),
                      p95Ms: deltas[Math.ceil(deltas.length * 0.95) - 1],
                      maxMs: Math.max(...deltas),
                      frames: deltas.length,
                    });
                  }
                };
                requestAnimationFrame(tick);
              }),
          ),
        );
      }
      result.push({ browser: name, dpr, viewport: '412x915', external, screens, samples });
      await page.close();
    }
    await browser.close();
  }
  await writeFile(`${out}/measurements.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify(
      result.map(({ browser, dpr, samples }) => ({ browser, dpr, samples })),
      null,
      2,
    ),
  );
} finally {
  server.kill();
}
