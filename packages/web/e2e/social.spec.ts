// AC-SC-01~03: 실제 LAN relay/production Game의 양방향 사회표현. 공개 운영·저장 원문 접근0.
import { expect, test, webkit, type Browser } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SOCIAL_LIMITS } from '@p2p-gostop/protocol';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 기존 LAN relay의 공식 CLI. 운영 환경/URL/secret은 상속하지 않는다.
async function startSocialRelay(): Promise<{ port: number; close(): Promise<void> }> {
  const cli = fileURLToPath(new URL('../../relay-dev/src/cli.ts', import.meta.url));
  const proc: ChildProcess = spawn(process.execPath, [cli, '--port', '0'], {
    env: { PATH: process.env['PATH'] ?? '', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const close = async () => {
    if (proc.exitCode !== null) return;
    const exited = new Promise<void>((done) => proc.once('exit', () => done()));
    proc.kill('SIGTERM');
    await exited;
  };
  try {
    const port = await new Promise<number>((done, fail) => {
      const timer = setTimeout(() => fail(new Error('합성 LAN relay 시작 실패')), 15000);
      let pending = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        pending = (pending + chunk.toString()).slice(-1024);
        const match = /listening on ws:\/\/[^:]+:(\d+)/.exec(pending);
        if (match?.[1]) {
          clearTimeout(timer);
          done(Number(match[1]));
        }
      });
      proc.once('error', () => {
        clearTimeout(timer);
        fail(new Error('합성 LAN relay 실행 실패'));
      });
      proc.once('exit', () => {
        clearTimeout(timer);
        fail(new Error('합성 LAN relay 조기 종료'));
      });
    });
    return { port, close };
  } catch (error) {
    await close();
    throw error;
  }
}

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test('대전 대화 text/emote/phrase·mute·명시 버튼·새로고침 복구 (AC-SC) @smoke @paired', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'Chromium 호스트와 WebKit 게스트 한 번');
  const relay = await startSocialRelay();
  let safari: Browser | null = null;
  try {
    safari = await webkit.launch();
    const context = await safari.newContext({ viewport: { width: 393, height: 852 } });
    const guest = await context.newPage();
    const base = baseURL ?? 'http://127.0.0.1:4173';
    const query = `?speed=instant&relay=127.0.0.1:${relay.port}`;
    await page.goto(`${base}/${query}&role=host#/`);
    await page.getByRole('link', { name: '핫스팟 대전' }).click();
    await guest.goto(`${base}/${query}&role=guest`);
    await guest.getByRole('textbox', { name: '내 이름' }).fill('게스트');
    await guest.getByRole('button', { name: '입장', exact: true }).click();
    await expect(page.getByTestId('host-start')).toBeEnabled();
    await page.getByTestId('host-start').click();
    const hostRoot = page.getByTestId('match');
    const guestRoot = guest.getByTestId('match');
    async function expectMatchReady() {
      // pending=0은 활성 batch 완료가 아니다. running clock은 양쪽 rendered ACK 뒤에만 시작한다.
      // root seq/round는 공개 상태, HUD round/내기 버튼은 표시 상태·동작 접근의 추가 근거다.
      await expect
        .poll(async () => {
          const views = await Promise.all(
            [hostRoot, guestRoot].map((root) =>
              root.evaluate((node) => ({
                seq: node.getAttribute('data-seq'),
                round: node.getAttribute('data-round'),
                pending: node.getAttribute('data-playback-pending'),
                canAct: node.getAttribute('data-can-act'),
                decision: node.getAttribute('data-decision-id'),
                timer:
                  node.querySelector('[data-testid="decision-timer"]')?.textContent?.trim() ?? '',
                displayedRound: node.querySelector('.table-heading > span')?.textContent ?? '',
                boardBusy: node.querySelector('[data-testid="board"]')?.getAttribute('aria-busy'),
                playable: node.querySelectorAll('.hand [data-slot]:not(:disabled)').length,
                chatEnabled:
                  node.querySelector<HTMLButtonElement>('.social-button')?.disabled === false,
              })),
            ),
          );
          const owner = views.findIndex((view) => /^나 (?:[1-9]|10)초$/.test(view.timer));
          if (owner < 0) return false;
          const actor = views[owner]!,
            peer = views[1 - owner]!;
          return (
            views.every(
              (view) =>
                view.pending === '0' &&
                view.chatEnabled &&
                /^\d+$/.test(view.seq ?? '') &&
                /^[1-9]\d*$/.test(view.round ?? '') &&
                /^\d+$/.test(view.decision ?? '') &&
                view.displayedRound.startsWith(`${view.round}판 ·`),
            ) &&
            actor.seq === peer.seq &&
            actor.round === peer.round &&
            actor.decision === peer.decision &&
            /^상대 (?:[1-9]|10)초$/.test(peer.timer) &&
            actor.canAct === 'true' &&
            peer.canAct === 'false' &&
            actor.boardBusy === 'false' &&
            actor.playable > 0
          );
        })
        .toBe(true);
    }
    await expect(hostRoot).toBeVisible();
    await expect(guestRoot).toBeVisible();
    // 초기 선택은 원 사용자 경로로 선택한다. 대화는 선택·결과 prompt보다 우선하지 않는다.
    for (const actor of [page, guest]) {
      const first = actor.locator('[data-choice^="pick-"]:not(:disabled)');
      await expect(first.first()).toBeVisible();
      await first.first().click();
    }
    await expectMatchReady();
    // 실제 Game 상단 두 버튼은 서로와 손패를 가리지 않아야 한다. 6장 정본은 Game.social에서 고정한다.
    for (const actor of [page, guest]) {
      const clearHits = await actor.getByTestId('match').evaluate((root) => {
        const chat = root.querySelector<HTMLButtonElement>('button[aria-label="대전 대화"]')!;
        const menu = root.querySelector<HTMLButtonElement>('[data-testid="game-menu"]')!;
        const a = chat.getBoundingClientRect(),
          b = menu.getBoundingClientRect();
        const separate = (x: DOMRect, y: DOMRect) =>
          x.right <= y.left || y.right <= x.left || x.bottom <= y.top || y.bottom <= x.top;
        const hits = [chat, menu].every((node) => {
          const r = node.getBoundingClientRect();
          return (
            r.width >= 48 &&
            r.height >= 48 &&
            node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
          );
        });
        return (
          hits &&
          separate(a, b) &&
          [...root.querySelectorAll('.hand [data-slot]')].every((card) =>
            separate(a, card.getBoundingClientRect()),
          )
        );
      });
      expect(clearHits).toBe(true);
    }
    await page.getByRole('button', { name: '대전 대화', exact: true }).click();
    const input = page.getByRole('textbox', { name: '보낼 문장' });
    await expect(input).toBeEnabled();
    const before = [
      await hostRoot.getAttribute('data-seq'),
      await hostRoot.getAttribute('data-balances'),
    ];
    const text = '<b>안녕</b> https://example.invalid';
    await input.fill(text);
    await input.press('Enter');
    await expect(guest.locator('.social-notices li')).toHaveCount(0);
    await input.dispatchEvent('compositionstart');
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    await expect(page.getByRole('button', { name: '전송', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '감정표현', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '정형 문구', exact: true })).toBeDisabled();
    await expect(guest.locator('.social-notices li')).toHaveCount(0);
    await input.dispatchEvent('compositionend');
    // 저장 원문은 메모리에서만 비교하며 assertion/trace에 재출력하지 않는다.
    const savedBefore = await page.evaluate(() => localStorage.getItem('gostop.host.v2'));
    const decisionBefore = await hostRoot.getAttribute('data-decision-id');
    const secondsBefore = await page.getByTestId('decision-timer').allTextContents();
    const remaining = (texts: string[]) => {
      expect(texts).toHaveLength(1);
      const seconds = Number(/^(?:나|상대) (\d+)초$/.exec(texts[0]!.trim())?.[1] ?? NaN);
      expect(Number.isFinite(seconds)).toBe(true);
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(10);
      return seconds;
    };
    const remainingBefore = remaining(secondsBefore);
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(guest.locator('.social-notices li')).toHaveText([text]);
    await expect(guest.locator('.social-notices a, .social-notices b')).toHaveCount(0);
    expect([
      await hostRoot.getAttribute('data-seq'),
      await hostRoot.getAttribute('data-balances'),
    ]).toEqual(before);
    const savedAfter = await page.evaluate(() => localStorage.getItem('gostop.host.v2'));
    expect(savedBefore !== null && savedAfter === savedBefore).toBe(true);
    await expect(hostRoot).toHaveAttribute('data-decision-id', decisionBefore ?? '');
    await expect(hostRoot).toHaveAttribute('data-playback-pending', '0');
    const secondsAfter = await page.getByTestId('decision-timer').allTextContents();
    expect(remaining(secondsAfter)).toBeLessThanOrEqual(remainingBefore);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.getByRole('button', { name: '대전 대화', exact: true })).toBeFocused();
    await guest.getByRole('button', { name: '대전 대화', exact: true }).click();
    await guest.getByRole('checkbox', { name: '상대 표현 끄기' }).check();
    await expect(guest.locator('.social-notices li')).toHaveCount(0);
    await expect(guest.locator('.social-notices [role="status"]')).toHaveAttribute(
      'aria-live',
      'off',
    );
    await guest.getByRole('checkbox', { name: '상대 표현 끄기' }).uncheck();
    await guest.getByRole('button', { name: '감정표현', exact: true }).click();
    await guest.getByRole('button', { name: '미소', exact: true }).click();
    await expect(page.locator('.social-notices li')).toHaveText(['미소']);
    const firstGuestReceiptCompletedAt = performance.now();
    await guest.getByRole('button', { name: '정형 문구', exact: true }).click();
    // sender의 2초 제한은 명시된 실제 UI 상태를 기다린다. 본문을 자동 재전송하지 않는다.
    await expect
      .poll(() => guest.getByRole('button', { name: '안녕하세요', exact: true }).isEnabled())
      .toBe(true);
    await guest.getByRole('button', { name: '안녕하세요', exact: true }).click();
    await expect(page.locator('.social-notices li')).toContainText(['미소', '안녕하세요']);
    await guest.getByRole('button', { name: '닫기', exact: true }).click();
    const { violations } = await new AxeBuilder({ page: guest }).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    // host의 첫 content 수신 완료 뒤 5초: 그 이전 ready와 첫 content 슬롯의 경계다.
    // 새 socket/auth는 예산을 환급하지 않는다. 폐기된 본문을 재전송하지 않고 새 표현을 보낸다.
    await expect
      .poll(() => performance.now() - firstGuestReceiptCompletedAt)
      .toBeGreaterThanOrEqual(SOCIAL_LIMITS.receiveMs);
    await guest.reload();
    await expect(guestRoot).toBeVisible();
    await expect(guest.locator('.social-notices li')).toHaveCount(0);
    // 실제 재인증/새 ready 뒤 양방향 새 표현까지 도달해야 reload만 성공한 것으로 끝내지 않는다.
    await expectMatchReady();
    await guest.getByRole('button', { name: '대전 대화', exact: true }).click();
    await expect(guest.getByRole('textbox', { name: '보낼 문장' })).toBeEnabled();
    const postReloadGame = async () =>
      Promise.all(
        [hostRoot, guestRoot].map(async (root) => [
          await root.getAttribute('data-seq'),
          await root.getAttribute('data-round'),
          await root.getAttribute('data-balances'),
          await root.getAttribute('data-decision-id'),
        ]),
      );
    const guestSendGame = await postReloadGame();
    const guestSendSave = await page.evaluate(() => localStorage.getItem('gostop.host.v2'));
    await guest.getByRole('textbox', { name: '보낼 문장' }).fill('다시 만나요');
    await guest.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.social-notices li')).toContainText(['다시 만나요']);
    expect(await postReloadGame()).toEqual(guestSendGame);
    expect(
      guestSendSave !== null &&
        (await page.evaluate(() => localStorage.getItem('gostop.host.v2'))) === guestSendSave,
    ).toBe(true);
    remaining(await page.getByTestId('decision-timer').allTextContents());
    await guest.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('button', { name: '대전 대화', exact: true }).click();
    await expect(input).toBeEnabled();
    const hostSendGame = await postReloadGame();
    const hostSendSave = await page.evaluate(() => localStorage.getItem('gostop.host.v2'));
    await input.fill('반가워요');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(guest.locator('.social-notices li')).toHaveText(['반가워요']);
    expect(await postReloadGame()).toEqual(hostSendGame);
    expect(
      hostSendSave !== null &&
        (await page.evaluate(() => localStorage.getItem('gostop.host.v2'))) === hostSendSave,
    ).toBe(true);
    remaining(await page.getByTestId('decision-timer').allTextContents());
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await expectMatchReady();
  } finally {
    await safari?.close();
    await relay.close();
  }
});
