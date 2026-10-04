// AC-SC-02/03: 기존 인증·복구와 게임 상태는 사회표현과 독립이다.
import { describe, expect, it } from 'vitest';
import { PRESETS } from '@p2p-gostop/engine';
import {
  HostSession,
  GuestSession,
  createMemoryTransportPair,
  createQueuedTransportPair,
  decode,
  encode,
  PROTOCOL_VERSION,
  type SocialMessage,
} from '../src/index.ts';
import { secrets } from './helpers.ts';
const ready: SocialMessage = {
  t: 'socialReady',
  epoch: 'social-fixture',
  receiveNonce: 'a'.repeat(32),
};
function setup() {
  const [hw, gw] = createMemoryTransportPair();
  const host = new HostSession(hw, {
    rules: PRESETS.standard,
    names: ['호스트', '게스트'],
    random32: secrets(0),
    timerSettings: { decisionMs: 10000, policy: 'fixed-v1' },
  });
  const guest = new GuestSession(gw, { name: '게스트', random32: secrets(5000) });
  return { hw, gw, host, guest };
}
describe('wire5 사회표현 session 격리', () => {
  it('wire5 양방향 codec, strict unknown field/잘못된 Unicode/상한을 거절한다', () => {
    expect(PROTOCOL_VERSION).toBe(5);
    for (const role of ['host', 'guest'] as const) {
      expect(
        role === 'host' ? decode(encode(ready), 'host') : decode(encode(ready), 'guest'),
      ).toEqual({ ok: true, message: ready });
    }
    const content = {
      t: 'social',
      epoch: 'x',
      toNonce: 'b'.repeat(32),
      socialSeq: 1,
      body: { kind: 'text', text: '안녕' },
    } as const;
    expect(decode(JSON.stringify(content), 'host').ok).toBe(true);
    expect(decode(JSON.stringify({ ...content, seq: 9 }), 'host').ok).toBe(false);
    expect(
      decode(JSON.stringify({ ...content, body: { kind: 'text', text: '\ud800' } }), 'host').ok,
    ).toBe(false);
    expect(
      decode(
        JSON.stringify({ ...content, body: { kind: 'text', text: 'a'.repeat(2100) } }),
        'guest',
      ),
    ).toEqual({ ok: false, reason: 'TOO_LARGE' });
  });
  it('구버전 hello/welcome 양방향은 명시 VERSION_MISMATCH다', () => {
    expect(decode('{"t":"hello","v":4,"name":"게스트"}', 'guest')).toEqual({
      ok: false,
      reason: 'VERSION_MISMATCH',
    });
    expect(decode('{"t":"welcome","v":4}', 'host')).toEqual({
      ok: false,
      reason: 'VERSION_MISMATCH',
    });
  });
  it('인증 전 사회표현은 인증/활동/연결/저장·error callback을 바꾸지 않는다', () => {
    const { hw, gw, host, guest } = setup();
    const before = [host.toJSON(), guest.toJSON()];
    let changes = 0;
    host.onChange(() => changes++);
    guest.onChange(() => changes++);
    hw.sendEphemeral?.(ready);
    gw.sendEphemeral?.(ready);
    expect(host.authenticated).toBe(false);
    expect(guest.socialAuthenticated).toBe(false);
    expect([host.toJSON(), guest.toJSON()]).toEqual(before);
    expect(changes).toBe(0);
    expect(host.guestLogs).toEqual([]);
  });
  it('인증 후 valid/malformed/unknown 사회표현은 seq·원장·시한·save callback을 바꾸지 않는다', () => {
    const { hw, gw, host, guest } = setup();
    guest.join();
    expect(host.authenticated).toBe(true);
    expect(guest.socialAuthenticated).toBe(true);
    const before = [host.toJSON(), guest.toJSON(), host.decisionClock];
    let changes = 0;
    host.onChange(() => changes++);
    guest.onChange(() => changes++);
    const frame = { ...ready, epoch: host.epoch };
    hw.sendEphemeral?.(frame);
    gw.sendEphemeral?.(frame);
    host.receive('{"t":"social","epoch":"wrong","body":{}}');
    gw.send({ ...frame, t: 'socialReady', receiveNonce: null });
    expect([host.toJSON(), guest.toJSON(), host.decisionClock]).toEqual(before);
    expect(changes).toBe(0);
  });
  it('disconnect에서 즉시 송신 실패하고 reconnect가 옛 사회표현을 복원하지 않는다', () => {
    const [a, b] = createMemoryTransportPair();
    const received: string[] = [];
    b.onMessage((raw) => received.push(raw));
    b.disconnect();
    expect(a.sendEphemeral?.(ready)).toBe(false);
    b.reconnect();
    expect(received).toEqual([]);
    expect(a.sendEphemeral?.(ready)).toBe(true);
    expect(received).toHaveLength(1);
  });
  it('queued test link도 양쪽 disconnect에서 사회표현을 보관하지 않는다', () => {
    const [a, b, link] = createQueuedTransportPair();
    expect(a.sendEphemeral?.(ready)).toBe(true);
    b.disconnect();
    expect(link.queue).toEqual([]);
    expect(a.sendEphemeral?.(ready)).toBe(false);
    b.reconnect();
    expect(link.queue).toEqual([]);
  });
});

it('사회표현을 보내도 기존 60초 부재 판정이 연장되지 않는다', () => {
  const { gw, host, guest } = setup();
  guest.join();
  host.advanceTime(30000);
  gw.sendEphemeral?.({ ...ready, epoch: host.epoch });
  host.advanceTime(60001);
  expect(host.connected).toBe(false);
});
