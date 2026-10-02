import { redact, reportFailure } from './common.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { judge } from './judge.mjs';
import { repoRoot, fixture, scratchArgument, verifyFixtures, verifyLock } from './common.mjs';
const digest = (b) => createHash('sha256').update(b).digest('hex');
async function rawBytes(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.endsWith('.original')) continue;
    const p = resolve(dir, e.name);
    n += e.isDirectory() ? await rawBytes(p) : (await stat(p)).size;
  }
  return n;
}
try {
  await verifyFixtures();
  const scratch = await scratchArgument();
  await verifyLock(scratch);
  // Playwright는 web workspace의 정확 dev 핀을 재사용한다. proof manifest 중복을 만들지 않는다.
  // knip의 unlisted 예외는 이 CLI 파일 하나이며 아래에서 소유 manifest와 설치 버전을 검증한다.
  const webPackagePath = resolve(repoRoot, 'packages/web/package.json');
  const webPackage = JSON.parse(await readFile(webPackagePath));
  assert.equal(
    webPackage.devDependencies.playwright,
    fixture.playwright,
    'web Playwright pin drift',
  );
  const require = createRequire(webPackagePath);
  assert.equal(
    JSON.parse(await readFile(resolve(dirname(require.resolve('playwright')), 'package.json')))
      .version,
    fixture.playwright,
    'Playwright pin mismatch',
  );
  const { chromium, webkit } = require('playwright');
  for (const [path, expected] of [
    ['split-original/index.html', fixture.relocation.originalSha256],
    ['split-relocated/index.html', fixture.relocation.resultSha256],
  ]) {
    assert.equal(
      createHash('sha256')
        .update(await readFile(resolve(scratch, path)))
        .digest('hex'),
      expected,
      'built HTML drift',
    );
  }
  const resultPath = resolve(
    scratch,
    process.argv.includes('--root') ? 'matrix-root-results.json' : 'matrix-results.json',
  );
  // 이미 존재하는 결과를 덮어쓰지 않으며, 브라우저 launch 이전에 실패한다.
  await writeFile(resultPath, '', { flag: 'wx' });
  const base = process.argv.includes('--root') ? '/' : '/r/proof/9913340/',
    token = 'abcdef0123456789abcdef0123456789';
  const rows = [];
  let versionFail = false,
    folder = 'split-original',
    records = [];
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://fixture');
    const record = {
      method: req.method,
      path: u.pathname.includes(token) ? 'redacted' : u.pathname,
      secretInRequest: req.url.includes(token),
      status: 404,
      bytes: 0,
    };
    records.push(record);
    if (!u.pathname.startsWith(base)) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const p = decodeURIComponent(u.pathname.slice(base.length)) || 'index.html';
      if (p.includes('..') || p.startsWith('/') || p.includes('\\') || p.endsWith('.original'))
        throw Error();
      if (versionFail && p === '_app/version.json') {
        record.status = 503;
        res.writeHead(503);
        res.end();
        return;
      }
      const b = await readFile(resolve(folder, p));
      Object.assign(record, { status: 200, bytes: b.length, sha256: digest(b) });
      res.writeHead(200, {
        'content-type':
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
            '.woff2': 'font/woff2',
          }[extname(p)] ?? 'application/octet-stream',
        'content-length': b.length,
        'cache-control': 'no-store',
      });
      res.end(b);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const [engine, type] of Object.entries({ chromium, webkit })) {
      const browser = await type.launch();
      try {
        for (const variant of [
          'split-original',
          'split-relocated',
          'single-original',
          'inline-original',
        ]) {
          folder = resolve(scratch, variant);
          records = [];
          const context = await browser.newContext();
          const page = await context.newPage();
          page.setDefaultTimeout(2000);
          const errors = [],
            outbound = [],
            workers = [];
          page.on('pageerror', (e) =>
            errors.push({ name: e.name, secret: e.message.includes(token) }),
          );
          page.on('request', (r) => {
            if (new URL(r.url()).origin !== origin) outbound.push('external');
          });
          page.on('worker', (w) => workers.push(new URL(w.url()).pathname));
          const row = { engine, variant, raw: await rawBytes(folder), complete: false };
          try {
            await page.goto(origin + base + '#/');
            await page.getByRole('heading', { name: '홈 proof' }).waitFor();
            await page.evaluate(() => document.fonts.ready);
            await page.waitForFunction(() =>
              document.querySelector('#lifetime').textContent.startsWith('1/'),
            );
            row.initial = {
              responseBytes: records.reduce((n, r) => n + r.bytes, 0),
              responses: records.length,
              bodyVisible: true,
            };
            const workerCount = workers.length;
            await page.getByRole('link', { name: '설정' }).click();
            await page.getByRole('heading', { name: '설정 proof' }).waitFor();
            row.lazy = {
              lifetime: await page.locator('#lifetime').textContent(),
              extraResponses: records.length - row.initial.responses,
              workerPreserved: workers.length === workerCount,
            };
            await page.goBack();
            await page.getByRole('heading', { name: '홈 proof' }).waitFor();
            await page.goto(origin + base + '#/settings');
            await page.getByRole('heading', { name: '설정 proof' }).waitFor();
            await page.reload();
            await page.getByRole('heading', { name: '설정 proof' }).waitFor();
            if (variant === 'split-relocated') {
              let navigations = 0;
              page.on('framenavigated', (f) => {
                if (f === page.mainFrame()) navigations++;
              });
              versionFail = true;
              const start = records.length;
              await page.evaluate(() => {
                window.dispatchEvent(new Event('focus'));
                window.dispatchEvent(new Event('visibilitychange'));
              });
              await page.waitForTimeout(300);
              versionFail = false;
              await page.evaluate(() => window.dispatchEvent(new Event('focus')));
              await page.waitForTimeout(300);
              row.version = {
                requests: records.slice(start).filter((r) => r.path.includes('version')),
                navigations,
              };
              const leaks = [];
              for (const [hash, heading] of [
                ['#g=' + token + '&n=guest', '게스트 proof'],
                ['#/join?room=fixture&t=' + token, '참여 proof'],
              ]) {
                await page.goto(origin + base + hash);
                await page.getByRole('heading', { name: heading }).waitFor();
                const data = await page.evaluate(
                  (t) => ({
                    history: JSON.stringify(history.state).includes(t),
                    title: document.title.includes(t),
                    text: document.body.innerText.includes(t),
                    announcer: [...document.querySelectorAll('[aria-live]')].some((e) =>
                      e.textContent.includes(t),
                    ),
                    remoteScrubbed: location.hash === '#/join',
                    nestedTicket: location.hash.startsWith('#/guest#g='),
                  }),
                  token,
                );
                leaks.push(data);
              }
              row.tokens = leaks;
            }
            row.complete =
              !errors.length &&
              !outbound.length &&
              records.every((r) => r.status === 200 || r.status === 503) &&
              workers.every((p) => p.startsWith(base));
          } catch (e) {
            row.failure = e.name;
            row.failureMessage = redact(e.message)
              .replaceAll(token, '<token>')
              .replaceAll(scratch, '<scratch>')
              .replaceAll(repoRoot, '<repoRoot>')
              .slice(0, 500);
          } finally {
            versionFail = false;
            Object.assign(row, { errors, outbound, workers, records: [...records] });
            Object.assign(row, judge(row, base));
            rows.push(row);
            await context.close();
          }
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    await new Promise((r) => server.close(r));
    await writeFile(resultPath, JSON.stringify({ scope: 'finite-shell', rows }, null, 2) + '\n');
  }
  console.log(
    JSON.stringify(
      rows.map(
        ({
          engine,
          variant,
          raw,
          initial,
          lazy,
          complete,
          failure,
          failureMessage,
          tokens,
          version,
          verdict,
        }) => ({
          engine,
          variant,
          raw,
          initial,
          lazy,
          complete,
          failure,
          failureMessage,
          tokens,
          version,
          verdict,
        }),
      ),
      null,
      2,
    ),
  );

  if (rows.length !== 8 || rows.some((row) => row.verdict === 'UNEXPECTED FAIL'))
    process.exitCode = 1;
} catch (error) {
  reportFailure(error);
}
