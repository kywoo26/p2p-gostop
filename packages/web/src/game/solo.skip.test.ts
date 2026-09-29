// UX-16: 재생 큐가 빈 뒤 AI가 생각하는 동안에도 탭 스킵은 표시용 간격을 없앤다.
import { PRESETS } from '@p2p-gostop/engine';
import { expect, test } from 'vitest';
import { playRandom } from '../ui/random-play.test-helper.ts';
import type { AiClient } from './ai-client.ts';
import { actingSeats } from './session.ts';
import { SoloSession } from './solo.svelte.ts';

test('AI 생각 중 탭 스킵 뒤 200ms 안에 결정 결과를 재생 큐로 넘긴다', async () => {
  const state = [...playRandom(17, PRESETS.standard, 1)].find(
    (s) =>
      s.phase === 'playing' && actingSeats(s.game).includes(1) && !actingSeats(s.game).includes(0),
  );
  expect(state).toBeDefined();
  if (state === undefined) return;
  const ai: AiClient = {
    mode: 'inline',
    async decide(request) {
      const action = request.view.legal[0];
      if (action === undefined) throw new Error('CPU 합법 수 없음');
      return { action, ms: 1 };
    },
    dispose() {},
  };
  const root = document.createElement('div');
  document.body.append(root);
  const previousSpeed = document.documentElement.dataset['speed'];
  document.documentElement.dataset['speed'] = 'normal';
  const solo = new SoloSession(state, {
    difficulty: 'easy',
    timeBudgetMs: 100,
    ai,
    persist: false,
  });
  try {
    solo.attach(root);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(solo.thinking).toBe(true);
    const start = performance.now();
    solo.skipAnimations();
    while (solo.thinking && performance.now() - start < 250) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(solo.thinking).toBe(false);
    expect(performance.now() - start).toBeLessThan(200);
    // CPU 이벤트가 재생 중이면 마저 건너뛰어 테스트가 타이머를 남기지 않는다.
    solo.skipAnimations();
  } finally {
    solo.dispose();
    root.remove();
    if (previousSpeed === undefined) delete document.documentElement.dataset['speed'];
    else document.documentElement.dataset['speed'] = previousSpeed;
  }
});
