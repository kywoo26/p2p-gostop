// 카드 면 표시 (M3 리뷰 S-1, spec AC-05·NF-02): 뒤집기용 뒷면을 함께 그리는 카드(flippable: 바닥·손패)도
// Chromium·WebKit 모두 앞면이 보여야 한다. 적중 검사(elementFromPoint)는 WebKit에서도 앞면을 돌려줘 결함을 못 잡으므로
// 실제로 그려진 픽셀을 비교한다: 뒤집기 가능한 카드의 스크린샷이 뒷면보다 같은 카드의 앞면에 훨씬 가까워야 한다.
import { beforeEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Card from './Card.svelte';
import Floor from './Floor.svelte';
import Hand from './Hand.svelte';

beforeEach(() => {
  document.documentElement.dataset['speed'] = 'instant';
  return () => {
    delete document.documentElement.dataset['speed'];
  };
});

async function pixelsOf(el: Element): Promise<Uint8ClampedArray> {
  for (const img of el.querySelectorAll('img')) await img.decode();
  const base64 = await page.screenshot({ element: el, save: false });
  const img = new Image();
  img.src = `data:image/png;base64,${base64}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d 컨텍스트 없음');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** 채널별 평균 절대 차이 (0~255) */
function distance(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / n;
}

function find(container: Element, selector: string): Element {
  const el = container.querySelector(selector);
  if (el === null) throw new Error(`${selector} 없음`);
  return el;
}

interface Refs {
  readonly face: Uint8ClampedArray;
  readonly back: Uint8ClampedArray;
}

/** 같은 크기의 앞면(뒷면 <img> 없음)·뒷면 기준 픽셀 */
async function references(id: number, size: 'm' | 'l'): Promise<Refs> {
  const face = await render(Card, { id, size, marks: false });
  const back = await render(Card, { id: null, size });
  const refs = {
    face: await pixelsOf(find(face.container, '.card')),
    back: await pixelsOf(find(back.container, '.card')),
  };
  await face.unmount();
  await back.unmount();
  return refs;
}

function expectFace(shot: Uint8ClampedArray, refs: Refs) {
  const toFace = distance(shot, refs.face);
  const toBack = distance(shot, refs.back);
  // 앞면과 뒷면은 평균 50 이상 차이 난다. 결함이 있던 WebKit에서는 앞면까지 약 61, 뒷면까지 약 8이었다
  expect(toFace, `앞면까지 ${toFace.toFixed(1)}, 뒷면까지 ${toBack.toFixed(1)}`).toBeLessThan(
    toBack / 2,
  );
}

test('뒤집기 가능한 카드 한 장: 앞면이 보인다', async () => {
  const refs = await references(22, 'm');
  const screen = await render(Card, { id: 22, size: 'm', flippable: true, marks: false });
  expectFace(await pixelsOf(find(screen.container, '.card')), refs);
});

test('바닥 카드(Floor): 앞면이 보인다', async () => {
  const refs = await references(22, 'm');
  const screen = await render(Floor, {
    groups: [{ month: 6, cards: [22], kind: 'loose', owner: null }],
    deckCount: 10,
  });
  expectFace(await pixelsOf(find(screen.container, '[data-card-id="22"]')), refs);
});

test('손패 카드(Hand, 변형된 버튼 안): 앞면이 보인다', async () => {
  const refs = await references(30, 'l');
  const screen = await render(Hand, { cards: [30], playable: [30] });
  expectFace(await pixelsOf(find(screen.container, '[data-card-id="30"]')), refs);
});

test('가려진 카드(faceDown)는 뒷면이 보인다', async () => {
  const refs = await references(22, 'm');
  const screen = await render(Card, { id: 22, size: 'm', faceDown: true, flippable: true });
  const shot = await pixelsOf(find(screen.container, '.card'));
  expect(distance(shot, refs.back)).toBeLessThan(distance(shot, refs.face) / 2);
});
