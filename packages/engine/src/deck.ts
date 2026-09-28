import { ALL_CARD_IDS, type CardId } from './cards.ts';
import { createRng, shuffleWith, type Seed } from './rng.ts';

/** 시드로 카드 ID 목록을 섞는다. 같은 시드면 항상 같은 순서 (spec 4.3 결정성). */
export function shuffle(seed: Seed, ids: readonly CardId[] = ALL_CARD_IDS): CardId[] {
  return shuffleWith(createRng(seed), ids).items;
}
