// PA-01 proposal only: shared-bandwidth route scheduling in WebKit, not radio/Safari emulation.
/* global document, requestAnimationFrame */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { webkit } from 'playwright';
const cwd = new URL('../', import.meta.url).pathname;
const server = spawn(
  process.execPath,
  ['../../node_modules/vite/bin/vite.js', 'preview', '--port', '4176', '--host', '127.0.0.1'],
  { cwd, stdio: 'ignore' },
);
const base = 'http://127.0.0.1:4176/';
const results = [];
let browser;
try {
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* start server */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await webkit.launch();
  for (const mbps of [10, 30, 60]) {
    const samples = [];
    for (let run = 0; run < 20; run++) {
      const context = await browser.newContext({
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 3.5,
      });
      let available = performance.now();
      let bytes = 0;
      const resources = [];
      await context.route('**/*', async (route) => {
        const response = await route.fetch();
        const body = await response.body();
        bytes += body.length;
        resources.push({ path: new URL(route.request().url()).pathname, bytes: body.length });
        const now = performance.now();
        // One shared download queue: concurrent requests do not each get the full link rate.
        available = Math.max(now, available) + (body.length * 8) / (mbps * 1000);
        await new Promise((r) => setTimeout(r, Math.max(0, available - now) + 20));
        await route.fulfill({ response, body });
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const tick = () => {
          if (
            document.querySelector('progress') &&
            !performance.getEntriesByName('first-progress').length
          )
            performance.mark('first-progress');
          const button = document.querySelector('.screen input');
          if (
            button &&
            button.getBoundingClientRect().height > 0 &&
            document.fonts.status === 'loaded'
          )
            performance.mark('input-ready');
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.goto(`${base}?visual=pro&role=guest`);
      await page.locator('[data-pro-ready=true]').waitFor();
      await page.waitForFunction(() => performance.getEntriesByName('input-ready').length > 0);
      const timing = await page.evaluate(() => ({
        progressMs: performance.getEntriesByName('first-progress')[0]?.startTime,
        inputMs: performance.getEntriesByName('input-ready')[0]?.startTime,
        materialMs: performance.getEntriesByName('pro-scene-ready')[0]?.startTime,
      }));
      samples.push({ run, ...timing, bytes, resources });
      await context.close();
    }
    const p95 = (key) =>
      samples
        .map((s) => s[key])
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)[18];
    const result = {
      mbps,
      latencyMs: 20,
      runs: 20,
      profile:
        'cold; shared uncompressed response-byte scheduler; no packet loss/radio/CPU throttle',
      p95: {
        progressMs: p95('progressMs'),
        inputMs: p95('inputMs'),
        materialMs: p95('materialMs'),
      },
      samples,
    };
    results.push(result);
    console.log(JSON.stringify({ mbps, p95: result.p95, bytes: samples[0].bytes }));
  }
  await mkdir(`${cwd}test-results/pro-assets`, { recursive: true });
  await writeFile(
    `${cwd}test-results/pro-assets/throttle.json`,
    JSON.stringify(results, null, 2) + '\n',
  );
} finally {
  await browser?.close();
  server.kill();
}
