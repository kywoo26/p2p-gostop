// B207-2: 고정 합법 입력으로 실제 로비→첫 판→다음 판. 성능/실기기 PASS 판정이 아니다.
import { writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const [address, relayPort, output] = process.argv.slice(2);
const base = new URL(address);
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname))
  throw new Error('Only HTTP loopback fixture is allowed');
if (!/^\d+$/.test(relayPort ?? '')) throw new Error('A local test relay port is required');
const samples = [];
function entropy(seed) {
  let value = seed;
  Object.defineProperty(crypto, 'getRandomValues', {
    value(array) {
      for (let i = 0; i < array.length; i++) {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        array[i] = value & 255;
      }
      return array;
    },
  });
}
function state() {
  const root = globalThis.document.querySelector('[data-testid="match"]');
  const enabled = root?.dataset.canAct === 'true';
  const hand = globalThis.document.querySelectorAll('[aria-label="내 손패"] button');
  return {
    match: root !== null,
    canAct: enabled,
    hand: hand.length,
    firstPickPending: globalThis.document.querySelector('[data-choice^="pick-"]') !== null,
    rounds: Number(root?.dataset.roundsPlayed ?? 0),
    seq: Number(root?.dataset.seq ?? 0),
  };
}
function step(allowNext) {
  const doc = globalThis.document;
  const next = doc.querySelector('[data-choice="next"]:not(:disabled)');
  if (next) {
    if (allowNext) next.click();
    return false;
  }
  const accept = doc.querySelector('[data-choice="accept"]:not(:disabled)');
  if (accept) {
    accept.click();
    return true;
  }
  const root = doc.querySelector('[data-testid="match"]');
  if (root?.dataset.canAct !== 'true') return false;
  const board = doc.querySelector('[data-testid="board"][data-awaiting="me"]');
  if (!board) return false;
  const choices = [...board.querySelectorAll('button[data-choice]:not(:disabled)')];
  const priority = ['stop', 'noShake', 'pi', 'continue', 'flipOnly'];
  const choice =
    priority.map((id) => choices.find((button) => button.dataset.choice === id)).find(Boolean) ??
    choices[0];
  const hand = board.querySelector('[aria-label="내 손패"] button:not(:disabled)');
  const button = choice ?? hand;
  if (!button) return false;
  button.click();
  return true;
}
function initialStep() {
  const doc = globalThis.document;
  if (doc.querySelector('[data-testid="match"]')?.dataset.canAct !== 'true') return;
  doc.querySelector('[data-choice^="pick-"]:not(:disabled)')?.click();
}
async function ready(page) {
  const failed = await page.evaluate(async () => {
    await globalThis.document.fonts.ready;
    const images = [...globalThis.document.images];
    return (
      await Promise.all(
        images.map(async (image) => {
          try {
            await image.decode();
            return null;
          } catch {
            const url = new URL(image.currentSrc || image.src);
            return {
              path: url.protocol === 'data:' ? 'inline-data' : url.pathname,
              complete: image.complete,
              width: image.naturalWidth,
              connected: image.isConnected,
            };
          }
        }),
      )
    ).filter(Boolean);
  });
  return failed;
}
async function collect(page, records, phase, engine, role, run) {
  const imageFailures = await ready(page);
  const timing = await page.evaluate(() =>
    [
      ...performance.getEntriesByType('navigation'),
      ...performance.getEntriesByType('resource'),
    ].map((entry) => ({
      path: new URL(entry.name).pathname,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      transferSize: entry.transferSize,
    })),
  );
  const entries = timing.map((entry) => ({
    ...entry,
    path: entry.path.replace(base.pathname, ''),
  }));
  const unique = new Map();
  for (const entry of entries)
    if (entry.transferSize > 0) unique.set(entry.path, entry.encodedBodySize);
  samples.push({
    engine,
    role,
    run,
    phase,
    requestCount: records.length,
    completeReady: imageFailures.length === 0,
    imageFailures,
    responses: [...records],
    timing: entries,
    networkUniqueEncodedBodySizeFromTiming: [...unique.values()].reduce((a, b) => a + b, 0),
    state: await page.evaluate(state),
  });
  return imageFailures.length === 0;
}
for (const [hostEngine, guestEngine] of [
  ['chromium', 'webkit'],
  ['webkit', 'chromium'],
]) {
  const hostBrowser = await { chromium, webkit }[hostEngine].launch();
  const guestBrowser = await { chromium, webkit }[guestEngine].launch();
  try {
    for (let run = 1; run <= 3; run++) {
      const contexts = await Promise.all(
        [hostBrowser, guestBrowser].map((browser) =>
          browser.newContext({
            viewport: { width: 412, height: 840 },
            deviceScaleFactor: 3.5,
            proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' },
          }),
        ),
      );
      try {
        const pages = await Promise.all(contexts.map((context) => context.newPage()));
        const records = [[], []];
        for (let i = 0; i < 2; i++) {
          await pages[i].addInitScript(entropy, 101 + i * 100);
          pages[i].on('response', (response) => {
            const url = new URL(response.url());
            if (url.origin !== base.origin) throw new Error('Unexpected non-fixture HTTP response');
            const headers = response.headers();
            records[i].push({
              path: url.pathname.replace(base.pathname, ''),
              status: response.status(),
              encoding: headers['content-encoding'] ?? 'identity',
              contentLength: Number(headers['content-length'] ?? 0),
              cacheControl: headers['cache-control'] ?? '',
            });
          });
        }
        const [host, guest] = pages;
        const query = `?speed=instant&relay=127.0.0.1:${relayPort}`;
        await host.goto(`${address}${query}&role=host#/`);
        await host.getByRole('button', { name: '핫스팟 대전' }).click();
        await guest.goto(`${address}${query}&role=guest`);
        await guest.getByRole('textbox', { name: '내 이름' }).fill('시험 참가자');
        await guest.getByRole('button', { name: '입장', exact: true }).click();
        await guest.getByTestId('lobby').waitFor();
        await host.getByTestId('host-start').click();
        await Promise.all(pages.map((page) => page.getByTestId('match').waitFor()));
        let firstReady = false;
        for (let attempt = 0; attempt < 2000; attempt++) {
          const states = await Promise.all(pages.map((page) => page.evaluate(state)));
          if (
            states.every((s) => s.hand > 0 && !s.firstPickPending) &&
            states.some((s) => s.canAct)
          ) {
            firstReady = true;
            break;
          }
          for (const page of pages) await page.evaluate(initialStep);
          await host.waitForTimeout(20);
        }
        if (!firstReady) throw new Error('Actual first-game interaction was not reached');
        const completed = [];
        for (let i = 0; i < 2; i++) {
          completed.push(
            await collect(
              pages[i],
              records[i],
              'cold-first-game-attempt',
              [hostEngine, guestEngine][i],
              ['host', 'guest'][i],
              run,
            ),
          );
          records[i].length = 0;
          await pages[i].evaluate(() => performance.clearResourceTimings());
        }
        if (!completed.every(Boolean)) {
          console.log(
            `${hostEngine}/${guestEngine} run ${run}: mandatory image failure, no first-game acceptance`,
          );
          continue;
        }
        let nextReady = false;
        for (let attempt = 0; attempt < 5000; attempt++) {
          const states = await Promise.all(pages.map((page) => page.evaluate(state)));
          if (states.every((s) => s.rounds >= 1 && s.hand > 0) && states.some((s) => s.canAct)) {
            nextReady = true;
            break;
          }
          for (const page of pages) await page.evaluate(step, true);
          await host.waitForTimeout(20);
        }
        if (!nextReady) throw new Error('Actual additional round was not reached');
        for (let i = 0; i < 2; i++) {
          await collect(
            pages[i],
            records[i],
            'round-to-next-round',
            [hostEngine, guestEngine][i],
            ['host', 'guest'][i],
            run,
          );
          records[i].length = 0;
        }
        await guest.reload();
        await guest.getByTestId('match').waitFor();
        await guest.waitForFunction(
          () => globalThis.document.querySelectorAll('[aria-label="내 손패"] button').length > 0,
        );
        await collect(guest, records[1], 'warm-game-reload', guestEngine, 'guest', run);
        console.log(
          `${hostEngine}/${guestEngine} run ${run}: actual first-game and next-round reached`,
        );
      } finally {
        await Promise.all(contexts.map((context) => context.close()));
      }
    }
  } finally {
    await Promise.all([hostBrowser.close(), guestBrowser.close()]);
  }
}
await writeFile(
  output,
  `${JSON.stringify({ schema: 1, complete: samples.every((sample) => sample.completeReady), condition: 'StaticSite identity/private loopback LAN relay; standard UI; deterministic crypto fixture host101/guest201; speed=instant; desktop no throttle; actual legal buttons; WS frames excluded', samples }, null, 2)}\n`,
);
if (samples.some((sample) => !sample.completeReady)) process.exitCode = 1;
