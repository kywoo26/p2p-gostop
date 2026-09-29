// UX-01~09 / #46/#47: 합법 진행 재현이 아닌 공개 카드 배치의 최악 경계 fixture.
import type { Month } from '@p2p-gostop/engine';
import type { BoardExtras } from '@p2p-gostop/protocol';
import { fixtures } from './fixtures.ts';
import type { BoardView, FloorGroupView, PromptView } from './view-types.ts';

const floor: FloorGroupView[] = Array.from({ length: 12 }, (_, i) => ({
  month: (i + 1) as Month,
  cards: i === 3 ? [12, 13, 15] : i === 8 ? [32, 33] : [i * 4],
  kind: i === 3 ? 'ppeok' : 'loose',
  owner: i === 3 ? 0 : null,
}));
const hand = [2, 6, 10, 14, 18, 22, 26, 30, 38, 42];
const empty = { gwang: [], yeol: [], tti: [], pi: [] };
const base = fixtures.board.states.play;
export function layoutFixture(kind: string, expanded = false): BoardView {
  const prompts: Record<string, PromptView> = {
    target: { kind: 'target', seat: 0, card: 34, source: 'play', options: [32, 33] },
    gostop: { kind: 'goStop', seat: 0, score: 123, goCount: 9, stopAmount: 999_999_999 },
    gukjin: { kind: 'gukjin', seat: 0 },
    shake: { kind: 'shake', seat: 0, card: 2, month: 1 },
    chongtong: { kind: 'chongtong', seat: 0, months: [1, 2, 3, 4] },
  };
  return {
    ...base,
    floor,
    deckCount: kind === 'target' ? 15 : 16,
    pending: prompts[kind] ?? { kind: 'play', seat: 0 },
    playable: kind === 'play' || kind === 'bomb' ? hand : [],
    seats: [
      {
        ...base.seats[0],
        hand: kind === 'first' ? [] : hand,
        handCount: kind === 'first' ? 0 : 10,
        captured: empty,
        name: '가나다라마바사아자차카타파하',
        balance: expanded ? Number.MAX_SAFE_INTEGER : 51_200,
      },
      {
        ...base.seats[1],
        hand: null,
        handCount: 10,
        captured: empty,
        balance: expanded ? Number.MAX_SAFE_INTEGER : 48_800,
      },
    ],
  };
}

export function layoutExtras(kind: string): BoardExtras {
  return {
    pickFirst: kind === 'first' ? { poolSize: 8, taken: null } : null,
    bombMonths: kind === 'bomb' ? [1] : [],
    canFlipOnly: kind === 'flip',
    dealer: null,
    goStop: kind.includes('gostop')
      ? {
          points: 123,
          multiplier: 128,
          money: 999_999_999,
          capped: true,
          steps: [
            { kind: 'base', op: 'add', value: 9, total: 9 },
            { kind: 'goBonus', op: 'add', value: 2, total: 11 },
            { kind: 'shake', op: 'mul', value: 2, total: 22 },
            { kind: 'bomb', op: 'mul', value: 2, total: 44 },
            { kind: 'piBak', op: 'mul', value: 2, total: 88 },
            { kind: 'gwangBak', op: 'mul', value: 2, total: 176 },
            { kind: 'nagariCarry', op: 'mul', value: 2, total: 352 },
          ],
        }
      : null,
  };
}
