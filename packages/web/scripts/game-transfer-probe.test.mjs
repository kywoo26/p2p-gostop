import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  bodyAccounting,
  firstGameReady,
  phaseEntries,
  recordTrial,
  TransferProbe,
} from './game-transfer-probe.mjs';

const active = {
  match: true,
  phase: 'playing',
  canAct: true,
  hand: 10,
  legalHandEnabled: 1,
  boardBusy: false,
  firstPickPending: false,
};
test('first-game endpoint requires actual legal enabled hand after playback/initial selection', () => {
  const inactive = { ...active, canAct: false, boardBusy: true, legalHandEnabled: 0 };
  assert.equal(firstGameReady([active, inactive]), true);
  for (const change of [
    { boardBusy: true },
    { legalHandEnabled: 0 },
    { firstPickPending: true },
    { hand: 9 },
    { phase: 'roundOver' },
  ])
    assert.equal(firstGameReady([{ ...active, ...change }, inactive]), false);
});
test('each network response counts; query-distinct URLs, retransmissions and cache stay separate', () => {
  const entry = { encodedBodySize: 800_000, transferSize: 800_300 };
  const result = bodyAccounting([
    { ...entry, urlId: 'url-1' },
    { ...entry, urlId: 'url-2' },
    { ...entry, urlId: 'url-1' },
    { ...entry, urlId: 'url-1', transferSize: 0 },
  ]);
  assert.equal(result.networkEncodedBodySizeFromTiming, 2_400_000);
  assert.equal(result.networkUniqueEncodedBodySizeFromTiming, 1_600_000);
  assert.equal(result.cachedOrLocalEncodedBodySizeFromTiming, 800_000);
  assert.equal(result.networkResponseCountFromTiming, 3);
});
test('next phase excludes old navigation; reload includes the new navigation', () => {
  const nav = { startTime: 0, encodedBodySize: 660, transferSize: 960, urlId: 'nav' };
  assert.equal(
    bodyAccounting(phaseEntries([nav], { timeOrigin: 1, at: 10 }, 1))
      .networkEncodedBodySizeFromTiming,
    0,
  );
  assert.equal(
    bodyAccounting(phaseEntries([nav], { timeOrigin: 1, at: 10 }, 2))
      .networkEncodedBodySizeFromTiming,
    660,
  );
  assert.equal(phaseEntries([{ startTime: 10 }], { timeOrigin: 1, at: 10 }, 1).length, 1);
});
test('navigation/endpoint/later exceptions overwrite stale success with anonymous phase and partial sample', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'transfer-report-'));
  const output = join(dir, 'result.json');
  try {
    for (const phase of ['host-navigation', 'first-game-endpoint', 'next-round-endpoint']) {
      await writeFile(output, '{"complete":true}');
      const report = { complete: false, trials: [], samples: [] };
      let writes = 0;
      await recordTrial(
        report,
        { run: 1 },
        (trial) => {
          trial.phase = phase;
          throw new Error('private query must never be output');
        },
        () => {
          report.samples.push({ phase, requestCount: 2, completeReady: false });
        },
        async () => {
          writes++;
          await writeFile(output, JSON.stringify(report));
        },
      );
      const saved = JSON.parse(await readFile(output, 'utf8'));
      assert.equal(writes, 1);
      assert.equal(saved.complete, false);
      assert.equal(saved.trials[0].phase, phase);
      assert.equal(saved.samples[0].requestCount, 2);
      assert.equal(JSON.stringify(saved).includes('private query'), false);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('HTTP/CSS/font failures and pending requests block mandatory readiness', async () => {
  const base = new URL('http://127.0.0.1:4250/');
  for (const failure of [
    'http',
    'font',
    'pending',
    'requestfailed',
    'missing-repeat-timing',
    'none',
  ]) {
    const page = new EventEmitter();
    page.evaluate = async (fn) =>
      fn.name === 'gameState'
        ? active
        : {
            timeOrigin: 1,
            fontFailures: failure === 'font' ? [{ status: 'error' }] : [],
            imageFailures: [],
            timing: [
              {
                address: `${base}style.css?private=1`,
                startTime: 1,
                transferSize: 320,
                encodedBodySize: 20,
              },
            ],
          };
    const probe = new TransferProbe(page, base);
    probe.phase = 'cold-first-game';
    const request = {
      url: () => `${base}style.css?private=1`,
      resourceType: () => 'stylesheet',
      sizes: async () => ({ responseBodySize: 20 }),
    };
    page.emit('request', request);
    page.emit('response', {
      request: () => request,
      status: () => (failure === 'http' ? 404 : 200),
      headers: () => ({}),
    });
    if (failure === 'requestfailed') page.emit('requestfailed', request);
    else if (failure !== 'pending') page.emit('requestfinished', request);
    if (failure === 'missing-repeat-timing') {
      const repeated = { ...request };
      page.emit('request', repeated);
      page.emit('response', { request: () => repeated, status: () => 200, headers: () => ({}) });
      page.emit('requestfinished', repeated);
    }
    const sample = await probe.collect({}, true);
    assert.equal(sample.completeReady, failure === 'none');
    assert.equal(JSON.stringify(sample).includes('private=1'), false);
  }
});
