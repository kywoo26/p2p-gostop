import { cardId, guaranteedCaptures, playerView } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { expect, test } from 'vitest';
import { toBoardView } from './adapter.ts';
import {
  displayedHintLevel,
  handAssist,
  handAssistPlayer,
  hintLevelOf,
  HintResultGate,
  projectAssistView,
} from './assist.ts';

const c = cardId;
test('설정 필드 합류 전에는 기본, 명시된 로컬 단계는 그대로 읽는다 (#80)', () => {
  expect(hintLevelOf({})).toBe('basic');
  expect(hintLevelOf({ hintLevel: 'off' })).toBe('off');
  expect(hintLevelOf({ hintLevel: 'detail' })).toBe('detail');
  expect(hintLevelOf({ hintLevel: 'invalid' })).toBe('basic');
});
const makeBoard = (revealed: readonly number[] = []) => {
  const state = createScenario({
    hands: [[c('8광')], [c('8피b')]],
    floor: [c('8피a')],
    deck: [c('5열')],
    seats: [{}, { revealed }],
  });
  return toBoardView(playerView(state, 0), { names: ['나', '상대'], balances: [1000, 1000] });
};

test('기본·상세는 같은 공개 매칭을 쓰고 끔은 표식이 없다 (FR-46~48)', () => {
  const board = makeBoard();
  expect(handAssist(board, 'off').secured).toEqual([]);
  expect(handAssist(board, 'basic')).toEqual(handAssist(board, 'detail'));
  expect(handAssist(board, 'basic').matchable).toContain(c('8광'));
  expect(projectAssistView(board)?.seats[1].hand).toBeNull();
  const { revealed: _revealed, ...withoutRevealed } = board.seats[0];
  expect(
    handAssist({ ...board, seats: [withoutRevealed, board.seats[1]] }, 'basic').available,
  ).toBe(false);
});

test('자기 공개 손패의 같은 달 네 장은 총통 후보로 묶는다 (#114/#115)', () => {
  const board = makeBoard();
  const withFour = {
    ...board,
    seats: [{ ...board.seats[0], hand: [0, 1, 2, 3] }, board.seats[1]] as typeof board.seats,
  };
  expect(handAssist(withFour, 'basic').groups).toContainEqual({
    id: 'chongtong-1',
    kind: 'chongtong',
    cards: [0, 1, 2, 3],
  });
  expect(handAssist(withFour, 'off').groups).toEqual([]);
});

test('폭탄은 자기 합법 수와 손패만으로 묶는다 (#115)', () => {
  const board = makeBoard();
  const candidate = {
    ...board,
    legal: [{ type: 'bomb', seat: 0, month: 1 }] as const,
    seats: [{ ...board.seats[0], hand: [0, 1, 2] }, board.seats[1]] as typeof board.seats,
  };
  expect(handAssist(candidate, 'basic').groups).toContainEqual({
    id: 'bomb-1',
    kind: 'bomb',
    cards: [0, 1, 2],
  });
  expect(handAssist({ ...candidate, legal: [] }, 'basic').groups).toEqual([]);
});

test('상대 공개 손패가 같은 월이면 확정으로 올리지 않는다 (C05/CF09)', () => {
  const board = makeBoard([c('8피b')]);
  const result = handAssist(board, 'basic');
  expect(result.secured).toEqual([]);
  expect(result.matchable).toContain(c('8광'));
});

test('같은 월의 남은 두 장이 공개 획득패이면 확정이다 (C05/CF01)', () => {
  const state = createScenario({
    hands: [[c('8광')], [c('10열')]],
    floor: [c('8피a')],
    captured: [[c('8고'), c('8피b')], []],
  });
  const board = toBoardView(playerView(state, 0), {
    names: ['나', '상대'],
    balances: [1000, 1000],
  });
  expect(handAssist(board, 'basic').secured).toEqual([c('8광')]);
});

test('숨은 상대 손패와 더미 배치가 바뀌어도 공개 보조는 같다 (FR-47)', () => {
  const visible = {
    hands: [[c('8광')], [c('10열')]] as const,
    floor: [c('8피a')],
    deck: [c('11광')],
  };
  const first = createScenario(visible);
  const second = createScenario({
    ...visible,
    hands: [[c('8광')], [c('11광')]],
    deck: [c('10열')],
  });
  const meta = { names: ['나', '상대'] as const, balances: [1000, 1000] as const };
  expect(handAssist(toBoardView(playerView(first, 0), meta), 'basic')).toEqual(
    handAssist(toBoardView(playerView(second, 0), meta), 'basic'),
  );
});

test('두 좌석에서 BoardView 공개 투영과 PlayerView 확정 분류가 같다 (FR-47/C05)', () => {
  for (const viewer of [0, 1] as const) {
    const hands = viewer === 0 ? [[c('8광')], [c('10열')]] : [[c('10열')], [c('8광')]];
    const state = createScenario({
      hands: hands as [number[], number[]],
      floor: [c('8피a')],
      captured: [[c('8고'), c('8피b')], []],
      turn: viewer,
    });
    const view = playerView(state, viewer);
    const board = toBoardView(view, { names: ['좌석0', '좌석1'], balances: [1000, 1000] });
    expect(handAssistPlayer(view, 'basic')).toEqual(handAssist(board, 'basic'));
    expect(guaranteedCaptures(projectAssistView(board)!)).toEqual(guaranteedCaptures(view));
    expect(handAssist(board, 'basic').secured).toEqual(
      guaranteedCaptures(view)
        .filter((item) => item.certainty === 'guaranteed')
        .map((item) => item.card),
    );
  }
});

test('계산 중 끄기·새 계산은 늦은 반환을 폐기한다 (FR-46)', async () => {
  const gate = new HintResultGate();
  let resolve!: (value: number) => void;
  let level: 'off' | 'basic' = 'basic';
  const pending = gate.compute(
    'basic',
    () =>
      new Promise<number>((done) => {
        resolve = done;
      }),
    () => level,
  );
  level = 'off';
  gate.invalidate();
  resolve(1);
  expect(await pending).toBeNull();
  expect(
    await gate.compute(
      'basic',
      async () => 2,
      () => 'basic',
    ),
  ).toBe(2);
});

test('실제 표시만 기록하고 사용 단계는 내려가지 않는다 (FR-50 경로)', () => {
  expect(displayedHintLevel('off', 'basic', false)).toBe('off');
  expect(displayedHintLevel('off', 'basic', true)).toBe('basic');
  expect(displayedHintLevel('detail', 'off', false)).toBe('detail');
});
