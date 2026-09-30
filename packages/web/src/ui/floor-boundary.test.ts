import { expect, test } from 'vitest';
import { DEFAULT_RULES, legalActions, newRound, playerView, reduce } from '@p2p-gostop/engine';
import { floorLayout, projectFloor, type FloorCell } from './floor-layout.ts';
import { boundaryBefore, boundaryAfter, boundarySlots } from './floor-stability-fixtures.ts';

const old = (): FloorCell[] =>
  boundarySlots.map(([id, slot]) => {
    const group = boundaryBefore.find((g) => g.cards.includes(id))!;
    return {
      ...group,
      cards: [id],
      slot,
      anchor: boundarySlots.find(([card]) => group.cards.includes(card))![1],
      x: 0,
      y: 0,
      angle: 0,
      dx: 0,
      dy: 0,
    };
  });
test('seed2: 12셀 뻑 확장 경계가 실제 합법 진행으로 도달한다', () => {
  let state = newRound(DEFAULT_RULES, 2, { dealer: 0 }).state;
  const actions = [
    { type: 'play', seat: 0, card: 18 },
    { type: 'shake', seat: 0, accept: false },
    { type: 'play', seat: 1, card: 34 },
  ] as const;
  for (const [i, action] of actions.entries()) {
    expect(legalActions(state, action.seat)).toContainEqual(action);
    const result = reduce(state, action);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.reason);
    state = result.state;
    if (i === 1) expect(playerView(state, 0).floor).toEqual(boundaryBefore);
  }
  expect(playerView(state, 0).floor).toEqual(boundaryAfter);
});
test('strict 0이동은 불가능, 최소 무관 이동1·월 앵커 이동0인 구성으로 수렴한다', () => {
  const previous = old();
  // 독립 구성 증거: 모든 무관 월을 고정하면 월9가 쓸 수 있는 다섯 셀 중 연결3셀이 없다.
  const free = [0, 1, 4, 10, 14];
  const adjacent = (a: number, b: number) =>
    Math.max(Math.abs((a % 5) - (b % 5)), Math.abs(Math.floor(a / 5) - Math.floor(b / 5))) === 1;
  for (const a of free)
    for (const b of free)
      for (const c of free) {
        if (new Set([a, b, c]).size !== 3) continue;
        expect(
          (adjacent(a, b) && adjacent(a, c)) ||
            (adjacent(a, b) && adjacent(b, c)) ||
            (adjacent(a, c) && adjacent(b, c)),
        ).toBe(false);
      }
  const result = floorLayout(boundaryAfter, [], 300, 243.76, 48, previous);
  expect(result.conflict).toBe(false);
  expect(new Set(result.cells.map((c) => c.slot)).size).toBe(12);
  const unrelated = previous.filter((c) => c.month !== 9);
  expect(
    unrelated.filter(
      (c) => result.cells.find((n) => n.cards.includes(c.cards[0]!))?.slot !== c.slot,
    ),
  ).toHaveLength(1);
  for (const cell of previous)
    expect(result.cells.find((n) => n.month === cell.month)?.anchor).toBe(cell.anchor);
  expect(result.cells.find((c) => c.cards.includes(15))?.slot).toBe(10);
  expect(floorLayout([...boundaryAfter].reverse(), [], 300, 243.76, 48, previous)).toEqual(result);
});
test('viewport 재투영과 선택 변화는 슬롯과 카드 ID를 변경하지 않는다', () => {
  const previous = old();
  for (const [width, height] of [
    [300, 243.76],
    [330, 243.76],
    [352, 303.76],
    [780, 280],
    [300, 243.76],
  ]) {
    const result = projectFloor(previous, [12, 15], width!, height!, 48);
    expect(result.cells.map((c) => [c.cards, c.slot, c.anchor])).toEqual(
      previous.map((c) => [c.cards, c.slot, c.anchor]),
    );
    expect(
      result.cells
        .filter((c) => c.cards.some((id) => [12, 15].includes(id)))
        .every((c) => c.angle === 0),
    ).toBe(true);
  }
});
