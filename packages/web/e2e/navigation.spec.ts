import { expect, type Page, test } from '@playwright/test';

async function playOneRound(page: Page) {
  for (let i = 0; i < 300; i++) {
    const step = await page.waitForFunction(
      () => {
        const solo = document.querySelector<HTMLElement>('[data-testid="solo"]');
        if (Number(solo?.dataset['roundsPlayed']) >= 1) return 'done';
        const board = document.querySelector<HTMLElement>(
          '[data-testid="board"][data-awaiting="me"]',
        );
        if (board === null) return false;
        const choices = [
          ...board.querySelectorAll<HTMLButtonElement>('dialog [data-choice]'),
        ].filter((button) => !button.disabled);
        const desired = ['stop', 'continue', 'noShake', 'single', 'pi'];
        const choice =
          desired
            .map((id) => choices.find((button) => button.dataset['choice'] === id))
            .find((button) => button !== undefined) ?? choices[0];
        const action =
          choice ??
          board.querySelector<HTMLButtonElement>('[data-choice="flipOnly"]') ??
          board.querySelector<HTMLButtonElement>('[aria-label="내 손패"] button:not([disabled])');
        if (action === null || action === undefined) return false;
        action.click();
        return 'acted';
      },
      undefined,
      { polling: 25, timeout: 30_000 },
    );
    if ((await step.jsonValue()) === 'done') return;
  }
  throw new Error('한 판이 끝나지 않았습니다');
}

test('메뉴→설정→복귀, 홈→이어하기, 새 게임 취소, 종료→기록의 판·잔액 보존 (#10 #64 #50)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('./?speed=instant#/');
  await page.getByRole('button', { name: '혼자 연습' }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  const solo = page.getByTestId('solo');
  await expect(solo).toBeVisible();
  const menuButton = page.getByTestId('game-menu');
  const box = await menuButton.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(48);
  expect(box?.height).toBeGreaterThanOrEqual(48);
  await menuButton.click();
  await expect(page.locator('.board-wrap')).toHaveAttribute('inert', '');
  await page.locator('[data-menu="settings"]').click();
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();
  await page.getByRole('link', { name: '뒤로' }).click();
  await expect(solo).toBeVisible();

  await menuButton.click();
  await page.locator('[data-menu="home"]').click();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(solo).toBeVisible();
  await playOneRound(page);
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(before.session.records).toHaveLength(1);
  const balances = before.session.ledger.balances;

  await menuButton.click();
  await page.locator('[data-menu="home"]').click();
  await page.getByRole('button', { name: '혼자 연습' }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '새 게임을 시작할까요?' })).toBeVisible();
  await page.locator('[data-choice="cancel-new"]').click();
  const cancelled = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(cancelled.session.config.seed).toBe(before.session.config.seed);
  expect(cancelled.session.roundNumber).toBe(before.session.roundNumber);
  expect(cancelled.session.ledger.balances).toEqual(balances);
  expect(cancelled.session.records).toEqual(before.session.records);

  await page.getByRole('button', { name: /이어하기/ }).click();
  await menuButton.click();
  await page.getByRole('dialog', { name: '메뉴' }).locator('[data-menu="end"]').click();
  await expect(page.getByText('이 세션을 끝냅니다. 종료 후 기록을 볼 수 있습니다.')).toBeVisible();
  await page.getByRole('dialog', { name: '메뉴' }).locator('[data-menu="end"]').click();
  await expect(page.getByTestId('session-ended')).toBeVisible();
  await expect(page.locator('[data-choice="next"]')).toHaveCount(0);
  await page.locator('[data-choice="records"]').click();
  await expect(page.getByRole('heading', { name: '기록' })).toBeVisible();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(after.session.phase).toBe('ended');
  expect(after.session.roundNumber).toBe(before.session.roundNumber);
  expect(after.session.ledger.balances).toEqual(balances);
  expect(after.session.records).toEqual(before.session.records);
});

test('Android Back은 결정 프롬프트를 유지한 채 메뉴를 열고 닫으며 초점을 돌린다 (#10)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const host = {
      onmessage: null as ((event: { data: string }) => void) | null,
      postMessage(data: string) {
        const request = JSON.parse(data) as { type: string; id?: string; bool?: boolean };
        const reply =
          request.type === 'getHotspot'
            ? { type: 'hotspot', id: request.id, state: 'off' }
            : { type: request.type, id: request.id, active: request.bool };
        queueMicrotask(() => host.onmessage?.({ data: JSON.stringify(reply) }));
        if (request.type === 'gameActive') {
          (window as unknown as { __gameActive?: boolean }).__gameActive = request.bool === true;
        }
      },
    };
    const w = window as unknown as { HostBridge: typeof host; __back: () => void };
    w.HostBridge = host;
    w.__back = () => host.onmessage?.({ data: JSON.stringify({ type: 'back' }) });
  });
  await page.goto('./?speed=instant#/solo');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  const prompt = page.getByRole('dialog', { name: '선 고르기' });
  await expect(prompt).toBeVisible();
  const original = prompt.getByRole('button').first();
  await original.focus();
  await page.waitForFunction(
    () => (window as unknown as { __gameActive?: boolean }).__gameActive === true,
  );
  await page.evaluate(() => (window as unknown as { __back: () => void }).__back());
  await expect(page.getByRole('dialog', { name: '메뉴' })).toBeVisible();
  await expect(page.locator('.board-wrap')).toHaveAttribute('inert', '');
  await page.evaluate(() => (window as unknown as { __back: () => void }).__back());
  await expect(page.getByRole('dialog', { name: '메뉴' })).not.toBeVisible();
  await expect(prompt).toBeVisible();
  await expect(original).toBeFocused();
});

test('손상 저장은 안내하고 새 게임 취소 뒤 원본을 유지한다 (#64, NF-05)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gostop.solo.v1', '{broken'));
  await page.goto('./#/');
  await expect(page.getByRole('alert')).toContainText('저장된 세션을 읽을 수 없습니다');
  await page.getByRole('button', { name: '혼자 연습' }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.locator('[data-choice="cancel-new"]').click();
  expect(await page.evaluate(() => localStorage.getItem('gostop.solo.v1'))).toBe('{broken');
});

test('저장 실패는 게임 화면에서 즉시 알린다 (#64, MN-05)', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'gostop.solo.v1') throw new Error('quota');
      original.call(this, key, value);
    };
  });
  await page.goto('./#/solo');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.getByTestId('game-notice')).toContainText('세션 저장에 실패했습니다');
});
