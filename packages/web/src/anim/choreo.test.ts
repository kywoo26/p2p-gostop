// 안무 계획 시간 (spec 6.4·AC-06 "탭부터 턴 종료까지 ≤ 700ms", 이슈 #20).
// 턴 재생 계획은 단계별 spec 시간(손패→바닥 120, 뒤집기 140, 매칭 80, 획득 160 + 30×(n−1), 뺏기 200)의 합이고,
// 합이 TURN_PLAN_MS(500ms, 빠름)를 넘으면 모든 단계를 같은 비율로 줄인다. 남는 200ms는 단계 사이 커밋·프레임 몫이다
// (실측은 e2e/solo.spec.ts @timing이 단언한다).
import { PRESETS, redactEvent, type EngineEvent, type RuleOptions } from '@p2p-gostop/engine';
import { describe, expect, test } from 'vitest';
import { isDealBatch } from '../game/display.ts';
import { sessionAct, type SessionState } from '../game/session.ts';
import { playRandom, VIEWER } from '../ui/random-play.test-helper.ts';
import { planTurn, TURN_PLAN_MS } from './choreo.ts';
import { DUR } from './durations.ts';

/** 무작위 판을 두며 액션마다 그 액션이 낸 (보는 좌석 기준) 이벤트 묶음을 모은다 */
function batches(seed: number, rules: RuleOptions, rounds: number): EngineEvent[][] {
  const out: EngineEvent[][] = [];
  let previous: SessionState | null = null;
  for (const session of playRandom(seed, rules, rounds)) {
    const action = session.actions.at(-1);
    if (
      previous !== null &&
      previous.phase === 'playing' &&
      action !== undefined &&
      session.roundNumber === previous.roundNumber
    ) {
      // playRandom이 둔 액션을 다시 두어 이벤트를 얻는다 (세션 모델은 순수 함수)
      const step = sessionAct(previous, action);
      if (step.ok) out.push(step.events.map((e) => redactEvent(e, VIEWER)));
    }
    previous = session;
  }
  return out.filter((events) => !isDealBatch(events));
}

let seq = 0;
function ev<T extends EngineEvent['type']>(
  type: T,
  fields: Omit<Extract<EngineEvent, { type: T }>, 'type' | 'seq'>,
): EngineEvent {
  seq += 1;
  return { type, seq, ...fields } as EngineEvent;
}

describe('턴 애니메이션 계획 (빠름, AC-06)', () => {
  test('예산을 넘는 턴(낸 패 매칭 + 뒤집기 매칭 + 6장 획득 + 피 뺏기)은 같은 비율로 줄여 500ms 안에 든다', () => {
    const events = [
      ev('CardPlayed', { seat: 0, cards: [0], bonus: false }),
      ev('Matched', { seat: 0, cards: [0, 1], source: 'play', target: 1 }),
      ev('CardFlipped', { seat: 0, cards: [4] }),
      ev('Matched', { seat: 0, cards: [4, 5], source: 'flip', target: 5 }),
      ev('Captured', { seat: 0, cards: [0, 1, 4, 5, 6, 7], to: 0 }),
      ev('PiStolen', { seat: 0, cards: [11], from: 1, to: 0, reason: 'sseul' }),
      ev('ScoreChanged', { seat: 0, cards: [], breakdown: {} as never }),
    ];
    const plan = planTurn(events);
    // 단계: 내기 120 / 매칭 80 / 뒤집기 140 / 매칭 80 / 획득 6장 160 + 150 = 310 (뺏기 200과 동시)
    expect(plan.steps.map((s) => s.kind)).toEqual(['play', 'match', 'flip', 'match', 'collect']);
    const raw = [DUR.handToFloor, DUR.matchHighlight, DUR.flip, DUR.matchHighlight, 310];
    expect(plan.rawMs).toBe(raw.reduce((a, b) => a + b, 0));
    // 줄이지 않으면 예산을 넘는다
    expect(plan.rawMs).toBeGreaterThan(TURN_PLAN_MS);
    const factor = TURN_PLAN_MS / plan.rawMs;
    expect(plan.factor).toBeCloseTo(factor, 10);
    // 단계마다 같은 비율로 줄고, 합이 예산과 같다
    plan.stepMs.forEach((ms, i) => expect(ms).toBeCloseTo((raw[i] ?? 0) * factor, 10));
    expect(plan.stepMs.reduce((a, b) => a + b, 0)).toBeCloseTo(TURN_PLAN_MS, 10);
  });

  test('예산 안의 턴은 줄이지 않는다 (낸 패·뒤집은 패 모두 바닥에 놓임)', () => {
    const plan = planTurn([
      ev('CardPlayed', { seat: 0, cards: [0], bonus: false }),
      ev('Placed', { seat: 0, cards: [0], source: 'play' }),
      ev('CardFlipped', { seat: 0, cards: [9] }),
      ev('Placed', { seat: 0, cards: [9], source: 'flip' }),
    ]);
    expect(plan.factor).toBe(1);
    expect(plan.stepMs).toEqual([
      DUR.handToFloor,
      DUR.matchHighlight,
      DUR.flip,
      DUR.matchHighlight,
    ]);
    expect(plan.plannedMs).toBe(plan.rawMs);
  });

  test.each([
    ['표준', 61, PRESETS.standard],
    ['아케이드·2장 폭탄', 62, { ...PRESETS.arcade, twoCardBomb: 'double' as const }],
  ])('%s 시드 %i: 실제 판의 모든 묶음', (_, seed, rules) => {
    const list = batches(seed, rules, 15);
    expect(list.length).toBeGreaterThan(200);
    let compressed = 0;
    let minFactor = 1;
    for (const events of list) {
      const plan = planTurn(events);
      // 이벤트가 단계에서 빠지거나 겹치지 않는다
      expect(plan.steps.flatMap((s) => s.events)).toEqual(events);
      expect(plan.stepMs.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(TURN_PLAN_MS + 1e-9);
      if (plan.rawMs > TURN_PLAN_MS) compressed += 1;
      minFactor = Math.min(minFactor, plan.factor);
    }
    // 여러 장을 먹는 턴은 예산을 넘어 실제로 줄어든다 (압축 경로가 실행된다)
    expect(compressed).toBeGreaterThan(0);
    // 줄여도 각 애니메이션은 spec 시간의 60% 이상을 지킨다(더 줄면 이동을 눈으로 따라가기 어렵다).
    // 단계가 늘어나 예산을 크게 넘는 회귀를 잡는다.
    expect(minFactor).toBeGreaterThanOrEqual(0.6);
  });

  test('계획 상한 + 프레임 몫이 spec 6.4 턴 예산 안이다', () => {
    expect(TURN_PLAN_MS).toBeLessThan(DUR.turnBudget);
    expect(DUR.turnBudget - TURN_PLAN_MS).toBeGreaterThanOrEqual(150);
  });
});
