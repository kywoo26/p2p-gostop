import { cardId, playerView, reduce, type Action, type GameState } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import type { BoardView } from '@p2p-gostop/protocol';
import { expect, test } from 'vitest';
import { toBoardView } from './adapter.ts';
import { AutoChoice, automaticAction } from './controller.ts';

const c = cardId;

function board(state: GameState, viewer: 0 | 1 = 0): BoardView {
  return toBoardView(playerView(state, viewer), { names: ['나', '상대'], balances: [1000, 1000] });
}

function target(source: 'play' | 'flip', floor: readonly number[]): BoardView {
  const played = c(source === 'play' ? '8광' : '5열');
  const state = createScenario({
    hands: [[played], [c('10열')]],
    floor,
    deck: [c(source === 'play' ? '12비광' : '8고'), c('10청')],
  });
  const step = reduce(state, { type: 'play', seat: 0, card: played });
  if (!step.ok) throw new Error(step.message);
  return board(step.state);
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 15));

test.each(['play', 'flip'] as const)(
  'C01 %s 동등 대상은 작은 ID를 고르고 다른 가치는 묻는다',
  (source) => {
    expect(automaticAction(target(source, [c('8피b'), c('8피a')]))).toEqual({
      type: 'chooseTarget',
      seat: 0,
      card: c('8피a'),
    });
    expect(
      automaticAction(target(source, [c(source === 'play' ? '8고' : '8광'), c('8피a')])),
    ).toBeNull();
  },
);

test('C02 유일한 일반 내기만 진행하고 결정·폭탄 대안은 남긴다', () => {
  const one = board(createScenario({ hands: [[c('5열')], [c('10열')]], floor: [c('8광')] }));
  expect(automaticAction(one)).toEqual({ type: 'play', seat: 0, card: c('5열') });
  const extra = board(
    createScenario({
      hands: [[c('5열')], [c('10열')]],
      floor: [c('8광')],
      seats: [{ bombTokens: 1 }, {}],
    }),
  );
  expect(automaticAction(extra)).toBeNull();
  expect(
    automaticAction({
      ...one,
      pending: { kind: 'goStop', seat: 0, score: 7, goCount: 0, stopAmount: 0 },
    }),
  ).toBeNull();
});

test('U14 보류·최신 뷰 재판정·같은 eventSeq 재접속 중복 전송 0', async () => {
  const first = board(createScenario({ hands: [[c('5열')], [c('10열')]], floor: [c('8광')] }));
  const second = board(createScenario({ hands: [[c('6열')], [c('10열')]], floor: [c('8광')] }));
  let current = first;
  const sent: Action[] = [];
  const choice = new AutoChoice(
    () => ({ view: current, ready: true }),
    (action) => {
      sent.push(action);
      return true;
    },
  );
  choice.advance(false);
  choice.advance(true);
  await settle();
  expect(sent).toEqual([]);
  choice.advance(false);
  current = second;
  await settle();
  expect(sent).toEqual([]);
  choice.advance(false);
  await settle();
  expect(sent).toEqual([{ type: 'play', seat: 0, card: c('6열') }]);
  choice.advance(false); // 같은 권위 뷰를 재수신해도 재전송하지 않는다.
  await settle();
  expect(sent).toHaveLength(1);
  choice.dispose();
});
