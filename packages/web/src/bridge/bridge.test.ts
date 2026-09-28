import { expect, test } from 'vitest';
import { getBridge } from './bridge.ts';

test('웹 브리지는 no-op: 핫스팟 미지원, 공유 안 됨', async () => {
  const bridge = getBridge();
  expect(bridge.isNative).toBe(false);
  expect((await bridge.startHotspot()).state).toBe('unsupported');
  expect(await bridge.share({ text: '로그' })).toEqual({ shared: false });
  const handle = await bridge.addListener('hotspot', () => {});
  await expect(handle.remove()).resolves.toBeUndefined();
});
