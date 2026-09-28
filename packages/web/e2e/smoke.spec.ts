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
  for (const name of ['친구와 대전', '혼자 연습', '기록', '설정', '진단']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  await expect(page.getByTestId('build-id')).toHaveText(/빌드 (\w{7}|dev)/);
});

test('개발 갤러리: 토큰·카드 카탈로그·홈 미리보기', async ({ page }) => {
  await page.goto('./#/dev/gallery');
  await expect(page.getByRole('heading', { name: '개발 갤러리' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '카드 카탈로그 (51장)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '맞고 P2P' })).toBeVisible();
});

test('해시 라우팅: 갤러리에서 홈으로', async ({ page }) => {
  await page.goto('./#/dev/gallery');
  await page.getByRole('link', { name: '홈으로' }).click();
  await expect(page.getByRole('button', { name: '친구와 대전' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '개발 갤러리' })).toHaveCount(0);
});
