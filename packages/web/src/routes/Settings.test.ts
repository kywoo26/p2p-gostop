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

test('FR-15·FR-21 국진 선택은 사용자 지정 규칙으로 저장하고 세션 중 잠근다', async () => {
  const fresh = normalizeSettings({});
  expect(fresh.gukjinAsk).toBe(false);
  const patches: unknown[] = [];
  const screen = await render(Settings, {
    settings: fresh,
    onchange: (patch) => patches.push(patch),
  });
  const select = screen.getByLabelText('국진 처리').element() as HTMLSelectElement;
  expect(select.value).toBe('"auto"');
  select.value = '"ask"';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  expect(patches).toMatchObject([{ gukjinAsk: true, customRules: { gukjin: 'ask' } }]);
  const changed = normalizeSettings({ ...fresh, ...(patches[0] as object) });
  await screen.rerender({ settings: changed, sessionActive: true });
  expect(select.value).toBe('"ask"');
  expect(select.disabled).toBe(true);
});

test('FR-21 프리셋 변경·개별 규칙·복원과 로컬 힌트 등급을 분리한다', async () => {
  const patches: unknown[] = [];
  const screen = await render(Settings, {
    settings: normalizeSettings({}),
    onchange: (patch) => patches.push(patch),
  });
  const bonus = screen.getByLabelText('보너스 카드 구성').element() as HTMLSelectElement;
  bonus.value = '2';
  bonus.dispatchEvent(new Event('change', { bubbles: true }));
  expect(patches).toMatchObject([{ customRules: { bonusCards: 2 } }]);
  const changed = normalizeSettings({ ...(patches[0] as object) });
  await screen.rerender({ settings: changed });
  await expect.element(screen.getByText(/사용자 지정 · 기준 프리셋/)).toBeVisible();
  (screen.getByRole('button', { name: '프리셋 규칙 복원' }).element() as HTMLButtonElement).click();
  expect(patches.at(-1)).toMatchObject({ customRules: null });
  const hint = screen.getByLabelText('힌트 등급').element() as HTMLSelectElement;
  hint.value = 'detail';
  hint.dispatchEvent(new Event('change', { bubbles: true }));
  expect(patches.at(-1)).toEqual({ hintLevel: 'detail' });
  expect((screen.getByLabelText('미션').element() as HTMLSelectElement).options[1]?.disabled).toBe(
    true,
  );
  const effect = screen.getByRole('combobox', { name: '효과 강도' }).element() as HTMLSelectElement;
  effect.value = 'off';
  effect.dispatchEvent(new Event('change', { bubbles: true }));
  expect(patches.at(-1)).toEqual({ effectIntensity: 'off' });
  const delay = screen
    .getByRole('switch', { name: '120ms 취소 지연' })
    .element() as HTMLInputElement;
  delay.click();
  expect(patches.at(-1)).toEqual({ confirmDelay: true });
  expect(document.body.textContent).not.toContain('진동');
  (screen.getByRole('radio', { name: '아케이드' }).element() as HTMLInputElement).click();
  expect(patches.at(-1)).toMatchObject({ preset: 'arcade', customRules: null, startBalance: null });
});
