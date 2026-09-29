// AI-07·MN-03: 집계된 Summary를 Markdown으로 표시한다. 계산·난수·파일 I/O는 하지 않는다.
import type { Distribution, StopRate, Summary } from './stats.ts';

const f = (x: number, d = 2): string => x.toFixed(d);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const rateText = (r: StopRate): string =>
  `${r.stops}/${r.opportunities} (${r.rate === null ? '해당 없음' : pct(r.rate)})`;
const money = (x: number): string => Math.round(x).toLocaleString('en-US');
const side = (x: Summary['config']['a']): string =>
  `${x.policy}${x.iterations === undefined ? '' : ` (iter ${x.iterations})`}${x.weightsPath === undefined ? '' : ` [${x.weightsPath}]`}`;

function distRow(name: string, d: Distribution, fmt: (x: number) => string): string {
  return `| ${name} | ${d.n} | ${fmt(d.mean)} | ${fmt(d.std)} | ${fmt(d.p50)} | ${fmt(d.p90)} | ${fmt(d.p95)} | ${fmt(d.p99)} | ${fmt(d.max)} |`;
}

export function toMarkdown(s: Summary): string {
  const c = s.config;
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
