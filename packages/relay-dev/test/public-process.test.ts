import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';
import { WebSocket, type RawData } from 'ws';
import { writeArtifact } from './artifact.ts';

const origin = 'https://relay.example.test';
const secret = randomBytes(32).toString('base64url');
let child: ChildProcessWithoutNullStreams | undefined;
let directory: string | undefined;
let stderr = '';

afterEach(async () => {
  if (child?.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  child = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
  stderr = '';
});

function launch(args: string[], env: NodeJS.ProcessEnv = {}): Promise<number> {
  child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const running = child;
  return new Promise((resolve, reject) => {
    let output = '';
    running.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const line = output.split('\n')[0] ?? '';
      const port = /(?:"port":|:)([0-9]+)(?:\}|\/ws)/.exec(line)?.[1];
      if (port) resolve(Number(port));
    });
    running.once('exit', (code) => reject(new Error(`relay exited ${code}: ${stderr}`)));
  });
}

function rawRequest(port: number, target: string, upgrade = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(port, '127.0.0.1');
    let response = '';
    socket.on('connect', () =>
      socket.write(
        `GET ${target} HTTP/1.1\r\nHost: localhost\r\n${
          upgrade
            ? `Connection: Upgrade\r\nUpgrade: websocket\r\nOrigin: ${origin}\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n`
            : 'Connection: close\r\n'
        }\r\n`,
      ),
    );
    socket.on('data', (chunk: Buffer) => {
      response += chunk.toString();
    });
    socket.on('end', () => resolve(response));
    socket.on('close', () => resolve(response));
    socket.on('error', reject);
  });
}

function text(data: RawData): string {
  return (
    Array.isArray(data)
      ? Buffer.concat(data)
      : data instanceof ArrayBuffer
        ? Buffer.from(data)
        : data
  ).toString('utf8');
}
function next(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => ws.once('message', (data: RawData) => resolve(text(data))));
}

it('미인증 잘못된 URL·초과 프레임 뒤에도 자식 프로세스와 기존 방이 생존한다', async () => {
  const source = new URL('../src/index.ts', import.meta.url).href;
  const port = await launch(
    [
      '--input-type=module',
      '-e',
      `import { startRelay } from ${JSON.stringify(source)};
     const relay = await startRelay({ publicMode: { creationSecret: process.env.RELAY_CREATION_SECRET, allowedOrigins: [process.env.RELAY_ALLOWED_ORIGINS] }, log: line => process.stderr.write(line + '\\n') });
     process.stdout.write(JSON.stringify({ port: relay.port }) + '\\n');`,
    ],
    { RELAY_CREATION_SECRET: secret, RELAY_ALLOWED_ORIGINS: origin },
  );
  const base = `http://127.0.0.1:${port}`;
  const created = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(created.status).toBe(201);
  const room: unknown = await created.json();
  if (
    !room ||
    typeof room !== 'object' ||
    !('roomId' in room) ||
    !('hostToken' in room) ||
    typeof room.roomId !== 'string' ||
    typeof room.hostToken !== 'string'
  )
    throw new Error('room');
  const host = new WebSocket(`ws://127.0.0.1:${port}/ws?role=host&room=${room.roomId}`, { origin });
  host.on('error', () => {});
  await once(host, 'open');
  const first = next(host);
  host.send(JSON.stringify({ t: 'relay-auth', token: room.hostToken }));
  await first;
  expect(await rawRequest(port, '//[/')).toMatch(/^HTTP\/1\.1 400/);
  expect(await rawRequest(port, '//[/', true)).not.toContain('101 Switching Protocols');
  const rejected = new WebSocket(`ws://127.0.0.1:${port}/ws?role=invalid&room=bad`, { origin });
  rejected.on('error', () => {});
  await once(rejected, 'open');
  const rejectedClose = once(rejected, 'close');
  rejected.send('x'.repeat(65_537));
  await rejectedClose;
  expect(child?.exitCode).toBeNull();
  expect(stderr).not.toContain('//[/');
  const guestToken = randomBytes(32).toString('base64url');
  expect(
    (
      await fetch(`${base}/api/rooms/${room.roomId}/credentials`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${room.hostToken}` },
        body: JSON.stringify({
          token: guestToken,
          permission: 'resume',
          expiresAt: Date.now() + 60_000,
        }),
      })
    ).status,
  ).toBe(201);
  const guest = new WebSocket(`ws://127.0.0.1:${port}/ws?role=guest&room=${room.roomId}`, {
    origin,
  });
  guest.on('error', () => {});
  await once(guest, 'open');
  const present = next(guest);
  const joined = next(host);
  guest.send(JSON.stringify({ t: 'relay-auth', token: guestToken }));
  await present;
  await joined;
  const game = next(host);
  guest.send('still alive');
  expect(await game).toBe('still alive');
  host.terminate();
  guest.terminate();
}, 15_000);

it('CLI가 현행·직전 artifact의 wire 버전을 각각 읽고 불일치 자산을 차단한다', async () => {
  directory = await mkdtemp(join(tmpdir(), 'relay-cli-'));
  const current = join(directory, 'current');
  const previous = join(directory, 'previous');
  await writeArtifact(current, PROTOCOL_VERSION, { 'index.html': '<html>current</html>' });
  await writeArtifact(previous, PROTOCOL_VERSION - 1, { 'index.html': '<html>old</html>' });
  const port = await launch(['packages/relay-dev/src/cli.ts'], {
    RELAY_PUBLIC: '1',
    RELAY_CREATION_SECRET: secret,
    RELAY_ALLOWED_ORIGINS: origin,
    RELAY_RELEASE: 'v2.0.0',
    RELAY_DIST_DIR: current,
    RELAY_PREVIOUS_RELEASE: 'v1.0.0',
    RELAY_PREVIOUS_DIST_DIR: previous,
    PORT: '0',
    HOST: '127.0.0.1',
  });
  const base = `http://127.0.0.1:${port}`;
  const version: unknown = await fetch(`${base}/version`).then((response) => response.json());
  if (
    !version ||
    typeof version !== 'object' ||
    !('releases' in version) ||
    !Array.isArray(version.releases)
  )
    throw new Error('version');
  expect(version.releases).toMatchObject([
    { release: 'v2.0.0', wireVersion: PROTOCOL_VERSION, compatible: true },
    { release: 'v1.0.0', wireVersion: PROTOCOL_VERSION - 1, compatible: false },
  ]);
  const releases: unknown[] = version.releases;
  for (const release of releases) {
    if (
      !release ||
      typeof release !== 'object' ||
      !('path' in release) ||
      typeof release.path !== 'string' ||
      !('compatible' in release) ||
      typeof release.compatible !== 'boolean'
    )
      throw new Error('release');
    expect((await fetch(`${base}${release.path}`)).status).toBe(release.compatible ? 200 : 404);
  }
}, 15_000);
