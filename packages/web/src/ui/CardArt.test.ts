// D1·spec 6.6·NF-08: 작은 카드의 실제 DOM 기하를 확인한다. PNG 기준 파일은 만들지 않는다.
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Card from './Card.svelte';
import CapturedPile from './CapturedPile.svelte';
import Floor from './Floor.svelte';
import { capturedStats } from './seat-stats.ts';

// Commons 좌표(103.2×168.2): 光 원 전체 + 여유. 띠 글자는 가운데 x=28~77, y=37~132.
const protectedArt: Record<number, readonly [number, number, number, number]> = {
  0: [59, 116, 38, 42],
  8: [10, 117, 40, 42],
  28: [10, 117, 40, 42],
  40: [60, 116, 38, 42],
  44: [9, 7, 40, 40],
  1: [28, 37, 49, 95],
  5: [28, 37, 49, 95],
  9: [28, 37, 49, 95],
  21: [28, 37, 49, 95],
  33: [28, 37, 49, 95],
  37: [28, 37, 49, 95],
};

for (const size of ['m', 'l'] as const) {
  for (const markAt of ['top', 'bottom'] as const) {
    test(`${size}/${markAt}: 光·띠 글자 보호 영역과 색인 교차 0, 최소 12/16px`, async () => {
      for (const [key, [x, y, w, h]] of Object.entries(protectedArt)) {
        const screen = await render(Card, { id: Number(key), size, markAt });
        const card = screen.container.querySelector('.card')!;
        const mark = card.querySelector('.mark')!;
        const a = card.getBoundingClientRect();
        const b = mark.getBoundingClientRect();
        const scale = Math.min(a.width / 103.2, a.height / 168.2);
        const left = a.left + (a.width - 103.2 * scale) / 2 + x * scale;
        const top = a.top + (a.height - 168.2 * scale) / 2 + y * scale;
        const overlap =
          Math.max(0, Math.min(b.right, left + w * scale) - Math.max(b.left, left)) *
          Math.max(0, Math.min(b.bottom, top + h * scale) - Math.max(b.top, top));
        expect(overlap, `id=${key}`).toBe(0);
        expect(parseFloat(getComputedStyle(mark).fontSize)).toBeGreaterThanOrEqual(12);
        expect(b.height).toBeGreaterThanOrEqual(16);
        await screen.unmount();
      }
    });
  }
}

test('배지·선택선은 그림 밖, 뒷면에는 월·배지 노출 없음', async () => {
  const screen = await render(Card, { id: 44, badge: '선택', highlight: true });
  const card = screen.container.querySelector('.card')!;
  const badge = card.querySelector('.badge')!;
  expect(badge.getBoundingClientRect().bottom).toBeLessThan(card.getBoundingClientRect().top);
  expect(parseFloat(getComputedStyle(card).outlineOffset)).toBeGreaterThanOrEqual(1);
  const hidden = await render(Card, { id: 44, faceDown: true, badge: '선택' });
  expect(hidden.container.querySelector('.mark, .badge')).toBeNull();
});

test('보너스 2·2·3피와 작은 획득패는 추가 색인이 그림을 가리지 않는다', async () => {
  for (const id of [48, 49, 50]) {
    const screen = await render(Card, { id });
    expect(screen.container.querySelector('.mark')).toBeNull();
    await screen.unmount();
  }
  const screen = await render(CapturedPile, {
    label: '내 획득패',
    stats: capturedStats({ gwang: [0], yeol: [32], tti: [], pi: [48, 50] }, true),
    highlight: [48],
  });
  expect(screen.container.querySelector('.card .mark, .card .badge')).toBeNull();
  const badge = screen.container.querySelector('.pile-badge')!;
  expect(badge.textContent).toBe('국진 쌍피');
  const card = screen.container.querySelector('[data-card-id="32"]')!;
  expect(badge.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    card.getBoundingClientRect().top,
  );
  expect(
    screen.container.querySelector('[data-card-id="48"]')?.classList.contains('highlight'),
  ).toBe(true);
});

test('뻑·더미 수는 그림 밖에 두고 바닥 행 간 배지 여백을 확보한다', async () => {
  const screen = await render(Floor, {
    groups: [{ month: 12, cards: [44, 45, 46], kind: 'ppeok', owner: 0 }],
    deckCount: 17,
  });
  const tag = screen.container.querySelector('.ppeok-tag')!;
  for (const card of screen.container.querySelectorAll('.floor .card')) {
    expect(tag.getBoundingClientRect().bottom).toBeLessThan(card.getBoundingClientRect().top);
  }
  const deck = screen.container.querySelector('.deck .card')!;
  const count = screen.container.querySelector('.deck-count')!;
  expect(count.getBoundingClientRect().top).toBeGreaterThan(deck.getBoundingClientRect().bottom);
  const anchor = screen.container.querySelector('[data-anchor="deck"]')!;
  expect(anchor.getBoundingClientRect().bottom).toBeLessThan(count.getBoundingClientRect().top);
  expect(
    parseFloat(getComputedStyle(screen.container.querySelector('.floor')!).rowGap),
  ).toBeGreaterThanOrEqual(20);
});
