import { describe, expect, it } from 'vitest';
import defaultJson from '../src/weights/default.json' with { type: 'json' };
import { DEFAULT_WEIGHTS, parseWeights, withWeights } from '../src/index.ts';

describe('가중치 파일 (AI-07)', () => {
  it('기본 가중치 파일을 읽어 검증하고 얼린다', () => {
    expect(DEFAULT_WEIGHTS).toEqual(defaultJson);
    expect(Object.isFrozen(DEFAULT_WEIGHTS.combo)).toBe(true);
  });

  it('키 누락·알 수 없는 키·숫자 아님·튜플 길이 오류를 거부한다', () => {
    const { score: _score, ...comboWithoutScore } = defaultJson.combo;
    expect(() => parseWeights({ ...defaultJson, combo: comboWithoutScore })).toThrow('combo.score');
    expect(() => parseWeights({ ...defaultJson, risk: { ...defaultJson.risk, oops: 1 } })).toThrow(
      'risk.oops',
    );
    expect(() =>
      parseWeights({ ...defaultJson, search: { ...defaultJson.search, ucbC: 'x' } }),
    ).toThrow('search.ucbC');
    expect(() =>
      parseWeights({ ...defaultJson, combo: { ...defaultJson.combo, danPartial: [1, 2] } }),
    ).toThrow('combo.danPartial');
    expect(() => parseWeights(null)).toThrow('객체가 아닙니다');
  });

  it('withWeights는 일부만 바꾸고 원본은 그대로 둔다', () => {
    const w = withWeights(DEFAULT_WEIGHTS, { search: { ucbC: 2 } });
    expect(w.search.ucbC).toBe(2);
    expect(w.combo).toEqual(DEFAULT_WEIGHTS.combo);
    expect(DEFAULT_WEIGHTS.search.ucbC).not.toBe(2);
  });

  it('과감성은 0~1, 자기 롤아웃 잡음은 0 이상이다', () => {
    for (const bold of [-1, 1.01]) {
      expect(() => withWeights(DEFAULT_WEIGHTS, { goStop: { bold } })).toThrow('bold');
    }
    expect(() => withWeights(DEFAULT_WEIGHTS, { goStop: { selfNoise: -0.1 } })).toThrow(
      'selfNoise',
    );
  });
});
