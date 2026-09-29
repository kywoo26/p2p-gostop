import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';
import { WebSocket, type RawData } from 'ws';
import { startRelay, type Relay } from '../src/index.ts';
import { writeArtifact } from './artifact.ts';

const local = 'http://127.0.0.1:17777';
const guest = 'https://relay.example.test';
const other = 'https://outside.example.test';
const secret = randomBytes(32).toString('base64url');
let relay: Relay | undefined;
let directory: string | undefined;
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const ws of sockets) ws.terminate();
  await relay?.close();
  relay = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

async function server(origins: string[]): Promise<string> {
  directory = await mkdtemp(join(tmpdir(), 'relay-cors-'));
  const dist = join(directory, 'dist');
  await writeArtifact(dist, PROTOCOL_VERSION, { 'index.html': '<html>public</html>' });
  relay = await startRelay({
    publicMode: {
      creationSecret: secret,
      allowedOrigins: origins,
      releases: [{ id: 'v0.2.2', distDir: dist }],
    },
  });
  return `http://127.0.0.1:${relay.port}`;
}

function expectCors(response: Response, origin: string | null): void {
  expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  expect(response.headers.get('vary')).toBe(origin ? 'Origin' : null);
  expect(response.headers.get('access-control-allow-credentials')).toBeNull();
}

it('허용/비허용 Origin GET·OPTIONS·POST에 정확한 CORS만 설정한다', async () => {
  const base = await server([local, guest]);
  for (const origin of [local, guest, other]) {
    const permitted = origin !== other;
    const expected = permitted ? origin : null;
    const health = await fetch(`${base}/health`, { headers: { Origin: origin } });
    expect(health.status).toBe(200);
    expectCors(health, expected);
    const preflight = await fetch(`${base}/api/rooms`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });
    expect(preflight.status).toBe(permitted ? 204 : 403);
    expectCors(preflight, expected);
    expect(preflight.headers.get('access-control-allow-methods')).toBe(
      permitted ? 'GET, POST, DELETE, OPTIONS' : null,
    );
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      permitted ? 'Authorization, Content-Type' : null,
    );
    expect(preflight.headers.get('access-control-max-age')).toBe(permitted ? '600' : null);
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { Origin: origin, Authorization: `Bearer ${secret}` },
    });
    expect(created.status).toBe(201);
    expectCors(created, expected);
  }
  const version: unknown = await fetch(`${base}/version`).then((response) => response.json());
  if (
    !version ||
    typeof version !== 'object' ||
    !('current' in version) ||
    !version.current ||
    typeof version.current !== 'object' ||
    !('path' in version.current) ||
    typeof version.current.path !== 'string'
  )
    throw new Error('invalid version response');
  const asset = await fetch(`${base}${version.current.path}`, { headers: { Origin: local } });
  expect(asset.status).toBe(200);
  expectCors(asset, null);
});

it('빈 목록은 Galaxy 로컬 Origin만 HTTP와 WS에 기본 허용한다', async () => {
  const base = await server([]);
  expectCors(await fetch(`${base}/health`, { headers: { Origin: local } }), local);
  expectCors(await fetch(`${base}/health`, { headers: { Origin: guest } }), null);
  const created = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { Origin: local, Authorization: `Bearer ${secret}` },
  });
  const body: unknown = await created.json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('roomId' in body) ||
    !('hostToken' in body) ||
    typeof body.roomId !== 'string' ||
    typeof body.hostToken !== 'string'
  )
    throw new Error('invalid create response');
  const ws = new WebSocket(`ws://127.0.0.1:${relay!.port}/ws?role=host&room=${body.roomId}`, {
    origin: local,
  });
  sockets.push(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  const notice = new Promise<string>((resolve) =>
    ws.once('message', (data: RawData) =>
      resolve(
        (Array.isArray(data)
          ? Buffer.concat(data)
          : data instanceof ArrayBuffer
            ? Buffer.from(data)
            : data
        ).toString('utf8'),
      ),
    ),
  );
  ws.send(JSON.stringify({ t: 'relay-auth', token: body.hostToken }));
  expect(await notice).toContain('absent');
  const denied = new WebSocket(`ws://127.0.0.1:${relay!.port}/ws?role=guest&room=${body.roomId}`, {
    origin: guest,
  });
  sockets.push(denied);
  await expect(
    new Promise<void>((resolve, reject) => {
      denied.once('open', () => resolve());
      denied.once('error', reject);
    }),
  ).rejects.toBeInstanceOf(Error);
});
