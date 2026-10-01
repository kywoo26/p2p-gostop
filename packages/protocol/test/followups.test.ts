// #43·#29·#44: 공개 뷰, 밀기, 판 무효의 세션 계약.
import { describe, expect, it } from 'vitest';
import { assert, nat, property } from 'fast-check';
import { PRESETS, type Action } from '@p2p-gostop/engine';
import {
  GuestSession,
  HostSession,
  createMemoryTransportPair,
  decode,
  type HostSessionState,
} from '../src/index.ts';
import { Picker, secrets, viaJson } from './helpers.ts';

function setup(seed = 0, push = false) {
  const [hw, gw] = createMemoryTransportPair();
  const host = new HostSession(hw, {
    rules: { ...PRESETS.standard, push },
    names: ['호스트', '게스트'],
    random32: secrets(seed),
    startBalance: 1_000_000,
  });
  const guest = new GuestSession(gw, { name: '게스트', random32: secrets(seed + 5000) });
  guest.join();
  return { host, guest, hw, gw };
}

function move(host: HostSession, guest: GuestSession, picker: Picker): void {
  const mine = host.hostView()?.legal ?? [];
  const theirs = guest.view?.legal ?? [];
  const action: Action | undefined = picker.pick(mine.length > 0 ? mine : theirs);
  if (!action) throw new Error('합법 수 없음');
  if (action.seat === 0) {
    if (!host.apply(action)) throw new Error('호스트 합법 수 거부');
  } else guest.sendAction(action);
}

function finish(host: HostSession, guest: GuestSession, seed: number): void {
  const picker = new Picker(seed + 50);
  for (let i = 0; i < 400 && host.stage === 'playing'; i++) move(host, guest, picker);
  expect(host.stage).toBe('settled');
}

function pending(winner: 0 | 1) {
  for (let seed = 0; seed < 40; seed++) {
    const h = setup(seed, true);
    finish(h.host, h.guest, seed);
    if (h.host.state?.result?.winner === winner) return h;
  }
  throw new Error(`승자 ${winner} 판을 찾지 못함`);
}

function restoredPending(h: ReturnType<typeof setup>) {
  const savedHost: HostSessionState = viaJson(h.host.toJSON());
  const savedGuest = viaJson(h.guest.toJSON());
  const [hw, gw] = createMemoryTransportPair();
  const host = HostSession.fromJSON(hw, savedHost, { random32: secrets(900) });
  const guest = new GuestSession(gw, {
    name: '게스트',
    random32: secrets(901),
    restore: savedGuest,
  });
  guest.join();
  return { host, guest, hw, gw };
}

describe('#29 밀기 경로와 #43 정산 계약', () => {
  it('동기 전송에서 액션 복구가 끝나면 60초 동안 hello를 더 보내지 않는다 (NP-03·NF-05, #78)', () => {
    const h = setup(13);
    for (let step = 0; step < 100 && (h.guest.view?.legal.length ?? 0) === 0; step++) {
      const action = h.host.hostView()?.legal[0];
      if (action === undefined) throw new Error('게스트 차례에 도달하지 못함');
      expect(h.host.apply(action)).toBe(true);
    }
    const action = h.guest.view?.legal[0];
    if (action === undefined) throw new Error('게스트 합법 수 없음');
    h.guest.advanceTime(1_000);
    h.host.authenticated = false;
    const before = h.host.state;
    h.guest.sendAction(action);
    expect(h.host.state).toBe(before);
    h.guest.advanceTime(6_000); // join 안에서 welcome·snapshot·재전송 응답이 모두 끝난다
    expect(h.host.state).not.toBe(before);
    expect(h.guest.seq).toBe(h.host.seq);
    const helloCount = h.gw.sent.filter((m) => m.t === 'hello').length;
    for (const at of [11_000, 21_000, 41_000, 61_000, 66_000]) h.guest.advanceTime(at);
    expect(h.gw.sent.filter((m) => m.t === 'hello')).toHaveLength(helloCount);
  });

  it('정상 게스트 push의 응답은 감시를 끝내며 시간이 지나도 재인증하지 않는다', () => {
    const h = pending(1);
    h.guest.advanceTime(1_000);
    const helloCount = h.gw.sent.filter((m) => m.t === 'hello').length;
    h.guest.push();
    expect(h.host.settlement?.pushed).toBe(true);
    expect(h.guest.checks.at(-1)).toMatchObject({ round: 1, result: 'verified' });
    for (const at of [6_000, 11_000, 16_000, 61_000]) h.guest.advanceTime(at);
    expect(h.gw.sent.filter((m) => m.t === 'hello')).toHaveLength(helloCount);
    expect(h.gw.sent.filter((m) => m.t === 'push')).toHaveLength(1);
    expect(h.guest.errors.filter((code) => code === 'STALE_SEQ')).toEqual([]);
  });

  it('승자만 settled에서 밀고, 원장 정산은 보류되며 마지막 Settled를 써서 다음 판에 배수를 넘긴다', () => {
    const h = setup(7, true);
    finish(h.host, h.guest, 7);
    const winner = h.host.state?.result?.winner;
    expect(winner).not.toBeNull();
    expect(h.host.settlement).toBeNull();
    expect(h.guest.settlement).toBeNull();
    expect(h.host.ledger.entries.every((entry) => entry.kind !== 'round')).toBe(true);
    expect(h.host.apply({ type: 'push', seat: winner === 0 ? 1 : 0 })).toBe(false);
    if (winner === 0) {
      if (!h.host.push()) throw new Error('호스트 밀기 거부');
    } else h.guest.push();
    expect(h.host.settlement?.pushed).toBe(true);
    expect(h.host.settlement?.nextPushes).toBe(1);
    expect(h.guest.settlement?.pushed).toBe(true);
    expect(h.guest.settlement?.forfeitedPoints).toBeGreaterThan(0);
    expect(h.guest.checks.at(-1)).toMatchObject({ round: 1, result: 'verified' });
    expect(h.host.ledger.entries.every((entry) => entry.kind !== 'round')).toBe(true);
    expect(h.host.nextRound()).toBe(true);
    expect(h.host.state?.round.pushes).toBe(1);
    expect(h.guest.view?.pushes).toBe(1);
    expect(h.guest.view?.multiplier).toBeGreaterThanOrEqual(2);
    finish(h.host, h.guest, 11);
    expect(h.host.settlement).toBeNull();
    if (h.host.state?.result?.winner === 1) {
      if (h.host.nextRound()) throw new Error('게스트 선택 전 다음 판 시작');
      h.guest.requestNextRound();
    } else if (!h.host.acceptRound()) throw new Error('호스트 받기 거부');
    expect(h.host.settlement?.pushed).toBe(false);
    expect(h.guest.settlement?.steps.some((step) => step.origin === 'push')).toBe(true);
    expect(h.guest.checks.at(-1)).toMatchObject({ round: 2, result: 'verified' });
  });

  it('fast-check: 합법 밀기 메시지만 수락하고 push 액션의 여분 필드는 제거한다', () => {
    assert(
      property(nat({ max: 100_000 }), (seq) => {
        const parsed = decode(
          JSON.stringify({ t: 'action', seq, payload: { type: 'push', seat: 1, hidden: 32 } }),
          'guest',
        );
        expect(parsed.ok).toBe(true);
        expect(parsed.ok ? parsed.message : null).toEqual({
          t: 'action',
          seq,
          payload: { type: 'push', seat: 1 },
        });
        expect(decode(JSON.stringify({ t: 'push', seq }), 'guest').ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('게스트 승자의 push 메시지를 받는다', () => {
    let guestWin = false;
    for (let seed = 0; seed < 20 && !guestWin; seed++) {
      const h = setup(seed, true);
      finish(h.host, h.guest, seed);
      if (h.host.state?.result?.winner !== 1) continue;
      guestWin = true;
      if (h.host.nextRound()) throw new Error('게스트 선택 전 다음 판 시작');
      const seq = h.host.seq;
      const balances = h.host.ledger.balances;
      h.guest.sendAction({ type: 'push', seat: 0 });
      expect(h.guest.errors).toContain('ILLEGAL_ACTION');
      expect(h.host.seq).toBe(seq);
      h.guest.push();
      expect(h.host.seq).toBeGreaterThan(seq);
      expect(h.host.settlement?.pushed).toBe(true);
      expect(h.host.ledger.balances).toEqual(balances);
      expect(h.guest.checks.at(-1)).toMatchObject({ round: 1, result: 'verified' });
    }
    expect(guestWin).toBe(true);
  });

  it('패자 게스트의 push 메시지는 ILLEGAL_ACTION으로 거부한다', () => {
    let hostWin = false;
    for (let seed = 0; seed < 20 && !hostWin; seed++) {
      const h = setup(seed, true);
      finish(h.host, h.guest, seed);
      if (h.host.state?.result?.winner !== 0) continue;
      hostWin = true;
      h.guest.push();
      expect(h.guest.errors).toContain('ILLEGAL_ACTION');
      expect(h.host.settlement).toBeNull();
    }
    expect(hostWin).toBe(true);
  });

  it.each([
    { winner: 0 as const, choice: 'push' as const },
    { winner: 0 as const, choice: 'accept' as const },
    { winner: 1 as const, choice: 'push' as const },
    { winner: 1 as const, choice: 'accept' as const },
  ])('밀기 보류 저장·복원 후 승자 $winner의 $choice 선택', ({ winner, choice }) => {
    const h = restoredPending(pending(winner));
    expect(h.host.stage).toBe('settled');
    expect(h.host.state?.phase).toBe('end');
    expect(h.host.settlement).toBeNull();
    expect(h.host.settlementView).toBeNull();
    expect(h.host.ledger.entries.some((entry) => entry.kind === 'round')).toBe(false);
    let accepted = true;
    if (winner === 0 && choice === 'push') accepted = h.host.push();
    else if (winner === 0) accepted = h.host.acceptRound();
    else if (choice === 'push') h.guest.push();
    else h.guest.requestNextRound();
    expect(accepted).toBe(true);
    expect(h.host.settlement?.pushed).toBe(choice === 'push');
    expect(h.host.ledger.entries.some((entry) => entry.kind === 'round')).toBe(choice === 'accept');
    expect(h.guest.checks.at(-1)).toMatchObject({ round: 1, result: 'verified' });
    expect(h.host.nextRound()).toBe(true);
  });

  it('게스트 승자 부재 3분 뒤 호스트 대리 수락은 정산·검증을 끝낸다', () => {
    const h = pending(1);
    expect(h.host.acceptRound({ forSeat: 1, reason: 'absent' })).toBe(false);
    h.gw.disconnect();
    h.host.advanceTime(179_999);
    expect(h.host.acceptRound({ forSeat: 1, reason: 'absent' })).toBe(false);
    h.host.advanceTime(180_000);
    expect(h.host.acceptRound({ forSeat: 1, reason: 'absent' })).toBe(true);
    expect(h.host.ledger.entries.some((entry) => entry.kind === 'round')).toBe(true);
    h.gw.reconnect();
    h.guest.rejoin();
    expect(h.guest.checks.at(-1)).toMatchObject({ round: 1, result: 'verified' });
    expect(h.guest.errors).not.toContain('COMMIT_INVALID');
  });

  it('밀기 완료 뒤 저장·복원은 재발행된 마지막 Settled를 보존한다', () => {
    const original = pending(0);
    expect(original.host.push()).toBe(true);
    const settled = viaJson(original.host.ledger);
    const restored = restoredPending(original);
    expect(restored.host.settlement?.pushed).toBe(true);
    expect(restored.host.settlement?.forfeitedPoints).toBeGreaterThan(0);
    expect(restored.host.settlement?.nextPushes).toBe(1);
    expect(restored.host.ledger).toEqual(settled);
    expect(restored.host.nextRound()).toBe(true);
    expect(restored.host.state?.round.pushes).toBe(1);
  });

  it('밀기 보류에서 세션 종료는 먼저 정산과 revealHost를 보낸다', () => {
    const h = pending(1);
    h.gw.disconnect();
    h.host.end();
    expect(h.host.ledger.entries.some((entry) => entry.kind === 'round')).toBe(true);
    expect(h.host.stage).toBe('ended');
    const types = h.hw.sent.map((message) => message.t);
    expect(types.lastIndexOf('revealHost')).toBeGreaterThan(-1);
    expect(types.lastIndexOf('revealHost')).toBeLessThan(types.lastIndexOf('sessionEnd'));
    h.gw.reconnect();
    h.guest.rejoin();
    expect(h.guest.checks.at(-1)).toMatchObject({ round: 1, result: 'verified' });
    expect(h.guest.errors).not.toContain('COMMIT_INVALID');
  });
});

describe('#44 판 무효', () => {
  it('3분 부재의 turn만 무효로 하고 원장·선·이월을 보존하며 재접속 뒤 aborted로 기록한다', () => {
    const h = setup(10);
    const picker = new Picker(10);
    for (let i = 0; i < 30 && h.host.state?.phase !== 'turn'; i++) move(h.host, h.guest, picker);
    expect(h.host.state?.phase).toBe('turn');
    const before = viaJson(h.host.ledger);
    const dealer = h.host.dealer;
    const carry = h.host.carry;
    expect(h.host.abortRound('시간 초과')).toBe(false);
    h.gw.disconnect();
    h.host.advanceTime(179_999);
    expect(h.host.abortRound('시간 초과')).toBe(false);
    h.host.advanceTime(180_000);
    expect(h.host.abortRound('시간 초과')).toBe(true);
    expect(h.host.guestView()?.legal).toEqual([]);
    expect(h.host.guestView()?.playable).toEqual([]);
    expect(h.host.abortRound('중복')).toBe(false);
    expect(h.host.ledger).toEqual(before);
    expect(h.host.dealer).toBe(dealer);
    expect(h.host.carry).toBe(carry);
    h.gw.reconnect();
    h.guest.rejoin();
    expect(h.guest.view?.legal).toEqual([]);
    expect(h.guest.view?.playable).toEqual([]);
    expect(h.guest.checks.at(-1)).toEqual({ round: 1, result: 'aborted', reason: '시간 초과' });
    expect(h.guest.errors).not.toContain('COMMIT_INVALID');
    expect(h.host.nextRound()).toBe(true);
    expect(h.host.stage).toBe('playing');
    expect(h.guest.checks.some((check) => check.result === 'failed')).toBe(false);
  });

  it('무효 판을 저장·복원하고 새 소켓에서 무효 알림을 다시 보낸다', () => {
    const h = setup(12);
    const picker = new Picker(12);
    for (let i = 0; i < 30 && h.host.state?.phase !== 'turn'; i++) move(h.host, h.guest, picker);
    h.gw.disconnect();
    h.host.advanceTime(180_000);
    expect(h.host.abortRound('재접속 대기')).toBe(true);
    const savedHost: HostSessionState = viaJson(h.host.toJSON());
    const savedGuest = viaJson(h.guest.toJSON());
    const [hw, gw] = createMemoryTransportPair();
    const host = HostSession.fromJSON(hw, savedHost, { random32: secrets(900) });
    const guest = new GuestSession(gw, {
      name: '게스트',
      random32: secrets(901),
      restore: savedGuest,
    });
    guest.join();
    expect(guest.checks.at(-1)).toEqual({ round: 1, result: 'aborted', reason: '재접속 대기' });
    expect(host.nextRound()).toBe(true);
    expect(guest.errors).not.toContain('COMMIT_INVALID');
  });

  it('이미 지급된 즉시 정산은 판 무효 뒤에도 유지한다', () => {
    let found = false;
    for (let seed = 0; seed < 80 && !found; seed++) {
      const h = setup(seed);
      const picker = new Picker(seed + 1000);
      for (let i = 0; i < 200 && h.host.stage === 'playing'; i++) {
        move(h.host, h.guest, picker);
        if (
          h.host.state?.phase !== 'turn' ||
          !h.host.ledger.entries.some((e) => e.kind === 'instant')
        )
          continue;
        found = true;
        const paid = viaJson(h.host.ledger);
        h.gw.disconnect();
        h.host.advanceTime(180_000);
        expect(h.host.abortRound('즉시 정산 보존')).toBe(true);
        expect(h.host.ledger).toEqual(paid);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('게스트가 무효 알림을 못 받은 채 다음 판이 시작돼도 재접속 때 aborted가 먼저 도착한다', () => {
    const h = setup(16);
    const picker = new Picker(16);
    for (let i = 0; i < 30 && h.host.state?.phase !== 'turn'; i++) move(h.host, h.guest, picker);
    h.gw.disconnect();
    h.host.advanceTime(180_000);
    expect(h.host.abortRound('다음 판 전 부재')).toBe(true);
    expect(h.host.nextRound()).toBe(true);
    expect(h.host.stage).toBe('handshake');
    h.gw.reconnect();
    h.guest.rejoin();
    expect(h.guest.checks.at(-1)).toMatchObject({
      round: 1,
      result: 'aborted',
      reason: '다음 판 전 부재',
    });
    expect(h.host.stage).toBe('playing');
    expect(h.guest.errors).not.toContain('COMMIT_INVALID');
  });

  it('무효 뒤 종료하고 재접속해도 aborted가 sessionEnd보다 먼저 도착한다', () => {
    const h = setup(18);
    const picker = new Picker(18);
    for (let i = 0; i < 30 && h.host.state?.phase !== 'turn'; i++) move(h.host, h.guest, picker);
    h.gw.disconnect();
    h.host.advanceTime(180_000);
    expect(h.host.abortRound('복귀 없음')).toBe(true);
    h.host.end();
    h.gw.reconnect();
    h.guest.rejoin();
    expect(h.guest.checks.at(-1)).toEqual({ round: 1, result: 'aborted', reason: '복귀 없음' });
    expect(h.guest.errors).not.toContain('COMMIT_INVALID');
    expect(h.guest.ended).toEqual({ reason: 'host', seat: null });
  });
});
