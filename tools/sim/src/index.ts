// 셀프플레이 시뮬레이션 (plan.md 1.5, M2). TODO(M2): 판 진행·좌석 교대·통계.
import { randomPolicy } from '@p2p-gostop/ai';
import { shuffle, type CardId } from '@p2p-gostop/engine';

export interface DealPreview {
  readonly seed: number;
  readonly policy: string;
  readonly hands: readonly [readonly CardId[], readonly CardId[]];
  readonly floor: readonly CardId[];
  readonly deckCount: number;
}

/** 시드로 섞고 손패 10 / 바닥 8 / 더미 나머지로 나눈다 (rules 12.1 R2). 엔진 구현 전 임시 미리보기. */
export function previewDeal(seed: number): DealPreview {
  const deck = shuffle(seed);
  return {
    seed,
    policy: randomPolicy.difficulty,
    hands: [deck.slice(0, 10), deck.slice(10, 20)],
    floor: deck.slice(20, 28),
    deckCount: deck.length - 28,
  };
}
