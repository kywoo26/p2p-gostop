// FR-21·FR-46·NF-07: 기기 설정과 새 세션 규칙의 경계를 실제 화면에서 확인한다.
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PRESETS } from '@p2p-gostop/engine';
import { expect, test } from '@playwright/test';

const relayCli = fileURLToPath(new URL('../../relay-dev/src/cli.ts', import.meta.url));
async function relay(): Promise<{ port: number; proc: ChildProcess }> {
  const proc = spawn(process.execPath, [relayCli, '--port', '0'], {
    env: { ...process.env, HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('중계 시작 시간 초과')), 15_000);
    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk: string) => {
      const match = chunk.match(/listening on ws:\/\/[^:]+:(\d+)/);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    proc.on('exit', (code) => reject(new Error(`중계 종료 ${code}`)));
  });
  return { port, proc };
}

test('앱 루트 효과 강도는 기본값과 설정 변경을 즉시 반영한다 (FR-21)', async ({ page }) => {
  await page.goto('./#/settings');
  const root = page.locator('#app > [data-effect-intensity]');
  const effect = page.getByRole('combobox', { name: '효과 강도' });
  await expect(root).toHaveAttribute('data-effect-intensity', 'strong');
  for (const value of ['off', 'subtle', 'strong']) {
    await effect.selectOption(value);
    await expect(root).toHaveAttribute('data-effect-intensity', value);
  }
});

test('설정→솔로: 사용자 지정 규칙·금액이 새 세션에 고정되고 로컬 힌트는 즉시 복원된다', async ({
  page,
}) => {
  await page.goto('./?speed=instant#/settings');
  await page.getByLabel('보너스 카드 구성').selectOption('2');
  await expect(page.getByText(/사용자 지정 · 기준 프리셋/)).toBeVisible();
  await page.getByLabel('국진 처리').selectOption('"ask"');
  await page.getByLabel('나가리 배수 상한').selectOption('null');
  await page.getByLabel('시작 잔액 직접 입력').fill('12345');
  await page.getByLabel('시작 잔액 직접 입력').blur();
  await page.getByLabel('단위').selectOption('점');
  const hint = page.getByLabel('힌트 등급');
  await expect(hint).toHaveValue('basic');
  await page.getByRole('combobox', { name: '효과 강도' }).selectOption('subtle');
  await page.getByRole('switch', { name: '120ms 취소 지연' }).check();
  await expect(page.getByRole('switch', { name: '진동' })).toHaveCount(0);
  for (const level of ['off', 'basic', 'detail', 'off']) {
    await hint.selectOption(level);
    await expect(hint).toHaveValue(level);
  }
  await hint.selectOption('basic');
  await page.reload();
  await expect(hint).toHaveValue('basic');
  await expect(page.getByRole('combobox', { name: '효과 강도' })).toHaveValue('subtle');
  await expect(page.getByRole('switch', { name: '120ms 취소 지연' })).toBeChecked();
  await page.goto('./?speed=instant#/solo');
  await expect(page.getByText(/사용자 지정 규칙/)).toBeVisible();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.getByTestId('solo')).toBeVisible();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(before.session.config.rules.bonusCards).toBe(2);
  expect(before.session.config.rules.gukjin).toBe('ask');
  expect(before.session.config.rules.nagariCap).toBeNull();
  expect(before.session.config.startBalance).toBe(12345);
  const actionCount = before.session.actions.length;
  await page.getByTestId('game-menu').click();
  await page.locator('[data-menu="settings"]').click();
  await hint.selectOption('detail');
  await hint.selectOption('off');
  await page.getByRole('link', { name: '뒤로' }).click();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(after.session.config.rules).toEqual(before.session.config.rules);
  expect(after.session.actions.length).toBe(actionCount);
  await page.reload();
  await expect(page.getByTestId('solo')).toBeVisible();
  await expect(page.getByText(/저장된 세션 데이터가 손상/)).toHaveCount(0);
  await page.goto('./?speed=instant#/settings');
  await expect(hint).toHaveValue('off');
});

test('로비 프리셋 적용은 국진을 포함한 welcome 전체 규칙을 초기화한다 (FR-21, FR-24) @guest', async ({
  page,
  browser,
  baseURL,
}) => {
  const server = await relay();
  const guest = await browser.newPage();
  const welcomes: { rules: unknown }[] = [];
  guest.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(typeof payload === 'string' ? payload : payload.toString()) as {
        t?: string;
        rules?: unknown;
      };
      if (message.t === 'welcome') welcomes.push({ rules: message.rules });
    });
  });
  try {
    const root = baseURL ?? 'http://127.0.0.1:4173';
    const query = `?speed=instant&relay=127.0.0.1:${server.port}`;
    await page.goto(`${root}/${query}&role=host#/settings`);
    await page.getByLabel('국진 처리').selectOption('"ask"');
    await page.goto(`${root}/${query}&role=host#/versus`);
    await guest.goto(`${root}/${query}&role=guest`);
    await guest.getByRole('textbox', { name: '내 이름' }).fill('민지');
    await guest.getByRole('button', { name: '입장' }).click();
    await expect.poll(() => welcomes.length).toBeGreaterThan(0);
    for (const preset of ['traditional', 'standard', 'arcade'] as const) {
      const before = welcomes.length;
      await page.getByRole('combobox', { name: '규칙' }).selectOption(preset);
      await expect.poll(() => welcomes.length).toBeGreaterThan(before);
      expect(welcomes.slice(before).map((welcome) => welcome.rules)).toEqual([PRESETS[preset]]);
      await expect(page.getByText(/사용자 지정 규칙이 게스트에게 전달됩니다/)).toHaveCount(0);
    }
  } finally {
    await guest.close();
    server.proc.kill();
  }
});

test('설정→P2P 로비: 사용자 지정 규칙이 방 설정으로 전달되고 복원된다', async ({ page }) => {
  await page.goto('./?speed=instant#/settings');
  await page.getByLabel('2장 폭탄').selectOption('"double"');
  await page.goto('./?speed=instant#/versus');
  await expect(page.getByRole('heading', { name: '방 열기' })).toBeVisible();
  await expect(page.getByText(/사용자 지정 규칙이 게스트에게 전달됩니다/)).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.settings.v1') ?? 'null'),
  );
  expect(saved.customRules.twoCardBomb).toBe('double');
  await page.goto('./?speed=instant#/settings');
  await page.getByRole('button', { name: '프리셋 규칙 복원' }).click();
  await expect(page.getByLabel('2장 폭탄')).toHaveValue('"off"');
});

test('설정→P2P welcome: 사용자 지정 규칙이 게스트 대기실에 전파된다 @guest', async ({
  page,
  browser,
  baseURL,
}) => {
  const server = await relay();
  const guest = await browser.newPage();
  try {
    const root = baseURL ?? 'http://127.0.0.1:4173';
    const query = `?speed=instant&relay=127.0.0.1:${server.port}`;
    await page.goto(`${root}/${query}&role=host#/settings`);
    await page.getByLabel('보너스 카드 구성').selectOption('2');
    await page.goto(`${root}/${query}&role=host#/versus`);
    await expect(page.getByText(/사용자 지정 규칙이 게스트에게 전달됩니다/)).toBeVisible();
    await guest.goto(`${root}/${query}&role=guest`);
    await guest.getByRole('textbox', { name: '내 이름' }).fill('민지');
    await guest.getByRole('button', { name: '입장' }).click();
    await expect(guest.getByTestId('lobby')).toContainText('사용자 지정');
    await expect(page.getByTestId('guest-status')).toContainText('민지 · 연결됨');
  } finally {
    await guest.close();
    server.proc.kill();
  }
});

test('힌트 저장 실패는 현재 화면에 적용하고 새로고침 때 마지막 저장값으로 돌아간다', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'gostop.settings.v1') throw new Error('시험용 저장 실패');
      return original.call(this, key, value);
    };
  });
  await page.goto('./?speed=instant#/settings');
  const hint = page.getByRole('combobox', { name: '힌트 등급' });
  await expect(hint).toHaveValue('basic');
  await hint.selectOption('detail');
  await expect(hint).toHaveValue('detail');
  await page.getByRole('link', { name: '뒤로' }).click();
  await page.getByRole('button', { name: '설정' }).click();
  await expect(hint).toHaveValue('detail');
  await page.reload();
  await expect(hint).toHaveValue('basic');
});
