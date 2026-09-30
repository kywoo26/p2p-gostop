// NF-03·AC-06·NP-03: 도착 지연은 합성이며 실제 해외망 RTT가 아니다.
import type { EngineEvent } from '@p2p-gostop/engine';
import { tick } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtures } from '../lib/fixtures.ts';
import { snap } from './display.ts';
import { Playback, type RoundSummary } from './playback.svelte.ts';
import { sounds } from './sound.ts';
import { log } from './log.svelte.ts';

const initial = fixtures.board.states.play;
const events: EngineEvent[] = [
  { type: 'CardPlayed', seq: 1, seat: 0, cards: [initial.seats[0].hand?.[0] ?? 0], bonus: false },
  { type: 'CardFlipped', seq: 2, seat: 0, cards: [4] },
  { type: 'Jjok', seq: 3, seat: 0, cards: [4, 5] },
];
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let pb: Playback;
let root: HTMLDivElement;
let prior: string | undefined;

async function setup() {
  prior = document.documentElement.dataset['speed'];
  document.documentElement.dataset['speed'] = 'normal';
  root = document.createElement('div');
  document.body.append(root);
  const onIdle = vi.fn();
  pb = new Playback(initial, { viewer: 0, names: () => ['좌석0', '좌석1'], onIdle });
  pb.attach(root);
  await tick();
  onIdle.mockClear();
  return onIdle;
}

afterEach(() => {
  pb?.dispose();
  root?.remove();
  if (prior === undefined) delete document.documentElement.dataset['speed'];
  else document.documentElement.dataset['speed'] = prior;
  vi.restoreAllMocks();
});

test.each([50, 150, 300])(
  'reset snapshot 도착 +%ims: 옛 재생·콜아웃·계측이 최신 선택창을 덮지 않는다',
  async (delay) => {
    const onIdle = await setup();
    const sound = vi.spyOn(sounds, 'play').mockImplementation(() => {});
    pb.enqueue(events, initial, {
      action: { type: 'play', seat: 0, card: 0 },
      tapAt: performance.now(),
    });
    await pause(delay);
    expect(pb.busy).toBe(true);
    const latest = { ...fixtures.board.states.target, round: initial.round + 1 };
    pb.reset(latest);
    const seen = sound.mock.calls.length;
    await vi.waitFor(() => expect(pb.idle).toBe(true));
    expect(pb.board).toEqual(snap(latest, latest.inFlight));
    expect(pb.pending).toBe(0);
    expect(pb.banner).toBeNull();
    expect(pb.milestones).toEqual([]);
    expect(pb.timings).toEqual([]);
    expect(sound.mock.calls).toHaveLength(seen);
    expect(onIdle).toHaveBeenCalledTimes(1);
  },
);

test('dispose는 진행 중 재생과 판 종료 읽기 대기의 뒤늦은 정산·idle을 차단한다', async () => {
  const onIdle = await setup();
  const summary = {
    view: fixtures.settlement,
    instant: [],
    nextCarry: null,
  } as unknown as RoundSummary;
  pb.enqueue(
    [{ type: 'RoundEnded', seq: 1, seat: 0, cards: [], reason: 'stop', winner: 0 }],
    initial,
    { settlement: summary },
  );
  await pause(30);
  pb.dispose();
  const board = pb.board;
  await pause(100);
  expect(pb.board).toBe(board);
  expect(pb.busy).toBe(false);
  expect(pb.settlement).toBeNull();
  expect(onIdle).not.toHaveBeenCalled();
});

test('reset 직후 새 burst는 FIFO로 한 번씩 재생되고 마지막 snapshot으로 수렴한다', async () => {
  const onIdle = await setup();
  const sound = vi.spyOn(sounds, 'play').mockImplementation(() => {});
  pb.enqueue(events, initial);
  await pause(50);
  const latest = { ...initial, round: initial.round + 1 };
  pb.reset(latest);
  document.documentElement.dataset['speed'] = 'instant';
  pb.enqueue([{ type: 'CardFlipped', seq: 4, seat: 0, cards: [8] }], latest);
  pb.enqueue([{ type: 'CardFlipped', seq: 5, seat: 0, cards: [12] }], latest);
  pb.enqueue([], fixtures.board.states.goStop);
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(sound.mock.calls.filter(([kind]) => kind === 'flip')).toHaveLength(2);
  expect(pb.board).toEqual(snap(fixtures.board.states.goStop));
  expect(onIdle).toHaveBeenCalledTimes(1);
});

test('detach/reattach는 수락된 이벤트를 한 번씩 끝내며 큐 대기와 최초 commit을 분리한다', async () => {
  await setup();
  const sound = vi.spyOn(sounds, 'play').mockImplementation(() => {});
  const info = vi.spyOn(log, 'info');
  const tapAt = performance.now() - 150; // 합성 입력→enqueue 간격: 실제 RTT가 아니다.
  pb.enqueue(events, initial, { action: { type: 'play', seat: 0, card: 0 }, tapAt });
  pb.enqueue(events.slice(1, 2), initial, {
    action: { type: 'flipOnly', seat: 0 },
    tapAt: performance.now(),
  });
  await pause(50);
  pb.attach(null);
  pb.attach(root);
  pb.skip();
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(sound.mock.calls.filter(([kind]) => kind === 'flip')).toHaveLength(2);
  expect(pb.board).toEqual(snap(initial));
  expect(pb.timings).toHaveLength(2);
  const [first, second] = pb.timings;
  expect(first!.inputToEnqueueMs).toBeGreaterThanOrEqual(150);
  expect(second!.queueMs).toBeGreaterThanOrEqual(40);
  for (const timing of pb.timings) {
    expect(
      Math.abs(
        timing.ms - timing.inputToEnqueueMs - timing.queueMs - timing.replayMs - timing.snapMs,
      ),
    ).toBeLessThanOrEqual(3);
    expect(timing.firstCommitMs).toBeLessThanOrEqual(timing.ms);
    expect(timing.steps.length).toBeLessThanOrEqual(12);
  }
  expect(info.mock.calls.every(([line]) => line.length < 512)).toBe(true);
});

test('상대 턴은 수신 이후만 한 줄 기록하고 내 탭 계측 표본에 섞지 않는다', async () => {
  await setup();
  const info = vi.spyOn(log, 'info');
  pb.enqueue(
    events.map((e) => ({ ...e, seat: 1 })),
    initial,
  );
  pb.skip();
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(pb.timings).toEqual([]);
  expect(info).toHaveBeenCalledTimes(1);
  expect(info.mock.calls[0]![0]).toMatch(/^재생 시간 관측=상대 수신이후=/);
  expect(info.mock.calls[0]![0]).not.toMatch(/cards|좌석0|좌석1|RTT/);
});
