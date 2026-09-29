// Docker 개발 이미지의 렌더 콜백 계측. 실기기 FPS/배터리 측정으로 해석하지 않는다.
/* global window, document, location, innerWidth, innerHeight, devicePixelRatio */
import { spawn } from 'node:child_process';
import { cpus, platform } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from 'playwright';

const base = 'http://127.0.0.1:4175';
const target = process.argv.includes('--diagnose-target');
const steady = process.argv.includes('--steady');
const rich = process.argv.includes('--rich');
const diagnose = process.argv.includes('--diagnose') || target;
const probes = target
  ? [
      ['original', ''],
      ['no-card-shadow', '.board .card, .board .hand .slot { box-shadow: none !important; }'],
      ['no-board-inset', '.board::before { box-shadow: none !important; }'],
      ['no-text-shadow', '* { text-shadow: none !important; }'],
      [
        'no-card-and-inset',
        '.board::before, .board .card, .board .hand .slot { box-shadow: none !important; }',
      ],
      [
        'no-shadow',
        '*, *::before, *::after { box-shadow: none !important; text-shadow: none !important; }',
      ],
    ]
  : diagnose
    ? [
        ['original', ''],
        ['no-blur', '* { backdrop-filter: none !important; filter: none !important; }'],
        [
          'no-shadow',
          '*, *::before, *::after { box-shadow: none !important; text-shadow: none !important; }',
        ],
        ['canvas-layer', '.impact { transform: translateZ(0); }'],
        ['canvas-contain', '.event-rail { contain: layout paint; }'],
        ['no-canvas-paint', '.impact { visibility: hidden; }'],
      ]
    : [['normal', '']];
const webRoot = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../../../node_modules/vite/bin/vite.js', import.meta.url)),
    'preview',
    '--port',
    '4175',
    '--host',
    '127.0.0.1',
    '--strictPort',
  ],
  { cwd: webRoot, stdio: 'ignore' },
);
const report = {
  date: new Date().toISOString(),
  environment: { platform: platform(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  steady,
  rich,
  method:
    '5s rAF callback cadence; 5 alternating ppeok/jjok bursts; CSS412x915; no CPU/network throttle; Docker headless, NOT Galaxy/iPhone device FPS',
  runs: [],
};
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* 시작 대기 */
    }
    await delay(100);
  }
  if (!ready) throw new Error('preview 시작 실패');
  for (const [name, engine] of Object.entries(diagnose ? { webkit } : { chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const dpr of diagnose ? [3.5] : [1, 3.5])
        for (const upgrade of diagnose ? [true] : [false, true])
          for (const [probe, css] of probes)
            for (let repeat = 0; repeat < (diagnose ? 3 : 1); repeat++) {
              const page = await browser.newPage({
                viewport: { width: 412, height: 915 },
                deviceScaleFactor: dpr,
              });
              const requests = [];
              page.on('request', (r) => requests.push(r.url()));
              await page.addInitScript(() => {
                const raf = window.requestAnimationFrame.bind(window);
                window.__visualMetrics = { raf, callbacks: [], count: 0 };
                window.requestAnimationFrame = (callback) =>
                  raf((time) => {
                    const start = performance.now();
                    callback(time);
                    window.__visualMetrics.callbacks.push(performance.now() - start);
                    window.__visualMetrics.count++;
                  });
              });
              await page.goto(
                `${base}/?${upgrade ? `visual=upgrade&${rich ? 'variant=rich&' : ''}` : ''}speed=normal#/dev/gallery/${steady ? 'upgrade-jjok' : 'feedback-play'}`,
              );
              if (css) await page.addStyleTag({ content: css });
              await page.evaluate(() => {
                // 기본 갤러리의 정지 프레임 모드를 계측에만 보통 속도로 바꾼다.
                document.documentElement.dataset['speed'] = 'normal';
                return document.fonts.ready;
              });
              await page.waitForFunction(() =>
                [...document.images].every((image) => image.complete && image.naturalWidth),
              );
              const resources = await page.evaluate(() =>
                performance.getEntriesByType('resource').map((r) => ({
                  name: r.name.split('/').slice(-1)[0],
                  encoded: r.encodedBodySize,
                  transferred: r.transferSize,
                })),
              );
              await page.waitForTimeout(1200);
              const idleStart = await page.evaluate(() => window.__visualMetrics.count);
              await page.waitForTimeout(1200);
              const idleCallbacks = await page.evaluate(
                (start) => window.__visualMetrics.count - start,
                idleStart,
              );
              const metrics = await page.evaluate(async () => {
                window.__visualMetrics.callbacks = [];
                const times = [];
                const slow = [];
                const start = performance.now();
                let last = start,
                  burst = -1;
                await new Promise((resolve) => {
                  const frame = (now) => {
                    times.push(now - last);
                    if (now - last > 25)
                      slow.push({
                        atMs: Math.round(now - start),
                        gapMs: Math.round(now - last),
                        burst,
                      });
                    last = now;
                    const next = Math.floor((now - start) / 1000);
                    if (next !== burst && next < 5) {
                      burst = next;
                      location.hash = `#/dev/gallery/upgrade-${burst % 2 ? 'jjok' : 'ppeok'}`;
                    }
                    if (now - start < 5000) window.__visualMetrics.raf(frame);
                    else resolve();
                  };
                  window.__visualMetrics.raf(frame);
                });
                const frames = times.slice(1).sort((a, b) => a - b);
                const callbacks = window.__visualMetrics.callbacks.sort((a, b) => a - b);
                const p = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))] ?? 0;
                return {
                  frames: frames.length,
                  rafFps: +(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)).toFixed(2),
                  gapP95Ms: +p(frames, 0.95).toFixed(2),
                  gapP99Ms: +p(frames, 0.99).toFixed(2),
                  gapMaxMs: +p(frames, 1).toFixed(2),
                  gapsOver25Ms: frames.filter((v) => v > 25).length,
                  callbackP95Ms: +p(callbacks, 0.95).toFixed(2),
                  callbackMaxMs: +p(callbacks, 1).toFixed(2),
                  callbackCount: callbacks.length,
                  slow,
                  width: innerWidth,
                  height: innerHeight,
                  dpr: devicePixelRatio,
                };
              });
              report.runs.push({
                browser: name,
                version: browser.version(),
                upgrade,
                probe,
                repeat,
                ...metrics,
                idleCallbacks,
                externalRequests: requests.filter((url) => !url.startsWith(base)).length,
                resources,
              });
              await page.close();
            }
    } finally {
      await browser.close();
    }
  }
  const out = new URL('../test-results/visual-upgrade/', import.meta.url);
  await mkdir(out, { recursive: true });
  await writeFile(
    new URL(
      target
        ? 'diagnostic-target.json'
        : diagnose
          ? 'diagnostic.json'
          : `${rich ? 'rich-' : ''}${steady ? 'steady-' : ''}performance.json`,
      out,
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        ...report,
        runs: report.runs.map(({ resources, ...run }) => ({
          ...run,
          encodedBytes: resources.reduce((sum, resource) => sum + resource.encoded, 0),
        })),
      },
      null,
      2,
    ),
  );
} finally {
  server.kill();
}
