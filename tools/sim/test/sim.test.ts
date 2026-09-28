import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  bankruptcy,
  distribution,
  makePolicies,
  niceCeil,
  parseArgs,
  percentile,
  runAll,
  runPair,
  runSession,
  summarize,
  toMarkdown,
  type SimConfig,
} from '../src/index.ts';

const RANDOM: SimConfig = {
  ...DEFAULT_CONFIG,
  a: { policy: 'random' },
  b: { policy: 'easy' },
  rounds: 8,
  sessionLength: 4,
  mcSessions: 2000,
  workers: 1,
};

const withoutTiming = (records: readonly { msA: readonly number[]; msB: readonly number[] }[]) =>
  records.map(({ msA: _a, msB: _b, ...rest }) => rest);

describe('명령행', () => {
  it('옵션을 읽고 잘못된 값은 거부한다', () => {
    const cfg = parseArgs([
      '--a',
      'commercial',
      '--a-iterations',
      '500',
      '--b',
      'easy',
      '--rounds',
      '10',
    ]);
    if (cfg === 'help') {
      throw new Error('help가 아니어야 합니다');
    }
    expect(cfg.a).toEqual({ policy: 'commercial', iterations: 500 });
    expect(cfg.b.policy).toBe('easy');
    expect(cfg.rounds).toBe(10);
    expect(parseArgs(['--help'])).toBe('help');
    expect(() => parseArgs(['--a', 'godlike'])).toThrow('--a');
    expect(() => parseArgs(['--preset', 'x'])).toThrow('--preset');
    expect(() => parseArgs(['--nope'])).toThrow('알 수 없는 옵션');
  });
});

describe('통계', () => {
  it('백분위·분포', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 0.5)).toBe(5);
    expect(percentile(sorted, 0.95)).toBe(10);
    const d = distribution([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(d.mean).toBe(5);
    expect(d.max).toBe(9);
    expect(d.std).toBeCloseTo(Math.sqrt(32 / 7));
  });

  it('보기 좋은 단위 올림', () => {
    expect(niceCeil(38_700)).toBe(40_000);
    expect(niceCeil(40_000)).toBe(40_000);
    expect(niceCeil(123_400)).toBe(150_000);
    expect(niceCeil(9_100)).toBe(10_000);
    expect(niceCeil(0)).toBe(0);
  });

  it('파산: 매 판 1점씩 지면 L판 세션의 최대 손실은 L점, 최소 잔액은 L+1점', () => {
    const cfg = {
      sessionLength: 30,
      mcSessions: 1000,
      perPoint: 100,
      bankruptcyTarget: 0.05,
      startBalance: 3000,
      seed: 1,
    };
    const b = bankruptcy([-1], cfg, 0);
    expect(b.maxLoss.max).toBe(30);
    expect(b.minBalancePoints).toBe(31);
    expect(b.minBalance).toBe(3100);
    expect(b.givenBalanceRisk).toBe(1);
    expect(b.niceBalanceRisk).toBe(0);
  });

  it('파산: 이기기만 하면 파산 확률 0', () => {
    const cfg = {
      sessionLength: 10,
      mcSessions: 500,
      perPoint: 100,
      bankruptcyTarget: 0.05,
      startBalance: 100,
      seed: 1,
    };
    expect(bankruptcy([3, 5], cfg, 0).givenBalanceRisk).toBe(0);
  });
});

describe('진행', () => {
  it('중복 쌍: 같은 셔플에서 A가 좌석 0과 1에 한 번씩 앉는다', () => {
    const records = runPair(RANDOM, makePolicies(RANDOM), 3);
    expect(records.map((r) => r.aSeat)).toEqual([0, 1]);
    expect(records[0]?.dealer).toBe(records[1]?.dealer);
  });

  it('세션: 선·나가리 배수가 이어지고 판 번호가 1부터 L까지', () => {
    const cfg = { ...RANDOM, mode: 'session' as const };
    const records = runSession(cfg, makePolicies(cfg), 0);
    expect(records.map((r) => r.roundInSession)).toEqual([1, 2, 3, 4]);
    // 다음 판 배수 = 직전 판이 나가리면 ×2(상한 8), 아니면 1
    const expected = records
      .slice(0, -1)
      .map((prev) => (prev.winner === null ? Math.min(prev.carry * 2, 8) : 1));
    expect(records.slice(1).map((r) => r.carry)).toEqual(expected);
    expect(records[0]?.carry).toBe(1);
  });

  it('결과는 워커 수와 무관하다 (워커 1 vs 2, 결정 시간 제외)', async () => {
    const one = await runAll(RANDOM);
    const two = await runAll({ ...RANDOM, workers: 2 });
    expect(withoutTiming(two)).toEqual(withoutTiming(one));
    expect(one).toHaveLength(8);
  });

  it('요약과 마크다운', async () => {
    const cfg = { ...RANDOM, mode: 'session' as const, startBalance: 5000 };
    const records = await runAll(cfg);
    const s = summarize(records, cfg, 1);
    expect(s.wins.a + s.wins.b + s.wins.nagari).toBe(8);
    expect(s.playedSessions?.sessions).toBe(2);
    const md = toMarkdown(s);
    expect(md).toContain('A 승률');
    expect(md).toContain('파산');
  });
});
