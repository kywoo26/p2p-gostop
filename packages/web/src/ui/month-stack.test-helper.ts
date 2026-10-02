// R1/B2/E1: 표준 51장 분배 구성의 합법 네 턴. seed 분배 도달 증거와 구분한다.
import { legalActions, reduce, type CardId } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';

export function mixedTwelveMonths() {
  const floor = [0, 1, 4, 5, 8, 9, 12, 13];
  const hands: [CardId[], CardId[]] = [
    [16, 32],
    [24, 40],
  ];
  const deck = [20, 28, 36, 44];
  const used = new Set([...floor, ...hands.flat(), ...deck]);
  for (let id = 0; id <= 50; id++) {
    if (used.has(id)) continue;
    const seat = hands[0].length < 10 ? 0 : 1;
    if (hands[seat].length === 10) break;
    hands[seat].push(id);
    used.add(id);
  }
  let state = createScenario({ hands, floor, deck });
  if (state.deck.length !== 23) throw Error('표준 분배');
  for (const [seat, card] of [
    [0, 16],
    [1, 24],
    [0, 32],
    [1, 40],
  ] as const) {
    const action = { type: 'play', seat, card } as const;
    if (!legalActions(state, seat).some((a) => a.type === 'play' && a.card === card))
      throw Error('합법 내기');
    const step = reduce(state, action);
    if (!step.ok) throw Error(step.message);
    state = step.state;
    const pending = state.pending;
    if (pending?.kind === 'shake') {
      const step = reduce(state, { type: 'shake', seat: pending.seat, accept: false });
      if (!step.ok) throw Error(step.message);
      state = step.state;
    }
  }
  return state;
}
