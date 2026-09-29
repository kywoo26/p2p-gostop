// U14: 판 정보 대화상자 열람·복귀는 모든 모드에서 같은 자동 진행 보류 조건을 쓴다.
import { cardId, playerView, type Action } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import type { BoardView } from '@p2p-gostop/protocol';
import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { toBoardView } from '../game/adapter.ts';
import {
  AutoChoice,
  automaticAction,
  type GameController,
  type GameMode,
} from '../game/controller.ts';
import { Playback } from '../game/playback.svelte.ts';
import Game from './Game.svelte';

function board(card: '5열' | '6열'): BoardView {
  const state = createScenario({
    hands: [[cardId(card)], [cardId('10열')]],
    floor: [cardId('8광')],
  });
  return toBoardView(playerView(state, 0), { names: ['나', '상대'], balances: [1000, 1000] });
}

test.each(['solo', 'host', 'guest'] as const)(
  'U14 %s: 판 정보 열람 중 보류하고 닫으면 최신 권위 뷰를 한 번만 실행',
  async (mode: GameMode) => {
    const playback = new Playback(board('5열'), { viewer: 0, names: () => ['나', '상대'] });
    playback.busy = true;
    const sent: Action[] = [];
    let held = true;
    const choice = new AutoChoice(
      () => ({ view: playback.board, ready: !held }),
      (action) => {
        sent.push(action);
        return true;
      },
    );
    const controller: GameController = {
      mode,
      playback,
      canAct: true,
      thinking: false,
      bankrupt: false,
      notice: null,
      pushDecision: null,
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
    const screen = await render(Game, { controller });
    const root = screen.getByTestId('board').element();
    // #104 통합 후 실제 버튼/대화상자로 자동 진행 보류 연결을 검사한다.
    const dialog = root.querySelector<HTMLDialogElement>('dialog[aria-label="판 정보"]')!;
    await userEvent.click(screen.getByTestId('game-menu'));
    await userEvent.click(screen.getByRole('button', { name: '판 정보 · 족보 진행' }));
    await vi.waitFor(() =>
      expect(screen.container.firstElementChild?.getAttribute('data-auto-held')).toBe('true'),
    );

    // 열린 동안 새 권위 뷰가 와도 예약한 이전 수와 새 수 모두 보류한다.
    playback.reset(board('6열'));
    playback.busy = false;
    expect(automaticAction(playback.board)).toEqual({ type: 'play', seat: 0, card: cardId('6열') });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toEqual([]);

    dialog.close();
    await vi.waitFor(() =>
      expect(screen.container.firstElementChild?.getAttribute('data-auto-held')).toBe('false'),
    );
    await vi.waitFor(() => expect(held).toBe(false));
    await vi.waitFor(() => expect(sent).toEqual([{ type: 'play', seat: 0, card: cardId('6열') }]));
    dialog.showModal();
    dialog.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toHaveLength(1);
    choice.dispose();
    playback.dispose();
  },
);
