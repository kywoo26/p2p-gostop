// PA-06: 족보는 획득 이동이 아닌 엔진 점수 확정 뒤에만 표시한다.
import { cardId, playerView, reduce, scoreCaptured, type GameState } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { expect, test, vi } from 'vitest';
import { fixtures } from '../lib/fixtures.ts';
import { Playback } from './playback.svelte.ts';
import { toBoardView } from './adapter.ts';
import { sounds } from './sound.ts';

function boardOf(state: GameState) {
  return toBoardView(playerView(state, 0), { names: ['나', '상대'], balances: [100_000, 100_000] });
}

test('실제 엔진 턴은 획득 재생 중 알리지 않고 ScoreChanged 뒤 홍단을 알린다', async () => {
  const state = createScenario({
    hands: [
      [cardId('3홍'), cardId('12열')],
      [cardId('10청'), cardId('10피b')],
    ],
    floor: [cardId('3피a'), cardId('8피a')],
    deck: [cardId('4피a')],
    captured: [[cardId('1홍'), cardId('2홍')], []],
  });
  const result = reduce(state, { type: 'play', seat: 0, card: cardId('3홍') });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.events.findIndex((event) => event.type === 'Captured')).toBeLessThan(
    result.events.findIndex((event) => event.type === 'ScoreChanged'),
  );
  const pb = new Playback(boardOf(state), { viewer: 0, names: () => ['나', '상대'] });
  const root = document.createElement('div');
  document.body.append(root);
  const prior = document.documentElement.dataset['speed'];
  document.documentElement.dataset['speed'] = 'instant';
  let captures = 0;
  const sound = vi.spyOn(sounds, 'play').mockImplementation((kind) => {
    if (kind === 'capture') {
      captures += 1;
      expect(pb.milestones).toEqual([]);
    }
  });
  try {
    pb.attach(root);
    pb.enqueue(result.events, boardOf(result.state));
    await vi.waitFor(() => expect(pb.idle).toBe(true));
    expect(captures).toBeGreaterThan(0);
    expect(pb.milestones.map((item) => item.text)).toEqual(['홍단']);
  } finally {
    sound.mockRestore();
    pb.dispose();
    root.remove();
    if (prior === undefined) delete document.documentElement.dataset['speed'];
    else document.documentElement.dataset['speed'] = prior;
  }
});

test('국진 자동 위치 경계는 실제 ScoreChanged의 위치와 점수에 맞춘다', async () => {
  const state = createScenario({
    hands: [
      [cardId('11피b'), cardId('12열')],
      [cardId('10청'), cardId('10피b')],
    ],
    floor: [cardId('11피a'), cardId('8피a')],
    deck: [cardId('10피a')],
    captured: [
      [
        '1광',
        '3광',
        '8광',
        '1홍',
        '2홍',
        '4초',
        '5초',
        '6청',
        '9청',
        '9국진',
        '5열',
        '6열',
        '7열',
        '10열',
        '1피a',
        '1피b',
        '2피a',
        '2피b',
        '3피a',
        '3피b',
        '4피a',
      ].map(cardId),
      [],
    ],
    seats: [{ turnsTaken: 3 }, {}],
  });
  const result = reduce(state, { type: 'play', seat: 0, card: cardId('11피b') });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const score = result.events.find((event) => event.type === 'ScoreChanged' && event.seat === 0);
  expect(score?.type === 'ScoreChanged' ? score.breakdown : null).toMatchObject({
    gukjinAsPi: true,
    total: 7,
    yeol: 0,
    pi: 2,
  });
  const pb = new Playback(boardOf(state), { viewer: 0, names: () => ['나', '상대'] });
  pb.enqueue(
    [{ type: 'ScoreChanged', seq: 0, seat: 0, cards: [], breakdown: state.seats[0].score }],
    boardOf(state),
  );
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  pb.enqueue(result.events, boardOf(result.state));
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(pb.board.seats[0].gukjinAsPi).toBe(true);
  expect(pb.milestones).toEqual([]);
  pb.dispose();
});

test('Captured 뒤 ScoreChanged에서만 완료하고 국진 자동 위치의 확정 점수를 따른다', async () => {
  const original = fixtures.board.states.play;
  const empty = { gwang: [], yeol: [], tti: [], pi: [] };
  const board = {
    ...original,
    seats: [
      { ...original.seats[0], score: 0, captured: empty },
      { ...original.seats[1], score: 0, captured: empty },
    ] as typeof original.seats,
  };
  const pb = new Playback(board, { viewer: 0, names: () => ['나', '상대'] });
  pb.enqueue([{ type: 'Captured', seq: 1, seat: 0, cards: [32], to: 0 }], board);
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(pb.milestones).toEqual([]);

  const zero = scoreCaptured(empty, false);
  pb.enqueue(
    [
      {
        type: 'ScoreChanged',
        seq: 2,
        seat: 0,
        cards: [],
        breakdown: { ...zero, pi: 1, gukjinAsPi: true },
      },
    ],
    board,
  );
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(pb.milestones).toEqual([]);

  pb.enqueue(
    [
      {
        type: 'ScoreChanged',
        seq: 3,
        seat: 0,
        cards: [],
        breakdown: { ...zero, godori: 5, gukjinAsPi: false },
      },
    ],
    board,
  );
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(pb.milestones.map((item) => item.text)).toEqual(['고도리']);
  pb.enqueue(
    [
      {
        type: 'ScoreChanged',
        seq: 4,
        seat: 0,
        cards: [],
        breakdown: { ...zero, godori: 5, hongdan: 3, gukjinAsPi: false },
      },
      {
        type: 'ScoreChanged',
        seq: 5,
        seat: 0,
        cards: [],
        breakdown: { ...zero, godori: 5, hongdan: 3, chodan: 3, gukjinAsPi: false },
      },
    ],
    board,
  );
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(pb.milestones.map((item) => item.text)).toEqual(['고도리', '홍단', '초단']);
  pb.reset({ ...board, round: board.round + 1 });
  expect(pb.milestones).toEqual([]);
  pb.dispose();
});
