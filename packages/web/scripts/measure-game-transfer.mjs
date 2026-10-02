// B207-2: 실제 UI 흐름의 응답·단계를 기록한다. 성능/실기기 PASS 판정이 아니다.
import { writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { firstGameReady, gameState, recordTrial, TransferProbe } from './game-transfer-probe.mjs';

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

const [address, relayPort, output] = process.argv.slice(2);
const report = {
  schema: 2,
  complete: false,
  condition:
    'StaticSite/private loopback LAN relay; standard UI; deterministic crypto fixture host101/guest201; speed=instant; desktop no throttle; actual legal buttons; WS frames excluded',
  trials: [],
  samples: [],
  failures: [],
};
async function save() {
  report.complete =
    report.failures.length === 0 &&
    report.trials.length === 6 &&
    report.trials.every((trial) => trial.complete) &&
    report.samples.length === 30 &&
    report.samples.every((sample) => sample.completeReady);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}
try {
  // 시작부터 새 실패 보고서를 쓴다. 이전 파일을 성공 결과로 남기지 않는다.
  await save();
  const base = new URL(address);
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname))
    throw new Error('Only HTTP loopback fixture is allowed');
  if (!/^\d+$/.test(relayPort ?? '')) throw new Error('A local test relay port is required');
  for (const [hostEngine, guestEngine] of [
    ['chromium', 'webkit'],
    ['webkit', 'chromium'],
  ]) {
    const browsers = [];
    try {
      browsers.push(await { chromium, webkit }[hostEngine].launch());
      browsers.push(await { chromium, webkit }[guestEngine].launch());
      for (let run = 1; run <= 3; run++) {
        let contexts = [];
        let probes = [];
        const metadata = (i) => ({
          engine: [hostEngine, guestEngine][i],
          role: ['host', 'guest'][i],
          run,
        });
        const capture = async (endpointReached) => {
          const samples = await Promise.all(
            probes.map(async (probe, i) => {
              try {
                return await probe.collect(metadata(i), endpointReached);
              } catch {
                return probe.partial(metadata(i));
              }
            }),
          );
          report.samples.push(...samples);
          return samples.every((sample) => sample.completeReady);
        };
        await recordTrial(
          report,
          { hostEngine, guestEngine, run },
          async (trial) => {
            contexts = await Promise.all(
              browsers.map((browser) =>
                browser.newContext({
                  viewport: { width: 412, height: 840 },
                  deviceScaleFactor: 3.5,
                  proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' },
                }),
              ),
            );
            const pages = await Promise.all(contexts.map((context) => context.newPage()));
            probes = pages.map((page) => new TransferProbe(page, base));
            for (let i = 0; i < 2; i++) await pages[i].addInitScript(entropy, 101 + i * 100);
            await Promise.all(probes.map((probe) => probe.begin('cold-first-game')));
            const [host, guest] = pages;
            const query = `?speed=instant&relay=127.0.0.1:${relayPort}`;
            trial.phase = 'host-navigation';
            await host.goto(`${address}${query}&role=host#/`);
            await host.getByRole('link', { name: '핫스팟 대전' }).click();
            trial.phase = 'guest-lobby';
            await guest.goto(`${address}${query}&role=guest`);
            await guest.getByRole('textbox', { name: '내 이름' }).fill('시험 참가자');
            await guest.getByRole('button', { name: '입장', exact: true }).click();
            await guest.getByTestId('lobby').waitFor();
            await host.getByTestId('host-start').click();
            await Promise.all(pages.map((page) => page.getByTestId('match').waitFor()));
            trial.phase = 'first-game-endpoint';
            let firstReady = false;
            for (let attempt = 0; attempt < 2000; attempt++) {
              if (
                firstGameReady(await Promise.all(pages.map((page) => page.evaluate(gameState))))
              ) {
                firstReady = true;
                break;
              }
              for (const page of pages) await page.evaluate(initialStep);
              await host.waitForTimeout(20);
            }
            if (!firstReady) throw new Error('Actual first-game interaction was not reached');
            if (!(await capture(true))) {
              trial.failures.push({ reason: 'mandatory-readiness-failed' });
              return false;
            }
            await Promise.all(probes.map((probe) => probe.begin('round-to-next-round')));
            trial.phase = 'next-round-endpoint';
            let nextReady = false;
            for (let attempt = 0; attempt < 5000; attempt++) {
              const states = await Promise.all(pages.map((page) => page.evaluate(gameState)));
              if (states.every((s) => s.rounds >= 1) && firstGameReady(states)) {
                nextReady = true;
                break;
              }
              for (const page of pages) await page.evaluate(step, true);
              await host.waitForTimeout(20);
            }
            if (!nextReady) throw new Error('Actual additional round was not reached');
            if (!(await capture(true))) {
              trial.failures.push({ reason: 'additional-round-readiness-failed' });
              return false;
            }
            trial.phase = 'warm-reload-endpoint';
            await probes[1].begin('warm-game-reload');
            await guest.reload();
            await guest.getByTestId('match').waitFor();
            await guest.waitForFunction(() => {
              const root = globalThis.document.querySelector('[data-testid="match"]');
              const board = root?.querySelector('[data-testid="board"]');
              return (
                root?.dataset.phase === 'playing' &&
                board?.querySelectorAll('[aria-label="내 손패"] button').length === 10 &&
                !board.classList.contains('first-pick') &&
                (root.dataset.canAct !== 'true' ||
                  (board.dataset.busy === 'false' &&
                    board.querySelector('[aria-label="내 손패"] button:not(:disabled)') !== null))
              );
            });
            const warm = await probes[1].collect(metadata(1), true);
            report.samples.push(warm);
            if (!warm.completeReady) trial.failures.push({ reason: 'warm-readiness-failed' });
            return warm.completeReady;
          },
          () => capture(false),
          save,
        );
        await Promise.all(contexts.map((context) => context.close()));
      }
    } finally {
      await Promise.all(browsers.map((browser) => browser.close()));
    }
  }
} catch (error) {
  report.failures.push({
    reason: 'probe-exception',
    type: error?.name === 'TimeoutError' ? 'timeout' : 'error',
  });
} finally {
  await save();
  if (!report.complete) process.exitCode = 1;
}
