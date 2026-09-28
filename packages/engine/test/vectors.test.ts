// JSON 규칙 벡터 (AC-01, plan M1 (a)). 벡터 ↔ 규칙 ID 대응표는 docs/rules-vectors.md.
import { describe, expect, it } from 'vitest';
import { parseVectors, runVector, type RuleVector } from './vector-harness.ts';
import bonus from './vectors/bonus.json' with { type: 'json' };
import deal from './vectors/deal.json' with { type: 'json' };
import events from './vectors/events.json' with { type: 'json' };
import gostop from './vectors/gostop.json' with { type: 'json' };
import push from './vectors/push.json' with { type: 'json' };
import score from './vectors/score.json' with { type: 'json' };
import settleVectors from './vectors/settle.json' with { type: 'json' };
import view from './vectors/view.json' with { type: 'json' };

const FILES: Record<string, unknown> = {
  deal,
  bonus,
  score,
  events,
  gostop,
  settle: settleVectors,
  push,
  view,
};

const range = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

/** 12.1 R1~R7, 12.2 B1~B5, 12.3 S1~S5, 12.4 E1~E14, 12.5 G1~G10, 12.6 M1~M4 */
const REQUIRED_RULE_IDS = [
  ...range('R', 7),
  ...range('B', 5),
  ...range('S', 5),
  ...range('E', 14),
  ...range('G', 10),
  ...range('M', 4),
];

/** code-refs 6.2: 뻑·자뻑·첫뻑/연뻑·3뻑·따닥·쪽·쓸·폭탄·흔들기·총통·보너스 연쇄 뒤집기 (마지막 패 예외는 각 경계 사례) */
const SPECIAL_EVENT_RULE_IDS = ['E1', 'E2', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E11', 'E12', 'B2'];

/** 13장 불일치 목록(1~11, 13, 14, 16)이 된 토글과 12.7 엔진 토글의 모든 값 */
const REQUIRED_TOGGLES = [
  'chongtongPoints=7',
  'chongtongPoints=10',
  'threePpeokPoints=7',
  'threePpeokPoints=10',
  'ppeokPayout=points',
  'ppeokPayout=baseMultiple',
  'ppeokPayout=off',
  'chongtongContinue=true',
  'chongtongContinue=false',
  'floorChongtong=nagari',
  'floorChongtong=dealerWins',
  'floorChongtong=redeal',
  'bothChongtong=nagari',
  'bothChongtong=dealerWins',
  'bonusChongtong=never',
  'bonusChongtong=firstTurn',
  'bonusChongtong=always',
  'twoCardBomb=off',
  'twoCardBomb=noMultiplier',
  'twoCardBomb=double',
  'firstTtadakPayout=true',
  'firstTtadakPayout=false',
  'lastTurnPpeokSteal=false',
  'lastTurnPpeokSteal=true',
  'piBakZeroExempt=true',
  'piBakZeroExempt=false',
  'goScoring=plusNAndDouble',
  'goScoring=doubleOnly',
  'bonusSteal=true',
  'bonusSteal=false',
  'dealFloorBonusSteal=false',
  'dealFloorBonusSteal=true',
  'bonusCards=0',
  'bonusCards=2',
  'bonusCards=3',
  'piBakThreshold=6',
  'piBakThreshold=7',
  'nagariCap=null',
  'nagariCap=4',
  'nagariCap=8',
  'nagariCap=16',
  'gukjin=auto',
  'gukjin=ask',
  'firstDealer=pickCard',
  'firstDealer=timeOfDay',
  'firstDealer=rockPaperScissors',
  'naturalPpeokSteal=true',
  'naturalPpeokSteal=false',
  'hudang=false',
  'hudang=true',
  'limitedLiability=false',
  'limitedLiability=true',
  'jackpotRound=null',
  'jackpotRound=5x2',
  'push=false',
  'push=true',
];

const vectors: RuleVector[] = Object.entries(FILES).flatMap(([file, raw]) =>
  parseVectors(raw, file),
);

describe('규칙 벡터', () => {
  it('벡터 ID는 유일하다', () => {
    expect(new Set(vectors.map((v) => v.id)).size).toBe(vectors.length);
  });

  it('rules-commercial.md 12.1~12.6의 모든 항목에 벡터가 있다', () => {
    const ids = new Set(vectors.map((v) => v.ruleId));
    expect(REQUIRED_RULE_IDS.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('특수 이벤트마다 정상·경계·반례 벡터가 있다', () => {
    const cases = SPECIAL_EVENT_RULE_IDS.map((id) => ({
      id,
      cases: [...new Set(vectors.filter((v) => v.ruleId === id).map((v) => v.case))].toSorted(),
    }));
    expect(cases).toEqual(
      SPECIAL_EVENT_RULE_IDS.map((id) => ({ id, cases: ['boundary', 'counter', 'normal'] })),
    );
  });

  it('13장 불일치 항목의 토글 값마다 벡터가 있다', () => {
    const toggles = new Set(vectors.flatMap((v) => (v.toggle === undefined ? [] : [v.toggle])));
    expect(REQUIRED_TOGGLES.filter((toggle) => !toggles.has(toggle))).toEqual([]);
  });

  it('필수 반례: 서로 다른 월 두 쌍 먹기는 따닥이 아니다', () => {
    expect(vectors.some((v) => v.id === 'E6-two-pairs-not-ttadak' && v.case === 'counter')).toBe(
      true,
    );
  });

  for (const vector of vectors) {
    it(`${vector.id} [${vector.ruleId}/${vector.case}] ${vector.description}`, () => {
      expect.hasAssertions();
      runVector(vector);
    });
  }
});
