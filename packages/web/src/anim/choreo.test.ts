// 안무 계획 시간 (spec 6.4·AC-06 "탭부터 턴 종료까지 ≤ 700ms", 이슈 #20).
// 무작위 판의 모든 이벤트 묶음(분배 제외)에서 재생 계획 시간이 턴 예산 상수(TURN_PLAN_MS = 500ms, 빠름 기준) 이하인지 본다.
// 남는 200ms는 단계 사이의 커밋·프레임 지연 몫이다(실측은 e2e/solo.spec.ts의 빠름 판이 단언한다).
import { PRESETS, redactEvent, type RuleOptions } from '@p2p-gostop/engine';
import { describe, expect, test } from 'vitest';
import { isDealBatch } from '../game/display.ts';
import { actingSeats, sessionAct, type SessionState } from '../game/session.ts';
import { playRandom, VIEWER } from '../ui/random-play.test-helper.ts';
import { planTurn, TURN_PLAN_MS } from './choreo.ts';
import { DUR } from './durations.ts';

/** 무작위 판을 두며 액션마다 (직전 세션, 그 액션이 낸 이벤트) 묶음을 모은다 */
function batches(seed: number, rules: RuleOptions, rounds: number) {
  const out: { events: ReturnType<typeof redactEvent>[]; promptAfter: boolean }[] = [];
  let previous: SessionState | null = null;
  for (const session of playRandom(seed, rules, rounds)) {
    if (previous !== null && previous.phase === 'playing' && session.game !== previous.game) {
      // playRandom이 둔 액션을 다시 두어 이벤트를 얻는다 (세션 모델은 순수 함수)
      const action = session.actions.at(-1);
      if (action !== undefined && session.roundNumber === previous.roundNumber) {
        const step = sessionAct(previous, action);
        if (step.ok) {
          const pending = step.session.game.pending;
          out.push({
            events: step.events.map((e) => redactEvent(e, VIEWER)),
            promptAfter:
              pending !== null &&
              pending.kind !== 'play' &&
              actingSeats(step.session.game).includes(VIEWER),
          });
        }
      }
    }
    previous = session;
  }
  return out;
}

describe('턴 애니메이션 계획 ≤ 500ms (빠름, AC-06)', () => {
  test.each([
    ['표준', 61, PRESETS.standard],
    ['아케이드·2장 폭탄', 62, { ...PRESETS.arcade, twoCardBomb: 'double' as const }],
  ])('%s 시드 %i: 모든 묶음', (_, seed, rules) => {
    const list = batches(seed, rules, 15).filter((b) => !isDealBatch(b.events));
    expect(list.length).toBeGreaterThan(200);
    let compressed = 0;
    let withoutPrompt = 0;
    for (const { events, promptAfter } of list) {
      const plan = planTurn(events);
      expect(plan.plannedMs).toBeLessThanOrEqual(TURN_PLAN_MS + 1e-9);
      expect(plan.factor).toBeLessThanOrEqual(1);
      // 줄이기는 전체를 같은 비율로: 예산 안이면 그대로
      if (plan.rawMs <= TURN_PLAN_MS) expect(plan.plannedMs).toBe(plan.rawMs);
      else compressed += 1;
      if (!promptAfter) withoutPrompt += 1;
    }
    expect(withoutPrompt).toBeGreaterThan(100);
    // 여러 장을 먹는 턴은 예산을 넘어 실제로 줄어든다 (압축 경로가 실행된다)
    expect(compressed).toBeGreaterThan(0);
  });

  test('계획 상한 + 프레임 몫이 spec 6.4 턴 예산 안이다', () => {
    expect(TURN_PLAN_MS).toBeLessThan(DUR.turnBudget);
    expect(DUR.turnBudget - TURN_PLAN_MS).toBeGreaterThanOrEqual(150);
  });
});
