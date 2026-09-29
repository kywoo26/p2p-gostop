import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { normalizeSettings } from '../settings/settings.svelte.ts';
import Settings from './Settings.svelte';
import { loadRemoteHostSettings } from '../net/index.ts';

test('원격 URL과 생성 자격을 로컬 저장하고 화면에는 비밀을 다시 표시하지 않는다 (FR-RP-01 NF-RP-01)', async () => {
  localStorage.clear();
  const screen = await render(Settings, { settings: normalizeSettings({}) });
  const origin = screen.getByRole('textbox', { name: '중계 URL' });
  const secret = screen.getByLabelText('생성 자격');
  await origin.fill('https://relay.example.test/');
  await secret.fill('a'.repeat(43));
  await screen.getByRole('button', { name: '원격 설정 저장' }).click();
  expect(loadRemoteHostSettings(localStorage)).toEqual({
    baseUrl: 'https://relay.example.test',
    creationSecret: 'a'.repeat(43),
  });
  expect((secret.element() as HTMLInputElement).value).toBe('');
  await expect
    .element(screen.getByText('생성 자격 저장됨. 새 값을 입력하지 않으면 기존 값을 유지합니다.'))
    .toBeVisible();
  await screen.getByRole('button', { name: '원격 설정 지우기' }).click();
  expect(loadRemoteHostSettings(localStorage)).toBeNull();
});

test('HTTP 주소나 잘못된 생성 자격은 저장하지 않는다 (NF-RP-01)', async () => {
  localStorage.clear();
  const screen = await render(Settings, { settings: normalizeSettings({}) });
  await screen.getByRole('textbox', { name: '중계 URL' }).fill('http://relay.example.test');
  await screen.getByLabelText('생성 자격').fill('a'.repeat(43));
  await screen.getByRole('button', { name: '원격 설정 저장' }).click();
  expect(loadRemoteHostSettings(localStorage)).toBeNull();
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('HTTPS 중계 주소와 43자 생성 자격을 확인하세요.');
});

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
