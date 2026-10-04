// PR255: synthetic 증거의 판정 회귀. 실제 앱·paint·성능 성공으로 전용하지 않는다.
import { expect, test } from '@playwright/test';
import {
  classifyStage49,
  type Stage49Evidence,
  type Stage49Failure,
  type Stage49Frame,
  type Stage49Record,
  type Stage49Rect,
  type Stage49Snapshot,
} from './landing-staging-contract.ts';

const hand: Stage49Rect = { x: 20, y: 300, width: 42, height: 68 };
const stage: Stage49Rect = { x: 160, y: 180, width: 42, height: 68 };
const midway: Stage49Rect = { x: 90, y: 240, width: 42, height: 68 };
const pile: Stage49Rect = { x: 240, y: 360, width: 30, height: 48 };

// 기대값을 classifier에서 계산하지 않는 독립 고정 DOM/WAAPI 증거.
function normal(sparse = false): { evidence: Stage49Evidence; frames: Stage49Frame[] } {
  const snapshot = (ghostRect: Stage49Rect, captured = false): Stage49Snapshot => ({
    root: 1,
    ghost: 3,
    native: captured ? null : 4,
    ghostRect: { ...ghostRect },
    nativeRect: captured ? null : { ...stage },
    hidden: !captured,
    nativeAnimations: 0,
    ghosts: 1,
    count: captured ? 1 : 0,
    endpoint: captured ? { identity: 8, kind: 'card', cardId: '49', rect: { ...pile } } : null,
    scenes: 1,
    hiddenCards: 1,
  });
  const record = (
    seq: number,
    event: Stage49Record['event'],
    animation: number,
    target: 'ghost' | 'light',
    targetIdentity: number,
    state: Stage49Snapshot,
  ): Stage49Record => ({
    seq,
    event,
    animation,
    target,
    targetIdentity,
    snapshot: state,
    label: 'diagnostic only',
  });
  const cleanup: Stage49Snapshot = {
    ...snapshot(pile, true),
    ghost: null,
    ghostRect: null,
    ghosts: 0,
    scenes: 0,
    hiddenCards: 0,
  };
  const records: Stage49Record[] = [
    record(0, 'created', 5, 'ghost', 3, snapshot(hand)),
    record(1, 'fulfilled', 5, 'ghost', 3, snapshot(stage)),
    record(2, 'created', 7, 'light', 6, snapshot(stage)),
    record(3, 'fulfilled', 7, 'light', 6, snapshot(stage)),
    // count1은 capture finished 이전이다. 제품의 commit→move 순서를 보존한다.
    record(4, 'created', 9, 'ghost', 3, snapshot(stage, true)),
    record(5, 'fulfilled', 9, 'ghost', 3, snapshot(pile, true)),
    {
      seq: 6,
      event: 'cleanup',
      animation: null,
      target: null,
      targetIdentity: null,
      snapshot: cleanup,
      label: 'cleanup',
    },
  ];
  const frame = (t: number, ghostRect: Stage49Rect): Stage49Frame => ({
    t,
    native: [{ id: '49', ...stage, hidden: true, animations: 0 }],
    ghosts: [{ id: '49', ...ghostRect }],
    counts: [0],
  });
  return {
    evidence: {
      version: 1,
      root: 1,
      hand: { ...hand },
      handIdentity: 2,
      initialCount: 0,
      records,
      errors: [],
      overflow: false,
      lateRegistration: false,
      restored: true,
      pending: 0,
    },
    frames: [
      ...(sparse ? [] : [frame(0, hand), frame(70, { ...midway, y: 260 })]),
      frame(120, midway),
      frame(270, stage),
      { t: 500, native: [], ghosts: [], counts: [1] },
    ],
  };
}

// 제품의 해제→Captured commit→새 pulseCaptured 세대와 같은 독립 증거.
function replacement(sparse = false): ReturnType<typeof normal> {
  const value = normal(sparse);
  const records = value.evidence.records;
  const fresh = (record: Stage49Record): Stage49Record => ({
    ...record,
    animation: 11,
    target: 'light',
    targetIdentity: 10,
    snapshot: {
      ...record.snapshot!,
      ghost: 9,
      ghostRect: { ...pile },
      native: null,
      nativeRect: null,
      hidden: false,
      count: 1,
      endpoint: { identity: 8, kind: 'card', cardId: '49', rect: { ...pile } },
    },
  });
  const lifetime = (seq: number, committed: boolean): Stage49Record => ({
    seq,
    event: 'lifetime',
    animation: null,
    target: null,
    targetIdentity: null,
    snapshot: null,
    label: 'diagnostic only',
    lifecycle: {
      root: 1,
      ghost: null,
      native: committed ? null : 4,
      ghosts: 0,
      count: committed ? 1 : 0,
      endpoint: committed ? 8 : null,
    },
  });
  value.evidence.records = [
    records[0]!,
    records[1]!,
    lifetime(2, false),
    lifetime(3, true),
    { ...fresh(records[2]!), seq: 4 },
    { ...fresh(records[3]!), seq: 5 },
    records[6]!,
  ];
  return value;
}

test('stage49 충분한 RAF + 실제 의미 증거는 정상이다 @guest', () => {
  for (const factory of [normal, replacement]) {
    const value = factory();
    expect(classifyStage49(value.evidence, value.frames)).toEqual({ ok: true, failures: [] });
  }
});

test('stage49 희소 active RAF2 + 완전 의미 증거는 정상이다 @guest', () => {
  for (const factory of [normal, replacement]) {
    const value = factory(true);
    expect(value.frames.filter((f) => f.native.length)).toHaveLength(2);
    expect(classifyStage49(value.evidence, value.frames)).toEqual({ ok: true, failures: [] });
  }
});

type Value = ReturnType<typeof normal>;
interface Counterexample {
  name: string;
  mutation: string;
  failure: Stage49Failure;
  change(value: Value): void;
}
const cases: Counterexample[] = [
  {
    name: '수집0',
    mutation: 'records 전체 제거',
    failure: 'evidence-incomplete',
    change: (v) => {
      v.evidence.records = [];
    },
  },
  {
    name: '필수phase 누락',
    mutation: '첫 staging fulfilled 제거',
    failure: 'evidence-incomplete',
    change: (v) => {
      v.evidence.records.splice(1, 1);
    },
  },
  {
    name: 'native 이동',
    mutation: 'active RAF native x +1',
    failure: 'native-moved',
    change: (v) => {
      v.frames[0]!.native[0]!.x += 1;
    },
  },
  {
    name: 'native 노출',
    mutation: 'active RAF native hidden=false',
    failure: 'native-visible',
    change: (v) => {
      v.frames[0]!.native[0]!.hidden = false;
    },
  },
  {
    name: 'native animation',
    mutation: 'active RAF native animations=1',
    failure: 'native-animation',
    change: (v) => {
      v.frames[0]!.native[0]!.animations = 1;
    },
  },
  {
    name: 'ghost0',
    mutation: 'active RAF ghosts=[]',
    failure: 'ghost-count',
    change: (v) => {
      v.frames[0]!.ghosts = [];
    },
  },
  {
    name: 'ghost2',
    mutation: 'active RAF ghost49 복제',
    failure: 'ghost-count',
    change: (v) => {
      v.frames[0]!.ghosts.push({ ...v.frames[0]!.ghosts[0]! });
    },
  },
  {
    name: 'ghost 정지',
    mutation: '모든 active RAF ghost pose를 출발점으로 고정; 라벨만 정상',
    failure: 'ghost-stationary',
    change: (v) => {
      for (const f of v.frames.filter((f) => f.native.length)) f.ghosts = [{ id: '49', ...hand }];
    },
  },
  {
    name: 'staging 오착',
    mutation: '첫 move fulfilled ghost x +1',
    failure: 'staging-mislanded',
    change: (v) => {
      v.evidence.records[1]!.snapshot!.ghostRect!.x += 1;
    },
  },
  {
    name: 'launch/pre-capture 조기count1',
    mutation: 'launch count=1',
    failure: 'early-capture',
    change: (v) => {
      v.evidence.records[0]!.snapshot!.count = 1;
    },
  },
  {
    name: 'capture 표시 누락',
    mutation: 'capture 이동 또는 새 light created/fulfilled 제거; count1/cleanup 유지',
    failure: 'capture-missing',
    change: (v) => {
      v.evidence.records.splice(4, 2);
    },
  },
  {
    name: 'capture 오착',
    mutation: 'capture fulfilled ghost x +1',
    failure: 'capture-mislanded',
    change: (v) => {
      v.evidence.records[5]!.snapshot!.ghostRect!.x += 1;
    },
  },
  {
    name: '최종획득 누락',
    mutation: '최종 RAF count=0',
    failure: 'final-capture-missing',
    change: (v) => {
      v.frames.at(-1)!.counts = [0];
    },
  },
  {
    name: 'stale root',
    mutation: 'capture fulfilled root identity 교체',
    failure: 'stale-identity',
    change: (v) => {
      v.evidence.records[5]!.snapshot!.root = 99;
    },
  },
  {
    name: 'stale card/ghost identity',
    mutation: 'landed native identity 교체',
    failure: 'stale-identity',
    change: (v) => {
      v.evidence.records[1]!.snapshot!.native = 99;
    },
  },
  {
    name: '이동 promise rejection 정상라벨 위장',
    mutation: '첫 move fulfilled를 rejected로 변경, 라벨 유지',
    failure: 'animation-rejected',
    change: (v) => {
      v.evidence.records[1]!.event = 'rejected';
    },
  },
];

for (const counterexample of cases) {
  test(`stage49 ${counterexample.name}는 실패한다 @guest`, () => {
    for (const factory of [normal, replacement]) {
      const value = factory();
      counterexample.change(value);
      const result = classifyStage49(value.evidence, value.frames);
      expect(result.ok, counterexample.mutation).toBe(false);
      expect(result.failures, counterexample.mutation).toContain(counterexample.failure);
      // phase 이름은 실제 DOM 오류를 덮을 수 없다.
      for (const record of value.evidence.records)
        record.label = 'launch landed capture cleanup normal';
      expect(classifyStage49(value.evidence, value.frames).failures).toContain(
        counterexample.failure,
      );
    }
    if (counterexample.name === '필수phase 누락') {
      const insufficient = normal(true);
      insufficient.frames = [insufficient.frames[1]!, insufficient.frames.at(-1)!];
      expect(classifyStage49(insufficient.evidence, insufficient.frames).failures).toContain(
        'evidence-incomplete',
      );
      for (const field of ['overflow', 'lateRegistration'] as const) {
        const incomplete = normal();
        incomplete.evidence[field] = true;
        expect(classifyStage49(incomplete.evidence, incomplete.frames).failures).toContain(
          'evidence-incomplete',
        );
      }
      const errored = normal();
      errored.evidence.errors = ['observation-error'];
      expect(classifyStage49(errored.evidence, errored.frames).failures).toContain(
        'evidence-incomplete',
      );
    }
    if (counterexample.name === '필수phase 누락') {
      for (const index of [2, 3]) {
        const missing = replacement();
        missing.evidence.records.splice(index, 1);
        missing.evidence.records.forEach((r, seq) => {
          r.seq = seq;
        });
        expect(classifyStage49(missing.evidence, missing.frames).failures).toContain(
          'evidence-incomplete',
        );
      }
    }
    if (counterexample.name === 'launch/pre-capture 조기count1') {
      const earlyReplacement = replacement();
      earlyReplacement.evidence.records[2]!.lifecycle!.count = 1;
      expect(classifyStage49(earlyReplacement.evidence, earlyReplacement.frames).ok).toBe(false);
      const premature = replacement();
      premature.evidence.records[2]!.lifecycle!.ghost = 9;
      expect(classifyStage49(premature.evidence, premature.frames).failures).toContain(
        'early-capture',
      );
      const preCapture = normal();
      preCapture.evidence.records[2]!.snapshot!.count = 1;
      expect(classifyStage49(preCapture.evidence, preCapture.frames).failures).toContain(
        'early-capture',
      );
    }
    if (counterexample.name === 'capture 오착') {
      const wrongStart = replacement();
      wrongStart.evidence.records[4]!.snapshot!.ghostRect!.x += 1;
      expect(classifyStage49(wrongStart.evidence, wrongStart.frames).failures).toContain(
        'capture-mislanded',
      );
    }
    if (counterexample.name === '이동 promise rejection 정상라벨 위장') {
      const rejected = replacement();
      rejected.evidence.records[5]!.event = 'rejected';
      expect(classifyStage49(rejected.evidence, rejected.frames).failures).toContain(
        'animation-rejected',
      );
    }
    if (counterexample.name === 'stale card/ghost identity') {
      const reused = replacement();
      reused.evidence.records[4]!.snapshot!.ghost = 3;
      expect(classifyStage49(reused.evidence, reused.frames).failures).toContain('stale-identity');
      const changed = replacement();
      changed.evidence.records[5]!.snapshot!.ghost = 99;
      expect(classifyStage49(changed.evidence, changed.frames).failures).toContain(
        'stale-identity',
      );
      const staleGhost = normal();
      staleGhost.evidence.records[5]!.snapshot!.ghost = 99;
      expect(classifyStage49(staleGhost.evidence, staleGhost.frames).failures).toContain(
        'stale-identity',
      );
    }
  });
}

// F01: count1/pose/finished를 유지해도 실제 획득 card49가 없으면 두 경로 모두 실패한다.
for (const wrongId of [false, true]) {
  test(`stage49 ${wrongId ? 'wrongID' : 'missing49'}+count1은 두 표시 경로에서 실패한다 @guest`, () => {
    for (const factory of [normal, replacement]) {
      // commit/표시 완료/cleanup 각각의 단일 공개 endpoint 변이.
      for (const event of ['created', 'fulfilled', 'cleanup'] as const) {
        const value = factory();
        const record = value.evidence.records.find(
          (r) => r.event === event && r.snapshot?.count === 1,
        )!;
        if (wrongId) record.snapshot!.endpoint!.cardId = '48';
        else record.snapshot!.endpoint = null;
        const result = classifyStage49(value.evidence, value.frames);
        expect(result.ok).toBe(false);
        expect(result.failures).toContain(
          event === 'cleanup' ? 'final-capture-missing' : 'capture-missing',
        );
      }
      // 기존 허점: stack identity/pose를 모든 경계에서 일관되게 맞춰도 실제49 증거가 아니다.
      const stackOnly = factory();
      for (const record of stackOnly.evidence.records)
        if (record.snapshot?.endpoint) record.snapshot.endpoint.kind = 'stack';
      expect(classifyStage49(stackOnly.evidence, stackOnly.frames).failures).toContain(
        'capture-missing',
      );
    }
    const missingCommit = replacement();
    missingCommit.evidence.records[3]!.lifecycle!.endpoint = null;
    const commit = classifyStage49(missingCommit.evidence, missingCommit.frames);
    expect(commit.ok).toBe(false);
    expect(commit.failures).toContain('capture-missing');
  });
}
