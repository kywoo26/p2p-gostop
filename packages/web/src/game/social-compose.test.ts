import type { SocialMessage } from '@p2p-gostop/protocol';
import { expect, test, vi } from 'vitest';
import {
  EMPTY_COMPOSE,
  SocialConversation,
  type SocialView,
  composeInput,
  editCompose,
  submitCompose,
  type SocialTextValidator,
} from './social-compose.ts';
const valid: SocialTextValidator = (text) => ({
  ok: true,
  text: text.normalize('NFC'),
  graphemes: 1,
  scalars: 1,
  bytes: 3,
});
test('IME 중에는 검증·송신 callback을 호출하지 않는다', () => {
  const check = vi.fn(valid),
    send = vi.fn(() => true);
  const state = composeInput(editCompose(EMPTY_COMPOSE, '한'), true);
  expect(submitCompose(state, check, send)).toBe(state);
  expect(check).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
test('조합 확정 후 명시 전송 성공만 draft를 지운다', () => {
  const send = vi.fn(() => true);
  const state = composeInput(editCompose(EMPTY_COMPOSE, '한'), false);
  expect(submitCompose(state, valid, send)).toEqual(EMPTY_COMPOSE);
  expect(send).toHaveBeenCalledExactlyOnceWith('한');
});
test('길이/전송 실패·callback 예외는 열린 입력을 보존한다', () => {
  const state = editCompose(EMPTY_COMPOSE, '가');
  const send = vi.fn(() => false);
  expect(submitCompose(state, () => ({ ok: false, reason: 'bytes' }), send)).toEqual({
    ...state,
    error: 'bytes',
  });
  expect(send).not.toHaveBeenCalled();
  expect(submitCompose(state, valid, send)).toEqual({ ...state, error: 'notSent' });
  expect(
    submitCompose(state, valid, () => {
      throw new Error('callback');
    }),
  ).toEqual({ ...state, error: 'notSent' });
});

function conversationPair() {
  let now = 0;
  const generations = [0, 0];
  const views: SocialView[] = [];
  const queue: { side: 0 | 1; frame: SocialMessage }[] = [];
  const frames: typeof queue = [];
  const conversations = [0, 1].map(
    (side) =>
      new SocialConversation({
        nonce: () => (side * 100 + ++generations[side]!).toString(16).padStart(32, '0'),
        now: () => now,
        send: (frame) => {
          const item = { side: side as 0 | 1, frame };
          frames.push(item);
          queue.push(item);
          return true;
        },
        publish: (view) => {
          views[side] = view;
        },
      }),
  );
  const context = { epoch: 'pair', authenticated: true, connected: true, visible: true };
  conversations.forEach((conversation) => conversation.sync(context));
  function flush() {
    for (let step = 0; queue.length; step++) {
      expect(step).toBeLessThan(8);
      const { side, frame } = queue.shift()!;
      conversations[side === 0 ? 1 : 0]!.receive(JSON.stringify(frame));
    }
  }
  return {
    conversations,
    views,
    generations,
    context,
    queue,
    frames,
    flush,
    at: (value: number) => {
      now = value;
    },
  };
}
for (const side of [0, 1] as const) {
  test(`상대 open없이 역할${side}만 hidden→visible이면 양방향 send가 다시 가능하다`, () => {
    const h = conversationPair();
    h.flush();
    const returning = h.conversations[side]!;
    const other = h.conversations[side === 0 ? 1 : 0]!;
    h.at(5000);
    returning.sync({ ...h.context, visible: false });
    expect(h.views[side]!.available).toBe(false);
    returning.sync(h.context);
    h.flush();
    expect(h.views.every((v) => v.available)).toBe(true);
    expect(h.frames).toHaveLength(7);
    expect(h.generations[side === 0 ? 1 : 0]).toBe(1);
    expect(returning.send({ kind: 'text', text: '복귀' })).toBe(true);
    h.flush();
    expect(other.send({ kind: 'emote', id: 'smile' })).toBe(true);
    h.flush();
    expect(h.views[side]!.entries.at(-1)?.text).toBe('미소');
    expect(h.views[side === 0 ? 1 : 0]!.entries.at(-1)?.text).toBe('복귀');
  });
  test(`최초 역할${side} ready1개 유실·상대초기ready 지연은 그쪽 open1회로 복구한다`, () => {
    const h = conversationPair();
    // 최초 두 ready가 fixture 큐에 있다. 한 개만 버리고 나머지는 잠시 지연한다.
    const lost = h.queue.findIndex((item) => item.side === side);
    h.queue.splice(lost, 1);
    const delayed = h.queue.shift()!;
    expect(h.views[side]!.available).toBe(false);
    h.conversations[side]!.open();
    h.flush();
    h.queue.push(delayed);
    h.flush();
    expect(h.views.every((v) => v.available)).toBe(true);
    expect(h.frames).toHaveLength(5);
    expect(h.generations[side]).toBe(2);
    expect(h.generations[side === 0 ? 1 : 0]).toBe(1);
    expect(h.conversations[side]!.send({ kind: 'phrase', id: 'hello' })).toBe(true);
    h.flush();
    expect(h.views[side === 0 ? 1 : 0]!.entries.at(-1)?.text).toBe('안녕하세요');
  });
}

for (const side of [0, 1] as const) {
  test(`역할${side} ready 예산 소진 뒤 5초 경계의 explicit open1회가 양방향을 복구한다`, () => {
    const h = conversationPair();
    h.flush(); // 초기 수신 ready + 같은 nonce 응답으로 양쪽 기존2/5s 소비.
    const returning = h.conversations[side]!;
    h.at(1);
    returning.sync({ ...h.context, visible: false });
    returning.sync(h.context);
    h.flush();
    expect(h.views[side]!.available).toBe(false);
    expect(h.frames).toHaveLength(5); // 자동 retry/ready queue0.
    h.at(5000);
    const open = vi.spyOn(returning, 'open');
    returning.open();
    h.flush();
    expect(open).toHaveBeenCalledTimes(1);
    expect(h.views.every((view) => view.available)).toBe(true);
    expect(h.frames).toHaveLength(8);
    expect(h.generations[side]).toBe(3);
    expect(h.generations[side === 0 ? 1 : 0]).toBe(1);
    expect(returning.send({ kind: 'text', text: '다시' })).toBe(true);
    h.flush();
    expect(h.conversations[side === 0 ? 1 : 0]!.send({ kind: 'emote', id: 'thanks' })).toBe(true);
    h.flush();
    expect(h.views[side]!.entries.at(-1)?.text).toBe('감사');
    expect(h.views[side === 0 ? 1 : 0]!.entries.at(-1)?.text).toBe('다시');
  });
}

for (const side of [0, 1] as const) {
  test(`역할${side} 빠른 mute/unmute 뒤 그쪽 open1회로 양방향 실제 수신을 복구한다`, () => {
    const h = conversationPair();
    h.flush(); // 초기 ready2/5s 소비. 빠른 반례를 5초 준비로 가리지 않는다.
    const returning = h.conversations[side]!;
    const otherSide = side === 0 ? 1 : 0;
    const other = h.conversations[otherSide]!;
    h.at(1);
    returning.mute(true);
    h.flush();
    expect(h.views[side]!.muted).toBe(true);
    h.at(2);
    returning.mute(false);
    h.flush();
    expect(h.views.every((view) => view.available)).toBe(true); // 전달 증거는 아니다.
    expect(other.send({ kind: 'text', text: '오래된 창구' })).toBe(true);
    h.flush();
    expect(h.views[side]!.entries).toEqual([]); // 실제 stale nonce 수신 폐기.
    h.at(3);
    returning.open(); // 아직 예산이 없으므로 광고 폐기, nonce는 바꾸지 않는다.
    h.flush();
    expect(h.generations[side]).toBe(2);
    expect(h.frames.filter(({ frame }) => frame.t === 'socialReady')).toHaveLength(7);
    h.at(5000);
    const open = vi.spyOn(returning, 'open');
    returning.open();
    h.flush();
    expect(open).toHaveBeenCalledTimes(1);
    expect(h.frames.filter(({ frame }) => frame.t === 'socialReady')).toHaveLength(9);
    expect(h.queue).toEqual([]);
    expect(h.generations[side]).toBe(2);
    expect(h.generations[otherSide]).toBe(1);
    expect(other.send({ kind: 'emote', id: 'thanks' })).toBe(true);
    expect(returning.send({ kind: 'text', text: '열기 복구' })).toBe(true);
    h.flush();
    expect(h.views[side]!.entries.at(-1)?.text).toBe('감사');
    expect(h.views[otherSide]!.entries.at(-1)?.text).toBe('열기 복구');
  });
}

test('정상·빠른 반복 open과 ready 예산 폐기는 nonce/received를 바꾸지 않는다', () => {
  const h = conversationPair();
  h.flush();
  expect(h.conversations[0]!.send({ kind: 'text', text: '수신 순번' })).toBe(true);
  h.flush();
  const original = h.frames.find(({ frame }) => frame.t === 'social')!.frame;
  for (const at of [1, 2, 3]) {
    h.at(at);
    h.conversations[1]!.open();
    h.flush();
  }
  expect(h.generations).toEqual([1, 1]);
  expect(h.frames.filter(({ frame }) => frame.t === 'socialReady')).toHaveLength(7);
  h.at(5000);
  h.conversations[1]!.open(); // 정상 연결의 동일 nonce는 응답0.
  h.flush();
  expect(h.frames.filter(({ frame }) => frame.t === 'socialReady')).toHaveLength(8);
  h.conversations[1]!.receive(JSON.stringify(original));
  expect(h.views[1]!.entries.map((entry) => entry.text)).toEqual(['수신 순번']);
  expect(h.conversations[0]!.send({ kind: 'phrase', id: 'hello' })).toBe(true);
  expect(h.conversations[1]!.send({ kind: 'emote', id: 'smile' })).toBe(true);
  h.flush();
  expect(h.views[0]!.entries.at(-1)?.text).toBe('미소');
  expect(h.views[1]!.entries.at(-1)?.text).toBe('안녕하세요');
  expect(h.generations).toEqual([1, 1]);
});

test('muted open은 null 광고만 보내며 mute·본문 없음 상태를 유지한다', () => {
  const h = conversationPair();
  h.flush();
  h.at(1);
  h.conversations[0]!.mute(true);
  h.flush();
  h.at(5000);
  h.conversations[0]!.open();
  h.flush();
  expect(h.frames.at(-1)?.frame).toEqual({ t: 'socialReady', epoch: 'pair', receiveNonce: null });
  expect(h.frames).toHaveLength(6); // initial4 + mute1 + open1, null 응답0.
  expect(h.generations).toEqual([1, 1]);
  expect(h.views[0]!.muted).toBe(true);
  expect(h.views[0]!.entries).toEqual([]);
  expect(h.views[0]!.announceId).toBeNull();
  expect(h.views[1]!.available).toBe(false);
  expect(h.conversations[1]!.send({ kind: 'text', text: '꺼진 수신' })).toBe(false);
});
