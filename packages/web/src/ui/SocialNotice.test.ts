// AC-SC-01 / UX-SC-02: 제어 시각·일반 텍스트·유한 AT. 실단말 낭독 수용은 별도다.
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SocialNotice from './SocialNotice.svelte';
const entry = (id: number, text: string, expiresAt = 10_000) => ({ id, text, expiresAt });

test('최신2개만 표시하고 10초 경계에 제거하며 HTML·링크 DOM을 만들지 않는다', async () => {
  const text = '<img src=x onerror=alert(1)> https://example.invalid/';
  const screen = await render(SocialNotice, {
    entries: [entry(1, '첫 표현'), entry(2, text), entry(3, '마지막 표현', 12_000)],
    muted: false,
    now: 0,
  });
  const items = screen.container.querySelectorAll('li');
  expect(items).toHaveLength(2);
  expect(items[0]?.textContent).toBe(text);
  expect(screen.container.querySelectorAll('img,a,iframe,script')).toHaveLength(0);
  await screen.rerender({ now: 10_000 });
  expect(screen.container.querySelectorAll('li')).toHaveLength(1);
  expect(screen.container.querySelector('li')?.textContent).toBe('마지막 표현');
  await screen.rerender({ now: 12_000 });
  expect(screen.container.querySelectorAll('li')).toHaveLength(0);
});

test('mute가 DOM·AT를 지우고 unmute만으로 이전 표현을 복구하지 않는다', async () => {
  const screen = await render(SocialNotice, {
    entries: [entry(1, '가')],
    muted: false,
    now: 0,
    announceId: 1,
  });
  await expect.element(screen.getByRole('status')).toHaveTextContent('가');
  await screen.rerender({ muted: true });
  expect(screen.container.querySelectorAll('li')).toHaveLength(0);
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('', { normalizeWhitespace: false });
  expect(screen.getByRole('status').element().textContent).toBe('');
  expect(screen.getByRole('status').element().childElementCount).toBe(0);
  expect(screen.getByRole('status').element().getAttribute('aria-live')).toBe('off');
  await screen.rerender({ muted: false, now: 100 });
  expect(screen.container.querySelectorAll('li')).toHaveLength(0);
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('', { normalizeWhitespace: false });
  expect(screen.getByRole('status').element().textContent).toBe('');
  expect(screen.getByRole('status').element().childElementCount).toBe(0);
  await screen.rerender({ entries: [entry(2, '나')], announceId: 2, now: 5000 });
  expect(screen.container.querySelector('li')?.textContent).toBe('나');
  await expect.element(screen.getByRole('status')).toHaveTextContent('나');
});

test('5초 낭독 간격과 clockback을 지키며 막힌 항목을 뒤늦게 재생하지 않는다', async () => {
  const screen = await render(SocialNotice, {
    entries: [entry(1, '가')],
    muted: false,
    now: 0,
    announceId: 1,
  });
  await expect.element(screen.getByRole('status')).toHaveTextContent('가');
  await screen.rerender({ entries: [entry(1, '가'), entry(2, '나')], announceId: 2, now: 4999 });
  await expect.element(screen.getByRole('status')).toHaveTextContent('가');
  await screen.rerender({ now: 5000 });
  await expect.element(screen.getByRole('status')).toHaveTextContent('가');
  await screen.rerender({ entries: [entry(2, '나'), entry(3, '다')], announceId: 3, now: 5000 });
  await expect.element(screen.getByRole('status')).toHaveTextContent('다');
  await screen.rerender({ entries: [entry(3, '다'), entry(4, '라')], announceId: 4, now: 0 });
  await expect.element(screen.getByRole('status')).toHaveTextContent('다');
});

test('expiry와 외부 삭제는 남은 AT를 지우고 표시 자체에는 모션이 없다', async () => {
  const screen = await render(SocialNotice, {
    entries: [entry(1, '가')],
    muted: false,
    now: 0,
    announceId: 1,
  });
  await expect.element(screen.getByRole('status')).toHaveTextContent('가');
  expect(screen.container.querySelector('bdi')?.textContent).toBe('가');
  expect(getComputedStyle(screen.container.querySelector('li')!).animationName).toBe('none');
  await screen.rerender({ now: 10_000 });
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('', { normalizeWhitespace: false });
  expect(screen.getByRole('status').element().textContent).toBe('');
  expect(screen.getByRole('status').element().childElementCount).toBe(0);
  await screen.rerender({ entries: [entry(2, '나', 20_000)], now: 10_000, announceId: 2 });
  await expect.element(screen.getByRole('status')).toHaveTextContent('나');
  await screen.rerender({ entries: [] });
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('', { normalizeWhitespace: false });
  expect(screen.getByRole('status').element().textContent).toBe('');
  expect(screen.getByRole('status').element().childElementCount).toBe(0);
});
