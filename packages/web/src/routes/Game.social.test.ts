// #246 R1~R3: production Game + AutoChoice/Playback 접점. 실제 WS·사람 IME 수용은 별도다.
import { cardId, playerView, reduce, type Action, type GameState } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { splitSocialGraphemes, validateSocialText, type BoardView } from '@p2p-gostop/protocol';
import { tick } from 'svelte';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { toBoardView } from '../game/adapter.ts';
import { AutoChoice, automaticAction, type GameController } from '../game/controller.ts';
import { Playback } from '../game/playback.svelte.ts';
import Game from './Game.svelte';

const c = cardId;
const board = (state: GameState): BoardView =>
  toBoardView(playerView(state, 0), { names: ['나', '상대'], balances: [1000, 1000] });
const one = (card: '5열' | '6열', alternative = false) =>
  board(
    createScenario({
      hands: [[c(card)], [c('10열')]],
      floor: [c('8광')],
      seats: [{ bombTokens: alternative ? 1 : 0 }, {}],
    }),
  );
const settle = () => new Promise<void>((done) => setTimeout(done, 20));

function fixture(initial: BoardView, mode: 'host' | 'guest' = 'host') {
  const onIdle = vi.fn();
  const playback = new Playback(initial, { viewer: 0, names: () => ['나', '상대'], onIdle });
  const sent: Action[] = [];
  let held = true;
  const choice = new AutoChoice(
    () => ({ view: playback.board, ready: !held }),
    (action) => {
      sent.push(action);
      return true;
    },
  );
  const social = {
    view: { muted: false, available: true, entries: [], now: 0, announceId: null },
    open: vi.fn(),
    mute: vi.fn(),
    send: vi.fn((_body: unknown) => true),
    validate: (text: string) => validateSocialText(text, splitSocialGraphemes),
  };
  const decisionRendered = vi.fn();
  const controller: GameController = {
    mode,
    playback,
    social,
    canAct: true,
    thinking: false,
    bankrupt: false,
    notice: null,
    pushDecision: null,
    decisionRendered,
    stats: {
      round: 1,
      phase: 'playing',
      roundsPlayed: 0,
      balances: [1000, 1000],
      refilled: [0, 0],
      startBalance: 1000,
      seq: 0,
    },
    submit: (action) => {
      sent.push(action);
      return true;
    },
    nextRound: () => {},
    choosePush: () => {},
    refill: () => {},
    end: () => {},
    attach: () => {},
    skipAnimations: () => {},
    autoAdvance: (pause) => {
      held = pause;
      choice.advance(pause);
    },
  };
  return {
    controller,
    playback,
    social,
    sent,
    onIdle,
    decisionRendered,
    dispose: () => {
      choice.dispose();
      playback.dispose();
    },
  };
}

function socialDialog(container: HTMLElement) {
  return container.querySelector<HTMLDialogElement>('dialog.social-dialog')!;
}
function hit(node: HTMLElement) {
  const r = node.getBoundingClientRect();
  expect(r.width).toBeGreaterThanOrEqual(48);
  expect(r.height).toBeGreaterThanOrEqual(48);
  expect(node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))).toBe(
    true,
  );
  return r;
}
function outside(a: DOMRect, b: DOMRect) {
  expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(
    true,
  );
}

test.each(['host', 'guest'] as const)(
  'R1 %s: 대화 중 최신 C02 보류, 수락된 FIFO/idle 통지는 유지, native close 뒤 최신 입력1',
  async (mode) => {
    const f = fixture(one('5열'), mode);
    f.playback.busy = true;
    const screen = await render(Game, { controller: f.controller });
    try {
      // idle 전환이 예약한 5열의 0ms timer보다 먼저 같은 작업에서 대화를 연다.
      f.playback.busy = false;
      await tick();
      (
        screen
          .getByRole('button', { name: '대전 대화', exact: true })
          .element() as HTMLButtonElement
      ).click();
      await tick();
      const dialog = socialDialog(screen.container);
      await vi.waitFor(() => expect(dialog.open).toBe(true));
      await settle();
      expect(f.sent).toEqual([]);
      // 수락된 원격/AI 묶음을 채팅이 큐에서 지우거나 멈추지 않는다. 권위 timer 자체는 이 fixture 범위 밖이다.
      const latest = { ...one('6열'), eventSeq: f.playback.board.eventSeq + 1 };
      f.playback.enqueue([], latest);
      await vi.waitFor(() => expect(f.playback.board.eventSeq).toBe(latest.eventSeq));
      await vi.waitFor(() => expect(f.playback.pending).toBe(0));
      // pending/표시 seq는 pump finally와 완료 통지보다 먼저 갱신된다.
      await vi.waitFor(() => expect(f.onIdle).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(f.decisionRendered).toHaveBeenCalled());
      expect(automaticAction(f.playback.board)).toEqual({ type: 'play', seat: 0, card: c('6열') });
      await settle();
      expect(f.sent).toEqual([]);
      expect(screen.container.firstElementChild?.getAttribute('data-auto-held')).toBe('true');
      dialog.close();
      await vi.waitFor(() => expect(f.sent).toEqual([{ type: 'play', seat: 0, card: c('6열') }]));
      await screen.getByRole('button', { name: '대전 대화', exact: true }).click();
      dialog.close();
      await settle();
      expect(f.sent).toHaveLength(1);
    } finally {
      await screen.unmount();
      f.dispose();
    }
  },
);

test('R3 Game 입력 Enter/IME 전송0·실패초안 유지·명시 text 버튼1·native close와 Back 복귀', async () => {
  const f = fixture(one('5열', true));
  expect(automaticAction(f.playback.board)).toBeNull();
  const screen = await render(Game, { controller: f.controller });
  try {
    const trigger = screen.getByRole('button', { name: '대전 대화', exact: true });
    await trigger.click();
    const input = screen.getByRole('textbox', { name: '보낼 문장' });
    await input.fill('한');
    const node = input.element();
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
    );
    await expect.element(screen.getByRole('button', { name: '전송', exact: true })).toBeDisabled();
    expect(f.social.send).not.toHaveBeenCalled();
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    node.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(f.social.send).not.toHaveBeenCalled();
    f.social.send.mockReturnValue(false);
    await screen.getByRole('button', { name: '전송', exact: true }).click();
    await expect.element(input).toHaveValue('한');
    f.social.send.mockClear();
    f.social.send.mockReturnValue(true);
    await screen.getByRole('button', { name: '전송', exact: true }).click();
    expect(f.social.send).toHaveBeenCalledExactlyOnceWith({ kind: 'text', text: '한' });
    await input.fill('초안');
    socialDialog(screen.container).close();
    await expect.element(trigger).toHaveFocus();
    await trigger.click();
    await expect.element(screen.getByRole('textbox', { name: '보낼 문장' })).toHaveValue('');
    await screen.rerender({ backToken: 1 });
    await vi.waitFor(() => expect(socialDialog(screen.container).open).toBe(false));
    await expect.element(trigger).toHaveFocus();
    expect(f.sent).toEqual([]);
  } finally {
    await screen.unmount();
    f.dispose();
  }
});

test.each([false, true])(
  'R3 새 target 우선·native close/Back 경합(%s)은 게임 입력0·prompt 초점',
  async (back) => {
    const f = fixture(one('5열', true));
    const screen = await render(Game, {
      controller: f.controller,
      // rerender의 flushSync는 앞선 reset을 먼저 flush한다. 같은 board 갱신에서 Back을 전달한다.
      get backToken() {
        return back ? f.playback.board.eventSeq : 0;
      },
    });
    try {
      await screen.getByRole('button', { name: '대전 대화', exact: true }).click();
      await screen.getByRole('textbox', { name: '보낼 문장' }).fill('초안');
      const state = createScenario({
        hands: [[c('8광')], [c('10열')]],
        floor: [c('8고'), c('8피a')],
        deck: [c('12비광'), c('10청')],
      });
      const step = reduce(state, { type: 'play', seat: 0, card: c('8광') });
      if (!step.ok) throw new Error(step.message);
      const target = board(step.state);
      expect(target.pending?.kind).toBe('target');
      expect(automaticAction(target)).toBeNull();
      f.playback.reset(target);
      await vi.waitFor(() => expect(socialDialog(screen.container).open).toBe(false));
      const prompt = screen.container.querySelector<HTMLElement>('.prompt')!;
      await vi.waitFor(() => expect(prompt.contains(document.activeElement)).toBe(true));
      await expect
        .element(screen.getByRole('button', { name: '대전 대화', exact: true }))
        .toBeDisabled();
      expect(f.sent).toEqual([]);
      // 게임 prompt 뒤 다시 대화할 수 있을 때 이전 초안은 남지 않는다.
      f.playback.reset({ ...one('5열', true), eventSeq: target.eventSeq });
      await screen.getByRole('button', { name: '대전 대화', exact: true }).click();
      await expect.element(screen.getByRole('textbox', { name: '보낼 문장' })).toHaveValue('');
    } finally {
      await screen.unmount();
      f.dispose();
    }
  },
);

test('R2 393×852 Game의 고정 6장 손패와 상단 대화/메뉴 rect·hit·키보드 선택', async () => {
  await page.viewport(393, 852);
  const cards = ['1광', '2고', '3광', '4고', '5열', '6열'].map((card) => c(card));
  const f = fixture(board(createScenario({ hands: [cards, [c('10열')]], floor: [c('8광')] })));
  const screen = await render(Game, { controller: f.controller });
  try {
    const trigger = screen
      .getByRole('button', { name: '대전 대화', exact: true })
      .element() as HTMLElement;
    const menu = screen.getByTestId('game-menu').element() as HTMLElement;
    const chatRect = hit(trigger),
      menuRect = hit(menu);
    outside(chatRect, menuRect);
    const slots = [...screen.container.querySelectorAll<HTMLButtonElement>('.hand [data-slot]')];
    expect(slots).toHaveLength(6);
    expect(slots.map((slot) => Number(slot.dataset['slot'])).sort((a, b) => a - b)).toEqual(
      [...cards].sort((a, b) => a - b),
    );
    for (const slot of slots) {
      outside(chatRect, hit(slot));
      slot.focus();
      expect(document.activeElement).toBe(slot);
    }
    await screen.getByRole('button', { name: '대전 대화', exact: true }).click();
    await screen.getByRole('button', { name: '닫기', exact: true }).click();
    hit(menu);
    hit(trigger);
    // 고정 5열에 Enter를 눌러 원 Hand→Game.submit 경로의 합법 입력 한 번을 확인한다.
    const selected = slots.find((slot) => Number(slot.dataset['slot']) === c('5열'))!;
    selected.focus();
    await userEvent.keyboard('{Enter}');
    await vi.waitFor(() => expect(f.sent).toEqual([{ type: 'play', seat: 0, card: c('5열') }]));
  } finally {
    await screen.unmount();
    f.dispose();
  }
});

test('R3 Game visualViewport 높이/offset 변경: 입력 focus 보존·native dialog 안 닫기/전송 도달', async () => {
  await page.viewport(393, 852);
  const viewport = Object.assign(new EventTarget(), { height: 360, offsetTop: 72 });
  vi.stubGlobal('visualViewport', viewport);
  const f = fixture(one('5열', true));
  const screen = await render(Game, { controller: f.controller });
  try {
    await screen.getByRole('button', { name: '대전 대화', exact: true }).click();
    const input = screen.getByRole('textbox', { name: '보낼 문장' });
    await input.fill('한');
    input.element().focus();
    viewport.height = 300;
    viewport.offsetTop = 100;
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    await tick();
    expect(document.activeElement).toBe(input.element());
    const dialog = socialDialog(screen.container);
    const bounds = dialog.getBoundingClientRect();
    expect(bounds.top).toBeGreaterThanOrEqual(viewport.offsetTop);
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.offsetTop + viewport.height);
    for (const name of ['전송', '닫기']) {
      const button = screen.getByRole('button', { name, exact: true }).element() as HTMLElement;
      button.focus();
      button.scrollIntoView({ block: 'nearest' });
      const r = hit(button);
      expect(document.activeElement).toBe(button);
      expect(r.top).toBeGreaterThanOrEqual(viewport.offsetTop);
      expect(r.bottom).toBeLessThanOrEqual(viewport.offsetTop + viewport.height);
    }
    expect(f.sent).toEqual([]);
    expect(f.social.send).not.toHaveBeenCalled();
  } finally {
    await screen.unmount();
    f.dispose();
    vi.unstubAllGlobals();
  }
});
