// #12: BoardView는 M3 솔로 어댑터(BoardView + BoardExtras + InFlight)의 상위 집합이고, 보는 좌석 기준으로 계산한다.
import { describe, expect, it } from 'vitest';
import { assert, nat, property } from 'fast-check';
import {
  PRESETS,
  createLedger,
  legalActions,
  newRound,
  playerView,
  reduce,
  type CardId,
  type GameState,
  type Seat,
} from '@p2p-gostop/engine';
import { inFlightOf, toBoardExtras, toBoardView, type BoardView } from '../src/index.ts';
import { Picker } from './helpers.ts';
import followupVectors from './vectors/view-followups.json';

const ledger = createLedger(100, 50_000);
const board = (state: GameState, viewer: Seat): BoardView =>
  toBoardView(playerView(state, viewer, { ledger }), { names: ['가', '나'], ledger });

/** M3 currentMultiplier를 규칙 문서대로 따로 계산 (보는 좌석, 대박판 포함) */
function expectedMultiplier(state: GameState, viewer: Seat): number {
  const seat = state.seats[viewer];
  let m = 2 ** (seat.shakes + seat.bombs);
  if (seat.goCount >= 3) m *= 2 ** (seat.goCount - 2);
  m *= state.round.carry * 2 ** state.round.pushes;
  const jackpot = state.rules.jackpotRound;
  if (jackpot !== null && jackpot.every > 0 && state.round.number % jackpot.every === 0)
    m *= jackpot.multiplier;
  return m;
}

/** 보드에 드러난 카드 ID 전부 */
function visibleIds(view: BoardView): Set<CardId> {
  const ids = new Set<CardId>();
  const add = (list: readonly CardId[] | null) => list?.forEach((id) => ids.add(id));
  for (const g of view.floor) add(g.cards);
  for (const s of view.seats) {
    add(s.hand);
    add(s.revealed ?? []);
    add([...s.captured.gwang, ...s.captured.yeol, ...s.captured.tti, ...s.captured.pi]);
  }
  add(view.playable);
  add(view.inFlight.staged);
  if (view.inFlight.played !== null) ids.add(view.inFlight.played);
  for (const a of view.legal) if ('card' in a) ids.add(a.card);
  if (view.pending?.kind === 'target') add([view.pending.card, ...view.pending.options]);
  if (view.pending?.kind === 'shake') ids.add(view.pending.card);
  return ids;
}

function walk(seed: number, visit: (state: GameState) => void): void {
  const picker = new Picker(seed);
  const rules = [PRESETS.standard, PRESETS.traditional, PRESETS.arcade][seed % 3]!;
  let state = newRound(rules, seed, { roundNumber: 1 + (seed % 6) }).state;
  visit(state);
  for (let i = 0; i < 300 && state.phase !== 'end'; i++) {
    const action = picker.pick([...legalActions(state, 0), ...legalActions(state, 1)])!;
    const result = reduce(state, action);
    if (!result.ok) throw new Error(result.message);
    state = result.state;
    visit(state);
  }
}

describe('#12 BoardView 상세 필드 (M3 어댑터의 상위 집합)', () => {
  it.each(followupVectors)('$id: $description', ({ seed, viewer, pushes, multiplier }) => {
    const state = newRound({ ...PRESETS.standard, push: true }, seed, { dealer: 0, pushes }).state;
    const view = board(state, viewer === 0 ? 0 : 1);
    expect(view.pushes).toBe(pushes);
    expect(view.multiplier).toBe(multiplier);
    expect(view.seats[1 - viewer]!.hand).toBeNull();
    for (const seat of [0, 1] as const) {
      expect(view.seats[seat].bombs).toBe(0);
      expect(view.seats[seat].revealed).toEqual([]);
      expect(view.seats[seat].gukjinAsPi).toBe(state.seats[seat].score.gukjinAsPi);
    }
  });
  it('fast-check: 모든 상태·양 좌석에서 legal·firstPick·폭탄·뒤집기·고스톱·배수·inFlight가 엔진과 일치하고 숨은 카드가 없다', () => {
    const counts = { pickFirst: 0, goStop: 0, target: 0, bomb: 0, flipOnly: 0, revealed: 0 };
    assert(
      property(nat({ max: 100_000 }), (seed) => {
        walk(seed, (state) => {
          for (const viewer of [0, 1] as const) {
            const view = board(state, viewer);
            const pv = playerView(state, viewer, { ledger });
            const legal = legalActions(state, viewer);
            expect(view.legal).toEqual(legal);
            expect(view.playable).toEqual([
              ...new Set(legal.flatMap((a) => (a.type === 'play' ? [a.card] : []))),
            ]);
            expect(view.phase).toBe(state.phase);
            expect(view.dealer).toBe(state.dealer);
            expect(view.pushes).toBe(state.round.pushes);
            for (const seat of [0, 1] as const) {
              expect(view.seats[seat].gukjinAsPi).toBe(pv.seats[seat].score.gukjinAsPi);
              expect(view.seats[seat].bombs).toBe(pv.seats[seat].bombs);
              expect(view.seats[seat].revealed).toEqual(pv.seats[seat].revealed);
              if ((view.seats[seat].revealed?.length ?? 0) > 0) counts.revealed++;
              expect(
                (view.seats[seat].revealed ?? []).every((id) =>
                  state.seats[seat].hand.includes(id),
                ),
              ).toBe(true);
            }
            const other: Seat = viewer === 0 ? 1 : 0;
            const picking = legal.some((a) => a.type === 'pickFirst');
            if (picking) counts.pickFirst++;
            expect(view.firstPick).toEqual(
              picking
                ? { poolSize: state.firstPick!.pool.length, taken: state.firstPick!.picks[other] }
                : null,
            );
            expect(view.bombMonths).toEqual(
              legal.flatMap((a) => (a.type === 'bomb' ? [a.month] : [])),
            );
            if (view.bombMonths.length > 0) counts.bomb++;
            expect(view.canFlipOnly).toBe(legal.some((a) => a.type === 'flipOnly'));
            if (view.canFlipOnly) counts.flipOnly++;
            const preview = pv.stopPreview;
            if (preview !== null) counts.goStop++;
            expect(view.goStop).toEqual(
              preview === null
                ? null
                : {
                    points: preview.points,
                    steps: preview.steps,
                    multiplier: preview.multiplier,
                    money: preview.money,
                    capped: preview.capped,
                  },
            );
            expect(view.multiplier).toBe(
              preview === null ? expectedMultiplier(state, viewer) : preview.multiplier,
            );
            expect(view.inFlight).toEqual(inFlightOf(pv));
            if (view.pending?.kind === 'target') counts.target++;
            // 가림: 상대 손패·더미 카드는 어디에도 나오지 않는다
            const hidden = new Set([
              ...state.seats[other].hand.filter((id) => !state.seats[other].revealed.includes(id)),
              ...state.deck,
            ]);
            for (const id of visibleIds(view)) expect(hidden.has(id)).toBe(false);
            expect(view.seats[other].hand).toBeNull();
            // M3 BoardExtras 호환 함수와 같은 값
            const extras = toBoardExtras(pv);
            expect(extras.pickFirst).toEqual(view.firstPick);
            expect(extras.goStop).toEqual(view.goStop);
          }
        });
      }),
      { numRuns: 60 },
    );
    expect(counts.pickFirst).toBeGreaterThan(0);
    expect(counts.goStop).toBeGreaterThan(0);
    expect(counts.target).toBeGreaterThan(0);
    expect(counts.revealed).toBeGreaterThan(0);
  }, 60_000);

  it('현재 배수는 차례가 아니라 보는 좌석 기준이고 대박판을 곱한다 (리뷰 S-1)', () => {
    for (const roundNumber of [4, 5]) {
      const state = newRound(PRESETS.arcade, 7, { roundNumber, dealer: 0, carry: 2 }).state;
      const expected = roundNumber % 5 === 0 ? 2 * 2 : 2;
      expect(board(state, 0).multiplier).toBe(expected);
      expect(board(state, 1).multiplier).toBe(expected);
    }
  });

  it('BoardMeta(M3 어댑터 문맥)와 ViewContext(원장) 둘 다 받는다', () => {
    const state = newRound(PRESETS.standard, 3, { dealer: 1 }).state;
    const pv = playerView(state, 1);
    const a = toBoardView(pv, { names: ['가', '나'], balances: [10, 20] });
    const b = toBoardView(pv, {
      names: ['가', '나'],
      ledger: { ...ledger, balances: [10, 20] },
    });
    expect(a).toEqual(b);
    expect(a.seats.map((s) => s.balance)).toEqual([10, 20]);
  });
});
