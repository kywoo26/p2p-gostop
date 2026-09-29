import { randomBytes } from 'node:crypto';
import { setImmediate as yieldToIo } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import { startRelay, type Relay, type RelayOptions } from '../src/index.ts';

const origin = 'https://relay.example.test';
const secret = randomBytes(32).toString('base64url');
const token = (): string => randomBytes(32).toString('base64url');
type Room = { roomId: string; hostToken: string; code: string };

class ManualClock {
  private at = 1_000_000;
  private nextId = 0;
  private readonly tasks = new Map<number, { at: number; every: number; callback: () => void }>();
  now = (): number => this.at;
  timeout = (callback: () => void, delay: number): { cancel(): void; unref(): void } =>
    this.add(callback, delay, 0);
  interval = (callback: () => void, delay: number): { cancel(): void; unref(): void } =>
    this.add(callback, delay, delay);
  private add(
    callback: () => void,
    delay: number,
    every: number,
  ): { cancel(): void; unref(): void } {
    const id = ++this.nextId;
    this.tasks.set(id, { at: this.at + delay, every, callback });
    return {
      cancel: () => {
        this.tasks.delete(id);
      },
      unref: () => {},
    };
  }
  async advance(ms: number): Promise<void> {
    const end = this.at + ms;
    while (true) {
      const due = [...this.tasks]
        .filter(([, task]) => task.at <= end)
        .toSorted((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, task] = due;
      this.at = task.at;
      if (task.every) task.at += task.every;
      else this.tasks.delete(id);
      task.callback();
      await yieldToIo();
    }
    this.at = end;
    await yieldToIo();
  }
}

class Client {
  readonly ws: WebSocket;
  readonly inbox: string[] = [];
  private readonly waiters: ((text: string) => void)[] = [];
  constructor(url: string, headers?: Record<string, string>) {
    this.ws = new WebSocket(url, { origin, headers });
    clients.push(this);
    this.ws.on('error', () => {});
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
  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }
  next(): Promise<string> {
    const value = this.inbox.shift();
    return value === undefined
      ? new Promise((resolve) => this.waiters.push(resolve))
      : Promise.resolve(value);
  }
  send(text: string): void {
    this.ws.send(text);
  }
  closed(): Promise<number> {
    return new Promise((resolve) => this.ws.once('close', (code) => resolve(code)));
  }
}

let relay: Relay | undefined;
const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) client.ws.terminate();
  await relay?.close();
  relay = undefined;
});

async function start(
  clock: ManualClock,
  sendFrame?: (ws: WebSocket, value: string, done: () => void) => void,
  remoteAddress?: RelayOptions['remoteAddress'],
): Promise<string> {
  relay = await startRelay({
    ...(remoteAddress ? { remoteAddress } : {}),
    publicMode: {
      creationSecret: secret,
      allowedOrigins: [origin],
      clock,
      ...(sendFrame ? { sendFrame } : {}),
    },
  });
  return `http://127.0.0.1:${relay.port}`;
}
async function create(base: string): Promise<{ status: number; room?: Room }> {
  const response = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (response.status !== 201) return { status: response.status };
  const value: unknown = await response.json();
  if (
    !value ||
    typeof value !== 'object' ||
    !('roomId' in value) ||
    typeof value.roomId !== 'string' ||
    !('hostToken' in value) ||
    typeof value.hostToken !== 'string' ||
    !('code' in value) ||
    typeof value.code !== 'string'
  )
    throw new Error('invalid room');
  return {
    status: response.status,
    room: {
      roomId: value.roomId,
      hostToken: value.hostToken,
      code: value.code,
    },
  };
}
async function deleteRoom(base: string, room: Room): Promise<void> {
  expect(
    (
      await fetch(`${base}/api/rooms/${room.roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${room.hostToken}` },
      })
    ).status,
  ).toBe(204);
}
async function open(port: number, path: string, headers?: Record<string, string>): Promise<Client> {
  const client = new Client(`ws://127.0.0.1:${port}${path}`, headers);
  await client.open();
  return client;
}
async function seat(
  port: number,
  room: Room,
  role: 'host' | 'guest',
  credential: string,
): Promise<Client> {
  const client = await open(port, `/ws?role=${role}&room=${room.roomId}`);
  client.send(JSON.stringify({ t: 'relay-auth', token: credential }));
  await client.next();
  return client;
}

it('생성 3/분·100/일과 방 4개의 한계 전후를 적용한다', async () => {
  const clock = new ManualClock();
  const base = await start(clock);
  const initial: Room[] = [];
  for (let i = 0; i < 3; i++) {
    const result = await create(base);
    expect(result.status).toBe(201);
    initial.push(result.room!);
  }
  expect((await create(base)).status).toBe(429);
  await clock.advance(60_000);
  initial.push((await create(base)).room!);
  expect(initial).toHaveLength(4);
  expect((await create(base)).status).toBe(503);
  for (const room of initial) await deleteRoom(base, room);
  // 첫 분의 3건과 다음 분의 1건을 포함해 하루 100건까지만 허용한다.
  for (let made = 4; made < 100;) {
    await clock.advance(60_000);
    for (let n = 0; n < 3 && made < 100; n++, made++) {
      const result = await create(base);
      expect(result.status).toBe(201);
      await deleteRoom(base, result.room!);
    }
  }
  await clock.advance(60_000);
  expect((await create(base)).status).toBe(429);
  await clock.advance(86_400_000);
  expect((await create(base)).status).toBe(201);
});

it('미인증 방당 2·전체 8·5초 경계와 거절 후 좌석 보존', async () => {
  const clock = new ManualClock();
  const base = await start(clock);
  const rooms: Room[] = [];
  for (let i = 0; i < 4; i++) {
    if (i === 3) await clock.advance(60_000);
    rooms.push((await create(base)).room!);
  }
  const waiting: Client[] = [];
  for (const room of rooms)
    for (let n = 0; n < 2; n++)
      waiting.push(await open(relay!.port, `/ws?role=guest&room=${room.roomId}`));
  const ninth = await open(relay!.port, `/ws?role=guest&room=${rooms[0]!.roomId}`);
  expect(await ninth.closed()).toBe(1013);
  expect(waiting.every((client) => client.ws.readyState === WebSocket.OPEN)).toBe(true);
  expect(waiting.every((client) => client.inbox.length === 0)).toBe(true);
  await clock.advance(4_999);
  expect(waiting.every((client) => client.ws.readyState === WebSocket.OPEN)).toBe(true);
  const closed = waiting.map((client) => client.closed());
  await clock.advance(1);
  expect(await Promise.all(closed)).toEqual(Array(8).fill(1008));
  await clock.advance(60_000);
  const room = rooms[0]!;
  const host = await seat(relay!.port, room, 'host', room.hostToken);
  const intruder = await open(relay!.port, `/ws?role=host&room=${room.roomId}`);
  const rejected = intruder.closed();
  intruder.send(JSON.stringify({ t: 'relay-auth', token: token() }));
  expect(await rejected).toBe(1008);
  expect(host.ws.readyState).toBe(WebSocket.OPEN);
});

it('참여 IP·방 10/분은 위조 전달 헤더로 우회할 수 없고 정각에 복구한다', async () => {
  const clock = new ManualClock();
  const base = await start(clock);
  const room = (await create(base)).room!;
  for (let n = 0; n < 10; n++) {
    const client = await open(relay!.port, `/ws?role=guest&room=${room.roomId}`, {
      'X-Forwarded-For': `198.51.100.${n}`,
    });
    client.ws.close();
    await client.closed();
  }
  const denied = await open(relay!.port, `/ws?role=guest&room=${room.roomId}`, {
    'X-Forwarded-For': '203.0.113.1',
  });
  expect(await denied.closed()).toBe(1013);
  await clock.advance(59_999);
  const stillDenied = await open(relay!.port, `/ws?role=guest&room=${room.roomId}`);
  expect(await stillDenied.closed()).toBe(1013);
  await clock.advance(1);
  const allowed = await open(relay!.port, `/ws?role=guest&room=${room.roomId}`);
  expect(allowed.ws.readyState).toBe(WebSocket.OPEN);
});

it('서로 다른 실제 주소에서도 같은 방 10/분이 독립적으로 적용된다', async () => {
  const clock = new ManualClock();
  const base = await start(clock, undefined, (request) => {
    const value = request.headers['x-test-ip'];
    return typeof value === 'string' ? value : undefined;
  });
  const first = (await create(base)).room!;
  const second = (await create(base)).room!;
  for (let n = 0; n < 10; n++) {
    const client = await open(relay!.port, `/ws?role=guest&room=${first.roomId}`, {
      'X-Test-IP': `192.0.2.${n}`,
    });
    const closed = client.closed();
    client.ws.close();
    await closed;
  }
  const denied = await open(relay!.port, `/ws?role=guest&room=${first.roomId}`, {
    'X-Test-IP': '192.0.2.100',
  });
  expect(await denied.closed()).toBe(1013);
  const allowed = await open(relay!.port, `/ws?role=guest&room=${second.roomId}`, {
    'X-Test-IP': '192.0.2.100',
  });
  expect(allowed.ws.readyState).toBe(WebSocket.OPEN);
});

it('코드 요청은 방당 2건이고 60초 정각에 같은 unavailable로 종료한다', async () => {
  const clock = new ManualClock();
  const base = await start(clock);
  const room = (await create(base)).room!;
  const host = await seat(relay!.port, room, 'host', room.hostToken);
  const pending: Client[] = [];
  for (let n = 0; n < 3; n++) {
    const client = await open(relay!.port, `/join?code=${room.code}`);
    expect(await client.next()).toBe('{"t":"relay-join-pending"}');
    pending.push(client);
  }
  expect(JSON.parse(await host.next())).toMatchObject({ t: 'relay-join-request' });
  expect(JSON.parse(await host.next())).toMatchObject({ t: 'relay-join-request' });
  await yieldToIo();
  expect(host.inbox).toEqual([]);
  await clock.advance(59_999);
  expect(pending.every((client) => client.ws.readyState === WebSocket.OPEN)).toBe(true);
  const unavailable = pending.map((client) => client.next());
  await clock.advance(1);
  expect(await Promise.all(unavailable)).toEqual(Array(3).fill('{"t":"relay-join-unavailable"}'));
});

it('인증 소켓의 순간 40프레임 뒤 41번째를 닫고 정상 상대 좌석을 보존한다', async () => {
  const clock = new ManualClock();
  const base = await start(clock);
  const room = (await create(base)).room!;
  const host = await seat(relay!.port, room, 'host', room.hostToken);
  for (let n = 0; n < 40; n++) host.send(`frame-${n}`);
  const closed = host.closed();
  host.send('frame-40');
  expect(await closed).toBe(1013);
});

it('인증 소켓은 다음 초에 20프레임만 다시 허용하고 128KiB/초를 넘으면 닫는다', async () => {
  const clock = new ManualClock();
  const base = await start(clock);
  const room = (await create(base)).room!;
  const host = await seat(relay!.port, room, 'host', room.hostToken);
  for (let n = 0; n < 40; n++) host.send(`burst-${n}`);
  await yieldToIo();
  await clock.advance(1_000);
  for (let n = 0; n < 20; n++) host.send(`steady-${n}`);
  const frameClose = host.closed();
  host.send('steady-20');
  expect(await frameClose).toBe(1013);

  await clock.advance(60_000);
  const resumedHost = await seat(relay!.port, room, 'host', room.hostToken);
  const first = 'B'.repeat(65_536);
  resumedHost.send(first);
  resumedHost.send(first);
  const byteClose = resumedHost.closed();
  resumedHost.send('B');
  expect(await byteClose).toBe(1013);
});

for (const kind of ['frames', 'bytes'] as const) {
  it(`송신 큐 ${kind} 한계의 마지막 프레임을 전달하고 다음 프레임에만 종료한다`, async () => {
    const clock = new ManualClock();
    const held: (() => void)[] = [];
    const base = await start(clock, (ws, value, done) => {
      ws.send(value);
      if (value.startsWith('Q')) held.push(done);
      else done();
    });
    const room = (await create(base)).room!;
    const guestToken = token();
    expect(
      (
        await fetch(`${base}/api/rooms/${room.roomId}/credentials`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${room.hostToken}` },
          body: JSON.stringify({
            token: guestToken,
            permission: 'resume',
            expiresAt: clock.now() + 60_000,
          }),
        })
      ).status,
    ).toBe(201);
    const host = await seat(relay!.port, room, 'host', room.hostToken);
    const guest = await seat(relay!.port, room, 'guest', guestToken);
    expect(await host.next()).toContain('joined');
    const size = kind === 'frames' ? 1 : 65_536;
    const count = kind === 'frames' ? 64 : 16;
    for (let n = 0; n < count; n++) {
      if (n % 2 === 0) await clock.advance(1_000);
      const received = guest.next();
      host.send('Q'.repeat(size));
      expect(await received).toHaveLength(size);
    }
    expect(held).toHaveLength(count);
    expect(guest.ws.readyState).toBe(WebSocket.OPEN);
    const closed = guest.closed();
    await clock.advance(1_000);
    host.send('Q');
    expect(await closed).toBe(1009);
  });
}

it('재시작하면 이전 방과 역할 자격이 사라진다', async () => {
  const clock = new ManualClock();
  const base = await start(clock);
  const room = (await create(base)).room!;
  await relay!.close();
  relay = undefined;
  await start(clock);
  const old = await open(relay!.port, `/ws?role=host&room=${room.roomId}`);
  expect(await old.closed()).toBe(1008);
});
