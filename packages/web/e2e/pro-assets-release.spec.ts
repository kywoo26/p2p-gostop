import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('PA-01 evaluation assets require an explicit review build', async ({ page }, info) => {
  // Kit 중간 client/prerendered가 아니라 adapter 후처리된 실제 dist를 읽는지 검증한다.
  const paths = ['index.html'];
  for (const [dir, pattern] of [
    ['_app/immutable/entry', /^start\..*\.js$/],
    ['_app/immutable/workers', /^ai\.worker-.*\.js$/],
    ['_app/immutable/assets', /^GostopSans\..*\.woff2$/],
  ] as const) {
    const names = (await readdir(`dist/${dir}`)).filter((name) => pattern.test(name));
    expect(names).toHaveLength(1);
    paths.push(`${dir}/${names[0]}`);
  }
  const evidence = [];
  for (const path of paths) {
    const response = await page.request.get(`/${path}`);
    expect(response.status()).toBe(200);
    const received = await response.body();
    const expected = await readFile(`dist/${path}`);
    const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    expect(sha(received)).toBe(sha(expected));
    evidence.push({ path, bytes: received.length, sha256: sha(received) });
  }
  await info.attach('preview-dist-bytes', {
    body: JSON.stringify(evidence),
    contentType: 'application/json',
  });
  const art: string[] = [];
  page.on('request', (r) => {
    if (/\/pro\/.*\.(webp|avif|ogg|m4a)$/.test(r.url())) art.push(r.url());
  });
  await page.goto('/?visual=pro#/dev/gallery/home');
  await expect(page.getByRole('link', { name: '혼자 연습' })).toBeVisible();
  if (process.env['PRO_ASSET_REVIEW'] === '1') {
    await expect(page.locator('[data-pro-ready=true]')).toBeVisible();
    expect(art.length).toBeGreaterThan(0);
  } else {
    await expect(page.locator('.pro-scene')).toHaveCount(0);
    expect(art).toEqual([]);
    const response = await page.request.get('/pro/felt-1x.webp');
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type'] ?? '').not.toContain('image/webp');
  }
});
