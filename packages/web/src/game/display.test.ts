// 이벤트 재생 리듀서와 세션 모델 검사 (spec 6.4 "재생 후 최신 뷰로 보정", MN-01 제로섬, MN-02 재충전).
// 무작위 합법 수로 여러 판을 두면서, 액션마다 "이전 뷰 + (가려진) 이벤트 재생"이 "새 뷰"와 카드 배치가 같은지 본다.
// 같으면 애니메이션 중간 모습이 스냅 때 튀지 않는다(스냅은 이벤트 누락에 대한 안전망일 뿐).
import {
  legalActions,
  playerView,
  PRESETS,
  redactEvent,
  type Action,
  type Seat,
} from '@p2p-gostop/engine';
import { describe, expect, test } from 'vitest';
import { planSteps } from '../anim/choreo.ts';
import { inFlightOf, toBoardView } from './adapter.ts';
import { applyEvent, isDealBatch, snap, type DisplayBoard } from './display.ts';
import {
  actingSeats,
  createSession,
  ledgerIsBalanced,
  refill,
  sessionAct,
  startNextRound,
  type SessionConfig,
  type SessionState,
} from './session.ts';

function lcg(seed: number) {
  let x = seed >>> 0;
  return (n: number) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x % n;
  };
}

const VIEWER: Seat = 0;

function boardOf(session: SessionState): DisplayBoard {
  const view = playerView(session.game, VIEWER, { ledger: session.ledger });
  const board = toBoardView(view, { names: ['나', '상대'], balances: session.ledger.balances });
  return snap(board, inFlightOf(view));
}

/** 카드 배치만 비교 (점수·배수·프롬프트는 스냅이 맞춘다) */
function layout(b: DisplayBoard) {
  return {
    hands: b.seats.map((s) => ({ hand: s.hand, count: s.handCount })),
    captured: b.seats.map((s) => s.captured),
    floor: b.floor.map((g) => ({ month: g.month, cards: g.cards, kind: g.kind, owner: g.owner })),
    deck: b.deckCount,
    staging: b.staging,
  };
}

function config(seed: number, overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    preset: 'standard',
    rules: PRESETS.standard,
    perPoint: 100,
    startBalance: 5000,
    names: ['나', '상대'],
    seed,
    ...overrides,
  };
}

/** 한 세션을 rounds판 무작위로 두며 매 액션 뒤 재생 결과를 검사한다 */
function playChecked(seed: number, rounds: number, rules = PRESETS.standard) {
  const pick = lcg(seed);
  let session = createSession(config(seed, { rules, startBalance: 3000 })).session;
  let checkedBatches = 0;
  for (let guard = 0; guard < 5000 && session.records.length < rounds; guard++) {
    if (session.phase === 'bankrupt') {
      session = refill(session);
      expect(session.phase).toBe('roundOver');
      continue;
    }
    if (session.phase === 'roundOver') {
      session = startNextRound(session).session;
      continue;
    }
    const seat = actingSeats(session.game)[0];
    if (seat === undefined) throw new Error('입력할 좌석이 없습니다');
    const legal: Action[] = legalActions(session.game, seat);
    const action = legal[pick(legal.length)];
    if (action === undefined) throw new Error('합법 수가 없습니다');
    const before = boardOf(session);
    const step = sessionAct(session, action);
    if (!step.ok) throw new Error(step.message);
    session = step.session;
    const events = step.events.map((e) => redactEvent(e, VIEWER));
    if (isDealBatch(events)) continue;
    const replayed = events.reduce(applyEvent, before);
    expect(layout(replayed)).toEqual(layout(boardOf(session)));
    // 애니메이션 단계로 나눠도 이벤트가 빠지거나 겹치지 않는다
    expect(planSteps(events).flatMap((s) => s.events)).toEqual(events);
    checkedBatches += 1;
    expect(ledgerIsBalanced(session)).toBe(true);
  }
  return { session, checkedBatches };
}

describe('이벤트 재생 = 최신 뷰 (spec 6.4)', () => {
  test.each([1, 2, 3, 4, 5, 6])('표준 규칙 시드 %i: 10판', (seed) => {
    const { session, checkedBatches } = playChecked(seed, 10);
    expect(session.records).toHaveLength(10);
    expect(checkedBatches).toBeGreaterThan(100);
  });

  test.each([11, 12])('아케이드·국진 묻기·2장 폭탄 시드 %i: 10판', (seed) => {
    const rules = { ...PRESETS.arcade, gukjin: 'ask' as const, twoCardBomb: 'double' as const };
    const { session } = playChecked(seed, 10, rules);
    expect(session.records).toHaveLength(10);
  });
});

describe('세션 모델 (MN-01·MN-02, R5·G9)', () => {
  test('다음 판 선은 직전 승자, 나가리면 배수 이월', () => {
    const { session } = playChecked(21, 12);
    for (const [i, record] of session.records.entries()) {
      const next = session.records[i + 1];
      if (next === undefined) break;
      expect(next.round).toBe(record.round + 1);
      if (record.winner === null) expect(record.settlement.nextCarry).toBeGreaterThan(1);
    }
  });

  test('재충전은 잔액 0인 좌석만 시작 잔액으로 되돌리고 기록은 유지한다', () => {
    let session = createSession(config(7, { startBalance: 100 })).session;
    const pick = lcg(7);
    for (let guard = 0; guard < 3000 && session.phase !== 'bankrupt'; guard++) {
      if (session.phase === 'roundOver') {
        session = startNextRound(session).session;
        continue;
      }
      const seat = actingSeats(session.game)[0] ?? 0;
      const legal = legalActions(session.game, seat);
      const step = sessionAct(session, legal[pick(legal.length)] ?? legal[0]!);
      if (step.ok) session = step.session;
    }
    expect(session.phase).toBe('bankrupt');
    const records = session.records.length;
    const refilled = refill(session);
    expect(refilled.records).toHaveLength(records);
    expect(refilled.ledger.balances.every((b) => b > 0)).toBe(true);
    expect(ledgerIsBalanced(refilled)).toBe(true);
    expect(sessionAct(refilled, { type: 'stop', seat: 0 }).ok).toBe(false);
  });
});
