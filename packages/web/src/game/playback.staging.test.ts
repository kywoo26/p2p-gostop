// UX-15~17·NF-03: 실제 보너스 staging 재생 중 snapshot reset의 수명을 확인한다.
import { playerView } from '@p2p-gostop/engine';
import { tick } from 'svelte';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { handBonusLandingSave } from '../../e2e/landing-fixtures.ts';
import Game from '../routes/Game.svelte';
import { toBoardView } from './adapter.ts';
import { snap } from './display.ts';
import { SoloSession } from './solo.svelte.ts';

test('새 보너스 staging ghost 중 reset은 원본을 복원하고 수락된 snapshot으로 수렴한다', async () => {
  await page.viewport(393, 659);
  const prior = document.documentElement.dataset['speed'];
  document.documentElement.dataset['speed'] = 'normal';
  const solo = new SoloSession(handBonusLandingSave().save.session, {
    difficulty: 'easy',
    timeBudgetMs: 100,
    persist: false,
    ai: {
      mode: 'inline',
      async decide() {
        throw new Error('CPU 입력 없음');
      },
      dispose() {},
    },
  });
  const screen = await render(Game, { controller: solo });
  try {
    await vi.waitFor(() => expect(solo.canAct).toBe(true));
    expect(solo.submit({ type: 'play', seat: 0, card: 49 })).toBe(true);
    await vi.waitFor(() =>
      expect(screen.container.querySelector('.staging [data-card-id="49"]')).not.toBeNull(),
    );
    const native = screen.container.querySelector<HTMLElement>('.staging [data-card-id="49"]')!;
    expect(native.style.visibility).toBe('hidden');
    expect(screen.container.querySelector('[data-motion-card-id="49"]')).not.toBeNull();
    const authority = solo.state;
    const snapshot = toBoardView(playerView(authority.game, 0, { ledger: authority.ledger }), {
      names: ['좌석0', '좌석1'],
      balances: authority.ledger.balances,
    });
    solo.playback.reset(snapshot);
    await tick();
    await vi.waitFor(() => expect(solo.playback.busy).toBe(false));
    expect(solo.state).toBe(authority);
    expect(solo.playback.board).toEqual(snap(snapshot));
    expect(solo.playback.pending).toBe(0);
    expect(native.style.visibility).toBe('');
    expect(native.getAnimations({ subtree: true })).toHaveLength(0);
    expect(screen.container.querySelector('[data-landing-scene]')).toBeNull();
    expect(screen.container.querySelector('[data-contact-light]')).toBeNull();
    expect(
      [...screen.container.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
        (el) => el.style.visibility === 'hidden',
      ),
    ).toHaveLength(0);
    expect(
      screen.container.querySelector('.captured-zone.mine [data-card-id="49"]'),
    ).not.toBeNull();
  } finally {
    solo.dispose();
    if (prior === undefined) delete document.documentElement.dataset['speed'];
    else document.documentElement.dataset['speed'] = prior;
  }
});
