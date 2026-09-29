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

function deferred(): { promise: Promise<void>; release: () => void } {
  let release = () => {};
  const promise = new Promise<void>((done) => {
    release = done;
  });
  return { promise, release };
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
  base: string;
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
    base,
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
  expect(request.nickname).toBe('코드친구');
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
  expect(await joining).toEqual({ ok: false, code: 'denied' });
  expect(guest.snapshot).toMatchObject({ state: 'ended', error: 'denied' });
}, 15_000);

it('NP-RP-03: 실제 중계의 만료 초대 4003은 expired 참여 결과로 끝난다', async () => {
  const { base, host, guest, storage } = await pair();
  const room = host.snapshot.room!;
  const record = JSON.parse(storage.getItem('p2p-gostop.remote-room.v1')!) as {
    hostToken: string;
  };
  const invite = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 500;
  const registered = await adapt(base).fetcher(`${origin}/api/rooms/${room.roomId}/credentials`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${record.hostToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: invite, permission: 'invite', expiresAt }),
  });
  expect(registered.status).toBe(201);
  await new Promise((done) => setTimeout(done, Math.max(0, expiresAt - Date.now() + 100)));
  const link = new URL(room.inviteLink);
  const query = new URLSearchParams(link.hash.slice('#/join?'.length));
  query.set('t', invite);
  link.hash = `/join?${query}`;
  expect(await guest.joinByLink(link.href, '친구')).toEqual({ ok: false, code: 'expired' });
  expect(guest.snapshot).toMatchObject({ state: 'ended', error: 'expired' });
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

it('FR-RP-01: close 중 진행 중인 /version 응답이 도착해도 방 생성과 transport가 부활하지 않는다', async () => {
  const base = await startRelay();
  const adapter = adapt(base);
  const settings = memory();
  const storage = memory();
  saveRemoteHostSettings(settings, { baseUrl: origin, creationSecret });
  const entered = deferred();
  const release = deferred();
  const requests: string[] = [];
  let transports = 0;
  const host = createRemoteHost({
    settings,
    storage,
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/version')) {
        entered.release();
        await release.promise;
      }
      return adapter.fetcher(input, init);
    }) as typeof fetch,
    socketFactory: adapter.socketFactory,
    onTransport: () => {
      transports++;
    },
  });
  cleanup.push(() => host.close());
  const creating = host.createRoom();
  await entered.promise;
  await host.close();
  release.release();
  await expect(creating).rejects.toThrow('cancelled');
  expect(requests.some((request) => request.includes('POST '))).toBe(false);
  expect(transports).toBe(0);
  expect(host.snapshot.state).toBe('ended');
  expect(host.snapshot.room).toBeUndefined();
  expect(storage.getItem('p2p-gostop.remote-room.v1')).toBeNull();
}, 15_000);

it('FR-RP-01: close 뒤 방 생성 201이 도착하면 자격을 읽어 서버 방을 DELETE한다', async () => {
  const base = await startRelay();
  const adapter = adapt(base);
  const settings = memory();
  const storage = memory();
  saveRemoteHostSettings(settings, { baseUrl: origin, creationSecret });
  const entered = deferred();
  const release = deferred();
  let deletes = 0;
  let invites = 0;
  let transports = 0;
  const host = createRemoteHost({
    settings,
    storage,
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith('/api/rooms')) {
        const response = await adapter.fetcher(input, init);
        entered.release();
        await release.promise;
        return response;
      }
      if (url.endsWith('/credentials')) invites++;
      if (init?.method === 'DELETE') deletes++;
      return adapter.fetcher(input, init);
    }) as typeof fetch,
    socketFactory: adapter.socketFactory,
    onTransport: () => {
      transports++;
    },
  });
  cleanup.push(() => host.close());
  const creating = host.createRoom();
  await entered.promise;
  await host.close();
  release.release();
  await expect(creating).rejects.toThrow('cancelled');
  expect(deletes).toBe(1);
  expect(invites).toBe(0);
  expect(transports).toBe(0);
  expect(host.snapshot.state).toBe('ended');
  expect(storage.getItem('p2p-gostop.remote-room.v1')).toBeNull();
  expect(storage.getItem('p2p-gostop.remote-room-pending.v1')).toBeNull();
}, 15_000);

it('FR-RP-01: 201 뒤 초대 등록 실패는 보존한 hostToken으로 방을 DELETE한다', async () => {
  const base = await startRelay();
  const adapter = adapt(base);
  const settings = memory();
  const storage = memory();
  saveRemoteHostSettings(settings, { baseUrl: origin, creationSecret });
  const deleted: string[] = [];
  let deleteAuthorization = '';
  const host = createRemoteHost({
    settings,
    storage,
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/credentials')) return new Response(null, { status: 503 });
      if (init?.method === 'DELETE') {
        deleted.push(url);
        deleteAuthorization = new Headers(init.headers).get('Authorization') ?? '';
      }
      return adapter.fetcher(input, init);
    }) as typeof fetch,
    socketFactory: adapter.socketFactory,
    onTransport: () => {
      throw new Error('unexpected transport');
    },
  });
  cleanup.push(() => host.close());
  await expect(host.createRoom()).rejects.toThrow('unavailable');
  expect(deleted).toHaveLength(1);
  expect(storage.getItem('p2p-gostop.remote-room-pending.v1')).toBeNull();
  expect(storage.getItem('p2p-gostop.remote-room.v1')).toBeNull();
  const response = await adapter.fetcher(deleted[0]!, {
    method: 'DELETE',
    headers: { Authorization: deleteAuthorization },
  });
  expect(response.status).toBe(401);
}, 15_000);

it('FR-RP-01: close가 초대 등록 대기 중인 서버 방을 지우고 후속 연결을 막는다', async () => {
  const base = await startRelay();
  const adapter = adapt(base);
  const settings = memory();
  const storage = memory();
  saveRemoteHostSettings(settings, { baseUrl: origin, creationSecret });
  const entered = deferred();
  const release = deferred();
  let transports = 0;
  let deletes = 0;
  const host = createRemoteHost({
    settings,
    storage,
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/credentials')) {
        entered.release();
        await release.promise;
      }
      if (init?.method === 'DELETE') deletes++;
      return adapter.fetcher(input, init);
    }) as typeof fetch,
    socketFactory: adapter.socketFactory,
    onTransport: () => {
      transports++;
    },
  });
  cleanup.push(() => host.close());
  const creating = host.createRoom();
  await entered.promise;
  await host.close();
  release.release();
  await expect(creating).rejects.toThrow('cancelled');
  expect(deletes).toBeGreaterThanOrEqual(1);
  expect(transports).toBe(0);
  expect(host.snapshot.state).toBe('ended');
  expect(storage.getItem('p2p-gostop.remote-room-pending.v1')).toBeNull();
}, 15_000);

it('FR-RP-01: DELETE 204 응답 유실 뒤 401 재시도로 pending을 종료한다', async () => {
  const base = await startRelay();
  const adapter = adapt(base);
  const settings = memory();
  const storage = memory();
  saveRemoteHostSettings(settings, { baseUrl: origin, creationSecret });
  let deletes = 0;
  const host = createRemoteHost({
    settings,
    storage,
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'DELETE') return adapter.fetcher(input, init);
      deletes++;
      const response = await adapter.fetcher(input, init);
      if (deletes === 1) {
        expect(response.status).toBe(204);
        throw new Error('DELETE response lost');
      }
      expect(response.status).toBe(401);
      return response;
    }) as typeof fetch,
    socketFactory: adapter.socketFactory,
    onTransport: () => {},
  });
  await host.createRoom();
  await host.close();
  expect(deletes).toBe(2);
  expect(storage.getItem('p2p-gostop.remote-room-pending.v1')).toBeNull();
  expect(host.snapshot.state).toBe('ended');
}, 15_000);

it('FR-RP-01: 저장된 pending의 401은 종료로 보고 새 방을 만든다', async () => {
  const base = await startRelay();
  const adapter = adapt(base);
  const settings = memory();
  const storage = memory();
  saveRemoteHostSettings(settings, { baseUrl: origin, creationSecret });
  const staleId = 'R'.repeat(22);
  storage.setItem(
    'p2p-gostop.remote-room-pending.v1',
    JSON.stringify([
      { origin, roomId: staleId, hostToken: 'T'.repeat(43), expiresAt: Date.now() + 60_000 },
    ]),
  );
  let staleDeletes = 0;
  const host = createRemoteHost({
    settings,
    storage,
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE' && String(input).endsWith(staleId)) {
        staleDeletes++;
        return new Response(null, { status: 401 });
      }
      return adapter.fetcher(input, init);
    }) as typeof fetch,
    socketFactory: adapter.socketFactory,
    onTransport: () => {},
  });
  const room = await host.createRoom();
  expect(room.roomId).not.toBe(staleId);
  expect(staleDeletes).toBe(1);
  expect(storage.getItem('p2p-gostop.remote-room-pending.v1')).toBeNull();
  await host.close();
}, 15_000);

it('FR-RP-01: pending은 만료 시각이 지나면 자동 제거되어 새 방을 막지 않는다', async () => {
  const base = await startRelay();
  const adapter = adapt(base);
  const settings = memory();
  const storage = memory();
  saveRemoteHostSettings(settings, { baseUrl: origin, creationSecret });
  const staleId = 'R'.repeat(22);
  const expiresAt = Date.now() + 150;
  storage.setItem(
    'p2p-gostop.remote-room-pending.v1',
    JSON.stringify([{ origin, roomId: staleId, hostToken: 'T'.repeat(43), expiresAt }]),
  );
  let staleDeletes = 0;
  const host = createRemoteHost({
    settings,
    storage,
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE' && String(input).endsWith(staleId)) staleDeletes++;
      return adapter.fetcher(input, init);
    }) as typeof fetch,
    socketFactory: adapter.socketFactory,
    onTransport: () => {},
  });
  expect(storage.getItem('p2p-gostop.remote-room-pending.v1')).not.toBeNull();
  await new Promise((done) => setTimeout(done, Math.max(0, expiresAt - Date.now() + 50)));
  expect(storage.getItem('p2p-gostop.remote-room-pending.v1')).toBeNull();
  await host.createRoom();
  expect(staleDeletes).toBe(0);
  await host.close();
}, 15_000);

it('FR-RP-01: DELETE 네트워크 실패는 세 번만 재시도하고 pending을 보존한 채 새 방을 만든다', async () => {
  const base = await startRelay();
  const adapter = adapt(base);
  const settings = memory();
  const storage = memory();
  saveRemoteHostSettings(settings, { baseUrl: origin, creationSecret });
  const staleId = 'R'.repeat(22);
  const expiresAt = Date.now() + 60_000;
  storage.setItem(
    'p2p-gostop.remote-room-pending.v1',
    JSON.stringify([{ origin, roomId: staleId, hostToken: 'T'.repeat(43), expiresAt }]),
  );
  let staleDeletes = 0;
  const host = createRemoteHost({
    settings,
    storage,
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE' && String(input).endsWith(staleId)) {
        staleDeletes++;
        throw new Error('offline');
      }
      return adapter.fetcher(input, init);
    }) as typeof fetch,
    socketFactory: adapter.socketFactory,
    onTransport: () => {},
  });
  await host.createRoom();
  expect(staleDeletes).toBe(3);
  expect(JSON.parse(storage.getItem('p2p-gostop.remote-room-pending.v1')!)).toEqual([
    { origin, roomId: staleId, hostToken: 'T'.repeat(43), expiresAt },
  ]);
  await host.close();
}, 15_000);

it('FR-RP-01: checkHealth의 외부 signal 취소는 fetch를 중단하고 snapshot을 바꾸지 않는다', async () => {
  const settings = memory();
  saveRemoteHostSettings(settings, { baseUrl: origin, creationSecret });
  const entered = deferred();
  let fetchSignal: AbortSignal | undefined;
  const host = createRemoteHost({
    settings,
    storage: memory(),
    fetcher: ((_input: RequestInfo | URL, init?: RequestInit) => {
      fetchSignal = init?.signal ?? undefined;
      entered.release();
      return new Promise<Response>((_resolve, reject) => {
        fetchSignal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }) as typeof fetch,
    onTransport: () => {},
  });
  const seen: RemoteSnapshot[] = [];
  const unsubscribe = host.subscribe((snapshot) => seen.push(snapshot));
  const controller = new AbortController();
  const checking = host.checkHealth({ signal: controller.signal });
  await entered.promise;
  controller.abort();
  await expect(checking).rejects.toMatchObject({ name: 'RelayHealthError', code: 'cancelled' });
  expect(fetchSignal?.aborted).toBe(true);
  expect(host.snapshot).toMatchObject({ state: 'idle' });
  expect(seen).toHaveLength(1);
  unsubscribe();
}, 15_000);
