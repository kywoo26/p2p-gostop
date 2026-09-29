import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Duplex } from 'node:stream';
import { expect, test } from '@playwright/test';
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';
import { WebSocket } from 'ws';
import { createRemoteGuest } from '../src/p2p/remote.ts';
import type { SettingsStore } from '../src/net/index.ts';

test.use({ ignoreHTTPSErrors: true });

// 공유 워크트리는 전용 Playwright 포트를 사용하며 relay의 Origin 허용값도 같아야 한다.
const appOrigin = `http://127.0.0.1:${Number(process.env['PLAYWRIGHT_PORT'] ?? 4173)}`;

function memory(): SettingsStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

async function startRelay(
  directory: string,
  secret: string,
): Promise<{ process: ChildProcessWithoutNullStreams; port: number }> {
  const html = '<!doctype html><title>test</title>';
  await writeFile(join(directory, 'index.html'), html);
  const hash = createHash('sha256').update('index.html').update('\0').update(html).digest('hex');
  await writeFile(
    join(directory, 'version.json'),
    JSON.stringify({ wireVersion: PROTOCOL_VERSION, hash }),
  );
  const child = spawn(process.execPath, [resolve('../../packages/relay-dev/src/cli.ts')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RELAY_PUBLIC: '1',
      RELAY_CREATION_SECRET: secret,
      RELAY_ALLOWED_ORIGINS: appOrigin,
      RELAY_RELEASE: 'v0.0.1',
      RELAY_DIST_DIR: directory,
      HOST: '127.0.0.1',
      PORT: '0',
    },
  });
  try {
    const port = await new Promise<number>((done, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`relay start timeout: ${output}`)), 10_000);
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = /public listening on 127\.0\.0\.1:(\d+)\/ws/.exec(output);
        if (match?.[1]) {
          clearTimeout(timer);
          done(Number(match[1]));
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`relay exited ${code}: ${output}`));
      });
    });
    return { process: child, port };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

async function startTlsProxy(
  directory: string,
  relayPort: number,
): Promise<{ server: HttpsServer; origin: string; sockets: Set<Duplex> }> {
  const keyPath = join(directory, 'relay.key');
  const certPath = join(directory, 'relay.crt');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  const server = createHttpsServer({
    key: await readFile(keyPath),
    cert: await readFile(certPath),
  });
  const sockets = new Set<Duplex>();
  server.on('request', (request, response) => {
    const upstream = httpRequest(
      {
        hostname: '127.0.0.1',
        port: relayPort,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (fromRelay) => {
        response.writeHead(fromRelay.statusCode ?? 502, fromRelay.headers);
        fromRelay.pipe(response);
      },
    );
    upstream.on('error', () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  server.on('upgrade', (request, socket, head) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    const upstream = netConnect(relayPort, '127.0.0.1', () => {
      const lines = [`${request.method} ${request.url} HTTP/1.1`];
      for (let index = 0; index < request.rawHeaders.length; index += 2)
        lines.push(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`);
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('TLS proxy port unavailable');
  return { server, origin: `https://127.0.0.1:${address.port}`, sockets };
}

test('실제 공개 중계로 방 생성, 코드 승인, 게스트 좌석 획득 (FR-RP-01/02/03)', async ({ page }) => {
  test.setTimeout(60_000);
  const directory = await mkdtemp(join(tmpdir(), 'rp05a-e2e-'));
  const secret = randomBytes(32).toString('base64url');
  let relay: Awaited<ReturnType<typeof startRelay>> | undefined;
  let proxy: Awaited<ReturnType<typeof startTlsProxy>> | undefined;
  let guest: ReturnType<typeof createRemoteGuest> | undefined;
  let deniedGuest: ReturnType<typeof createRemoteGuest> | undefined;
  let welcomed = false;
  try {
    relay = await startRelay(directory, secret);
    proxy = await startTlsProxy(directory, relay.port);
    const relayOrigin = proxy.origin;
    await page.goto('./');
    await page.getByRole('button', { name: '친구와 원격 대전' }).click();
    await page.getByRole('textbox', { name: '중계 URL' }).fill(relayOrigin);
    await page.getByLabel('생성 자격').fill(secret);
    await page.getByRole('button', { name: '원격 설정 저장' }).click();
    await page.getByRole('link', { name: '뒤로' }).click();
    await page.getByRole('button', { name: '친구와 원격 대전' }).click();
    await page.getByRole('button', { name: '방 만들기' }).click();
    const code = await page.getByTestId('remote-code').innerText();
    expect(code).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/);
    const inviteLink = page.getByRole('textbox', { name: '초대 링크' });
    for (const failure of ['false', 'exception'] as const) {
      await page.evaluate((kind) => {
        Object.defineProperty(document, 'execCommand', {
          configurable: true,
          value: () => {
            document.querySelector<HTMLInputElement>('input[readonly]')?.setSelectionRange(2, 2);
            if (kind === 'exception') throw new Error('copy unavailable');
            return false;
          },
        });
      }, failure);
      await page.getByRole('button', { name: '초대 링크 복사' }).click();
      await expect(
        page.getByText('복사에 실패했습니다. 선택된 링크를 직접 복사하세요.'),
      ).toBeVisible();
      const selection = await inviteLink.evaluate((input: HTMLInputElement) => ({
        start: input.selectionStart,
        end: input.selectionEnd,
        length: input.value.length,
        focused: document.activeElement === input,
      }));
      expect(selection).toEqual({
        start: 0,
        end: selection.length,
        length: selection.length,
        focused: true,
      });
    }
    await page.getByRole('link', { name: '뒤로' }).click();
    await expect(page.getByRole('button', { name: '핫스팟 대전' })).toBeDisabled();
    await page.evaluate(() => {
      location.hash = '#/versus';
    });
    await expect(page).toHaveURL(/#\/remote$/);
    await page.evaluate(() => {
      location.hash = '#/settings';
    });
    await expect(page.getByRole('textbox', { name: '중계 URL' })).toBeDisabled();
    await expect(page.getByLabel('생성 자격')).toBeDisabled();
    await page.getByRole('link', { name: '뒤로' }).click();
    await page.getByRole('button', { name: '친구와 원격 대전' }).click();
    await expect(page.getByRole('heading', { name: '원격 방 열기' })).toBeVisible();
    const makeGuest = () =>
      createRemoteGuest({
        allowedOrigin: relayOrigin,
        storage: memory(),
        socketFactory: (url) =>
          new WebSocket(url, {
            origin: appOrigin,
            rejectUnauthorized: false,
          }) as unknown as globalThis.WebSocket,
        onTransport: (transport, nickname) => {
          transport.onMessage((raw) => {
            if (raw.includes('"t":"welcome"')) welcomed = true;
          });
          transport.send({ t: 'hello', v: PROTOCOL_VERSION, name: nickname });
        },
      });
    deniedGuest = makeGuest();
    const deniedJoining = deniedGuest.joinByCode(relayOrigin, code, '거절친구');
    await expect(page.getByText(/거절친구 · 코드 참여/)).toBeVisible();
    await page.getByRole('button', { name: '거절' }).click();
    expect(await deniedJoining).toEqual({ ok: false, code: 'denied' });
    await expect(page.getByText(/거절친구 · 코드 참여/)).not.toBeVisible();
    guest = makeGuest();
    const joining = guest.joinByCode(relayOrigin, code, '코드친구');
    await expect(page.getByText(/코드친구 · 코드 참여/)).toBeVisible();
    await page.getByRole('button', { name: '수락' }).click();
    expect(await joining).toEqual({ ok: true });
    await expect(page.getByRole('status').filter({ hasText: '코드친구 · 연결됨' })).toBeVisible();
    await expect(page.getByTestId('host-start')).toBeEnabled();
    await expect.poll(() => welcomed).toBe(true);
  } finally {
    guest?.leave();
    deniedGuest?.leave();
    for (const socket of proxy?.sockets ?? []) socket.destroy();
    await new Promise<void>((done) => proxy?.server.close(() => done()) ?? done());
    if (relay && relay.process.exitCode === null) {
      const stopped = new Promise<void>((done) => relay!.process.once('exit', () => done()));
      relay.process.kill('SIGTERM');
      await stopped;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
