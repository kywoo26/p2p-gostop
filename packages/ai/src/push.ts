// 밀기(AI-02): 이번 판 정산을 받는 경우와 포기하고 다음 판 배수를 키우는 경우를 같은 표본으로 비교한다.
// 고/스톱 EV와 동일한 결정화 롤아웃·terminalPoints를 사용한다. 잔액은 올인 상한으로만 반영한다.
import {
  MAX_PUSHES,
  newRound,
  settle,
  type GameState,
  type PlayerView,
  type Seat,
} from '@p2p-gostop/engine';
import { terminalPoints } from './evaluator.ts';
import { determinize } from './knowledge.ts';
import { Rng } from './rng.ts';
import { rollout } from './rollout.ts';
import type { Weights } from './weights.ts';

function capped(
  points: number,
  balances: readonly [number, number],
  seat: Seat,
  limitedLiability: boolean,
): number {
  const opponent: Seat = seat === 0 ? 1 : 0;
  return points >= 0
    ? Math.min(points, balances[opponent], limitedLiability ? balances[seat] : Infinity)
    : -Math.min(-points, balances[seat], limitedLiability ? balances[opponent] : Infinity);
}

function afterTransfer(
  balances: readonly [number, number],
  seat: Seat,
  points: number,
  limitedLiability: boolean,
): [number, number] {
  const actual = capped(points, balances, seat, limitedLiability);
  return seat === 0
    ? [balances[0] + actual, balances[1] - actual]
    : [balances[0] - actual, balances[1] + actual];
}

function futureNet(
  end: GameState,
  seat: Seat,
  balances: readonly [number, number],
  limitedLiability: boolean,
): number {
  if (!Number.isFinite(balances[0]) && !Number.isFinite(balances[1])) {
    return terminalPoints(end, seat);
  }
  let current: [number, number] = [...balances];
  let net = 0;
  for (const payout of end.instantPayouts) {
    const signed = payout.to === seat ? payout.points : -payout.points;
    const actual = capped(signed, current, seat, limitedLiability);
    current = afterTransfer(current, seat, actual, limitedLiability);
    net += actual;
  }
  const result = settle(end);
  if (result.winner !== null) {
    const signed = result.winner === seat ? result.finalPoints : -result.finalPoints;
    net += capped(signed, current, seat, limitedLiability);
  }
  return net;
}

/** 쉬움: 적은 정산만 밀고, 이미 ×2인 판은 받는다. 잔액이 적으면 위험을 더 감수한다. */
export function easyPush(view: PlayerView, balances?: readonly [number, number]): boolean {
  const winner = view.result?.winner;
  if (
    winner === null ||
    winner === undefined ||
    winner !== view.viewer ||
    !view.legal.some((action) => action.type === 'push') ||
    view.round.pushes > 0
  )
    return false;
  const points = settle(determinize(view, new Rng(0))).finalPoints;
  const available = balances ?? [Infinity, Infinity];
  const opponent: Seat = winner === 0 ? 1 : 0;
  return points <= 14 && available[winner] <= available[opponent];
}

export interface PushAnalysis {
  readonly takeNow: number;
  readonly takeEv: number;
  readonly pushEv: number;
  readonly samples: number;
  readonly decision: 'push' | 'take';
}

/** 같은 시드의 다음 판을 ×1/×2(또는 ×2/×4)로 두어 밀기 기대값을 비교한다. */
export function analyzePush(
  view: PlayerView,
  rng: Rng,
  samples: number,
  weights: Weights,
  balances?: readonly [number, number],
  debugReduce = false,
): PushAnalysis {
  const winner = view.result?.winner;
  if (
    winner === null ||
    winner === undefined ||
    winner !== view.viewer ||
    view.round.pushes >= MAX_PUSHES ||
    !view.legal.some((action) => action.type === 'push')
  ) {
    throw new RangeError('밀 수 없는 판입니다');
  }
  const settlement = settle(determinize(view, new Rng(0)));
  const available = balances ?? [Infinity, Infinity];
  const takeNow = capped(settlement.finalPoints, available, winner, view.rules.limitedLiability);
  const afterTake = afterTransfer(available, winner, takeNow, view.rules.limitedLiability);
  let takeFuture = 0;
  let pushFuture = 0;
  for (let i = 0; i < samples; i++) {
    const seed = rng.nextU32();
    const rolloutSeed = rng.nextU32();
    for (const pushes of [0, view.round.pushes + 1]) {
      const next = newRound(view.rules, seed, {
        dealer: settlement.nextDealer,
        carry: settlement.nextCarry,
        pushes,
        roundNumber: view.round.number + 1,
      }).state;
      const end = rollout(next, new Rng(rolloutSeed), weights, debugReduce);
      if (pushes === 0)
        takeFuture += futureNet(end, winner, afterTake, view.rules.limitedLiability);
      else pushFuture += futureNet(end, winner, available, view.rules.limitedLiability);
    }
  }
  const takeEv = takeNow + takeFuture / samples;
  const pushEv = pushFuture / samples;
  return { takeNow, takeEv, pushEv, samples, decision: pushEv > takeEv ? 'push' : 'take' };
}
