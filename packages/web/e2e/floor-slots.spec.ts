// #201 / UX-06·16·17: 실제 앱의 합법 저장 fixture, 제품에는 프레임 관찰기를 넣지 않는다.
import { expect, test, type Page } from '@playwright/test';
import { TIMING_FIXTURES, timingSave } from './timing-fixtures.ts';

async function resumeFixture(page: Page) {
  const fixture = TIMING_FIXTURES.find((f) => f.id === 'match-capture')!;
  await page.goto('./?speed=fast#/');
  await page.evaluate(
    (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
    timingSave(fixture),
  );
  await page.reload();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
  return fixture;
}

test('바닥 무관 앵커: 실제 매칭·획득 중 연속 프레임 @layout', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const fixture = await resumeFixture(page);
  const ids = fixture.floor.filter(([month]) => month !== 4).flatMap(([, cards]) => cards);
  await page.evaluate((ids) => {
    const read = () =>
      ids.map((id) => {
        const el = document.querySelector<HTMLElement>(`.floor [data-card-id="${id}"]`);
        if (!el)
          throw Error(
            JSON.stringify({
              id,
              actual: [...document.querySelectorAll<HTMLElement>('.floor [data-card-id]')].map(
                (card) => Number(card.dataset['cardId']),
              ),
            }),
          );
        const r = el.getBoundingClientRect();
        const table = document.querySelector('.table')!.getBoundingClientRect();
        return {
          id,
          slot: el.closest('[data-floor-slot]')!.getAttribute('data-floor-slot'),
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          tableX: table.x,
          tableY: table.y,
          tableWidth: table.width,
          tableHeight: table.height,
        };
      });
    const root = document.querySelector<HTMLElement>('[data-testid="solo"]')!;
    const initial = root.dataset['playTimings'],
      before = read();
    const frames: ReturnType<typeof read>[] = [];
    let completedFrames = 0;
    const sample = new Promise<{ before: typeof before; frames: typeof frames }>(
      (resolve, reject) => {
        const next = () => {
          try {
            frames.push(read());
          } catch (error) {
            reject(error);
            return;
          }
          if (root.dataset['playTimings'] !== initial) completedFrames++;
          if (completedFrames === 3) {
            resolve({ before, frames });
            return;
          }
          if (frames.length >= 120) {
            reject(Error('턴 완료 표식 미도달'));
            return;
          }
          requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      },
    );
    (window as unknown as { floorSample: typeof sample }).floorSample = sample;
  }, ids);
  await page.locator(`[aria-label="내 손패"] [data-slot="${fixture.card}"]`).click();
  const sample = await page.evaluate(
    () =>
      (window as unknown as { floorSample: Promise<{ before: unknown[]; frames: unknown[][] }> })
        .floorSample,
  );
  expect(sample.frames.length).toBeGreaterThan(0);
  await info.attach('floor-frames.json', {
    body: JSON.stringify({ fixture: fixture.id, ...sample }),
    contentType: 'application/json',
  });
  console.log('FLOOR_ACTUAL_FRAMES', JSON.stringify({ engine: info.project.name, ...sample }));
  const cards = (frame: unknown[]) =>
    frame.map((card) => {
      const { id, slot, x, y, width, height } = card as Record<string, unknown>;
      return { id, slot, x, y, width, height };
    });
  for (const frame of sample.frames) expect(cards(frame)).toEqual(cards(sample.before));
  await info.attach('floor-final.png', {
    body: await page.locator('.table').screenshot(),
    contentType: 'image/png',
  });
  const actual = await page
    .locator('.floor [data-card-id]')
    .evaluateAll((els) =>
      els.map((el) => Number((el as HTMLElement).dataset['cardId'])).sort((a, b) => a - b),
    );
  const authoritative = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1')!)
      .session.game.floor.flatMap((g: { cards: number[] }) => g.cards)
      .sort((a: number, b: number) => a - b),
  );
  expect(actual).toEqual(authoritative);
});

test('floor coarse rotation: cover locks input and portrait restores card slots @layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await resumeFixture(page);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  const cards = () =>
    page.locator('.floor [data-card-id]').evaluateAll((els) =>
      els.map((el) => ({
        id: (el as HTMLElement).dataset['cardId'],
        slot: el.closest('[data-floor-slot]')!.getAttribute('data-floor-slot'),
      })),
    );
  const before = await cards();
  expect(await page.locator('.hand button:not([disabled])').count()).toBeGreaterThan(0);
  await page.setViewportSize({ width: 780, height: 360 });
  await expect(
    page.getByRole('alert').filter({ hasText: '세로로 돌려 게임을 계속하세요' }),
  ).toBeVisible();
  await expect(page.locator('.hand button:not([disabled])')).toHaveCount(0);
  expect(await cards()).toEqual(before);
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(
    page.getByRole('alert').filter({ hasText: '세로로 돌려 게임을 계속하세요' }),
  ).toHaveCount(0);
  expect(await page.locator('.hand button:not([disabled])').count()).toBeGreaterThan(0);
  expect(await cards()).toEqual(before);
  const widths = await page
    .locator('.floor .card, .hand .card')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).width));
  expect(widths.every((w) => w === '48px')).toBe(true);
  const captured = await page
    .locator('.captured-zone .card')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).width));
  expect(captured.every((w) => w === '32px')).toBe(true);
});
