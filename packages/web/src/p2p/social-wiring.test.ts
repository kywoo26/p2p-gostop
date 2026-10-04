// AC-SC-02/03: 실제 HostGame/GuestGame의 social 분기와 기존 저장·권위 경계.
import { afterEach, expect, test, vi } from 'vitest';
import { createMemoryTransportPair, createQueuedTransportPair } from '@p2p-gostop/protocol';
import { PRESETS } from '@p2p-gostop/engine';
import { HostGame } from './host.svelte.ts';
import { GuestGame } from './guest.svelte.ts';
import { SocialConversation } from '../game/social-compose.ts';
const owned: { dispose(): void }[] = [];
afterEach(() => {
  for (const game of owned.splice(0)) game.dispose();
  vi.restoreAllMocks();
});
function pair() {
  const [a, b] = createMemoryTransportPair();
  let now = 0;
  const host = new HostGame({
    config: {
      hostName: '호스트',
      preset: 'standard',
      rules: PRESETS.standard,
      perPoint: 100,
      startBalance: 100000,
      timerDecisionMs: null,
    },
    transport: a,
    clock: false,
    persist: false,
    now: () => now,
  });
  const guest = new GuestGame({
    name: '게스트',
    transport: b,
    clock: false,
    persist: false,
    onTicket: () => {},
    now: () => now,
  });
  owned.push(host, guest);
  host.start();
  return {
    host,
    guest,
    a,
    b,
    advance: (ms: number) => {
      now += ms;
      host.tick();
      guest.tick();
    },
  };
}
test('양방향 text/emote/phrase는 게임 stats·원장·playback 큐·storage를 바꾸지 않는다', () => {
  const h = pair();
  const save = vi.spyOn(Storage.prototype, 'setItem');
  const stats = [h.host.stats, h.guest.stats];
  const boards = [h.host.playback.board, h.guest.playback.board];
  expect(h.host.social.send({ kind: 'text', text: '<b>안녕</b>' })).toBe(true);
  expect(h.guest.social.view.entries.at(-1)?.text).toBe('<b>안녕</b>');
  expect(h.guest.social.send({ kind: 'emote', id: 'smile' })).toBe(true);
  expect(h.host.social.view.entries.at(-1)?.text).toBe('미소');
  expect([h.host.stats, h.guest.stats]).toEqual(stats);
  expect([h.host.playback.board, h.guest.playback.board]).toEqual(boards);
  expect(save).not.toHaveBeenCalled();
  h.advance(5000);
  expect(h.host.social.send({ kind: 'phrase', id: 'hello' })).toBe(true);
  expect(h.guest.social.view.entries.at(-1)?.text).toBe('안녕하세요');
});
test('mute는 표시를 즉시 지우며 old nonce/복귀 뒤 옛 본문을 표시하지 않는다', () => {
  const h = pair();
  h.advance(5000); // 초기 ready2/5s 이후의 정상 mute 광고. rate를 초기화하지 않는다.
  expect(h.host.social.send({ kind: 'text', text: '첫 문장' })).toBe(true);
  h.guest.social.mute(true);
  expect(h.guest.social.view.entries).toEqual([]);
  h.advance(5000);
  expect(h.host.social.send({ kind: 'text', text: '꺼진 문장' })).toBe(false);
  h.guest.social.mute(false);
  expect(h.guest.social.view.entries).toEqual([]);
  expect(h.host.social.send({ kind: 'text', text: '새 문장' })).toBe(true);
  expect(h.guest.social.view.entries.at(-1)?.text).toBe('새 문장');
});
test('disconnect/숨김 context는 수신 nonce를 폐기하고 새 연결만 유한 ready를 보낸다', () => {
  let i = 0;
  const frames: unknown[] = [];
  let view: unknown;
  const social = new SocialConversation({
    nonce: () => (++i).toString(16).padStart(32, '0'),
    now: () => 0,
    send: (frame) => {
      frames.push(frame);
      return true;
    },
    publish: (next) => {
      view = next;
    },
  });
  const context = { epoch: 'epoch', authenticated: true, connected: true, visible: true };
  social.sync(context);
  const first = frames[0];
  social.sync(context);
  expect(frames).toHaveLength(1);
  social.sync({ ...context, visible: false });
  expect(social.send({ kind: 'text', text: '대기' })).toBe(false);
  social.sync(context);
  expect(frames).toHaveLength(2);
  expect(frames[1]).not.toEqual(first);
  expect(view).toBeDefined();
});
test('offline send 실패는 게임 reconnect/queue를 만들지 않으며 expiry 뒤 표시가 사라진다', () => {
  const h = pair();
  expect(h.host.social.send({ kind: 'text', text: '임시' })).toBe(true);
  h.b.disconnect();
  h.advance(10000);
  expect(h.guest.social.view.entries).toEqual([]);
  const reconnect = vi.spyOn(h.a, 'reconnect');
  expect(h.host.social.send({ kind: 'text', text: 'offline' })).toBe(false);
  expect(reconnect).not.toHaveBeenCalled();
});

for (const role of ['host', 'guest'] as const) {
  test(`개별 ${role} wrapper tick의 visible 복귀는 상대 open없이 사회표현을 복구한다`, () => {
    const h = pair();
    h.advance(5000);
    // 이 단위 fixture는 두 wrapper가 한 Document에 있다. 해당 쪽 tick만 실행해
    // 한쪽 context 변경을 검사한다. 실제 Guest visibility→join/resync E2E의 대용은 아니다.
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    h[role].tick();
    expect(h[role].social.view.available).toBe(false);
    visibility.mockReturnValue('visible');
    h[role].tick();
    expect(h.host.social.view.available).toBe(true);
    expect(h.guest.social.view.available).toBe(true);
    const stats = [h.host.stats, h.guest.stats];
    const boards = [h.host.playback.board, h.guest.playback.board];
    const save = vi.spyOn(Storage.prototype, 'setItem');
    expect(h.host.social.send({ kind: 'phrase', id: 'hello' })).toBe(true);
    expect(h.guest.social.send({ kind: 'emote', id: 'smile' })).toBe(true);
    expect(h.guest.social.view.entries.at(-1)?.text).toBe('안녕하세요');
    expect(h.host.social.view.entries.at(-1)?.text).toBe('미소');
    expect([h.host.stats, h.guest.stats]).toEqual(stats);
    expect([h.host.playback.board, h.guest.playback.board]).toEqual(boards);
    expect(save).not.toHaveBeenCalled();
  });
}
test('guest 단독 연결 복귀의 기존 join/snapshot 뒤 ready는 상대 open없이 복구한다', () => {
  const h = pair();
  h.advance(5000);
  h.b.disconnect();
  expect(h.guest.social.view.available).toBe(false);
  h.b.reconnect();
  h.guest.reconnect(); // 기존 재인증/복구 경로이며 제품 social이 hello를 생성하지 않는다.
  expect(h.host.social.view.available).toBe(true);
  expect(h.guest.social.view.available).toBe(true);
  const stats = [h.host.stats, h.guest.stats];
  const boards = [h.host.playback.board, h.guest.playback.board];
  const save = vi.spyOn(Storage.prototype, 'setItem');
  expect(h.guest.social.send({ kind: 'text', text: '돌아옴' })).toBe(true);
  expect(h.host.social.view.entries.at(-1)?.text).toBe('돌아옴');
  expect(h.host.social.send({ kind: 'emote', id: 'smile' })).toBe(true);
  expect(h.guest.social.view.entries.at(-1)?.text).toBe('미소');
  expect([h.host.stats, h.guest.stats]).toEqual(stats);
  expect([h.host.playback.board, h.guest.playback.board]).toEqual(boards);
  expect(save).not.toHaveBeenCalled();
});

for (const role of ['host', 'guest'] as const) {
  test(`초기예산 직후 ${role} mute/unmute 광고 유실은 그쪽 open1회로 양방향 수신 복구`, () => {
    const h = pair(); // 시각0 초기 ready 교환. 준비5초 이동0.
    const other = role === 'host' ? h.guest : h.host;
    const stats = [h.host.stats, h.guest.stats];
    const boards = [h.host.playback.board, h.guest.playback.board];
    const save = vi.spyOn(Storage.prototype, 'setItem');
    const control = h[role].social;
    const open = vi.spyOn(control, 'open');
    const outbound = vi.spyOn(role === 'host' ? h.a : h.b, 'sendEphemeral');
    const inbound = vi.spyOn(role === 'host' ? h.b : h.a, 'sendEphemeral');
    const outgoingReady = () =>
      outbound.mock.calls.map(([frame]) => frame).filter((frame) => frame.t === 'socialReady');
    const incomingReady = () =>
      inbound.mock.calls.map(([frame]) => frame).filter((frame) => frame.t === 'socialReady');
    // 순차 wrapper setup의 초기 수신은 2/1일 수 있다. 변경쪽의 동일 nonce 광고로
    // 상대의 남은 슬롯만 t=0에 소비한다. 양쪽 open/5초 준비/예산 초기화0.
    control.open();
    expect(open).toHaveBeenCalledTimes(1); // t=0 준비 open만.
    expect(outgoingReady()).toHaveLength(1);
    expect(incomingReady()).toHaveLength(0); // 현재 nonce 재광고는 응답0.
    const initialNonce = outgoingReady()[0]!.receiveNonce;
    expect(initialNonce).not.toBeNull();
    expect(h.host.social.view.available).toBe(true);
    expect(h.guest.social.view.available).toBe(true);
    h.advance(1);
    h[role].social.mute(true);
    expect(h[role].social.view.muted).toBe(true);
    h.advance(1);
    h[role].social.mute(false);
    expect(outgoingReady()).toHaveLength(3); // 준비1 + mute-null1 + unmute1.
    expect(outgoingReady()[1]!.receiveNonce).toBeNull();
    const freshNonce = outgoingReady()[2]!.receiveNonce;
    expect(freshNonce).not.toBeNull();
    expect(freshNonce).not.toBe(initialNonce);
    expect(incomingReady()).toHaveLength(0); // t=1/2 광고는 상대 예산에 막힘.
    expect(h.host.social.view.available).toBe(true);
    expect(h.guest.social.view.available).toBe(true);
    expect(other.social.send({ kind: 'text', text: '옛 창구' })).toBe(true);
    const oldBody = inbound.mock.calls
      .map(([frame]) => frame)
      .find((frame) => frame.t === 'social')!;
    expect(oldBody.toNonce).toBe(initialNonce); // 준비 open도 기존 nonce를 회전시키지 않음.
    expect(h[role].social.view.entries).toEqual([]); // 실제 구 nonce 폐기.
    h.advance(4998); // 총5000, 기존 rate 경계 회복만.
    control.open();
    expect(open).toHaveBeenCalledTimes(2); // 준비1과 복구1. 상대 open0.
    expect(outgoingReady()).toHaveLength(4);
    expect(outgoingReady()[3]!.receiveNonce).toBe(freshNonce); // 복구 open은 회전0.
    expect(incomingReady()).toHaveLength(1); // 복구 현재 광고에 대한 응답1, loop0.
    expect(other.social.send({ kind: 'emote', id: 'thanks' })).toBe(true);
    expect(h[role].social.send({ kind: 'text', text: '복구된 창구' })).toBe(true);
    expect(h[role].social.view.entries.at(-1)?.text).toBe('감사');
    expect(other.social.view.entries.at(-1)?.text).toBe('복구된 창구');
    expect([h.host.stats, h.guest.stats]).toEqual(stats);
    expect([h.host.playback.board, h.guest.playback.board]).toEqual(boards);
    expect(save).not.toHaveBeenCalled();
  });
}

test('새 GuestGame 복귀의 제한 폐기·5초 경계 명시 open/새 송신은 게임과 저장을 바꾸지 않는다', async () => {
  const [a, b, link] = createQueuedTransportPair();
  let now = 0;
  let token: string | null = null;
  const host = new HostGame({
    config: {
      hostName: '호스트',
      preset: 'standard',
      rules: PRESETS.standard,
      perPoint: 100,
      startBalance: 100000,
      timerDecisionMs: 10000,
    },
    transport: a,
    clock: false,
    persist: false,
    now: () => now,
  });
  const makeGuest = () =>
    new GuestGame({
      name: '게스트',
      token,
      transport: b,
      clock: false,
      persist: false,
      now: () => now,
      onTicket: (ticket) => {
        token = ticket.token;
      },
    });
  const previous = makeGuest();
  owned.push(host, previous);
  const flush = () => {
    link.flush(128);
    expect(link.queue).toHaveLength(0);
  };
  const at = (value: number, guest: GuestGame) => {
    now = value;
    host.tick();
    guest.tick();
    flush();
  };
  const footprint = (guest: GuestGame) => ({
    seq: [host.stats.seq, guest.stats.seq],
    balances: [host.stats.balances, guest.stats.balances],
    playback: [host.playback.pending, guest.playback.pending],
    clock:
      host.decisionClock === null
        ? null
        : {
            state: host.decisionClock.state,
            remainingMs: host.decisionClock.remainingMs,
            attempt: host.decisionClock.attempt,
            decisionId: host.decisionClock.key.decisionId,
          },
  });
  link.notify(0, 'joined');
  link.notify(1, 'present');
  flush();
  expect(host.start()).toBe(true);
  flush();
  // pickFirst에는 시계가 없다. 공개 입력 경로로 양쪽 첫 선택과 표시 완료를 준비한다.
  for (const actor of [host, previous]) {
    await vi.waitFor(() => expect(actor.canAct).toBe(true));
    const first = actor.playback.board.legal.find((action) => action.type === 'pickFirst');
    expect(first).toBeDefined();
    expect(actor.submit(first!)).toBe(true);
    flush();
  }
  await vi.waitFor(() =>
    expect([host.playback.idle, previous.playback.idle]).toEqual([true, true]),
  );
  host.decisionRendered();
  previous.decisionRendered();
  flush();
  expect(host.decisionClock?.state).toBe('running');
  expect(host.decisionClock?.remainingMs).toBe(10000);
  const save = vi.spyOn(Storage.prototype, 'setItem');
  const initial = footprint(previous);
  expect(previous.social.send({ kind: 'emote', id: 'smile' })).toBe(true);
  const old = link.queue[0]!.raw;
  flush();
  expect(host.social.view.entries.at(-1)?.text).toBe('미소');
  expect(footprint(previous)).toEqual(initial);
  at(2000, previous);
  const beforeSecond = footprint(previous);
  expect(previous.social.send({ kind: 'phrase', id: 'hello' })).toBe(true);
  flush();
  expect(host.social.view.entries).toHaveLength(2);
  expect(footprint(previous)).toEqual(beforeSecond);
  now = 2001;
  previous.dispose();
  b.reset();
  link.notify(0, 'left');
  b.reconnect();
  const guest = makeGuest();
  owned.push(guest);
  link.notify(0, 'joined');
  link.notify(1, 'present');
  flush();
  await vi.waitFor(() => expect([host.playback.idle, guest.playback.idle]).toEqual([true, true]));
  host.decisionRendered();
  guest.decisionRendered();
  flush();
  expect(guest.social.view.available).toBe(true);
  expect(host.social.view.available).toBe(false); // ready2/5s는 auth 복귀에도 환급0.
  const restored = footprint(guest);
  const send = vi.spyOn(b, 'sendEphemeral');
  expect(guest.social.send({ kind: 'text', text: '빠른 복귀' })).toBe(true);
  flush();
  expect(host.social.view.entries).toEqual([]); // socket 수락은 receiver 수신 성공이 아니다.
  expect(footprint(guest)).toEqual(restored);
  at(4999, guest);
  expect(host.social.view.entries).toEqual([]);
  expect(send.mock.calls.filter(([frame]) => frame.t === 'social')).toHaveLength(1);
  at(5000, guest);
  const boundary = footprint(guest);
  const open = vi.spyOn(SocialConversation.prototype, 'open');
  guest.social.open();
  flush();
  expect(open).toHaveBeenCalledTimes(1);
  expect(host.social.view.available).toBe(true);
  expect(host.social.view.entries).toEqual([]); // 과거 본문 queue/retry0.
  expect(guest.social.send({ kind: 'text', text: '새 명시 송신' })).toBe(true);
  flush();
  expect(host.social.view.entries.at(-1)?.text).toBe('새 명시 송신');
  expect(host.social.send({ kind: 'emote', id: 'thanks' })).toBe(true);
  flush();
  expect(guest.social.view.entries.at(-1)?.text).toBe('감사');
  expect(send.mock.calls.filter(([frame]) => frame.t === 'social')).toHaveLength(2);
  expect(footprint(guest)).toEqual(boundary);
  at(7000, guest);
  const beforeOld = footprint(guest);
  const entries = host.social.view.entries;
  link.inject(0, old);
  flush();
  expect(host.social.view.entries).toEqual(entries);
  expect(footprint(guest)).toEqual(beforeOld);
  expect(save).not.toHaveBeenCalled();
});
