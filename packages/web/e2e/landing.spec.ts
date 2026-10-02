// UX-15~17 / #200: 실제 Game/SoloSession/controller/Playback의 한 턴을 연속 관측한다.
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { landingSave, ppeokLandingSave } from './landing-fixtures.ts';

test.use({ video: 'on' });

test('원본 두 짝 접촉과 실제 획득 동시출발 @guest', async ({ page }, testInfo) => {
  const { save, events } = landingSave();
  expect(events.map((e) => e.type)).toEqual([
    'CardPlayed',
    'CardFlipped',
    'Matched',
    'Matched',
    'Captured',
    'ScoreChanged',
  ]);
  await page.goto('./?speed=normal#/');
  await page.evaluate(
    (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
    save,
  );
  await page.reload();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
  const before = await page.evaluate(() =>
    Object.fromEntries(
      [8, 10, 30, 31].map((id) => {
        const r = document
          .querySelector<HTMLElement>('[data-card-id="' + id + '"]')
          ?.getBoundingClientRect();
        return [id, r?.toJSON() ?? null];
      }),
    ),
  );
  const geometry = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    protected: Object.fromEntries(
      [
        '.table',
        '.deck-stack',
        '.deck-count',
        '.hand-zone',
        '.hud',
        '.mine-hud',
        '.decision-area',
      ].map((selector) => [
        selector,
        document.querySelector(selector)?.getBoundingClientRect().toJSON(),
      ]),
    ),
    floor: Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>('[aria-label="바닥"] [data-card-id]')].map(
        (el) => [el.dataset['cardId'], el.getBoundingClientRect().toJSON()],
      ),
    ),
  }));
  await page.evaluate(() => {
    type Frame = {
      t: number;
      busy: string | undefined;
      ids: Record<string, unknown>;
      captureLight: number;
      contactLight: number;
      counts: string[];
      contacts: string[];
      paint: Record<string, { month: string; x: number; y: number; width: number; height: number }>;
    };
    const frames: Frame[] = [];
    (window as unknown as { __landing: Frame[] }).__landing = frames;
    const started = performance.now();
    function sample() {
      const board = document.querySelector<HTMLElement>('[data-testid="board"]')!;
      const cards = [...board.querySelectorAll<HTMLElement>('[data-motion-card-id]')];
      frames.push({
        t: performance.now() - started,
        busy: board.dataset['busy'],
        ids: Object.fromEntries(
          cards.map((el) => [el.dataset['motionCardId'], el.getBoundingClientRect().toJSON()]),
        ),
        captureLight: board.querySelectorAll('[data-contact-light="capture"]').length,
        contactLight: board.querySelectorAll('[data-contact-light="contact"]').length,
        contacts: cards
          .filter((el) => el.querySelector('[data-contact-light]'))
          .map((el) => el.dataset['motionCardId']!),
        paint: Object.fromEntries(
          [...cards, ...board.querySelectorAll<HTMLElement>('[aria-label="바닥"] [data-card-id]')]
            .filter((el) => getComputedStyle(el).visibility !== 'hidden')
            .map((el) => {
              const id = el.dataset['motionCardId'] ?? el.dataset['cardId']!;
              const r = el.getBoundingClientRect(),
                style = getComputedStyle(el);
              const pad =
                (parseFloat(style.outlineWidth) || 0) + (parseFloat(style.outlineOffset) || 0);
              const angle = Number(el.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] ?? 0);
              const projected =
                pad *
                (Math.abs(Math.cos((angle * Math.PI) / 180)) +
                  Math.abs(Math.sin((angle * Math.PI) / 180)));
              return [
                id,
                {
                  month: String(Math.floor(Number(id) / 4)),
                  x: r.x - projected,
                  y: r.y - projected,
                  width: r.width + projected * 2,
                  height: r.height + projected * 2,
                },
              ];
            }),
        ),
        counts: [...board.querySelectorAll('.captured-zone.mine [data-cards]')].map((el) =>
          el.getAttribute('data-cards')!,
        ),
      });
      if (
        performance.now() - started < 2800 &&
        !document.querySelector<HTMLElement>('[data-testid="solo"]')?.dataset['playTimings']
      )
        requestAnimationFrame(sample);
    }
    document.querySelector<HTMLElement>('[aria-label="내 손패"] [data-slot="10"]')!.click();
    requestAnimationFrame(sample);
  });
  await expect(page.getByTestId('board')).toHaveAttribute('data-busy', 'false', { timeout: 5000 });
  const frames = await page.evaluate(
    () =>
      (
        window as unknown as {
          __landing: {
            t: number;
            ids: Record<string, { x: number; y: number; width: number; height: number }>;
            captureLight: number;
            contactLight: number;
            counts: string[];
            contacts: string[];
            paint: Record<
              string,
              { month: string; x: number; y: number; width: number; height: number }
            >;
          }[];
        }
      ).__landing,
  );
  await writeFile(
    testInfo.outputPath('frames.json'),
    JSON.stringify({ before, geometry, events, frames }),
  );
  expect(frames.some((frame) => frame.ids['10'] !== undefined)).toBe(true);
  expect(frames.some((frame) => frame.ids['30'] !== undefined)).toBe(true);
  expect(frames.some((frame) => frame.contactLight > 0)).toBe(true);
  expect(frames.some((frame) => frame.captureLight === 4)).toBe(true);
  // 접촉 light가 시작된 후부터 강한 강조까지 검사한다. flight의 상공 통과는 제외한다.
  for (const frame of frames.filter((f) => f.counts.map(Number).reduce((a, b) => a + b, 0) === 0)) {
    for (const id of frame.contacts.filter((id) => id === '10' || id === '30')) {
      const a = frame.paint[id]!;
      for (const [other, b] of Object.entries(frame.paint)) {
        if (other === id || a.month === b.month) continue;
        const overlap =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlap, `contact ${id}/${other} at ${frame.t}ms`).toBe(false);
      }
    }
  }
  const strong = frames.find((frame) => frame.captureLight === 4)!;
  expect(strong.counts.map(Number).reduce((a, b) => a + b, 0)).toBe(0);
  const playPair = strong.ids['10']!,
    playTarget = strong.ids['8']!;
  expect(Math.abs(playPair.x - playTarget.x)).toBeLessThan(playTarget.width);
  expect(Math.abs(playPair.y - playTarget.y)).toBeLessThan(playTarget.height);
  const flipPair = strong.ids['30']!,
    flipTarget = strong.ids['31']!;
  expect(Math.abs(flipPair.x - flipTarget.x)).toBeLessThan(flipTarget.width);
  expect(Math.abs(flipPair.y - flipTarget.y)).toBeLessThan(flipTarget.height);
  for (const id of ['8', '31']) {
    const a = strong.ids[id]!,
      b = before[id as keyof typeof before]!;
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeLessThan(0.05);
  }
  const start = frames.find(
    (f) =>
      f.captureLight === 0 &&
      Number(f.counts[0]) === 1 &&
      f.ids['8'] !== undefined &&
      f.ids['10'] !== undefined,
  )!;
  expect(start).toBeDefined();
  for (const [a, b] of [
    ['8', '10'],
    ['31', '30'],
  ]) {
    const x0 = strong.ids[a!]!,
      y0 = strong.ids[b!]!,
      x1 = start.ids[a!]!,
      y1 = start.ids[b!]!;
    expect(Math.abs(x0.x - y0.x - (x1.x - y1.x))).toBeLessThan(0.05);
    expect(Math.abs(x0.y - y0.y - (x1.y - y1.y))).toBeLessThan(0.05);
  }
  await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
  await testInfo.attach('actual-landing-frames', {
    body: JSON.stringify({
      seed: 1,
      dealer: 1,
      action: { type: 'play', seat: 0, card: 10 },
      before,
      events,
      frames,
    }),
    contentType: 'application/json',
  });
  await writeFile(
    testInfo.outputPath('frames.json'),
    JSON.stringify({ before, geometry, events, frames }),
  );
  await page.screenshot({ path: testInfo.outputPath('final.png') });
});

test('보너스 뻑은 약한 관계만 표시하고 실제 5장 잔류 @guest', async ({ page }, testInfo) => {
  const { save, events } = ppeokLandingSave();
  expect(events.map((e) => e.type)).toEqual([
    'CardPlayed',
    'CardFlipped',
    'CardFlipped',
    'CardFlipped',
    'Ppeok',
  ]);
  const initialCount = save.session.game.seats[0].captured;
  const count = Object.values(initialCount).reduce((n, pile) => n + pile.length, 0);
  await page.goto('./?speed=normal#/');
  await page.evaluate(
    (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
    save,
  );
  await page.reload();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
  await page.evaluate(() => {
    const frames: {
      t: number;
      ids: Record<string, unknown>;
      captureLight: number;
      count: number;
    }[] = [];
    (window as unknown as { __ppeok: typeof frames }).__ppeok = frames;
    const started = performance.now();
    function sample() {
      const root = document.querySelector<HTMLElement>('[data-testid="board"]')!;
      frames.push({
        t: performance.now() - started,
        ids: Object.fromEntries(
          [...root.querySelectorAll<HTMLElement>('[data-motion-card-id]')].map((el) => [
            el.dataset['motionCardId'],
            el.getBoundingClientRect().toJSON(),
          ]),
        ),
        captureLight: root.querySelectorAll('[data-contact-light="capture"]').length,
        count: [...root.querySelectorAll('.captured-zone.mine [data-cards]')].reduce(
          (n, el) => n + Number(el.getAttribute('data-cards')),
          0,
        ),
      });
      if (
        performance.now() - started < 3500 &&
        !document.querySelector<HTMLElement>('[data-testid="solo"]')?.dataset['playTimings']
      )
        requestAnimationFrame(sample);
    }
    document.querySelector<HTMLElement>('[aria-label="내 손패"] [data-slot="15"]')!.click();
    requestAnimationFrame(sample);
  });
  await expect(page.getByTestId('board')).toHaveAttribute('data-busy', 'false', { timeout: 6000 });
  const frames = await page.evaluate(
    () =>
      (
        window as unknown as {
          __ppeok: {
            t: number;
            ids: Record<string, unknown>;
            captureLight: number;
            count: number;
          }[];
        }
      ).__ppeok,
  );
  expect(frames.some((f) => f.ids['15'] !== undefined)).toBe(true);
  expect(frames.some((f) => f.ids['12'] !== undefined)).toBe(true);
  expect(frames.every((f) => f.captureLight === 0 && f.count === count)).toBe(true);
  const group = page.locator('[aria-label="바닥"] [data-month="4"]');
  const ids = await group
    .locator('[data-card-id]')
    .evaluateAll((els) =>
      els.map((el) => Number((el as HTMLElement).dataset['cardId'])).sort((a, b) => a - b),
    );
  expect(ids).toEqual([12, 13, 15, 48, 50]);
  await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
  await writeFile(
    testInfo.outputPath('frames.json'),
    JSON.stringify({ seed: 1827, events, frames }),
  );
  await page.screenshot({ path: testInfo.outputPath('final.png') });
});
