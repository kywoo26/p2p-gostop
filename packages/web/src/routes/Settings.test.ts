import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { normalizeSettings } from '../settings/settings.svelte.ts';
import Settings from './Settings.svelte';

test('새 설정은 보통을 고르고 기존 저장 속도는 유지한다 (UX-15)', async () => {
  const fresh = normalizeSettings({});
  expect(fresh.speed).toBe('normal');
  const screen = await render(Settings, { settings: fresh });
  const normal = screen.getByRole('radio', { name: '보통' }).element() as HTMLInputElement;
  expect(normal.checked).toBe(true);
  await screen.rerender({ settings: normalizeSettings({ speed: 'fast' }) });
  const fast = screen
    .getByRole('radio', { name: '빠름', exact: true })
    .element() as HTMLInputElement;
  expect(fast.checked).toBe(true);
});

test('FR-15 국진은 자동 최적이 기본이고 매번 묻기를 저장·복원하며 세션 중 잠근다', async () => {
  const fresh = normalizeSettings({});
  expect(fresh.gukjinAsk).toBe(false);
  const patches: unknown[] = [];
  const screen = await render(Settings, {
    settings: fresh,
    onchange: (patch) => patches.push(patch),
  });
  const toggle = screen.getByRole('switch', { name: '매번 묻기' }).element() as HTMLInputElement;
  expect(toggle.checked).toBe(false);
  toggle.click();
  expect(patches).toEqual([{ gukjinAsk: true }]);
  await screen.rerender({ settings: normalizeSettings({ gukjinAsk: true }), sessionActive: true });
  expect(toggle.checked).toBe(true);
  expect(toggle.disabled).toBe(true);
});
