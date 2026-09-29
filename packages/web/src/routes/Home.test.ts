import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Home from './Home.svelte';

test('홈에서 핫스팟과 원격 모드를 고르고 빌드 식별자가 보인다 (FR-RP-01)', async () => {
  const screen = await render(Home, { remoteReady: false });

  await expect.element(screen.getByRole('heading', { name: '맞고 P2P' })).toBeVisible();
  for (const name of ['핫스팟 대전', '친구와 원격 대전', '혼자 연습', '기록', '설정', '진단']) {
    await expect.element(screen.getByRole('button', { name })).toBeVisible();
  }
  const buildId = screen.getByTestId('build-id');
  await expect.element(buildId).toBeVisible();
  expect(buildId.element().textContent).toMatch(/^빌드 (\w{7}|dev)$/);
  await expect
    .element(screen.getByText('원격 대전은 설정에서 중계 주소와 생성 자격을 먼저 저장하세요.'))
    .toBeVisible();
});

test('원격 설정 전에는 설정으로, 저장 뒤에는 원격 로비로 간다 (FR-RP-01)', async () => {
  const screen = await render(Home, { remoteReady: false });
  await screen.getByRole('button', { name: '친구와 원격 대전' }).click();
  expect(location.hash).toBe('#/settings');
  await screen.rerender({ remoteReady: true });
  await screen.getByRole('button', { name: '친구와 원격 대전' }).click();
  expect(location.hash).toBe('#/remote');
  await screen.getByRole('button', { name: '핫스팟 대전' }).click();
  expect(location.hash).toBe('#/versus');
  location.hash = '';
});
