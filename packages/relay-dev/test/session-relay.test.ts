import { randomPolicy, createPolicyRng } from '@p2p-gostop/ai';
import { PRESETS, legalActions } from '@p2p-gostop/engine';
import {
  HostSession,
  GuestSession,
  RELAY_PATH,
  encode,
  type Message,
  type Role,
  type Transport,
} from '@p2p-gostop/protocol';
import { expect, it } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import { startRelay } from '../src/index.ts';

class RelayTransport implements Transport {
  private readonly url: string;
  private socket: WebSocket | null = null;
  private queue: Message[] = [];
  private messages = new Set<(raw: string) => void>();
  private closes = new Set<() => void>();
  constructor(url: string) {
    this.url = url;
    this.reconnect();
  }
  reconnect(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.on('open', () => {
      for (const m of this.queue.splice(0)) socket.send(encode(m));
    });
    socket.on('message', (data: RawData) => {
      if (this.socket !== socket) return;
      const raw = Array.isArray(data)
        ? Buffer.concat(data).toString('utf8')
        : (data instanceof ArrayBuffer ? Buffer.from(data) : data).toString('utf8');
      for (const handler of this.messages) handler(raw);
    });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      for (const handler of this.closes) handler();
    });
  }
  send(message: Message): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encode(message));
    else this.queue.push(message);
  }
  onMessage(handler: (raw: string) => void): () => void {
    this.messages.add(handler);
    return () => {
      this.messages.delete(handler);
    };
  }
  onClose(handler: () => void): () => void {
    this.closes.add(handler);
    return () => {
      this.closes.delete(handler);
    };
  }
  async drop(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
  }
  terminate(): void {
    this.socket?.terminate();
  }
}
const secret = () => {
  let n = 0;
  return () => Uint8Array.from({ length: 32 }, (_, i) => (++n + i) & 255);
};
async function until(check: () => boolean, limit = 5000): Promise<void> {
  const deadline = Date.now() + limit;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('relay session timeout');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
it('실제 ws 중계로 양측 20판, 끊김·토큰 복귀·원장 제로섬', async () => {
  const relay = await startRelay({ port: 0 });
  const connect = (role: Role) =>
    new RelayTransport(`ws://127.0.0.1:${relay.port}${RELAY_PATH}?role=${role}`);
  const hostWire = connect('host');
  const guestWire = connect('guest');
  try {
    const host = new HostSession(hostWire, {
      rules: PRESETS.standard,
      names: ['호스트', '게스트'],
      random32: secret(),
      startBalance: 1_000_000_000,
    });
    const guest = new GuestSession(guestWire, { name: '게스트', random32: secret() });
    guest.join();
    await until(() => host.state !== null);
    let rng = createPolicyRng(723);
    let dropped = false;
    let observedGap = false;
    let moves = 0;
    while (guest.verifiedRounds.length < 20 && moves++ < 3000) {
      await until(() => host.state !== null);
      await until(() => guest.seq === host.seq && guest.view?.round === host.roundNumber);
      const state = host.state!;
      const actions = [...legalActions(state, 0), ...legalActions(state, 1)];
      const chosen = randomPolicy.choose(actions, rng);
      rng = chosen.rng;
      const previous = host.state;
      if (!dropped && moves > 50 && chosen.action.seat === 0) {
        await guestWire.drop();
        host.apply(chosen.action);
        observedGap = guest.seq < host.seq;
        guest.rejoin();
        dropped = true;
      } else if (chosen.action.seat === 0) host.apply(chosen.action);
      else guest.sendAction(chosen.action);
      await until(() => host.state !== previous);
      await until(() => guest.seq === host.seq);
      expect(host.ledger.balances[0] + host.ledger.balances[1]).toBe(2_000_000_000);
      expect(guest.errors).toEqual([]);
    }
    await until(() => guest.verifiedRounds.length === 20);
    expect(dropped).toBe(true);
    expect(observedGap).toBe(true);
    expect(host.roundNumber).toBe(21);
  } finally {
    hostWire.terminate();
    guestWire.terminate();
    await relay.close();
  }
}, 60_000);
