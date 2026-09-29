// C01·C02·U14: 저장된 솔로 권위 뷰에서 자동 입력과 메뉴 보류를 실제 화면으로 확인한다.
import { cardId, PRESETS, reduce, type GameState } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, webkit, type Page } from '@playwright/test';
import { createSession } from '../src/game/session.ts';

const c = cardId;

function saveFor(game: GameState) {
  const base = createSession({
    preset: 'standard',
    rules: PRESETS.standard,
    perPoint: 100,
    startBalance: 10000,
    names: ['나', '상대'],
    seed: 77,
  }).session;
  return { version: 1, difficulty: 'easy', session: { ...base, game } };
}

async function openSave(page: Page, game: GameState, hidden = false) {
  await page.addInitScript(
    ({ saved, initiallyHidden }) => {
      localStorage.setItem('gostop.solo.v1', JSON.stringify(saved));
      if (initiallyHidden) {
        let visible = false;
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => (visible ? 'visible' : 'hidden'),
        });
        (window as typeof window & { showForTest?: () => void }).showForTest = () => {
          visible = true;
          document.dispatchEvent(new Event('visibilitychange'));
        };
      }
    },
    { saved: saveFor(game), initiallyHidden: hidden },
  );
  await page.goto('./?speed=instant#/game');
  await expect(page.getByTestId('solo')).toBeVisible();
}

async function actions(page: Page): Promise<{ type: string; seat: number; card?: number }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('gostop.solo.v1');
    return raw
      ? (
          JSON.parse(raw) as {
            session: { actions: { type: string; seat: number; card?: number }[] };
          }
        ).session.actions
      : [];
  });
}

test('솔로: 메뉴 열람 중 유일 수 보류, 복귀 후 최신 뷰에서 한 번만 실행', async ({ page }) => {
  const game = createScenario({ hands: [[c('5열')], [c('10열')]], floor: [c('8광')] });
  await openSave(page, game, true);
  await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
  await page.getByTestId('game-menu').click();
  await page.evaluate(() => (window as typeof window & { showForTest: () => void }).showForTest());
  await expect(page.getByText('자동 진행 보류', { exact: false })).toBeVisible();
  expect((await actions(page)).filter((a) => a.seat === 0)).toHaveLength(0);
  await page.locator('[data-menu="resume"]').click();
  await expect
    .poll(async () => (await actions(page)).filter((a) => a.type === 'play' && a.seat === 0).length)
    .toBe(1);
});

test('솔로: 판 정보 열람 중 유일 수 보류, 닫으면 한 번만 저장', async ({ page }) => {
  const game = createScenario({ hands: [[c('5열')], [c('10열')]], floor: [c('8광')] });
  await openSave(page, game, true);
  // #104 통합 후 임시 dialog 대신 실제 판 정보 열기/닫기를 검증한다.
  await page.getByRole('button', { name: '판 정보', exact: true }).click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-auto-held', 'true');
  await page.evaluate(() => (window as typeof window & { showForTest: () => void }).showForTest());
  await page.waitForTimeout(100);
  expect((await actions(page)).filter((a) => a.type === 'play' && a.seat === 0)).toHaveLength(0);
  await page
    .getByRole('dialog', { name: '판 정보' })
    .getByRole('button', { name: '닫기', exact: true })
    .click();
  await expect
    .poll(async () => (await actions(page)).filter((a) => a.type === 'play' && a.seat === 0).length)
    .toBe(1);
});

test('솔로: 동등 바닥 대상은 힌트 설정 없이 최소 ID를 한 번 선택', async ({ page }) => {
  const played = c('8광');
  const initial = createScenario({
    hands: [[played], [c('10열')]],
    floor: [c('8피b'), c('8피a')],
    deck: [c('12비광')],
  });
  const step = reduce(initial, { type: 'play', seat: 0, card: played });
  if (!step.ok) throw new Error(step.message);
  await openSave(page, step.state);
  await expect
    .poll(async () => (await actions(page)).filter((a) => a.type === 'chooseTarget').length)
    .toBe(1);
  expect((await actions(page)).find((a) => a.type === 'chooseTarget')?.card).toBe(c('8피a'));
});

test('국진 매번 묻기 설정은 새로고침 뒤에도 복원된다', async ({ page }) => {
  await page.goto('./?speed=instant#/settings');
  const ask = page.getByRole('switch', { name: '매번 묻기' });
  await expect(ask).not.toBeChecked();
  await ask.check();
  await page.reload();
  await expect(ask).toBeChecked();
});

const relayCli = fileURLToPath(new URL('../../relay-dev/src/cli.ts', import.meta.url));

async function startRelay(): Promise<{ port: number; proc: ChildProcess }> {
  const proc = spawn(process.execPath, [relayCli, '--port', '0'], {
    env: { ...process.env, HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('중계 시작 시간 초과')), 15_000);
    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk: string) => {
      const match = chunk.match(/listening on ws:\/\/[^:]+:(\d+)/);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    proc.on('exit', (code) => reject(new Error(`중계 종료 ${code}`)));
  });
  return { port, proc };
}

/** 수동으로 선택해야 하는 버튼만 누르고, 유일한 손패는 자동 입력에 맡긴다. */
async function stepMatch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="match"]');
    if (root === null) return;
    const next = root.querySelector<HTMLButtonElement>('[data-choice="next"]');
    if (next && !next.disabled) {
      next.click();
      return;
    }
    if (root.dataset['canAct'] !== 'true') return;
    const board = root.querySelector<HTMLElement>('[data-testid="board"]');
    if (board === null) return;
    const choices = [
      ...board.querySelectorAll<HTMLButtonElement>('dialog [data-choice]:not([disabled])'),
    ];
    if (choices.length > 0) {
      (
        choices.find((el) =>
          ['go', 'noShake', 'continue', 'single'].includes(el.dataset['choice'] ?? ''),
        ) ?? choices[0]
      )?.click();
      return;
    }
    const flip = board.querySelector<HTMLButtonElement>('[data-choice="flipOnly"]:not([disabled])');
    if (flip) {
      flip.click();
      return;
    }
    const hand = [
      ...board.querySelectorAll<HTMLButtonElement>('[aria-label="내 손패"] button:not([disabled])'),
    ];
    if (hand.length === 1) {
      const testWindow = window as typeof window & { singleWait?: number };
      testWindow.singleWait = (testWindow.singleWait ?? 0) + 1;
      // 자동 입력할 수 없는 마지막 카드(다른 합법 수 존재)는 수동으로 진행한다.
      if (testWindow.singleWait > 3) hand[0]?.click();
    } else if (hand.length > 1) {
      (window as typeof window & { singleWait?: number }).singleWait = 0;
      hand[0]?.click();
    }
  });
}

test('P2P relay-dev: 게스트 유일 수는 한 번 전송하고 두 좌석의 수동 선택은 계속 가능', async ({
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '호스트 Chromium + 게스트 WebKit 한 조만 실행');
  test.setTimeout(90_000);
  const relay = await startRelay();
  const hostBrowser = await chromium.launch();
  const guestBrowser = await webkit.launch();
  try {
    const host = await (await hostBrowser.newContext()).newPage();
    const guest = await (await guestBrowser.newContext()).newPage();
    await host.addInitScript(() =>
      localStorage.setItem('gostop.settings.v1', JSON.stringify({ gukjinAsk: true })),
    );
    const sent: { requestId: number | null; seq: number | null; action: string }[] = [];
    const welcomes: string[] = [];
    await guest.routeWebSocket(/\/ws\?role=guest$/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((raw) => {
        const message = JSON.parse(raw.toString()) as {
          t: string;
          requestId?: number;
          seq?: number;
          payload?: unknown;
        };
        if (message.t === 'action')
          sent.push({
            requestId: message.requestId ?? null,
            seq: message.seq ?? null,
            action: JSON.stringify(message.payload),
          });
        server.send(raw);
      });
      server.onMessage((raw) => {
        const message = JSON.parse(raw.toString()) as { t: string; rules?: { gukjin?: string } };
        if (message.t === 'welcome') welcomes.push(message.rules?.gukjin ?? '');
        ws.send(raw);
      });
    });
    await guest.addInitScript(() => {
      (window as typeof window & { autoSeen?: number }).autoSeen = 0;
      new MutationObserver(() => {
        if (document.body?.textContent?.includes('유일한 수 자동 진행'))
          (window as typeof window & { autoSeen: number }).autoSeen++;
      }).observe(document, { subtree: true, childList: true });
    });
    const base = baseURL ?? 'http://127.0.0.1:4173';
    const query = `?speed=instant&relay=127.0.0.1:${relay.port}`;
    await host.goto(`${base}/${query}&role=host#/`);
    await host.getByRole('button', { name: '친구와 대전' }).click();
    await guest.goto(`${base}/${query}&role=guest`);
    await guest.getByRole('textbox', { name: '내 이름' }).fill('민지');
    await guest.getByRole('button', { name: '입장' }).click();
    await expect(guest.getByTestId('lobby')).toBeVisible();
    expect(welcomes).toContain('ask');
    await host.getByTestId('host-start').click();
    await expect(guest.getByTestId('match')).toBeVisible();
    for (let i = 0; i < 900; i++) {
      await stepMatch(host);
      await stepMatch(guest);
      if (
        await guest.evaluate(() => (window as typeof window & { autoSeen?: number }).autoSeen ?? 0)
      )
        break;
      await guest.waitForTimeout(20);
    }
    expect(
      await guest.evaluate(() => (window as typeof window & { autoSeen?: number }).autoSeen ?? 0),
    ).toBeGreaterThan(0);
    const ids = sent.map((entry) => entry.requestId);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(sent.map((entry) => `${entry.seq}:${entry.action}`)).size).toBe(sent.length);
  } finally {
    await hostBrowser.close();
    await guestBrowser.close();
    relay.proc.kill();
  }
});
