// MN-05·NP-03, plan §1.3/1.4: 1287e7f에서 생성한 저장본의 복원·재저장 계약.
import { createMemoryTransportPair } from '@p2p-gostop/protocol';
import { expect, onTestFinished, test, vi } from 'vitest';
import legacy from './fixtures/host-v2-legacy-settled.json';
import decision from './fixtures/host-v2-push-decision.json';
import { clearHostSave, HostGame, loadHostSave, type HostSave } from './host.svelte.ts';

function restore(fixture: unknown): HostGame {
  const saved = fixture as HostSave;
  clearHostSave();
  onTestFinished(clearHostSave);
  const [transport] = createMemoryTransportPair();
  const host = new HostGame({
    config: saved.config,
    resume: saved,
    transport,
    clock: false,
    now: () => 0,
  });
  onTestFinished(() => host.dispose());
  expect(host.resumeSaved()).toBe(true);
  return host;
}

test.each([
  { name: 'pushes/lastAbort 없는 기존 v2', saved: legacy, pending: false },
  { name: '밀기 결정 보류 v2', saved: decision, pending: true },
])('$name: 원장·기록·순번을 보존하고 정산을 중복 지급하지 않는다', ({ saved, pending }) => {
  const host = restore(saved);
  expect(loadHostSave()?.state.seq).toBe(saved.state.seq);
  expect(host.stats.balances).toEqual(saved.state.ledger.balances);
  expect(host.records).toEqual(saved.records);
  expect(host.pushDecision !== null).toBe(pending);
  expect(host.playback.settlement !== null).toBe(!pending);
  expect(host.playback.board.seats[1].hand).toBeNull();
  expect(loadHostSave()).toEqual({
    ...saved,
    state: { ...saved.state, pushes: 0, lastAbort: null, rev: saved.state.rev + 1 },
  });
  host.tick();
  expect(host.records).toEqual(saved.records);
  expect(loadHostSave()?.state.ledger).toEqual(saved.state.ledger);
});

test('실패한 저장은 같은 rev/seq여도 재시도하고 성공 뒤 중복 쓰기를 멈춘다', () => {
  const setItem = Storage.prototype.setItem;
  let attempts = 0;
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    attempts++;
    if (attempts === 1) throw new DOMException('quota', 'QuotaExceededError');
    setItem.call(this, key, value);
  });
  onTestFinished(() => write.mockRestore());
  const host = restore(legacy);
  expect(loadHostSave()).toBeNull();
  host.tick();
  expect(loadHostSave()?.state.ledger).toEqual(legacy.state.ledger);
  host.tick();
  expect(attempts).toBe(2);
});

test('미지원 envelope는 읽지 않고 명시적 삭제 전까지 원문을 남긴다', () => {
  clearHostSave();
  onTestFinished(clearHostSave);
  const raw = JSON.stringify({ ...legacy, version: 99 });
  localStorage.setItem('gostop.host.v2', raw);
  expect(loadHostSave()).toBeNull();
  expect(localStorage.getItem('gostop.host.v2')).toBe(raw);
});
