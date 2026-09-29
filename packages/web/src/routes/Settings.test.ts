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
