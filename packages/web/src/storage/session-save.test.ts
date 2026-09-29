import { afterEach, expect, test, vi } from 'vitest';
import { PRESETS, type RuleOptions } from '@p2p-gostop/engine';
import { acceptRound, createSession, parseSession, startNextRound } from '../game/session.ts';
import { SoloSession } from '../game/solo.svelte.ts';
import { RULE_FIELDS } from '../settings/rule-options.ts';
import { readJson, STORAGE_KEYS, writeJson } from './local.ts';
import legacy from './fixtures/solo-v0-balanced.json';
import playing from './fixtures/solo-v1-playing.json';
import pending from './fixtures/solo-v1-push-decision.json';
import pushed from './fixtures/solo-v1-pushed.json';
import refilled from './fixtures/solo-v1-refilled.json';

afterEach(() => {
  vi.restoreAllMocks();
  SoloSession.clearSaved();
});

test.each(
  RULE_FIELDS.flatMap((field) =>
    field.choices
      .filter((choice) => !choice.disabled)
      .map((choice) => [field.key, JSON.stringify(choice.value), choice.value] as const),
  ),
)('활성 규칙 %s=%s는 JSON 저장 뒤 솔로 세션으로 복원된다 (FR-21, MN-05)', (key, _label, value) => {
  const rules = { ...PRESETS.standard, [key]: value } as RuleOptions;
  const session = createSession({
    preset: 'standard',
    rules,
    perPoint: 100,
    startBalance: 10000,
    names: ['나', '컴퓨터'],
    seed: 1234,
  }).session;
  const restored = parseSession(JSON.parse(JSON.stringify(session)) as unknown);
  expect(restored?.config.rules).toEqual(rules);
  expect(restored?.game.rules).toEqual(rules);
});

test('나가리 상한 없음은 v0·v1에서 복원하고 손상 값은 거부한다 (MN-05)', () => {
  const rules = { ...PRESETS.standard, nagariCap: null };
  const session = createSession({
    preset: 'standard',
    rules,
    perPoint: 100,
    startBalance: 10000,
    names: ['나', '컴퓨터'],
    seed: 1234,
  }).session;
  const raw = JSON.parse(JSON.stringify(session)) as typeof session;
  expect(parseSession(raw)?.config.rules.nagariCap).toBeNull();
  const { refilled: _refilled, ...old } = raw;
  expect(parseSession({ ...old, version: 0 })?.config.rules.nagariCap).toBeNull();
  for (const bad of ['unlimited', undefined]) {
    const broken = {
      ...raw,
      config: { ...raw.config, rules: { ...raw.config.rules, nagariCap: bad } },
      game: { ...raw.game, rules: { ...raw.game.rules, nagariCap: bad } },
    };
    expect(parseSession(broken)).toBeNull();
  }
});

test.each([
  ['v0', legacy],
  ['진행 중', playing],
  ['밀기 결정', pending],
  ['밀기 완료', pushed],
  ['재충전', refilled],
])('%s fixture는 보완 후 재저장해도 원장·시드·판 기록을 보존한다 (MN-05)', (_name, fixture) => {
  expect(writeJson(STORAGE_KEYS.soloSession, fixture)).toBe(true);
  const loaded = SoloSession.loadResult();
  expect(loaded.error).toBeNull();
  expect(loaded.save).not.toBeNull();
  const expected =
    fixture.session.version === 0
      ? {
          ...fixture.session,
          version: 1,
          refilled: [0, 0],
          roundStart: fixture.session.ledger.balances,
        }
      : fixture.session;
  expect(loaded.save).toEqual({ version: 1, difficulty: 'normal', session: expected });
  expect(writeJson(STORAGE_KEYS.soloSession, loaded.save)).toBe(true);
  expect(SoloSession.loadResult()).toEqual(loaded);
});

test('v0의 잔액 합이 초기값과 다르면 보완하지 않는다 (MN-05)', () => {
  const bad = structuredClone(legacy);
  bad.session.ledger.balances[0] = 0;
  expect(parseSession(bad.session)).toBeNull();
});

test('밀기 결정은 미정산으로 복원하고 받기를 한 번만 적용한다 (FR-18, MN-05)', () => {
  const state = parseSession(pending.session);
  expect(state).not.toBeNull();
  if (state === null) return;
  expect(state.phase).toBe('pushDecision');
  expect(state.records).toHaveLength(0);
  const accepted = acceptRound(state);
  expect(accepted.records).toHaveLength(1);
  expect(acceptRound(accepted)).toEqual(accepted);
});

test('옛 v0/v1 저장을 복원해 정산해도 힌트 이력은 미확인으로 남는다 (FR-50, #150)', () => {
  const { refilled: _refilled, roundStart: _roundStart, ...legacyBody } = pending.session;
  for (const raw of [pending.session, { ...legacyBody, version: 0 }]) {
    const restored = parseSession(raw);
    expect(restored).not.toBeNull();
    if (restored === null) continue;
    expect(restored.phase).toBe('pushDecision');
    expect(Object.hasOwn(restored, 'hintUsage')).toBe(false);
    const settled = acceptRound(restored);
    expect(settled.phase).toBe('roundOver');
    expect(settled.records).toHaveLength(1);
    const record = settled.records[0];
    if (record === undefined) throw new Error('정산 기록이 없습니다');
    expect(Object.hasOwn(record, 'hintUsage')).toBe(false);
  }
});

test('새 판의 명시적 off와 실제 basic 사용은 정산 기록에 구별해 남긴다 (FR-50)', () => {
  for (const hintUsage of ['off', 'basic'] as const) {
    const restored = parseSession({ ...pending.session, hintUsage });
    expect(restored).not.toBeNull();
    if (restored === null) continue;
    expect(acceptRound(restored).records[0]?.hintUsage).toBe(hintUsage);
  }
});

test('밀기 완료 저장에서 다음 판을 열면 배수·원장을 이어간다 (FR-18, MN-05)', () => {
  const state = parseSession(pushed.session);
  expect(state).not.toBeNull();
  if (state === null) return;
  const next = startNextRound(state).session;
  expect(next.game.round.pushes).toBe(1);
  expect(next.roundNumber).toBe(2);
  expect(next.ledger).toEqual(state.ledger);
  expect(next.records).toEqual(state.records);
});

test('v1은 추가 필드를 제거하거나 규칙을 정규화하지 않는다 (MN-05)', () => {
  const raw = { ...structuredClone(playing.session), future: { keep: true } };
  expect(parseSession(raw)).toBe(raw);
  expect(parseSession({ ...raw, version: 99 })).toBeNull();
});

test.each([
  'game.firstPick',
  'game.seats.0.score.total',
  'game.pending.seats',
  'game.rng',
  'game.round.fixedDeck',
  'config.rules.bonusSteal',
  'ledger.entries',
])('필수 필드 %s가 빠진 저장은 거부한다 (MN-05, NF-05)', (path) => {
  const raw = structuredClone(legacy.session) as unknown as Record<string, unknown>;
  let parent = raw;
  const keys = path.split('.');
  for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  delete parent[keys.at(-1)!];
  expect(parseSession(raw)).toBeNull();
});

test.each([
  [
    'JSON 구문',
    '{',
    '저장된 세션을 읽을 수 없습니다. 저장소 접근 또는 데이터 형식을 확인해 주세요.',
  ],
  ['null', 'null', '저장된 세션 데이터가 손상되었습니다.'],
  ['배열', '[]', '저장된 세션 데이터가 손상되었거나 지원하지 않는 형식입니다.'],
  [
    '미지원 버전',
    JSON.stringify({ ...playing, version: 99 }),
    '저장된 세션 데이터가 손상되었거나 지원하지 않는 형식입니다.',
  ],
  [
    '난이도',
    JSON.stringify({ ...playing, difficulty: 'unknown' }),
    '저장된 난이도 정보가 손상되었습니다.',
  ],
])('손상 저장의 오류 분류를 보존한다: %s (MN-05)', (_name, raw, error) => {
  localStorage.setItem(STORAGE_KEYS.soloSession, raw);
  expect(SoloSession.loadResult()).toEqual({ save: null, error });
  expect(localStorage.getItem(STORAGE_KEYS.soloSession)).toBe(raw);
});

test('미저장·저장소 접근 거부·quota 실패는 구분하고 기존 데이터를 보존한다 (MN-05)', () => {
  SoloSession.clearSaved();
  expect(SoloSession.loadResult()).toEqual({ save: null, error: null });
  writeJson(STORAGE_KEYS.soloSession, playing);
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
  expect(SoloSession.loadResult().error).toBe(
    '저장된 세션을 읽을 수 없습니다. 저장소 접근 또는 데이터 형식을 확인해 주세요.',
  );
  expect(readJson(STORAGE_KEYS.soloSession)).toBeNull();
  get.mockRestore();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  expect(writeJson(STORAGE_KEYS.soloSession, pending)).toBe(false);
  expect(SoloSession.load()?.session).toEqual(playing.session);
});
