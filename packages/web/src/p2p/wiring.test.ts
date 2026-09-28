// 호스트·게스트 화면 연결 (Vitest 브라우저 모드): 실제 protocol HostSession/GuestSession을 MemoryTransport로 잇고
// 화면 컨트롤러(HostGame·GuestGame)가 로비 → 판 → 정산 → 다음 판을 끝까지 도는지, 게스트가 호스트 손패를 못 보는지 본다.
// 애니메이션 없이(보드 루트를 붙이지 않음) 재생 큐만 돈다. 두 좌석 모두 화면에 보이는 합법 수에서만 무작위로 고른다.
import { PRESETS, type Action, type CardId } from '@p2p-gostop/engine';
import { createMemoryTransportPair, type BoardView, type Message } from '@p2p-gostop/protocol';
import { expect, test } from 'vitest';
import type { GameController } from '../game/controller.ts';
import { GuestGame } from './guest.svelte.ts';
import { HostGame, type HostConfig } from './host.svelte.ts';
import type { GuestTicket } from './ticket.ts';

const CONFIG: HostConfig = {
  preset: 'standard',
  rules: PRESETS.standard,
  perPoint: 100,
  startBalance: 1_000_000_000,
  hostName: '호스트',
};

function lcg(seed: number) {
  let x = seed >>> 0;
  return (n: number) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x % n;
  };
}

/** 재생 큐가 모두 돌 때까지 (setTimeout·tick이 섞여 있어 매크로 태스크를 몇 번 넘긴다) */
async function settle(): Promise<void> {
  for (let i = 0; i < 2; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function legalOf(c: GameController): readonly Action[] {
  return c.playback.board.legal;
}

/** 게스트가 받은 메시지에서 좌석 0 손패로 보일 수 있는 카드 ID를 모은다 */
function cardsSeenByGuest(message: Message): { ids: CardId[]; handVisible: boolean } {
  const ids: CardId[] = [];
  let handVisible = false;
  const board = (view: BoardView) => {
    if (view.seats[0].hand !== null) handVisible = true;
    for (const g of view.floor) ids.push(...g.cards);
    for (const s of view.seats) {
      const c = s.captured;
      ids.push(...c.gwang, ...c.yeol, ...c.tti, ...c.pi, ...(s.hand ?? []));
    }
    if (view.inFlight.played !== null) ids.push(view.inFlight.played);
    ids.push(...view.inFlight.staged);
  };
  if (message.t === 'snapshot' || message.t === 'events') board(message.view);
  if (message.t === 'events') {
    // 규칙상 공개되는 카드는 뺀다: 선 고르기 후보(분배 때 덱을 다시 섞는다, engine deal.ts),
    // 흔들기로 보여 준 손패(E11), 총통을 끝낼 때 보여 준 4장(E13)
    const PUBLIC = new Set(['FirstPicked', 'FirstPickTie', 'Shake', 'Chongtong']);
    for (const e of message.list) if (!PUBLIC.has(e.type)) ids.push(...e.cards);
  }
  return { ids, handVisible };
}

test('로비 → 시작 → 여러 판: 양쪽 화면이 같은 원장·순번, 게스트는 호스트 손패를 못 본다 (AC-04 축소판, spec 4.5)', async () => {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const tickets: GuestTicket[] = [];
  const host = new HostGame({ config: CONFIG, transport: hostWire, clock: false, persist: false });
  const guest = new GuestGame({
    name: '민지',
    transport: guestWire,
    onTicket: (t) => tickets.push(t),
    persist: false,
  });

  // 게스트에게 가는 모든 메시지에서 그 순간 호스트 손패가 보이는지 검사한다
  const leaks: string[] = [];
  const session = () =>
    (host as unknown as { session: { state: { seats: { hand: CardId[] }[] } | null } | null })
      .session;
  const send = hostWire.send.bind(hostWire);
  hostWire.send = (message: Message) => {
    send(message);
    const hand = new Set(session()?.state?.seats[0]?.hand ?? []);
    const seen = cardsSeenByGuest(message);
    if (seen.handVisible) leaks.push(`${message.t}: hand array`);
    for (const id of seen.ids) if (hand.has(id)) leaks.push(`${message.t}: ${id}`);
  };

  await settle();
  // 로비: 이름·토큰이 오가고 아직 판은 없다
  expect(host.guestName).toBe('민지');
  expect(host.guestOnline).toBe(true);
  expect(guest.lobby?.names).toEqual(['호스트', '민지']);
  expect(guest.lobby?.ledger.startBalance).toBe(CONFIG.startBalance);
  expect(tickets.at(-1)?.token).toBe(host.token);
  expect(guest.phase).toBe('lobby');

  expect(host.start()).toBe(true);
  await settle();
  expect(host.phase).toBe('playing');
  expect(guest.phase).toBe('playing');

  const pick = lcg(7);
  const target = 4;
  let idle = 0;
  const describe = () =>
    JSON.stringify({
      host: {
        canAct: host.canAct,
        idle: host.playback.idle,
        busy: host.playback.busy,
        pending: host.playback.pending,
        settlement: host.playback.settlement !== null,
        legal: host.playback.board.legal.length,
        online: host.guestOnline,
        bankrupt: host.bankrupt,
        notice: host.notice,
        stats: host.stats,
      },
      guest: {
        canAct: guest.canAct,
        idle: guest.playback.idle,
        pending: guest.playback.pending,
        settlement: guest.playback.settlement !== null,
        legal: guest.playback.board.legal.length,
        notice: guest.notice,
        phase: guest.phase,
        stats: guest.stats,
      },
    });
  for (let step = 0; step < 4000; step++) {
    if (host.stats.roundsPlayed >= target && guest.stats.roundsPlayed >= target) break;
    if (host.playback.settlement !== null) host.nextRound();
    if (guest.playback.settlement !== null) guest.nextRound();
    let acted = false;
    for (const c of [host, guest] as const) {
      if (!c.canAct) continue;
      const legal = legalOf(c);
      const action = legal[pick(legal.length)];
      if (action === undefined) continue;
      expect(c.submit(action, performance.now())).toBe(true);
      acted = true;
      break;
    }
    await settle();
    idle = acted ? 0 : idle + 1;
    if (idle > 40) throw new Error(`진행 멈춤: ${describe()}`);
  }

  expect(host.stats.roundsPlayed).toBeGreaterThanOrEqual(target);
  expect(guest.stats.roundsPlayed).toBe(host.stats.roundsPlayed);
  // MN-01: 원장은 두 좌석 사이의 이동뿐이고 양쪽 화면이 같은 잔액을 본다
  const [a, b] = host.stats.balances;
  expect(a + b).toBe(CONFIG.startBalance * 2);
  expect(guest.stats.balances).toEqual(host.stats.balances);
  // NP-03: 순번이 끊기지 않고 같다
  expect(guest.stats.seq).toBe(host.stats.seq);
  expect(leaks).toEqual([]);
  // 정산 화면의 두 이름은 양쪽이 같다
  expect(host.records).toHaveLength(host.stats.roundsPlayed);

  host.dispose();
  guest.dispose();
}, 60_000);

test('게스트가 끊겼다 돌아오면 같은 토큰으로 재동기화하고 판이 이어진다 (spec 2.4, NF-05)', async () => {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostGame({ config: CONFIG, transport: hostWire, clock: false, persist: false });
  const guest = new GuestGame({
    name: '민지',
    transport: guestWire,
    onTicket: () => {},
    persist: false,
  });
  await settle();
  host.start();
  await settle();
  const pick = lcg(11);
  for (let step = 0; step < 30; step++) {
    for (const c of [host, guest] as const) {
      if (c.playback.settlement !== null) c.nextRound();
      if (!c.canAct) continue;
      const legal = legalOf(c);
      const action = legal[pick(legal.length)];
      if (action !== undefined) c.submit(action);
      break;
    }
    await settle();
  }
  const before = host.stats.seq;
  guestWire.disconnect();
  // 게스트가 없는 동안 호스트는 입력을 막는다 (게임은 게스트 부재 중 진행되지 않는다, spec 2.4)
  (host as unknown as { onRelay(n: object): void }).onRelay({ t: 'relay', peer: 'left' });
  expect(host.guestOnline).toBe(false);
  expect(host.canAct).toBe(false);
  expect(host.notice).toContain('연결 끊김');
  guestWire.reconnect();
  (host as unknown as { onRelay(n: object): void }).onRelay({ t: 'relay', peer: 'joined' });
  // GuestSession은 전송이 닫히면 hello를 다시 보낸다 (재접속 뒤 전달)
  (guest as unknown as { session: { join(): void } }).session.join();
  await settle();
  expect(host.guestOnline).toBe(true);
  expect(guest.stats.seq).toBe(host.stats.seq);
  expect(host.stats.seq ?? 0).toBeGreaterThanOrEqual(before ?? 0);
  host.dispose();
  guest.dispose();
}, 30_000);
