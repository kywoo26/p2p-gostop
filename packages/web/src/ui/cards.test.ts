import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { bannerActor, bannerFor, bannerForEngineEvent } from './banner.ts';
import Card from './Card.svelte';
import { cardIndex, cardLabel, cardSrc, markSide, sortHand } from './cards.ts';
import EventBanner from './EventBanner.svelte';

test('카드 이름·표식 (NF-08: 월 숫자·종류 병기)', () => {
  expect([0, 4, 32, 43, 44, 46, 21, 13, 48, 50].map(cardLabel)).toEqual([
    '1월 광',
    '2월 고도리',
    '9월 국진',
    '11월 쌍피',
    '12월 비광',
    '12월 비띠',
    '6월 청단',
    '4월 초단',
    '보너스 2피',
    '보너스 3피',
  ]);
  expect([0, 4, 1, 2, 47, 32].map(cardIndex)).toEqual([
    { month: 1, kind: 'gwang' },
    { month: 2, kind: 'yeol' },
    { month: 1, kind: 'tti' },
    { month: 1, kind: 'pi' },
    { month: 12, kind: 'ssangpi' },
    { month: 9, kind: 'yeol' },
  ]);
  // 보너스는 그림에 가치가 크게 쓰여 있어 표식이 없다
  expect([48, 49, 50].map(cardIndex)).toEqual([null, null, null]);
  // 光 원이 왼쪽 아래(3·8월 광)·왼쪽 위(12월 광)에 있는 카드는 표식이 오른쪽으로 간다 (plan.md D1)
  expect([markSide(0, 'bottom'), markSide(8, 'bottom'), markSide(28, 'bottom')]).toEqual([
    'left',
    'right',
    'right',
  ]);
  expect([markSide(44, 'top'), markSide(0, 'top')]).toEqual(['right', 'left']);
  expect(cardSrc(7)).toMatch(/cards\/7\.svg$/);
});

test('앞면 카드: 이름·그림·표식, 가려진 카드: 뒷면만', async () => {
  const screen = await render(Card, { id: 0, size: 'l' });
  const face = screen.getByRole('img', { name: '1월 광' });
  await expect.element(face).toBeVisible();
  const imgs = face.element().querySelectorAll('img');
  expect([...imgs].map((i) => i.getAttribute('src'))).toEqual([cardSrc(0)]);
  // 표식: 월 숫자 + 광 기호(모양), 화면 읽기에서는 숨김(이름은 aria-label)
  const mark = face.element().querySelector('.mark');
  expect(mark?.textContent).toBe('1');
  expect(mark?.getAttribute('data-kind')).toBe('gwang');
  expect(mark?.getAttribute('aria-hidden')).toBe('true');

  const hidden = await render(Card, { id: null });
  const back = hidden.getByRole('img', { name: '카드 뒷면' });
  expect(back.element().querySelector('img')?.getAttribute('src')).toMatch(/cards\/back\.svg$/);
});

test('카드 크기 s < m < l, 비율 103.2:168.2, 폭·높이는 정수 px (2x·3x 선명도, plan.md D1)', async () => {
  const widths: number[] = [];
  for (const size of ['s', 'm', 'l'] as const) {
    const screen = await render(Card, { id: 8, size });
    const rect = screen.getByRole('img', { name: '3월 광' }).element().getBoundingClientRect();
    widths.push(rect.width);
    expect(rect.height / rect.width).toBeCloseTo(168.2 / 103.2, 1);
    expect(Number.isInteger(rect.width) && Number.isInteger(rect.height), `${size}`).toBe(true);
    screen.unmount();
  }
  expect(widths[0]).toBeLessThan(widths[1] ?? 0);
  expect(widths[1]).toBeLessThan(widths[2] ?? 0);
});

test('이벤트 → 배너 (spec 6.5 문구)', async () => {
  const base = { seq: 1, seat: 0 as const, cards: [] };
  expect(bannerFor({ ...base, type: 'Ppeok' })).toEqual({ kind: 'ppeok', text: '뻑', seat: 0 });
  expect(bannerFor({ ...base, type: 'Go', n: 3 })).toEqual({ kind: 'go', text: '3고', seat: 0 });
  expect(bannerFor({ ...base, type: 'Bomb' })?.kind).toBe('bomb');
  expect(bannerFor({ ...base, type: 'CardPlayed' })).toBeNull();

  const screen = await render(EventBanner, { kind: 'jjok', text: '쪽' });
  await expect.element(screen.getByRole('status')).toHaveTextContent('쪽!');
});

test('엔진 이벤트 배너는 주체 좌석을 싣고, 보는 좌석 기준 "나"/"상대"가 된다 (M3 리뷰 I-4)', () => {
  const jjok = bannerForEngineEvent({ seq: 5, seat: 1, cards: [], type: 'Jjok' });
  expect(jjok).toEqual({ kind: 'jjok', text: '쪽', seat: 1 });
  expect(jjok && bannerActor(jjok, 0)).toBe('상대');
  expect(jjok && bannerActor(jjok, 1)).toBe('나');
  const nagari = bannerForEngineEvent({
    seq: 6,
    seat: 0,
    cards: [],
    type: 'Nagari',
    multiplier: 2,
  });
  expect(nagari && bannerActor(nagari, 0)).toBeNull();
});

test('손패 정렬: 월 → 광·열끗·띠·피 → 보너스는 끝 (M3 리뷰 I-2)', () => {
  expect(sortHand([50, 47, 44, 45, 46, 32, 35, 33, 0])).toEqual([
    0, 32, 33, 35, 44, 45, 46, 47, 50,
  ]);
  // 입력 순서와 무관하다
  expect(sortHand([33, 0, 50, 32])).toEqual(sortHand([50, 32, 33, 0]));
});
