// 이벤트 열 → 카드 애니메이션 안무 (spec 6.3·6.4, plan.md 1.6).
// 엔진이 한 번의 reduce로 낸 이벤트 묶음을 "단계"로 나누고, 단계마다
//   측정(이전 자리) → 이벤트 적용한 판 커밋(tick) → 측정(새 자리) → 자리가 바뀐 카드마다 FLIP 이동
// 을 한다. 카드가 어디서 어디로 갔는지(손패→바닥, 더미→뒤집기 자리, 바닥→획득패, 획득패→상대 획득패)로 시간을 고른다.
// 빠름 묶음이 턴 예산(spec 6.4 탭→턴 종료 ≤ 700ms)을 넘을 것 같으면 이동 시간을 비율로 줄인다.
// 기본 보통은 각 이동 뒤에 인지용 정지를 둔다(UX-15).
// --dur-scale이 0(즉시 모드·동작 줄이기·건너뛰기)이면 측정·애니메이션 없이 커밋만 한다.
import type { EngineEvent } from '@p2p-gostop/engine';
import { applyEvent, placeOf, type CardPlace, type DisplayBoard } from '../game/display.ts';
import { DUR, NORMAL_DUR, baseMs, durScale } from './durations.ts';
import { finishAll, flipCard, flipMove, sequence } from './flip.ts';

export interface ReplayHost {
  /** 보드 루트: 카드 요소 측정, 건너뛰기(--dur-scale: 0), finishAll 범위 */
  readonly root: HTMLElement;
  /** 판을 화면 상태로 커밋하고 DOM 반영(tick)까지 기다린다 */
  commit(board: DisplayBoard): Promise<void>;
  /** 이벤트의 부수 효과(배너·토스트·효과음). 기다리지 않는다 */
  onEvent(event: EngineEvent): void;
  /** reset/dispose가 소유권을 회수하면 다음 단계·DOM 측정을 중단한다. */
  isCurrent?(): boolean;
  /** 단계당 두 번의 단조 시각만 읽는다. 프레임별 수집은 하지 않는다. */
  onStep?(kind: StepKind, ms: number): void;
}

type StepKind = 'play' | 'draw' | 'flip' | 'match' | 'collect' | 'none';

export interface AnimStep {
  readonly kind: StepKind;
  readonly events: readonly EngineEvent[];
}

/**
 * 한 턴의 계획 시간 상한(빠름 기준 ms). 단계 사이의 프레임 지연(단계당 최대 1~2프레임)을 더해도
 * spec 6.4의 700ms 안에 들도록 여유를 둔다(AC-06, choreo.test.ts·e2e/solo.spec.ts가 검사).
 */
export const TURN_PLAN_MS = 500;

function kindOf(event: EngineEvent): StepKind {
  switch (event.type) {
    case 'CardPlayed':
    case 'Bomb':
      return 'play';
    case 'CardDrawn':
      return 'draw';
    case 'CardFlipped':
      return 'flip';
    case 'Matched':
    case 'Placed':
    case 'Jjok':
    case 'Ttadak':
    case 'Ppeok':
      return 'match';
    case 'Captured':
    case 'PiStolen':
      return 'collect';
    default:
      return 'none';
  }
}

/** 이벤트 묶음을 애니메이션 단계로 나눈다. 배치가 바뀌지 않는 이벤트는 앞 단계에 붙는다 */
export function planSteps(events: readonly EngineEvent[]): AnimStep[] {
  const steps: { kind: StepKind; events: EngineEvent[] }[] = [];
  for (const event of events) {
    const kind = kindOf(event);
    const current = steps.at(-1);
    if (current === undefined) {
      steps.push({ kind, events: [event] });
    } else if (kind === 'none') {
      current.events.push(event);
    } else if (current.kind === 'none') {
      current.kind = kind;
      current.events.push(event);
    } else if (kind === current.kind && (kind === 'match' || kind === 'collect')) {
      current.events.push(event);
    } else {
      steps.push({ kind, events: [event] });
    }
  }
  return steps;
}

function capturedCount(step: AnimStep): number {
  return step.events.reduce((n, e) => n + (e.type === 'Captured' ? e.cards.length : 0), 0);
}

/** 단계의 계획 이동 시간 (선택한 시간표 기준 ms) */
function stepMs(step: AnimStep, normal: boolean): number {
  const d = normal ? NORMAL_DUR : DUR;
  switch (step.kind) {
    case 'play':
      return d.handToFloor;
    case 'draw':
    case 'flip':
      return d.flip;
    case 'match':
      return d.matchHighlight;
    case 'collect': {
      const n = capturedCount(step);
      const capture = n > 0 ? d.capture + d.captureStagger * (n - 1) : 0;
      const steal = step.events.some((e) => e.type === 'PiStolen') ? d.steal : 0;
      return Math.max(capture, steal);
    }
    case 'none':
      return 0;
  }
}

export interface TurnPlan {
  readonly steps: readonly AnimStep[];
  /** 단계 이동 시간 합 (선택한 시간표 기준 ms, 줄이기 전) */
  readonly rawMs: number;
  /** 계획 시간이 턴 예산을 넘으면 줄이는 배율 (≤ 1) */
  readonly factor: number;
  /** 이동과 정지 시간 합. 빠름은 TURN_PLAN_MS 이내 */
  readonly plannedMs: number;
  /** 단계별 이동 시간 (선택한 시간표 기준 ms, 줄인 뒤). 움직일 카드가 없을 때도 기다린다 */
  readonly stepMs: readonly number[];
  /** 이동이 끝난 뒤 다음 사건을 보여 주기 전 정지 시간 */
  readonly holdMs: readonly number[];
}

/** 이벤트 묶음의 애니메이션 계획 (replay와 같은 계산) */
export function planTurn(events: readonly EngineEvent[], normal = false): TurnPlan {
  const steps = planSteps(events);
  const d = normal ? NORMAL_DUR : DUR;
  const rawMs = steps.reduce((sum, s) => sum + stepMs(s, normal), 0);
  const factor = !normal && rawMs > TURN_PLAN_MS ? TURN_PLAN_MS / rawMs : 1;
  const scaled = steps.map((s) => stepMs(s, normal) * factor);
  const holdMs = steps.map((s) => {
    switch (s.kind) {
      case 'play':
        return d.playHold;
      case 'draw':
      case 'flip':
        return d.revealHold;
      case 'match':
        return d.matchHold;
      case 'collect':
        return d.captureHold;
      case 'none':
        return 0;
    }
  });
  return {
    steps,
    rawMs,
    factor,
    plannedMs: scaled.reduce((sum, ms) => sum + ms, 0) + holdMs.reduce((sum, ms) => sum + ms, 0),
    stepMs: scaled,
    holdMs,
  };
}

/** 정지도 탭 스킵에 즉시 반응한다. */
export function waitHold(root: HTMLElement, baseMs: number): Promise<void> {
  const ms = baseMs * durScale(root);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      root.removeEventListener('animation-skip', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    root.addEventListener('animation-skip', done, { once: true });
  });
}

type Rects = Map<string, DOMRect>;

function measure(root: HTMLElement): Rects {
  const rects: Rects = new Map();
  for (const el of root.querySelectorAll<HTMLElement>('[data-card-id]')) {
    if (el.closest('dialog') !== null) continue;
    const id = el.dataset['cardId'];
    if (id !== undefined) rects.set(id, el.getBoundingClientRect());
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-anchor]')) {
    rects.set(`@${el.dataset['anchor'] ?? ''}`, el.getBoundingClientRect());
  }
  return rects;
}

function moved(a: DOMRect, b: DOMRect): boolean {
  return (
    Math.abs(a.left - b.left) + Math.abs(a.top - b.top) > 0.5 ||
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.height - b.height) > 0.5
  );
}

function isCaptured(place: CardPlace): boolean {
  return place === 'captured0' || place === 'captured1';
}

/** 단계 하나 실행: 이벤트 적용 → 커밋 → 자리가 바뀐 카드를 FLIP */
async function runStep(
  host: ReplayHost,
  board: DisplayBoard,
  step: AnimStep,
  factor: number,
  /** 이 단계의 계획 시간 (planTurn().stepMs, 줄인 뒤) */
  plannedMs: number,
  holdMs: number,
): Promise<DisplayBoard> {
  if (host.isCurrent?.() === false) return board;
  let next = board;
  for (const event of step.events) {
    if (host.isCurrent?.() === false) return board;
    next = applyEvent(next, event);
    host.onEvent(event);
    if (host.isCurrent?.() === false) return board;
  }
  if (step.kind === 'none' || durScale(host.root) === 0) {
    await host.commit(next);
    return next;
  }
  const before = measure(host.root);
  await host.commit(next);
  if (host.isCurrent?.() === false) return next;
  const after = measure(host.root);
  const ms = (base: number) => base * factor;
  const animations: Animation[] = [];
  let captureIndex = 0;
  for (const el of host.root.querySelectorAll<HTMLElement>('[data-card-id]')) {
    if (el.closest('dialog') !== null) continue;
    const key = el.dataset['cardId'];
    if (key === undefined) continue;
    const to = after.get(key);
    if (to === undefined) continue;
    const id = Number(key);
    const from = before.get(key);
    const was = placeOf(board, id);
    const now = placeOf(next, id);
    const inner = el.querySelector<HTMLElement>('.inner');
    if (from === undefined) {
      // 새로 나타난 카드: 더미에서 뒤집혀 나오거나(뒤집기·보충) 상대 손패에서 나온다
      const fromDeck = step.kind === 'flip' || step.kind === 'draw';
      const source = before.get(fromDeck ? '@deck' : '@opp-hand');
      if (source === undefined) continue;
      const duration = ms(baseMs(fromDeck ? 'flip' : 'handToFloor', host.root));
      animations.push(flipMove(el, source, to, { duration }));
      if (inner !== null) animations.push(flipCard(inner, { duration }));
      continue;
    }
    if (!moved(from, to)) continue;
    if (isCaptured(now) && !isCaptured(was)) {
      animations.push(
        flipMove(el, from, to, {
          duration: ms(baseMs('capture', host.root)),
          delay: ms(baseMs('captureStagger', host.root) * captureIndex),
        }),
      );
      captureIndex += 1;
    } else if (isCaptured(now) && isCaptured(was) && now !== was) {
      animations.push(flipMove(el, from, to, { duration: ms(baseMs('steal', host.root)) }));
    } else if (was === 'hand' && now !== 'hand') {
      animations.push(flipMove(el, from, to, { duration: ms(baseMs('handToFloor', host.root)) }));
    } else {
      // 뒤집기 자리 → 바닥, 무더기 재배치, 손패·획득패 정렬 이동
      animations.push(
        flipMove(el, from, to, { duration: ms(baseMs('matchHighlight', host.root)) }),
      );
    }
  }
  if (animations.length === 0) {
    // 움직일 카드가 없어도 매칭 강조 등은 계획 시간만큼 보인다
    await waitHold(host.root, plannedMs);
    if (host.isCurrent?.() === false) return next;
    await waitHold(host.root, holdMs);
    return next;
  }
  await sequence(() => animations);
  if (host.isCurrent?.() === false) return next;
  await waitHold(host.root, holdMs);
  return next;
}

/**
 * 이벤트 묶음 재생. 끝나면 마지막 중간 판을 돌려준다(호출자가 최신 뷰로 스냅한다, spec 6.4).
 * 도중에 건너뛰기(skip)가 걸리면 남은 단계는 즉시 커밋된다.
 */
export async function replay(
  host: ReplayHost,
  from: DisplayBoard,
  events: readonly EngineEvent[],
): Promise<DisplayBoard> {
  const plan = planTurn(
    events,
    host.root.ownerDocument.documentElement.dataset['speed'] === 'normal',
  );
  let board = from;
  for (const [i, step] of plan.steps.entries()) {
    if (host.isCurrent?.() === false) break;
    const startedAt = host.onStep === undefined ? 0 : performance.now();
    board = await runStep(host, board, step, plan.factor, plan.stepMs[i] ?? 0, plan.holdMs[i] ?? 0);
    if (host.isCurrent?.() !== false) host.onStep?.(step.kind, performance.now() - startedAt);
  }
  return board;
}

/** 분배 애니메이션 (spec 6.4 "분배 총 1.2s 이내"): 판을 커밋하고 보이는 카드가 더미에서 차례로 날아온다 */
export async function deal(host: ReplayHost, board: DisplayBoard): Promise<void> {
  if (host.isCurrent?.() === false) return;
  await host.commit(board);
  if (host.isCurrent?.() === false) return;
  if (durScale(host.root) === 0) return;
  const deck = host.root.querySelector<HTMLElement>('[data-anchor="deck"]');
  if (deck === null) return;
  const source = deck.getBoundingClientRect();
  const cards = [...host.root.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
    (el) => el.closest('dialog') === null,
  );
  const duration = baseMs('handToFloor', host.root) * 1.5;
  const stagger = Math.min(
    40,
    (baseMs('dealTotal', host.root) - duration) / Math.max(1, cards.length),
  );
  const animations = cards.flatMap((el, i) => {
    const to = el.getBoundingClientRect();
    const inner = el.querySelector<HTMLElement>('.inner');
    const move = flipMove(el, source, to, { duration, delay: i * stagger });
    return inner === null ? [move] : [move, flipCard(inner, { duration, delay: i * stagger })];
  });
  await sequence(() => animations);
}

/** 건너뛰기 (spec 6.3 "화면을 탭하면 남은 애니메이션을 즉시 완료"): 이후 단계는 0ms, 진행 중인 것은 끝으로 */
export function skip(root: HTMLElement): void {
  root.style.setProperty('--dur-scale', '0');
  finishAll(root);
  root.dispatchEvent(new Event('animation-skip'));
}

/** 건너뛰기 해제 (큐가 비었을 때) */
export function unskip(root: HTMLElement): void {
  root.style.removeProperty('--dur-scale');
}
