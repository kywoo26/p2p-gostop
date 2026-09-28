// 실제 ws 중계(relay-dev) 위에서 호스트·게스트 세션 20판 (M4 AC-04 성격, 리뷰 T-1·T-2·T-6).
// 게스트는 자기 BoardView.legal에서만 수를 고르고, 판 사이 대기(settled → ready → nextRound)를 거친다.
// 도중에: 판 중간 끊김, 판 사이 핸드셰이크 중 끊김, 게스트 탭 교체(4001, 저장본 복원), 호스트 재시작(저장본 복원).
import { PRESETS } from '@p2p-gostop/engine';
import {
  GuestSession,
  HostSession,
  RELAY_CLOSE_REPLACED,
  RELAY_PATH,
  isRelayFrame,
  parseRelayNotice,
  tryEncode,
  type GuestSessionState,
  type HostSessionState,
  type Message,
  type RelayNotice,
  type Role,
  type Transport,
} from '@p2p-gostop/protocol';
import { isDeepStrictEqual } from 'node:util';
import { expect, it } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import { startRelay } from '../src/index.ts';

/** WsTransport와 같은 규칙의 Node 전송: 중계 알림을 가로채고, 4001이면 멈춘다 */
class RelayTransport implements Transport {
  private readonly url: string;
  private socket: WebSocket | null = null;
  private queue: Message[] = [];
  private readonly messages = new Set<(raw: string) => void>();
  private readonly closes = new Set<() => void>();
  private readonly relays = new Set<(notice: RelayNotice) => void>();
  stopped = false;
  closeCodes: number[] = [];
  constructor(url: string) {
    this.url = url;
    this.open();
  }
  private open(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.on('open', () => {
      for (const m of this.queue.splice(0)) this.write(socket, m);
    });
    socket.on('message', (data: RawData) => {
      if (this.socket !== socket) return;
      const raw = Array.isArray(data)
        ? Buffer.concat(data).toString('utf8')
        : (data instanceof ArrayBuffer ? Buffer.from(data) : data).toString('utf8');
      if (isRelayFrame(raw)) {
        const notice = parseRelayNotice(raw);
        if (notice) for (const handler of this.relays) handler(notice);
        return;
      }
      for (const handler of this.messages) handler(raw);
    });
    socket.on('close', (code) => {
      this.closeCodes.push(code);
      if (this.socket !== socket) return;
      this.socket = null;
      if (code === RELAY_CLOSE_REPLACED) this.stopped = true;
      for (const handler of this.closes) handler();
    });
    socket.on('error', () => {});
  }
  private write(socket: WebSocket, message: Message): void {
    const encoded = tryEncode(message);
    if (encoded.ok) socket.send(encoded.value);
  }
  reconnect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.stopped = false;
    this.open();
  }
  send(message: Message): void {
    if (this.stopped) return;
    if (this.socket?.readyState === WebSocket.OPEN) this.write(this.socket, message);
    else this.queue.push(message);
  }
  onMessage(handler: (raw: string) => void): () => void {
    this.messages.add(handler);
    return () => this.messages.delete(handler);
  }
  onClose(handler: () => void): () => void {
    this.closes.add(handler);
    return () => this.closes.delete(handler);
  }
  onRelay(handler: (notice: RelayNotice) => void): () => void {
    this.relays.add(handler);
    return () => this.relays.delete(handler);
  }
  async drop(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
  }
  /** 프로세스 사망: 핸들러를 떼고 소켓을 강제로 끊는다 */
  kill(): void {
    this.messages.clear();
    this.closes.clear();
    this.relays.clear();
    this.stopped = true;
    this.socket?.terminate();
  }
}

/** JSON 왕복 (호스트·게스트 저장소에 문자열로 두었다가 읽는 것과 같다) */
function viaJson<T>(value: T): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(JSON.stringify(value)) as T;
}
const secret = (start: number) => {
  let n = start;
  return () => Uint8Array.from({ length: 32 }, (_, i) => (++n * 13 + i) & 255);
};
let seed = 723;
const pick = <T>(items: readonly T[]): T | undefined => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return items[seed % Math.max(1, items.length)];
};
async function until(check: () => boolean, what: string, limit = 5000): Promise<void> {
  const deadline = Date.now() + limit;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`relay session timeout: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

it('실제 ws 중계로 20판: 게스트 자기 화면만으로 진행, 판 사이 대기, 끊김·핸드셰이크 끊김·탭 교체·호스트 재시작 복구, 원장 제로섬', async () => {
  const relay = await startRelay({ port: 0 });
  const connect = (role: Role) =>
    new RelayTransport(`ws://127.0.0.1:${relay.port}${RELAY_PATH}?role=${role}`);
  let hostWire = connect('host');
  let guestWire = connect('guest');
  const wires = [hostWire, guestWire];
  try {
    const newHost = (wire: RelayTransport, saved?: HostSessionState) => {
      const host = saved
        ? HostSession.fromJSON(wire, saved, { random32: secret(900_000) })
        : new HostSession(wire, {
            rules: PRESETS.standard,
            names: ['호스트', '게스트'],
            random32: secret(0),
            startBalance: 1_000_000_000,
          });
      host.onChange((h) => {
        hostSaved = viaJson(h.toJSON());
      });
      return host;
    };
    let hostSaved: HostSessionState | null = null;
    let host = newHost(hostWire);
    let guest = new GuestSession(guestWire, { name: '게스트', random32: secret(10_000) });
    let guestSaved: GuestSessionState = guest.toJSON();
    const watchGuest = () =>
      guest.onChange((g) => {
        guestSaved = viaJson(g.toJSON());
      });
    watchGuest();
    await until(() => host.stage === 'playing', '첫 판 시작');
    const synced = () =>
      guest.seq === host.seq &&
      guest.status?.rev === host.status.rev &&
      guest.epoch === host.epoch &&
      isDeepStrictEqual(guest.view, host.guestView());
    const done = new Set<string>();
    let moves = 0;
    let guestMoveCount = 0;
    let roundOfMoves = 0;
    const settledChecks: unknown[] = [];
    const restartEpochs: [string, string][] = [];
    const replacedCodes: number[] = [];
    let movesInRound = 0;
    while (guest.verifiedRounds.length < 20 && moves++ < 6000) {
      await until(synced, `동기화 (판 ${host.roundNumber}, ${host.stage})`);
      const round = host.roundNumber;
      if (host.stage === 'settled') {
        const shown = isDeepStrictEqual(guest.settlement, host.settlementView);
        await until(() => guest.checks.some((c) => c.round === round), `판 ${round} 검증`);
        settledChecks.push({ round, shown, check: guest.checks.at(-1) });
        if (guest.verifiedRounds.length === 20) break;
        guest.requestNextRound();
        await until(() => host.guestReady, 'ready');
        host.nextRound();
        if (round === 5 && !done.has('handshake-drop')) {
          // 판 사이 핸드셰이크 도중 끊김 (리뷰 R1)
          done.add('handshake-drop');
          await guestWire.drop();
          guestWire.reconnect();
        }
        await until(() => host.stage === 'playing', `판 ${round + 1} 분배`);
        continue;
      }
      expect(host.stage).toBe('playing');
      if (roundOfMoves !== round) {
        roundOfMoves = round;
        movesInRound = 0;
      }
      movesInRound++;
      if (round === 3 && movesInRound === 6 && !done.has('mid-drop')) {
        done.add('mid-drop');
        await guestWire.drop();
        const mine = host.hostView()!.legal;
        if (mine.length > 0) host.apply(pick(mine)!);
        guestWire.reconnect();
        continue;
      }
      if (round === 8 && !done.has('tab-replaced')) {
        // 같은 게스트의 새 탭(저장본 복원)이 접속해 옛 탭을 4001로 밀어낸다. 옛 탭은 재접속하지 않는다.
        done.add('tab-replaced');
        const old = guestWire;
        guestWire = connect('guest');
        wires.push(guestWire);
        guest = new GuestSession(guestWire, {
          name: '게스트',
          random32: secret(20_000),
          restore: guestSaved,
        });
        watchGuest();
        await until(() => old.stopped, '옛 탭 4001');
        replacedCodes.push(old.closeCodes.at(-1)!);
        continue;
      }
      if (round >= 12 && movesInRound === 5 && !done.has('host-restart')) {
        // 호스트 앱 재시작: 저장본으로 복원하고 새 소켓으로 붙는다(#25)
        done.add('host-restart');
        const oldEpoch = host.epoch;
        hostWire.kill();
        hostWire = connect('host');
        wires.push(hostWire);
        host = newHost(hostWire, hostSaved!);
        restartEpochs.push([oldEpoch, host.epoch]);
        continue;
      }
      const mine = host.hostView()!.legal;
      const theirs = guest.view?.legal ?? [];
      const before = host.state;
      if (mine.length > 0) host.apply(pick(mine)!);
      else {
        const action = pick(theirs);
        if (!action) throw new Error('게스트 화면에 합법 수 없음');
        guest.sendAction(action);
        guestMoveCount++;
        await until(
          () => host.state !== before,
          `게스트 액션 반영 ${JSON.stringify(action)} errors=${guest.errors.join(',')}`,
        );
      }
      expect(host.ledger.balances[0] + host.ledger.balances[1]).toBe(2_000_000_000);
    }
    await until(() => guest.verifiedRounds.length === 20, '20판 검증');
    expect([...done].toSorted()).toEqual([
      'handshake-drop',
      'host-restart',
      'mid-drop',
      'tab-replaced',
    ]);
    expect(guest.checks.filter((c) => c.result === 'failed')).toEqual([]);
    expect(settledChecks).toEqual(
      Array.from({ length: 20 }, (_, i) => ({
        round: i + 1,
        shown: true,
        check: { round: i + 1, result: 'verified' },
      })),
    );
    expect(replacedCodes).toEqual([RELAY_CLOSE_REPLACED]);
    expect(restartEpochs).toHaveLength(1);
    expect(restartEpochs[0]![0]).not.toBe(restartEpochs[0]![1]);
    expect(guest.errors.filter((e) => e === 'COMMIT_INVALID')).toEqual([]);
    expect(guestMoveCount).toBeGreaterThan(100);
    expect(host.roundNumber).toBe(20);
  } finally {
    for (const wire of wires) wire.kill();
    await relay.close();
  }
}, 60_000);
