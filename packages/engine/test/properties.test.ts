// 불변식 속성 테스트 (spec 4.4, AC-02, plan M1 (b), M1 리뷰 F-1·F-3·F-11).
// 기본 1,000판(npm test, plan §4 "매 커밋 축약 1,000판"), ENGINE_FULL=1이면 10,000판.
// 선 고르기부터 시작하는 첫 판은 그 1/10을 추가로 돈다.
// 매 수마다: 입력 상태 deepFreeze(불변성), 무작위·형태 오류 액션 ↔ legalActions(거부), 두 좌석 뷰의 숨은 정보
// 무관성(누출), 상대에게 가는 이벤트의 숨은 카드 검사, 결정화 왕복, NP-07 크기 상한.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  applyInstantPayout,
  applySettlement,
  collectCards,
  createLedger,
  deckCardIds,
  getCard,
  replay,
  settle,
  type EngineEvent,
  type GameState,
  type PresetId,
  type RoundOptions,
  type RuleOptions,
  type Seat,
} from '../src/index.ts';
import { flipSeat, mirrorAction, playRandomRound, type PlayedRound } from './helpers.ts';
import { checkStep, type StepChecker } from './step-checks.ts';

function envFlag(name: string): boolean {
  const proc: unknown = Reflect.get(globalThis, 'process');
  if (typeof proc !== 'object' || proc === null) {
    return false;
  }
  const env: unknown = Reflect.get(proc, 'env');
  return typeof env === 'object' && env !== null && Reflect.get(env, name) === '1';
}

const FULL = envFlag('ENGINE_FULL');
const RUNS = FULL ? 10_000 : 1000;
const FIRST_ROUND_RUNS = RUNS / 10;
const TIMEOUT = FULL ? 900_000 : 60_000;

const rulesArb: fc.Arbitrary<RuleOptions> = fc
  .record({
    preset: fc.constantFrom<PresetId>('standard', 'traditional', 'arcade'),
    bonusCards: fc.constantFrom<0 | 2 | 3>(0, 2, 3, 3, 3),
    dealFloorBonusSteal: fc.boolean(),
    twoCardBomb: fc.constantFrom<RuleOptions['twoCardBomb']>('off', 'noMultiplier', 'double'),
    ppeokPayout: fc.constantFrom<RuleOptions['ppeokPayout']>('points', 'baseMultiple', 'off'),
    firstTtadakPayout: fc.boolean(),
    threePpeokPoints: fc.constantFrom<7 | 10>(7, 10),
    chongtongPoints: fc.constantFrom<7 | 10>(7, 10),
    chongtongContinue: fc.boolean(),
    bonusChongtong: fc.constantFrom<RuleOptions['bonusChongtong']>('never', 'firstTurn', 'always'),
    floorChongtong: fc.constantFrom<RuleOptions['floorChongtong']>(
      'nagari',
      'dealerWins',
      'redeal',
    ),
    bothChongtong: fc.constantFrom<RuleOptions['bothChongtong']>('nagari', 'dealerWins'),
    piBakThreshold: fc.constantFrom<6 | 7>(6, 7),
    piBakZeroExempt: fc.boolean(),
    lastTurnPpeokSteal: fc.boolean(),
    nagariCap: fc.constantFrom<RuleOptions['nagariCap']>(null, 4, 8, 16),
    goScoring: fc.constantFrom<RuleOptions['goScoring']>('plusNAndDouble', 'doubleOnly'),
    gukjin: fc.constantFrom<RuleOptions['gukjin']>('auto', 'ask'),
    firstDealer: fc.constantFrom<RuleOptions['firstDealer']>('pickCard', 'timeOfDay'),
    naturalPpeokSteal: fc.boolean(),
    hudang: fc.boolean(),
    limitedLiability: fc.boolean(),
    customize: fc.boolean(),
  })
  .map(({ preset, customize, ...patch }) =>
    customize ? { ...PRESETS[preset], ...patch } : PRESETS[preset],
  );

const roundArb = fc.record({
  rules: rulesArb,
  seed: fc.integer({ min: 0, max: 0xffffffff }),
  policySeed: fc.integer({ min: 0, max: 0xffffffff }),
  dealer: fc.constantFrom<Seat>(0, 1),
  carry: fc.constantFrom(1, 1, 2, 4),
  roundNumber: fc.integer({ min: 1, max: 12 }),
  isNight: fc.boolean(),
});

const sorted = (ids: readonly number[]): number[] => ids.toSorted((a, b) => a - b);

/** 선 고르기 중에는 아직 분배 전이므로(후보가 있어야 함) 덱 전체를 기대값으로 본다. */
function tableCards(state: GameState): number[] {
  const waitingForPick = state.phase === 'chooseFirst' && (state.firstPick?.pool.length ?? 0) > 0;
  return waitingForPick ? deckCardIds(state.rules.bonusCards) : sorted(collectCards(state));
}

function assertConservation(state: GameState): void {
  expect(tableCards(state)).toEqual(deckCardIds(state.rules.bonusCards));
}

/** 공통 불변식: 보존·더미·배수 곱·제로섬·결정론. 한 판을 두고 결과를 돌려준다. */
function playAndCheck(
  rules: RuleOptions,
  seed: number,
  opts: RoundOptions,
  policySeed: number,
): PlayedRound {
  // 1. 매 단계 카드 보존. 더미가 모자라면 엔진이 불변식 예외를 던져 여기서 실패한다.
  //    + 매 단계 거부·누출·결정화·크기 검사(step-checks.ts). 입력 상태는 helpers가 deepFreeze한다.
  const checker: StepChecker = { policySeed, revealed: [new Set(), new Set()] };
  const played = playRandomRound(rules, seed, opts, policySeed, (state, action, events) => {
    assertConservation(state);
    checkStep(checker, state, action, events);
  });
  const { state, actions, events } = played;
  expect(state.phase).toBe('end');
  // 2. 손패를 다 쓰고 끝났으면 더미 잔여는 보너스뿐 (12.8)
  const exhausted = state.seats.every((s) => s.hand.length + s.bombTokens === 0);
  expect(!exhausted || state.deck.every((id) => getCard(id).kind === 'bonus')).toBe(true);
  // 3. 배수 곱 = steps 곱, 최종 점수 = 가산 합 × 곱
  const result = settle(state, rules);
  const adds = result.steps.filter((s) => s.op === 'add').reduce((a, s) => a + s.value, 0);
  const muls = result.steps.filter((s) => s.op === 'mul').reduce((a, s) => a * s.value, 1);
  expect([result.basePoints, result.multiplier, result.finalPoints]).toEqual([
    adds,
    muls,
    adds * muls,
  ]);
  expect(result.steps.at(-1)?.total ?? 0).toBe(result.finalPoints);
  expect(result.nextCarry).toBeLessThanOrEqual(rules.nagariCap ?? Number.POSITIVE_INFINITY);
  // 4. 제로섬 원장, 잔액은 음수가 되지 않는다
  let ledger = createLedger(100, 50_000);
  for (const payout of state.instantPayouts) {
    ledger = applyInstantPayout(ledger, payout, rules);
  }
  ledger = applySettlement(ledger, result, rules);
  expect(ledger.balances[0] + ledger.balances[1]).toBe(100_000);
  expect(Math.min(...ledger.balances)).toBeGreaterThanOrEqual(0);
  // 5. 결정론: 같은 시드 + 같은 액션 → 같은 이벤트·상태
  const again = replay(rules, seed, actions, opts);
  expect(again.ok).toBe(true);
  expect(again.events).toEqual(events);
  expect(again.state).toEqual(state);
  return played;
}

const mirrorSeat = (seat: Seat | null): Seat | null => (seat === null ? null : flipSeat(seat));

function eventShape(event: EngineEvent, mirror: boolean): unknown {
  return {
    type: event.type,
    seat: mirror ? mirrorSeat(event.seat) : event.seat,
    cards: event.cards,
  };
}

describe('불변식 속성: 무작위 합법 정책', () => {
  it(
    `${RUNS}판: 카드 보존·더미 부족 없음·제로섬·배수 곱·결정론·좌석 대칭`,
    { timeout: TIMEOUT },
    () => {
      fc.assert(
        fc.property(
          roundArb,
          ({ rules, seed, policySeed, dealer, carry, roundNumber, isNight }) => {
            const opts = { dealer, carry, roundNumber, isNight };
            const { state, actions, events } = playAndCheck(rules, seed, opts, policySeed);
            // 6. 좌석 대칭: 선을 바꾸면 같은 덱이 거울상으로 분배된다 → 거울 액션 → 거울 결과
            const mirrored = replay(rules, seed, actions.map(mirrorAction), {
              ...opts,
              dealer: flipSeat(dealer),
            });
            expect(mirrored.ok).toBe(true);
            expect(mirrored.events.map((e) => eventShape(e, true))).toEqual(
              events.map((e) => eventShape(e, false)),
            );
            expect([mirrored.state.seats[1], mirrored.state.seats[0]]).toEqual(state.seats);
            expect(mirrored.state.floor.map((g) => ({ ...g, owner: mirrorSeat(g.owner) }))).toEqual(
              state.floor,
            );
            const a = settle(state, rules);
            const b = settle(mirrored.state, rules);
            expect([mirrorSeat(b.winner), b.finalPoints, b.steps]).toEqual([
              a.winner,
              a.finalPoints,
              a.steps,
            ]);
          },
        ),
        { numRuns: RUNS },
      );
    },
  );

  it(`첫 판(선 고르기부터) ${FIRST_ROUND_RUNS}판: 같은 불변식`, { timeout: TIMEOUT }, () => {
    fc.assert(
      fc.property(roundArb, ({ rules, seed, policySeed, isNight }) => {
        const { events } = playAndCheck(rules, seed, { isNight }, policySeed);
        expect(events.filter((e) => e.type === 'FirstPickerChosen')).toHaveLength(1);
      }),
      { numRuns: FIRST_ROUND_RUNS },
    );
  });
});
