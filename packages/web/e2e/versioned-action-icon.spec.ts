// #229 · FR-40/NF-03/NF-08: 동일 dist의 root/버전 경로에서 실제 첫 판 벨을 검증한다.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const dist = resolve('dist');
const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.ogg': 'audio/ogg',
};

async function fixture(prefix: string) {
  // prefix 밖에는 root alias나 SPA fallback을 두지 않는다.
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const file = resolve(dist, pathname.slice(prefix.length) || 'index.html');
      if (!pathname.startsWith(prefix) || !file.startsWith(`${dist}${sep}`)) {
        response.writeHead(404).end();
        return;
      }
      try {
        const body = await readFile(file);
        response
          .writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
          .end(body);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture port unavailable');
  // 실제 서비스 설정/자격을 상속하지 않는 합성 LAN relay만 사용한다.
  const relay = spawn(process.execPath, [resolve('../relay-dev/src/cli.ts'), '--port', '0'], {
    env: { HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const relayPort = await new Promise<number>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('synthetic relay timeout')), 15_000);
    relay.stdout.on('data', (chunk: Buffer) => {
      const match = /listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(chunk.toString());
      if (match?.[1]) {
        clearTimeout(timer);
        done(Number(match[1]));
      }
    });
    relay.once('error', reject);
    relay.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('synthetic relay exited'));
    });
  });
  return {
    origin: `http://127.0.0.1:${address.port}`,
    relayPort,
    async close() {
      relay.kill('SIGTERM');
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

async function firstGame(host: Page, guest: Page) {
  await host.getByRole('link', { name: '핫스팟 대전' }).click();
  await guest.getByRole('textbox', { name: '내 이름' }).fill('합성 게스트');
  await guest.getByRole('button', { name: '입장' }).click();
  await expect(host.getByTestId('host-start')).toBeEnabled();
  await host.getByLabel('생각 시간').selectOption('off');
  await host.getByTestId('host-start').click();
  // 선 고르기가 동률이면 같은 정상 UI 경로로 다시 고른다. 손패 입력은 하지 않는다.
  await expect
    .poll(
      async () => {
        for (const page of [host, guest]) {
          const pick = page.locator('[data-choice^="pick-"]:not([disabled])').first();
          if (
            (await pick.isVisible()) &&
            (await page.getByTestId('match').getAttribute('data-can-act')) === 'true'
          )
            await pick.click();
        }
        return await host.locator('[aria-label="내 손패"] button').count();
      },
      { timeout: 30_000 },
    )
    .toBe(10);
  await expect(guest.locator('[aria-label="내 손패"] button')).toHaveCount(10);
}

for (const mode of ['root', 'versioned'] as const) {
  for (let sample = 1; sample <= 3; sample++) {
    test(`${mode} 첫 게임 벨 HTTP/decode·ARIA·비가림 표본 ${sample} @guest`, async ({
      browser,
    }, testInfo) => {
      const metadata = JSON.parse(await readFile(resolve(dist, 'version.json'), 'utf8')) as {
        hash: string;
      };
      const prefix = mode === 'root' ? '/' : `/r/v0.0.1/${metadata.hash}/`;
      const run = await fixture(prefix);
      const contexts = await Promise.all([
        browser.newContext({ viewport: { width: 390, height: 844 } }),
        browser.newContext({ viewport: { width: 390, height: 844 } }),
      ]);
      try {
        const pages = await Promise.all(contexts.map((context) => context.newPage()));
        const [host, guest] = pages;
        if (!host || !guest) throw new Error('fixture pages unavailable');
        const external: string[] = [];
        const responses: { path: string; status: number }[][] = [[], []];
        pages.forEach((page, index) => {
          page.on('request', (request) => {
            if (new URL(request.url()).hostname !== '127.0.0.1') external.push('external request');
          });
          page.on('websocket', (socket) => {
            if (new URL(socket.url()).hostname !== '127.0.0.1') external.push('external socket');
          });
          page.on('response', (response) => {
            if (new URL(response.url()).pathname.endsWith('/skin/bell-illustrated.webp'))
              responses[index]?.push({
                path: new URL(response.url()).pathname,
                status: response.status(),
              });
          });
        });
        if (mode === 'versioned')
          expect(
            (await host.request.get(`${run.origin}/skin/bell-illustrated.webp`)).status(),
          ).toBe(404);
        const query = `?speed=instant&relay=127.0.0.1:${run.relayPort}`;
        await host.goto(`${run.origin}${prefix}${query}&role=host`);
        await guest.goto(`${run.origin}${prefix}${query}&role=guest`);
        await firstGame(host, guest);
        expect(await host.getByTestId('match').getAttribute('data-seq')).toBe(
          await guest.getByTestId('match').getAttribute('data-seq'),
        );
        const observations = [];
        for (const [index, page] of pages.entries()) {
          const bell = page.locator('.seat-bar.me .counter img');
          await expect(bell).toBeVisible();
          // 선 고르기 모달의 퇴장 transition이 끝난 뒤 비가림을 측정한다.
          await expect
            .poll(() =>
              bell.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return [0.2, 0.5, 0.8].every((fraction) => {
                  const top = document.elementFromPoint(
                    rect.left + rect.width * fraction,
                    rect.top + rect.height / 2,
                  );
                  return top === element || top === element.parentElement;
                });
              }),
            )
            .toBe(true);
          const observed = await bell.evaluate(async (element: HTMLImageElement) => {
            let decode = 'ok';
            try {
              await element.decode();
            } catch (error) {
              decode = (error as Error).name;
            }
            const rect = element.getBoundingClientRect();
            const visible = [0.2, 0.5, 0.8].every((fraction) => {
              const top = document.elementFromPoint(
                rect.left + rect.width * fraction,
                rect.top + rect.height / 2,
              );
              return top === element || top === element.parentElement;
            });
            return {
              path: new URL(element.currentSrc).pathname,
              naturalWidth: element.naturalWidth,
              decode,
              complete: element.complete,
              visible,
              width: rect.width,
              height: rect.height,
              alt: element.alt,
              hidden: element.parentElement?.getAttribute('aria-hidden'),
              counter: element.closest('[role="img"]')?.getAttribute('aria-label'),
            };
          });
          observations.push({
            role: index === 0 ? 'host' : 'guest',
            statuses: responses[index]
              ?.filter((response) => response.path === observed.path)
              .map((response) => response.status),
            ...observed,
          });
        }
        await testInfo.attach('bell-observations', {
          body: JSON.stringify(observations),
          contentType: 'application/json',
        });
        console.info(
          JSON.stringify({ mode, sample, browser: testInfo.project.name, observations }),
        );
        expect(external).toEqual([]);
        for (const observed of observations) {
          expect.soft(observed.statuses).toEqual([200]);
          expect.soft(observed.path).toBe(`${prefix}skin/bell-illustrated.webp`);
          expect.soft(observed.naturalWidth).toBeGreaterThan(0);
          expect.soft(observed.decode).toBe('ok');
          expect.soft(observed.complete).toBe(true);
          expect.soft(observed.visible).toBe(true);
          expect.soft([observed.width, observed.height]).toEqual([16, 16]);
          expect.soft(observed.alt).toBe('');
          expect.soft(observed.hidden).toBe('true');
          expect.soft(observed.counter).toBe('뻑 0회, 흔들기 0회');
        }
      } finally {
        await Promise.all(contexts.map((context) => context.close()));
        await run.close();
      }
    });
  }
}
