// 사람이 읽는 카드 이름 (규칙 벡터·로그·디버그용). 상태에는 여전히 ID만 둔다.
// 이름 규칙: 월 숫자 + 종류(광/고=고도리 열끗/열/국진/홍/청/초/비띠/피a/피b/쌍피), 보너스는 B2a·B2b·B3.
import { CARDS, type CardId } from './cards.ts';

const MONTH_NAMES: readonly (readonly [string, string, string, string])[] = [
  ['1광', '1홍', '1피a', '1피b'],
  ['2고', '2홍', '2피a', '2피b'],
  ['3광', '3홍', '3피a', '3피b'],
  ['4고', '4초', '4피a', '4피b'],
  ['5열', '5초', '5피a', '5피b'],
  ['6열', '6청', '6피a', '6피b'],
  ['7열', '7초', '7피a', '7피b'],
  ['8광', '8고', '8피a', '8피b'],
  ['9국진', '9청', '9피a', '9피b'],
  ['10열', '10청', '10피a', '10피b'],
  ['11광', '11피a', '11피b', '11쌍피'],
  ['12비광', '12열', '12비띠', '12쌍피'],
];

/** ID 순서의 카드 이름 51개 */
export const CARD_NAMES: readonly string[] = Object.freeze([
  ...MONTH_NAMES.flat(),
  'B2a',
  'B2b',
  'B3',
]);

const BY_NAME: ReadonlyMap<string, CardId> = new Map(CARD_NAMES.map((name, id) => [name, id]));

export function cardName(id: CardId): string {
  const name = CARD_NAMES[id];
  if (name === undefined || CARDS[id] === undefined) {
    throw new RangeError(`알 수 없는 카드 ID: ${id}`);
  }
  return name;
}

/** 이름 또는 숫자 ID를 카드 ID로 바꾼다. */
export function cardId(ref: string | number): CardId {
  if (typeof ref === 'number') {
    cardName(ref);
    return ref;
  }
  const id = BY_NAME.get(ref);
  if (id === undefined) {
    throw new RangeError(`알 수 없는 카드 이름: ${ref}`);
  }
  return id;
}
