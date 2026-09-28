// 중계 규칙 시나리오 (relay-scenarios.json). Android SmokeServer RelayRoles와 같은 규칙이다(#15·#24, 리뷰 T-5).
// 시나리오 JSON은 Kotlin M4ServerTest가 같은 표를 읽도록 옮길 수 있게 전송 사실만 적는다.
import { RELAY_PATH } from '@p2p-gostop/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import scenarios from './relay-scenarios.json';
import { startRelay, type Relay } from '../src/index.ts';

interface Step {
  readonly open?: string;
  readonly role?: string;
  readonly rejected?: number;
  readonly expect?: string;
  readonly text?: string;
  readonly send?: string;
  readonly sendBinary?: string;
  readonly sendBytes?: string;
  readonly expectBytes?: string;
  readonly bytes?: number;
  readonly silence?: string;
  readonly closed?: string;
  readonly code?: number;
  readonly reason?: string;
  readonly close?: string;
}

const toText = (data: RawData): string => {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return (data instanceof ArrayBuffer ? Buffer.from(data) : data).toString('utf8');
};

/** 도착한 프레임과 닫힘을 모두 버퍼에 담아 순서대로 꺼낸다 */
class Client {
  readonly ws: WebSocket;
  private readonly inbox: string[] = [];
  private waiters: ((text: string) => void)[] = [];
  readonly closed: Promise<{ code: number; reason: string }>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      const text = toText(data);
      const waiter = this.waiters.shift();
      if (waiter) waiter(text);
      else this.inbox.push(text);
    });
    this.closed = new Promise((resolve) =>
      this.ws.once('close', (code, reason) => resolve({ code, reason: String(reason) })),
    );
  }
  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }
  next(ms = 2000): Promise<string> {
    const queued = this.inbox.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('프레임을 기다리다 시간 초과')), ms);
      this.waiters.push((text) => {
        clearTimeout(timer);
        resolve(text);
      });
    });
  }
  async silent(ms = 120): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return this.inbox.length === 0;
  }
}

let relay: Relay | null = null;
const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) client.ws.terminate();
  await relay?.close();
  relay = null;
});

/** 시나리오를 돌려 단계마다 기대값(want)과 관찰값(got)을 모은다 */
async function run(
  steps: readonly Step[],
  remote?: string,
): Promise<{ got: unknown[]; want: unknown[] }> {
  relay = await startRelay({ port: 0, ...(remote ? { remoteAddress: () => remote } : {}) });
  const got: unknown[] = [];
  const want: unknown[] = [];
  const byName = new Map<string, Client>();
  const get = (name: string) => {
    const client = byName.get(name);
    if (!client) throw new Error(`클라이언트 ${name} 없음`);
    return client;
  };
  for (const step of steps) {
    if (step.open !== undefined) {
      const client = new Client(`ws://127.0.0.1:${relay.port}${RELAY_PATH}?role=${step.role}`);
      clients.push(client);
      byName.set(step.open, client);
      if (step.rejected !== undefined) {
        want.push({ open: step.open, code: step.rejected });
        got.push({ open: step.open, code: (await client.closed).code });
      } else await client.opened();
    } else if (step.expect !== undefined) {
      want.push({ at: step.expect, text: step.text });
      got.push({ at: step.expect, text: await get(step.expect).next() });
    } else if (step.send !== undefined) get(step.send).ws.send(step.text!);
    else if (step.sendBinary !== undefined)
      get(step.sendBinary).ws.send(Buffer.from([1, 2, 3]), { binary: true });
    else if (step.sendBytes !== undefined) get(step.sendBytes).ws.send('x'.repeat(step.bytes!));
    else if (step.expectBytes !== undefined) {
      want.push({ at: step.expectBytes, bytes: step.bytes });
      got.push({ at: step.expectBytes, bytes: (await get(step.expectBytes).next()).length });
    } else if (step.silence !== undefined) {
      want.push({ silent: step.silence });
      got.push(
        (await get(step.silence).silent()) ? { silent: step.silence } : { noisy: step.silence },
      );
    } else if (step.closed !== undefined) {
      const closed = await get(step.closed).closed;
      want.push({ closed: step.closed, code: step.code, reason: step.reason ?? closed.reason });
      got.push({ closed: step.closed, code: closed.code, reason: closed.reason });
    } else if (step.close !== undefined) {
      const client = get(step.close);
      client.ws.close();
      await client.closed;
    } else throw new Error(`모르는 단계 ${JSON.stringify(step)}`);
  }
  return { got, want };
}

describe('relay-dev 시나리오 (Android 중계와 같은 규칙)', () => {
  it.each(
    scenarios as readonly { id: string; description: string; remote?: string; steps: Step[] }[],
  )('$id $description', async (scenario) => {
    const { got, want } = await run(scenario.steps, scenario.remote);
    expect(got).toEqual(want);
  });
});
