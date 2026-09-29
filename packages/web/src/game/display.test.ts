// 이벤트 재생 리듀서와 세션 모델 검사 (spec 6.4 "재생 후 최신 뷰로 보정", MN-01 제로섬, MN-02 재충전).
// 무작위 합법 수로 여러 판을 두면서, 액션마다 "이전 뷰 + (가려진) 이벤트 재생"이 "새 뷰"와 카드 배치가 같은지 본다.
// 같으면 애니메이션 중간 모습이 스냅 때 튀지 않는다(스냅은 이벤트 누락에 대한 안전망일 뿐).
// 화면 숫자(점수, 획득패 칸 숫자, 족보 진행도, 국진 위치)도 액션마다 엔진 ScoreBreakdown과 비교한다(M3 리뷰 S-2·I-6).
import {
  GUKJIN_ID,
  legalActions,
  playerView,
  PRESETS,
  redactEvent,
  scoreCaptured,
  type Action,
  type ScoreBreakdown,
  type Seat,
} from '@p2p-gostop/engine';
import { describe, expect, test } from 'vitest';
import { planSteps } from '../anim/choreo.ts';
import { seatStats } from '../ui/seat-stats.ts';
import { inFlightOf, toBoardView, toSettlementView } from './adapter.ts';
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

function counts(b: ScoreBreakdown) {
  return {
    gwang: b.gwangCount,
    yeol: b.yeolCount,
    tti: b.ttiCount,
    pi: b.piCount,
    gukjinAsPi: b.gukjinAsPi,
  };
}

/** 화면 좌석의 숫자 (획득패 칸·진행도가 쓰는 값) */
function shown(board: DisplayBoard, seat: Seat) {
  const stats = seatStats(board.seats[seat]);
  const [gwang, yeol, tti, pi] = stats.piles;
  return {
    counts: {
      gwang: gwang.value,
      yeol: yeol.value,
      tti: tti.value,
      pi: pi.value,
      gukjinAsPi: stats.gukjinAsPi,
    },
    stats,
  };
}

/**
 * 화면 숫자 = 엔진 숫자. 턴 경계(ctx 없음)에서는 엔진 좌석 score 그대로, 턴 도중(대상·국진 프롬프트 대기)에는
 * 엔진이 점수를 아직 다시 계산하지 않았으므로 지금 획득 패를 같은 국진 위치로 센 값과 같아야 한다.
 */
function expectNumbers(session: SessionState, board: DisplayBoard) {
  const game = session.game;
  for (const seat of [0, 1] as const) {
    const engine = game.seats[seat];
    const expected =
      game.ctx === null ? engine.score : scoreCaptured(engine.captured, engine.score.gukjinAsPi);
    const { counts: shownCounts, stats } = shown(board, seat);
    const where = `판 ${session.roundNumber} 좌석 ${seat}`;
    expect(shownCounts, where).toEqual(counts(expected));
    expect(board.seats[seat].score, where).toBe(engine.score.total);
    expect(stats.progress.pi, where).toBe(expected.piCount);
    expect(stats.progress.gwang, where).toBe(expected.gwangCount);
    // 칸 안의 카드와 칸 숫자가 맞다: 광·열끗·띠는 장수, 피는 가치 합(국진쌍피 포함)
    const [gwang, yeol, tti, pi] = stats.piles;
    for (const pile of [gwang, yeol, tti]) expect(pile.value, where).toBe(pile.cards.length);
    expect(pi.value, where).toBe(
      pi.cards.reduce((n, id) => n + (id === GUKJIN_ID ? 2 : piOf(id)), 0),
    );
    expect(pi.cards.includes(GUKJIN_ID), where).toBe(expected.gukjinAsPi);
    expect(yeol.cards.includes(GUKJIN_ID), where).toBe(
      engine.captured.yeol.includes(GUKJIN_ID) && !expected.gukjinAsPi,
    );
  }
}

function piOf(id: number): number {
  return scoreCaptured({ gwang: [], yeol: [], tti: [], pi: [id] }, false).piCount;
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
  let gukjinAsPiStates = 0;
  let checkedSettlements = 0;
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
    const roundsBefore = session.records.length;
    session = step.session;
    const after = boardOf(session);
    expectNumbers(session, after);
    if (after.seats.some((s) => s.gukjinAsPi)) gukjinAsPiStates += 1;
    if (session.records.length > roundsBefore) {
      expectSettlement(session);
      checkedSettlements += 1;
    }
    const events = step.events.map((e) => redactEvent(e, VIEWER));
    if (isDealBatch(events)) continue;
    const replayed = events.reduce(applyEvent, before);
    expect(layout(replayed)).toEqual(layout(after));
    if (session.game.ctx === null) {
      // 재생이 끝난 모습의 숫자도 스냅과 같다 (스냅 때 숫자가 튀지 않는다)
      for (const seat of [0, 1] as const) {
        expect(shown(replayed, seat).counts).toEqual(shown(after, seat).counts);
      }
    }
    // 애니메이션 단계로 나눠도 이벤트가 빠지거나 겹치지 않는다
    expect(planSteps(events).flatMap((s) => s.events)).toEqual(events);
    checkedBatches += 1;
    expect(ledgerIsBalanced(session)).toBe(true);
  }
  return { session, checkedBatches, gukjinAsPiStates, checkedSettlements };
}

/** 정산 화면: 점수 분해 합 = 기본 점수, 국진 위치 = 정산에 쓴 위치 (FR-18, rules S5 해석 29) */
function expectSettlement(session: SessionState) {
  const record = session.records.at(-1);
  if (record === undefined) throw new Error('기록 없음');
  const view = toSettlementView({
    settlement: record.settlement,
    captured: record.captured,
    names: ['나', '상대'],
    unit: '냥',
    perPoint: 100,
    amount: record.amount,
    before: record.before,
    after: record.after,
  });
  const s = record.settlement;
  if (s.winner !== null && (s.reason === 'stop' || s.reason === 'autoStop')) {
    const base = s.steps.find((step) => step.kind === 'base');
    if (s.pushed) {
      expect(base).toBeUndefined();
      expect(view.breakdown.reduce((n, row) => n + row.points, 0)).toBeGreaterThan(0);
    } else expect(view.breakdown.reduce((n, row) => n + row.points, 0)).toBe(base?.value);
  }
  const holders = ([0, 1] as const).filter((seat) =>
    record.captured[seat].yeol.includes(GUKJIN_ID),
  );
  expect(view.gukjin).toEqual(holders.map((seat) => ({ seat, asPi: s.gukjinAsPi[seat] })));
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

describe('화면 숫자 = 엔진 ScoreBreakdown (M3 리뷰 S-2, 국진 S5)', () => {
  // 국진 자동(기본)과 묻기 모드에서 액션마다 획득패 칸 숫자·진행도·점수·국진 위치를 비교한다(playChecked 안).
  // 국진을 쌍피로 세는 상태가 실제로 나와야 검사가 의미 있다.
  test.each([
    ['auto', 31],
    ['auto', 32],
    ['ask', 33],
    ['ask', 34],
  ] as const)('국진 %s 시드 %i: 20판', (gukjin, seed) => {
    const rules = { ...PRESETS.standard, gukjin };
    const { session, gukjinAsPiStates, checkedSettlements } = playChecked(seed, 20, rules);
    expect(session.records).toHaveLength(20);
    expect(checkedSettlements).toBe(20);
    expect(gukjinAsPiStates).toBeGreaterThan(0);
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
