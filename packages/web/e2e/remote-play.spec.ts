// RP-07: 실제 공개 relay-dev와 동일 dist를 거치는 두 브라우저 통합 검증.
// 인증·만료의 서버 단위 경계는 relay-dev/test, 연결 상태 단위 경계는 test:net이 담당한다.
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Duplex } from 'node:stream';
import {
  expect,
  test,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { WebSocket } from 'ws';

const appOrigin = `http://127.0.0.1:${process.env['PLAYWRIGHT_PORT'] ?? '4173'}`;
const release = 'v0.0.1';
const relayCli = resolve('../relay-dev/src/cli.ts');
const dist = resolve('dist');

// 공개 relay 자격·초대 fragment·Bearer 토큰은 실패 trace와 CI artifact에 남겨서는 안 된다.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

interface RelayProcess {
  child: ChildProcessWithoutNullStreams;
  port: number;
  output: string[];
}

async function startRelay(secret: string, guestOrigin: string): Promise<RelayProcess> {
  const child = spawn(process.execPath, [relayCli], {
    cwd: resolve('../..'),
    env: {
      ...process.env,
      RELAY_PUBLIC: '1',
      RELAY_CREATION_SECRET: secret,
      RELAY_ALLOWED_ORIGINS: `${appOrigin},${guestOrigin}`,
      RELAY_RELEASE: release,
      RELAY_DIST_DIR: dist,
      HOST: '127.0.0.1',
      PORT: '0',
    },
  });
  const output: string[] = [];
  try {
    const port = await new Promise<number>((done, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`relay start timeout: ${output.join('')}`)),
        15_000,
      );
      child.stdout.on('data', (chunk: Buffer) => {
        output.push(chunk.toString());
        const match = /public listening on 127\.0\.0\.1:(\d+)\/ws/.exec(output.join(''));
        if (match?.[1]) {
          clearTimeout(timer);
          done(Number(match[1]));
        }
      });
      child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`relay exited ${code}: ${output.join('')}`));
      });
    });
    return { child, port, output };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

async function stopRelay(relay: RelayProcess | undefined): Promise<void> {
  if (!relay || relay.child.exitCode !== null) return;
  const exited = new Promise<void>((done) => relay.child.once('exit', () => done()));
  relay.child.kill('SIGTERM');
  await exited;
}

async function tlsProxy(directory: string): Promise<{
  server: HttpsServer;
  origin: string;
  sockets: Set<Duplex>;
  target: { port: number };
  setHostUnavailable(value: boolean): void;
}> {
  const key = join(directory, 'relay.key');
  const cert = join(directory, 'relay.crt');
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
      key,
      '-out',
      cert,
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  const target = { port: 0 };
  const server = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) });
  const sockets = new Set<Duplex>();
  const hostSockets = new Set<Duplex>();
  let hostUnavailable = false;
  server.on('request', (request, response) => {
    const upstream = httpRequest(
      {
        hostname: '127.0.0.1',
        port: target.port,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      },
    );
    upstream.on('error', () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  server.on('upgrade', (request, socket, head) => {
    const host =
      new URL(request.url ?? '/', 'https://127.0.0.1').searchParams.get('role') === 'host';
    if (hostUnavailable && host) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    if (host) {
      hostSockets.add(socket);
      socket.once('close', () => hostSockets.delete(socket));
    }
    const upstream = netConnect(target.port, '127.0.0.1', () => {
      const lines = [`${request.method} ${request.url} HTTP/1.1`];
      for (let index = 0; index < request.rawHeaders.length; index += 2)
        lines.push(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`);
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('TLS proxy port unavailable');
  return {
    server,
    origin: `https://127.0.0.1:${address.port}`,
    sockets,
    target,
    setHostUnavailable(value) {
      hostUnavailable = value;
      if (value) for (const socket of hostSockets) socket.destroy();
    },
  };
}

interface Pair {
  host: Page;
  guest: Page;
  guestContext: BrowserContext;
  origin: string;
  secret: string;
  relay: RelayProcess;
  path: string;
  setHostUnavailable(value: boolean): void;
  stop(): Promise<void>;
  restart(): Promise<void>;
}

async function pair(browser: Browser, guestBrowser = browser): Promise<Pair> {
  const directory = await mkdtemp(join(tmpdir(), 'rp07-e2e-'));
  const proxy = await tlsProxy(directory);
  const secret = randomBytes(32).toString('base64url');
  let relay: RelayProcess | undefined;
  const contexts: BrowserContext[] = [];
  try {
    relay = await startRelay(secret, proxy.origin);
    proxy.target.port = relay.port;
    const hostContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const guestContext = await guestBrowser.newContext({ ignoreHTTPSErrors: true });
    contexts.push(hostContext, guestContext);
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const root = await guest.request.get(`${proxy.origin}/`, { maxRedirects: 0 });
    expect(root.status()).toBe(302);
    const path = new URL(root.headers()['location'] ?? '', proxy.origin).pathname;
    expect(path).toMatch(/^\/r\/v0\.0\.1\/[0-9a-f]{64}\/$/);
    const session: Pair = {
      host,
      guest,
      guestContext,
      origin: proxy.origin,
      secret,
      relay,
      path,
      setHostUnavailable: proxy.setHostUnavailable,
      async stop() {
        for (const context of contexts) await context.close();
        for (const socket of proxy.sockets) socket.destroy();
        await new Promise<void>((done) => proxy.server.close(() => done()));
        await stopRelay(relay);
        await rm(directory, { recursive: true, force: true });
      },
      async restart() {
        await stopRelay(relay);
        relay = await startRelay(secret, proxy.origin);
        proxy.target.port = relay.port;
        session.relay = relay;
      },
    };
    return session;
  } catch (error) {
    for (const context of contexts) await context.close();
    for (const socket of proxy.sockets) socket.destroy();
    await new Promise<void>((done) => proxy.server.close(() => done()));
    await stopRelay(relay);
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function openHost(run: Pair): Promise<{ invite: string; code: string }> {
  await run.host.goto(`${appOrigin}/?speed=instant#/`);
  await run.host.getByRole('button', { name: '친구와 원격 대전' }).click();
  await run.host.getByRole('textbox', { name: '중계 URL' }).fill(run.origin);
  await run.host.getByLabel('생성 자격').fill(run.secret);
  await run.host.getByRole('button', { name: '원격 설정 저장' }).click();
  await run.host.getByRole('link', { name: '뒤로' }).click();
  await run.host.getByRole('button', { name: '친구와 원격 대전' }).click();
  await expect(run.host.getByText('중계 응답 정상')).not.toBeVisible();
  await run.host.getByRole('button', { name: '연결 확인' }).click();
  await expect(run.host.getByText(/중계 응답 정상/)).toBeVisible();
  await run.host.getByRole('button', { name: '방 만들기' }).click();
  const invite = await run.host.getByRole('textbox', { name: '초대 링크' }).inputValue();
  expect(new URL(invite).origin).toBe(run.origin);
  expect(new URL(invite).pathname).toBe(run.path);
  expect(new URL(invite).search).toBe('');
  const code = await run.host.getByTestId('remote-code').innerText();
  return { invite, code };
}

async function joinLink(page: Page, invite: string, name = '게스트'): Promise<void> {
  const url = new URL(invite);
  url.searchParams.set('speed', 'instant');
  if (page.url().startsWith(url.origin)) await page.goto('about:blank');
  await page.goto(url.href);
  await expect(page).toHaveURL(/#\/join$/);
  await expect(page.getByRole('heading', { name: '초대로 참여' })).toBeVisible();
  await page.getByRole('textbox', { name: '이름' }).fill(name);
  await page.getByRole('button', { name: '참여하기' }).click();
}

async function joinCode(page: Page, run: Pair, code: string, name: string): Promise<void> {
  await page.goto(`${run.origin}${run.path}?speed=instant#/join`);
  await expect(page.getByRole('heading', { name: '코드로 참여' })).toBeVisible();
  await page.getByRole('textbox', { name: '이름' }).fill(name);
  await page.getByRole('textbox', { name: '12자리 방 코드' }).fill(code);
  await page.getByRole('button', { name: '참여하기' }).click();
}

function playStep(): string | false {
  const match = document.querySelector<HTMLElement>('[data-testid="match"]');
  if (!match) return false;
  const click = (item: Element | null) => {
    if (!(item instanceof HTMLElement)) return false;
    item.click();
    return item.dataset['choice'] ?? 'card';
  };
  const decision = document.querySelector<HTMLElement>('[data-choice="accept"]');
  if (decision) return click(decision);
  const next = document.querySelector<HTMLElement>('[data-choice="next"]');
  if (next) return 'settled';
  const board = document.querySelector<HTMLElement>('[data-testid="board"][data-awaiting="me"]');
  if (!board || match.dataset['canAct'] !== 'true') return false;
  const choices = [...board.querySelectorAll<HTMLButtonElement>('[data-choice]')].filter(
    (button) => !button.disabled,
  );
  if (choices.length) {
    const preferred = ['stop', 'noShake', 'continue', 'pi'];
    return click(
      preferred
        .map((name) => choices.find((button) => button.dataset['choice'] === name))
        .find(Boolean) ??
        choices[0] ??
        null,
    );
  }
  return click(
    board.querySelector('[data-choice="flipOnly"]') ??
      board.querySelector('[aria-label="내 손패"] button:not([disabled])'),
  );
}

async function gameState(page: Page) {
  const root = page.getByTestId('match');
  return {
    seq: Number(await root.getAttribute('data-seq')),
    rounds: Number(await root.getAttribute('data-rounds-played')),
    balances: (await root.getAttribute('data-balances'))?.split(',').map(Number) ?? [],
  };
}

async function guestCredential(page: Page): Promise<{ roomId: string; token: string }> {
  const raw = await page.evaluate(() => {
    const room = sessionStorage.getItem('p2p-gostop.remote-guest-active.v1');
    return room ? sessionStorage.getItem(`p2p-gostop.remote-guest.v1.${JSON.parse(room)}`) : null;
  });
  expect(raw).toBeTruthy();
  const value = JSON.parse(raw!) as { roomId: string; token: string };
  expect(value.roomId).toMatch(/^[\w-]{22}$/);
  expect(value.token).toMatch(/^[\w-]{43}$/);
  return value;
}

test('AC-RP-01 @smoke @paired 설정→방→정적 경로 링크→두 브라우저 로비·1판 정산', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  test.setTimeout(180_000);
  const safari = await webkit.launch();
  const run = await pair(browser, safari);
  try {
    const { invite } = await openHost(run);
    await joinLink(run.guest, invite);
    await expect(run.guest.getByTestId('lobby')).toContainText('게스트');
    await expect(run.host.getByRole('status').filter({ hasText: '게스트 · 연결됨' })).toBeVisible();
    await run.host.getByTestId('host-start').click();
    await expect(run.host.getByTestId('match')).toBeVisible();
    await expect(run.guest.getByTestId('match')).toBeVisible();
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const host = await run.host.evaluate(playStep);
      const guest = await run.guest.evaluate(playStep);
      if (host === 'settled' && guest === 'settled') break;
      await run.host.waitForTimeout(30);
    }
    await expect(run.host.getByRole('heading', { name: '정산', exact: true })).toBeVisible();
    await expect(run.guest.getByRole('heading', { name: '정산', exact: true })).toBeVisible();
    const host = await gameState(run.host);
    await expect.poll(async () => (await gameState(run.guest)).seq).toBe(host.seq);
    expect((await gameState(run.guest)).balances).toEqual(host.balances);
    await run.guest.locator('[data-choice="next"]').click();
    await run.host.locator('[data-choice="next"]').click();
    await expect(run.guest.getByTestId('match')).toHaveAttribute('data-round', '2');
  } finally {
    await run.stop();
    await safari.close();
  }
});

test('AC-RP-02 @smoke @paired 코드 거절·승인과 위조 토큰은 기존 좌석을 보존', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  test.setTimeout(90_000);
  const run = await pair(browser);
  try {
    const { invite, code } = await openHost(run);
    await joinCode(run.guest, run, code, '거절친구');
    await expect(run.host.getByText(/거절친구 · 코드 참여/)).toBeVisible();
    await run.host.getByRole('button', { name: '거절' }).click();
    await expect(run.guest.getByRole('alert')).toContainText('참여 거절');
    await joinCode(run.guest, run, code, '승인친구');
    await expect(run.host.getByText(/승인친구 · 코드 참여/)).toBeVisible();
    await run.host.getByRole('button', { name: '수락' }).click();
    await expect(run.guest.getByTestId('lobby')).toContainText('승인친구');
    const forged = await run.guestContext.newPage();
    const bad = new URL(invite);
    bad.hash = bad.hash.replace(/t=[^&]+/, `t=${randomBytes(32).toString('base64url')}`);
    await joinLink(forged, bad.href, '위조친구');
    await expect(forged.getByRole('alert')).toContainText('주소 또는 코드 오류');
    await expect(
      run.host.getByRole('status').filter({ hasText: '승인친구 · 연결됨' }),
    ).toBeVisible();
    await expect(run.guest.getByTestId('lobby')).toContainText('승인친구');
  } finally {
    await run.stop();
  }
});

test('AC-RP-01/02 @full @paired 진행 중 게스트 reload·resume 뒤 snapshot과 잔액 일치', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  test.setTimeout(90_000);
  const run = await pair(browser);
  try {
    const { invite } = await openHost(run);
    await joinLink(run.guest, invite);
    await expect(run.guest.getByTestId('lobby')).toBeVisible();
    await run.host.getByTestId('host-start').click();
    await expect(run.guest.getByTestId('match')).toBeVisible();
    await expect
      .poll(
        async () => {
          await run.host.evaluate(playStep);
          await run.guest.evaluate(playStep);
          return (await gameState(run.host)).seq;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    const before = await gameState(run.host);
    await run.guest.reload();
    await expect(run.guest.getByRole('heading', { name: '방으로 돌아가기' })).toBeVisible();
    await run.guest.getByRole('button', { name: '이어하기' }).click();
    await expect(run.guest.getByTestId('match')).toBeVisible();
    await expect.poll(async () => (await gameState(run.guest)).seq).toBe(before.seq);
    expect((await gameState(run.guest)).balances).toEqual(before.balances);
  } finally {
    await run.stop();
  }
});

test('AC-RP-03 @full @paired 진행 중 호스트 부재는 판을 멈추고 복귀 뒤 같은 원장에서 재개', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  test.setTimeout(120_000);
  const run = await pair(browser);
  try {
    const { invite } = await openHost(run);
    await joinLink(run.guest, invite);
    await expect(run.guest.getByTestId('lobby')).toBeVisible();
    await run.host.getByTestId('host-start').click();
    await expect(run.guest.getByTestId('match')).toBeVisible();
    await expect
      .poll(
        async () => {
          await run.host.evaluate(playStep);
          await run.guest.evaluate(playStep);
          return (await gameState(run.host)).seq;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(2);
    const before = await gameState(run.host);
    await expect.poll(async () => (await gameState(run.guest)).seq).toBe(before.seq);
    run.setHostUnavailable(true);
    await expect(
      run.guest.getByRole('alert').filter({ hasText: '방장이 연결되지 않음' }),
    ).toBeVisible();
    await expect
      .poll(() =>
        run.guest.getByTestId('match').evaluate((element) => !!element.closest('[inert]')),
      )
      .toBe(true);
    await run.guest.waitForTimeout(1_200);
    expect(await gameState(run.guest)).toEqual(before);
    await expect(run.guest.getByRole('heading', { name: '정산', exact: true })).toHaveCount(0);
    run.setHostUnavailable(false);
    await expect
      .poll(() =>
        run.guest.getByTestId('match').evaluate((element) => !!element.closest('[inert]')),
      )
      .toBe(false);
    await expect.poll(async () => (await gameState(run.guest)).seq).toBe(before.seq);
    expect((await gameState(run.guest)).balances).toEqual(before.balances);
    await run.restart();
    await run.guest.reload();
    await expect(run.guest.getByRole('heading', { name: '방으로 돌아가기' })).toBeVisible();
    await run.guest.getByRole('button', { name: '이어하기' }).click();
    await expect(run.guest.getByRole('alert')).toContainText(/방|원격 대전 이용 불가/);
    const freshContext = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const freshHost = await freshContext.newPage();
      const fresh = await openHost({ ...run, host: freshHost });
      expect(new URL(fresh.invite).hash).not.toBe(new URL(invite).hash);
      await joinLink(run.guest, fresh.invite, '새친구');
      await expect(run.guest.getByTestId('lobby')).toContainText('새친구');
    } finally {
      await freshContext.close();
    }
  } finally {
    await run.stop();
  }
});

test('AC-RP-02 @full @paired 유효한 복귀만 4001 교체하고 프레임 폭주 뒤 방이 남는다', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  test.setTimeout(90_000);
  const run = await pair(browser);
  try {
    const { invite } = await openHost(run);
    await joinLink(run.guest, invite);
    await expect(run.guest.getByTestId('lobby')).toBeVisible();
    const credential = await guestCredential(run.guest);
    const socket = new WebSocket(
      `ws://127.0.0.1:${run.relay.port}/ws?role=guest&room=${credential.roomId}`,
      {
        origin: run.origin,
      },
    );
    const closeCode = new Promise<number>((done) => socket.once('close', (code) => done(code)));
    await new Promise<void>((done) => socket.once('open', () => done()));
    socket.send(JSON.stringify({ t: 'relay-auth', token: credential.token }));
    await expect(run.guest.getByRole('alert')).toContainText('다른 탭에서 연결됨');
    for (let index = 0; index < 45; index += 1) socket.send(JSON.stringify({ t: 'ping' }));
    expect(await closeCode).toBe(1013);
    await expect(run.host.getByTestId('remote-code')).toBeVisible();
    await run.guest.getByRole('button', { name: '다시 시도' }).click();
    await expect(run.guest.getByTestId('lobby')).toBeVisible();
  } finally {
    await run.stop();
  }
});

test('AC-RP-02 @full @paired 짧은 TTL 초대와 사용한 초대는 좌석을 얻지 못한다', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  test.setTimeout(90_000);
  const run = await pair(browser);
  const third = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const { invite } = await openHost(run);
    const record = await run.host.evaluate(() =>
      sessionStorage.getItem('p2p-gostop.remote-room.v1'),
    );
    expect(record).toBeTruthy();
    const { hostToken, room } = JSON.parse(record!) as {
      hostToken: string;
      room: { roomId: string };
    };
    const token = randomBytes(32).toString('base64url');
    const registered = await fetch(
      `http://127.0.0.1:${run.relay.port}/api/rooms/${room.roomId}/credentials`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${hostToken}` },
        body: JSON.stringify({ token, permission: 'invite', expiresAt: Date.now() + 1_000 }),
      },
    );
    expect(registered.status).toBe(201);
    await new Promise((done) => setTimeout(done, 1_100));
    const expired = new URL(invite);
    expired.hash = `#/join?room=${room.roomId}&t=${token}`;
    const page = await third.newPage();
    await joinLink(page, expired.href);
    await expect(page.getByRole('alert')).toContainText('초대 만료');
    await joinLink(run.guest, invite);
    await expect(run.guest.getByTestId('lobby')).toBeVisible();
    const replay = await third.newPage();
    await joinLink(replay, invite);
    await expect(replay.getByRole('alert')).toContainText(/초대|주소 또는 코드 오류/);
    await expect(run.guest.getByTestId('lobby')).toBeVisible();
  } finally {
    await third.close();
    await run.stop();
  }
});

test('AC-RP-06 @full @paired 호환되지 않는 게임 hello는 welcome 없이 거절', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  test.setTimeout(90_000);
  const run = await pair(browser);
  try {
    const { invite } = await openHost(run);
    await joinLink(run.guest, invite);
    await expect(run.guest.getByTestId('lobby')).toBeVisible();
    const credential = await guestCredential(run.guest);
    const socket = new WebSocket(
      `ws://127.0.0.1:${run.relay.port}/ws?role=guest&room=${credential.roomId}`,
      {
        origin: run.origin,
      },
    );
    const messages: Array<{ t: string; reason?: string }> = [];
    socket.on('message', (raw) =>
      messages.push(JSON.parse(raw.toString()) as { t: string; reason?: string }),
    );
    await new Promise<void>((done) => socket.once('open', () => done()));
    socket.send(JSON.stringify({ t: 'relay-auth', token: credential.token }));
    await expect(run.guest.getByRole('alert')).toContainText('다른 탭에서 연결됨');
    socket.send(JSON.stringify({ t: 'hello', v: 999, name: '옛버전' }));
    await expect
      .poll(() => messages.find((message) => message.t === 'reject')?.reason)
      .toBe('VERSION_MISMATCH');
    expect(messages.some((message) => message.t === 'welcome')).toBe(false);
    socket.close();
  } finally {
    await run.stop();
  }
});

test('AC-RP-04 @full @paired 같은 문서에서 원격 종료 후 재접속 0회·솔로 첫 판', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  test.setTimeout(90_000);
  const run = await pair(browser);
  try {
    const outside: string[] = [];
    let ended = false;
    let hostWsAttempts = 0;
    await run.host.route('**/*', (route) => {
      if (!ended || route.request().url().startsWith(appOrigin)) return route.continue();
      outside.push('HTTP');
      return route.abort();
    });
    await run.host.context().routeWebSocket('**/*', (socket) => {
      if (!ended && new URL(socket.url()).searchParams.get('role') === 'host') hostWsAttempts++;
      if (ended) {
        outside.push('WS');
        socket.close();
      } else socket.connectToServer();
    });
    const { invite } = await openHost(run);
    await joinLink(run.guest, invite);
    await expect(run.guest.getByTestId('lobby')).toBeVisible();
    await run.host.getByTestId('host-start').click();
    await expect(run.guest.getByTestId('match')).toBeVisible();
    await run.host.evaluate(() => {
      (window as Window & { rp07Document?: object }).rp07Document = {};
    });
    const connectedWsAttempts = hostWsAttempts;
    run.setHostUnavailable(true);
    await expect.poll(() => hostWsAttempts).toBeGreaterThan(connectedWsAttempts);
    await run.host.getByTestId('game-menu').click();
    const menu = run.host.getByRole('dialog', { name: '메뉴' });
    await menu.getByRole('button', { name: '대전 끝내기' }).click();
    await menu.getByRole('button', { name: '대전 끝내기 (한 번 더 누르기)' }).click();
    await expect(run.host.getByRole('button', { name: '혼자 연습' })).toBeVisible();
    ended = true;
    run.setHostUnavailable(false);
    await run.host.evaluate(() => {
      location.hash = '#/solo';
    });
    await expect(run.host.getByRole('heading', { name: '혼자 연습' })).toBeVisible();
    await run.host.getByRole('button', { name: /시작/ }).first().click();
    await expect(run.host.getByTestId('solo')).toBeVisible();
    expect(
      await run.host.evaluate(() => !!(window as Window & { rp07Document?: object }).rp07Document),
    ).toBe(true);
    await run.host.waitForTimeout(31_000);
    expect(outside).toEqual([]);
  } finally {
    await run.stop();
  }
});
