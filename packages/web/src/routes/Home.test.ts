import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Home from './Home.svelte';

test('홈 화면에 메뉴 5개와 빌드 식별자가 보인다 (spec 6.2)', async () => {
  const screen = await render(Home);

  await expect.element(screen.getByRole('heading', { name: '맞고 P2P' })).toBeVisible();
  for (const name of ['친구와 대전', '혼자 연습', '기록', '설정', '진단']) {
    await expect.element(screen.getByRole('button', { name })).toBeVisible();
  }
  const buildId = screen.getByTestId('build-id');
  await expect.element(buildId).toBeVisible();
  expect(buildId.element().textContent).toMatch(/^빌드 (\w{7}|dev)$/);
});
