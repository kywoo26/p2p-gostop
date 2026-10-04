// AC-SC-01: 독립 공개 검증/유한 수명 반례. 세션/소켓/게임 RNG를 만들지 않는다.
import { expect, test } from 'vitest';
import {
  parseSocialMessage,
  socialByteLength,
  validateSocialBody,
  validateSocialText,
  SocialChannel,
  SocialRate,
  type SocialContext,
  type SocialFrame,
  type SocialReadyFrame,
} from '../src/social.ts';
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const split = (text: string) => Array.from(segmenter.segment(text), (part) => part.segment);
const context: SocialContext = {
  epoch: 'current',
  authenticated: true,
  connected: true,
  visible: true,
  muted: false,
};
const local = 'a'.repeat(32);
const remote = 'b'.repeat(32);
const textFrame = (text = '안녕하세요', seq = 1, nonce = local): SocialFrame => ({
  t: 'social',
  epoch: context.epoch,
  toNonce: nonce,
  socialSeq: seq,
  body: { kind: 'text', text },
});
function channel() {
  let generation = 0;
  return new SocialChannel({ split, nonce: () => (++generation).toString(16).padStart(32, '0') });
}

for (const [text, expectedBytes] of [
  ['안녕하세요', 15],
  ['한글', 6],
  ['👨‍👩‍👧‍👦', 25],
  ['👍🏽', 8],
  ['🇰🇷', 8],
  ['a\u0301', 2],
  ['مرحبا', 10],
  ['می\u200cخواهم', 17],
  ['\u{1f3f4}\u{e0067}\u{e0062}\u{e007f}', 16],
] as const) {
  test(`Unicode 정상: ${text}`, () => {
    const result = validateSocialText(text, split);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('유효 입력 거부');
    expect(result.text).toBe(text.normalize('NFC'));
    expect(result.graphemes).toBe(split(result.text).length);
    expect(result.bytes).toBe(expectedBytes);
  });
}
test('grapheme80/81·scalar320/321·UTF8 1024/1025는 독립 상한이다', () => {
  expect(validateSocialText('가'.repeat(80), split).ok).toBe(true);
  expect(validateSocialText('가'.repeat(81), split)).toEqual({ ok: false, reason: 'graphemes' });
  const atScalars = 'x' + '\u0301'.repeat(319);
  expect(validateSocialText(atScalars, split).ok).toBe(true); // NFC x́는 분해 상태 그대로다.
  expect(validateSocialText(atScalars + '\u0301', split)).toEqual({ ok: false, reason: 'scalars' });
  const bytes1024 = '😀' + '\u{1d165}'.repeat(255);
  expect(socialByteLength(bytes1024)).toBe(1024);
  expect(validateSocialText(bytes1024, split).ok).toBe(true);
  expect(validateSocialText(bytes1024 + 'a', split)).toEqual({ ok: false, reason: 'bytes' });
  // 분해형 raw 712 UTF-16 unit도 NFC 후에는 80 grapheme/276 scalar/1024 byte다.
  const decomposed = 'α\u0313\u0300\u0345'.repeat(80) + '\u{1d165}'.repeat(196);
  const normalized = validateSocialText(decomposed, split);
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) throw new Error('합법 분해 문자 거부');
  expect([normalized.graphemes, normalized.scalars, normalized.bytes]).toEqual([80, 276, 1024]);
});
for (const bad of ['\ud800', '\udc00', ' \u200d ', '\u0301', '', '  ']) {
  test(`비정상 Unicode/빈 내용 거절 ${JSON.stringify(bad)}`, () => {
    expect(validateSocialText(bad, split).ok).toBe(false);
  });
}
for (const control of [
  '\0',
  '\t',
  '\n',
  '\r',
  '\u0085',
  '\u2028',
  '\u2029',
  '\u202e',
  '\u2066',
  '\u200b',
  '\ufeff',
  '\u00ad',
  '\u{e0067}',
  '\u{e007f}',
]) {
  test(`제어문자 거절 U+${control.codePointAt(0)!.toString(16)}`, () => {
    expect(validateSocialText(`가${control}나`, split)).toEqual({ ok: false, reason: 'control' });
  });
}
test('분할기 누락/예외/잘못된 결과는 길이 검증을 생략하지 않는다', () => {
  expect(
    validateSocialText('가', () => {
      throw new Error('분할 미지원');
    }),
  ).toEqual({ ok: false, reason: 'segmentation' });
  expect(validateSocialText('가', () => []).ok).toBe(false);
  expect(validateSocialText('가', () => ['', '가']).ok).toBe(false);
});
test('body3종과 frame2048 상한·unknown/추가field/nonce/seq 거절', () => {
  expect(validateSocialBody({ kind: 'emote', id: 'smile' }, split)).toEqual({
    kind: 'emote',
    id: 'smile',
  });
  expect(validateSocialBody({ kind: 'phrase', id: 'hello' }, split)).toEqual({
    kind: 'phrase',
    id: 'hello',
  });
  expect(parseSocialMessage(JSON.stringify(textFrame()), split)).toEqual(textFrame());
  for (const invalid of [
    { ...textFrame(), seq: 1 },
    { ...textFrame(), toNonce: 'short' },
    { ...textFrame(), socialSeq: 0 },
    { ...textFrame(), body: { kind: 'emote', id: 'unknown' } },
    { ...textFrame(), body: { kind: 'text', text: '가', html: true } },
    { t: 'socialReady', epoch: 'current', receiveNonce: remote, senderSeat: 0 },
  ])
    expect(parseSocialMessage(JSON.stringify(invalid), split)).toBeNull();
  const raw = JSON.stringify(textFrame());
  expect(parseSocialMessage(raw + ' '.repeat(2048 - socialByteLength(raw)), split)).not.toBeNull();
  expect(parseSocialMessage(raw + ' '.repeat(2049 - socialByteLength(raw)), split)).toBeNull();
});
test('rate2/5s·clockback·NaN 반례, 경계에서만 예산 회복', () => {
  const rate = new SocialRate();
  expect(rate.take(10_000)).toBe(true);
  expect(rate.take(10_000)).toBe(true);
  expect(rate.take(0)).toBe(false);
  expect(rate.take(Number.NaN)).toBe(false);
  expect(rate.take(14_999)).toBe(false);
  expect(rate.take(15_000)).toBe(true);
});
test('인증 전/숨김은 nonce 발급·수신0, ready 유실은 송신 보관0', () => {
  const c = channel();
  expect(c.setContext({ ...context, authenticated: false })).toBeNull();
  expect(c.canSend()).toBe(false);
  expect(c.receive(JSON.stringify(textFrame()), 0)).toBeNull();
  c.setContext(context);
  expect(c.canSend()).toBe(false);
  expect(c.prepare({ kind: 'text', text: '가' }, 0)).toBeNull();
  c.receive(JSON.stringify({ t: 'socialReady', epoch: context.epoch, receiveNonce: remote }), 0);
  expect(c.canSend()).toBe(true);
  expect(c.prepare({ kind: 'text', text: '나' }, 0)?.body).toEqual({ kind: 'text', text: '나' });
  expect(c.prepare({ kind: 'text', text: '다' }, 1999)).toBeNull();
  expect(c.prepare({ kind: 'text', text: '다' }, 2000)?.socialSeq).toBe(2);
});
test('duplicate/old nonce·ready가 content budget을 대신하지 않는다', () => {
  const c = channel();
  const ready = c.setContext(context)!;
  const first = { ...textFrame(), toNonce: ready.receiveNonce! };
  expect(c.receive(JSON.stringify(first), 0)?.announce).toBe(true);
  expect(c.receive(JSON.stringify(first), 1)).toBeNull();
  c.receive(JSON.stringify({ t: 'socialReady', epoch: 'current', receiveNonce: remote }), 2);
  expect(
    c.receive(
      JSON.stringify({ ...first, socialSeq: 2, body: { kind: 'text', text: 'socialReady' } }),
      3,
    ),
  ).toBeNull();
  expect(c.visible(4)).toHaveLength(1);
  const renewed = c.refreshReady()!;
  expect(renewed.receiveNonce).not.toBe(ready.receiveNonce);
  expect(c.receive(JSON.stringify({ ...first, socialSeq: 3 }), 5000)).toBeNull();
});
test('최신2개·expiry10초·AT5초·mute/unmute 뒤 옛packet/표현0', () => {
  const c = channel();
  const ready = c.setContext(context)!;
  const frame = (seq: number) =>
    JSON.stringify({ ...textFrame('가', seq), toNonce: ready.receiveNonce });
  expect(c.receive(frame(1), 0)?.announce).toBe(true);
  expect(c.receive(frame(2), 2000)?.announce).toBe(false);
  expect(c.receive(frame(3), 5000)?.announce).toBe(true);
  expect(c.visible(5000).map((entry) => entry.id)).toEqual([2, 3]);
  expect(c.visible(12000).map((entry) => entry.id)).toEqual([3]);
  expect(c.setContext({ ...context, muted: true })?.receiveNonce).toBeNull();
  expect(c.visible(12000)).toEqual([]);
  expect(c.receive(frame(4), 13000)).toBeNull();
  const again = c.setContext(context)!;
  expect(again.receiveNonce).not.toBe(ready.receiveNonce);
  expect(c.receive(frame(5), 16000)).toBeNull();
});
test('mute/unmute와 연결 재설정은 송수신·AT 예산 우회가 아니다', () => {
  const c = channel();
  const ready = c.setContext(context)!;
  c.receive(JSON.stringify({ t: 'socialReady', epoch: 'current', receiveNonce: remote }), 0);
  expect(c.prepare({ kind: 'phrase', id: 'hello' }, 0)).not.toBeNull();
  expect(
    c.receive(JSON.stringify({ ...textFrame('가'), toNonce: ready.receiveNonce }), 0)?.announce,
  ).toBe(true);
  c.setContext({ ...context, muted: true });
  const again = c.setContext(context)!;
  expect(c.prepare({ kind: 'phrase', id: 'hello' }, 1999)).toBeNull();
  expect(
    c.receive(JSON.stringify({ ...textFrame('나'), toNonce: again.receiveNonce }), 2000)?.announce,
  ).toBe(false);
  c.setContext({ ...context, connected: false });
  const connected = c.setContext(context)!;
  expect(
    c.receive(JSON.stringify({ ...textFrame('다'), toNonce: connected.receiveNonce }), 3000),
  ).toBeNull();
});
test('disconnect/새 epoch와 nonce 발급 실패는 대화만 닫는다', () => {
  const c = channel();
  c.setContext(context);
  c.receive(JSON.stringify({ t: 'socialReady', epoch: 'current', receiveNonce: remote }), 0);
  c.setContext({ ...context, connected: false });
  expect(c.prepare({ kind: 'phrase', id: 'hello' }, 3000)).toBeNull();
  c.setContext({ ...context, epoch: 'new' });
  expect(c.prepare({ kind: 'phrase', id: 'hello' }, 5000)).toBeNull();
  expect(c.receive(JSON.stringify(textFrame()), 6000)).toBeNull();
  const failed = new SocialChannel({
    split,
    nonce: () => {
      throw new Error('독립 nonce');
    },
  });
  expect(failed.setContext(context)).toBeNull();
});

// P1: 순서·유실은 주입된 채널과 유한 fixture 큐만으로 확인한다. 실제 전송 큐가 아니다.
function readyPair(order: readonly (0 | 1)[] = [0, 1]) {
  const generations = [0, 0];
  const channels = [0, 1].map(
    (side) =>
      new SocialChannel({
        split,
        nonce: () => (side * 100 + ++generations[side]!).toString(16).padStart(32, '0'),
      }),
  );
  const queue: { side: 0 | 1; frame: SocialReadyFrame }[] = [];
  const sent: typeof queue = [];
  function advertise(side: 0 | 1, frame: SocialReadyFrame | null) {
    if (!frame) return;
    const item = { side, frame };
    sent.push(item);
    queue.push(item);
  }
  const initial = channels.map((c) => c.setContext(context)!);
  for (const side of order) advertise(side, initial[side]!);
  function flush(at: number) {
    for (let step = 0; queue.length; step++) {
      expect(step).toBeLessThan(8); // 무한 ready 반사는 실패하며 자동 retry하지 않는다.
      const item = queue.shift()!;
      const target = item.side === 0 ? 1 : 0;
      const received = channels[target]!.receiveWithReady(JSON.stringify(item.frame), at);
      expect(received.content).toBeNull();
      advertise(target, received.ready);
    }
  }
  return { channels, initial, generations, queue, sent, advertise, flush };
}
for (const order of [
  [0, 1],
  [1, 0],
] as const) {
  test(`초기 ready 순서 ${order.join('→')}: 현재 nonce 재광고는 총4frame에서 끝난다`, () => {
    const h = readyPair(order);
    h.flush(0);
    expect(h.sent).toHaveLength(4);
    expect(h.generations).toEqual([1, 1]);
    expect(h.channels.every((c) => c.canSend())).toBe(true);
    for (const side of [0, 1] as const) {
      const c = h.channels[side]!;
      expect(c.setContext(context)).toBeNull();
      expect(
        c.receiveWithReady(JSON.stringify(h.initial[side === 0 ? 1 : 0]), 5000).ready,
      ).toBeNull();
    }
    expect(h.sent).toHaveLength(4);
  });
}
for (const side of [0, 1] as const) {
  test(`한쪽 ${side}만 hide→visible: 상대 context/open 없이 양방향 nonce를 복구한다`, () => {
    const h = readyPair();
    h.flush(0);
    const returning = h.channels[side]!;
    const other = h.channels[side === 0 ? 1 : 0]!;
    const old = h.initial[side]!.receiveNonce!;
    expect(returning.setContext({ ...context, visible: false })).toBeNull();
    expect(returning.canSend()).toBe(false);
    h.advertise(side, returning.setContext(context));
    h.flush(5000); // 기존 ready2/5s 예산이 회복된 시점. 완화/초기화0.
    expect(h.sent).toHaveLength(7);
    expect(h.generations[side]).toBe(2);
    expect(h.generations[side === 0 ? 1 : 0]).toBe(1);
    expect(returning.canSend()).toBe(true);
    expect(other.canSend()).toBe(true);
    expect(returning.receive(JSON.stringify(textFrame('이전', 1, old)), 5000)).toBeNull();
    const outbound = other.prepare({ kind: 'phrase', id: 'hello' }, 5000)!;
    expect(outbound.toNonce).not.toBe(old);
    expect(returning.receive(JSON.stringify(outbound), 5000)?.entry.body).toEqual({
      kind: 'phrase',
      id: 'hello',
    });
    expect(returning.prepare({ kind: 'emote', id: 'smile' }, 5000)).not.toBeNull();
  });
}
test('ready duplicate/oldEpoch/null은 응답0, 새 peer nonce만 현재 muted-null을 재광고한다', () => {
  const c = channel();
  const own = c.setContext(context)!;
  const ready = { t: 'socialReady', epoch: context.epoch, receiveNonce: remote } as const;
  expect(c.receiveWithReady(JSON.stringify(ready), 0).ready).toEqual(own);
  expect(c.receiveWithReady(JSON.stringify(ready), 1).ready).toBeNull();
  expect(c.receiveWithReady(JSON.stringify({ ...ready, epoch: 'old' }), 5000).ready).toBeNull();
  expect(
    c.receiveWithReady(JSON.stringify({ ...ready, receiveNonce: null }), 5001).ready,
  ).toBeNull();
  expect(c.canSend()).toBe(false);
  const muted = c.setContext({ ...context, muted: true })!;
  expect(muted.receiveNonce).toBeNull();
  expect(c.receiveWithReady(JSON.stringify(ready), 10000).ready).toEqual(muted);
  expect(c.receiveWithReady(JSON.stringify(ready), 10001).ready).toBeNull();
  expect(c.visible(10001)).toEqual([]);
});
test('초기 ready 중복도 기존2/5s를 소비: 빠른 복귀는 rate gate 뒤 명시 refresh1회로만 복구한다', () => {
  const h = readyPair();
  h.flush(0);
  const c = h.channels[0]!;
  c.setContext({ ...context, visible: false });
  h.advertise(0, c.setContext(context));
  h.flush(1); // peer가 ready budget을 모두 썼으므로 응답0.
  expect(c.canSend()).toBe(false);
  expect(h.sent).toHaveLength(5);
  h.advertise(0, c.refreshReady());
  h.flush(5000);
  expect(h.channels.every((endpoint) => endpoint.canSend())).toBe(true);
  expect(h.sent).toHaveLength(8);
});

test('현재 ready 재광고는 nonce·received·content/ready 예산을 초기화하지 않는다', () => {
  const h = readyPair();
  h.flush(0);
  const c = h.channels[0]!;
  const own = h.initial[0]!;
  const accepted = { ...textFrame('이미 받은 문장', 7), toNonce: own.receiveNonce! };
  expect(c.receive(JSON.stringify(accepted), 0)?.entry.body).toEqual(accepted.body);
  for (const at of [1, 2, 3]) {
    expect(c.advertiseReady()).toEqual(own);
    h.advertise(0, c.advertiseReady());
    h.flush(at); // 예산 없는 duplicate 광고도 현재 수신 nonce를 바꾸지 않는다.
  }
  expect(h.sent).toHaveLength(7);
  expect(h.generations).toEqual([1, 1]);
  expect(c.receive(JSON.stringify(accepted), 5000)).toBeNull(); // received=7 보존.
  expect(c.receive(JSON.stringify({ ...accepted, socialSeq: 8 }), 5000)?.entry.body).toEqual(
    accepted.body,
  );
  c.setContext({ ...context, visible: false });
  expect(c.advertiseReady()).toBeNull();
});

for (const side of [0, 1] as const) {
  test(`역할${side} 빠른 mute/unmute: 예산 회복 뒤 현재 nonce 광고1회로 양방향 본문 복구`, () => {
    const h = readyPair();
    h.flush(0); // 양쪽 초기 ready2/5s 소진. 준비 시각을 5초로 옮기지 않는다.
    const c = h.channels[side]!;
    const other = h.channels[side === 0 ? 1 : 0]!;
    h.advertise(side, c.setContext({ ...context, muted: true }));
    h.flush(1);
    const fresh = c.setContext(context)!;
    h.advertise(side, fresh);
    h.flush(2);
    expect(h.channels.every((endpoint) => endpoint.canSend())).toBe(true);
    const stale = other.prepare({ kind: 'text', text: '유실된 창구' }, 2)!;
    expect(stale.toNonce).toBe(h.initial[side]!.receiveNonce);
    expect(c.receive(JSON.stringify(stale), 2)).toBeNull();
    h.advertise(side, c.advertiseReady());
    h.flush(3); // 예산 없는 open과 동등한 광고. 회전/자동 retry0.
    expect(h.sent).toHaveLength(7);
    expect(c.advertiseReady()).toEqual(fresh);
    h.advertise(side, c.advertiseReady());
    h.flush(5000);
    expect(h.sent).toHaveLength(9); // 현재 광고1 + 상대 현재 광고1, same nonce 응답0.
    expect(h.queue).toEqual([]);
    expect(h.generations[side]).toBe(2); // 최초 + unmute뿐. open 회전0.
    expect(h.generations[side === 0 ? 1 : 0]).toBe(1);
    const toReturning = other.prepare({ kind: 'phrase', id: 'hello' }, 5000)!;
    expect(toReturning.toNonce).toBe(fresh.receiveNonce);
    expect(c.receive(JSON.stringify(toReturning), 5000)?.entry.body).toEqual(toReturning.body);
    const toOther = c.prepare({ kind: 'emote', id: 'smile' }, 5000)!;
    expect(other.receive(JSON.stringify(toOther), 5000)?.entry.body).toEqual(toOther.body);
  });
}

test('muted 현재 광고는 null 그대로이며 open 상당 광고로 옛 본문/수신을 되살리지 않는다', () => {
  const h = readyPair();
  h.flush(0);
  const c = h.channels[0]!;
  const old = h.initial[0]!.receiveNonce!;
  const muted = c.setContext({ ...context, muted: true })!;
  expect(muted.receiveNonce).toBeNull();
  for (let i = 0; i < 3; i++) expect(c.advertiseReady()).toEqual(muted);
  expect(h.generations).toEqual([1, 1]);
  h.advertise(0, c.advertiseReady());
  h.flush(5000);
  expect(h.sent).toHaveLength(5); // null 응답0.
  expect(h.channels[1]!.canSend()).toBe(false);
  expect(c.receive(JSON.stringify(textFrame('옛 본문', 1, old)), 5000)).toBeNull();
  expect(c.visible(5000)).toEqual([]);
});

test('새 guest/auth 복귀는 content2/5s를 환급하지 않고 경계의 새 명시 송신만 받는다', () => {
  const h = readyPair();
  h.flush(0);
  const host = h.channels[0]!;
  const previous = h.channels[1]!;
  const first = previous.prepare({ kind: 'emote', id: 'smile' }, 0)!;
  expect(host.receive(JSON.stringify(first), 0)).not.toBeNull();
  const second = previous.prepare({ kind: 'phrase', id: 'hello' }, 2000)!;
  expect(host.receive(JSON.stringify(second), 2000)).not.toBeNull();
  host.setContext({ ...context, authenticated: false, connected: false });
  const current = host.setContext(context)!;
  expect(current.receiveNonce === h.initial[0]!.receiveNonce).toBe(false);
  const guest = new SocialChannel({ split, nonce: () => 'c'.repeat(32) });
  const incoming = guest.setContext(context)!;
  // 이전 ready 예산도 보존된다. 새 수신 창구 광고가 유실되어도 자동 응답/재송신0.
  expect(host.receiveWithReady(JSON.stringify(incoming), 2001).ready).toBeNull();
  guest.receiveWithReady(JSON.stringify(current), 2001);
  expect(host.canSend()).toBe(false);
  const dropped = guest.prepare({ kind: 'text', text: '빠른 복귀' }, 2001)!;
  expect(dropped.socialSeq).toBe(1);
  expect(host.receive(JSON.stringify(dropped), 2001)).toBeNull();
  expect(host.visible(4999)).toEqual([]);
  // 정확한 첫 슬롯 경계에서 현재 창구를 명시 재광고하고 새 본문만 전송한다.
  const response = host.receiveWithReady(JSON.stringify(guest.advertiseReady()), 5000).ready;
  expect(response).toEqual(current);
  guest.receiveWithReady(JSON.stringify(response), 5000);
  expect(host.canSend()).toBe(true);
  expect(host.visible(5000)).toEqual([]); // 폐기된 과거 본문을 되살리지 않는다.
  const fresh = guest.prepare({ kind: 'text', text: '새 명시 송신' }, 5000)!;
  expect(fresh.socialSeq).toBe(2);
  expect(host.receive(JSON.stringify(fresh), 5000)?.entry.body).toEqual(fresh.body);
  const reply = host.prepare({ kind: 'emote', id: 'thanks' }, 5000)!;
  expect(guest.receive(JSON.stringify(reply), 5000)?.entry.body).toEqual(reply.body);
  expect(host.receive(JSON.stringify(fresh), 7000)).toBeNull(); // 현재 창구의 중복도 거절.
  expect(host.receive(JSON.stringify(first), 10000)).toBeNull(); // 이전 수신 nonce.
  expect(host.receive(JSON.stringify({ ...fresh, epoch: 'old' }), 15000)).toBeNull();
});
