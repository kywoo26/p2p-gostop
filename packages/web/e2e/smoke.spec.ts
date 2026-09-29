import { expect, test } from '@playwright/test';

// 외부 네트워크 요청이 없어야 한다 (spec NF-01).
test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1').origin;
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('data:')) {
      throw new Error(`외부 요청 금지: ${url}`);
    }
  });
});

test('홈 화면: 메뉴 5개와 빌드 식별자 (spec 6.2)', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '맞고 P2P' })).toBeVisible();
  for (const name of ['핫스팟 대전', '친구와 원격 대전', '혼자 연습', '기록', '설정', '진단']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  await expect(page.getByTestId('build-id')).toHaveText(/빌드 (\w{7}|dev)/);
});

test('개발 갤러리: 목차·토큰, 카드 페이지', async ({ page }) => {
  await page.goto('./#/dev/gallery');
  await expect(page.getByRole('heading', { name: '개발 갤러리' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '색상 토큰 (OKLCH)' })).toBeVisible();
  await page.getByRole('link', { name: '카드 앞면·뒷면 (세 크기)' }).click();
  await expect(page.getByRole('heading', { name: /카드 크게 \(손패\) · 51장/ })).toBeVisible();
});

test('홈 → 라이선스 화면 (spec 6.6, NF-07)', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: '라이선스' }).click();
  await expect(page.getByRole('heading', { name: '라이선스' })).toBeVisible();
  await expect(page.getByText('Marcus Richert', { exact: true })).toBeVisible();
  const attribution = await page.request.get('./cards/ATTRIBUTION.md');
  expect(attribution.ok()).toBe(true);
  expect(await attribution.text()).toContain('Louie Mantia, Jr.');
});

test('해시 라우팅: 갤러리에서 홈으로', async ({ page }) => {
  await page.goto('./#/dev/gallery');
  await page.getByRole('link', { name: '홈으로' }).click();
  await expect(page.getByRole('button', { name: '핫스팟 대전' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '개발 갤러리' })).toHaveCount(0);
});
