// 친구와 대전 화면: 역할별 진입(루트 라우팅, 이슈 #19)과 대기실 스크린샷·axe (spec 2.1·2.2·6.2, AC-05).
// - Android WebView는 루프백 origin `http://127.0.0.1:17777/`을 연다 → 호스트 앱 홈(혼자 연습 + 친구와 대전).
// - iPhone은 QR로 `http://<핫스팟 IP>:17777/`을 연다 → 조작 없이 게스트 참가 화면. 여기서는 비루프백 주소 요청을
//   미리보기 서버로 넘겨 흉내 낸다(WebSocket은 닿지 않아 "다시 연결하는 중"이어도 화면 판정은 같다).
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const HOTSPOT_ORIGIN = 'http://192.168.49.1:17777';

async function asHotspotOrigin(page: Page, baseURL: string): Promise<void> {
  await page.route(`${HOTSPOT_ORIGIN}/**`, async (route) => {
    const url = route.request().url().replace(HOTSPOT_ORIGIN, baseURL.replace(/\/$/, ''));
    const response = await route.fetch({ url });
    await route.fulfill({ response });
  });
}

test('비루프백 origin의 `/`는 조작 없이 게스트 참가 화면 (iPhone QR, 이슈 #19)', async ({
  page,
  baseURL,
}) => {
  await asHotspotOrigin(page, baseURL ?? 'http://127.0.0.1:4173');
  await page.goto(`${HOTSPOT_ORIGIN}/`);
  await expect(page.getByRole('heading', { name: '게임 참가' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '내 이름' })).toBeVisible();
  await expect(page.getByRole('button', { name: '혼자 연습' })).toHaveCount(0);
});

test('비루프백의 ?role=host는 게스트로 열리고, 이전 /p2p/index.html 북마크는 루트로 이동한다', async ({
  page,
  baseURL,
}) => {
  await asHotspotOrigin(page, baseURL ?? 'http://127.0.0.1:4173');
  await page.goto(`${HOTSPOT_ORIGIN}/?role=host`);
  await expect(page.getByRole('heading', { name: '게임 참가' })).toBeVisible();
  await page.goto('./p2p/index.html');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '맞고 P2P' })).toBeVisible();
});

test('루프백 `/`와 `/?role=host`는 호스트 앱 홈 (Android WebView), `?role=guest`는 게스트', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: '친구와 대전' })).toBeVisible();
  await expect(page.getByRole('button', { name: '혼자 연습' })).toBeVisible();
  await page.goto('./?role=host&build=abc1234');
  await expect(page.getByRole('heading', { name: '맞고 P2P' })).toBeVisible();
  await page.getByRole('button', { name: '친구와 대전' }).click();
  await expect(page.getByRole('heading', { name: '방 열기' })).toBeVisible();
  await page.goto('./?role=guest');
  await expect(page.getByRole('heading', { name: '게임 참가' })).toBeVisible();
});

test('게스트 대기실 스크린샷·axe (FR-05)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/dev/gallery/guest-lobby');
  await expect(page.getByTestId('lobby')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('guest-lobby.png', { fullPage: true });
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
});
