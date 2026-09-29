import { randomBytes } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import { RoomAuth } from '../src/auth.ts';
import { startRelay, type Relay } from '../src/index.ts';

const secret = randomBytes(32).toString('base64url');
const origin = 'https://relay.example.test';
let relay: Relay | undefined;
const clients: WebSocket[] = [];
afterEach(async () => {
  for (const ws of clients) ws.terminate();
  await relay?.close();
  relay = undefined;
});

function connect(port: number, role: string, room: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?role=${role}&room=${room}`, { origin });
  clients.push(ws);
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}
function next(ws: WebSocket): Promise<string> {
  return new Promise((resolve) =>
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
}
function closed(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.once('close', (code) => resolve(code)));
}

it('256-bit 생성 키, 역할 범위, 인증 전 무전달 및 위조 교체 방지', async () => {
  relay = await startRelay({ publicMode: { creationSecret: secret, allowedOrigins: [origin] } });
  const base = `http://127.0.0.1:${relay.port}`;
  const denied = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { Authorization: 'Bearer wrong' },
  });
  expect(denied.status).toBe(401);
  const created = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(created.status).toBe(201);
  const result: unknown = await created.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('roomId' in result) ||
    !('hostToken' in result) ||
    typeof result.roomId !== 'string' ||
    typeof result.hostToken !== 'string'
  )
    throw new Error('invalid create response');
  const { roomId, hostToken } = result;
  expect(Buffer.from(roomId, 'base64url')).toHaveLength(16);
  expect(Buffer.from(hostToken, 'base64url')).toHaveLength(32);
  const guestToken = randomBytes(32).toString('base64url');
  const registered = await fetch(`${base}/api/rooms/${roomId}/credentials`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hostToken}` },
    body: JSON.stringify({
      token: guestToken,
      permission: 'resume',
      expiresAt: Date.now() + 60_000,
    }),
  });
  expect(registered.status).toBe(201);
  const host = await connect(relay.port, 'host', roomId);
  const premature = await connect(relay.port, 'guest', roomId);
  const prematureClosed = closed(premature);
  premature.send('premature');
  expect(await prematureClosed).toBe(1008);
  const guest = await connect(relay.port, 'guest', roomId);
  const hostAbsent = next(host);
  host.send(JSON.stringify({ t: 'relay-auth', token: hostToken }));
  expect(await hostAbsent).toContain('absent');
  const attacker = await connect(relay.port, 'host', roomId);
  const attackerClosed = closed(attacker);
  attacker.send(JSON.stringify({ t: 'relay-auth', token: guestToken }));
  expect(await attackerClosed).toBe(1008);
  const guestPresent = next(guest);
  const hostJoined = next(host);
  guest.send(JSON.stringify({ t: 'relay-auth', token: guestToken }));
  expect(await guestPresent).toContain('present');
  expect(await hostJoined).toContain('joined');
  const hostGame = next(host);
  guest.send('game');
  expect(await hostGame).toBe('game');
});

it('역할 해시와 만료를 구분한다', () => {
  const auth = new RoomAuth(secret);
  const { room, hostToken } = auth.create();
  const guestToken = randomBytes(32).toString('base64url');
  expect(auth.register(room, hostToken, guestToken, 'invite', Date.now() + 10_000)).toBe(true);
  expect(auth.authenticate(room, 'guest', guestToken)).toBe('invite');
  expect(auth.authenticate(room, 'host', guestToken)).toBeNull();
  expect(auth.authenticate(room, 'guest', hostToken)).toBeNull();
  expect(auth.authenticate(room, 'guest', guestToken, Date.now() + 20_000)).toBeNull();
});
