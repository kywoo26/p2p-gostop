import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';
import { expect, test, type WebSocketRoute } from '@playwright/test';

const origin = 'https://relay.example.test';
const roomId = 'R'.repeat(22);
const secret = 's'.repeat(43);
const requestId = 'Q'.repeat(22);

test('설정에서 중계 등록 후 방 생성과 코드 참여 승인을 한다 (FR-RP-01/02/03)', async ({
  page,
}, testInfo) => {
  let socket: WebSocketRoute | null = null;
  let authenticated = false;
  let accepted = false;
  await page.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        },
      });
      return;
    }
    const body =
      path === '/version'
        ? {
            relay: 'p2p-gostop',
            controlVersion: 1,
            wireVersion: PROTOCOL_VERSION,
            current: {
              path: `/r/v1/${'a'.repeat(64)}/`,
              wireVersion: PROTOCOL_VERSION,
            },
          }
        : path === '/api/rooms'
          ? {
              roomId,
              hostToken: 'h'.repeat(43),
              code: 'ABCD-EFGH-JKLM',
              expiresAt: Date.now() + 6 * 60 * 60_000,
            }
          : {};
    await route.fulfill({
      status: path.includes('/credentials') ? 201 : path === '/api/rooms' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  await page.routeWebSocket(/^wss:\/\/relay\.example\.test\/ws\?/, (ws) => {
    socket = ws;
    ws.onMessage((message) => {
      const frame = JSON.parse(message.toString()) as { t: string };
      if (frame.t === 'relay-auth') {
        ws.send(JSON.stringify({ t: 'relay', peer: 'absent' }));
        authenticated = true;
      }
      if (frame.t === 'relay-accept') accepted = true;
    });
  });
  await page.goto('./');
  await page.getByRole('button', { name: '친구와 원격 대전' }).click();
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();
  await page.getByRole('textbox', { name: '중계 URL' }).fill(origin);
  await page.getByLabel('생성 자격').fill(secret);
  await page.getByRole('button', { name: '원격 설정 저장' }).click();
  await page.getByRole('link', { name: '뒤로' }).click();
  await page.getByRole('button', { name: '친구와 원격 대전' }).click();
  await expect(page.getByRole('heading', { name: '원격 방 열기' })).toBeVisible();
  await page.getByRole('button', { name: '방 만들기' }).click();
  await expect(page.getByTestId('remote-code')).toHaveText('ABCD-EFGH-JKLM');
  await page.getByRole('button', { name: '초대 링크 복사' }).click();
  await expect(page.getByText('초대 링크를 복사했습니다.')).toBeVisible();
  await expect.poll(() => socket !== null).toBe(true);
  await expect.poll(() => authenticated).toBe(true);
  await page.waitForTimeout(100);
  socket!.send(JSON.stringify({ t: 'relay-join-request', requestId }));
  await expect(page.getByText(/코드 참여/)).toBeVisible();
  await page.getByRole('button', { name: '수락' }).click();
  await expect.poll(() => accepted).toBe(true);
  await mkdir('test-results/remote', { recursive: true });
  for (const width of [360, 390, 412, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({
      path: `test-results/remote/host-${width}-${testInfo.project.name}.png`,
      fullPage: true,
    });
  }
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([]);
});
