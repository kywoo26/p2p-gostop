// B207-1: 이미 실행 중인 비공개 loopback 서버의 실제 응답. 모바일 수용 판정은 아니다.
import { writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const [address, output] = process.argv.slice(2);
const base = new URL(address);
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname))
  throw new Error('Only a private HTTP loopback fixture is allowed');
const samples = [];
for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
  const browser = await browserType.launch();
  try {
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({
        viewport: { width: 412, height: 840 },
        deviceScaleFactor: 3.5,
        proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' },
      });
      try {
        const page = await context.newPage();
        let externalRequests = 0;
        page.on('request', (request) => {
          if (new URL(request.url()).origin !== base.origin) externalRequests++;
        });
        const responses = [];
        page.on('response', (response) => {
          const headers = response.headers();
          responses.push({
            path: new URL(response.url()).pathname.replace(base.pathname, ''),
            status: response.status(),
            encoding: headers['content-encoding'] ?? 'identity',
            contentLength: Number(headers['content-length'] ?? 0),
            cacheControl: headers['cache-control'] ?? '',
          });
        });
        for (const phase of ['cold-entry', 'warm-reload']) {
          responses.length = 0;
          if (phase === 'cold-entry') await page.goto(`${address}?role=guest`);
          else await page.reload();
          await page.locator('input').first().waitFor();
          await page.evaluate(() => globalThis.document.fonts.ready);
          const timing = await page.evaluate(() => {
            const entries = [
              ...performance.getEntriesByType('navigation'),
              ...performance.getEntriesByType('resource'),
            ];
            return entries.map((entry) => ({
              kind: entry.entryType,
              path: new URL(entry.name).pathname,
              encodedBodySize: entry.encodedBodySize,
              decodedBodySize: entry.decodedBodySize,
              transferSize: entry.transferSize,
            }));
          });
          const sum = (field) => timing.reduce((total, entry) => total + entry[field], 0);
          samples.push({
            engine,
            run,
            phase,
            externalRequests,
            requests: [...responses],
            encodedBodySize: sum('encodedBodySize'),
            decodedBodySize: sum('decodedBodySize'),
            transferSize: sum('transferSize'),
            networkEncodedBodySizeFromTiming: timing
              .filter((entry) => entry.transferSize > 0)
              .reduce((total, entry) => total + entry.encodedBodySize, 0),
            timing: timing.map((entry) => ({
              ...entry,
              path: entry.path.replace(base.pathname, ''),
            })),
          });
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
const json = `${JSON.stringify({ schema: 1, condition: 'desktop-loopback-guest-name-input-and-fonts-ready; no-throttle; fresh-context then same-context reload', samples }, null, 2)}\n`;
if (output) await writeFile(output, json);
else process.stdout.write(json);
