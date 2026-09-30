// NF-03·AC-06·NP-03: 도착 지연은 합성이며 실제 해외망 RTT가 아니다.
import { scoreCaptured, type EngineEvent } from '@p2p-gostop/engine';
import { tick } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtures } from '../lib/fixtures.ts';
import { snap } from './display.ts';
import { Playback, type PlaybackOptions, type RoundSummary } from './playback.svelte.ts';
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

async function setup(options: Partial<PlaybackOptions> = {}, attached = true) {
  prior = document.documentElement.dataset['speed'];
  document.documentElement.dataset['speed'] = 'normal';
  root = document.createElement('div');
  document.body.append(root);
  const onIdle = vi.fn();
  pb = new Playback(initial, { viewer: 0, names: () => ['좌석0', '좌석1'], onIdle, ...options });
  if (attached) pb.attach(root);
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

// 공개 callback의 합성 재진입. 실제 vibrateFor/사용자 장면에서 reset/throw가 났다는 증거가 아니다.
test.each([false, true])(
  '옛 callback reset→새 FIFO→throw: attached=%s 새 선택/정산을 보존한다',
  async (attached) => {
    const latest = { ...fixtures.board.states.target, round: initial.round + 1 };
    const summary = {
      view: fixtures.settlement,
      instant: [],
      nextCarry: null,
    } as unknown as RoundSummary;
    const onIdle = await setup(
      {
        onBanner: () => {
          pb.reset(latest);
          pb.enqueue([{ type: 'CardFlipped', seq: 8, seat: 0, cards: [8] }], latest);
          pb.enqueue([{ type: 'CardFlipped', seq: 9, seat: 0, cards: [12] }], latest);
          pb.enqueue(
            [{ type: 'RoundEnded', seq: 10, seat: 0, cards: [], reason: 'stop', winner: 0 }],
            latest,
            { settlement: summary },
          );
          pb.skip(); // 새 세대의 스킵도 옛 play의 finally가 해제하지 않아야 한다.
          throw new Error('synthetic callback exception');
        },
      },
      attached,
    );
    const during: { busy: boolean; scale: string }[] = [];
    const sound = vi.spyOn(sounds, 'play').mockImplementation((kind) => {
      if (kind === 'flip')
        during.push({ busy: pb.busy, scale: root.style.getPropertyValue('--dur-scale') });
    });
    vi.spyOn(log, 'error').mockImplementation(() => {});
    pb.enqueue([{ type: 'Jjok', seq: 1, seat: 0, cards: [4, 5] }], initial, {
      action: { type: 'play', seat: 0, card: 0 },
      tapAt: performance.now(),
    });
    await vi.waitFor(() => expect(during.length).toBeGreaterThan(0));
    expect(during[0]).toEqual({ busy: true, scale: attached ? '0' : '' });
    await vi.waitFor(() => expect(pb.settlement).toBe(summary));
    expect(sound.mock.calls.map(([kind]) => kind)).toEqual(['jjok', 'flip', 'flip', 'end']);
    expect(during).toEqual([
      { busy: true, scale: attached ? '0' : '' },
      { busy: true, scale: attached ? '0' : '' },
    ]);
    expect(pb.board).toEqual(snap(latest, latest.inFlight));
    expect(pb.pending).toBe(0);
    expect(pb.busy).toBe(false);
    expect(pb.timings).toEqual([]);
    expect(onIdle).not.toHaveBeenCalled();
    pb.release();
    expect(pb.idle).toBe(true);
    expect(onIdle).toHaveBeenCalledTimes(1);
  },
);

const zero = scoreCaptured({ gwang: [], yeol: [], tti: [], pi: [] }, false);
const godori: EngineEvent = {
  type: 'ScoreChanged',
  seq: 4,
  seat: 0,
  cards: [],
  breakdown: { ...zero, godori: 5, total: 5 },
};
const dealt: EngineEvent = {
  type: 'Dealt',
  seq: 5,
  seat: 0,
  cards: [],
  dealer: 0,
  handCounts: [10, 10],
  deckCount: 23,
};

test.each(['detached', 'deal', 'replay'] as const)(
  '%s callback reset: 옛 payout/ScoreChanged를 막고 새 세대 flip/족보를 한 번 재생한다',
  async (mode) => {
    const latest = {
      ...initial,
      round: initial.round + 1,
      seats: [
        { ...initial.seats[0], score: 0 },
        { ...initial.seats[1], score: 0 },
      ] as const,
    };
    const onIdle = await setup(
      {
        onBanner: () => {
          pb.reset(latest);
          pb.enqueue([godori, { type: 'CardFlipped', seq: 8, seat: 0, cards: [8] }], latest);
        },
      },
      mode !== 'detached',
    );
    document.documentElement.dataset['speed'] = 'instant';
    const sound = vi.spyOn(sounds, 'play').mockImplementation(() => {});
    const old: EngineEvent[] = [
      { type: 'Jjok', seq: 1, seat: 0, cards: [4, 5] },
      { type: 'InstantPayout', seq: 2, seat: 0, cards: [], kind: 'firstPpeok', points: 2, from: 1 },
      godori,
    ];
    if (mode === 'deal') old.push(dealt);
    pb.enqueue(old, initial);
    await vi.waitFor(() => expect(pb.idle).toBe(true));
    expect(sound.mock.calls.map(([kind]) => kind)).toEqual(['jjok', 'flip']);
    expect(pb.toast).toBeNull();
    expect(pb.banner).toBeNull();
    expect(pb.milestones.map(({ round, text }) => ({ round, text }))).toEqual([
      { round: latest.round, text: '고도리' },
    ]);
    expect(pb.board).toEqual(snap(latest));
    expect(pb.pending).toBe(0);
    expect(onIdle).toHaveBeenCalledTimes(1);
  },
);

test.each(['detached', 'deal', 'replay'] as const)(
  '%s callback dispose: 잔여 효과와 idle을 차단한다',
  async (mode) => {
    const onIdle = await setup({ onBanner: () => pb.dispose() }, mode !== 'detached');
    document.documentElement.dataset['speed'] = 'instant';
    const sound = vi.spyOn(sounds, 'play').mockImplementation(() => {});
    const old: EngineEvent[] = [
      { type: 'Jjok', seq: 1, seat: 0, cards: [4, 5] },
      { type: 'InstantPayout', seq: 2, seat: 0, cards: [], kind: 'firstPpeok', points: 2, from: 1 },
      godori,
    ];
    if (mode === 'deal') old.push(dealt);
    pb.enqueue(old, initial);
    await vi.waitFor(() => expect(pb.busy).toBe(false));
    expect(sound.mock.calls.map(([kind]) => kind)).toEqual(['jjok']);
    expect(pb.toast).toBeNull();
    expect(pb.banner).toBeNull();
    expect(pb.milestones).toEqual([]);
    expect(pb.pending).toBe(0);
    expect(onIdle).not.toHaveBeenCalled();
  },
);

test('names callback reset 뒤 옛 toast를 쓰지 않고 새 세대를 진행한다', async () => {
  const latest = { ...initial, round: initial.round + 1 };
  await setup({
    names: () => {
      pb.reset(latest);
      pb.enqueue([{ type: 'CardFlipped', seq: 8, seat: 0, cards: [8] }], latest);
      return ['좌석0', '좌석1'];
    },
  });
  document.documentElement.dataset['speed'] = 'instant';
  const sound = vi.spyOn(sounds, 'play').mockImplementation(() => {});
  pb.enqueue(
    [{ type: 'InstantPayout', seq: 2, seat: 0, cards: [], kind: 'firstPpeok', points: 2, from: 1 }],
    initial,
  );
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(pb.toast).toBeNull();
  expect(pb.board).toEqual(snap(latest));
  expect(sound.mock.calls.map(([kind]) => kind)).toEqual(['payout', 'flip']);
});

test('Bomb 배너 callback reset은 같은 이벤트의 뒤쪽 toast/names도 차단한다', async () => {
  const latest = { ...initial, round: initial.round + 1 };
  const names = vi.fn(() => ['좌석0', '좌석1'] as const);
  await setup(
    {
      names,
      onBanner: () => {
        pb.reset(latest);
        pb.enqueue([{ type: 'CardFlipped', seq: 8, seat: 0, cards: [8] }], latest);
      },
    },
    false,
  );
  const sound = vi.spyOn(sounds, 'play').mockImplementation(() => {});
  pb.enqueue(
    [{ type: 'Bomb', seq: 1, seat: 0, cards: [4, 5, 6], month: 2, handCards: 3 }],
    initial,
  );
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(names).not.toHaveBeenCalled();
  expect(pb.toast).toBeNull();
  expect(sound.mock.calls.map(([kind]) => kind)).toEqual(['bomb', 'flip']);
});

test('같은 세대 callback enqueue는 옛 잔여 이벤트와 새 FIFO를 보존한다', async () => {
  await setup(
    { onBanner: () => pb.enqueue([{ type: 'CardFlipped', seq: 8, seat: 0, cards: [8] }], initial) },
    false,
  );
  const sound = vi.spyOn(sounds, 'play').mockImplementation(() => {});
  pb.enqueue(
    [
      { type: 'Jjok', seq: 1, seat: 0, cards: [4, 5] },
      { type: 'InstantPayout', seq: 2, seat: 0, cards: [], kind: 'firstPpeok', points: 2, from: 1 },
    ],
    initial,
  );
  await vi.waitFor(() => expect(pb.idle).toBe(true));
  expect(sound.mock.calls.map(([kind]) => kind)).toEqual(['jjok', 'payout', 'flip']);
  expect(pb.toast?.text).toContain('첫뻑');
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

test('진단 로그 append 비용: 같은 즉시 묶음 워밍업1 + 7회 (DOM/실기기 부하와 별개)', async ({
  annotate,
}) => {
  await setup();
  vi.spyOn(sounds, 'play').mockImplementation(() => {});
  const original = log.info.bind(log);
  const appendMs: number[] = [];
  vi.spyOn(log, 'info').mockImplementation((line) => {
    const start = performance.now();
    original(line);
    appendMs.push(performance.now() - start);
  });
  for (let sample = 0; sample < 8; sample++) {
    root.style.setProperty('--dur-scale', '0');
    pb.enqueue(events, initial, {
      action: { type: 'play', seat: 0, card: 0 },
      tapAt: performance.now(),
    });
    await vi.waitFor(() => expect(pb.idle).toBe(true));
  }
  expect(appendMs).toHaveLength(8);
  const measured = appendMs.slice(1).sort((a, b) => a - b);
  await annotate(
    `PDR synthetic log append n=7 warmup=${appendMs[0]}ms p50=${measured[3]}ms max=${measured.at(-1)}ms (문자열 준비·DOM·실기기 제외)`,
  );
});
