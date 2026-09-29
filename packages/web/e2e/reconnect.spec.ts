// NP-03·NF-05·NF-06: 실제 relay-dev와 두 브라우저에서 응답 유실, 자동 재인증, 4001 교체를 확인한다.
import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, expect, type Page, test, webkit } from '@playwright/test';

const RELAY_CLI = fileURLToPath(new URL('../../relay-dev/src/cli.ts', import.meta.url));

async function startRelay(): Promise<{ port: number; proc: ChildProcess }> {
  const proc = spawn(process.execPath, [RELAY_CLI, '--port', '0'], {
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

/** 보드에 보이는 합법 입력 하나. 선택 프롬프트를 먼저 처리한다. */
async function step(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="match"]');
    if (root?.dataset['canAct'] !== 'true') return false;
    const board = root.querySelector<HTMLElement>('[data-testid="board"][data-awaiting="me"]');
    const button =
      board?.querySelector<HTMLButtonElement>('dialog [data-choice]:not([disabled])') ??
      board?.querySelector<HTMLButtonElement>('[data-choice="flipOnly"]:not([disabled])') ??
      board?.querySelector<HTMLButtonElement>('[aria-label="내 손패"] button:not([disabled])');
    if (!button) return false;
    button.click();
    return true;
  });
}

test('응답 유실은 자동 hello로 감지하고 snapshot 뒤 입력이 복구된다 (#60·#78) @timing @guest @paired', async ({
  baseURL,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'timing-chromium',
    '다른 E2E가 끝난 뒤 Chromium 호스트 + WebKit 게스트 단독 계측',
  );
  test.setTimeout(60_000);
  const relay = await startRelay();
  const hostBrowser = await chromium.launch();
  const guestBrowser = await webkit.launch();
  try {
    const query = `?speed=instant&relay=127.0.0.1:${relay.port}`;
    const base = baseURL ?? 'http://127.0.0.1:4173';
    const host = await (await hostBrowser.newContext()).newPage();
    const guest = await (await guestBrowser.newContext()).newPage();
    // 시스템 시각 보정이 응답 기한을 앞당기거나 늦추지 않도록 자동 진행하는 테스트 시계를 쓴다.
    // pause/fastForward 없이 실제 5초를 기다리고, 경과 시간은 Node의 단조 시각으로 잰다 (#96).
    await guest.clock.install({ time: new Date('2026-09-29T00:00:00Z') });
    let receiveHello!: (at: number) => void;
    let receiveSnapshot!: (at: number) => void;
    const hello = new Promise<number>((resolve) => {
      receiveHello = resolve;
    });
    const snapshot = new Promise<number>((resolve) => {
      receiveSnapshot = resolve;
    });
    let dropId: number | null = null;
    let actionAt = 0;
    let detectedAt = 0;
    let snapshotAt = 0;
    let dropped = false;
    let helloCount = 0;
    let actionCount = 0;
    await guest.routeWebSocket(/\/ws\?role=guest$/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((raw) => {
        const message = JSON.parse(raw.toString()) as { t: string; requestId?: number };
        if (message.t === 'action') {
          actionCount++;
          if (dropId === null) {
            dropId = message.requestId ?? null;
            actionAt = performance.now();
          }
        }
        if (message.t === 'hello') {
          helloCount++;
          if (dropped && detectedAt === 0) {
            detectedAt = performance.now();
            receiveHello(detectedAt);
          }
        }
        server.send(raw);
      });
      server.onMessage((raw) => {
        const message = JSON.parse(raw.toString()) as { t: string; requestId?: number };
        if (
          dropId !== null &&
          message.requestId === dropId &&
          ['events', 'snapshot', 'status', 'reject'].includes(message.t)
        ) {
          dropped = true;
          return;
        }
        if (detectedAt !== 0 && message.t === 'snapshot' && snapshotAt === 0) {
          snapshotAt = performance.now();
          receiveSnapshot(snapshotAt);
        }
        ws.send(raw);
      });
    });

    await host.goto(`${base}/${query}&role=host#/`);
    await host.getByRole('button', { name: '친구와 대전' }).click();
    await guest.goto(`${base}/${query}&role=guest`);
    await guest.getByRole('textbox', { name: '내 이름' }).fill('민지');
    await guest.getByRole('button', { name: '입장' }).click();
    await expect(guest.getByTestId('lobby')).toBeVisible();
    await host.getByTestId('host-start').click();
    await expect(guest.getByTestId('match')).toBeVisible();

    // 게스트 차례까지 호스트의 합법 수만 누른다. 유실된 첫 게스트 action은 별도 클릭으로 보낸다.
    for (
      let i = 0;
      i < 100 && (await guest.getByTestId('match').getAttribute('data-can-act')) !== 'true';
      i++
    ) {
      await step(host);
      await guest.waitForTimeout(50);
    }
    await expect(guest.getByTestId('match')).toHaveAttribute('data-can-act', 'true');
    const before = Number(await guest.getByTestId('match').getAttribute('data-seq'));
    expect(await step(guest)).toBe(true);
    // 구독은 클릭보다 먼저 한다. 초기 hello나 응답을 버리기 전 snapshot은 성공 조건이 아니다.
    const detectMs = (await hello) - actionAt;
    expect(dropped).toBe(true);
    expect(detectMs).toBeGreaterThanOrEqual(4_000);
    expect(detectMs).toBeLessThan(6_000); // 5초 응답 기한 + 1초 시계 해상도
    await snapshot;
    // 첫 선 고르기처럼 이벤트 순번이 그대로인 합법 수도 있다. 스냅샷 뒤 입력 잠금 해제를 본다.
    await expect
      .poll(() =>
        guest.evaluate(() =>
          (document.querySelector('[data-testid="game-notice"]')?.textContent ?? '').includes(
            '보내는 중',
          ),
        ),
      )
      .toBe(false);
    expect(
      Number(await guest.getByTestId('match').getAttribute('data-seq')),
    ).toBeGreaterThanOrEqual(before);
    const recoveredAt = performance.now();
    expect(recoveredAt - actionAt).toBeLessThan(10_000);
    expect(snapshotAt).toBeGreaterThanOrEqual(detectedAt);
    expect(helloCount).toBeGreaterThanOrEqual(2); // 최초 입장 + 자동 재인증
    console.log(
      `[NF-05] 응답 유실 감지 ${Math.round(detectMs)}ms · snapshot ${Math.round(snapshotAt - actionAt)}ms · 화면 복구 ${Math.round(recoveredAt - actionAt)}ms`,
    );

    // 복구 후 다음 게스트 입력이 다시 전송되는지 확인한다. 수동 join/다시 연결 버튼은 누르지 않는다.
    for (
      let i = 0;
      i < 150 && (await guest.getByTestId('match').getAttribute('data-can-act')) !== 'true';
      i++
    ) {
      for (const page of [guest, host]) {
        const next = page.locator('[data-choice="next"]');
        if (await next.count()) await next.click();
      }
      await step(host);
      await guest.waitForTimeout(50);
    }
    await expect(guest.getByTestId('match')).toHaveAttribute('data-can-act', 'true');
    expect(await step(guest)).toBe(true);
    await expect.poll(() => actionCount).toBeGreaterThan(1);
  } finally {
    await guestBrowser.close();
    await hostBrowser.close();
    relay.proc.kill();
  }
});

test('4001 교체 뒤 자동 재접속 없이 메뉴에서 나가고 호스트는 홈으로 간다 (NF-06) @guest @paired', async ({
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Chromium 호스트 + WebKit 게스트 한 번 실행');
  const relay = await startRelay();
  const hostBrowser = await chromium.launch();
  const guestBrowser = await webkit.launch();
  try {
    const query = `?speed=instant&relay=127.0.0.1:${relay.port}`;
    const base = baseURL ?? 'http://127.0.0.1:4173';
    const host = await (await hostBrowser.newContext()).newPage();
    const guest = await (await guestBrowser.newContext()).newPage();
    let sockets = 0;
    guest.on('websocket', () => sockets++);
    await host.goto(`${base}/${query}&role=host#/`);
    await host.getByRole('button', { name: '친구와 대전' }).click();
    await guest.goto(`${base}/${query}&role=guest`);
    await guest.getByRole('textbox', { name: '내 이름' }).fill('민지');
    await guest.getByRole('button', { name: '입장' }).click();
    await expect(guest.getByTestId('lobby')).toBeVisible();
    await host.getByTestId('host-start').click();
    await expect(guest.getByTestId('match')).toBeVisible();
    const replacement = await (await guestBrowser.newContext()).newPage();
    await replacement.goto(`${base}/${query}&role=guest`);
    await replacement.getByRole('textbox', { name: '내 이름' }).fill('다른 손님');
    await replacement.getByRole('button', { name: '입장' }).click();
    await expect(guest.getByTestId('game-notice')).toContainText('다른 창');
    const stoppedAt = sockets;
    await guest.waitForTimeout(2_000);
    expect(sockets - stoppedAt).toBe(0);
    await guest.getByTestId('game-menu').click();
    await guest.locator('[data-menu="leave"]').click();
    await guest.locator('[data-menu="leave"]').click();
    await expect(guest.getByRole('heading', { name: '게임 참가' })).toBeVisible();
    await host.getByTestId('game-menu').click();
    await host.locator('[data-menu="home"]').click();
    await expect(host.getByRole('button', { name: '친구와 대전' })).toBeVisible();
  } finally {
    await guestBrowser.close();
    await hostBrowser.close();
    relay.proc.kill();
  }
});
