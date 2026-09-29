// FR-51~53 / NP-10: 엔진 밖 호스트 시계의 결정별 경합과 복귀 한계.
import { describe, expect, it } from 'vitest';
import { PRESETS, legalActions, type Action } from '@p2p-gostop/engine';
import {
  createMemoryTransportPair,
  GuestSession,
  HostSession,
  timeoutAction,
  type BoardView,
} from '../src/index.ts';
import { secrets } from './helpers.ts';

function game() {
  const [hostWire, guestWire] = createMemoryTransportPair();
  const host = new HostSession(hostWire, {
    rules: PRESETS.standard,
    names: ['호스트', '게스트'],
    random32: secrets(123),
    timerSettings: { decisionMs: 5_000, policy: 'fixed-v1' },
  });
  const guest = new GuestSession(guestWire, { name: '게스트', random32: secrets(456) });
  guest.join();
  for (let i = 0; i < 3 && host.state?.phase === 'chooseFirst'; i++) {
    const mine = legalActions(host.state, 0)[0];
    if (mine) {
      if (!host.apply(mine)) throw new Error('호스트 선 고르기 실패');
    } else {
      const theirs = guest.view?.legal[0];
      if (!theirs) throw new Error('게스트 선 고르기 수가 없음');
      guest.sendAction(theirs);
    }
  }
  expect(host.state?.phase).toBe('turn');
  expect(host.decisionClock?.state).toBe('preparing');
  expect(guest.decision?.key).toEqual(host.decisionClock?.key);
  return { host, guest, hostWire, guestWire };
}

function ready(g: ReturnType<typeof game>) {
  const clock = g.host.decisionClock!;
  expect(g.host.decisionReady(0, clock.key, clock.attempt, g.host.seq)).toBe(true);
  expect(g.guest.decisionReady(g.guest.seq)).toBe(true);
  expect(g.host.decisionClock?.state).toBe('running');
  return clock;
}

function healthy(host: HostSession, start: number, end: number) {
  for (let now = start; now <= end; now += 500) host.advanceTime(now);
}

function manual(g: ReturnType<typeof game>, action: Action): boolean {
  if (action.seat === 0) return g.host.apply(action);
  const before = g.host.seq;
  g.guest.sendAction(action);
  return g.host.seq > before;
}

describe('NP-10 호스트 결정 시계', () => {
  it('양쪽 준비 후 한 번만 시작하고 deadline 이전 수동 입력을 먼저 소비한다', () => {
    const g = game();
    const offer = ready(g);
    const deadline = g.host.decisionClock!.deadlineMs;
    expect(deadline).toBe(5_000);
    expect(g.host.decisionReady(0, offer.key, offer.attempt, g.host.seq)).toBe(false);
    expect(g.host.decisionClock?.deadlineMs).toBe(deadline);
    healthy(g.host, 500, 4_500);
    const action = timeoutAction(offer.seat === 0 ? g.host.hostView()! : g.host.guestView()!)!;
    expect(manual(g, action)).toBe(true);
    expect(g.host.timeoutHistory).toHaveLength(0);
    expect(g.host.decisionClock?.key.decisionId).not.toBe(offer.key.decisionId);
  });

  it('실제 단조 시계의 소수 밀리초를 wire 정수 시각으로 내린다', () => {
    const g = game();
    g.host.advanceTime(500.8);
    ready(g);
    expect(g.host.decisionClock?.deadlineMs).toBe(5_500);
    expect(g.host.decisionClock?.hostNowMs).toBe(500);
  });

  it('deadline와 같은 시각의 수동 수는 거부하고 현재 key에 초과 행동을 한 번만 기록한다', () => {
    const g = game();
    const offer = ready(g);
    healthy(g.host, 500, 5_000);
    expect(g.host.decisionClock?.state).toBe('checking');
    const view = offer.seat === 0 ? g.host.hostView()! : g.host.guestView()!;
    const action = timeoutAction(view)!;
    expect(manual(g, action)).toBe(false);
    expect(g.guest.ackExpiry(g.guest.seq, true)).toBe(true);
    expect(g.host.timeoutHistory).toHaveLength(1);
    expect(g.host.timeoutHistory[0]?.action).toEqual(action);
    expect(g.host.timeoutHistory[0]?.deadlineMs).toBe(5_000);
    expect(g.guest.ackExpiry(g.guest.seq, true)).toBe(false);
    expect(g.host.timeoutHistory).toHaveLength(1);
  });

  it('준비 확인 5초와 마감 확인 2초를 넘기면 자동 수 없이 중단한다', () => {
    const preparing = game();
    healthy(preparing.host, 500, 5_000);
    expect(preparing.host.decisionClock?.state).toBe('paused');
    expect(preparing.host.timeoutHistory).toHaveLength(0);

    const checking = game();
    ready(checking);
    healthy(checking.host, 500, 7_000);
    expect(checking.host.decisionClock?.state).toBe('paused');
    expect(checking.host.decisionClock?.remainingMs).toBe(0);
    expect(checking.host.timeoutHistory).toHaveLength(0);
  });

  it('2초 호스트 실행 공백은 마지막 정상 검사 시각에서 멈추고 한 번만 3초 보정한다', () => {
    const g = game();
    ready(g);
    healthy(g.host, 500, 1_000);
    g.host.advanceTime(3_000);
    expect(g.host.decisionClock?.state).toBe('paused');
    expect(g.host.decisionClock?.pauseReason).toBe('hostGap');
    expect(g.host.decisionClock?.remainingMs).toBe(4_000);
    expect(g.host.resumeDecision()).toBe(true);
    expect(g.host.decisionClock?.remainingMs).toBe(4_000);
    ready(g);
    healthy(g.host, 3_500, 5_500);
    g.host.pauseDecision('hostBackground');
    expect(g.host.decisionClock?.remainingMs).toBe(1_500);
    expect(g.host.resumeDecision()).toBe(true);
    expect(g.host.decisionClock?.remainingMs).toBe(3_000);
    expect(g.host.decisionClock?.recoveryGrantMs).toBe(1_500);
    ready(g);
    healthy(g.host, 6_000, 8_000);
    g.host.pauseDecision('hostBackground');
    expect(g.host.resumeDecision()).toBe(false);
    expect(g.host.decisionClock?.pauseReason).toBe('recoveryLimit');
  });

  it('강제 재시작한 running 시계는 시간 연속성을 추정하지 않는다', () => {
    const g = game();
    ready(g);
    healthy(g.host, 500, 1_000);
    const [wire] = createMemoryTransportPair();
    const restored = HostSession.fromJSON(wire, g.host.toJSON(), { random32: secrets(789) });
    expect(restored.decisionClock?.state).toBe('paused');
    expect(restored.decisionClock?.pauseReason).toBe('clockUnknown');
    expect(restored.decisionClock?.key.epoch).not.toBe(g.host.epoch);
    expect(restored.resumeDecision()).toBe(false);
    expect(restored.abortRound('호스트 시계 연속성 소실')).toBe(true);
    expect(restored.stage).toBe('settled');
  });
});

it('FR-53 공개 뷰 초과 정책: 보너스 포함 최소 ID·뒤집기·비동등 대상·수동 선택 기본값', () => {
  const base = game().host.hostView()!;
  const view = (pending: BoardView['pending'], legal: readonly Action[]): BoardView => ({
    ...base,
    phase: 'turn',
    pending,
    legal,
    seats: [{ ...base.seats[0], gukjinAsPi: true }, base.seats[1]],
  });
  const play: Action[] = [
    { type: 'play', seat: 0, card: 50 },
    { type: 'play', seat: 0, card: 48 },
    { type: 'flipOnly', seat: 0 },
  ];
  expect(timeoutAction(view({ kind: 'play', seat: 0 }, play))).toEqual(play[1]);
  expect(timeoutAction(view({ kind: 'play', seat: 0 }, [play[2]!]))).toEqual(play[2]);
  expect(timeoutAction(view({ kind: 'play', seat: 0 }, []))).toBeNull();
  expect(
    timeoutAction(
      view({ kind: 'target', seat: 0, source: 'play', card: 4, options: [11, 8] }, [
        { type: 'chooseTarget', seat: 0, card: 11 },
        { type: 'chooseTarget', seat: 0, card: 8 },
      ]),
    ),
  ).toEqual({ type: 'chooseTarget', seat: 0, card: 8 });
  expect(
    timeoutAction(
      view({ kind: 'goStop', seat: 0, score: 7, goCount: 0, stopAmount: 700 }, [
        { type: 'go', seat: 0 },
        { type: 'stop', seat: 0 },
      ]),
    ),
  ).toEqual({ type: 'stop', seat: 0 });
  expect(
    timeoutAction(
      view({ kind: 'shake', seat: 0, card: 4, month: 2 }, [
        { type: 'shake', seat: 0, accept: true },
        { type: 'shake', seat: 0, accept: false },
      ]),
    ),
  ).toEqual({ type: 'shake', seat: 0, accept: false });
  expect(
    timeoutAction(
      view({ kind: 'gukjin', seat: 0 }, [
        { type: 'gukjin', seat: 0, asPi: false },
        { type: 'gukjin', seat: 0, asPi: true },
      ]),
    ),
  ).toEqual({ type: 'gukjin', seat: 0, asPi: true });
  expect(
    timeoutAction(
      view({ kind: 'chongtong', seat: 0, months: [1] }, [
        { type: 'chongtong', seat: 0, choice: 'continue' },
        { type: 'chongtong', seat: 0, choice: 'end' },
      ]),
    ),
  ).toEqual({ type: 'chongtong', seat: 0, choice: 'end' });
});
