import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';
import { WebSocket } from 'ws';
import { saveRemoteHostSettings, type SettingsStore } from '../net/index.ts';
import {
  createRemoteGuest,
  createRemoteHost,
  type RemoteGuestController,
  type RemoteHostController,
  type RemoteSnapshot,
} from './remote.ts';

const origin = 'https://relay.example.test';
const creationSecret = randomBytes(32).toString('base64url');
let child: ChildProcessWithoutNullStreams | null = null;
let distDir: string | null = null;
const cleanup: (() => void | Promise<void>)[] = [];

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

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map((close) => close()));
  if (child && child.exitCode === null && child.signalCode === null) {
    const running = child;
    const stopped = new Promise<void>((done) => running.once('exit', () => done()));
    running.kill('SIGTERM');
    await stopped;
  }
  child = null;
  if (distDir) await rm(distDir, { recursive: true, force: true });
  distDir = null;
});

async function startRelay(): Promise<string> {
  distDir = await mkdtemp(join(tmpdir(), 'rp04b-relay-'));
  const html = '<!doctype html><title>test</title>';
  await writeFile(join(distDir, 'index.html'), html);
  const hash = createHash('sha256').update('index.html').update('\0').update(html).digest('hex');
  await writeFile(
    join(distDir, 'version.json'),
    JSON.stringify({ wireVersion: PROTOCOL_VERSION, hash }),
  );
  child = spawn(process.execPath, [resolve('../../packages/relay-dev/src/cli.ts')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RELAY_PUBLIC: '1',
      RELAY_CREATION_SECRET: creationSecret,
      RELAY_ALLOWED_ORIGINS: origin,
      RELAY_RELEASE: 'v0.0.1',
      RELAY_DIST_DIR: distDir,
      HOST: '127.0.0.1',
      PORT: '0',
    },
  });
  return new Promise<string>((done, reject) => {
    let output = '';
    child!.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const port = /public listening on 127\.0\.0\.1:(\d+)\/ws/.exec(output)?.[1];
      if (port) done(`http://127.0.0.1:${port}`);
    });
    child!.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child!.once('error', reject);
    child!.once('exit', (code) => reject(new Error(`relay exited ${code}: ${output}`)));
  });
}

function adapt(base: string): {
  fetcher: typeof fetch;
  socketFactory: (url: string) => globalThis.WebSocket;
} {
  return {
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      headers.set('Origin', origin);
      const response = await fetch(`${base}${url.pathname}${url.search}`, { ...init, headers });
      return new Response(response.status === 204 ? null : await response.text(), {
        status: response.status,
        headers: response.headers,
      });
    }) as typeof fetch,
    socketFactory: (url) =>
      new WebSocket(url.replace(origin.replace('https:', 'wss:'), base.replace('http:', 'ws:')), {
        origin,
      }) as unknown as globalThis.WebSocket,
  };
}

function until(
  controller: {
    readonly snapshot: RemoteSnapshot;
    subscribe(cb: (s: RemoteSnapshot) => void): () => void;
  },
  match: (snapshot: RemoteSnapshot) => boolean,
): Promise<RemoteSnapshot> {
  if (match(controller.snapshot)) return Promise.resolve(controller.snapshot);
  return new Promise((done, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error('snapshot timeout'));
    }, 5_000);
    const off = controller.subscribe((snapshot) => {
      if (!match(snapshot)) return;
      clearTimeout(timer);
      off();
      done(snapshot);
    });
  });
}

async function untilMessage(messages: string[], fragment: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (messages.some((raw) => raw.includes(fragment))) return;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error('message timeout');
}

async function pair(): Promise<{
  host: RemoteHostController;
  guest: RemoteGuestController;
  storage: SettingsStore;
  guestStorage: SettingsStore;
  socketFactory: (url: string) => globalThis.WebSocket;
  hostMessages: string[];
  guestSockets: () => number;
}> {
  const base = await startRelay();
  const adapter = adapt(base);
  const settings = memory();
  const storage = memory();
  saveRemoteHostSettings(settings, { baseUrl: origin, creationSecret });
  const hostMessages: string[] = [];
  const host = createRemoteHost({
    settings,
    storage,
    fetcher: adapter.fetcher,
    socketFactory: adapter.socketFactory,
    onTransport: (transport) => {
      transport.onMessage((message) => hostMessages.push(message));
    },
  });
  cleanup.push(() => host.close());
  const room = await host.createRoom();
  await until(host, (snapshot) => snapshot.state === 'waiting');
  let guestSockets = 0;
  const guestStorage = memory();
  const guest = createRemoteGuest({
    allowedOrigin: origin,
    storage: guestStorage,
    socketFactory: (url) => {
      guestSockets++;
      return adapter.socketFactory(url);
    },
    onTransport: (transport, nickname) => {
      transport.send({ t: 'hello', v: PROTOCOL_VERSION, name: nickname });
    },
  });
  cleanup.push(() => guest.leave());
  expect(room.inviteLink).toContain('#/join?room=');
  return {
    host,
    guest,
    storage,
    guestStorage,
    socketFactory: adapter.socketFactory,
    hostMessages,
    guestSockets: () => guestSockets,
  };
}

it('FR-RP-02/04: 비밀 링크는 승인 동작 없이 같은 소켓에서 hello를 전달하고 복귀 자격을 저장한다', async () => {
  const { host, guest, hostMessages, guestSockets } = await pair();
  const room = host.snapshot.room!;
  const joining = guest.joinByLink(room.inviteLink, '친구');
  expect(await joining).toEqual({ ok: true });
  expect(host.snapshot.requests).toHaveLength(0);
  await until(host, (snapshot) => snapshot.peerPresent);
  expect(guestSockets()).toBe(1);
  await until(guest, (snapshot) => snapshot.peerPresent);
  await untilMessage(hostMessages, '친구');
  expect(hostMessages.some((raw) => raw.includes('"t":"hello"') && raw.includes('친구'))).toBe(
    true,
  );
}, 15_000);

it('NP-RP-04/05: 코드 참여는 승인 전 좌석 없이 대기하고 승인 뒤 새 소켓으로 인증한다', async () => {
  const { host, guest, guestSockets } = await pair();
  const room = host.snapshot.room!;
  const joining = guest.joinByCode(origin, room.code, '코드친구');
  const request = (await until(host, (snapshot) => snapshot.requests.length === 1)).requests[0]!;
  expect(request.kind).toBe('code');
  expect(host.snapshot.peerPresent).toBe(false);
  await host.accept(request.id);
  expect(await joining).toEqual({ ok: true });
  await until(guest, (snapshot) => snapshot.peerPresent);
  expect(guestSockets()).toBe(2);
}, 15_000);

it('NP-RP-05: 거절된 코드 요청은 승인 자격이나 게임 프레임을 받지 않는다', async () => {
  const { host, guest, hostMessages } = await pair();
  const joining = guest.joinByCode(origin, host.snapshot.room!.code, '거절대상');
  const request = (await until(host, (snapshot) => snapshot.requests.length === 1)).requests[0]!;
  host.deny(request.id);
  expect(host.snapshot.requests).toHaveLength(0);
  expect(host.snapshot.peerPresent).toBe(false);
  expect(hostMessages).toHaveLength(0);
  guest.leave();
  expect(await joining).toEqual({ ok: false, code: 'denied' });
}, 15_000);

it('FR-RP-04: 같은 방 복귀는 기존 역할 소켓을 4001로 교체하고 방 종료 때 자격을 제거한다', async () => {
  const { host, guest, guestStorage, socketFactory } = await pair();
  const joining = guest.joinByLink(host.snapshot.room!.inviteLink, '친구');
  expect(await joining).toEqual({ ok: true });
  await until(guest, (snapshot) => snapshot.peerPresent);
  const resumed = createRemoteGuest({
    allowedOrigin: origin,
    storage: guestStorage,
    socketFactory,
    onTransport: () => {},
  });
  cleanup.push(() => resumed.leave());
  expect(await resumed.resume()).toEqual({ ok: true });
  await until(guest, (snapshot) => snapshot.error === 'replaced');
  await host.close();
  await until(resumed, (snapshot) => snapshot.state === 'ended');
  expect(await resumed.resume()).toEqual({ ok: false, code: 'invalid' });
}, 15_000);
