// #111·#112: 실제 솔로 저장 세션의 손패를 터치·키보드로 조작한다.
import { PRESETS, type GameState } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { expect, test, type Page } from '@playwright/test';
import { createSession } from '../src/game/session.ts';

function saved(game: GameState) {
  const base = createSession({
    preset: 'standard',
    rules: PRESETS.standard,
    perPoint: 100,
    startBalance: 10_000,
    names: ['나', '상대'],
    seed: 77,
  }).session;
  return { version: 1, difficulty: 'easy', session: { ...base, game } };
}

async function open(page: Page, game: GameState) {
  await page.addInitScript((save) => {
    localStorage.setItem('gostop.solo.v1', JSON.stringify(save));
  }, saved(game));
  await page.goto('./?speed=instant#/game');
  await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
}

async function mine(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('gostop.solo.v1');
    return raw
      ? (
          JSON.parse(raw) as {
            session: { actions: { type: string; seat: number; card?: number; month?: number }[] };
          }
        ).session.actions.filter((action) => action.seat === 0)
      : [];
  });
}

const bombGame = () => createScenario({ hands: [[0, 1, 2, 8], [12]], floor: [3] });

test('터치: pointercancel 뒤 합성 click은 무시하고 새 탭에서 폭탄 한 번', async ({ page }) => {
  await open(page, bombGame());
  const card = page.locator('[data-slot="0"]');
  await card.evaluate((button) => {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7 }));
    button.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 7 }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  });
  expect(await mine(page)).toHaveLength(0);
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect
    .poll(async () => (await mine(page)).filter((a) => a.type === 'bomb'))
    .toHaveLength(1);
  expect((await mine(page)).filter((a) => a.type === 'play')).toHaveLength(0);
});

test('키보드: 폭탄 카드의 보조 행동은 선택한 한 장만 낸다', async ({ page }) => {
  await open(page, bombGame());
  await page.locator('[data-slot="0"]').focus();
  await page.keyboard.press('Shift+Enter');
  await expect
    .poll(async () => (await mine(page)).find((a) => a.type === 'play'))
    .toMatchObject({ type: 'play', seat: 0, card: 0 });
  expect((await mine(page)).filter((a) => a.type === 'bomb')).toHaveLength(0);
});

test('흔들기: 카드 탭 뒤 두 수동 선택, 거절 전 자동 선언 없음', async ({ page }) => {
  await open(page, createScenario({ hands: [[0, 1, 2, 8], [12]], floor: [16] }));
  await page.locator('[data-slot="0"]').click();
  const sheet = page.getByRole('dialog', { name: '흔들고 내기' });
  await expect(sheet.getByRole('button', { name: '흔들고 내기' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '그냥 내기' })).toBeVisible();
  expect((await mine(page)).filter((a) => a.type === 'shake')).toHaveLength(0);
  await sheet.getByRole('button', { name: '그냥 내기' }).click();
  await expect
    .poll(async () => (await mine(page)).filter((a) => a.type === 'shake'))
    .toHaveLength(1);
});
