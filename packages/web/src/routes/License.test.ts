import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ATTRIBUTION_URLS, CARD_ART_AUTHORS } from '../cards/attribution.ts';
import License from './License.svelte';
import notices from '../oss-notices.json';

test('라이선스 화면: 저작자 3명, CC BY-SA 4.0, 원본·CC0 주소를 글자로 보여 준다 (NF-07)', async () => {
  const screen = await render(License);
  await expect.element(screen.getByRole('heading', { name: '라이선스' })).toBeVisible();
  for (const author of CARD_ART_AUTHORS) {
    await expect.element(screen.getByText(author.name, { exact: true })).toBeVisible();
  }
  const text = document.body.textContent ?? '';
  expect(text).toContain('CC BY-SA 4.0');
  // 보너스 3장·뒷면은 자체 제작 CC0 (plan.md D1)
  await expect
    .element(screen.getByRole('heading', { name: '보너스 카드(48~50번)·카드 뒷면' }))
    .toBeVisible();
  expect(text).toContain('CC0 1.0');
  for (const url of ATTRIBUTION_URLS) expect(text).toContain(url);
  await expect.element(screen.getByRole('heading', { name: '배포 의존성' })).toBeVisible();
  expect(notices.web.map((item) => item.name)).toEqual(['svelte', 'uqr', 'zod']);
  expect(notices.android.some((item) => item.name === 'io.ktor:ktor-server-cio-jvm')).toBe(true);
  expect(
    screen.getByRole('link', { name: '전체 공개 소스 고지 읽기' }).element().getAttribute('href'),
  ).toBe('/oss/NOTICE.txt');
  // 외부 주소에는 링크를 걸지 않는다 (오프라인, spec NF-01)
  for (const a of document.querySelectorAll('a[href]')) {
    expect(a.getAttribute('href')).not.toMatch(/^https?:/);
  }
});
