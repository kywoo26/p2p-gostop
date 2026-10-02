// UX-15~17 / #200: 공간 제약의 접촉 실패가 획득 강조·출발 위치를 오염하지 않는다.
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { landingSave } from './landing-fixtures.ts';

test.use({ viewport: { width: 393, height: 659 }, video: 'on' });

test('안전하지 않은 월 묶음은 실제 획득 영역에서만 강조한다 @guest', async ({ page }, testInfo) => {
  const { save, events } = landingSave();
  await page.goto('./?speed=normal#/');
  await page.evaluate(
    (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
    save,
  );
  await page.reload();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
  const before = await page.locator('[aria-label="바닥"] [data-card-id]').evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-card-id'),
      rect: el.getBoundingClientRect().toJSON(),
    })),
  );
  await page.evaluate(() => {
    const frames: {
      t: number;
      counts: number[];
      originalFloorIds: string[];
      strong: {
        id: string;
        rect: ReturnType<DOMRect['toJSON']>;
        destination: ReturnType<DOMRect['toJSON']> | null;
      }[];
      floor: { id: string; rect: ReturnType<DOMRect['toJSON']> }[];
    }[] = [];
    (window as unknown as { __captureSafety: typeof frames }).__captureSafety = frames;
    const started = performance.now();
    function sample() {
      const root = document.querySelector<HTMLElement>('[data-testid="board"]')!;
      const floor = [...root.querySelectorAll<HTMLElement>('[aria-label="바닥"] [data-card-id]')];
      frames.push({
        t: performance.now() - started,
        counts: [...root.querySelectorAll('.captured-zone.mine [data-cards]')].map((el) =>
          Number(el.getAttribute('data-cards')),
        ),
        originalFloorIds: floor.map((el) => el.dataset['cardId']!),
        strong: [...root.querySelectorAll<HTMLElement>('[data-motion-card-id]')]
          .filter((el) => el.querySelector('[data-contact-light="capture"]'))
          .map((el) => ({
            id: el.dataset['motionCardId']!,
            rect: el.getBoundingClientRect().toJSON(),
            destination:
              root
                .querySelector(
                  '.captured-zone.mine [data-card-id="' + el.dataset['motionCardId'] + '"]',
                )
                ?.getBoundingClientRect()
                .toJSON() ?? null,
          })),
        floor: floor
          .filter((el) => getComputedStyle(el).visibility !== 'hidden')
          .map((el) => ({ id: el.dataset['cardId']!, rect: el.getBoundingClientRect().toJSON() })),
      });
      if (
        performance.now() - started < 3000 &&
        !document.querySelector<HTMLElement>('[data-testid="solo"]')?.dataset['playTimings']
      )
        requestAnimationFrame(sample);
    }
    document.querySelector<HTMLElement>('[aria-label="내 손패"] [data-slot="10"]')!.click();
    requestAnimationFrame(sample);
  });
  await expect(page.getByTestId('solo')).toHaveAttribute('data-play-timings', /.+/, {
    timeout: 5000,
  });
  const frames = await page.evaluate(
    () =>
      (
        window as unknown as {
          __captureSafety: {
            t: number;
            counts: number[];
            originalFloorIds: string[];
            strong: {
              id: string;
              rect: { x: number; y: number; width: number; height: number };
              destination: { x: number; y: number } | null;
            }[];
            floor: { id: string; rect: { x: number; y: number; width: number; height: number } }[];
          }[];
        }
      ).__captureSafety,
  );
  await writeFile(
    testInfo.outputPath('frames.json'),
    JSON.stringify({ viewport: { width: 393, height: 659 }, before, events, frames }),
  );
  expect(frames.some((f) => f.strong.length === 4)).toBe(true);
  for (const frame of frames.filter((f) => f.counts.reduce((a, b) => a + b, 0) === 0)) {
    // 강한 강조가 없어도 실제 획득 전에 원본 바닥이 사라지면 실패다.
    expect(frame.originalFloorIds).toEqual(expect.arrayContaining(before.map((card) => card.id)));
  }
  for (const frame of frames.filter((f) => f.strong.length > 0)) {
    if (frame.counts.reduce((a, b) => a + b, 0) === 0) {
      for (const a of frame.strong)
        for (const b of [...frame.floor, ...frame.strong]) {
          if (Math.floor(Number(a.id) / 4) === Math.floor(Number(b.id) / 4)) continue;
          expect(
            a.rect.x < b.rect.x + b.rect.width &&
              a.rect.x + a.rect.width > b.rect.x &&
              a.rect.y < b.rect.y + b.rect.height &&
              a.rect.y + a.rect.height > b.rect.y,
            `strong ${a.id}/${b.id} at ${frame.t}ms`,
          ).toBe(false);
        }
    } else {
      expect(frame.counts.reduce((a, b) => a + b, 0)).toBe(4);
      for (const card of frame.strong) {
        expect(card.destination, `captured ${card.id}`).not.toBeNull();
        expect(
          Math.abs(card.rect.x - card.destination!.x) + Math.abs(card.rect.y - card.destination!.y),
        ).toBeLessThan(0.05);
      }
    }
  }
  expect(
    frames
      .filter((f) => f.counts.reduce((a, b) => a + b, 0) > 0)
      .every((f) => f.counts.reduce((a, b) => a + b, 0) === 4),
  ).toBe(true);
  await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('final.png') });
});
