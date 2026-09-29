// UX-15·AC-06: 같은 시드·손패·바닥에서 짧은 턴, 대표 획득 턴, 사건 턴을 재현한다.
// 첫 판의 선 고르기부터 합법 수 열을 고정해 저장 세션을 만든다. 이벤트 열까지 확인하므로
// 엔진 경로가 바뀌면 느슨한 시간 표본으로 조용히 대체하지 않고 fixture 검증에서 실패한다.
import { PRESETS, type Action } from '@p2p-gostop/engine';
import { expect } from '@playwright/test';
import { createSession, sessionAct } from '../src/game/session.ts';

const SEED = 1;
const SHARED_HISTORY: readonly Action[] = [
  { type: 'pickFirst', seat: 0, index: 4 },
  { type: 'pickFirst', seat: 1, index: 5 },
  { type: 'play', seat: 1, card: 39 },
  { type: 'play', seat: 0, card: 32 },
  { type: 'chooseTarget', seat: 0, card: 33 },
  { type: 'play', seat: 1, card: 16 },
  { type: 'play', seat: 0, card: 22 },
  { type: 'play', seat: 1, card: 3 },
  { type: 'play', seat: 0, card: 40 },
  { type: 'play', seat: 1, card: 14 },
];

const BANNER_HISTORY: readonly Action[] = [
  ...SHARED_HISTORY,
  { type: 'play', seat: 0, card: 41 },
  { type: 'play', seat: 1, card: 25 },
];

type Range = readonly [minimum: number, maximum: number];

export interface TimingFixture {
  readonly id: 'no-match' | 'match-capture' | 'banner';
  readonly label: string;
  readonly history: readonly Action[];
  readonly card: number;
  readonly hand: readonly number[];
  readonly floor: readonly (readonly [number, readonly number[]])[];
  readonly deckTop: number;
  readonly events: readonly string[];
  /** 실제 브라우저의 턴 계측 p50 범위(ms). 배너 표시는 카드 이동과 겹친다. */
  readonly fast: Range;
  readonly normal: Range;
}

const SHARED_FLOOR = [
  [4, [14]],
  [5, [16]],
  [6, [22]],
  [8, [29]],
  [10, [37]],
  [12, [47]],
] as const;

/** 경로별 예상 범위 표. 보통 하한은 매칭+획득 대표 경로에 적용하고 짧은 경로는 별도 검사한다. */
export const TIMING_FIXTURES: readonly TimingFixture[] = [
  {
    id: 'no-match',
    label: '매칭 없음',
    history: SHARED_HISTORY,
    card: 41,
    hand: [50, 19, 41, 23, 46, 13, 17],
    floor: SHARED_FLOOR,
    deckTop: 7,
    events: ['CardPlayed', 'CardFlipped', 'Placed', 'Placed'],
    fast: [250, 700],
    normal: [1000, 1600],
  },
  {
    id: 'match-capture',
    label: '매칭+획득',
    history: SHARED_HISTORY,
    card: 13,
    hand: [50, 19, 41, 23, 46, 13, 17],
    floor: SHARED_FLOOR,
    deckTop: 7,
    events: ['CardPlayed', 'CardFlipped', 'Matched:play', 'Placed', 'Captured:2', 'ScoreChanged'],
    fast: [450, 700],
    normal: [1400, 2400],
  },
  {
    id: 'banner',
    label: '사건 배너(뻑)',
    history: BANNER_HISTORY,
    card: 13,
    hand: [50, 19, 23, 46, 13, 17],
    floor: [
      [2, [7]],
      [4, [14]],
      [5, [16]],
      [6, [22]],
      [8, [29]],
      [10, [37]],
      [11, [41]],
      [12, [47]],
    ],
    deckTop: 15,
    events: ['CardPlayed', 'CardFlipped', 'Ppeok'],
    fast: [250, 700],
    normal: [1000, 1600],
  },
];

function eventPath(event: {
  readonly type: string;
  readonly source?: string;
  readonly cards?: readonly number[];
}): string {
  if (event.type === 'Matched') return `Matched:${event.source}`;
  if (event.type === 'Captured') return `Captured:${event.cards?.length}`;
  return event.type;
}

/** 브라우저가 이어하기로 읽을 수 있는 고정 저장본. 실패 시 시드·액션·이벤트 경로를 남긴다. */
export function timingSave(fixture: TimingFixture) {
  let session = createSession({
    preset: 'standard',
    rules: PRESETS.standard,
    perPoint: 100,
    startBalance: 3000,
    names: ['나', '상대'],
    seed: SEED,
  }).session;
  for (const action of fixture.history) {
    const step = sessionAct(session, action);
    if (!step.ok)
      throw new Error(
        `${fixture.id} seed=${SEED} 선행 액션 ${JSON.stringify(action)}: ${step.message}`,
      );
    session = step.session;
  }
  const context = `${fixture.id} seed=${SEED} card=${fixture.card} history=${JSON.stringify(fixture.history)}`;
  expect(session.phase, context).toBe('playing');
  expect(session.game.pending, context).toEqual({ kind: 'play', seat: 0 });
  expect(session.game.seats[0].hand, context).toEqual(fixture.hand);
  expect(
    session.game.floor.map((group) => [group.month, group.cards]),
    context,
  ).toEqual(fixture.floor);
  expect(session.game.deck[0], context).toBe(fixture.deckTop);
  const action = { type: 'play' as const, seat: 0 as const, card: fixture.card };
  const preview = sessionAct(session, action);
  if (!preview.ok) throw new Error(`${context}: ${preview.message}`);
  expect(preview.session.phase, context).toBe('playing');
  expect(preview.session.game.pending?.kind, context).toBe('play');
  expect(preview.events.map(eventPath), context).toEqual(fixture.events);
  return { version: 1 as const, difficulty: 'easy' as const, session };
}
