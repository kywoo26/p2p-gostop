import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  RELAY_MAX_PAYLOAD_BYTES,
  byteLength,
  encode,
  encodeRelayNotice,
  isRelayFrame,
  parseRelayNotice,
  tryEncode,
} from '../src/index.ts';

describe('protocol', () => {
  it('메시지를 JSON으로 인코딩한다', () => {
    expect(PROTOCOL_VERSION).toBe(3);
    expect(JSON.parse(encode({ t: 'ping' }))).toEqual({ t: 'ping' });
  });

  it('바이트 길이는 UTF-8 기준 (ASCII 1, 한글 3, 이모지 4바이트)', () => {
    expect(byteLength('go')).toBe(2);
    expect(byteLength('맞고')).toBe(6);
    expect(byteLength('é')).toBe(2);
    expect(byteLength('🎴')).toBe(4);
  });

  it('16KB를 넘는 게임 메시지: encode는 던지고 tryEncode는 결과로 알린다 (NP-07, #23)', () => {
    const name = 'x'.repeat(MAX_MESSAGE_BYTES);
    expect(() => encode({ t: 'hello', v: PROTOCOL_VERSION, name })).toThrow(RangeError);
    const result = tryEncode({ t: 'hello', v: PROTOCOL_VERSION, name });
    expect(result.ok).toBe(false);
    expect(result.ok ? 0 : result.bytes).toBeGreaterThan(MAX_MESSAGE_BYTES);
  });

  it('log·ledgerPage는 64KB까지, 그 밖은 16KB까지', () => {
    const line = 'x'.repeat(1_900);
    expect(tryEncode({ t: 'log', entries: Array.from({ length: 30 }, () => line) }).ok).toBe(true);
    expect(tryEncode({ t: 'log', entries: Array.from({ length: 40 }, () => line) }).ok).toBe(false);
    expect(RELAY_MAX_PAYLOAD_BYTES).toBe(65_536);
  });

  it('중계 알림: 두 형식을 알림으로 읽고, 모르는 peer는 무시, 큰 프레임은 알림이 아니다 (#24)', () => {
    expect(parseRelayNotice('{"t":"relay","peer":"joined"}')).toEqual({
      t: 'relay',
      peer: 'joined',
    });
    expect(parseRelayNotice('{"type":"relay","peer":"left"}')).toEqual({
      t: 'relay',
      peer: 'left',
    });
    expect(parseRelayNotice('{"t":"relay","peer":"hacked"}')).toBeNull();
    expect(isRelayFrame('{"t":"relay","peer":"hacked"}')).toBe(true);
    expect(isRelayFrame('{"t":"ping"}')).toBe(false);
    expect(isRelayFrame('not json "relay"')).toBe(false);
    expect(isRelayFrame(`{"t":"relay","peer":"left","pad":"${'x'.repeat(300)}"}`)).toBe(false);
    for (const peer of ['present', 'absent', 'joined', 'left'] as const)
      expect(parseRelayNotice(encodeRelayNotice(peer))).toEqual({ t: 'relay', peer });
    // Android SmokeServer.notice()와 바이트 단위로 같다
    expect(encodeRelayNotice('absent')).toBe('{"t":"relay","peer":"absent"}');
  });
});
