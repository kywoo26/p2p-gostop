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

const reviewGame = () =>
  createScenario({ hands: [[0, 4, 8, 12, 16, 20, 24, 28, 32, 36], [40]], floor: [44] });

for (const button of ['right', 'middle'] as const) {
  test(`리뷰 회귀: ${button} 보조 버튼은 패를 내지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await open(page, reviewGame());
    const box = (await page.locator('[data-slot="0"]').boundingBox())!;
    await page.mouse.move(box.x + 12, box.y + 40);
    await page.mouse.down({ button });
    await page.mouse.up({ button });
    expect(await mine(page)).toHaveLength(0);
    await expect(page.locator('.hand .selected')).toHaveCount(0);
  });
}
for (const destination of [
  'right-edge',
  'left-edge',
  'above',
  'other-card',
  'gap',
  'cancel',
] as const) {
  test(`리뷰 회귀: ${destination} 놓기는 취소, 새 탭은 정확히 한 번`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await open(page, reviewGame());
    const card = page.locator('[data-slot="0"]');
    const first = (await card.boundingBox())!;
    const next = (await page.locator('[data-slot="4"]').boundingBox())!;
    const third = (await page.locator('[data-slot="8"]').boundingBox())!;
    await page.mouse.move(first.x + 12, first.y + 40);
    await page.mouse.down();
    await expect(card).toHaveClass(/selected/);
    if (destination === 'cancel') {
      await card.evaluate((el) =>
        el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })),
      );
    } else {
      const x =
        destination === 'right-edge'
          ? 411
          : destination === 'left-edge'
            ? 1
            : destination === 'other-card'
              ? third.x + 12
              : destination === 'gap'
                ? (first.x + first.width + next.x) / 2
                : first.x + 12;
      const y = destination === 'above' ? first.y - 30 : first.y + 40;
      await page.mouse.move(x, y, { steps: 4 });
    }
    await page.mouse.up();
    expect(await mine(page)).toHaveLength(0);
    await expect(page.locator('.hand .selected')).toHaveCount(0);
    await card.click();
    await expect
      .poll(async () => (await mine(page)).filter((a) => a.type === 'play'))
      .toEqual([{ type: 'play', seat: 0, card: 0 }]);
  });
}

for (const key of ['Enter', 'Space']) {
  test(`리뷰 fixture: ${key} 키보드 입력은 한 번 유지`, async ({ page }) => {
    await open(page, reviewGame());
    await page.locator('[data-slot="0"]').focus();
    await page.keyboard.press(key);
    await expect
      .poll(async () => (await mine(page)).filter((a) => a.type === 'play'))
      .toEqual([{ type: 'play', seat: 0, card: 0 }]);
  });
}
