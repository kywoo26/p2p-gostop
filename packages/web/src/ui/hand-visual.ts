import type { CardId } from '../lib/view-types.ts';

/** FR-46~50: 전달받은 표시 슬롯만. 확보 짝/폭탄/흔들기 판정이나 액션을 생성하지 않는다. */
export interface HandVisualGroup {
  readonly id: string;
  readonly kind: 'secured' | 'bomb' | 'shake';
  readonly cards: readonly CardId[];
}

export const HAND_CUES = {
  playable: { label: '낼 수 있음', short: '내기' },
  matchable: { label: '먹을 수 있음', short: '먹기' },
  secured: { label: '확정 획득 짝', short: '확정' },
  bomb: { label: '폭탄 가능', short: '폭탄' },
  shake: { label: '흔들기 가능', short: '흔들' },
} as const;
