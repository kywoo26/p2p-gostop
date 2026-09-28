// 친구와 대전 E2E (spec AC-04, 2.1~2.4, NP-03·05, MN-01, NF-05): Chromium = 호스트(Android WebView 대역, `?role=host`),
// WebKit = 게스트(iPhone Safari 대역). 테스트가 packages/relay-dev 중계를 띄우고 두 브라우저가 `?relay=`로 붙는다.
// 양쪽 모두 화면에 보이는 버튼만 누르는 무작위 합법 수 플레이어(시드 고정, 드문 경로 쪽으로 기울임)로 20판을 즉시 속도로 두고,
// 중간에 게스트 페이지를 닫았다가 같은 주소(프래그먼트의 세션 토큰)로 다시 열어 재동기화를 본다.
import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, type Page, test, webkit } from '@playwright/test';

const ROUNDS = 20;
const DROP_AT = 10;
const RELAY_CLI = fileURLToPath(new URL('../../relay-dev/src/cli.ts', import.meta.url));

/** relay-dev를 임의 포트로 띄우고 포트를 돌려준다 */
async function startRelay(): Promise<{ port: number; proc: ChildProcess; log: string[] }> {
  const proc = spawn(process.execPath, [RELAY_CLI, '--port', '0'], {
    env: { ...process.env, HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log: string[] = [];
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`중계 시작 실패: ${log.join('\n')}`)), 15_000);
    proc.stdout?.setEncoding('utf8');
    proc.stderr?.setEncoding('utf8');
    proc.stderr?.on('data', (chunk: string) => log.push(chunk));
    proc.stdout?.on('data', (chunk: string) => {
      log.push(chunk);
      const match = chunk.match(/listening on ws:\/\/[^:]+:(\d+)/);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    proc.on('exit', (code) => reject(new Error(`중계 종료 ${code}: ${log.join('\n')}`)));
  });
  return { port, proc, log };
}

interface StepOptions {
  /** 이 판 수의 정산을 보면 멈춘다 (호스트) */
  readonly target: number | null;
  /** 정산 화면이 보이면 멈춘다 (게스트: 호스트가 끝난 뒤) */
  readonly stopAtSettlement: boolean;
  readonly seed: number;
}

/**
 * 브라우저 안에서 한 번 판단하고 누른다. 누를 것이 없으면 false, 멈출 때면 'done'.
 * 화면의 버튼만 누른다(= 그 좌석의 합법 수). 고는 3번까지, 흔들기·폭탄·국진은 번갈아, 나머지는 무작위.
 */
function autoStep(opts: StepOptions): string | false {
  const w = window as unknown as {
    __auto?: { seed: number; taken: Record<string, number>; offered: Record<string, number> };
  };
  const auto = (w.__auto ??= { seed: opts.seed, taken: {}, offered: {} });
  const rand = (n: number) => {
    auto.seed = (Math.imul(auto.seed, 1664525) + 1013904223) >>> 0;
    return auto.seed % n;
  };
  const note = (map: Record<string, number>, key: string) => (map[key] = (map[key] ?? 0) + 1);
  const root = document.querySelector<HTMLElement>('[data-testid="match"]');
  if (root === null) return false;
  const click = (el: Element | null | undefined, name: string): string | false => {
    if (!(el instanceof HTMLElement)) return false;
    el.click();
    note(auto.taken, name);
    return name;
  };
  const refill = document.querySelector('[data-choice="refill"]');
  if (refill !== null) return click(refill, 'refill');
  const next = document.querySelector('[data-choice="next"]');
  // 게스트: 호스트가 끝난 뒤, 마지막 정산을 보고 있거나 이미 다음 판을 요청해 기다리는 중이면 끝
  const waiting = document.querySelector('[data-testid="game-notice"]')?.textContent ?? '';
  if (opts.stopAtSettlement && (next !== null || waiting.includes('다음 판을 시작'))) return 'done';
  if (next !== null) {
    if (opts.target !== null && Number(root.dataset['roundsPlayed']) >= opts.target) return 'done';
    return click(next, 'next');
  }
  const board = document.querySelector('[data-testid="board"][data-awaiting="me"]');
  if (board === null || root.dataset['canAct'] !== 'true') return false;
  const choices = [...board.querySelectorAll<HTMLButtonElement>('dialog [data-choice]')].filter(
    (b) => !b.disabled,
  );
  if (choices.length > 0) {
    const ids = choices.map((b) => b.dataset['choice'] ?? '');
    const has = (id: string) => ids.includes(id);
    let want: string;
    if (has('go') && has('stop')) want = (auto.taken['go'] ?? 0) < 3 ? 'go' : 'stop';
    else if (has('continue')) want = 'continue';
    else if (has('noShake')) want = note(auto.offered, 'shake') % 2 === 1 ? 'noShake' : 'shake';
    else if (has('bomb')) want = note(auto.offered, 'bomb') % 2 === 1 ? 'bomb' : 'single';
    else if (has('pi') && has('yeol'))
      want = note(auto.offered, 'gukjin') % 2 === 1 ? 'pi' : 'yeol';
    else want = ids[rand(ids.length)] ?? '';
    const pick = choices.find((b) => b.dataset['choice'] === want) ?? choices[0];
    return click(pick, pick?.dataset['choice'] ?? 'choice');
  }
  const flipOnly = board.querySelector('[data-choice="flipOnly"]');
  if (flipOnly !== null) return click(flipOnly, 'flipOnly');
  const hand = [...board.querySelectorAll('[aria-label="내 손패"] button:not([disabled])')];
  return click(hand[rand(hand.length)], 'play');
}

async function attrs(page: Page) {
  const root = page.getByTestId('match');
  const nums = async (name: string) =>
    ((await root.getAttribute(name)) ?? '').split(',').filter(Boolean).map(Number);
  return {
    balances: await nums('data-balances'),
    refilled: await nums('data-refilled'),
    start: Number(await root.getAttribute('data-start-balance')),
    rounds: Number(await root.getAttribute('data-rounds-played')),
    seq: Number(await root.getAttribute('data-seq')),
  };
}

/** 콘솔 오류 수집 (게스트를 닫는 동안의 WebSocket 연결 실패 문구는 뺀다) */
function watchErrors(page: Page, into: string[]): void {
  page.on('console', (message) => {
    if (message.type() === 'error' && !/WebSocket/i.test(message.text())) into.push(message.text());
  });
  page.on('pageerror', (error) => into.push(String(error)));
}

/** 멈췄을 때 원인을 보이려고 양쪽 화면 상태를 모은다 */
async function snapshotState(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="match"]');
    const board = document.querySelector<HTMLElement>('[data-testid="board"]');
    return {
      root: root ? { ...root.dataset } : null,
      board: board ? { ...board.dataset } : null,
      notice: document.querySelector('[data-testid="game-notice"]')?.textContent ?? null,
      settlement:
        document.querySelector('[data-testid="settlement-headline"]')?.textContent ?? null,
      dialogs: [...document.querySelectorAll('dialog[open]')].map((d) =>
        d.textContent?.slice(0, 80),
      ),
      next: document.querySelector('[data-choice="next"]') !== null,
    };
  });
}

async function axe(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('호스트(Chromium)·게스트(WebKit) 20판 · 원장 제로섬 · 순번 연속 · 게스트 끊김 후 토큰 복귀 (AC-04)', async ({
  baseURL,
}, testInfo) => {
  // 두 브라우저를 직접 띄우는 테스트라 프로젝트마다 반복하지 않는다
  test.skip(testInfo.project.name !== 'chromium', '한 번만 실행 (Chromium 호스트 + WebKit 게스트)');
  test.setTimeout(12 * 60_000);
  const relay = await startRelay();
  const hostBrowser = await chromium.launch();
  const guestBrowser = await webkit.launch();
  const errors: string[] = [];
  try {
    const base = baseURL ?? 'http://127.0.0.1:4173';
    const query = `?speed=instant&relay=127.0.0.1:${relay.port}`;
    const hostPage = await (
      await hostBrowser.newContext({ viewport: { width: 412, height: 915 } })
    ).newPage();
    const guestContext = await guestBrowser.newContext({ viewport: { width: 393, height: 852 } });
    let guestPage = await guestContext.newPage();
    watchErrors(hostPage, errors);
    watchErrors(guestPage, errors);

    // 호스트: 홈 → 친구와 대전 → 방 열기 (브라우저라 핫스팟은 "Android 앱에서만")
    await hostPage.goto(`${base}/${query}&role=host#/`);
    await hostPage.getByRole('button', { name: '친구와 대전' }).click();
    await expect(hostPage.getByRole('heading', { name: '방 열기' })).toBeVisible();
    await expect(hostPage.getByTestId('guest-status')).toHaveText(/기다리는 중/);
    await expect(hostPage.getByRole('img', { name: '게임 주소 QR' })).toBeVisible();
    await expect(hostPage.getByTestId('host-start')).toBeDisabled();

    // 게스트: 이름 → 입장 → 대기실 (FR-05: 양쪽 이름·규칙·점당·시작 잔액)
    await guestPage.goto(`${base}/${query}&role=guest`);
    await expect(guestPage.getByRole('heading', { name: '게임 참가' })).toBeVisible();
    await guestPage.getByRole('textbox', { name: '내 이름' }).fill('민지');
    await guestPage.getByRole('button', { name: '입장' }).click();
    const lobby = guestPage.getByTestId('lobby');
    await expect(lobby).toBeVisible();
    await expect(lobby).toContainText('호스트');
    await expect(lobby).toContainText('민지');
    await expect(lobby).toContainText('표준');
    await expect(guestPage).toHaveURL(/#g=[0-9a-f]{32}&n=/);
    await expect(hostPage.getByTestId('guest-status')).toHaveText(/민지 · 연결됨/);
    expect(await axe(hostPage)).toEqual([]);
    expect(await axe(guestPage)).toEqual([]);

    await hostPage.getByTestId('host-start').click();
    await expect(hostPage.getByTestId('match')).toBeVisible();
    await expect(guestPage.getByTestId('match')).toBeVisible();
    // 사람이 볼 수 있게 첫 판 게임판을 남긴다 (기준 이미지 아님)
    await guestPage.getByTestId('board').waitFor();
    await guestPage.screenshot({ path: testInfo.outputPath('guest-board.png') });
    await hostPage.screenshot({ path: testInfo.outputPath('host-board.png') });

    let dropped = false;
    let hostDone = false;
    let hostRounds = 0;
    const counts = new Map<string, number>();
    const count = (r: string) => counts.set(r, (counts.get(r) ?? 0) + 1);
    const deadline = Date.now() + 9 * 60_000;
    const stalled = async (who: string, error: unknown) =>
      new Error(
        `${who} 진행 멈춤 (${String(error).slice(0, 200)}): ${JSON.stringify({ host: await snapshotState(hostPage), guest: await snapshotState(guestPage), relay: relay.log.slice(-10) })}`,
      );

    // 호스트: 버튼 판단은 브라우저 안에서 폴링한다(왕복을 줄인다). 20판 정산을 보면 끝
    const hostLoop = async () => {
      while (!hostDone && Date.now() < deadline) {
        let r: string;
        try {
          const handle = await hostPage.waitForFunction(
            autoStep,
            { target: ROUNDS, stopAtSettlement: false, seed: 1 },
            { polling: 20, timeout: 60_000 },
          );
          r = String(await handle.jsonValue());
        } catch (error) {
          throw await stalled('호스트', error);
        }
        count(r);
        if (r === 'done') hostDone = true;
        if (r === 'next')
          hostRounds = Number(
            await hostPage.getByTestId('match').getAttribute('data-rounds-played'),
          );
      }
    };

    // 게스트: 같은 방식. 절반쯤에서 페이지를 닫았다가 같은 주소(토큰)로 다시 연다 (spec 2.4, NF-05)
    const guestLoop = async () => {
      let lastSeq = 0;
      while (Date.now() < deadline) {
        if (!dropped && hostRounds >= DROP_AT) {
          dropped = true;
          const url = guestPage.url();
          expect(url).toMatch(/#g=[0-9a-f]{32}/);
          await guestPage.close();
          await hostPage.waitForTimeout(1_500);
          guestPage = await guestContext.newPage();
          watchErrors(guestPage, errors);
          const returned = Date.now();
          await guestPage.goto(url);
          await expect(guestPage.getByTestId('match')).toBeVisible();
          // 재동기화: 새 페이지가 호스트와 같은 순번·잔액을 5초 안에 맞춘다
          await expect
            .poll(async () => (await attrs(guestPage)).seq, { timeout: 5_000 })
            .toBe((await attrs(hostPage)).seq);
          testInfo.annotations.push({
            type: 'resync-ms',
            description: String(Date.now() - returned),
          });
          expect((await attrs(guestPage)).balances).toEqual((await attrs(hostPage)).balances);
          lastSeq = 0;
        }
        let r: string;
        try {
          const handle = await guestPage.waitForFunction(
            autoStep,
            { target: null, stopAtSettlement: hostDone, seed: 2 },
            { polling: 20, timeout: hostDone ? 60_000 : 2_000 },
          );
          r = String(await handle.jsonValue());
        } catch (error) {
          // 2초 동안 누를 것이 없었다(호스트 차례·끊김 처리 중): 조건을 새로 넣어 다시 기다린다
          if (!hostDone && String(error).includes('Timeout')) continue;
          throw await stalled('게스트', error);
        }
        count(`guest:${r}`);
        // NP-03: 게스트 순번은 한 페이지 안에서 뒤로 가지 않는다
        const seq = Number(await guestPage.getByTestId('match').getAttribute('data-seq'));
        expect(seq).toBeGreaterThanOrEqual(lastSeq);
        lastSeq = seq;
        if (r === 'done') return;
      }
    };
    await Promise.all([hostLoop(), guestLoop()]);
    expect(hostDone).toBe(true);
    expect(dropped).toBe(true);

    const host = await attrs(hostPage);
    const guest = await attrs(guestPage);
    expect(host.rounds).toBeGreaterThanOrEqual(ROUNDS);
    // MN-01: 원장은 두 좌석 사이의 이동뿐 (재충전은 따로 센다)
    const refilled = host.refilled.reduce((a, b) => a + b, 0);
    expect(host.balances.reduce((a, b) => a + b, 0)).toBe(host.start * 2 + refilled);
    for (const b of host.balances) expect(b).toBeGreaterThanOrEqual(0);
    // 양쪽 화면이 같은 원장과 같은 순번
    expect(guest.balances).toEqual(host.balances);
    await expect.poll(async () => (await attrs(guestPage)).seq).toBe(host.seq);
    await hostPage.locator('[data-choice="end"]').click();
    await expect(guestPage.getByRole('heading', { name: '정산' })).toBeVisible();
    await expect(guestPage.getByTestId('settlement-note')).toContainText('검증 통과');
    await expect(guestPage.getByTestId('settlement-note')).toContainText(
      '호스트가 대전을 끝냈습니다',
    );
    await expect(guestPage.locator('[data-choice="fresh"]')).toBeVisible();
    console.log(
      `[AC-04] 호스트 ${host.rounds}판 · seq ${host.seq} · 잔액 ${host.balances.join('/')} · 재동기화 ${testInfo.annotations.find((a) => a.type === 'resync-ms')?.description ?? '?'}ms · ${JSON.stringify(Object.fromEntries(counts))}`,
    );
    testInfo.annotations.push({
      type: 'p2p-actions',
      description: JSON.stringify(Object.fromEntries(counts)),
    });
    expect(errors).toEqual([]);
  } finally {
    await hostBrowser.close();
    await guestBrowser.close();
    relay.proc.kill('SIGTERM');
  }
});

test('게스트가 보통 나가기를 누르면 호스트에 연결 끊김이 보인다 (spec 2.4)', async ({
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '한 번만 실행');
  const relay = await startRelay();
  const browser = await chromium.launch();
  try {
    const base = baseURL ?? 'http://127.0.0.1:4173';
    const query = `?speed=instant&relay=127.0.0.1:${relay.port}`;
    const host = await browser.newPage();
    const guest = await browser.newPage();
    await host.goto(`${base}/${query}&role=host#/`);
    await host.getByRole('button', { name: '친구와 대전' }).click();
    await guest.goto(`${base}/${query}&role=guest`);
    await guest.getByRole('textbox', { name: '내 이름' }).fill('민지');
    await guest.getByRole('button', { name: '입장' }).click();
    await expect(host.getByTestId('host-start')).toBeEnabled();
    await host.getByTestId('host-start').click();
    await expect(guest.getByTestId('match')).toBeVisible();
    await guest.getByTestId('game-menu').click();
    await guest.locator('[data-menu="leave"]').click();
    await guest.locator('[data-menu="leave"]').click();
    await expect(guest.getByRole('heading', { name: '게임 참가' })).toBeVisible();
    await expect(host.getByTestId('game-notice')).toContainText('연결 끊김');
  } finally {
    await browser.close();
    relay.proc.kill('SIGTERM');
  }
});
