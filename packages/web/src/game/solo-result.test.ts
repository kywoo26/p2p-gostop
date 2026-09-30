// #131 / FR-16·FR-53·UX-T05·U15·NF-08: 결과 확인 전에 선택·CPU·원장을 진행하지 않는다.
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import Game from '../routes/Game.svelte';
import { sessionAct, parseSession } from './session.ts';
import { resultScenario } from './solo-result.test-helper.ts';
import { SoloSession } from './solo.svelte.ts';
import type { AiResult } from './ai-core.ts';

for (const mode of ['normal', 'fast', 'reduced', 'skip'] as const) {
  test.each([false, true])(
    `${mode} 실제 수동=%s 스톱: 재생→결과 확인→선택→정산→다음 판`,
    async (manual) => {
      document.documentElement.dataset['speed'] = mode === 'fast' ? 'fast' : 'normal';
      const originalMedia = window.matchMedia.bind(window);
      if (mode === 'reduced')
        vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
          query === '(prefers-reduced-motion: reduce)'
            ? { ...originalMedia(query), matches: true }
            : originalMedia(query),
        );
      const solo = new SoloSession(resultScenario(manual), {
        difficulty: 'easy',
        timeBudgetMs: 100,
        persist: false,
        ai: {
          mode: 'inline',
          async decide() {
            throw new Error('CPU 요청 없음');
          },
          dispose() {},
        },
      });
      const screen = await render(Game, { controller: solo });
      try {
        expect(solo.submit({ type: 'play', seat: 0, card: 16 })).toBe(true);
        if (manual) {
          solo.skipAnimations();
          await vi.waitFor(() => expect(solo.canAct).toBe(true));
          expect(solo.submit({ type: 'stop', seat: 0 })).toBe(true);
        }
        expect(solo.state.phase).toBe('pushDecision');
        expect(solo.state.game.result?.reason).toBe(manual ? 'stop' : 'autoStop');
        if (mode !== 'reduced') {
          await vi.waitFor(() => expect(solo.playback.busy).toBe(true));
          expect(screen.container.querySelector('.overlay')).toBeNull();
          solo.acknowledgeRoundResult(`${solo.state.roundNumber}:${solo.state.game.eventSeq}`);
          solo.choosePush(true);
          expect(solo.pendingRoundResult).toBeNull();
          expect(solo.state.records).toHaveLength(0);
        }
        if (mode === 'skip') solo.skipAnimations();
        await vi.waitFor(
          () =>
            expect(screen.container.querySelector('[data-choice="acknowledge"]')).not.toBeNull(),
          { timeout: 8000 },
        );
        expect(solo.playback.busy).toBe(false);
        expect(solo.playback.pending).toBe(0);
        expect(solo.pendingRoundResult?.key).toBe(
          `${solo.playback.board.round}:${solo.playback.board.eventSeq}`,
        );
        expect(
          screen.container.querySelector('[data-testid="settlement-headline"]')?.textContent,
        ).toContain('승리');
        expect(screen.container.textContent).toContain('7점');
        expect(screen.container.textContent).toContain('받을 경우');
        expect(screen.container.textContent).toContain('700냥');
        expect(screen.container.querySelector('[data-choice="push"]')).toBeNull();
        expect(screen.container.querySelector('[data-choice="next"]')).toBeNull();
        expect(screen.container.querySelector('[data-testid="balance-0"]')).toBeNull();
        expect(solo.state.records).toHaveLength(0);
        const ledger = solo.state.ledger;
        solo.choosePush(false);
        expect(solo.state.ledger).toBe(ledger);
        solo.acknowledgeRoundResult('stale');
        expect(solo.pendingRoundResult?.acknowledged).toBe(false);
        const oldButton = screen.container.querySelector(
          '[data-choice="acknowledge"]',
        ) as HTMLButtonElement;
        oldButton.click();
        await vi.waitFor(() =>
          expect(screen.container.querySelector('[data-choice="accept"]')).not.toBeNull(),
        );
        await vi.waitFor(() =>
          expect(document.activeElement).toBe(
            screen.container.querySelector('[data-testid="settlement-headline"]'),
          ),
        );
        // 이전 버튼의 Enter 반복은 새 받기 버튼을 실행하지 않는다.
        await userEvent.keyboard('{Enter}');
        // 제거된 이전 포인터 대상에도 재입력이 도착해 새 선택을 실행하지 않는다.
        oldButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
        oldButton.click();
        expect(solo.state.records).toHaveLength(0);
        (screen.container.querySelector('[data-choice="accept"]') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(solo.playback.settlement).not.toBeNull());
        expect(solo.state.records).toHaveLength(1);
        expect(solo.state.ledger.entries).toHaveLength(1);
        expect(solo.state.roundNumber).toBe(1);
        solo.choosePush(false);
        expect(solo.state.records).toHaveLength(1);
        solo.nextRound();
        expect(solo.state.roundNumber).toBe(2);
        solo.acknowledgeRoundResult('1:stale');
        expect(solo.pendingRoundResult).toBeNull();
      } finally {
        solo.dispose();
        delete document.documentElement.dataset['speed'];
        vi.restoreAllMocks();
      }
    },
    15_000,
  );
}

test.each([false, true])('저장 CPU 승자: 즉시 결정 %s 확인 전 요청0, 확인 뒤1', async (push) => {
  const step = sessionAct(resultScenario(false, 1), { type: 'play', seat: 1, card: 16 });
  if (!step.ok) throw new Error(step.message);
  const pending = parseSession(JSON.parse(JSON.stringify(step.session)) as unknown);
  expect(pending?.phase).toBe('pushDecision');
  if (!pending) throw new Error('복원 실패');
  const decide = vi.fn(async () => ({
    action: { type: push ? ('push' as const) : ('stop' as const), seat: 1 as const },
    ms: 0,
  }));
  const solo = new SoloSession(pending, {
    difficulty: 'easy',
    timeBudgetMs: 100,
    persist: false,
    ai: { mode: 'worker', decide, dispose() {} },
  });
  const screen = await render(Game, { controller: solo });
  try {
    expect(decide).not.toHaveBeenCalled();
    const key = solo.pendingRoundResult!.key;
    solo.choosePush(true);
    solo.acknowledgeRoundResult('stale');
    expect(decide).not.toHaveBeenCalled();
    solo.acknowledgeRoundResult(key);
    solo.acknowledgeRoundResult(key);
    // 응답과 최종 재생 사이에도 결과 화면을 유지한다.
    expect(solo.pendingRoundResult?.summary.view.finalPoints).toBe(7);
    await vi.waitFor(() => expect(solo.playback.settlement).not.toBeNull());
    expect(screen.container.querySelector('[data-choice="next"]')).not.toBeNull();
    expect(solo.state.records).toHaveLength(1);
    expect(solo.state.records[0]?.settlement.pushed).toBe(push);
    expect(solo.state.ledger.entries).toHaveLength(push ? 0 : 1);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(solo.state.roundNumber).toBe(1);
  } finally {
    solo.dispose();
  }
});

test('최종 스냅 순번·남은 큐가 다르면 결과 공개와 확인을 보류한다', () => {
  const step = sessionAct(resultScenario(), { type: 'play', seat: 0, card: 16 });
  if (!step.ok) throw new Error(step.message);
  const solo = new SoloSession(step.session, {
    difficulty: 'easy',
    timeBudgetMs: 100,
    persist: false,
    ai: {
      mode: 'inline',
      async decide() {
        throw new Error('CPU 요청 없음');
      },
      dispose() {},
    },
  });
  try {
    const final = solo.playback.board;
    const key = solo.pendingRoundResult!.key;
    solo.playback.board = { ...final, eventSeq: final.eventSeq - 1 };
    expect(solo.pendingRoundResult).toBeNull();
    solo.acknowledgeRoundResult(key);
    solo.playback.board = final;
    expect(solo.pendingRoundResult?.acknowledged).toBe(false);
    solo.playback.pending = 1;
    expect(solo.pendingRoundResult).toBeNull();
    solo.acknowledgeRoundResult(key);
    solo.playback.pending = 0;
    expect(solo.pendingRoundResult?.acknowledged).toBe(false);
    solo.acknowledgeRoundResult(key);
    solo.choosePush(true);
    expect(solo.state.records).toHaveLength(1);
  } finally {
    solo.dispose();
  }
});

test.each(['end', 'dispose'] as const)('CPU 보류 응답·확인은 %s 뒤 무효', async (operation) => {
  const step = sessionAct(resultScenario(false, 1), { type: 'play', seat: 1, card: 16 });
  if (!step.ok) throw new Error(step.message);
  let resolve!: (result: AiResult) => void;
  const decide = vi.fn(
    () =>
      new Promise<AiResult>((done) => {
        resolve = done;
      }),
  );
  const solo = new SoloSession(step.session, {
    difficulty: 'easy',
    timeBudgetMs: 100,
    persist: false,
    ai: { mode: 'worker', decide, dispose() {} },
  });
  try {
    const key = solo.pendingRoundResult!.key;
    solo.acknowledgeRoundResult(key);
    expect(decide).toHaveBeenCalledTimes(1);
    solo[operation]();
    const state = solo.state;
    solo.acknowledgeRoundResult(key);
    resolve({ action: { type: 'push', seat: 1 }, ms: 0 });
    await vi.waitFor(() => expect(solo.thinking).toBe(false));
    expect(solo.state).toBe(state);
    expect(solo.pendingRoundResult).toBeNull();
  } finally {
    solo.dispose();
  }
});
