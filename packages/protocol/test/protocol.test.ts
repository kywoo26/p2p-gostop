import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, byteLength, encode } from '../src/index.ts';

describe('protocol', () => {
  it('메시지를 JSON으로 인코딩한다', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(JSON.parse(encode({ t: 'ping' }))).toEqual({ t: 'ping' });
  });

  it('바이트 길이는 UTF-8 기준 (ASCII 1, 한글 3, 이모지 4바이트)', () => {
    expect(byteLength('go')).toBe(2);
    expect(byteLength('맞고')).toBe(6);
    expect(byteLength('é')).toBe(2);
    expect(byteLength('🎴')).toBe(4);
  });

  it('16KB를 넘는 게임 메시지는 거부 (NP-07)', () => {
    const name = 'x'.repeat(MAX_MESSAGE_BYTES);
    expect(() => encode({ t: 'hello', v: PROTOCOL_VERSION, name })).toThrow(RangeError);
  });
});
