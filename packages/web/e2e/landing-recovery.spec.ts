// #237 P1 / UX-15~17: 합법 선택 복원에서 초기 pose를 영구 보관하거나 원본을 잃지 않는다.
import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { restoredLandingSave } from './landing-fixtures.ts';
test.use({ video: 'on' });
async function observed(page: Page) {
  return page.evaluate(async () => {
    for (let n = 0; n < 8; n++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const original = document.querySelector<HTMLElement>('[aria-label="바닥"] [data-card-id="6"]')!;
    const ghost = document.querySelector<HTMLElement>('[data-motion-card-id="6"]');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      seq: document.querySelector<HTMLElement>('[data-testid="solo"]')?.dataset['seq'],
      original: original.getBoundingClientRect().toJSON(),
      visibility: getComputedStyle(original).visibility,
      ghost: ghost?.getBoundingClientRect().toJSON(),
      incoming: document.querySelector('[data-motion-card-id="7"]') !== null,
      light: document.querySelectorAll('[data-contact-light]').length,
    };
  });
}
function intact(value: Awaited<ReturnType<typeof observed>>) {
  expect(value.light).toBe(0); // 복원은 과거 관계를 새로 재생하지 않는다.
  if (value.ghost !== undefined) {
    expect(value.incoming).toBe(true);
    expect(
      Math.abs(value.original.x - value.ghost.x) + Math.abs(value.original.y - value.ghost.y),
    ).toBeLessThan(0.05);
    expect(value.ghost.x).toBeGreaterThanOrEqual(0);
  } else expect(value.visibility).toBe('visible');
}
test('원본 선택 복원 → 홈 → 복원 → 선택 확정에서 stale target 숨김0 @guest', async ({
  page,
}, testInfo) => {
  const save = restoredLandingSave();
  expect(save.session.game.pending).toMatchObject({
    kind: 'target',
    source: 'flip',
    card: 29,
    options: [28, 30],
  });
  await page.goto('./?speed=normal#/');
  await page.evaluate(
    (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
    save,
  );
  await page.reload();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.locator('[data-choice="target-28"]')).toBeVisible();
  const first = await observed(page);
  await writeFile(testInfo.outputPath('restored-before.json'), JSON.stringify(first));
  await page.screenshot({ path: testInfo.outputPath('restored.png') });
  intact(first);
  await page.getByTestId('game-menu').click();
  await page.getByRole('button', { name: '홈으로', exact: true }).click();
  await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.locator('[data-choice="target-28"]')).toBeVisible();
  const second = await observed(page);
  await writeFile(testInfo.outputPath('restored-again.json'), JSON.stringify(second));
  intact(second);
  await page.locator('[data-choice="target-28"]').click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-busy', 'false', { timeout: 5000 });
  await expect(page.locator('[data-landing-scene]')).toHaveCount(0);
});
