// 판 진행과 기록. 판(또는 세션) 번호만으로 모든 시드가 정해지므로 워커 수·순서와 무관하게 결과가 같다.
import {
  createPolicy,
  HeuristicPolicy,
  mixSeed,
  parseWeights,
  playRound,
  RandomPolicy,
  suggestedStartBalance,
  type Policy,
} from '@p2p-gostop/ai';
import {
  applyInstantPayout,
  applySettlement,
  createLedger,
  type Seat,
  type SettleStepKind,
} from '@p2p-gostop/engine';
import { rulesOf, type PolicySpec, type SideConfig, type SimConfig } from './config.ts';

export interface RoundRecord {
  readonly index: number;
  readonly session: number;
  /** 세션 안의 판 번호(1부터). match 모드는 판마다 1 */
  readonly roundInSession: number;
  /** A가 앉은 좌석 */
  readonly aSeat: Seat;
  readonly dealer: Seat | null;
  readonly reason: string;
  /** 'A' | 'B' | null(나가리) */
  readonly winner: 'A' | 'B' | null;
  readonly finalPoints: number;
  readonly multiplier: number;
  readonly carry: number;
  readonly pushes: number;
  readonly pushed: boolean;
  readonly mulKinds: readonly SettleStepKind[];
  /** A 관점 즉시 정산 순액(점) */
  readonly instantA: number;
  /** A 관점 이 판 순액(점) = ±finalPoints + instantA */
  readonly netA: number;
  readonly winnerGo: number;
  readonly chongtong: boolean;
  readonly ppeoks: number;
  /** 결정 시간(ms): A, B (합법 수 2개 이상인 결정만) */
  readonly msA: readonly number[];
  readonly msB: readonly number[];
}

function makePolicy(side: SideConfig): Policy {
  const spec: PolicySpec = side.policy;
  if (spec === 'random') {
    return new RandomPolicy();
  }
  const weights = side.weights === undefined ? {} : { weights: parseWeights(side.weights) };
  if (spec === 'heuristic') {
    return new HeuristicPolicy(weights);
  }
  return createPolicy(spec, {
    ...weights,
    ismcts: {
      ...(side.iterations === undefined ? {} : { maxIterations: side.iterations }),
      defaultTimeBudgetMs: null,
      ...(side.goStop === undefined ? {} : { goStopMode: side.goStop }),
      ...(side.search === undefined ? {} : { searchMode: side.search }),
    },
  });
}

export interface Policies {
  readonly a: Policy;
  readonly b: Policy;
}

export function makePolicies(config: SimConfig): Policies {
  return { a: makePolicy(config.a), b: makePolicy(config.b) };
}

const clock = (): number => performance.now();

interface RoundInput {
  readonly index: number;
  readonly session: number;
  readonly roundInSession: number;
  readonly aSeat: Seat;
  readonly dealSeed: number;
  readonly dealer: Seat | undefined;
  readonly carry: number;
  readonly pushes: number;
  readonly balancePoints?: readonly [number, number];
  readonly allowPush?: boolean;
}

function playOne(config: SimConfig, policies: Policies, input: RoundInput) {
  const seats: [Policy, Policy] =
    input.aSeat === 0 ? [policies.a, policies.b] : [policies.b, policies.a];
  const played = playRound(seats, {
    rules: rulesOf(config.preset),
    seed: input.dealSeed,
    round: {
      ...(input.dealer === undefined ? {} : { dealer: input.dealer }),
      carry: input.carry,
      pushes: input.pushes,
      roundNumber: input.roundInSession,
    },
    policySeeds: [
      mixSeed(config.seed, input.index, 0, 0x901c),
      mixSeed(config.seed, input.index, 1, 0x901c),
    ],
    ...(config.timeMs === null ? {} : { timeBudgetMs: config.timeMs }),
    clock,
    ...(input.balancePoints === undefined ? {} : { balancePoints: input.balancePoints }),
    allowPush: input.allowPush ?? true,
  });
  const state = played.state;
  const settled = played.events.findLast((e) => e.type === 'Settled');
  if (settled?.type !== 'Settled') {
    throw new Error('정산 이벤트가 없습니다');
  }
  const s = settled.settlement;
  const aSeat = input.aSeat;
  const instantA = s.instantPayouts.reduce(
    (sum, p) => sum + (p.to === aSeat ? p.points : -p.points),
    0,
  );
  const winner = s.winner === null ? null : s.winner === aSeat ? 'A' : 'B';
  const roundA = winner === null ? 0 : winner === 'A' ? s.finalPoints : -s.finalPoints;
  const record: RoundRecord = {
    index: input.index,
    session: input.session,
    roundInSession: input.roundInSession,
    aSeat,
    dealer: state.dealer,
    reason: s.reason,
    winner,
    finalPoints: s.finalPoints,
    multiplier: s.multiplier,
    carry: input.carry,
    pushes: input.pushes,
    pushed: s.pushed === true,
    mulKinds: s.steps.filter((st) => st.op === 'mul').map((st) => st.kind),
    instantA,
    netA: roundA + instantA,
    winnerGo: s.winner === null ? 0 : state.seats[s.winner].goCount,
    chongtong: played.events.some((e) => e.type === 'Chongtong'),
    ppeoks: played.events.filter((e) => e.type === 'Ppeok').length,
    msA: played.decisions.filter((d) => d.seat === aSeat).map((d) => d.ms),
    msB: played.decisions.filter((d) => d.seat !== aSeat).map((d) => d.ms),
  };
  return { record, settlement: s };
}

/** match 모드 작업 단위: 중복 쌍 j (판 2j: A 좌석 0, 판 2j+1: A 좌석 1, 같은 셔플·같은 선) */
export function runPair(config: SimConfig, policies: Policies, pair: number): RoundRecord[] {
  const dealSeed = mixSeed(config.seed, pair, 0xdea1);
  const dealer: Seat = pair % 2 === 0 ? 0 : 1;
  const roundInSession = (pair % config.sessionLength) + 1;
  return ([0, 1] as const).map(
    (aSeat) =>
      playOne(config, policies, {
        index: pair * 2 + aSeat,
        session: pair,
        roundInSession,
        aSeat,
        dealSeed,
        dealer,
        carry: 1,
        pushes: 0,
        allowPush: false,
      }).record,
  );
}

/** session 모드 작업 단위: 세션 k. 첫 판은 선 고르기, 이후 선·나가리·밀기 배수 이월 (R5, G9, G10) */
export function runSession(config: SimConfig, policies: Policies, session: number): RoundRecord[] {
  const aSeat: Seat = session % 2 === 0 ? 0 : 1;
  const records: RoundRecord[] = [];
  let dealer: Seat | undefined;
  let carry = 1;
  let pushes = 0;
  let ledger = createLedger(
    config.perPoint,
    config.startBalance ?? suggestedStartBalance(config.preset, config.perPoint),
  );
  const rules = rulesOf(config.preset);
  for (let r = 0; r < config.sessionLength; r++) {
    const index = session * config.sessionLength + r;
    const { record, settlement } = playOne(config, policies, {
      index,
      session,
      roundInSession: r + 1,
      aSeat,
      dealSeed: mixSeed(config.seed, index, 0xdea1),
      dealer,
      carry,
      pushes,
      balancePoints: [ledger.balances[0] / config.perPoint, ledger.balances[1] / config.perPoint],
    });
    records.push(record);
    for (const payout of settlement.instantPayouts) {
      ledger = applyInstantPayout(ledger, payout, rules);
    }
    ledger = applySettlement(ledger, settlement, rules);
    dealer = settlement.nextDealer;
    carry = settlement.nextCarry;
    pushes = settlement.nextPushes ?? 0;
  }
  return records;
}

/** 작업 단위 수: match는 쌍 수, session은 세션 수 */
export function unitCount(config: SimConfig): number {
  return config.mode === 'match'
    ? Math.ceil(config.rounds / 2)
    : Math.ceil(config.rounds / config.sessionLength);
}

export function runUnit(config: SimConfig, policies: Policies, unit: number): RoundRecord[] {
  return config.mode === 'match'
    ? runPair(config, policies, unit)
    : runSession(config, policies, unit);
}
