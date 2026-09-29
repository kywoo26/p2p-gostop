// 원격 게스트 E2E용 공개 중계. 테스트에서만 시계를 앞당겨 15분 초대·60초 코드 대기를 검증한다.
import { createInterface } from 'node:readline';
import { startRelay } from '../src/index.ts';

interface Task {
  at: number;
  every: number;
  callback: () => void;
}

class TestClock {
  private at = Date.now();
  private nextId = 0;
  private readonly tasks = new Map<number, Task>();

  now = (): number => this.at;

  timeout = (callback: () => void, delay: number) => this.add(callback, delay, 0);

  interval = (callback: () => void, delay: number) => this.add(callback, delay, delay);

  private add(callback: () => void, delay: number, every: number) {
    const id = ++this.nextId;
    this.tasks.set(id, { at: this.at + delay, every, callback });
    return {
      cancel: () => this.tasks.delete(id),
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
      await new Promise<void>((done) => setImmediate(done));
    }
    this.at = end;
    await new Promise<void>((done) => setImmediate(done));
  }
}

const secret = process.env['RELAY_CREATION_SECRET'];
const origin = process.env['RELAY_ALLOWED_ORIGINS'];
if (!secret || !origin) throw new Error('remote UI test relay settings missing');

const clock = new TestClock();
const relay = await startRelay({
  host: '127.0.0.1',
  port: 0,
  publicMode: { creationSecret: secret, allowedOrigins: [origin], clock },
});
process.stdout.write(`${JSON.stringify({ port: relay.port, now: clock.now() })}\n`);

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  const command: unknown = JSON.parse(line);
  if (
    !command ||
    typeof command !== 'object' ||
    !('advance' in command) ||
    typeof command.advance !== 'number' ||
    command.advance < 0
  )
    throw new Error('invalid test clock command');
  await clock.advance(command.advance);
  process.stdout.write(`${JSON.stringify({ now: clock.now() })}\n`);
}
await relay.close();
