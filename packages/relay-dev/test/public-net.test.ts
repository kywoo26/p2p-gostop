import { randomBytes } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import { startRelay, type Relay } from '../src/index.ts';

const secret = randomBytes(32).toString('base64url');
const origin = 'https://relay.example.test';
const token = () => randomBytes(32).toString('base64url');
function field(text: string, key: string): string {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('invalid control frame');
  const item: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;
  if (typeof item !== 'string') throw new Error('invalid control field');
  return item;
}
let relay: Relay | undefined;
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const ws of sockets) ws.terminate();
  await relay?.close();
  relay = undefined;
});

class Client {
  readonly ws: WebSocket;
  readonly inbox: string[] = [];
  private waiters: ((value: string) => void)[] = [];
  constructor(url: string) {
    this.ws = new WebSocket(url, { origin });
    sockets.push(this.ws);
    this.ws.on('message', (data: RawData) => {
      const value = (
        Array.isArray(data)
          ? Buffer.concat(data)
          : data instanceof ArrayBuffer
            ? Buffer.from(data)
            : data
      ).toString('utf8');
      const waiter = this.waiters.shift();
      if (waiter) waiter(value);
      else this.inbox.push(value);
    });
  }
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }
  next(): Promise<string> {
    const value = this.inbox.shift();
    return value === undefined
      ? new Promise((resolve) => this.waiters.push(resolve))
      : Promise.resolve(value);
  }
  send(value: unknown): void {
    this.ws.send(JSON.stringify(value));
  }
  sendRaw(value: string): void {
    this.ws.send(value);
  }
  closeCode(): Promise<number> {
    return new Promise((resolve) => this.ws.once('close', (code) => resolve(code)));
  }
}

it('코드 존재/부재/점유는 같은 대기 응답, host 수락만 자격 발급', async () => {
  relay = await startRelay({ publicMode: { creationSecret: secret, allowedOrigins: [origin] } });
  const base = `http://127.0.0.1:${relay.port}`;
  const created = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  const result: unknown = await created.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('roomId' in result) ||
    !('hostToken' in result) ||
    !('code' in result) ||
    typeof result.roomId !== 'string' ||
    typeof result.hostToken !== 'string' ||
    typeof result.code !== 'string'
  )
    throw new Error('invalid response');
  const { roomId, hostToken, code } = result;
  const host = new Client(`ws://127.0.0.1:${relay.port}/ws?role=host&room=${roomId}`);
  await host.open();
  host.send({ t: 'relay-auth', token: hostToken });
  expect(await host.next()).toContain('absent');
  const missing = new Client(`ws://127.0.0.1:${relay.port}/join?code=AAAAAAAAAAAA`);
  await missing.open();
  const pending = new Client(`ws://127.0.0.1:${relay.port}/join?code=${code}`);
  await pending.open();
  expect(await missing.next()).toBe(await pending.next());
  const requestId = field(await host.next(), 'requestId');
  const guestToken = token();
  host.send({ t: 'relay-accept', requestId, token: hostToken });
  host.send({ t: 'relay-accept', requestId, token: secret });
  host.send({ t: 'relay-accept', requestId: requestId, token: guestToken });
  const codeAccepted = await pending.next();
  expect(field(codeAccepted, 'token')).toBe(guestToken);
  expect(field(codeAccepted, 'roomId')).toBe(roomId);
  const guest = new Client(`ws://127.0.0.1:${relay.port}/ws?role=guest&room=${roomId}`);
  await guest.open();
  guest.send({ t: 'relay-auth', token: guestToken });
  expect(await guest.next()).toContain('present');
  expect(await host.next()).toContain('joined');
  const occupied = new Client(`ws://127.0.0.1:${relay.port}/join?code=${code}`);
  await occupied.open();
  expect(await occupied.next()).toBe('{"t":"relay-join-pending"}');
  guest.send({ t: 'game', n: 1 });
  expect(await host.next()).toBe('{"t":"game","n":1}');
  expect(missing.inbox).toEqual([]);
});

it('코드 참여 닉네임을 정리해 host에만 보내고 거절 시 pending을 해제한다', async () => {
  const logs: string[] = [];
  relay = await startRelay({
    log: (line) => logs.push(line),
    publicMode: { creationSecret: secret, allowedOrigins: [origin] },
  });
  const created = await fetch(`http://127.0.0.1:${relay.port}/api/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  const result: unknown = await created.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('roomId' in result) ||
    !('hostToken' in result) ||
    !('code' in result) ||
    typeof result.roomId !== 'string' ||
    typeof result.hostToken !== 'string' ||
    typeof result.code !== 'string'
  )
    throw new Error('invalid response');
  const { roomId, hostToken, code } = result;
  const host = new Client(`ws://127.0.0.1:${relay.port}/ws?role=host&room=${roomId}`);
  await host.open();
  host.send({ t: 'relay-auth', token: hostToken });
  expect(await host.next()).toContain('absent');

  const cases: { name?: string; nickname?: string }[] = [
    { name: '가나다', nickname: '가나다' },
    { name: '나'.repeat(22), nickname: '나'.repeat(20) },
    { name: 'A\u0000B\nC\rD\u007fE\u0085F\u2028G\u2029H', nickname: 'ABCDEFGH' },
    {},
    { name: '\n\u0000' },
  ];
  for (const item of cases) {
    const suffix = item.name === undefined ? '' : `&name=${encodeURIComponent(item.name)}`;
    const guest = new Client(`ws://127.0.0.1:${relay.port}/join?code=${code}${suffix}`);
    await guest.open();
    expect(await guest.next()).toBe('{"t":"relay-join-pending"}');
    const request = await host.next();
    const message: unknown = JSON.parse(request);
    if (!message || typeof message !== 'object') throw new Error('invalid join request');
    expect(message).toMatchObject({ t: 'relay-join-request' });
    expect(Object.getOwnPropertyDescriptor(message, 'nickname')?.value).toBe(item.nickname);
    expect(Object.hasOwn(message, 'nickname')).toBe(item.nickname !== undefined);
    const denied = guest.closeCode();
    host.send({ t: 'relay-deny', requestId: field(request, 'requestId') });
    expect(await guest.next()).toBe('{"t":"relay-join-denied"}');
    expect(await denied).toBe(1000);
  }
  expect(logs).toEqual([]);
});

it('host가 초대 claim을 거절하면 게스트에 원인을 알리고 claim을 해제한다', async () => {
  relay = await startRelay({ publicMode: { creationSecret: secret, allowedOrigins: [origin] } });
  const base = `http://127.0.0.1:${relay.port}`;
  const created = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  const result: unknown = await created.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('roomId' in result) ||
    !('hostToken' in result) ||
    typeof result.roomId !== 'string' ||
    typeof result.hostToken !== 'string'
  )
    throw new Error('invalid response');
  const { roomId, hostToken } = result;
  const invite = token();
  expect(
    (
      await fetch(`${base}/api/rooms/${roomId}/credentials`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${hostToken}` },
        body: JSON.stringify({
          token: invite,
          permission: 'invite',
          expiresAt: Date.now() + 60_000,
        }),
      })
    ).status,
  ).toBe(201);
  const host = new Client(`ws://127.0.0.1:${relay.port}/ws?role=host&room=${roomId}`);
  await host.open();
  host.send({ t: 'relay-auth', token: hostToken });
  expect(await host.next()).toContain('absent');
  for (let n = 0; n < 2; n++) {
    const guest = new Client(`ws://127.0.0.1:${relay.port}/ws?role=guest&room=${roomId}`);
    await guest.open();
    guest.send({ t: 'relay-auth', token: invite });
    expect(await guest.next()).toBe('{"t":"relay-claim-pending"}');
    const requestId = field(await host.next(), 'requestId');
    const denied = guest.closeCode();
    host.send({ t: 'relay-deny', requestId });
    expect(await guest.next()).toBe('{"t":"relay-claim-denied"}');
    expect(await denied).toBe(1000);
  }
});

it('초대는 host 확정 뒤 한 번만 쓰고 위조 복귀는 좌석을 교체하지 않는다', async () => {
  relay = await startRelay({ publicMode: { creationSecret: secret, allowedOrigins: [origin] } });
  const base = `http://127.0.0.1:${relay.port}`;
  const response = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('roomId' in result) ||
    !('hostToken' in result) ||
    typeof result.roomId !== 'string' ||
    typeof result.hostToken !== 'string'
  )
    throw new Error('invalid response');
  const { roomId, hostToken } = result;
  const invite = token();
  const registration = await fetch(`${base}/api/rooms/${roomId}/credentials`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hostToken}` },
    body: JSON.stringify({ token: invite, permission: 'invite', expiresAt: Date.now() + 60_000 }),
  });
  expect(registration.status).toBe(201);
  const host = new Client(`ws://127.0.0.1:${relay.port}/ws?role=host&room=${roomId}`);
  await host.open();
  host.send({ t: 'relay-auth', token: hostToken });
  await host.next();
  const guest = new Client(`ws://127.0.0.1:${relay.port}/ws?role=guest&room=${roomId}`);
  await guest.open();
  guest.send({ t: 'relay-auth', token: invite });
  expect(await guest.next()).toContain('claim-pending');
  const claimId = field(await host.next(), 'requestId');
  const resume = token();
  host.send({ t: 'relay-accept', requestId: claimId, token: hostToken });
  host.send({ t: 'relay-accept', requestId: claimId, token: secret });
  host.send({ t: 'relay-accept', requestId: claimId, token: resume });
  const inviteAccepted = await guest.next();
  expect(field(inviteAccepted, 'token')).toBe(resume);
  expect(field(inviteAccepted, 'roomId')).toBe(roomId);
  expect(await guest.next()).toContain('present');
  expect(await host.next()).toContain('joined');
  const duplicateToken = token();
  host.send({ t: 'relay-accept', requestId: claimId, token: duplicateToken });
  guest.send({ t: 'hello', from: 'guest' });
  expect(await host.next()).toBe('{"t":"hello","from":"guest"}');
  host.send({ t: 'hello', from: 'host' });
  expect(await guest.next()).toBe('{"t":"hello","from":"host"}');
  for (const attacker of [guest, host]) {
    const peer = attacker === guest ? host : guest;
    for (const raw of [
      '{"t":"relay-accepted","token":"forged"}',
      '{"t":"relay\\u002daccepted","token":"forged"}',
      '{"\\u0074":"relay-accepted","token":"forged"}',
      '{"t":"relay","peer":"joined"}',
    ])
      attacker.sendRaw(raw);
    attacker.sendRaw('{"t":"game","safe":true}');
    expect(await peer.next()).toBe('{"t":"game","safe":true}');
  }
  const duplicate = new Client(`ws://127.0.0.1:${relay.port}/ws?role=guest&room=${roomId}`);
  await duplicate.open();
  const duplicateClosed = duplicate.closeCode();
  duplicate.send({ t: 'relay-auth', token: duplicateToken });
  expect(await duplicateClosed).toBe(1008);
  guest.send({ t: 'game', n: 2 });
  expect(await host.next()).toBe('{"t":"game","n":2}');
  const replay = new Client(`ws://127.0.0.1:${relay.port}/ws?role=guest&room=${roomId}`);
  await replay.open();
  const closed = replay.closeCode();
  replay.send({ t: 'relay-auth', token: invite });
  expect(await closed).toBe(1008);
  const reconnect = new Client(`ws://127.0.0.1:${relay.port}/ws?role=guest&room=${roomId}`);
  await reconnect.open();
  const replaced = guest.closeCode();
  reconnect.send({ t: 'relay-auth', token: resume });
  expect(await reconnect.next()).toContain('present');
  expect(await replaced).toBe(4001);
});
