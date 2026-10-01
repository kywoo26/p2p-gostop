// 리뷰 반례 전용 합성 HTTP fixture다. 실제 게임/성능 수용 자료로 쓰지 않는다.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import { firstGameReady, gameState, recordTrial, TransferProbe } from './game-transfer-probe.mjs';

for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
  test(`${engine}: four review counterexamples and normal boundaries`, async () => {
    const html =
      '<link rel="stylesheet" href="/missing.css"><div data-testid="match" data-can-act="true" data-phase="playing"><section data-testid="board" data-busy="true"><div aria-label="내 손패">' +
      '<button disabled>카드</button>'.repeat(10) +
      '</div></section></div>';
    const htmlBytes = Buffer.byteLength(html);
    const server = createServer((req, res) => {
      if (req.url === '/drop') {
        req.socket.destroy();
        return;
      }
      res.setHeader('cache-control', 'no-store');
      if (req.url.startsWith('/body')) {
        res.end(Buffer.alloc(800_000, 65));
        return;
      }
      if (req.url === '/ok') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(
          html
            .replace('<link rel="stylesheet" href="/missing.css">', '')
            .replace('data-busy="true"', 'data-busy="false"')
            .replaceAll(' disabled', ''),
        );
        return;
      }
      if (req.url === '/') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(html);
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise((resolve) => server.listen(4250, '127.0.0.1', resolve));
    const browser = await browserType.launch();
    try {
      const page = await browser.newPage();
      const base = new URL('http://127.0.0.1:4250/');
      const probe = new TransferProbe(page, base);
      await probe.begin('cold');
      await page.goto(`${base}#/`);
      const state = await page.evaluate(gameState);
      const legacyEndpoint = state.hand > 0 && !state.firstPickPending && state.canAct;
      assert.equal(legacyEndpoint, true);
      assert.equal(firstGameReady([state]), false);
      const notReady = await probe.collect({}, false);
      assert.equal(notReady.completeReady, false);
      assert.equal(
        notReady.httpFailures.some((failure) => failure.status === 404),
        true,
      );
      await page.evaluate(async () => {
        for (const query of ['v=1', 'v=2', 'v=1'])
          await fetch(`/body?${query}`).then((response) => response.arrayBuffer());
      });
      const cold = await probe.collect({}, true);
      const body = cold.timing.filter((entry) => entry.path === 'body');
      const legacyUniquePath = new Map(body.map((entry) => [entry.path, entry.encodedBodySize]));
      assert.equal(
        [...legacyUniquePath.values()].reduce((sum, bytes) => sum + bytes, 0),
        800_000,
      );
      assert.equal(
        body.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        2_400_000,
      );
      assert.equal(new Set(body.map((entry) => entry.urlId)).size, 2);
      assert.equal(JSON.stringify(cold).includes('v=1'), false);
      await probe.begin('next');
      const next = await probe.collect({}, true);
      assert.equal(next.requestCount, 0);
      assert.equal(next.networkEncodedBodySizeFromTiming, 0);
      // 구 collect는 resource clear 뒤에도 기존 navigation HTML을 다시 더했다.
      const legacyNextBytes = await page.evaluate(
        () => performance.getEntriesByType('navigation')[0].encodedBodySize,
      );
      assert.equal(legacyNextBytes, htmlBytes);
      await probe.begin('warm');
      await page.reload();
      const warm = await probe.collect({}, true);
      assert.equal(
        warm.timing.some((entry) => entry.path === '' && entry.encodedBodySize === htmlBytes),
        true,
      );
      await probe.begin('normal');
      await page.goto(`${base}ok`);
      assert.equal(firstGameReady([await page.evaluate(gameState)]), true);
      assert.equal((await probe.collect({}, true)).completeReady, true);
      let legacyWrites = 0;
      try {
        await page.goto(`${base}drop`, { timeout: 3000 });
        legacyWrites++;
      } catch {
        /* 기존 최종 write 경로에 도달하지 못한다. */
      }
      assert.equal(legacyWrites, 0);
      const report = { trials: [], samples: [], complete: false };
      let writes = 0;
      await recordTrial(
        report,
        { run: 1 },
        async (trial) => {
          trial.phase = 'navigation';
          await probe.begin('failed-navigation');
          await page.goto(`${base}drop`, { timeout: 3000 });
        },
        () => {
          report.samples.push(probe.partial({}));
        },
        async () => {
          writes++;
        },
      );
      assert.equal(writes, 1);
      assert.equal(report.trials[0].complete, false);
      assert.equal(report.samples.length, 1);
      console.log(
        JSON.stringify({
          engine,
          synthetic: true,
          endpointBefore: legacyEndpoint,
          endpointAfter: false,
          bodyBefore: 800_000,
          bodyAfter: 2_400_000,
          nextBefore: legacyNextBytes,
          nextAfter: 0,
          exceptionWritesBefore: legacyWrites,
          exceptionWritesAfter: writes,
        }),
      );
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
