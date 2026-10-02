// 이벤트 열 → 카드 애니메이션 안무 (spec 6.3·6.4, intent/plan.md 1.6).
// 엔진이 한 번의 reduce로 낸 이벤트 묶음을 "단계"로 나누고, 단계마다
//   측정(이전 자리) → 이벤트 적용한 판 커밋(tick) → 측정(새 자리) → 자리가 바뀐 카드마다 FLIP 이동
// 을 한다. 카드가 어디서 어디로 갔는지(손패→바닥, 더미→뒤집기 자리, 바닥→획득패, 획득패→상대 획득패)로 시간을 고른다.
// 빠름 묶음이 턴 예산(spec 6.4 탭→턴 종료 ≤ 700ms)을 넘을 것 같으면 이동 시간을 비율로 줄인다.
// 기본 보통은 각 이동 뒤에 인지용 정지를 둔다(UX-15).
// --dur-scale이 0(즉시 모드·동작 줄이기·건너뛰기)이면 측정·애니메이션 없이 커밋만 한다.
import { getCard, GUKJIN_ID, type CardId, type EngineEvent } from '@p2p-gostop/engine';
import { applyEvent, placeOf, type CardPlace, type DisplayBoard } from '../game/display.ts';
import { DUR, NORMAL_DUR, baseMs, durScale } from './durations.ts';
import { finishAll, flipCard, flipMove, sequence } from './flip.ts';
import { cardPose, LandingScene, originalCards, type CardPose } from './landing.ts';

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

type StepKind = 'play' | 'contact' | 'draw' | 'flip' | 'match' | 'collect' | 'none';

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
    case 'contact':
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
export function planTurn(
  events: readonly EngineEvent[],
  normal = false,
  acceptedContact = false,
): TurnPlan {
  const steps = planSteps(events);
  if (acceptedContact) steps.unshift({ kind: 'contact', events: [] });
  const d = normal ? NORMAL_DUR : DUR;
  const rawMs = steps.reduce((sum, s) => sum + stepMs(s, normal), 0);
  const factor = !normal && rawMs > TURN_PLAN_MS ? TURN_PLAN_MS / rawMs : 1;
  const scaled = steps.map((s) => stepMs(s, normal) * factor);
  const holdMs = steps.map((s) => {
    switch (s.kind) {
      case 'play':
      case 'contact':
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

export interface ReplayOptions {
  readonly scene?: LandingScene;
  /** 성공한 공개 수락 전이만. snapshot 현재 관계와 구분한다. */
  readonly acceptedContact?: { readonly card: CardId; readonly target: CardId };
}

interface ContactContext {
  played: CardId | null;
}

/** 유일 공개짝·자동 뻑묶음만 추론한다. 둘 중 선택은 수락 metadata/Matched.target을 기다린다. */
function automaticTarget(board: DisplayBoard, id: CardId): CardId | null {
  const month = getCard(id).month;
  if (month === null) return null;
  const group = board.floor.find((g) => g.month === month);
  const cards = group?.cards.filter((card) => card !== id) ?? [];
  return cards.length === 1 || (group !== undefined && group.kind !== 'loose')
    ? (cards[0] ?? null)
    : null;
}

function targetForFlip(board: DisplayBoard, id: CardId, context: ContactContext): CardId | null {
  if (getCard(id).month === null) return null;
  if (context.played !== null && getCard(context.played).month === getCard(id).month)
    return context.played;
  return automaticTarget(board, id);
}

async function contact(
  host: ReplayHost,
  scene: LandingScene,
  card: CardId,
  target: CardId,
  duration: number,
) {
  const to = scene.contactPose(target, card);
  if (to === undefined || host.isCurrent?.() === false) return;
  const animation = scene.move(card, to, duration);
  if (animation !== undefined) await sequence(() => animation);
  if (host.isCurrent?.() === false || durScale(host.root) === 0) return;
  // 약한 관계 강조는 획득 확정과 다르다. 기존 정지 시간에 한 번 표시한다.
  void sequence(() =>
    scene.pulse([card, target], false, Math.min(duration, baseMs('matchHighlight', host.root))),
  );
}

function destination(root: HTMLElement, id: CardId, board: DisplayBoard): CardPose | undefined {
  const original = originalCards(root).find((el) => Number(el.dataset['cardId']) === id);
  if (original !== undefined) return cardPose(original, root);
  // summary의 최근4 밖 ID: 종류 칸의 실제 stack endpoint로 마감한다. canonical ID를 추가하지 않는다.
  const seat = placeOf(board, id) === 'captured0' ? 0 : 1;
  const mine = seat === board.viewer;
  const kind = getCard(id).kind;
  const pile =
    id === GUKJIN_ID && board.seats[seat].gukjinAsPi ? 'pi' : kind === 'bonus' ? 'pi' : kind;
  const stack = root.querySelector<HTMLElement>(
    '.captured-zone' + (mine ? '.mine' : ':not(.mine)') + ' [data-pile="' + pile + '"] .stack',
  );
  if (stack === null) return undefined;
  const sample = stack.querySelector<HTMLElement>('.card');
  if (sample === null) return undefined;
  const pose = cardPose(sample, root),
    rect = stack.getBoundingClientRect();
  return {
    ...pose,
    rect: new DOMRect(rect.right - pose.width, rect.top, pose.width, pose.height),
    angle: 0,
  };
}

/** 단계 하나. 이벤트열·onEvent는 원순서 그대로, 시각 관계만 별도로 투영한다. */
async function runStep(
  host: ReplayHost,
  board: DisplayBoard,
  step: AnimStep,
  factor: number,
  plannedMs: number,
  holdMs: number,
  scene: LandingScene,
  context: ContactContext,
): Promise<DisplayBoard> {
  if (host.isCurrent?.() === false) return board;
  const active = durScale(host.root) !== 0;
  const contacts: { card: CardId; target: CardId }[] = [];
  const settled: CardId[] = [];
  const captured: CardId[] = [];
  let next = board;
  for (const event of step.events) {
    if (active) {
      if (event.type === 'CardPlayed' && event.bonus) {
        const card = event.cards[0];
        if (card !== undefined) scene.reserve(card);
      } else if (event.type === 'CardPlayed' && !event.bonus) {
        const card = event.cards[0];
        if (card !== undefined) {
          context.played = card;
          const target = automaticTarget(next, card);
          if (target !== null) contacts.push({ card, target });
        }
      } else if (event.type === 'Bomb') {
        const target = event.cards[event.handCards];
        if (target !== undefined)
          for (const card of event.cards.slice(0, event.handCards)) contacts.push({ card, target });
      } else if (event.type === 'Matched') {
        const card = event.cards[0];
        if (card !== undefined && !scene.isContacted(card))
          contacts.push({ card, target: event.target });
      }
      if (event.type === 'Captured' || event.type === 'PiStolen') captured.push(...event.cards);
      if (event.type === 'Ppeok' || event.type === 'Placed') settled.push(...event.cards);
      if (event.type === 'CardFlipped') {
        const card = event.cards[0];
        if (card !== undefined) {
          const target = targetForFlip(next, card, context);
          if (target !== null) scene.reserve(target);
        }
      }
    }
    next = applyEvent(next, event);
    host.onEvent(event);
    if (host.isCurrent?.() === false) return board;
  }
  if (step.kind === 'none' || !active) {
    scene.clear();
    await host.commit(next);
    return next;
  }
  const before = measure(host.root);
  // 제거·재배치 전에 원본 target/획득 카드의 pose를 확보한다.
  for (const relation of contacts) {
    scene.reserve(relation.target);
    scene.reserve(relation.card);
  }
  for (const id of settled) scene.reserve(id);
  const captureSources = scene.prepareCapture(
    captured,
    board.floor.flatMap((group) => group.cards),
  );
  const highlightMs = captureSources.size === 0 ? 0 : plannedMs * 0.22;
  if (captureSources.size > 0) {
    await sequence(() => scene.pulse([...captureSources.keys()], true, highlightMs));
    if (host.isCurrent?.() === false) return board;
  }
  await host.commit(next);
  if (host.isCurrent?.() === false) return next;
  scene.hideOriginals();
  const after = measure(host.root);
  const animations: Animation[] = [];
  animations.push(...scene.settle(settled, plannedMs));
  const ms = (base: number) => base * factor;
  const revealed: { card: CardId; target: CardId }[] = [];
  for (const event of step.events)
    if (event.type === 'CardFlipped') {
      const card = event.cards[0];
      if (card === undefined) continue;
      const target = targetForFlip(board, card, context);
      if (target !== null) {
        scene.reserve(target);
        scene.reserve(card);
        revealed.push({ card, target });
      }
    }
  const destinations = new Map(
    captured.flatMap((id) => {
      const to = destination(host.root, id, next);
      return to === undefined ? [] : [[id, to] as const];
    }),
  );
  // 새 staging의 원본 위치는 유지하고 공개 카드의 이동은 ghost가 맡는다.
  for (const id of next.staging) {
    if (board.staging.includes(id) || revealed.some((relation) => relation.card === id)) continue;
    const source =
      before.get(String(id)) ?? before.get(step.kind === 'play' ? '@opp-hand' : '@deck');
    const el = originalCards(host.root).find((el) => Number(el.dataset['cardId']) === id);
    if (el === undefined || source === undefined) continue;
    const kept = scene.has(id);
    const to = cardPose(el, host.root);
    if (scene.reserve(id) === undefined) continue;
    if (!kept) {
      const start = scene.move(id, { ...to, rect: source, angle: 0 }, 0);
      if (start !== undefined) await sequence(() => start);
      if (host.isCurrent?.() === false) return next;
    }
    const duration = ms(baseMs(step.kind === 'play' ? 'handToFloor' : 'flip', host.root));
    const move = scene.move(id, to, duration);
    if (move !== undefined) animations.push(move);
    const inner = heldInner(scene, id);
    if (before.get(String(id)) === undefined && inner !== null)
      animations.push(flipCard(inner, { duration }));
  }
  animations.push(
    ...scene.pulseCaptured(
      captured.filter((id) => !captureSources.has(id)),
      plannedMs - highlightMs,
    ),
  );
  for (const id of captured) {
    const to = destinations.get(id),
      from = captureSources.get(id);
    if (to === undefined || from === undefined) continue;
    // 같은 월의 각 묶음은 45%까지 같은 벡터로 함께 출발한다.
    const members = captured.filter(
      (other) =>
        getCard(other).month === getCard(id).month &&
        captureSources.has(other) &&
        destinations.has(other),
    );
    const dx =
      (members.reduce((sum, other) => {
        const a = captureSources.get(other)!.rect,
          b = destinations.get(other)!.rect;
        return sum + b.x + b.width / 2 - a.x - a.width / 2;
      }, 0) /
        members.length) *
      0.4;
    const dy =
      (members.reduce((sum, other) => {
        const a = captureSources.get(other)!.rect,
          b = destinations.get(other)!.rect;
        return sum + b.y + b.height / 2 - a.y - a.height / 2;
      }, 0) /
        members.length) *
      0.4;
    const via = {
      ...from,
      rect: new DOMRect(from.rect.x + dx, from.rect.y + dy, from.rect.width, from.rect.height),
    };
    const animation = scene.move(id, to, plannedMs - highlightMs, via);
    if (animation !== undefined) animations.push(animation);
  }
  for (const el of originalCards(host.root)) {
    const key = el.dataset['cardId'];
    if (key === undefined) continue;
    const id = Number(key),
      to = after.get(key),
      from = before.get(key);
    if (to === undefined || captured.includes(id) || scene.has(id)) continue;
    const was = placeOf(board, id),
      now = placeOf(next, id);
    const inner = el.querySelector<HTMLElement>('.inner');
    if (from === undefined) {
      const fromDeck = step.kind === 'flip' || step.kind === 'draw';
      const source = before.get(fromDeck ? '@deck' : '@opp-hand');
      if (source === undefined) continue;
      const duration = ms(baseMs(fromDeck ? 'flip' : 'handToFloor', host.root));
      animations.push(flipMove(el, source, to, { duration }));
      if (inner !== null) animations.push(flipCard(inner, { duration }));
    } else if (moved(from, to)) {
      const duration = ms(
        baseMs(
          isCaptured(now) && isCaptured(was) && now !== was
            ? 'steal'
            : was === 'hand'
              ? 'handToFloor'
              : 'matchHighlight',
          host.root,
        ),
      );
      animations.push(flipMove(el, from, to, { duration }));
    }
  }
  // 새 공개 카드의 출발은 deck/상대 hand다. 내 손패는 예약한 beforepose다.
  for (const relation of [...contacts, ...revealed]) {
    const held = scene.reserve(relation.card);
    if (held === undefined) continue;
    if (before.get(String(relation.card)) === undefined) {
      const source = before.get(revealed.includes(relation) ? '@deck' : '@opp-hand');
      if (source !== undefined) {
        // 공개 카드만 ghost에 넣고 출발점으로 옮긴다.
        const pose = scene.pose(relation.card)!;
        const a = scene.move(relation.card, { ...pose, rect: source, angle: 0 }, 0);
        if (a !== undefined) await sequence(() => a);
      }
    }
  }
  if (revealed.length > 0) {
    // 뒷면→공개 staging→원본짝 관계의 두 단계를 flip 시간 안에서 재생한다.
    for (const relation of revealed) {
      const el = originalCards(host.root).find(
        (el) => Number(el.dataset['cardId']) === relation.card,
      );
      if (el === undefined) continue;
      const pose = cardPose(el, host.root);
      const move = scene.move(relation.card, pose, plannedMs * 0.55);
      if (move !== undefined) animations.push(move);
      const inner = heldInner(scene, relation.card);
      if (inner !== null) animations.push(flipCard(inner, { duration: plannedMs * 0.55 }));
    }
    await sequence(() => animations);
    if (host.isCurrent?.() === false) return next;
    await Promise.all(
      revealed.map((r) => contact(host, scene, r.card, r.target, plannedMs * 0.45)),
    );
  } else {
    const placed: CardId[] = [];
    for (const relation of contacts) {
      const to = scene.contactPose(relation.target, relation.card);
      if (to === undefined) continue;
      placed.push(relation.card, relation.target);
      const a = scene.move(relation.card, to, plannedMs);
      if (a !== undefined) animations.push(a);
    }
    if (animations.length === 0) await waitHold(host.root, plannedMs - highlightMs);
    else await sequence(() => animations);
    if (host.isCurrent?.() === false) return next;
    if (placed.length > 0)
      void sequence(() =>
        scene.pulse(
          placed,
          false,
          Math.min(holdMs || plannedMs, baseMs('matchHighlight', host.root)),
        ),
      );
  }
  scene.release(captured);
  scene.release(settled);
  if (host.isCurrent?.() === false) return next;
  await waitHold(host.root, holdMs);
  return next;
}

function heldInner(scene: LandingScene, id: CardId): HTMLElement | null {
  return scene.root.querySelector<HTMLElement>('[data-motion-card-id="' + id + '"] .inner');
}

/** 원본 이벤트 순서를 보존하고 공개 관계를 각 표시 단계에서 투영한다. */
export async function replay(
  host: ReplayHost,
  from: DisplayBoard,
  events: readonly EngineEvent[],
  options: ReplayOptions = {},
): Promise<DisplayBoard> {
  const scene = options.scene ?? new LandingScene(host.root);
  const normal = host.root.ownerDocument.documentElement.dataset['speed'] === 'normal';
  const plan = planTurn(events, normal, options.acceptedContact !== undefined);
  const context: ContactContext = { played: from.inFlight?.played ?? null };
  let board = from;
  try {
    for (const [i, step] of plan.steps.entries()) {
      if (host.isCurrent?.() === false) break;
      const startedAt = host.onStep === undefined ? 0 : performance.now();
      if (
        step.kind === 'contact' &&
        options.acceptedContact !== undefined &&
        durScale(host.root) !== 0
      ) {
        const { card, target } = options.acceptedContact;
        context.played = card;
        await contact(host, scene, card, target, plan.stepMs[i] ?? 0);
        if (host.isCurrent?.() !== false) await waitHold(host.root, plan.holdMs[i] ?? 0);
      } else
        board = await runStep(
          host,
          board,
          step,
          plan.factor,
          plan.stepMs[i] ?? 0,
          plan.holdMs[i] ?? 0,
          scene,
          context,
        );
      if (host.isCurrent?.() !== false) host.onStep?.(step.kind, performance.now() - startedAt);
    }
  } finally {
    if (options.scene === undefined) scene.clear();
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
