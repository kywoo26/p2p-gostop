// 규칙 벡터 G1-auto-stop-last-card의 공개 카드 배치. 수동 스톱은 손패 1장만 더 둔다.
import { PRESETS, type Seat } from '@p2p-gostop/engine';
import { createScenario } from '@p2p-gostop/engine/testing';
import { createSession, type SessionState } from './session.ts';

export function resultScenario(manual = false, winner: Seat = 0): SessionState {
  const session = createSession({
    preset: 'arcade',
    rules: PRESETS.arcade,
    perPoint: 100,
    startBalance: 1_000_000,
    names: ['나', '컴퓨터'],
    seed: 1,
  }).session;
  const hand = manual ? [16, 30] : [16];
  // 11쌍피·12쌍피·1~4월 피 각2·6피a·B2b (벡터와 같은 16피).
  const captured = [43, 47, 2, 3, 6, 7, 10, 11, 14, 15, 22, 49];
  return {
    ...session,
    game: createScenario({
      rules: { ...PRESETS.arcade, push: true },
      hands: winner === 0 ? [hand, [37, 38]] : [[37, 38], hand],
      floor: [18, 33],
      deck: [24],
      turn: winner,
      captured: winner === 0 ? [captured, []] : [[], captured],
      seats: winner === 0 ? [{ turnsTaken: 3 }, {}] : [{}, { turnsTaken: 3 }],
    }),
  };
}
