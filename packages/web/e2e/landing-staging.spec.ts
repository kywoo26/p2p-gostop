// UX-15~17 / #200: 실제 staging 원본 위치와 모션 복제를 분리한다.
import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import {
  handBonusLandingSave,
  ppeokLandingSave,
  targetChainLandingSave,
} from './landing-fixtures.ts';

test.use({ video: 'on' });

interface StageFrame {
  t: number;
  weakIds: string[];
  native: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    animations: number;
    hidden: boolean;
  }[];
  ghosts: { id: string; x: number; y: number; width: number; height: number }[];
  counts: number[];
}

async function sample(page: Page) {
  await page.evaluate(() => {
    const frames: StageFrame[] = [];
    const observation = { frames, stop: false };
    (window as unknown as { __stageObservation: typeof observation }).__stageObservation =
      observation;
    const start = performance.now();
    function frame() {
      const root = document.querySelector<HTMLElement>('[data-testid="board"]');
      if (!root) return;
      frames.push({
        t: performance.now() - start,
        weakIds: [...root.querySelectorAll<HTMLElement>('[data-motion-card-id]')]
          .filter((el) => el.querySelector('[data-contact-light="contact"]'))
          .map((el) => el.dataset['motionCardId']!),
        native: [...root.querySelectorAll<HTMLElement>('.staging [data-card-id]')].map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            id: el.dataset['cardId']!,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            animations: el
              .getAnimations()
              .filter((a) => a.playState !== 'idle' && a.playState !== 'finished').length,
            hidden: el.style.visibility === 'hidden',
          };
        }),
        ghosts: [...root.querySelectorAll<HTMLElement>('[data-motion-card-id]')].map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            id: el.dataset['motionCardId']!,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }),
        counts: [...root.querySelectorAll('.captured-zone.mine [data-cards]')].map((el) =>
          Number(el.getAttribute('data-cards')),
        ),
      });
      if (!observation.stop && performance.now() - start < 6000) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

async function frames(page: Page): Promise<StageFrame[]> {
  return page.evaluate(() => {
    const observation = (
      window as unknown as { __stageObservation: { frames: StageFrame[]; stop: boolean } }
    ).__stageObservation;
    observation.stop = true;
    return observation.frames;
  });
}

function stageIntact(observed: StageFrame[], id: string) {
  const active = observed.filter((f) => f.native.some((c) => c.id === id));
  expect(active.length, `stage ${id}`).toBeGreaterThan(2);
  expect(active.some((f) => f.ghosts.some((c) => c.id === id))).toBe(true);
  for (const f of active) {
    const native = f.native.find((c) => c.id === id)!;
    expect(native.animations, `native ${id} at ${f.t}ms`).toBe(0);
    expect(native.hidden).toBe(true);
    expect(f.ghosts.filter((c) => c.id === id)).toHaveLength(1);
    expect(native.width).toBeGreaterThan(0);
    expect(native.height).toBeGreaterThan(0);
  }
  const first = active[0]!.native.find((c) => c.id === id)!;
  expect(
    active.every((f) => {
      const c = f.native.find((c) => c.id === id)!;
      return Math.abs(c.x - first.x) + Math.abs(c.y - first.y) < 0.05;
    }),
  ).toBe(true);
}

for (const mode of ['skip', 'reduced'] as const) {
  test(`손패 보너스 ${mode}는 원본 가림·ghost를 마감하고 실제 획득만 반영한다 @guest`, async ({
    page,
  }, testInfo) => {
    const { save, events } = handBonusLandingSave();
    if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?speed=normal#/');
    await page.evaluate(
      (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
      save,
    );
    await page.reload();
    await page.getByRole('button', { name: /이어하기/ }).click();
    await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
    await sample(page);
    await page.locator('[aria-label="내 손패"] [data-slot="49"]').click();
    if (mode === 'skip') {
      await expect(page.locator('[data-motion-card-id="49"]')).toHaveCount(1);
      const count = await page
        .locator('.captured-zone.mine [data-cards]')
        .evaluateAll((els) =>
          els.reduce((sum, el) => sum + Number(el.getAttribute('data-cards')), 0),
        );
      expect(count).toBe(0);
      const empty = await page.locator('.center').evaluate((el) => {
        const r = el.getBoundingClientRect();
        for (const x of [r.left + 2, r.right - 2, r.left + r.width / 2])
          for (const y of [r.top + 2, r.bottom - 2, r.top + r.height / 2]) {
            const target = document.elementFromPoint(x, y);
            if (
              target?.closest('.center') &&
              !target.closest('.card, .group, .deck-area, button, [role="dialog"]')
            )
              return { x, y };
          }
        return null;
      });
      expect(empty).not.toBeNull();
      await page.mouse.click(empty!.x, empty!.y);
    }
    await expect(page.getByTestId('solo')).toHaveAttribute('data-play-timings', /.+/, {
      timeout: 5000,
    });
    const observed = await frames(page);
    await writeFile(testInfo.outputPath('frames.json'), JSON.stringify({ mode, events, observed }));
    if (mode === 'reduced') expect(observed.every((f) => f.ghosts.length === 0)).toBe(true);
    expect(
      await page
        .locator('.captured-zone.mine [data-cards]')
        .evaluateAll((els) =>
          els.reduce((sum, el) => sum + Number(el.getAttribute('data-cards')), 0),
        ),
    ).toBe(1);
    await expect(page.locator('[aria-label="내 손패"] [data-slot="38"]')).toBeVisible();
    await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
    const cleanup = await page.locator('[data-testid="board"]').evaluate((root) => ({
      hidden: [...root.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
        (el) => el.style.visibility === 'hidden',
      ).length,
      // 손패 폭탄 힌트의 무한 CSS 효과는 재생 모션과 수명이 다르다.
      animations: root.getAnimations({ subtree: true }).filter((a) => {
        const target = (a.effect as KeyframeEffect)?.target;
        return !(
          a instanceof CSSAnimation &&
          a.effect?.getTiming().iterations === Infinity &&
          target instanceof Element &&
          target.closest('[aria-label="내 손패"]')
        );
      }).length,
      details: root.getAnimations({ subtree: true }).map((a) => ({
        state: a.playState,
        type: a.constructor.name,
        target: (a.effect as KeyframeEffect)?.target?.outerHTML.slice(0, 300),
        timing: a.effect?.getTiming(),
      })),
    }));
    await writeFile(testInfo.outputPath('cleanup.json'), JSON.stringify(cleanup));
    expect({ hidden: cleanup.hidden, animations: cleanup.animations }).toEqual({
      hidden: 0,
      animations: 0,
    });
  });
}

test('손패 보너스는 고정 원본과 ghost 이동을 유지하며 실제 획득·보충한다 @guest', async ({
  page,
}, testInfo) => {
  const { save, events } = handBonusLandingSave();
  expect(events.map((e) => e.type)).toEqual([
    'CardPlayed',
    'Captured',
    'BonusGained',
    'CardDrawn',
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
  await sample(page);
  await page.locator('[aria-label="내 손패"] [data-slot="49"]').click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-play-timings', /.+/, {
    timeout: 5000,
  });
  const observed = await frames(page);
  await writeFile(
    testInfo.outputPath('frames.json'),
    JSON.stringify({ seed: 2, events, observed }),
  );
  stageIntact(observed, '49');
  expect(observed[0]!.counts.reduce((a, b) => a + b, 0)).toBe(0);
  expect(observed.at(-1)!.counts.reduce((a, b) => a + b, 0)).toBe(1);
  await expect(page.locator('[aria-label="내 손패"] [data-slot="38"]')).toBeVisible();
  await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
});

test('새 staging을 고른 다음에도 원본 target 관계를 이어 실제 획득한다 @guest', async ({
  page,
}, testInfo) => {
  const save = targetChainLandingSave();
  await page.goto('./?speed=normal#/');
  await page.evaluate(
    (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
    save,
  );
  await page.reload();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
  await sample(page);
  await page.locator('[aria-label="내 손패"] [data-slot="7"]').click();
  await page.locator('[data-choice="target-6"]').click();
  await expect(page.locator('[data-choice="target-28"]')).toBeVisible();
  const targetBefore = await page
    .locator('[data-card-id="28"]')
    .evaluate((el) => el.getBoundingClientRect().toJSON());
  await page.locator('[data-choice="target-28"]').click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-busy', 'false', { timeout: 5000 });
  const observed = await frames(page);
  await writeFile(
    testInfo.outputPath('frames.json'),
    JSON.stringify({ targetBefore, target: 28, observed }),
  );
  stageIntact(observed, '29');
  if (testInfo.project.name === 'chromium') {
    const contact = observed.find((f) => f.weakIds.includes('29'));
    expect(contact).toBeDefined();
    const held = contact!.ghosts.find((c) => c.id === '28')!;
    expect(Math.abs(held.x - targetBefore.x) + Math.abs(held.y - targetBefore.y)).toBeLessThan(
      0.05,
    );
    expect(contact!.counts.reduce((a, b) => a + b, 0)).toBe(0);
  }
  expect(observed.at(-1)!.counts.reduce((a, b) => a + b, 0)).toBe(4);
  await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
});

test('덱 보너스는 staging 원본을 이동시키지 않고 뻑에 남는다 @guest', async ({
  page,
}, testInfo) => {
  const { save, events } = ppeokLandingSave();
  await page.goto('./?speed=normal#/');
  await page.evaluate(
    (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
    save,
  );
  await page.reload();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
  await sample(page);
  await page.locator('[aria-label="내 손패"] [data-slot="15"]').click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-play-timings', /.+/, {
    timeout: 5000,
  });
  const observed = await frames(page);
  await writeFile(
    testInfo.outputPath('frames.json'),
    JSON.stringify({ seed: 1827, events, observed }),
  );
  for (const id of ['48', '50']) stageIntact(observed, id);
  const count = observed[0]!.counts.reduce((a, b) => a + b, 0);
  expect(observed.every((f) => f.counts.reduce((a, b) => a + b, 0) === count)).toBe(true);
  await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
});

test('두 선택 연쇄의 새 staging ghost는 홈에서 끝나고 복원은 현재 관계만 표시한다 @guest', async ({
  page,
}, testInfo) => {
  const save = targetChainLandingSave();
  await page.goto('./?speed=normal#/');
  await page.evaluate(
    (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
    save,
  );
  await page.reload();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
  await sample(page);
  await page.locator('[aria-label="내 손패"] [data-slot="7"]').click();
  await page.locator('[data-choice="target-6"]').click();
  await expect(page.locator('[data-choice="target-28"]')).toBeVisible();
  const observed = await frames(page);
  await writeFile(
    testInfo.outputPath('frames.json'),
    JSON.stringify({ tuple: [3839809690, 1129524092, 3832060461, 2933933213], observed }),
  );
  stageIntact(observed, '29');
  await page.evaluate(() => {
    (window as unknown as { __oldStageRoot: HTMLElement }).__oldStageRoot =
      document.querySelector<HTMLElement>('[data-testid="board"]')!;
  });
  await page.getByTestId('game-menu').click();
  await page.getByRole('button', { name: '홈으로', exact: true }).click();
  await expect(page.getByRole('button', { name: /이어하기/ })).toBeVisible();
  await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
  const old = await page.evaluate(() => {
    const root = (window as unknown as { __oldStageRoot: HTMLElement }).__oldStageRoot;
    return {
      ghosts: root.querySelectorAll('[data-motion-card-id]').length,
      hidden: [...root.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
        (el) => el.style.visibility === 'hidden',
      ).length,
      animations: root.getAnimations({ subtree: true }).length,
    };
  });
  await writeFile(testInfo.outputPath('home.json'), JSON.stringify(old));
  expect(old).toEqual({ ghosts: 0, hidden: 0, animations: 0 });
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.locator('[data-choice="target-28"]')).toBeVisible();
  await expect(page.locator('[data-motion-card-id="29"]')).toHaveCount(0);
  await expect(page.locator('.staging [data-card-id="29"]')).toBeVisible();
  await page.locator('[data-choice="target-28"]').click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-busy', 'false', { timeout: 5000 });
  await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
});
