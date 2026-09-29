import { mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const origin = 'https://relay.example';
const prefix = '/r/release/hash/';
const dist = resolve('dist');

async function serveNestedBundle(page: Page): Promise<void> {
  await page.route(`${origin}${prefix}**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.startsWith(prefix)) return route.abort();
    const relative = pathname.slice(prefix.length) || 'index.html';
    const file = resolve(dist, relative);
    if (file !== dist && !file.startsWith(`${dist}${sep}`)) return route.abort();
    try {
      await route.fulfill({ path: file });
    } catch {
      await route.abort();
    }
  });
}

test('하위 배포 경로에서 링크·코드·승인 대기·불가 화면 (FR-RP-02, NF-RP-06)', async ({
  page,
}, testInfo) => {
  await serveNestedBundle(page);
  let joinSocket: { send(message: string): void } | null = null;
  await page.routeWebSocket('**/*', (ws) => {
    joinSocket = ws;
    ws.send(JSON.stringify({ t: 'relay-join-pending' }));
  });
  const capture = async (name: string) => {
    const folder = resolve('test-results/remote');
    await mkdir(folder, { recursive: true });
    await page.screenshot({
      path: resolve(folder, `${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  };

  const room = 'A'.repeat(22);
  const token = 'B'.repeat(43);
  await page.goto(`${origin}${prefix}#/join?room=${room}&t=${token}`);
  await expect(page.getByRole('heading', { name: '초대로 참여' })).toBeVisible();
  await expect.poll(() => page.url()).toBe(`${origin}${prefix}#/join`);
  await capture('link');

  await page.goto(`${origin}${prefix}#/join`);
  await page.reload();
  await expect(page.getByRole('heading', { name: '코드로 참여' })).toBeVisible();
  await capture('code');

  await page.getByRole('textbox', { name: '이름' }).fill('동료');
  await page.getByRole('textbox', { name: '12자리 방 코드' }).fill('abcd-efgh-jkmn');
  await page.getByRole('button', { name: '참여하기' }).click();
  await expect(page.getByText(/호스트 승인 대기/)).toBeVisible();
  await capture('approval');

  await expect.poll(() => joinSocket).not.toBeNull();
  const socket = joinSocket as unknown as { send(message: string): void };
  socket.send(JSON.stringify({ t: 'relay-join-unavailable' }));
  await expect(page.getByRole('alert')).toContainText('원격 대전 이용 불가');
  await capture('unavailable');
});
