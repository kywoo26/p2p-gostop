import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { resolve, sep } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import WebSocket from 'ws';

const origin = 'https://relay.example';
const prefix = '/r/release/hash/';
const dist = resolve('dist');

interface Room {
  roomId: string;
  hostToken: string;
  code: string;
}

async function startPublicRelay(): Promise<{
  base: string;
  secret: string;
  advance(ms: number): Promise<number>;
  close(): Promise<void>;
}> {
  const secret = randomBytes(32).toString('base64url');
  const child: ChildProcessWithoutNullStreams = spawn(
    process.execPath,
    [resolve('../../packages/relay-dev/test/remote-ui-server.ts')],
    {
      env: { ...process.env, RELAY_CREATION_SECRET: secret, RELAY_ALLOWED_ORIGINS: origin },
    },
  );
  const output = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const ready = await output.next();
  if (ready.done) throw new Error('공개 중계가 시작되지 않았습니다');
  const initial = JSON.parse(ready.value) as { port: number; now: number };
  return {
    base: `http://127.0.0.1:${initial.port}`,
    secret,
    async advance(ms) {
      child.stdin.write(`${JSON.stringify({ advance: ms })}\n`);
      const result = await output.next();
      if (result.done) throw new Error('중계 시계 응답이 없습니다');
      return (JSON.parse(result.value) as { now: number }).now;
    },
    async close() {
      child.stdin.end();
      if (child.exitCode === null) await once(child, 'exit');
    },
  };
}

async function serveGuest(
  page: Page,
  base: string,
  onServerClose: (code: number) => void,
): Promise<void> {
  await page.route(`${origin}${prefix}**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const file = resolve(dist, pathname.slice(prefix.length) || 'index.html');
    if (file !== dist && !file.startsWith(`${dist}${sep}`)) return route.abort();
    try {
      await route.fulfill({ path: file });
    } catch {
      await route.abort();
    }
  });
  await page.routeWebSocket('**/*', (browser) => {
    const url = new URL(browser.url());
    const server = new WebSocket(`${base.replace('http:', 'ws:')}${url.pathname}${url.search}`, {
      origin,
    });
    const queued: string[] = [];
    browser.onMessage((message) => {
      const value = String(message);
      if (server.readyState === WebSocket.OPEN) server.send(value);
      else queued.push(value);
    });
    browser.onClose(() => server.close());
    server.on('open', () => {
      for (const value of queued) server.send(value);
    });
    server.on('message', (message) => browser.send(message.toString()));
    server.on('close', (code) => {
      onServerClose(code);
      browser.close({ code });
    });
    server.on('error', () => browser.close({ code: 1011 }));
  });
}

async function createRoom(base: string, secret: string): Promise<Room> {
  const response = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(response.status).toBe(201);
  return (await response.json()) as Room;
}

async function enterCode(page: Page, code: string): Promise<void> {
  // 링크/코드를 새 문서로 여는 계약. 앱내 hash 이동과 연속 reload를 섞지 않는다.
  await page.goto('about:blank');
  await page.goto(`${origin}${prefix}#/join`);
  await page.getByRole('textbox', { name: '이름' }).fill('동료');
  await page.getByRole('textbox', { name: '12자리 방 코드' }).fill(code);
  await page.getByRole('button', { name: '참여하기' }).click();
  await expect(page.getByText(/호스트 승인 대기/)).toBeVisible();
}

test('공개 중계 결과를 거절·만료·불가·위조 초대 안내로 구분한다 (FR-RP-02/05)', async ({
  page,
}) => {
  const relay = await startPublicRelay();
  const hostSockets: WebSocket[] = [];
  const serverCloseCodes: number[] = [];
  try {
    await serveGuest(page, relay.base, (code) => serverCloseCodes.push(code));

    await enterCode(page, 'ABCD-EFGH-JKMN');
    await relay.advance(60_001);
    await expect(page.getByRole('alert')).toContainText('원격 대전 이용 불가');

    const deniedRoom = await createRoom(relay.base, relay.secret);
    const host = new WebSocket(
      `${relay.base.replace('http:', 'ws:')}/ws?role=host&room=${deniedRoom.roomId}`,
      { origin },
    );
    hostSockets.push(host);
    await once(host, 'open');
    host.send(JSON.stringify({ t: 'relay-auth', token: deniedRoom.hostToken }));
    await once(host, 'message');
    const request = new Promise<{ requestId: string; nickname: string | undefined }>((done) => {
      host.on('message', (raw) => {
        const value = JSON.parse(raw.toString()) as {
          t: string;
          requestId?: string;
          nickname?: string;
        };
        if (value.t === 'relay-join-request' && value.requestId)
          done({ requestId: value.requestId, nickname: value.nickname });
      });
    });
    await enterCode(page, deniedRoom.code);
    const requested = await request;
    expect(requested.nickname).toBe('동료');
    host.send(JSON.stringify({ t: 'relay-deny', requestId: requested.requestId }));
    await expect(page.getByRole('alert')).toContainText('참여 거절');

    const expiredRoom = await createRoom(relay.base, relay.secret);
    const token = randomBytes(32).toString('base64url');
    const now = await relay.advance(0);
    const registered = await fetch(`${relay.base}/api/rooms/${expiredRoom.roomId}/credentials`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${expiredRoom.hostToken}` },
      body: JSON.stringify({ token, permission: 'invite', expiresAt: now + 1_000 }),
    });
    expect(registered.status).toBe(201);
    await relay.advance(1_001);
    const beforeExpired = serverCloseCodes.length;
    await page.goto('about:blank');
    await page.goto(`${origin}${prefix}#/join?room=${expiredRoom.roomId}&t=${token}`);
    await page.getByRole('textbox', { name: '이름' }).fill('동료');
    await page.getByRole('button', { name: '참여하기' }).click();
    await expect(page.getByRole('alert')).toContainText('초대 만료');
    expect(serverCloseCodes.slice(beforeExpired)).toContain(4003);

    const invalidRoom = await createRoom(relay.base, relay.secret);
    const forgedToken = randomBytes(32).toString('base64url');
    const beforeInvalid = serverCloseCodes.length;
    await page.goto('about:blank');
    await page.goto(`${origin}${prefix}#/join?room=${invalidRoom.roomId}&t=${forgedToken}`);
    await page.getByRole('textbox', { name: '이름' }).fill('동료');
    await page.getByRole('button', { name: '참여하기' }).click();
    await expect(page.getByRole('alert')).toContainText(
      '주소 또는 코드 오류. 입력한 중계 주소나 초대 코드를 확인할 수 없습니다. 호스트에게 새 초대 링크를 요청하세요.',
    );
    expect(serverCloseCodes.slice(beforeInvalid)).toContain(1008);
  } finally {
    for (const socket of hostSockets) socket.terminate();
    await relay.close();
  }
});
