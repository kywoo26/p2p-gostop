// M4 리뷰 수정 라운드 세션 테스트: 대기열 전송으로 유실·중복·순서 바꿈을 직접 고른다.
// #13 핸드셰이크 복구, #16 검증·재추첨·새로고침, #23 크기·원장 요약, #25 호스트 복원, #26 판 사이 대기·파산.
import { describe, expect, it } from 'vitest';
import { array, assert, constantFrom, nat, property, record, tuple } from 'fast-check';
import {
  PRESETS,
  legalActions,
  newRound,
  reduce,
  type Action,
  type GameState,
  type LedgerEntry,
} from '@p2p-gostop/engine';
import {
  GuestSession,
  HostSession,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  byteLength,
  createQueuedTransportPair,
  decode,
  encode,
  ledgerDelta,
  viewDigest,
  type HostMessage,
  type QueuedLink,
  type QueuedTransport,
  type SessionLedger,
} from '../src/index.ts';
import {
  Picker,
  frameType,
  guestMoves,
  hostMoves,
  ledgerBalanced,
  secrets,
  viaJson,
} from './helpers.ts';

interface Harness {
  readonly hw: QueuedTransport;
  readonly gw: QueuedTransport;
  readonly link: QueuedLink;
  host: HostSession;
  guest: GuestSession;
}
function setup(
  options: { startBalance?: number; perPoint?: number; ledger?: SessionLedger; seed?: number } = {},
): Harness {
  const [hw, gw, link] = createQueuedTransportPair();
  const host = new HostSession(hw, {
    rules: PRESETS.standard,
    names: ['호스트', '게스트'],
    random32: secrets(options.seed ?? 0),
    startBalance: options.startBalance ?? 1_000_000,
    perPoint: options.perPoint ?? 100,
    ...(options.ledger ? { ledger: options.ledger } : {}),
  });
  const guest = new GuestSession(gw, {
    name: '게스트',
    random32: secrets(5000 + (options.seed ?? 0)),
  });
  return { hw, gw, link, host, guest };
}
/** 재접속: 소켓이 끊겨 대기 프레임이 사라지고, 새 소켓에 중계가 present를 알린다 */
function reconnect(h: Harness): void {
  h.gw.disconnect();
  // 새 게스트 소켓: 중계가 호스트에 joined, 게스트에 present를 알린다(호스트는 소켓 인증을 되돌린다)
  h.link.notify(0, 'joined');
  h.link.notify(1, 'present');
}
/** 대기열에서 받는 쪽이 to인 n번째 프레임의 전체 색인 (없으면 -1) */
function nth(link: QueuedLink, to: 0 | 1, n: number): number {
  const indexes = link.queue.flatMap((f, i) => (f.to === to ? [i] : []));
  return indexes.length === 0 ? -1 : indexes[n % indexes.length]!;
}
/** 한 수 (게스트는 자기 화면의 legal에서만 고른다). 둘 다 없으면 false */
function move(h: Harness, picker: Picker): boolean {
  const mine = hostMoves(h.host);
  if (mine.length > 0) return h.host.apply(picker.pick(mine)!);
  const theirs = guestMoves(h.guest);
  if (theirs.length === 0) return false;
  h.guest.sendAction(picker.pick(theirs)!);
  return true;
}
/** 판이 끝날 때까지 믿을 수 있는 배달로 진행 */
function playRound(h: Harness, picker: Picker, limit = 400): void {
  h.link.flush();
  for (let i = 0; i < limit && h.host.stage === 'playing'; i++) {
    if (!move(h, picker)) throw new Error('합법 수 없음');
    h.link.flush();
  }
  expect(h.host.stage).not.toBe('playing');
}
/** 게스트가 받은 파산 프롬프트의 좌석 (함수로 읽어 타입 좁힘을 피한다) */
function prompted(guest: GuestSession): readonly (0 | 1)[] | undefined {
  return guest.bankruptcy?.seats;
}
function commitInvalid(h: Harness): number {
  return h.guest.errors.filter((e) => e === 'COMMIT_INVALID').length;
}
const hostFrames = (link: QueuedLink, t: string) =>
  link.queue.filter((f) => f.to === 0 && frameType(f.raw) === t);

describe('#13 판 사이 commit-reveal 핸드셰이크 복구', () => {
  const steps = ['commitHost', 'commitGuest', 'revealGuestRequest', 'revealGuest'] as const;
  for (const round of [1, 2] as const)
    it.each(steps)(`판 ${round}: %s 1건 유실 → 재접속 hello로 다음 판이 시작된다`, (lost) => {
      const h = setup();
      const picker = new Picker(round * 7);
      h.guest.join();
      if (round === 2) {
        playRound(h, picker);
        h.host.nextRound();
      }
      let dropped = false;
      for (let i = 0; i < 100 && h.link.queue.length > 0; i++) {
        const t = frameType(h.link.queue[0]!.raw);
        if (!dropped && t === lost) {
          h.link.drop();
          dropped = true;
        } else h.link.deliver();
      }
      expect(dropped).toBe(true);
      expect(h.host.stage).toBe('handshake'); // 유실로 멈춤 (리뷰 R1)
      reconnect(h);
      h.link.flush();
      expect(h.host.stage).toBe('playing');
      expect(h.guest.view?.round).toBe(round);
      expect(h.guest.seq).toBe(h.host.seq);
      expect(commitInvalid(h)).toBe(0);
      playRound(h, picker);
      expect(h.guest.checks.at(-1)).toMatchObject({ round, result: 'verified' });
    });

  it('같은 판·같은 해시의 commitHost·revealGuestRequest 중복에는 같은 응답(새 난수 금지)', () => {
    const h = setup();
    h.guest.join();
    h.link.deliver(); // hello → welcome, status, commitHost
    h.link.deliver(); // welcome
    h.link.deliver(); // status
    h.link.duplicate(0);
    h.link.deliver(); // commitHost
    h.link.deliver(); // commitHost (중복)
    const commits = hostFrames(h.link, 'commitGuest').map((f) => f.raw);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toBe(commits[1]);
    h.link.flush();
    expect(h.host.stage).toBe('playing');
    expect(commitInvalid(h)).toBe(0);
  });

  it('fast-check: 유실·중복·순서 바꿈·재접속 속에서도 수렴하고 검증 실패가 없다', () => {
    // 전송 모형: 게스트→호스트 프레임은 아무렇게나 유실·중복·순서 바꿈. 호스트→게스트는 WebSocket처럼 한 소켓 안에서
    // 순서가 지켜지고(유실은 재접속으로만), 중복은 나중에 한 번 더 도착한다. 정직한 호스트는 revealHost를 다음
    // commitHost보다 먼저 보내므로 missingReveal 거짓 실패가 없어야 한다.
    const op = record({
      kind: constantFrom(
        'toGuest',
        'toGuest',
        'toGuest',
        'toHost',
        'toHost',
        'dropHost',
        'dupHost',
        'deferHost',
        'dupGuest',
        'move',
        'move',
        'reconnect',
        'next',
      ),
      at: nat({ max: 7 }),
    });
    assert(
      property(
        tuple(nat({ max: 1_000 }), array(op, { minLength: 20, maxLength: 250 })),
        ([seed, ops]) => {
          const h = setup({ seed });
          const picker = new Picker(seed);
          h.guest.join();
          for (const { kind, at } of ops) {
            const guestFirst = nth(h.link, 1, 0);
            const host = nth(h.link, 0, at);
            switch (kind) {
              case 'toGuest':
                if (guestFirst >= 0) h.link.deliver(guestFirst);
                break;
              case 'toHost':
                if (host >= 0) h.link.deliver(host);
                break;
              case 'dropHost':
                if (host >= 0) h.link.drop(host);
                break;
              case 'dupHost':
                if (host >= 0) h.link.duplicate(host);
                break;
              case 'deferHost':
                if (host >= 0) h.link.defer(host);
                break;
              case 'dupGuest': {
                const index = nth(h.link, 1, at);
                if (index >= 0) h.link.inject(1, h.link.queue[index]!.raw);
                break;
              }
              case 'move':
                move(h, picker);
                break;
              case 'reconnect':
                reconnect(h);
                break;
              case 'next':
                if (h.host.stage === 'settled') {
                  h.guest.requestNextRound();
                  h.host.nextRound();
                }
                break;
            }
            expect(ledgerBalanced(h.host)).toBe(true);
          }
          // 치유: 믿을 수 있는 배달 + 재접속 한 번이면 같은 상태로 모인다.
          reconnect(h);
          h.link.flush();
          if (h.host.stage === 'lobby') h.host.start();
          h.link.flush();
          expect(h.guest.seq).toBe(h.host.seq);
          expect(h.guest.status).toEqual(h.host.status);
          expect(h.guest.view).toEqual(h.host.guestView());
          // 진행 중인 판을 끝까지 두고 다음 판도 한 판 둔다: 모두 검증되어야 한다.
          if (h.host.stage === 'playing') playRound(h, picker);
          if (h.host.stage === 'settled') {
            h.host.nextRound();
            h.link.flush();
            playRound(h, picker);
          }
          expect(h.guest.checks.filter((c) => c.result === 'failed')).toEqual([]);
          expect(h.guest.checks.at(-1)?.result).toBe('verified');
          expect(commitInvalid(h)).toBe(0);
        },
      ),
      { numRuns: 120 },
    );
  }, 60_000);
});

/** 같은 시드로 다른 합법 수열을 끝까지 만든다 */
function alternativeRound(
  message: Extract<HostMessage, { t: 'revealHost' }>,
  picker: Picker,
): Action[] {
  const start = newRound(PRESETS.standard, message.seed, message.options);
  let state: GameState = start.state;
  const actions: Action[] = [];
  for (let i = 0; i < 400 && state.phase !== 'end'; i++) {
    const legal = [...legalActions(state, 0), ...legalActions(state, 1)];
    const action = picker.pick(legal)!;
    const result = reduce(state, action);
    if (!result.ok) throw new Error(result.message);
    state = result.state;
    actions.push(action);
  }
  return actions;
}
/** 대기열에서 revealHost를 꺼내 바꿔 넣는다 */
function tamperReveal(
  h: Harness,
  change: (
    m: Extract<HostMessage, { t: 'revealHost' }>,
  ) => Extract<HostMessage, { t: 'revealHost' }>,
): boolean {
  const index = h.link.queue.findIndex((f) => f.to === 1 && f.raw.includes('"revealHost"'));
  if (index < 0) return false;
  const parsed = decode(h.link.queue[index]!.raw, 'host');
  if (!parsed.ok || parsed.message.t !== 'revealHost') return false;
  h.link.drop(index);
  h.link.inject(1, encode(change(parsed.message)));
  return true;
}
function playUntilReveal(h: Harness, picker: Picker): void {
  h.link.flush();
  for (let i = 0; i < 400 && h.host.stage === 'playing'; i++) {
    move(h, picker);
    // revealHost가 대기열에 들어오면 멈춘다
    while (h.link.queue.length > 0 && !h.link.queue[0]!.raw.includes('"revealHost"'))
      h.link.deliver();
    if (h.link.queue.some((f) => f.raw.includes('"revealHost"'))) return;
  }
}

describe('#16 commit-reveal 검증은 게스트가 본 판과 묶인다', () => {
  it('원문을 공개한 판에 다른 commitHost가 오면 응답하지 않고 COMMIT_INVALID (재추첨 방지, R2)', () => {
    const h = setup();
    h.guest.join();
    h.link.flush();
    expect(h.host.stage).toBe('playing');
    h.link.inject(1, encode({ t: 'commitHost', round: 1, hash: 'c'.repeat(64) }));
    h.link.deliver();
    expect(hostFrames(h.link, 'commitGuest')).toHaveLength(0);
    expect(commitInvalid(h)).toBe(1);
  });

  it('시드에 맞는 다른 합법 수열로 바꾼 revealHost는 실패로 판정한다 (R3)', () => {
    let failures = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const h = setup({ seed });
      const picker = new Picker(seed);
      h.guest.join();
      playUntilReveal(h, picker);
      const tampered = tamperReveal(h, (m) => ({
        ...m,
        actions: alternativeRound(m, new Picker(seed + 99)),
      }));
      expect(tampered).toBe(true);
      h.link.flush();
      const check = h.guest.checks.at(-1);
      expect(check?.result).toBe('failed');
      if (check?.result === 'failed') failures++;
      expect(commitInvalid(h)).toBe(1);
    }
    expect(failures).toBe(6);
  });

  it('뷰를 하나도 받지 못한 판에 게스트 수가 든 수열을 보내면 실패 (R3: 본 것 없음·보낸 것 없음)', () => {
    const h = setup({ seed: 3 });
    const picker = new Picker(3);
    h.guest.join();
    // 핸드셰이크만 배달하고, 그 뒤 게스트에게 가는 뷰·이벤트는 모두 버린다(revealHost만 통과).
    for (let i = 0; i < 50 && h.host.stage !== 'playing'; i++) h.link.deliver();
    const starve = () => {
      for (let j = h.link.queue.length - 1; j >= 0; j--)
        if (h.link.queue[j]!.to === 1 && !h.link.queue[j]!.raw.includes('"revealHost"'))
          h.link.drop(j);
    };
    starve();
    for (let i = 0; i < 400 && h.host.stage === 'playing'; i++) {
      const state = h.host.state!;
      const action = picker.pick([...legalActions(state, 0), ...legalActions(state, 1)])!;
      // 게스트 좌석 수는 게스트가 보낸 적이 없다: 조작된 요청을 호스트에 넣는다.
      if (action.seat === 0) h.host.apply(action);
      else h.link.inject(0, encode({ t: 'action', seq: h.host.seq, payload: action }));
      for (let n = 0; n < 20 && h.link.queue.some((f) => f.to === 0); n++)
        h.link.deliver(h.link.queue.findIndex((f) => f.to === 0));
      starve();
    }
    h.link.flush();
    expect(h.guest.view).toBeNull();
    expect(h.guest.checks.at(-1)).toEqual({ round: 1, result: 'failed', reason: 'actions' });
  });

  it('게스트 새로고침: 저장본 없이 새 세션이면 그 판은 검증 불가(거짓 COMMIT_INVALID 없음), 저장본이 있으면 검증됨 (R12)', () => {
    for (const restore of [false, true]) {
      const h = setup({ seed: 11 });
      const picker = new Picker(11);
      h.guest.join();
      h.link.flush();
      for (let i = 0; i < 8; i++) {
        move(h, picker);
        h.link.flush();
      }
      const saved = viaJson(h.guest.toJSON());
      h.gw.reset();
      h.guest = new GuestSession(h.gw, {
        name: '게스트',
        random32: secrets(7777),
        ...(restore ? { restore: saved } : { sessionToken: saved.token!, lastSeq: saved.seq }),
      });
      h.link.notify(1, 'present');
      h.link.flush();
      expect(h.guest.seq).toBe(h.host.seq);
      playRound(h, picker);
      expect(commitInvalid(h)).toBe(0);
      expect(h.guest.checks.at(-1)).toMatchObject(
        restore
          ? { round: 1, result: 'verified' }
          : { round: 1, result: 'unverifiable', reason: 'noCommitment' },
      );
      // 다음 판은 새 세션도 정상 검증
      h.host.nextRound();
      h.link.flush();
      playRound(h, picker);
      expect(h.guest.checks.at(-1)).toMatchObject({ round: 2, result: 'verified' });
    }
  });

  it('기존 v2 관찰 해시 5개를 복원한 뒤 새 형식 뷰를 받아도 정상 판을 검증한다 (NP-06)', () => {
    const h = setup({ seed: 11 });
    const picker = new Picker(11);
    h.guest.join();
    h.link.flush();
    for (let i = 0; i < 8; i++) {
      move(h, picker);
      h.link.flush();
    }
    const saved = viaJson(h.guest.toJSON());
    const oldViews = Object.values(saved.observations[0]!.views).slice(0, 5);
    expect(oldViews).toEqual([
      '99dbcff0e95ec9e6',
      '99dbcff0e95ec9e6',
      '063148e0d4f22f8e',
      '0bdb386b44526b01',
      'ce8ab20417339aa1',
    ]);
    const legacyView = viaJson(h.guest.view!);
    for (const seat of legacyView.seats) Reflect.deleteProperty(seat, 'bombTokens');
    expect(viewDigest(h.guest.view!)).toBe(viewDigest(legacyView));
    h.gw.reset();
    h.guest = new GuestSession(h.gw, {
      name: '게스트',
      random32: secrets(7777),
      restore: saved,
    });
    h.link.notify(1, 'present');
    h.link.flush();
    playRound(h, picker);
    expect(commitInvalid(h)).toBe(0);
    expect(h.guest.checks.at(-1)).toMatchObject({ round: 1, result: 'verified' });
  });
});

/** 호스트→게스트 revealHost 중 rounds에 든 판의 것을 지운다 (그 판의 revealHost를 보내지 않는 호스트) */
function withholdReveals(link: QueuedLink, rounds: ReadonlySet<number>): void {
  for (let i = link.queue.length - 1; i >= 0; i--) {
    const frame = link.queue[i]!;
    if (frame.to !== 1 || frameType(frame.raw) !== 'revealHost') continue;
    const parsed = decode(frame.raw, 'host');
    if (parsed.ok && parsed.message.t === 'revealHost' && rounds.has(parsed.message.round))
      link.drop(i);
  }
}
/** 공개를 빠뜨릴 판의 revealHost를 지우며 배달 */
function flushWithout(link: QueuedLink, rounds: ReadonlySet<number>): void {
  for (let i = 0; i < 100_000 && link.queue.length > 0; i++) {
    withholdReveals(link, rounds);
    if (link.queue.length > 0) link.deliver();
  }
}

describe('#16 재검토: revealHost를 빠뜨리거나 판을 건너뛰는 호스트', () => {
  it('fast-check: 판마다 정직·revealHost 누락·판 건너뛰기 중 하나 → 누락 판은 missingReveal, 건너뛴 판은 roundSkip, 나머지는 verified', () => {
    assert(
      property(
        tuple(
          nat({ max: 1_000 }),
          array(constantFrom('honest', 'omit', 'jump'), { minLength: 2, maxLength: 6 }),
          nat({ max: 2 }),
        ),
        ([seed, plan, skip]) => {
          const h = setup({ seed });
          const picker = new Picker(seed);
          h.guest.join();
          const want: { round: number; result: string; reason?: string }[] = [];
          const omitted = new Set(plan.flatMap((kind, i) => (kind === 'omit' ? [i + 1] : [])));
          const flush = () => flushWithout(h.link, omitted);
          const refused: boolean[] = [];
          for (const [i, kind] of plan.entries()) {
            const round = i + 1;
            flush();
            // (분배 직후 총통 등으로 곧바로 끝나는 판도 있다)
            for (let n = 0; n < 400 && h.host.stage === 'playing'; n++) {
              move(h, picker);
              flush();
            }
            if (kind === 'omit') {
              want.push({ round, result: 'failed', reason: 'missingReveal' });
              // 다음 판 커밋이 오면 게스트는 누락을 기록하고 응답하지 않는다.
              h.host.nextRound();
              flush();
              refused.push(h.host.stage === 'handshake');
              // 재접속해도 (계속 누락하는 호스트라) 판정은 바뀌지 않고, 게스트는 다음 판부터 이어 간다.
              reconnect(h);
              flush();
              continue;
            }
            want.push({ round, result: 'verified' });
            if (kind === 'jump') {
              const jumped = round + 2 + skip;
              want.push({ round: jumped, result: 'failed', reason: 'roundSkip' });
              h.link.inject(1, encode({ t: 'commitHost', round: jumped, hash: 'd'.repeat(64) }));
              flush();
              refused.push(!h.link.queue.some((f) => f.to === 0));
            }
            h.host.nextRound();
            flush();
          }
          // 판 번호를 뛰게 한 위조 판정은 그 판 번호로 남는다. 정직하게 이어 간 판은 따로 검증된다.
          const checks = h.guest.checks.map((c) => ({ ...c }));
          expect(checks.filter((c) => c.result === 'verified' || 'reason' in c)).toMatchObject(
            expect.arrayContaining(want.map((c) => expect.objectContaining(c))),
          );
          expect(refused.every(Boolean)).toBe(true);
          expect(checks.filter((c) => c.result === 'failed').length).toBe(
            want.filter((w) => w.result === 'failed').length,
          );
          expect(h.guest.verifiedRounds.filter((r) => r <= plan.length)).toEqual(
            plan.flatMap((kind, i) => (kind === 'omit' ? [] : [i + 1])),
          );
        },
      ),
      { numRuns: 40 },
    );
  }, 60_000);

  it('revealHost를 끝내 보내지 않고 세션을 끝내면 빈 checks가 아니라 missingReveal 실패', () => {
    const h = setup({ seed: 5 });
    const picker = new Picker(5);
    h.guest.join();
    h.link.flush();
    for (let n = 0; n < 400 && h.host.stage === 'playing'; n++) {
      move(h, picker);
      flushWithout(h.link, new Set([1]));
    }
    expect(h.guest.checks).toEqual([]);
    h.host.end();
    flushWithout(h.link, new Set([1]));
    expect(h.guest.checks).toEqual([{ round: 1, result: 'failed', reason: 'missingReveal' }]);
    expect(commitInvalid(h)).toBe(1);
  });

  it('원문 공개 뒤 분배·revealHost 없이 다음 판 commitHost → 판 1 missingReveal, commitGuest 응답 없음 (재현)', () => {
    const h = setup({ seed: 6 });
    h.guest.join();
    h.link.flush();
    expect(h.host.stage).toBe('playing');
    h.link.inject(1, encode({ t: 'commitHost', round: 2, hash: 'e'.repeat(64) }));
    h.link.deliver();
    expect(hostFrames(h.link, 'commitGuest')).toHaveLength(0);
    expect(h.guest.checks).toEqual([{ round: 1, result: 'failed', reason: 'missingReveal' }]);
    // 뒤늦은 revealHost로 판정을 되돌릴 수 없다
    const picker = new Picker(6);
    playRound(h, picker);
    expect(h.guest.checks).toEqual([{ round: 1, result: 'failed', reason: 'missingReveal' }]);
  });
});

/** 게스트 확인 뒤 게스트 차례까지 진행 */
function confirmedAtGuestTurn(seed: number): { h: Harness; picker: Picker } {
  const h = setup({ seed });
  const picker = new Picker(seed);
  h.guest.join();
  h.link.flush();
  for (let n = 0; n < 50 && (!h.host.guestConfirmed || guestMoves(h.guest).length === 0); n++) {
    move(h, picker);
    h.link.flush();
  }
  expect(h.host.guestConfirmed).toBe(true);
  expect(guestMoves(h.guest).length).toBeGreaterThan(0);
  return { h, picker };
}

describe('재검토 중요 2: 소켓 인증 (NF-06, FR-07)', () => {
  it('확인된 게스트 뒤 새 소켓(joined)에서 hello 없이 보낸 action·ledgerGet·ready·log에는 응답도 상태 변화도 없다', () => {
    const { h } = confirmedAtGuestTurn(9);
    const before = { seq: h.host.seq, state: h.host.state, json: JSON.stringify(h.host.toJSON()) };
    const action = h.host.guestView()!.legal[0]!;
    h.link.notify(0, 'joined'); // 낯선 기기가 최신 우선으로 게스트 자리를 차지
    h.link.inject(0, encode({ t: 'action', seq: h.host.seq, payload: action }));
    h.link.inject(0, encode({ t: 'action', seq: 0, payload: action }));
    h.link.inject(0, encode({ t: 'ledgerGet', from: 0 }));
    h.link.inject(0, encode({ t: 'ready', round: 1 }));
    h.link.inject(0, JSON.stringify({ t: 'log', entries: ['x'] }));
    h.link.inject(0, '{"t":"action","seq":"bad"}');
    while (h.link.queue.some((f) => f.to === 0)) h.link.deliver(nth(h.link, 0, 0));
    expect(h.link.queue).toEqual([]);
    expect(h.host.seq).toBe(before.seq);
    expect(h.host.state).toBe(before.state);
    expect(JSON.stringify(h.host.toJSON())).toBe(before.json);
    // 토큰 없는 hello는 거절만 한다(환영·스냅샷 없음)
    h.link.inject(0, encode({ t: 'hello', v: PROTOCOL_VERSION, name: '낯선 이', lastSeq: 0 }));
    h.link.deliver(nth(h.link, 0, 0));
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['reject']);
    expect(h.link.queue[0]!.raw).toContain('TOKEN_INVALID');
    h.link.drop();
    // 진짜 게스트가 토큰 hello로 돌아오면 다시 둘 수 있다
    reconnect(h);
    h.link.flush();
    expect(h.guest.seq).toBe(h.host.seq);
    const state = h.host.state;
    h.guest.sendAction(guestMoves(h.guest)[0]!);
    h.link.flush();
    expect(h.host.state).not.toBe(state);
  });

  it('ping은 인증 전에도 pong만 돌려준다', () => {
    const { h } = confirmedAtGuestTurn(10);
    h.link.notify(0, 'left');
    h.link.inject(0, encode({ t: 'ping' }));
    h.link.deliver(nth(h.link, 0, 0));
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['pong']);
  });

  it('끊긴 동안의 게스트 요청은 welcome 뒤에 보낸다(인증 전 소켓에서 버려지지 않게)', () => {
    const { h } = confirmedAtGuestTurn(11);
    h.gw.disconnect();
    const state = h.host.state;
    h.guest.sendAction(guestMoves(h.guest)[0]!);
    expect(h.link.queue).toEqual([]);
    h.link.notify(0, 'joined');
    h.link.notify(1, 'present');
    h.link.flush();
    expect(h.host.state).not.toBe(state);
    expect(h.host.diagnostics.filter((d) => d.includes('인증 전'))).toEqual([]);
  });
});

function bigLedger(n: number): SessionLedger {
  const entries: LedgerEntry[] = Array.from({ length: n }, (_, i) => ({
    kind: 'instant',
    label: 'firstPpeok',
    from: i % 2 === 0 ? 0 : 1,
    to: i % 2 === 0 ? 1 : 0,
    points: 7,
    requested: 700,
    amount: 700,
    capped: false,
  }));
  return { perPoint: 100, startBalance: 1_000_000, balances: [1_000_000, 1_000_000], entries };
}

describe('#23 크기 상한과 원장 요약', () => {
  it('원장 500항목 세션: 모든 게임 메시지 ≤ 16KB, 요약만 싣고 이력은 ledgerGet 쪽으로 받는다 (R4)', () => {
    const h = setup({ ledger: bigLedger(500) });
    const picker = new Picker(5);
    let largest = 0;
    const measure = () => {
      for (const f of h.link.queue) largest = Math.max(largest, byteLength(f.raw));
    };
    h.guest.join();
    measure();
    h.link.flush();
    for (let i = 0; i < 400 && h.host.stage === 'playing'; i++) {
      move(h, picker);
      measure();
      h.link.flush();
    }
    expect(h.host.stage).not.toBe('playing');
    expect(largest).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(h.guest.ledger?.entryCount).toBe(h.host.ledger.entries.length);
    expect(h.guest.ledger?.recent.length).toBeLessThanOrEqual(8);
    for (let i = 0; i < 20 && h.guest.ledgerHistory.length < h.host.ledger.entries.length; i++) {
      h.guest.requestLedgerHistory(h.guest.ledgerHistory.length);
      h.link.flush();
    }
    expect(h.guest.ledgerHistory).toEqual(h.host.ledger.entries);
    expect(h.guest.ledgerTotal).toBe(h.host.ledger.entries.length);
  });

  it('게스트 액션의 여분 필드는 지워져 revealHost가 커지지 않는다 (R9)', () => {
    const h = setup({ seed: 2 });
    const picker = new Picker(2);
    h.guest.join();
    h.link.flush();
    for (let i = 0; i < 400 && h.host.stage === 'playing'; i++) {
      const mine = hostMoves(h.host);
      if (mine.length > 0) h.host.apply(picker.pick(mine)!);
      else {
        // 게스트가 정상으로 보낸 요청에 여분 필드를 덧붙인다(버전 차이·버그 흉내).
        h.guest.sendAction(picker.pick(guestMoves(h.guest))!);
        const index = h.link.queue.length - 1;
        const sent = decode(h.link.queue[index]!.raw, 'guest');
        if (!sent.ok || sent.message.t !== 'action') throw new Error('액션 프레임이 아니다');
        const frame = {
          ...sent.message,
          payload: { ...sent.message.payload, pad: 'z'.repeat(3000) },
        };
        h.link.inject(0, JSON.stringify(frame));
      }
      h.link.flush();
    }
    expect(h.host.stage).toBe('settled');
    expect(h.guest.checks.at(-1)?.result).toBe('verified');
    expect(JSON.stringify(h.host.toJSON().lastReveal)).not.toContain('zzz');
  });

  it('전송이 예외를 던져도 세션 밖으로 나가지 않는다', () => {
    const [hw] = createQueuedTransportPair();
    const throwing = {
      ...hw,
      send() {
        throw new Error('소켓 고장');
      },
    };
    const host = new HostSession(throwing, {
      rules: PRESETS.standard,
      names: ['호스트', '게스트'],
      random32: secrets(0),
    });
    expect(() =>
      host.receive(JSON.stringify({ t: 'hello', v: 2, name: '게스트', lastSeq: 0 })),
    ).not.toThrow();
    expect(host.diagnostics.some((line) => line.includes('송신 실패'))).toBe(true);
  });

  it('메시지 경로로 들어온 relay 모양 프레임은 거부 응답 없이 버린다(위조 방지)', () => {
    const h = setup();
    h.host.receive('{"t":"relay","peer":"left"}');
    h.host.receive('{"type":"relay","peer":"joined"}');
    expect(h.link.queue).toHaveLength(0);
    expect(h.host.diagnostics).toHaveLength(2);
  });
});

describe('#25 호스트 저장·복원', () => {
  it('판 중간 저장본으로 복원하면 게스트가 되감긴 순번을 받아들이고 판을 이어 끝내며 검증된다 (R6)', () => {
    const h = setup({ seed: 21 });
    const picker = new Picker(21);
    let saves = 0;
    let saved = viaJson(h.host.toJSON());
    h.host.onChange((host) => {
      saves++;
      if (host.seq < 12) saved = viaJson(host.toJSON());
    });
    h.guest.join();
    h.link.flush();
    for (let i = 0; i < 25 && h.host.stage === 'playing'; i++) {
      move(h, picker);
      h.link.flush();
    }
    expect(saves).toBeGreaterThan(0);
    const before = h.guest.seq;
    // 호스트 프로세스 사망 → 저장본으로 복원 (게스트는 호스트보다 앞선 순번을 들고 있다)
    h.hw.reset();
    h.host = HostSession.fromJSON(h.hw, saved, { random32: secrets(999) });
    expect(h.host.seq).toBeLessThan(before);
    reconnect(h);
    h.link.flush();
    expect(h.guest.seq).toBe(h.host.seq);
    expect(h.guest.view).toEqual(h.host.guestView());
    expect(h.guest.epoch).toBe(h.host.epoch);
    playRound(h, picker);
    expect(h.guest.checks.at(-1)).toMatchObject({ round: 1, result: 'verified' });
    expect(ledgerBalanced(h.host)).toBe(true);
  });

  it('단계마다 toJSON → fromJSON 왕복이 같은 상태를 만든다 (핸드셰이크·진행·정산)', () => {
    const h = setup({ seed: 8 });
    const picker = new Picker(8);
    h.guest.join();
    const check = () => {
      const data = viaJson(h.host.toJSON());
      const [other] = createQueuedTransportPair();
      const copy = HostSession.fromJSON(other, data, { random32: secrets(1) });
      expect(copy.stage).toBe(h.host.stage);
      expect(copy.seq).toBe(h.host.seq);
      expect(copy.roundNumber).toBe(h.host.roundNumber);
      expect(copy.ledger).toEqual(h.host.ledger);
      expect(copy.hostView()).toEqual(h.host.hostView());
      expect(copy.settlementView).toEqual(h.host.settlementView);
      expect({ ...copy.toJSON(), rev: 0 }).toEqual({ ...h.host.toJSON(), rev: 0 });
    };
    check(); // handshake (commitHost만 보냄)
    h.link.flush();
    check(); // playing
    playRound(h, picker);
    check(); // settled
    h.host.nextRound();
    check(); // 다음 판 handshake (방금 끝난 판이 남아 있다)
  });
});

describe('#26 판 사이 대기와 파산', () => {
  it('정산 뒤 settled에서 멈추고 정산 화면이 남는다. 게스트는 요청만, 시작은 호스트 nextRound (R7)', () => {
    const h = setup({ seed: 4 });
    const picker = new Picker(4);
    h.guest.join();
    playRound(h, picker);
    expect(h.host.stage).toBe('settled');
    expect(h.guest.status?.stage).toBe('settled');
    expect(h.guest.settlement).not.toBeNull();
    expect(h.guest.view?.round).toBe(1);
    h.link.flush();
    expect(h.host.stage).toBe('settled'); // 자동으로 다음 판을 시작하지 않는다
    h.guest.requestNextRound();
    h.link.flush();
    expect(h.host.guestReady).toBe(true);
    expect(h.guest.status?.ready).toEqual([false, true]);
    expect(h.host.stage).toBe('settled');
    reconnect(h); // 재접속해도 정산 화면을 다시 받는다
    h.link.flush();
    expect(h.guest.settlement).toEqual(h.host.settlementView);
    expect(h.host.nextRound()).toBe(true);
    expect(h.host.nextRound()).toBe(false);
    h.guest.requestNextRound(); // 핸드셰이크 중 ready는 무시
    h.link.flush();
    expect(h.host.stage).toBe('playing');
    expect(h.guest.settlement).toBeNull();
    expect(h.guest.view?.round).toBe(2);
  });

  it('나가리는 정산 금액 0, before는 판 시작 전 잔액 (S-1 나가리 금액)', () => {
    // 나가리가 나올 때까지 여러 시드로 판을 둔다.
    const befores: [unknown, unknown][] = [];
    const amounts: [number, number][] = [];
    let nagari: { host: number; guest: number | undefined } | null = null;
    let carryMatches = false;
    for (let seed = 0; seed < 200 && nagari === null; seed++) {
      const h = setup({ seed });
      const picker = new Picker(seed);
      h.guest.join();
      playRound(h, picker);
      const view = h.host.settlementView!;
      befores.push([view.balances.map((b) => b.before), h.host.toJSON().round!.startBalances]);
      if (view.winner === null) {
        nagari = { host: view.amount, guest: h.guest.settlement?.amount };
        carryMatches =
          h.host.status.carry === h.host.settlement?.nextCarry &&
          h.guest.status?.carry === h.host.status.carry;
      } else
        amounts.push([
          view.amount,
          h.host.ledger.entries.filter((e) => e.kind === 'round').at(-1)!.amount,
        ]);
    }
    expect(nagari).toEqual({ host: 0, guest: 0 });
    expect(carryMatches).toBe(true);
    for (const [shown, start] of befores) expect(shown).toEqual(start);
    for (const [shown, entry] of amounts) expect(shown).toBe(entry);
  });

  it('파산: 잔액 0인 좌석이 고르고(양쪽 대칭), 재충전은 그 좌석만 되돌리며 원장 항목을 남긴다 (R13)', () => {
    const seen = new Set<0 | 1>();
    const outcomes: { seat: 0 | 1; guestRejected: string | null; hostChose: boolean }[] = [];
    for (let seed = 0; seed < 300 && seen.size < 2; seed++) {
      const h = setup({ seed, startBalance: 300, perPoint: 100 });
      const picker = new Picker(seed);
      h.guest.join();
      for (let r = 0; r < 6 && h.host.stage !== 'bankrupt'; r++) {
        playRound(h, picker);
        if (h.host.stage === 'settled') {
          h.host.nextRound();
          h.link.flush();
        }
      }
      if (h.host.stage !== 'bankrupt') continue;
      const seat = h.host.status.bankrupt[0]!;
      if (seen.has(seat)) continue;
      seen.add(seat);
      const other = seat === 0 ? 1 : 0;
      const otherBalance = h.host.ledger.balances[other];
      expect(h.host.ledger.balances[seat]).toBe(0);
      expect(prompted(h.guest)).toEqual([seat]);
      // 재접속하면 프롬프트를 다시 받는다
      h.guest.bankruptcy = null;
      reconnect(h);
      h.link.flush();
      expect(prompted(h.guest)).toEqual([seat]);
      let guestRejected: string | null = null;
      if (seat === 0) {
        h.guest.chooseBankruptcy('recharge'); // 게스트는 호스트 좌석을 대신 고를 수 없다
        h.link.flush();
        guestRejected = h.guest.errors.at(-1) ?? null;
      }
      const hostChose = h.host.chooseBankruptcy('recharge'); // 게스트 좌석은 호스트가 대신 고를 수 없다
      if (!hostChose) h.guest.chooseBankruptcy('recharge');
      outcomes.push({ seat, guestRejected, hostChose });
      h.link.flush();
      expect(h.host.ledger.balances[seat]).toBe(300);
      expect(h.host.ledger.balances[other]).toBe(otherBalance);
      expect(h.host.ledger.entries.at(-1)).toMatchObject({ kind: 'recharge', seat, amount: 300 });
      const delta = ledgerDelta(h.host.ledger.entries);
      expect(delta).toEqual([h.host.ledger.balances[0] - 300, h.host.ledger.balances[1] - 300]);
      expect(ledgerBalanced(h.host)).toBe(true);
      expect(h.host.stage).toBe('settled');
      expect(h.guest.status?.stage).toBe('settled');
      expect(h.guest.ledger?.balances).toEqual(h.host.ledger.balances);
      expect(h.guest.ledger?.recharged[seat]).toBe(300);
      // 다음 파산에서는 종료를 고른다 → 양쪽에 종료 알림
      h.host.end();
      h.link.flush();
      expect(h.guest.ended).toEqual({ reason: 'host', seat: null });
      expect(h.guest.status?.stage).toBe('ended');
    }
    expect(outcomes.toSorted((a, b) => a.seat - b.seat)).toEqual([
      { seat: 0, guestRejected: 'BANKRUPT', hostChose: true },
      { seat: 1, guestRejected: null, hostChose: false },
    ]);
  });

  it('파산 종료 선택은 세션 종료 알림을 보낸다', () => {
    for (let seed = 0; seed < 300; seed++) {
      const h = setup({ seed, startBalance: 300, perPoint: 100 });
      const picker = new Picker(seed);
      h.guest.join();
      for (let r = 0; r < 6 && h.host.stage !== 'bankrupt'; r++) {
        playRound(h, picker);
        if (h.host.stage === 'settled') {
          h.host.nextRound();
          h.link.flush();
        }
      }
      if (h.host.stage !== 'bankrupt' || !h.host.status.bankrupt.includes(1)) continue;
      h.guest.chooseBankruptcy('end');
      h.link.flush();
      expect(h.host.stage).toBe('ended');
      expect(h.host.ended).toBe(true);
      expect(h.guest.ended).toEqual({ reason: 'bankruptcy', seat: 1 });
      expect(h.host.nextRound()).toBe(false);
      return;
    }
    throw new Error('게스트 파산 시나리오를 찾지 못했다');
  });
});

describe('#40 absent는 인증을 되돌리지 않는다, 응답 없는 요청 감시', () => {
  it('호스트가 absent를 받아도 게스트 소켓 인증은 그대로다(상대 상태만 기록). joined·left는 되돌린다', () => {
    const { h } = confirmedAtGuestTurn(12);
    h.link.notify(0, 'absent');
    expect(h.host.authenticated).toBe(true);
    expect(h.host.peer).toBe('absent');
    expect(h.host.connected).toBe(false);
    const state = h.host.state;
    h.guest.sendAction(guestMoves(h.guest)[0]!);
    h.link.flush();
    expect(h.host.state).not.toBe(state);
    expect(h.host.connected).toBe(true);
    expect(h.host.diagnostics.filter((d) => d.includes('인증 전'))).toEqual([]);
    const auth: boolean[] = [];
    for (const peer of ['left', 'joined'] as const) {
      reconnect(h);
      h.link.flush();
      auth.push(h.host.authenticated);
      h.link.notify(0, peer);
      auth.push(h.host.authenticated);
    }
    expect(auth).toEqual([true, false, true, false]);
  });

  it('게스트가 absent를 받아도 요청을 미루지 않는다', () => {
    const { h } = confirmedAtGuestTurn(14);
    h.link.notify(1, 'absent');
    expect(h.guest.hostPresent).toBe(false);
    const state = h.host.state;
    h.guest.sendAction(guestMoves(h.guest)[0]!);
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['action']);
    h.link.flush();
    expect(h.host.state).not.toBe(state);
  });

  it('ping에는 답하지만 액션을 버리는 호스트: 응답 없이 ackTimeout이 지나면 hello로 다시 인증하고 액션을 다시 보낸다', () => {
    const { h } = confirmedAtGuestTurn(13);
    h.guest.advanceTime(1_000);
    // 인증을 잃은 소켓(알림 유실·버그)을 흉내 낸다: 호스트는 ping에만 답하고 액션은 말없이 버린다.
    h.host.authenticated = false;
    const state = h.host.state;
    h.guest.sendAction(guestMoves(h.guest)[0]!);
    h.guest.transport.send({ t: 'ping' });
    h.link.flush();
    expect(h.host.state).toBe(state);
    h.guest.advanceTime(5_999);
    expect(h.link.queue).toEqual([]);
    h.guest.advanceTime(6_000);
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['hello']);
    h.link.flush();
    expect(h.host.authenticated).toBe(true);
    expect(h.host.state).not.toBe(state);
    expect(h.guest.seq).toBe(h.host.seq);
  });

  for (const lost of ['hello', 'welcome'] as const)
    it(`재인증 ${lost} 유실에도 advanceTime이 hello를 재시도하고 요청을 복구한다`, () => {
      const { h } = confirmedAtGuestTurn(16);
      h.guest.advanceTime(1_000);
      h.host.authenticated = false;
      const state = h.host.state;
      h.guest.sendAction(guestMoves(h.guest)[0]!);
      h.link.flush(); // 인증 전 action은 응답 없이 버려진다
      expect(h.host.state).toBe(state);
      h.guest.advanceTime(6_000);
      expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['hello']);
      let welcomeFrame: string | null = null;
      if (lost === 'hello') h.link.drop();
      else {
        h.link.deliver(); // hello를 받은 호스트가 welcome과 resync 프레임을 보낸다
        welcomeFrame = frameType(h.link.queue[0]!.raw);
        h.link.drop();
        h.link.flush();
      }
      expect(welcomeFrame).toBe(lost === 'welcome' ? 'welcome' : null);
      h.guest.advanceTime(10_999);
      expect(h.link.queue).toEqual([]);
      h.guest.advanceTime(11_000);
      expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['hello']);
      h.link.flush();
      expect(h.host.state).not.toBe(state);
      expect(h.guest.seq).toBe(h.host.seq);
      h.guest.advanceTime(61_000);
      expect(h.link.queue).toEqual([]);
    });

  it('welcome 뒤 재동기화 snapshot 유실에도 hello를 재시도해 outbox를 보낸다', () => {
    const { h } = confirmedAtGuestTurn(20);
    h.guest.advanceTime(1_000);
    h.host.authenticated = false;
    const state = h.host.state;
    h.guest.sendAction(guestMoves(h.guest)[0]!);
    h.link.flush();
    h.guest.advanceTime(6_000);
    h.link.deliver(); // hello
    h.link.deliver(); // welcome
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['snapshot']);
    h.link.drop();
    h.guest.advanceTime(11_000);
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['hello']);
    h.link.flush();
    expect(h.host.state).not.toBe(state);
  });

  it('hello 재시도 간격은 5·10·20초 뒤 30초 상한이다', () => {
    const { h } = confirmedAtGuestTurn(21);
    h.guest.advanceTime(1_000);
    h.host.authenticated = false;
    h.guest.sendAction(guestMoves(h.guest)[0]!);
    h.link.flush();
    for (const at of [6_000, 11_000, 21_000, 41_000, 71_000]) {
      h.guest.advanceTime(at - 1);
      expect(h.link.queue).toEqual([]);
      h.guest.advanceTime(at);
      expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['hello']);
      h.link.drop();
    }
  });

  it('재인증 snapshot과 이전 요청의 STALE_SEQ가 재전송 action의 감시를 지우지 않는다', () => {
    const { h } = confirmedAtGuestTurn(17);
    h.guest.advanceTime(1_000);
    h.host.authenticated = false;
    const state = h.host.state;
    h.guest.sendAction(guestMoves(h.guest)[0]!);
    h.link.flush();
    h.guest.advanceTime(6_000);
    h.link.deliver(); // hello → welcome, snapshot/events
    expect(frameType(h.link.queue[0]!.raw)).toBe('welcome');
    h.link.deliver(); // welcome 뒤에는 재동기화 snapshot을 먼저 기다린다
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['snapshot']);
    h.link.deliver(); // snapshot을 적용한 뒤 action을 다시 보낸다
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['action']);
    h.link.drop(); // 재전송 action 유실
    h.link.inject(
      1,
      encode({
        t: 'snapshot',
        seq: h.guest.seq - 1,
        view: h.guest.view!,
        ledger: h.guest.ledger!,
        status: h.guest.status!,
        decision: null,
      }),
    );
    h.link.inject(
      1,
      encode({ t: 'reject', seq: h.guest.seq - 1, reason: 'STALE_SEQ', message: 'old' }),
    );
    h.link.flush();
    h.guest.advanceTime(10_999);
    expect(h.link.queue).toEqual([]);
    h.guest.advanceTime(11_000);
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['hello']);
    h.link.flush();
    expect(h.host.state).not.toBe(state);
    expect(h.guest.seq).toBe(h.host.seq);
  });

  it('같은 seq의 이전 snapshot은 welcome 뒤 새 action의 감시를 지우지 않는다', () => {
    const { h } = confirmedAtGuestTurn(9);
    h.guest.advanceTime(1_000);
    const state = h.host.state;
    h.guest.join();
    h.link.deliver(); // hello → welcome, snapshot
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['welcome', 'snapshot']);
    h.link.deliver(); // welcome만 받는다
    h.guest.sendAction(guestMoves(h.guest)[0]!);
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['snapshot']);
    const oldSnapshot = h.link.queue[0]!.raw;
    h.link.deliver(); // 재동기화가 끝난 뒤 action 송신
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['action']);
    h.link.drop(); // 새 action 유실
    h.link.inject(1, oldSnapshot); // 같은 seq의 이전 snapshot이 늦게 도착
    h.link.deliver();
    expect(h.host.state).toBe(state);
    h.guest.advanceTime(6_000);
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['hello']);
    h.link.flush();
    expect(h.host.state).not.toBe(state);
    h.guest.advanceTime(61_000);
    expect(h.link.queue).toEqual([]);
  });

  it('이벤트 없는 합법 action의 같은 seq snapshot은 requestId로 감시를 끝낸다', () => {
    const { h } = confirmedAtGuestTurn(16);
    h.guest.advanceTime(1_000);
    const seq = h.guest.seq;
    h.guest.sendAction(guestMoves(h.guest)[0]!);
    const request = decode(h.link.queue[0]!.raw, 'guest');
    expect(typeof (request.ok && request.message.t === 'action' && request.message.requestId)).toBe(
      'number',
    );
    h.link.deliver();
    const reply = decode(h.link.queue[0]!.raw, 'host');
    expect(reply.ok && reply.message.t === 'snapshot' && reply.message.seq).toBe(seq);
    expect(reply.ok && reply.message.t === 'snapshot' && reply.message.requestId).toBe(
      request.ok && request.message.t === 'action' && request.message.requestId,
    );
    h.link.flush();
    h.guest.advanceTime(61_000);
    expect(h.link.queue).toEqual([]);
  });

  it('이전 action의 같은 seq 응답은 새 action의 requestId 감시를 지우지 않는다', () => {
    const { h } = confirmedAtGuestTurn(16);
    h.guest.advanceTime(1_000);
    const action = guestMoves(h.guest)[0]!;
    h.guest.sendAction(action);
    h.link.deliver(); // 첫 action의 응답 snapshot을 잠시 보류한다
    const oldSnapshot = h.link.queue[0]!.raw;
    h.guest.sendAction(action);
    h.link.drop(nth(h.link, 0, 0)); // 새 action 유실
    h.link.deliver(); // 첫 action의 같은-seq snapshot
    const parsed = decode(oldSnapshot, 'host');
    expect(parsed.ok && parsed.message.t === 'snapshot' && parsed.message.seq).toBe(h.guest.seq);
    h.guest.advanceTime(6_000);
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['hello']);
  });

  it('ready 응답 유실 뒤 welcome의 ready=true로 완료하고 중복 ready도 재인증하지 않는다', () => {
    const h = setup({ seed: 4 });
    h.guest.join();
    playRound(h, new Picker(4));
    h.guest.advanceTime(1_000);
    h.guest.requestNextRound();
    h.link.deliver(); // ready는 적용되지만 응답 status를 유실시킨다
    expect(h.host.guestReady).toBe(true);
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['status']);
    h.link.drop();
    h.guest.advanceTime(6_000);
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['hello']);
    h.link.deliver(); // hello → welcome, snapshot
    h.link.deliver(); // welcome의 ready=true가 요청을 충족한다
    h.link.flush();
    expect(h.guest.status?.ready[1]).toBe(true);
    expect(h.link.queue).toEqual([]);
    h.guest.requestNextRound(); // 호스트는 같은 rev로 응답한다
    h.link.flush();
    for (const at of [11_000, 16_000, 61_000]) {
      h.guest.advanceTime(at);
      expect(h.link.queue.filter((f) => frameType(f.raw) === 'hello')).toEqual([]);
    }
  });

  it('이전 판 ready의 status는 새 판 ready의 감시를 지우지 않는다', () => {
    const h = setup({ seed: 18 });
    h.guest.join();
    playRound(h, new Picker(18));
    h.guest.requestNextRound();
    h.link.deliver();
    const oldStatus = h.link.queue[0]!.raw;
    expect(frameType(oldStatus)).toBe('status');
    h.link.flush();
    h.host.nextRound();
    playRound(h, new Picker(19));
    h.guest.advanceTime(1_000);
    h.guest.requestNextRound();
    h.link.drop(); // 새 ready 요청을 유실시킨다
    h.link.inject(1, oldStatus);
    h.link.deliver();
    h.guest.advanceTime(6_000);
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['hello']);
  });

  it('단계 전환 뒤 무시된 ready도 실제 감시를 만들고 host status로 해제한다', () => {
    const h = setup({ seed: 19 });
    h.guest.join();
    playRound(h, new Picker(19));
    h.guest.advanceTime(1_000);
    h.guest.requestNextRound();
    expect(h.link.queue.map((f) => frameType(f.raw))).toEqual(['ready']);
    h.host.nextRound();
    const before = h.link.queue.filter((f) => frameType(f.raw) === 'status').length;
    h.link.deliver(nth(h.link, 0, 0)); // 단계가 바뀐 뒤 ready를 배달한다
    const statuses = h.link.queue.filter((f) => frameType(f.raw) === 'status');
    expect(statuses).toHaveLength(before + 1);
    const response = decode(statuses.at(-1)!.raw, 'host');
    expect(response.ok && response.message.t === 'status' && response.message.status.stage).toBe(
      'handshake',
    );
    h.link.flush();
    h.guest.advanceTime(6_000);
    expect(h.link.queue.filter((f) => frameType(f.raw) === 'hello')).toEqual([]);
  });

  it('응답을 받은 요청은 다시 보내지 않는다 (거짓 재인증 없음)', () => {
    const h = setup({ seed: 15 });
    const picker = new Picker(15);
    h.guest.join();
    h.link.flush();
    let now = 0;
    for (let n = 0; n < 400 && h.host.stage === 'playing'; n++) {
      h.guest.advanceTime((now += 10_000));
      move(h, picker);
      h.link.flush();
      h.guest.advanceTime((now += 10_000));
      expect(h.link.queue).toEqual([]);
    }
    h.guest.requestNextRound();
    h.guest.requestLedgerHistory(0);
    h.link.flush();
    h.guest.advanceTime((now += 60_000));
    expect(h.link.queue).toEqual([]);
  });
});
