// FR-41·46~48 / UX-H05·UX-A01: 실제 엔진 공개 뷰의 전후 시각 비교용. 판정 기대값은 기존 CF 벡터를 따른다.
import { PRESETS, type GameState } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { createSession } from '../src/game/session.ts';

function cueGame(): GameState {
  return createScenario({
    hands: [
      [0, 1, 2, 8, 9, 10, 24, 32, 36, 44],
      [4, 12, 16, 20, 28, 40, 48, 49, 50, 38],
    ],
    floor: [3, 25, 33, 45],
    captured: [[26, 27], []],
  });
}

export function cueSave(game = cueGame()) {
  const base = createSession({
    preset: 'standard',
    rules: PRESETS.standard,
    perPoint: 100,
    startBalance: 10_000,
    names: ['나', '상대'],
    seed: 77,
  }).session;
  return { version: 1, difficulty: 'easy', session: { ...base, game } };
}
