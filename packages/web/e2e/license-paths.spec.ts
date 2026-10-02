// NF-07/NP-08: 배포 UI의 고지 링크를 실제 relay prefix와 Android root 대역에서 연다.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';

const dist = resolve('dist');
const notices = ['cards/ATTRIBUTION.md', 'pro/NOTICE.md', 'oss/NOTICE.txt'];
const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
};

async function rootFixture() {
  // Android의 정확 고지 MIME 계약을 따른다. 실제 Ktor 동작은 M4ServerTest가 검사한다.
  const server = createServer((request, response) => {
    void (async () => {
      const name = (request.url ?? '/').split('?')[0]!.slice(1) || 'index.html';
      const file = resolve(dist, name);
      if (!file.startsWith(`${dist}${sep}`) || name.includes('%')) {
        response.writeHead(404).end();
        return;
      }
      const type = notices.includes(name) ? 'text/plain; charset=utf-8' : types[extname(name)];
      if (!type) {
        response.writeHead(404).end();
        return;
      }
      try {
        const body = await readFile(file);
        response
          .writeHead(200, {
            'Content-Type': type,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          })
          .end(body);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture port unavailable');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    prefix: '/',
    async close() {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

async function releaseFixture() {
  // 실제 relay CLI/StaticSite로 현재 dist manifest와 hash를 검증한다. 운영 환경변수는 상속하지 않는다.
  const child = spawn(
    process.execPath,
    [resolve('../relay-dev/src/cli.ts'), '--public', '--port', '0'],
    {
      env: {
        HOST: '127.0.0.1',
        RELAY_CREATION_SECRET: randomBytes(32).toString('base64url'),
        RELAY_ALLOWED_ORIGINS: 'https://relay.example.test',
        RELAY_RELEASE: 'v0.4.1',
        RELAY_DIST_DIR: dist,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  try {
    const port = await new Promise<number>((done, reject) => {
      const timer = setTimeout(() => reject(new Error('synthetic relay timeout')), 15_000);
      child.stdout.on('data', (chunk: Buffer) => {
        const match = /public listening on 127\.0\.0\.1:(\d+)/.exec(chunk.toString());
        if (match?.[1]) {
          clearTimeout(timer);
          done(Number(match[1]));
        }
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('synthetic relay exited'));
      });
    });
    const metadata = JSON.parse(await readFile(resolve(dist, 'version.json'), 'utf8')) as {
      hash: string;
    };
    return {
      origin: `http://127.0.0.1:${port}`,
      prefix: `/r/v0.4.1/${metadata.hash}/`,
      async close() {
        if (child.exitCode !== null) return;
        await new Promise<void>((done) => {
          child.once('exit', () => done());
          child.kill('SIGTERM');
        });
      },
    };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

for (const mode of ['root', 'prefix'] as const) {
  test(`${mode} 라이선스 UI 링크 3개가 같은 배포 경로의 원문을 연다 @guest`, async ({ page }) => {
    const run = await (mode === 'root' ? rootFixture() : releaseFixture());
    const external: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== run.origin) external.push('external request');
    });
    try {
      for (const name of notices) {
        await page.goto(`${run.origin}${run.prefix}#/license`);
        await expect(page.getByRole('heading', { name: '라이선스', exact: true })).toBeVisible();
        const link = page.locator(`a[href$="${name}"]`);
        expect(await link.evaluate((element: HTMLAnchorElement) => element.href)).toBe(
          `${run.origin}${run.prefix}${name}`,
        );
        const response = page.waitForResponse(
          (res) =>
            res.url() === `${run.origin}${run.prefix}${name}` &&
            res.request().isNavigationRequest(),
        );
        await link.click();
        const document = await response;
        expect(document.status()).toBe(200);
        expect(document.headers()['content-type']).toBe('text/plain; charset=utf-8');
        expect(document.headers()['x-content-type-options']).toBe('nosniff');
        expect(document.headers()['cache-control']).toBe(
          mode === 'root' ? 'no-store' : 'public, max-age=31536000, immutable',
        );
        expect(await document.text()).toBe(await readFile(resolve(dist, name), 'utf8'));
        await expect(page.locator('body')).toContainText(
          (await readFile(resolve(dist, name), 'utf8')).split('\n')[0]!,
        );
        await page.goBack();
        await expect(page.getByRole('heading', { name: '라이선스', exact: true })).toBeVisible();
      }
      expect(external).toEqual([]);
      if (mode === 'prefix')
        expect((await page.request.get(`${run.origin}/pro/NOTICE.md`)).status()).toBe(404);
    } finally {
      await run.close();
    }
  });
}
