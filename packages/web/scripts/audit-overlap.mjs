/* global document */
// UX-06/11: 개발 브라우저의 겹침 보고서·4화면 캡처. 실기기 측정과 구분한다.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { timingSave, TIMING_FIXTURES } from '../e2e/timing-fixtures.ts';
import { auditLayout } from '../e2e/layout-audit.ts';
const cwd = new URL('../', import.meta.url).pathname;
const out = `${cwd}test-results/pro-skin`;
await mkdir(out, { recursive: true });
const server = spawn(
  process.execPath,
  ['../../node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4189', '--strictPort'],
  { cwd, stdio: 'ignore' },
);
const base = 'http://127.0.0.1:4189';
const reports = [];
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  for (const [engine, type] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await type.launch();
    for (const [width, height] of [
      [360, 780],
      [390, 734],
      [412, 915],
      [430, 822],
      [412, 840],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: width === 412 && height === 840 ? 3.5 : 1,
        reducedMotion: 'reduce',
      });
      for (const scene of [
        'fan-waiting',
        'fan-play',
        'fan-target',
        'fan-gostop',
        'fan-pre-settlement',
        'fan-overflow',
        'fan-empty',
        'home',
        'settlement',
        'settings',
        'guest',
        'license',
        'game-menu',
      ]) {
        if (scene === 'game-menu') {
          await page.addInitScript(
            (save) => localStorage.setItem('gostop.solo.v1', JSON.stringify(save)),
            timingSave(TIMING_FIXTURES[0]),
          );
          await page.goto(`${base}/?speed=instant#/game`);
          await page.getByTestId('game-menu').click();
        } else
          await page.goto(
            scene === 'license' ? `${base}/#/license` : `${base}/#/dev/gallery/${scene}`,
          );
        await page.locator('main, .board').first().waitFor({ state: 'visible' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        const report = await page.evaluate(auditLayout);
        if (report.elementCount === 0) throw new Error(`Empty audit: ${scene}`);
        const capture = `${engine}-${scene}-${width}x${height}.png`;
        await page.screenshot({ path: `${out}/${capture}` });
        reports.push({ engine, width, height, scene, capture, ...report });
      }
      await page.close();
    }
    await browser.close();
  }
  await writeFile(`${out}/overlap-report.json`, JSON.stringify(reports, null, 2));
  const failed = reports.filter((r) => r.issues.length);
  await writeFile(
    `${out}/README.md`,
    [
      '# Pro skin captures',
      '',
      'Reproduce: `node packages/web/scripts/audit-overlap.mjs` (host Playwright).',
      '',
      `Screens: ${reports.length}; failed: ${failed.length}. Report: [JSON](overlap-report.json).`,
      '',
      '| Engine | Viewport | Scene | Capture | Issues |',
      '|---|---|---|---|---|',
      ...reports.map(
        (r) =>
          `| ${r.engine} | ${r.width}×${r.height} | ${r.scene} | [PNG](${r.capture}) | ${r.issues.length} |`,
      ),
      '',
    ].join('\n'),
  );

  console.log(
    JSON.stringify(
      {
        screens: reports.length,
        failed: failed.length,
        issues: failed.map((r) => ({
          engine: r.engine,
          width: r.width,
          height: r.height,
          scene: r.scene,
          issues: r.issues,
        })),
      },
      null,
      2,
    ),
  );
  if (failed.length) process.exitCode = 1;
} finally {
  server.kill();
}
