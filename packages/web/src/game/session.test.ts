import { PRESETS } from '@p2p-gostop/engine';
import { expect, test } from 'vitest';
import { createSession, parseSession } from './session.ts';

const original = createSession({
  preset: 'standard',
  rules: PRESETS.standard,
  perPoint: 100,
  startBalance: 10000,
  names: ['나', '컴퓨터'],
  seed: 1234,
}).session;

test('정상 저장과 재충전 전 v0 저장을 읽되 시드·판·잔액을 보존한다 (MN-05)', () => {
  expect(parseSession(original)).toEqual(original);
  const { refilled: _refilled, ...old } = original;
  const migrated = parseSession({ ...old, version: 0 });
  expect(migrated?.config.seed).toBe(1234);
  expect(migrated?.roundNumber).toBe(1);
  expect(migrated?.ledger.balances).toEqual([10000, 10000]);
  expect(migrated?.refilled).toEqual([0, 0]);
});

test('손상된 게임판·원장·미지원 옛 형식은 복원하지 않는다 (MN-05, NF-05)', () => {
  expect(parseSession({ ...original, game: { ...original.game, seats: [] } })).toBeNull();
  expect(
    parseSession({ ...original, ledger: { ...original.ledger, balances: [1, 2] } }),
  ).toBeNull();
  expect(
    parseSession({
      ...original,
      version: 0,
      refilled: undefined,
      ledger: { ...original.ledger, balances: [0, 0] },
    }),
  ).toBeNull();
  expect(parseSession({ ...original, version: 99 })).toBeNull();
});
