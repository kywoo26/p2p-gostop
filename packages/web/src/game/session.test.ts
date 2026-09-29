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
  const { refilled: _refilled, hintUsage: _hintUsage, ...old } = original;
  const migrated = parseSession({ ...old, version: 0 });
  expect(migrated?.config.seed).toBe(1234);
  expect(migrated?.roundNumber).toBe(1);
  expect(migrated?.ledger.balances).toEqual([10000, 10000]);
  expect(migrated?.refilled).toEqual([0, 0]);
  expect(migrated?.hintUsage).toBeUndefined();
});

test('현재 판의 힌트 사용은 복원하고 옛 판 기록의 필드 부재는 미확인으로 남긴다 (FR-50)', () => {
  const saved = parseSession({ ...original, hintUsage: 'basic' });
  expect(saved?.hintUsage).toBe('basic');
  const old = parseSession({ ...original, hintUsage: undefined });
  expect(old?.hintUsage).toBeUndefined();
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

test('구문이 정상이어도 필수 중첩 필드가 없으면 복원하지 않는다 (MN-05, NF-05)', () => {
  const { firstPick: _firstPick, ...gameWithoutPick } = original.game;
  expect(parseSession({ ...original, game: gameWithoutPick })).toBeNull();
  expect(parseSession({ ...original, game: { ...original.game, firstPick: null } })).toBeNull();
  expect(
    parseSession({ ...original, game: { ...original.game, firstPick: { pool: [] } } }),
  ).toBeNull();
  expect(
    parseSession({ ...original, game: { ...original.game, pending: { kind: 'pickFirst' } } }),
  ).toBeNull();
  expect(
    parseSession({
      ...original,
      game: {
        ...original.game,
        seats: [{ ...original.game.seats[0], score: null }, original.game.seats[1]],
      },
    }),
  ).toBeNull();
  expect(parseSession({ ...original, game: { ...original.game, ctx: { seat: 0 } } })).toBeNull();
  expect(parseSession({ ...original, ledger: { ...original.ledger, entries: [{}] } })).toBeNull();
  expect(parseSession({ ...original, records: [{ round: 1 }] })).toBeNull();
});
