// C01·C02·U14: 저장된 솔로 권위 뷰에서 자동 입력과 메뉴 보류를 실제 화면으로 확인한다.
import { cardId, PRESETS, reduce, type GameState } from '@p2p-gostop/engine';
import type { BoardView, HostMessage, GuestMessage } from '@p2p-gostop/protocol';
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
  await page.getByTestId('game-menu').click();
  await page.locator('[data-menu="board-info"]').click();
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
  const ask = page.getByLabel('국진 처리');
  await expect(ask).toHaveValue('"auto"');
  await ask.selectOption('"ask"');
  await page.reload();
  await expect(ask).toHaveValue('"ask"');
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

/** 공개 화면만 조작한다. 게스트의 유일한 합법 play는 절대로 수동 대체하지 않는다. */
async function stepMatch(page: Page, authority: { seq: number; view: BoardView } | null = null) {
  return page.evaluate((current) => {
    const root = document.querySelector<HTMLElement>('[data-testid="match"]');
    if (root === null) return null;
    const visible = (el: HTMLButtonElement) => !el.disabled && el.getClientRects().length > 0;
    for (const choice of ['accept', 'next']) {
      const button = root.querySelector<HTMLButtonElement>(`[data-choice="${choice}"]`);
      if (button && visible(button)) {
        button.click();
        return { kind: 'round' as const };
      }
    }
    if (root.dataset['canAct'] !== 'true') return null;
    if (current !== null) {
      if (Number(root.dataset['seq']) !== current.seq) return null;
      const legal = current.view.legal;
      if (current.view.pending?.kind === 'play' && legal.length === 1 && legal[0]?.type === 'play')
        return null;
    }
    const board = root.querySelector<HTMLElement>('[data-testid="board"]');
    if (board === null) return null;
    const choices = [...board.querySelectorAll<HTMLButtonElement>('[data-choice]')].filter(visible);
    const choice =
      choices.find((el) =>
        ['go', 'noShake', 'continue', 'single'].includes(el.dataset['choice'] ?? ''),
      ) ?? choices[0];
    if (choice) {
      choice.click();
      return { kind: 'selection' as const };
    }
    const hand = [
      ...board.querySelectorAll<HTMLButtonElement>('[aria-label="내 손패"] button'),
    ].filter(visible);
    // 호스트 유일 수 역시 자동 입력에 맡긴다. 게스트는 위의 권위 합법 수 판정을 따른다.
    if (
      hand.length > 1 ||
      (hand.length === 1 && current !== null && current.view.legal.length > 1)
    ) {
      const button = hand[0]!;
      const played = {
        kind: 'play' as const,
        seq: Number(root.dataset['seq']),
        card: Number(button.dataset['slot']),
      };
      button.click();
      return played;
    }
    return null;
  }, authority);
}

/** NP-02 재현용 가짜 난수: 저장·제품 훅 없이 양 브라우저의 commit-reveal 입력만 고정한다. */
async function fixedRandom(page: Page, byte: number) {
  await page.addInitScript((value) => {
    crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
      if (array === null) throw new TypeError('난수 배열 없음');
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(value);
      return array;
    };
  }, byte);
}

test('P2P relay-dev: 게스트 유일 수는 한 번 전송하고 두 좌석의 수동 선택은 계속 가능 @guest @paired', async ({
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
    await fixedRandom(host, 17);
    await fixedRandom(guest, 29);
    await host.addInitScript(() => {
      localStorage.setItem('gostop.settings.v1', JSON.stringify({ gukjinAsk: true }));
      localStorage.setItem('gostop.p2p-timer.v1', 'null');
    });
    const sent: Extract<GuestMessage, { t: 'action' }>[] = [];
    const received: HostMessage[] = [];
    const unique: { seq: number; view: BoardView }[] = [];
    let latest: { seq: number; view: BoardView } | null = null;
    let revision = 0;
    await guest.routeWebSocket(/\/ws\?role=guest$/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((raw) => {
        const message = JSON.parse(raw.toString()) as GuestMessage;
        if (message.t === 'action') sent.push(message);
        server.send(raw);
      });
      server.onMessage((raw) => {
        const message = JSON.parse(raw.toString()) as HostMessage;
        // 게스트에게 공개된 권위 뷰/응답만 관측한다. reveal·가림 손패는 읽지 않는다.
        if (['welcome', 'snapshot', 'events', 'status', 'reject'].includes(message.t)) {
          received.push(message);
          revision++;
        }
        if (message.t === 'snapshot' || message.t === 'events') {
          latest = { seq: message.t === 'snapshot' ? message.seq : message.to, view: message.view };
          if (
            message.view.phase === 'turn' &&
            message.view.pending?.kind === 'play' &&
            message.view.pending.seat === 1 &&
            message.view.legal.length === 1 &&
            message.view.legal[0]?.type === 'play'
          )
            unique.push(latest);
        }
        ws.send(raw);
      });
    });
    const base = baseURL ?? 'http://127.0.0.1:4173';
    const query = `?speed=instant&relay=127.0.0.1:${relay.port}`;
    await host.goto(`${base}/${query}&role=host#/`);
    await host.getByRole('button', { name: '핫스팟 대전' }).click();
    await guest.goto(`${base}/${query}&role=guest`);
    await guest.getByRole('textbox', { name: '내 이름' }).fill('민지');
    await guest.getByRole('button', { name: '입장' }).click();
    await expect(guest.getByTestId('lobby')).toBeVisible();
    expect(received.some((m) => m.t === 'welcome' && m.rules.gukjin === 'ask')).toBe(true);
    await host.getByTestId('host-start').click();
    await expect(guest.getByTestId('match')).toBeVisible();

    type ManualPlay = {
      seat: number;
      seq: number;
      card: number;
      receivedFrom: number;
      after: boolean;
    };
    const accepted: ManualPlay[] = [];
    async function acceptManual(play: ManualPlay) {
      // 다른 좌석의 응답이나 단순 선택 UI 열기는 이 클릭의 수락으로 세지 않는다.
      let requestId: number | undefined;
      if (play.seat === 1) {
        const matchingAction = () =>
          sent.find(
            (m) =>
              m.seq === play.seq &&
              m.payload.type === 'play' &&
              m.payload.seat === 1 &&
              m.payload.card === play.card,
          );
        await expect
          .poll(matchingAction, { message: '게스트 수동 play의 seq·payload에 대응하는 실제 전송' })
          .toBeDefined();
        const action = matchingAction()!;
        expect(action.requestId).toBeDefined();
        requestId = action.requestId;
      }
      await expect
        .poll(
          () =>
            received
              .slice(play.receivedFrom)
              .some(
                (m) =>
                  m.t === 'events' &&
                  m.to > play.seq &&
                  (play.seat === 0 || m.requestId === requestId) &&
                  m.list.some(
                    (event) =>
                      event.type === 'CardPlayed' &&
                      event.seat === play.seat &&
                      event.cards.some((card) => card === play.card),
                  ),
              ),
          { message: '해당 수동 play의 공개 CardPlayed 이벤트·권위 뷰 진전·게스트 requestId ack' },
        )
        .toBe(true);
      accepted.push(play);
    }

    const manualBefore = [0, 0];
    const manualAfter = [0, 0];
    // 고정 입력의 첫 판에서 게스트 카드 45가 유일 수가 된다. 다음 판의 양 좌석 수동 입력까지 확인한다.
    for (let step = 0; step < 100; step++) {
      if (unique.length > 0 && manualAfter.every((n) => n > 0)) break;
      const before = revision;
      const clicked = new Set<number>();
      const pending: ManualPlay[] = [];
      await expect
        .poll(
          async () => {
            for (const [seat, page] of [host, guest].entries()) {
              if (clicked.has(seat)) continue;
              const receivedFrom = received.length;
              const after = unique.length > 0;
              const result = await stepMatch(page, seat === 1 ? latest : null);
              if (result !== null) {
                clicked.add(seat);
                if (result.kind === 'play')
                  pending.push({ seat, seq: result.seq, card: result.card, receivedFrom, after });
              }
            }
            return revision > before;
          },
          { message: '공개 권위 응답 또는 자동 입력으로 판이 진행되어야 한다' },
        )
        .toBe(true);
      // 마지막 클릭도 실제 전송·권위 수락을 기다린 뒤에만 카운트와 종료 조건에 반영한다.
      for (const play of pending) {
        await acceptManual(play);
        const counts = play.after ? manualAfter : manualBefore;
        counts[play.seat] = (counts[play.seat] ?? 0) + 1;
      }
    }
    expect(unique.length).toBeGreaterThan(0);
    const candidate = unique[0]!;
    expect(candidate.view.round).toBe(1);
    expect(candidate.view.legal).toEqual([{ type: 'play', seat: 1, card: 45 }]);
    const automatic = sent.filter((m) => m.seq === candidate.seq);
    expect(automatic).toHaveLength(1);
    expect(automatic[0]?.payload).toEqual(candidate.view.legal[0]);
    expect(automatic[0]?.requestId).toBeDefined();
    expect(
      received.some(
        (m) => (m.t === 'events' || m.t === 'snapshot') && m.requestId === automatic[0]?.requestId,
      ),
    ).toBe(true);
    expect(received.filter((m) => m.t === 'reject')).toHaveLength(0);
    expect(manualBefore.every((n) => n > 0)).toBe(true);
    expect(manualAfter.every((n) => n > 0)).toBe(true);
    expect(accepted.filter((play) => !play.after).every((play) => play.seq < candidate.seq)).toBe(
      true,
    );
    expect(accepted.filter((play) => play.after).every((play) => play.seq > candidate.seq)).toBe(
      true,
    );
    const ids = sent.map((entry) => entry.requestId);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(sent.map((entry) => `${entry.seq}:${JSON.stringify(entry.payload)}`)).size).toBe(
      sent.length,
    );
  } finally {
    await hostBrowser.close();
    await guestBrowser.close();
    relay.proc.kill();
  }
});
