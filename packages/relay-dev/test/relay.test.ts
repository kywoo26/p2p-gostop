import { RELAY_PATH } from '@p2p-gostop/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import { CLOSE_INVALID_ROLE, CLOSE_ROLE_TAKEN, startRelay, type Relay } from '../src/index.ts';

let relay: Relay;
const clients: WebSocket[] = [];

beforeEach(async () => {
  relay = await startRelay({ port: 0, maxPayload: 1024 });
});

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.terminate();
  }
  await relay.close();
});

function connect(role: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${relay.port}${RELAY_PATH}?role=${role}`);
  clients.push(ws);
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

const toText = (data: RawData): string => {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return (data instanceof ArrayBuffer ? Buffer.from(data) : data).toString('utf8');
};

const nextMessage = (ws: WebSocket) =>
  new Promise<string>((resolve) => ws.once('message', (data) => resolve(toText(data))));

const closed = (ws: WebSocket) =>
  new Promise<{ code: number; reason: string }>((resolve) =>
    ws.once('close', (code, reason) => resolve({ code, reason: String(reason) })),
  );

describe('relay-dev (plan.md 1.1 중계 규칙)', () => {
  it('호스트 메시지는 게스트로, 게스트 메시지는 호스트로 그대로 전달', async () => {
    const host = await connect('host');
    const guest = await connect('guest');

    const toGuest = nextMessage(guest);
    host.send('{"t":"welcome"}');
    expect(await toGuest).toBe('{"t":"welcome"}');

    const toHost = nextMessage(host);
    guest.send('{"t":"hello","name":"게스트"}');
    expect(await toHost).toBe('{"t":"hello","name":"게스트"}');
  });

  it('같은 역할의 두 번째 연결은 거절(4409), 기존 연결은 유지', async () => {
    const host = await connect('host');
    const second = new WebSocket(`ws://127.0.0.1:${relay.port}${RELAY_PATH}?role=host`);
    clients.push(second);
    expect((await closed(second)).code).toBe(CLOSE_ROLE_TAKEN);

    const guest = await connect('guest');
    const toGuest = nextMessage(guest);
    host.send('still-here');
    expect(await toGuest).toBe('still-here');
  });

  it('역할이 없거나 잘못되면 거절(1008)', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}${RELAY_PATH}?role=spectator`);
    clients.push(ws);
    expect((await closed(ws)).code).toBe(CLOSE_INVALID_ROLE);
  });

  it('크기 상한을 넘는 메시지를 보낸 쪽은 1009로 닫힌다', async () => {
    const host = await connect('host');
    await connect('guest');
    const hostClosed = closed(host);
    host.send('x'.repeat(2048));
    expect((await hostClosed).code).toBe(1009);
  });

  it('역할이 끊기면 같은 역할로 다시 접속할 수 있다', async () => {
    const host = await connect('host');
    const hostClosed = closed(host);
    host.close();
    await hostClosed;
    await expect(connect('host')).resolves.toBeInstanceOf(WebSocket);
  });
});
