import { describe, expect, it } from 'vitest';
import { previewDeal } from '../src/index.ts';

describe('sim previewDeal', () => {
  it('손패 10·10, 바닥 8, 더미 23 (rules 12.1 R2), 같은 시드는 같은 분배', () => {
    const deal = previewDeal(7);
    expect(deal.hands[0]).toHaveLength(10);
    expect(deal.hands[1]).toHaveLength(10);
    expect(deal.floor).toHaveLength(8);
    expect(deal.deckCount).toBe(23);
    expect(previewDeal(7)).toEqual(deal);
  });
});
