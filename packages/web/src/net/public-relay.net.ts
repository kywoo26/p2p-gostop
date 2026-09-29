import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { checkPublicHealth, createPublicJoinChannel, createPublicTransport } from './index.ts';
import type { ConnectionEvent, RelayControl } from './ws-transport.ts';

const origin = 'https://relay.example.test';
const creationSecret = randomBytes(32).toString('base64url');
let child: ChildProcessWithoutNullStreams | undefined;
let distDir: string | undefined;
const transports: { dispose(): void }[] = [];

afterEach(async () => {
  for (const transport of transports.splice(0)) transport.dispose();
  if (child && child.exitCode === null && child.signalCode === null) {
    const running = child;
    const stopped = new Promise<void>((done) => running.once('exit', () => done()));
    running.kill('SIGTERM');
    await stopped;
  }
  if (child) {
    child = undefined;
  }
  if (distDir) {
    await rm(distDir, { recursive: true, force: true });
    distDir = undefined;
  }
});

async function startPublicRelay(): Promise<string> {
  distDir = await mkdtemp(join(tmpdir(), 'rp04a-relay-'));
  await writeFile(join(distDir, 'index.html'), '<!doctype html><title>test</title>');
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

function next<T>(subscribe: (done: (value: T) => void) => () => void): Promise<T> {
  return new Promise((done) => {
    const off = subscribe((value) => {
      off();
      done(value);
    });
  });
}

it('RELAY_PUBLIC=1에서 health, 코드 수락, 첫 인증, 게임 프레임, 4001을 연동한다', async () => {
  const base = await startPublicRelay();
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input.toString());
    const response = await fetch(`${base}${url.pathname}`, init);
    return new Response(await response.text(), { status: response.status });
  };
  await expect(
    checkPublicHealth(origin, new AbortController().signal, fetcher),
  ).resolves.toMatchObject({
    relay: 'p2p-gostop',
    ready: true,
  });
  const response = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creationSecret}` },
  });
  expect(response.status).toBe(201);
  const created = (await response.json()) as {
    roomId: string;
    hostToken: string;
    code: string;
  };
  const factory = (url: string): globalThis.WebSocket =>
    new WebSocket(url.replace('wss://relay.example.test', base.replace('http:', 'ws:')), {
      origin,
    }) as unknown as globalThis.WebSocket;
  const endpoint = {
    baseUrl: origin,
    allowedOrigin: origin,
    room: created.roomId,
    role: 'host' as const,
    token: created.hostToken,
  };
  const host = createPublicTransport(endpoint, { socketFactory: factory });
  transports.push(host);
  await next<ConnectionEvent>((done) =>
    host.onConnection((event) => {
      if (event.type === 'open') done(event);
    }),
  );

  const claim = next<RelayControl>((done) =>
    host.onControl((control) => {
      if (control.t === 'relay-join-request') done(control);
    }),
  );
  const join = createPublicJoinChannel(origin, origin, created.code, factory);
  transports.push(join);
  const accepted = next<RelayControl>((done) =>
    join.onControl((control) => {
      if (control.t === 'relay-accepted') done(control);
    }),
  );
  const request = await claim;
  expect(request.t).toBe('relay-join-request');
  if (request.t !== 'relay-join-request') throw new Error('invalid request');
  const resumeToken = randomBytes(32).toString('base64url');
  expect(
    host.sendControl({ t: 'relay-accept', requestId: request.requestId, token: resumeToken }),
  ).toBe(true);
  const result = await accepted;
  expect(result).toEqual({ t: 'relay-accepted', roomId: created.roomId, token: resumeToken });

  const guest = createPublicTransport(
    { ...endpoint, role: 'guest', token: resumeToken },
    { socketFactory: factory },
  );
  transports.push(guest);
  await next<ConnectionEvent>((done) =>
    guest.onConnection((event) => {
      if (event.type === 'open') done(event);
    }),
  );
  const message = next<string>((done) => host.onMessage(done));
  guest.send({ t: 'log', entries: ['real-relay'] });
  expect(await message).toBe('{"t":"log","entries":["real-relay"]}');

  const replaced = next<ConnectionEvent>((done) =>
    guest.onConnection((event) => {
      if (event.type === 'stopped') done(event);
    }),
  );
  const replacement = createPublicTransport(
    { ...endpoint, role: 'guest', token: resumeToken },
    { socketFactory: factory },
  );
  transports.push(replacement);
  expect(await replaced).toMatchObject({ type: 'stopped', reason: 'replaced' });
  expect(guest.state).toBe('stopped');
}, 15_000);
