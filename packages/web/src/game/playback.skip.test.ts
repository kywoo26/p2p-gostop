// UX-16: 선 고르기·판 종료의 문구 읽기 대기도 탭 스킵과 배율 0에 즉시 따라야 한다.
import type { EngineEvent } from '@p2p-gostop/engine';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtures } from '../lib/fixtures.ts';
import { Playback } from './playback.svelte.ts';

type ReadWait = 'firstPicked' | 'roundEnded';

function events(kind: ReadWait): EngineEvent[] {
  if (kind === 'roundEnded') {
    return [{ type: 'RoundEnded', seq: 1, seat: 0, cards: [], reason: 'stop', winner: 0 }];
  }
  return [
    { type: 'Dealt', seq: 1, seat: 0, cards: [], dealer: 0, handCounts: [10, 10], deckCount: 23 },
    { type: 'FirstPicked', seq: 2, seat: null, cards: [0, 4], picks: [0, 4] },
  ];
}

let playback: Playback | null = null;
let root: HTMLDivElement | null = null;
let previousSpeed: string | undefined;

function mount(speed: string, onIdle?: (skipped: boolean) => void): Playback {
  previousSpeed = document.documentElement.dataset['speed'];
  document.documentElement.dataset['speed'] = speed;
  root = document.createElement('div');
  document.body.append(root);
  playback = new Playback(fixtures.board.states.play, {
    viewer: 0,
    names: () => ['나', '상대'],
    ...(onIdle === undefined ? {} : { onIdle }),
  });
  playback.attach(root);
  return playback;
}

async function nextInputReady(pb: Playback): Promise<number> {
  const start = performance.now();
  while (!pb.idle && performance.now() - start < 250) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(pb.idle).toBe(true);
  expect(pb.board.playable.length).toBeGreaterThan(0);
  return performance.now() - start;
}

afterEach(() => {
  playback?.dispose();
  playback = null;
  root?.remove();
  root = null;
  if (previousSpeed === undefined) delete document.documentElement.dataset['speed'];
  else document.documentElement.dataset['speed'] = previousSpeed;
  vi.restoreAllMocks();
});

test.each(['firstPicked', 'roundEnded'] as const)(
  '%s 읽기 대기 중 탭 스킵 뒤 250ms 안에 다음 입력이 가능하다',
  async (kind) => {
    let skippedAtIdle = false;
    const pb = mount('normal', (skipped) => (skippedAtIdle = skipped));
    pb.enqueue(events(kind), fixtures.board.states.play);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(pb.busy).toBe(true);
    pb.skip();
    expect(await nextInputReady(pb)).toBeLessThan(200);
    expect(skippedAtIdle).toBe(true);
  },
);

test.each(['firstPicked', 'roundEnded'] as const)(
  '%s 읽기 대기 전에 스킵해도 새 타이머를 시작하지 않는다',
  async (kind) => {
    const pb = mount('normal');
    pb.enqueue(events(kind), fixtures.board.states.play);
    pb.skip();
    expect(await nextInputReady(pb)).toBeLessThan(200);
  },
);

test.each(['instant', 'reduced'] as const)(
  '%s에서는 판 종료 읽기 대기 없이 다음 입력이 가능하다',
  async (mode) => {
    if (mode === 'reduced') {
      const real = window.matchMedia.bind(window);
      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
        query.includes('prefers-reduced-motion')
          ? ({ ...real(query), matches: true } as MediaQueryList)
          : real(query),
      );
    }
    const pb = mount(mode === 'instant' ? 'instant' : 'normal');
    pb.enqueue(events('roundEnded'), fixtures.board.states.play);
    expect(await nextInputReady(pb)).toBeLessThan(200);
  },
);
