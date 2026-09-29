// 통계: 승률, 판당 정산액 분포, 배수 분포, 특수 이벤트 빈도, 결정 시간, 파산 확률(몬테카를로).
import { Rng, mixSeed } from '@p2p-gostop/ai';
import { applyInstantPayout, applySettlement, createLedger, PRESETS } from '@p2p-gostop/engine';
import type { SimConfig } from './config.ts';
import type { RoundRecord } from './runner.ts';
import type { GoStopRecord } from './gostop.ts';

export interface Distribution {
  readonly n: number;
  readonly mean: number;
  readonly std: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

/** 정렬된 배열의 백분위수 (nearest-rank) */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank] ?? 0;
}

export function distribution(values: readonly number[]): Distribution {
  const n = values.length;
  if (n === 0) {
    return { n: 0, mean: 0, std: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  const sorted = values.toSorted((a, b) => a - b);
  return {
    n,
    mean,
    std: Math.sqrt(variance),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[n - 1] ?? 0,
  };
}

/** 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^k 중 value 이상인 가장 작은 값 */
export function niceCeil(value: number): number {
  if (value <= 0) {
    return 0;
  }
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const exp = 10 ** Math.floor(Math.log10(value));
  for (const s of steps) {
    const candidate = Math.round(s * exp * 1e6) / 1e6;
    if (candidate >= value) {
      return candidate;
    }
  }
  return 10 * exp;
}

export interface Bankruptcy {
  /** 몬테카를로 세션 수 */
  readonly sessions: number;
  readonly sessionLength: number;
  /** 세션 안 최대 누적 손실(점)의 분포 */
  readonly maxLoss: Distribution;
  /** 파산 확률 ≤ target이 되는 최소 시작 잔액(점) */
  readonly minBalancePoints: number;
  /** 그 금액 × 점당 */
  readonly minBalance: number;
  /** 보기 좋은 단위로 올림 */
  readonly niceBalance: number;
  /** niceBalance로 시작했을 때의 파산 확률 */
  readonly niceBalanceRisk: number;
  /** 지정한 시작 잔액의 파산 확률 (지정하지 않으면 null) */
  readonly givenBalance: number | null;
  readonly givenBalanceRisk: number | null;
}

/**
 * 한 선수의 판별 순액(점) 표본에서 세션 L판을 복원 추출해 누적 손실의 최댓값을 구한다.
 * 파산 = 누적 손실이 시작 잔액 이상(잔액 0, 올인 규칙 M2)이 되는 것.
 */
export function bankruptcy(
  nets: readonly number[],
  config: Pick<
    SimConfig,
    'sessionLength' | 'mcSessions' | 'perPoint' | 'bankruptcyTarget' | 'startBalance' | 'seed'
  >,
  stream: number,
): Bankruptcy {
  const rng = new Rng(mixSeed(config.seed, stream, 0xb4c3));
  const losses = new Float64Array(config.mcSessions);
  if (nets.length > 0) {
    for (let s = 0; s < config.mcSessions; s++) {
      let sum = 0;
      let worst = 0;
      for (let r = 0; r < config.sessionLength; r++) {
        sum += nets[rng.int(nets.length)] ?? 0;
        if (-sum > worst) {
          worst = -sum;
        }
      }
      losses[s] = worst;
    }
  }
  const sorted = Array.from(losses).toSorted((a, b) => a - b);
  const n = sorted.length;
  const riskAt = (balancePoints: number): number => {
    // 누적 손실 ≥ 잔액이면 파산
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((sorted[mid] ?? 0) >= balancePoints) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return (n - lo) / n;
  };
  // 파산 세션이 target 이하가 되는 가장 작은 잔액: 상위 k번째 손실보다 1점 많은 잔액
  const allowed = Math.floor(config.bankruptcyTarget * n);
  const threshold = sorted[n - 1 - allowed] ?? 0;
  const minBalancePoints = threshold + 1;
  const minBalance = minBalancePoints * config.perPoint;
  const niceBalance = niceCeil(minBalance);
  const given = config.startBalance;
  return {
    sessions: n,
    sessionLength: config.sessionLength,
    maxLoss: distribution(sorted),
    minBalancePoints,
    minBalance,
    niceBalance,
    niceBalanceRisk: riskAt(niceBalance / config.perPoint),
    givenBalance: given,
    givenBalanceRisk: given === null ? null : riskAt(given / config.perPoint),
  };
}

export interface TimingStats {
  readonly decisions: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

function timing(values: readonly number[]): TimingStats {
  const d = distribution(values);
  return { decisions: d.n, mean: d.mean, p50: d.p50, p95: d.p95, p99: d.p99, max: d.max };
}

/** 실제로 둔 세션을 원장으로 정산했을 때의 파산 세션 수 (session 모드, 시작 잔액이 주어졌을 때) */
function playedSessionBankruptcies(records: readonly RoundRecord[], config: SimConfig) {
  if (config.mode !== 'session' || config.startBalance === null) {
    return null;
  }
  const rules = PRESETS[config.preset];
  const bySession = new Map<number, RoundRecord[]>();
  for (const r of records) {
    const list = bySession.get(r.session) ?? [];
    list.push(r);
    bySession.set(r.session, list);
  }
  let bankruptA = 0;
  let bankruptB = 0;
  for (const rounds of bySession.values()) {
    let ledger = createLedger(config.perPoint, config.startBalance);
    let hitA = false;
    let hitB = false;
    for (const r of rounds.toSorted((x, y) => x.index - y.index)) {
      // A를 좌석 0으로 놓은 원장: 즉시 정산 → 판 정산 순서
      if (r.instantA !== 0) {
        const to = r.instantA > 0 ? 0 : 1;
        ledger = applyInstantPayout(
          ledger,
          { kind: 'firstPpeok', to, from: to === 0 ? 1 : 0, points: Math.abs(r.instantA) },
          rules,
        );
      }
      if (r.winner !== null) {
        const winner = r.winner === 'A' ? 0 : 1;
        ledger = applySettlement(
          ledger,
          {
            reason: 'stop',
            winner,
            loser: winner === 0 ? 1 : 0,
            steps: [],
            basePoints: r.finalPoints,
            multiplier: 1,
            finalPoints: r.finalPoints,
            nextCarry: 1,
            nextDealer: winner,
            instantPayouts: [],
            gukjinAsPi: [false, false],
          },
          rules,
        );
      }
      hitA ||= ledger.balances[0] <= 0;
      hitB ||= ledger.balances[1] <= 0;
    }
    bankruptA += hitA ? 1 : 0;
    bankruptB += hitB ? 1 : 0;
  }
  return { sessions: bySession.size, bankruptA, bankruptB };
}

export interface Summary {
  readonly label: string;
  readonly config: Omit<SimConfig, 'a' | 'b'> & {
    readonly a: Omit<SimConfig['a'], 'weights'>;
    readonly b: Omit<SimConfig['b'], 'weights'>;
  };
  readonly rounds: number;
  readonly wins: { readonly a: number; readonly b: number; readonly nagari: number };
  /** A 승률 = A 승 / (A 승 + B 승) */
  readonly winRateA: number;
  /** 95% 신뢰구간 (정규 근사) */
  readonly winRateA95: readonly [number, number];
  readonly nagariRate: number;
  /** A 관점 판당 평균 순액(점) */
  readonly meanNetA: number;
  /** 상한 없는 독립 판 정산 순액 × 점당(냥). 세션도 원장 상한 적용 전 값이다. */
  readonly meanNetMoneyA: number;
  readonly boldness: { readonly a: BoldnessStats; readonly b: BoldnessStats };
  /** 실제 이동이 있는 판의 순액 크기(점, 나가리·무이동 밀기 제외, 즉시 정산 포함) */
  readonly payoutPoints: Distribution;
  /** 같은 분포 × 점당 */
  readonly payoutMoney: Distribution;
  readonly multipliers: Readonly<Record<string, number>>;
  readonly multiplierKinds: Readonly<Record<string, number>>;
  readonly reasons: Readonly<Record<string, number>>;
  readonly goCounts: Readonly<Record<string, number>>;
  readonly frequencies: {
    readonly threePpeok: number;
    readonly chongtong: number;
    readonly nagari: number;
    readonly instantPayoutRounds: number;
    readonly ppeokPerRound: number;
    readonly pushedRounds: number;
  };
  readonly timing: { readonly a: TimingStats; readonly b: TimingStats };
  readonly bankruptcy: {
    readonly a: Bankruptcy;
    readonly b: Bankruptcy;
    readonly pooled: Bankruptcy;
  };
  readonly playedSessions: ReturnType<typeof playedSessionBankruptcies>;
  readonly elapsedSec: number;
}

function histogram(values: readonly (string | number)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    out[String(v)] = (out[String(v)] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(out).toSorted(([a], [b]) => Number(a) - Number(b) || a.localeCompare(b)),
  );
}

export interface StopRate {
  readonly stops: number;
  readonly opportunities: number;
  /** 선택 기회가 없으면 null: 0%로 오인하지 않는다. */
  readonly rate: number | null;
}

export interface BoldnessStats {
  readonly roundGoCounts: Readonly<Record<string, number>>;
  readonly choices: Readonly<Record<string, number>>;
  readonly firstSevenStop: StopRate;
  readonly firstThreeStop: StopRate;
  readonly afterOneGoStop: StopRate;
  readonly lowRiskStop: StopRate;
  readonly stopScores: Readonly<Record<string, number>>;
  readonly stopOpponentScores: Readonly<Record<string, number>>;
  readonly stopOpponentPotential: Distribution;
  readonly stopOpponentPi: Distribution;
  readonly stopTurnsLeft: Distribution;
  readonly stopWithBakChance: number;
}

function stopRate(records: readonly GoStopRecord[]): StopRate {
  const stops = records.filter((r) => r.choice === 'stop').length;
  return {
    stops,
    opportunities: records.length,
    rate: records.length === 0 ? null : stops / records.length,
  };
}

function boldness(records: readonly RoundRecord[], side: 'a' | 'b'): BoldnessStats {
  const decisions = records.flatMap((r) => (side === 'a' ? r.goStopA : r.goStopB));
  const stops = decisions.filter((r) => r.choice === 'stop');
  return {
    roundGoCounts: histogram(
      records.map((r) => {
        const n = side === 'a' ? r.goA : r.goB;
        return n >= 3 ? '3+' : String(n);
      }),
    ),
    choices: histogram(decisions.map((r) => r.choice)),
    firstSevenStop: stopRate(decisions.filter((r) => r.goCount === 0 && r.score === 7)),
    firstThreeStop: stopRate(decisions.filter((r) => r.goCount === 0 && r.score === 3)),
    afterOneGoStop: stopRate(decisions.filter((r) => r.goCount === 1)),
    // 전후에 고정한 체감 지표: 상대 3점 이하·잠재력 7 미만, 내 박 위험 없음, 두 턴 이상.
    lowRiskStop: stopRate(
      decisions.filter(
        (r) => r.opponentScore <= 3 && r.opponentPotential < 7 && !r.ownBakRisk && r.turnsLeft >= 2,
      ),
    ),
    stopScores: histogram(stops.map((r) => r.score)),
    stopOpponentScores: histogram(stops.map((r) => r.opponentScore)),
    stopOpponentPotential: distribution(stops.map((r) => r.opponentPotential)),
    stopOpponentPi: distribution(stops.map((r) => r.opponentPi)),
    stopTurnsLeft: distribution(stops.map((r) => r.turnsLeft)),
    stopWithBakChance: stops.filter((r) => r.bakChance).length,
  };
}

/** 요약에는 가중치 내용 대신 경로만 남긴다 */
function strip(side: SimConfig['a']): Omit<SimConfig['a'], 'weights'> {
  const { weights: _weights, ...kept } = side;
  return kept;
}

export function summarize(
  records: readonly RoundRecord[],
  config: SimConfig,
  elapsedSec: number,
): Summary {
  const n = records.length;
  const winsA = records.filter((r) => r.winner === 'A').length;
  const winsB = records.filter((r) => r.winner === 'B').length;
  const nagari = n - winsA - winsB;
  const decisive = winsA + winsB;
  const rate = decisive === 0 ? 0 : winsA / decisive;
  const half = decisive === 0 ? 0 : 1.96 * Math.sqrt((rate * (1 - rate)) / decisive);
  const payouts = records.filter((r) => r.netA !== 0).map((r) => Math.abs(r.netA));
  const decisiveRecords = records.filter((r) => r.winner !== null);
  const netsA = records.map((r) => r.netA);
  const netsB = records.map((r) => -r.netA);
  const { a, b, ...rest } = config;
  return {
    label: config.label ?? `${config.a.policy} vs ${config.b.policy} (${config.preset})`,
    config: { ...rest, a: strip(a), b: strip(b) },
    rounds: n,
    wins: { a: winsA, b: winsB, nagari },
    winRateA: rate,
    winRateA95: [rate - half, rate + half],
    nagariRate: n === 0 ? 0 : nagari / n,
    meanNetA: n === 0 ? 0 : netsA.reduce((x, y) => x + y, 0) / n,
    meanNetMoneyA: n === 0 ? 0 : (netsA.reduce((x, y) => x + y, 0) * config.perPoint) / n,
    boldness: { a: boldness(records, 'a'), b: boldness(records, 'b') },
    payoutPoints: distribution(payouts),
    payoutMoney: distribution(payouts.map((p) => p * config.perPoint)),
    multipliers: histogram(decisiveRecords.map((r) => r.multiplier)),
    multiplierKinds: histogram(decisiveRecords.flatMap((r) => r.mulKinds)),
    reasons: histogram(records.map((r) => r.reason)),
    goCounts: histogram(decisiveRecords.map((r) => r.winnerGo)),
    frequencies: {
      threePpeok: records.filter((r) => r.reason === 'threePpeok').length / Math.max(1, n),
      chongtong: records.filter((r) => r.chongtong).length / Math.max(1, n),
      nagari: nagari / Math.max(1, n),
      instantPayoutRounds: records.filter((r) => r.instantA !== 0).length / Math.max(1, n),
      ppeokPerRound: records.reduce((s, r) => s + r.ppeoks, 0) / Math.max(1, n),
      pushedRounds: records.filter((r) => r.pushed).length / Math.max(1, n),
    },
    timing: { a: timing(records.flatMap((r) => r.msA)), b: timing(records.flatMap((r) => r.msB)) },
    bankruptcy: {
      a: bankruptcy(netsA, config, 1),
      b: bankruptcy(netsB, config, 2),
      pooled: bankruptcy([...netsA, ...netsB], config, 3),
    },
    playedSessions: playedSessionBankruptcies(records, config),
    elapsedSec,
  };
}

const f = (x: number, d = 2): string => x.toFixed(d);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const rateText = (r: StopRate): string =>
  `${r.stops}/${r.opportunities} (${r.rate === null ? '해당 없음' : pct(r.rate)})`;
const money = (x: number): string => Math.round(x).toLocaleString('en-US');

function distRow(name: string, d: Distribution, fmt: (x: number) => string): string {
  return `| ${name} | ${d.n} | ${fmt(d.mean)} | ${fmt(d.std)} | ${fmt(d.p50)} | ${fmt(d.p90)} | ${fmt(d.p95)} | ${fmt(d.p99)} | ${fmt(d.max)} |`;
}

export function toMarkdown(s: Summary): string {
  const c = s.config;
  const side = (x: Summary['config']['a']): string =>
    `${x.policy}${x.iterations === undefined ? '' : ` (iter ${x.iterations})`}${x.weightsPath === undefined ? '' : ` [${x.weightsPath}]`}`;
  const lines = [
    `## ${s.label}`,
    '',
    `- 모드 ${c.mode}, 프리셋 ${c.preset}, ${s.rounds}판, 세션 길이 ${c.sessionLength}, 점당 ${c.perPoint}, 시드 ${c.seed}, 시간 제한 ${c.timeMs ?? '없음(반복 상한)'}`,
    `- A = ${side(c.a)}, B = ${side(c.b)}, 소요 ${f(s.elapsedSec, 1)}s`,
    '',
    '| 항목 | 값 |',
    '|---|---|',
    `| A 승 / B 승 / 나가리 | ${s.wins.a} / ${s.wins.b} / ${s.wins.nagari} |`,
    `| **A 승률 (승/(승+패))** | **${pct(s.winRateA)}** (95% CI ${pct(s.winRateA95[0])}–${pct(s.winRateA95[1])}) |`,
    `| 나가리 비율 | ${pct(s.nagariRate)} |`,
    `| A 판당 평균 순액 | ${f(s.meanNetA)}점 |`,
    `| A 판당 평균 순액(상한 전) | ${f(s.meanNetMoneyA)}냥 |`,
    `| 3뻑 / 총통 / 즉시정산 판 비율 | ${pct(s.frequencies.threePpeok)} / ${pct(s.frequencies.chongtong)} / ${pct(s.frequencies.instantPayoutRounds)} |`,
    `| 판당 뻑 수 | ${f(s.frequencies.ppeokPerRound)} |`,
    `| 밀기 비율 | ${pct(s.frequencies.pushedRounds)} |`,
    '',
    '실제 돈 이동이 있는 판의 순액 크기 (나가리·무이동 밀기 제외, 즉시 정산 포함):',
    '',
    '| 단위 | n | 평균 | 표준편차 | p50 | p90 | p95 | p99 | 최대 |',
    '|---|---|---|---|---|---|---|---|---|',
    distRow('점', s.payoutPoints, (x) => f(x, 1)),
    distRow(`금액(점당 ${c.perPoint})`, s.payoutMoney, money),
    '',
    `배수 분포(승부 난 판): ${Object.entries(s.multipliers)
      .map(([k, v]) => `×${k}: ${v}`)
      .join(', ')}`,
    '',
    `배수 요인 빈도: ${Object.entries(s.multiplierKinds)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
    '',
    `종료 사유: ${Object.entries(s.reasons)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
    '',
    `승자 고 횟수: ${Object.entries(s.goCounts)
      .map(([k, v]) => `${k}고 ${v}`)
      .join(', ')}`,
    '',
    '고/스톱 체감 지표(정책별, 승패·나가리 모두 포함):',
    '',
    '| 정책 | 판별 고 횟수 0 / 1 / 2 / 3+ | 7점 첫 선택 스톱 | 1고 후 스톱 | 저위험 선택 스톱 | 스톱 시 상대 잠재력 평균 |',
    '|---|---|---|---|---|---|',
    ...(['a', 'b'] as const).map((k) => {
      const b = s.boldness[k];
      return `| ${k.toUpperCase()} ${c[k].policy} | ${['0', '1', '2', '3+'].map((n) => b.roundGoCounts[n] ?? 0).join(' / ')} | ${rateText(b.firstSevenStop)} | ${rateText(b.afterOneGoStop)} | ${rateText(b.lowRiskStop)} | ${f(b.stopOpponentPotential.mean)} |`;
    }),
    '',
    ...(['a', 'b'] as const).map((k) => {
      const b = s.boldness[k];
      return `${k.toUpperCase()} 스톱 시 점수 분포: ${JSON.stringify(b.stopScores)}, 상대 점수 분포: ${JSON.stringify(b.stopOpponentScores)}, 상대 피 평균 ${f(b.stopOpponentPi.mean)}, 남은 턴 평균 ${f(b.stopTurnsLeft.mean)}`;
    }),
    '',
    '결정 시간(ms, 합법 수 2개 이상인 결정):',
    '',
    '| 정책 | 결정 수 | 평균 | p50 | p95 | p99 | 최대 |',
    '|---|---|---|---|---|---|---|',
    ...(['a', 'b'] as const).map((k) => {
      const t = s.timing[k];
      return `| ${k.toUpperCase()} ${c[k].policy} | ${t.decisions} | ${f(t.mean, 1)} | ${f(t.p50, 1)} | ${f(t.p95, 1)} | ${f(t.p99, 1)} | ${f(t.max, 1)} |`;
    }),
    '',
    `파산 (세션 ${c.sessionLength}판, 몬테카를로 ${s.bankruptcy.pooled.sessions}세션, 목표 ≤ ${pct(c.bankruptcyTarget)}):`,
    '',
    '| 관점 | 최대 누적 손실 p50 | p95 | p99 | 최소 시작 잔액(점) | 금액 | 올림 | 올림 금액의 파산 확률 | 지정 잔액 파산 확률 |',
    '|---|---|---|---|---|---|---|---|---|',
    ...(['a', 'b', 'pooled'] as const).map((k) => {
      const b = s.bankruptcy[k];
      return `| ${k} | ${f(b.maxLoss.p50, 0)} | ${f(b.maxLoss.p95, 0)} | ${f(b.maxLoss.p99, 0)} | ${b.minBalancePoints} | ${money(b.minBalance)} | ${money(b.niceBalance)} | ${pct(b.niceBalanceRisk)} | ${b.givenBalanceRisk === null ? '-' : pct(b.givenBalanceRisk)} |`;
    }),
  ];
  if (s.playedSessions !== null) {
    const p = s.playedSessions;
    lines.push(
      '',
      `실제 세션 원장(시작 ${money(c.startBalance ?? 0)}): ${p.sessions}세션 중 A 파산 ${p.bankruptA}, B 파산 ${p.bankruptB}`,
    );
  }
  return lines.join('\n');
}
