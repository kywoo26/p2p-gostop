// 판 정산 (rules 12.5 G3~G10, 12.4 E5·E12·E14). 점수 단위의 결과만 계산한다. 금액은 ledger.ts.
import { INSTANT_UNIT_POINTS, MAX_PUSHES, type RuleOptions } from './rules.ts';
import { gukjinOptions, scoreCaptured } from './score.ts';
import type {
  EndReason,
  GameState,
  RoundResult,
  Seat,
  SeatState,
  Settlement,
  SettleStep,
  SettleStepKind,
} from './state.ts';

const DOUBLE = 2;
/** 멍따: 승자 열끗 7장 이상 (G8) */
const MEONGTTA_YEOL = 7;

interface Chain {
  readonly steps: SettleStep[];
  total: number;
}

function add(chain: Chain, kind: SettleStepKind, value: number): void {
  chain.total += value;
  chain.steps.push({ kind, op: 'add', value, total: chain.total });
}

function mul(chain: Chain, kind: SettleStepKind, value: number, origin?: 'push'): void {
  chain.total *= value;
  chain.steps.push(
    origin === undefined
      ? { kind, op: 'mul', value, total: chain.total }
      : { kind, op: 'mul', value, total: chain.total, origin },
  );
}

/**
 * 판 밖에서 온 배수: 나가리 이월(G9) → 밀기(12.7, ×2^연속 횟수, 'jackpot' + origin 'push') → 대박판(12.7).
 * 밀기 배수는 §10.1이 "판 키우기(대박판) 장치"로 분류하므로 나가리 이월처럼 고정 점수 승리에도 곱한다(해석 30).
 */
function applyRoundMultipliers(chain: Chain, state: GameState, rules: RuleOptions): void {
  if (state.round.carry > 1) {
    mul(chain, 'nagariCarry', state.round.carry);
  }
  if (state.round.pushes > 0) {
    mul(chain, 'jackpot', DOUBLE ** state.round.pushes, 'push');
  }
  const jackpot = rules.jackpotRound;
  if (jackpot !== null && jackpot.every > 0 && state.round.number % jackpot.every === 0) {
    mul(chain, 'jackpot', jackpot.multiplier);
  }
}

/** 스톱으로 이긴 판의 전체 배수 사슬 (G3·G4·G6·G7·G8·G10, E9·E11) */
function stopChain(
  state: GameState,
  rules: RuleOptions,
  winner: SeatState,
  loser: SeatState,
  winnerAsPi: boolean,
  loserAsPi: boolean,
): Chain {
  const w = scoreCaptured(winner.captured, winnerAsPi);
  const l = scoreCaptured(loser.captured, loserAsPi);
  const chain: Chain = { steps: [], total: 0 };
  add(chain, 'base', w.total);
  const go = winner.goCount;
  const goBonus = rules.goScoring === 'plusNAndDouble' || go < 3 ? go : 0;
  if (goBonus > 0) {
    add(chain, 'goBonus', goBonus);
  }
  if (go >= 3) {
    mul(chain, 'goMultiplier', DOUBLE ** (go - 2));
  }
  if (winner.shakes > 0) {
    mul(chain, 'shake', DOUBLE ** winner.shakes);
  }
  if (winner.bombs > 0) {
    mul(chain, 'bomb', DOUBLE ** winner.bombs);
  }
  const piBakExempt = rules.piBakZeroExempt && l.piCount === 0;
  if (w.pi > 0 && l.piCount <= rules.piBakThreshold && !piBakExempt) {
    mul(chain, 'piBak', DOUBLE);
  }
  if (w.gwang > 0 && l.gwangCount === 0) {
    mul(chain, 'gwangBak', DOUBLE);
  }
  if (w.yeolCount >= MEONGTTA_YEOL) {
    mul(chain, 'meongtta', DOUBLE);
  }
  if (loser.goCount > 0) {
    mul(chain, 'goBak', DOUBLE);
  }
  applyRoundMultipliers(chain, state, rules);
  return chain;
}

/** 승자는 최종 점수를 최대로, 패자는 최소로 국진 위치를 고른다 (S5 자동 최적, 피박 회피). */
function bestStopChain(
  state: GameState,
  rules: RuleOptions,
  winnerSeat: Seat,
): { chain: Chain; gukjinAsPi: [boolean, boolean] } {
  const winner = state.seats[winnerSeat];
  const loser = state.seats[winnerSeat === 0 ? 1 : 0];
  let best: { chain: Chain; w: boolean; l: boolean } | null = null;
  for (const w of gukjinOptions(winner.captured, winner.gukjinAsPi, rules)) {
    let worst: { chain: Chain; l: boolean } | null = null;
    for (const l of gukjinOptions(loser.captured, loser.gukjinAsPi, rules)) {
      const chain = stopChain(state, rules, winner, loser, w, l);
      if (worst === null || chain.total < worst.chain.total) {
        worst = { chain, l };
      }
    }
    if (worst !== null && (best === null || worst.chain.total > best.chain.total)) {
      best = { chain: worst.chain, w, l: worst.l };
    }
  }
  if (best === null) {
    throw new Error('정산 후보가 없습니다');
  }
  const pair: [boolean, boolean] = winnerSeat === 0 ? [best.w, best.l] : [best.l, best.w];
  return { chain: best.chain, gukjinAsPi: pair };
}

function fixedChain(state: GameState, rules: RuleOptions, reason: EndReason): Chain {
  const chain: Chain = { steps: [], total: 0 };
  switch (reason) {
    case 'threePpeok':
      // E5: 7점(토글 10점)으로 즉시 승리. "배수 미적용"은 판 안의 배수(고·흔들기·폭탄·박)만이고
      // 나가리 이월·대박판은 곱한다(§8 "나가리 다음 판은 점수가 나면 무조건 ×2", 결정 D2). 총통·허당과 같다.
      add(chain, 'base', rules.threePpeokPoints);
      break;
    case 'hudang':
      add(chain, 'base', INSTANT_UNIT_POINTS);
      break;
    default:
      // 총통 끝내기·바닥/양측 총통 선 승리 (E12·R6·E13): 총통 점수 + 나가리 이월
      add(chain, 'base', rules.chongtongPoints);
  }
  applyRoundMultipliers(chain, state, rules);
  return chain;
}

function nextCarry(state: GameState, rules: RuleOptions): number {
  const doubled = state.round.carry * DOUBLE;
  return rules.nagariCap === null ? doubled : Math.min(doubled, rules.nagariCap);
}

/**
 * 끝난 판을 정산한다. steps는 기본 → 고 가산 → 고 배수 → 흔들기·폭탄 → 피박·광박·멍따·고박 → 나가리 이월 → 밀기 → 대박판.
 * finalPoints = (가산 단계 합) × (곱 단계 곱).
 * 고정 점수 승리(3뻑·총통 끝내기·바닥/양측 총통 선 승리·허당)는 판 안의 배수 없이 나가리 이월·밀기·대박판만 곱한다.
 * 승자가 밀기를 했으면(result.pushed) 포기한 정산(pushed: true, finalPoints 0)을 돌려준다.
 *
 * 규칙은 항상 `state.rules`를 쓴다. 두 번째 인수는 예전 호출(`settle(state, rules)`)과의 호환용이며 무시한다
 * (상태의 규칙과 어긋난 규칙으로 정산하는 일을 막는다, M1 리뷰 F-10).
 */
export function settle(state: GameState, _rules?: RuleOptions): Settlement {
  const result = state.result;
  if (result === null) {
    throw new RangeError('끝나지 않은 판은 정산할 수 없습니다');
  }
  if (result.pushed === true && result.winner !== null) {
    // 밀기(해석 30): 이 판 정산을 포기한다. 돈은 오가지 않고, 나가리 이월은 이 판(승자가 있는 판)에서 소진되며,
    // 다음 판은 연속 밀기 횟수 + 1(상한 MAX_PUSHES)로 ×2^n. 선은 승자.
    const forfeited = scoredSettlement(state, { reason: result.reason, winner: result.winner });
    return {
      ...forfeited,
      steps: [],
      basePoints: 0,
      multiplier: 1,
      finalPoints: 0,
      nextCarry: 1,
      pushed: true,
      forfeitedPoints: forfeited.finalPoints,
      nextPushes: Math.min(state.round.pushes + 1, MAX_PUSHES),
    };
  }
  return scoredSettlement(state, result);
}

function scoredSettlement(state: GameState, result: RoundResult): Settlement {
  const rules = state.rules;
  const dealer = state.dealer ?? 0;
  const winner = result.winner;
  if (winner === null) {
    return {
      reason: result.reason,
      winner: null,
      loser: null,
      steps: [],
      basePoints: 0,
      multiplier: 1,
      finalPoints: 0,
      nextCarry: nextCarry(state, rules),
      nextDealer: dealer,
      instantPayouts: state.instantPayouts,
      gukjinAsPi: [state.seats[0].gukjinAsPi, state.seats[1].gukjinAsPi],
      pushed: false,
      forfeitedPoints: 0,
      // 해석 30: 밀어 둔 배수는 나가리를 건너 다음 판으로 이어진다(나가리 이월과 따로 곱한다)
      nextPushes: state.round.pushes,
    };
  }
  const isStop = result.reason === 'stop' || result.reason === 'autoStop';
  const { chain, gukjinAsPi } = isStop
    ? bestStopChain(state, rules, winner)
    : {
        chain: fixedChain(state, rules, result.reason),
        gukjinAsPi: [state.seats[0].gukjinAsPi, state.seats[1].gukjinAsPi] as [boolean, boolean],
      };
  const basePoints = chain.steps.filter((s) => s.op === 'add').reduce((a, s) => a + s.value, 0);
  const multiplier = chain.steps.filter((s) => s.op === 'mul').reduce((a, s) => a * s.value, 1);
  return {
    reason: result.reason,
    winner,
    loser: winner === 0 ? 1 : 0,
    steps: chain.steps,
    basePoints,
    multiplier,
    finalPoints: chain.total,
    nextCarry: 1,
    nextDealer: winner,
    instantPayouts: state.instantPayouts,
    gukjinAsPi,
    pushed: false,
    forfeitedPoints: 0,
    nextPushes: 0,
  };
}

/** 지금 이 좌석이 스톱하면 받을 정산 (FR-14, M4 "스톱 시 예상 획득액"). */
export function previewStop(state: GameState, seat: Seat): Settlement {
  return settle({ ...state, result: { reason: 'stop', winner: seat } });
}
