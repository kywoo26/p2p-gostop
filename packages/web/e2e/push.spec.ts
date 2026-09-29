// FR-14·FR-16·AI-02 / plan §4.2 .2-A: 저장된 결정 대기 판에서 실제 화면 선택·복원·배수.
import { legalActions, PRESETS, type Seat } from '@p2p-gostop/engine';
import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { actingSeats, createSession, sessionAct, type SessionState } from '../src/game/session.ts';

function pendingFor(wanted: Seat): SessionState {
  for (let seed = 1; seed <= 50; seed++) {
    let session = createSession({
      preset: 'arcade',
      rules: PRESETS.arcade,
      perPoint: 100,
      startBalance: 1_000_000,
      names: ['나', '컴퓨터 · 쉬움'],
      seed,
    }).session;
    for (let guard = 0; guard < 1000; guard++) {
      if (session.phase === 'pushDecision') {
        if (session.game.result?.winner === wanted) return session;
        break;
      }
      if (session.phase === 'roundOver') break;
      const seat = actingSeats(session.game)[0];
      if (seat === undefined) break;
      const legal = legalActions(session.game, seat);
      const action = legal.find((a) => a.type === 'stop') ?? legal[0];
      if (action === undefined) break;
      const result = sessionAct(session, action);
      if (!result.ok) throw new Error(result.message);
      session = result.session;
    }
  }
  throw new Error(`좌석 ${wanted} 결정 대기 판을 만들지 못함`);
}

async function openSaved(page: Page, session: SessionState) {
  await page.goto('./');
  await page.evaluate(
    (save) => {
      localStorage.setItem('gostop.solo.v1', JSON.stringify(save));
    },
    { version: 1, difficulty: 'easy', session },
  );
  await page.goto('./?speed=instant#/game');
  await expect(page.getByTestId('solo')).toBeVisible();
}

test('사람 승자: 보류 판 새로고침, 밀기 0냥, 다음 판 ×2, 중복 입력 차단', async ({ page }) => {
  const session = pendingFor(0);
  await openSaved(page, session);
  await expect(page.locator('[data-choice="accept"]')).toBeVisible();
  await expect(page.locator('[data-choice="push"]')).toContainText('×2');
  expect(await page.getByTestId('solo').getAttribute('data-rounds-played')).toBe(
    String(session.records.length),
  );
  await page.reload();
  await expect(page.locator('[data-choice="push"]')).toBeVisible();
  await page.locator('[data-choice="push"]').click();
  await expect(page.getByTestId('push-forfeit')).toContainText('정산 0냥');
  await expect(page.getByTestId('push-forfeit')).toContainText('다음 판 ×2');
  await expect(page.locator('[data-choice="push"]')).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(saved.session.records.at(-1).settlement.pushed).toBe(true);
  expect(saved.session.ledger.balances).toEqual(session.ledger.balances);
  await page.locator('[data-choice="next"]').click();
  await expect(page.getByTestId('solo')).toHaveAttribute(
    'data-round',
    String(session.roundNumber + 1),
  );
  const next = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(next.session.game.round.pushes).toBe(1);
  expect(next.session.game.round.carry).toBe(1);
});

test('사람 승자 받기와 CPU 승자 결정은 한 번만 확정한다', async ({ page }) => {
  const session = pendingFor(0);
  await openSaved(page, session);
  await page.locator('[data-choice="accept"]').click();
  await expect(page.locator('[data-choice="next"]')).toBeVisible();
  const accepted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(accepted.session.records).toHaveLength(session.records.length + 1);
  expect(accepted.session.records.at(-1).settlement.pushed).toBe(false);
  await page.reload();
  const restored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(restored.session.records).toHaveLength(session.records.length + 1);

  await page.evaluate(
    (save) => {
      localStorage.setItem('gostop.solo.v1', JSON.stringify(save));
    },
    { version: 1, difficulty: 'easy', session: pendingFor(1) },
  );
  await page.goto('./#/game');
  await expect(page.locator('[data-choice="next"]')).toBeVisible({ timeout: 20_000 });
  const cpu = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(cpu.session.records).toHaveLength(cpu.session.roundNumber);
  expect(cpu.session.phase).toBe('roundOver');
});

async function relayPort(): Promise<{ port: number; stop: () => void }> {
  const cli = fileURLToPath(new URL('../../relay-dev/src/cli.ts', import.meta.url));
  const proc = spawn(process.execPath, [cli, '--port', '0'], {
    env: { ...process.env, HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('중계 시작 시간 초과')), 15_000);
    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk: string) => {
      const found = chunk.match(/listening on ws:\/\/[^:]+:(\d+)/);
      if (found?.[1]) {
        clearTimeout(timer);
        resolve(Number(found[1]));
      }
    });
    proc.on('exit', (code) => reject(new Error(`중계 종료: ${code}`)));
  });
  return { port, stop: () => proc.kill() };
}

/** 현재 화면에서 합법 수 하나를 누른다. 정산 결정에는 손대지 않는다. */
async function move(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="match"]');
    if (root?.dataset['canAct'] !== 'true') return;
    const board = root.querySelector<HTMLElement>('[data-testid="board"]');
    const options = [
      ...(board?.querySelectorAll<HTMLButtonElement>('dialog [data-choice]') ?? []),
    ].filter((button) => !button.disabled);
    const selected =
      options.find((button) => button.dataset['choice'] === 'stop') ??
      options.find((button) => button.dataset['choice'] === 'continue') ??
      options[0];
    if (selected) {
      selected.click();
      return;
    }
    const flip = board?.querySelector<HTMLButtonElement>('[data-choice="flipOnly"]');
    if (flip) {
      flip.click();
      return;
    }
    board
      ?.querySelector<HTMLButtonElement>('[aria-label="내 손패"] button:not([disabled])')
      ?.click();
  });
}

test('호스트·게스트 승자: 실제 중계에서 밀기와 다음 판 배수 동기화', async ({ baseURL }, info) => {
  test.skip(info.project.name !== 'chromium', 'Chromium 호스트·WebKit 게스트 한 번 실행');
  test.setTimeout(120_000);
  const relay = await relayPort();
  const hostBrowser = await chromium.launch();
  const guestBrowser = await webkit.launch();
  try {
    const host = await (await hostBrowser.newContext()).newPage();
    const guest = await (await guestBrowser.newContext()).newPage();
    const base = baseURL ?? 'http://127.0.0.1:4173';
    const query = `?speed=instant&relay=127.0.0.1:${relay.port}`;
    await host.goto(`${base}/${query}&role=host#/`);
    await host.getByRole('button', { name: '친구와 대전' }).click();
    await host.getByRole('combobox', { name: '규칙' }).selectOption('arcade');
    await guest.goto(`${base}/${query}&role=guest`);
    await guest.getByRole('textbox', { name: '내 이름' }).fill('민지');
    await guest.getByRole('button', { name: '입장' }).click();
    await expect(host.getByTestId('host-start')).toBeEnabled();
    await host.getByTestId('host-start').click();
    await expect(guest.getByTestId('match')).toBeVisible();
    let chosen: Page | null = null;
    for (let step = 0; step < 1200; step++) {
      if (await host.locator('[data-choice="push"]').isVisible()) chosen = host;
      if (await guest.locator('[data-choice="push"]').isVisible()) chosen = guest;
      if (chosen) break;
      if (await host.locator('[data-choice="next"]').isVisible()) {
        await guest.locator('[data-choice="next"]').click();
        await host.locator('[data-choice="next"]').click();
      } else await Promise.all([move(host), move(guest)]);
      await host.waitForTimeout(10);
    }
    expect(chosen).not.toBeNull();
    const before = await host.getByTestId('match').getAttribute('data-balances');
    await chosen!.locator('[data-choice="push"]').click();
    await expect(host.getByTestId('push-forfeit')).toContainText('정산 0냥');
    await expect(guest.getByTestId('push-forfeit')).toContainText('다음 판 ×2');
    expect(await host.getByTestId('match').getAttribute('data-balances')).toBe(before);
    await guest.locator('[data-choice="next"]').click();
    await host.locator('[data-choice="next"]').click();
    await expect(host.getByTestId('board').locator('.seat-bar.me')).toContainText('×2');
    await expect(guest.getByTestId('board').locator('.seat-bar.me')).toContainText('×2');
  } finally {
    await hostBrowser.close();
    await guestBrowser.close();
    relay.stop();
  }
});
