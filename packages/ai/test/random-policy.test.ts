import type { Action } from '@p2p-gostop/engine';
import { describe, expect, it } from 'vitest';
import { createPolicyRng, randomPolicy } from '../src/index.ts';

const legal: Action[] = [
  { type: 'play', seat: 0, card: 3 },
  { type: 'play', seat: 0, card: 17 },
  { type: 'play', seat: 0, card: 42 },
];

describe('randomPolicy', () => {
  it('같은 시드면 같은 선택(결정론), 선택은 항상 합법 수 중 하나', () => {
    const a = randomPolicy.choose(legal, createPolicyRng(1));
    const b = randomPolicy.choose(legal, createPolicyRng(1));
    expect(a).toEqual(b);
    expect(legal).toContainEqual(a.action);
  });

  it('합법 수가 없으면 거부', () => {
    expect(() => randomPolicy.choose([], createPolicyRng(1))).toThrow('합법 수가 없습니다');
  });
});
