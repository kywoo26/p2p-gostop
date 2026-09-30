// #131 / FR-16·FR-53·UX-T05·U15·NF-08: 실제 종료 턴의 재생과 명시 결과 확인.
import { expect, test } from '@playwright/test';
import { resultScenario } from '../src/game/solo-result.test-helper.ts';

for (const mode of ['normal', 'fast', 'reduced', 'skip'] as const) {
  for (const manual of [false, true]) {
    test(`@guest ${mode} 수동=${manual}: 마지막 턴→결과→확인→받기→다음 판`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
      await page.goto('./');
      await page.evaluate((session) => {
        localStorage.setItem(
          'gostop.solo.v1',
          JSON.stringify({ version: 1, difficulty: 'easy', session }),
        );
      }, resultScenario(manual));
      await page.goto(`./?speed=${mode === 'fast' ? 'fast' : 'normal'}#/game`);
      const game = page.getByTestId('solo');
      await expect(game).toBeVisible();
      await page.evaluate(() => {
        const observations = { blankAfterAck: false, acknowledged: false };
        (window as unknown as { __result: typeof observations }).__result = observations;
        new MutationObserver(() => {
          const overlay = document.querySelector('.overlay');
          const game = document.querySelector('[data-testid="solo"]');
          if (
            observations.acknowledged &&
            game?.getAttribute('data-phase') !== 'playing' &&
            !overlay
          )
            observations.blankAfterAck = true;
        }).observe(document.querySelector('[data-testid="solo"]')!, {
          subtree: true,
          attributes: true,
          childList: true,
        });
      });
      // 마지막 한 장은 C01 유일수 자동 진행이 실제 내기까지 수행한다.
      if (manual) await page.locator('[aria-label="내 손패"] [data-slot="16"]').click();
      if (manual) {
        await expect(page.locator('[data-choice="stop"]')).toBeVisible();
        await page.locator('[data-choice="stop"]').click();
      }
      if (mode !== 'reduced') {
        await expect(game).toHaveAttribute('data-phase', 'pushDecision');
        await expect(page.locator('[data-choice="acknowledge"]')).toHaveCount(0);
      }
      if (mode === 'skip') {
        await expect(page.getByTestId('board')).toHaveAttribute('data-busy', 'true');
        await page
          .getByTestId('board')
          .locator('.center')
          .click({ position: { x: 5, y: 5 } });
      }
      await expect(page.locator('[data-choice="acknowledge"]')).toBeVisible();
      await expect(page.getByTestId('settlement-headline')).toContainText('승리');
      await expect(page.getByTestId('settlement-headline')).toContainText(
        manual ? '스톱' : '자동 스톱',
      );
      await expect(page.getByRole('heading', { name: '받을 경우 예상 금액' })).toBeVisible();
      await expect(page.locator('.amount')).toContainText('7점');
      await expect(page.locator('.amount')).toContainText('700냥');
      await expect(page.locator('[data-choice="accept"]')).toHaveCount(0);
      await expect(page.locator('[data-choice="push"]')).toHaveCount(0);
      await expect(page.locator('[data-choice="next"]')).toHaveCount(0);
      await expect(page.getByTestId('balance-0')).toHaveCount(0);
      await expect(game).toHaveAttribute('data-phase', 'pushDecision');
      await expect(game).toHaveAttribute('data-rounds-played', '0');
      const before = await page.evaluate(
        () => JSON.parse(localStorage.getItem('gostop.solo.v1')!).session,
      );
      expect(before.records).toHaveLength(0);
      expect(before.ledger.entries).toHaveLength(0);
      await page.evaluate(() => {
        (window as unknown as { __result: { acknowledged: boolean } }).__result.acknowledged = true;
      });
      await page.locator('[data-choice="acknowledge"]').click();
      await expect(page.locator('[data-choice="accept"]')).toBeVisible();
      await expect(page.getByTestId('settlement-headline')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(game).toHaveAttribute('data-phase', 'pushDecision');
      await page.locator('[data-choice="accept"]').click();
      await expect(page.locator('[data-choice="next"]')).toBeVisible();
      await expect(page.getByTestId('settlement-headline')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(game).toHaveAttribute('data-round', '1');
      const after = await page.evaluate(
        () => JSON.parse(localStorage.getItem('gostop.solo.v1')!).session,
      );
      expect(after.records).toHaveLength(1);
      expect(after.ledger.entries).toHaveLength(1);
      const observations = await page.evaluate(
        () => (window as unknown as { __result: { blankAfterAck: boolean } }).__result,
      );
      expect(observations.blankAfterAck).toBe(false);
      await page.locator('[data-choice="next"]').click();
      await expect(game).toHaveAttribute('data-round', '2');
    });
  }
}
