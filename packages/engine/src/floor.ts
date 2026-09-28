// 바닥 무더기 조작 (월마다 최대 하나의 무더기).
import { getCard, type CardId, type Month } from './cards.ts';
import type { DraftGroup } from './draft.ts';
import type { FloorGroup } from './state.ts';

export function monthOf(id: CardId): Month {
  const month = getCard(id).month;
  if (month === null) {
    throw new RangeError(`보너스 카드는 월이 없습니다: ${id}`);
  }
  return month;
}

export function findGroup<G extends FloorGroup | DraftGroup>(
  floor: readonly G[],
  month: Month,
): G | undefined {
  return floor.find((g) => g.month === month);
}

/** 이 월의 바닥 장수: 낱장이면 1~2, 뻑·자연뻑 무더기면 3, 없으면 0 */
export function groupSize(floor: readonly (FloorGroup | DraftGroup)[], month: Month): number {
  const group = findGroup(floor, month);
  if (group === undefined) {
    return 0;
  }
  return group.kind === 'loose' ? group.cards.length : 3;
}

function insertSorted(floor: DraftGroup[], group: DraftGroup): void {
  const index = floor.findIndex((g) => g.month > group.month);
  if (index === -1) {
    floor.push(group);
  } else {
    floor.splice(index, 0, group);
  }
}

/** 낱장을 바닥에 놓는다. 같은 월 낱장이 있으면 합친다(3장이 되면 호출자가 무더기 종류를 정한다). */
export function placeLoose(floor: DraftGroup[], id: CardId): DraftGroup {
  const month = monthOf(id);
  const group = findGroup(floor, month);
  if (group !== undefined) {
    group.cards.push(id);
    return group;
  }
  const created: DraftGroup = { month, cards: [id], kind: 'loose', owner: null };
  insertSorted(floor, created);
  return created;
}

export function placeGroup(floor: DraftGroup[], group: DraftGroup): void {
  removeGroup(floor, group.month);
  insertSorted(floor, group);
}

export function removeGroup(floor: DraftGroup[], month: Month): DraftGroup | undefined {
  const index = floor.findIndex((g) => g.month === month);
  if (index === -1) {
    return undefined;
  }
  const [group] = floor.splice(index, 1);
  return group;
}

/** 낱장 무더기에서 카드 한 장을 뺀다. 비면 무더기를 없앤다. */
export function removeLooseCard(floor: DraftGroup[], id: CardId): void {
  const group = findGroup(floor, monthOf(id));
  if (group === undefined || !group.cards.includes(id)) {
    throw new Error(`바닥에 없는 카드: ${id}`);
  }
  group.cards = group.cards.filter((c) => c !== id);
  if (group.cards.length === 0) {
    removeGroup(floor, group.month);
  }
}

/** 분배 직후처럼 낱장 목록으로 바닥을 만든다. 같은 월 3장은 자연뻑 무더기. */
export function buildFloor(ids: readonly CardId[]): DraftGroup[] {
  const floor: DraftGroup[] = [];
  for (const id of ids) {
    const group = placeLoose(floor, id);
    if (group.cards.length >= 3) {
      group.kind = 'natural';
    }
  }
  return floor;
}
