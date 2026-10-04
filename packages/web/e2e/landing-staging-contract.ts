// UX-15~17 / PR255: 공개 DOM과 원 WAAPI identity만 관찰하는 시험 전용 계약.
// page.evaluate로 직렬화하므로 설치 함수는 외부 값/제품 import에 의존하지 않는다.
export interface Stage49Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Stage49Frame {
  t: number;
  native: (Stage49Rect & { id: string; animations: number; hidden: boolean })[];
  ghosts: (Stage49Rect & { id: string })[];
  counts: number[];
}

export interface Stage49Snapshot {
  root: number;
  ghost: number | null;
  native: number | null;
  ghostRect: Stage49Rect | null;
  nativeRect: Stage49Rect | null;
  hidden: boolean;
  nativeAnimations: number;
  ghosts: number;
  count: number;
  endpoint: { identity: number; kind: 'card' | 'stack'; cardId: string; rect: Stage49Rect } | null;
  scenes: number;
  hiddenCards: number;
}

export interface Stage49Lifecycle {
  root: number;
  ghost: number | null;
  native: number | null;
  ghosts: number;
  count: number;
  endpoint: number | null;
}

export interface Stage49Record {
  seq: number;
  event: 'created' | 'fulfilled' | 'rejected' | 'lifetime' | 'cleanup';
  animation: number | null;
  target: 'ghost' | 'light' | null;
  targetIdentity: number | null;
  snapshot: Stage49Snapshot | null;
  // 이름은 진단용이며 판정은 객체 identity/순서/실제 DOM에만 의존한다.
  label: string;
  lifecycle?: Stage49Lifecycle;
}

export interface Stage49Evidence {
  version: 1;
  root: number;
  hand: Stage49Rect | null;
  handIdentity: number | null;
  initialCount: number;
  records: Stage49Record[];
  errors: string[];
  overflow: boolean;
  lateRegistration: boolean;
  restored: boolean;
  pending: number;
}

export interface Stage49ObservationWindow extends Window {
  __stage49Observation?: { stop(): Stage49Evidence };
}

export function installStage49Observer(): void {
  const scope = window as Stage49ObservationWindow;
  if (scope.__stage49Observation) throw new Error('stage49 observer already installed');
  const root = document.querySelector<HTMLElement>('[data-testid="board"]');
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  if (!root || !descriptor || typeof descriptor.value !== 'function')
    throw new Error('stage49 observer requires board and own animate descriptor');
  const original = descriptor.value as Element['animate'];
  const identities = new WeakMap<object, number>();
  let nextIdentity = 1;
  function identity(value: object): number {
    let id = identities.get(value);
    if (id === undefined) {
      id = nextIdentity++;
      identities.set(value, id);
    }
    return id;
  }
  function rect(el: Element): Stage49Rect {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  const hand = root.querySelector<HTMLElement>('[aria-label="내 손패"] [data-card-id="49"]');
  const evidence: Stage49Evidence = {
    version: 1,
    root: identity(root),
    hand: hand ? rect(hand) : null,
    handIdentity: hand ? identity(hand) : null,
    initialCount: [...root.querySelectorAll('.captured-zone.mine [data-cards]')].reduce(
      (sum, el) => sum + Number(el.getAttribute('data-cards')),
      0,
    ),
    records: [],
    errors: [],
    overflow: false,
    lateRegistration: !!root.querySelector(
      '[data-motion-card-id="49"], .staging [data-card-id="49"]',
    ),
    restored: false,
    pending: 0,
  };
  let stopped = false;
  let ghost: HTMLElement | null = null;
  let native: HTMLElement | null = null;
  let light: HTMLElement | null = null;
  let endpoint: Element | null = null;
  const fulfilled = new Set<Animation>();
  const observed = new Map<Animation, { target: 'ghost' | 'light'; targetIdentity: number }>();
  function error(message: string) {
    if (evidence.errors.length < 16 && !evidence.errors.includes(message))
      evidence.errors.push(message);
  }
  function usable(): boolean {
    return (
      !stopped && !evidence.overflow && evidence.errors.length === 0 && !evidence.lateRegistration
    );
  }
  function room(): boolean {
    if (evidence.records.length >= 256) {
      evidence.overflow = true;
      return false;
    }
    return usable();
  }
  function count(): number {
    return [...root!.querySelectorAll('.captured-zone.mine [data-cards]')].reduce(
      (sum, el) => sum + Number(el.getAttribute('data-cards')),
      0,
    );
  }
  function stageFinished(): boolean {
    const first = [...observed.keys()].find((a) => observed.get(a)?.target === 'ghost');
    return first !== undefined && fulfilled.has(first);
  }
  function identityCheck() {
    if (!root!.isConnected || document.querySelector('[data-testid="board"]') !== root)
      error('stale-root');
    const currentGhost = root!.querySelector<HTMLElement>('[data-motion-card-id="49"]');
    if (ghost && currentGhost && currentGhost !== ghost) error('stale-ghost');
    const currentNative = root!.querySelector<HTMLElement>('.staging [data-card-id="49"]');
    if (native && currentNative && currentNative !== native) error('stale-native');
    // Captured commit은 staging DOM을 없앤다. 첫 도착 이전 소실은 여전히 실패다.
    if (native && !native.isConnected && !(stageFinished() && count() === 1)) error('stale-native');
    // fulfilled staging ghost의 release와 최종 정리를 구별한다. 실제 새 세대는 아래에서 한정한다.
    if (ghost && !ghost.isConnected && [...observed.keys()].some((a) => !fulfilled.has(a)))
      error('stale-ghost');
    if (endpoint && (!endpoint.isConnected || !root!.contains(endpoint))) error('stale-endpoint');
  }
  function snapshot(cleanup: boolean): Stage49Snapshot | null {
    identityCheck();
    if (!usable()) return null;
    const n = root!.querySelector<HTMLElement>('.staging [data-card-id="49"]');
    if (n && !native) native = n;
    const g = root!.querySelector<HTMLElement>('[data-motion-card-id="49"]');
    const pi = root!.querySelector('.captured-zone.mine [data-pile="pi"]');
    const card = pi?.querySelector('[data-card-id="49"]');
    // 이 fixture는 initialCount0→1의 card49 한 장 획득이다. stack 대체는 증거가 아니다.
    const destination: Stage49Snapshot['endpoint'] = card
      ? {
          identity: identity(card),
          kind: 'card',
          cardId: card.getAttribute('data-card-id')!,
          rect: rect(card),
        }
      : null;
    return {
      root: identity(root!),
      ghost: g ? identity(g) : null,
      native: n ? identity(n) : null,
      ghostRect: g ? rect(g) : null,
      nativeRect: n ? rect(n) : null,
      hidden: n?.style.visibility === 'hidden',
      nativeAnimations: n
        ? n.getAnimations().filter((a) => a.playState !== 'idle' && a.playState !== 'finished')
            .length
        : 0,
      ghosts: root!.querySelectorAll('[data-motion-card-id="49"]').length,
      count: count(),
      endpoint: destination,
      scenes: root!.querySelectorAll('[data-landing-scene]').length,
      hiddenCards: cleanup
        ? [...root!.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
            (el) => el.style.visibility === 'hidden',
          ).length
        : 0,
    };
  }
  function record(event: Stage49Record['event'], animation: Animation | null, label: string) {
    if (!room()) return;
    const binding = animation ? observed.get(animation) : undefined;
    if (animation && binding) {
      const effect = animation.effect;
      if (
        !(effect instanceof KeyframeEffect) ||
        !effect.target ||
        identity(effect.target) !== binding.targetIdentity
      )
        error('stale-effect-target');
    }
    const state = snapshot(event === 'cleanup');
    evidence.records.push({
      seq: evidence.records.length,
      event,
      animation: animation ? identity(animation) : null,
      target: binding?.target ?? null,
      targetIdentity: binding?.targetIdentity ?? null,
      snapshot: state,
      label,
    });
  }
  if (!hand) error('missing-input-hand49');
  if (evidence.initialCount !== 0) error('input-count-not-zero');
  const observer = new MutationObserver((mutations) => {
    if (!usable()) return;
    try {
      const relevant = mutations.filter((mutation) => {
        if (mutation.type === 'attributes')
          return (
            mutation.target instanceof Element &&
            mutation.target.matches('.captured-zone.mine [data-cards]')
          );
        return [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) =>
            node === ghost ||
            node === native ||
            node === light ||
            node === endpoint ||
            (node instanceof Element &&
              (node.matches(
                '[data-landing-scene], [data-motion-card-id="49"], [data-card-id="49"]',
              ) ||
                !!node.querySelector(
                  '[data-landing-scene], [data-motion-card-id="49"], [data-card-id="49"]',
                ))),
        );
      });
      if (relevant.length === 0 || !room()) return;
      identityCheck();
      if (!usable()) return;
      // 배치 중간의 commit→hideOriginals를 pose/paint로 해석하지 않는다. geometry 읽기 없음.
      const currentGhost = root!.querySelector('[data-motion-card-id="49"]');
      const currentNative = root!.querySelector('.staging [data-card-id="49"]');
      const pi = root!.querySelector('.captured-zone.mine [data-pile="pi"]');
      const publicCount = count();
      const capturedEndpoint = publicCount === 1 ? pi?.querySelector('[data-card-id="49"]') : null;
      evidence.records.push({
        seq: evidence.records.length,
        event: 'lifetime',
        lifecycle: {
          root: identity(root!),
          ghost: currentGhost ? identity(currentGhost) : null,
          native: currentNative ? identity(currentNative) : null,
          ghosts: root!.querySelectorAll('[data-motion-card-id="49"]').length,
          count: publicCount,
          endpoint: capturedEndpoint ? identity(capturedEndpoint) : null,
        },
        animation: null,
        target: null,
        targetIdentity: null,
        snapshot: null,
        label: `DOM batch:${relevant.length};count:${count()};scene:${root!.querySelectorAll('[data-landing-scene]').length}`,
      });
    } catch {
      error('mutation-observation-error');
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-cards'],
  });
  function wrapped(this: Element, ...args: Parameters<Element['animate']>): Animation {
    // 원 함수 throw/반환과 this/args를 그대로 보존. 관찰 실패는 제품에 전파하지 않는다.
    const animation = Reflect.apply(original, this, args) as Animation;
    if (!usable()) return animation;
    try {
      const owner =
        this instanceof HTMLElement
          ? this.closest<HTMLElement>('[data-motion-card-id="49"]')
          : null;
      if (!owner || !root!.contains(owner)) return animation;
      const isBody = this === owner;
      const isLight = this instanceof HTMLElement && this.dataset['contactLight'] === 'capture';
      if (!isBody && !isLight) return animation;
      if (ghost && ghost !== owner) {
        // 새 세대는 첫 actual 도착→release→Captured commit 뒤의 pulseCaptured light에만 허용한다.
        if (
          !isLight ||
          light ||
          ghost.isConnected ||
          !stageFinished() ||
          count() !== 1 ||
          root!.querySelector('.staging [data-card-id="49"]')
        )
          error('stale-ghost');
        else ghost = owner;
      }
      ghost ??= owner;
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect) || effect.target !== this)
        error('effect-target-mismatch');
      if (isLight) {
        if (light && light !== this) error('replaced-capture-light');
        light = this as HTMLElement;
      }
      observed.set(animation, {
        target: isBody ? 'ghost' : 'light',
        targetIdentity: identity(this),
      });
      // 생성 직후 원 promise를 저장하고 제품 handler 등록/반환보다 먼저 연결한다.
      const finished = animation.finished;
      if (animation.playState === 'idle' || animation.playState === 'finished')
        evidence.lateRegistration = true;
      evidence.pending++;
      finished.then(
        () => {
          if (stopped) return;
          evidence.pending--;
          fulfilled.add(animation);
          try {
            record('fulfilled', animation, 'original finished fulfilled');
          } catch {
            error('fulfilled-observation-error');
          }
        },
        () => {
          if (stopped) return;
          evidence.pending--;
          try {
            record('rejected', animation, 'original finished rejected');
          } catch {
            error('rejected-observation-error');
          }
        },
      );
      record('created', animation, isBody ? 'ghost animate' : 'capture light animate');
      if (
        (isLight && count() === 1) ||
        (isBody && [...observed.values()].filter((b) => b.target === 'ghost').length === 2)
      ) {
        const pi = root!.querySelector('.captured-zone.mine [data-pile="pi"]');
        endpoint = pi?.querySelector('[data-card-id="49"]') ?? null;
      }
    } catch {
      error('animate-observation-error');
    }
    return animation;
  }
  try {
    Object.defineProperty(Element.prototype, 'animate', { ...descriptor, value: wrapped });
  } catch (cause) {
    stopped = true;
    observer.disconnect();
    throw cause;
  }
  scope.__stage49Observation = {
    stop() {
      if (!stopped) {
        try {
          identityCheck();
          record('cleanup', null, 'original postconditions boundary');
          for (const animation of observed.keys())
            if (!fulfilled.has(animation) || !['idle', 'finished'].includes(animation.playState))
              error('animation-not-fulfilled-or-cleaned');
        } catch {
          error('cleanup-observation-error');
        } finally {
          stopped = true;
          observer.disconnect();
          try {
            const current = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
            if (current?.value !== wrapped) error('animate-wrapper-replaced');
            Object.defineProperty(Element.prototype, 'animate', descriptor);
            evidence.restored = true;
          } catch {
            error('animate-restore-error');
          }
          delete scope.__stage49Observation;
        }
      }
      return evidence;
    },
  };
}

export type Stage49Failure =
  | 'evidence-incomplete'
  | 'stale-identity'
  | 'native-moved'
  | 'native-visible'
  | 'native-animation'
  | 'ghost-count'
  | 'ghost-stationary'
  | 'staging-mislanded'
  | 'early-capture'
  | 'capture-missing'
  | 'capture-mislanded'
  | 'final-capture-missing'
  | 'animation-rejected'
  | 'cleanup-incomplete';

export function classifyStage49(
  evidence: Stage49Evidence,
  frames: readonly Stage49Frame[],
): {
  ok: boolean;
  failures: Stage49Failure[];
} {
  const failures = new Set<Stage49Failure>();
  const fail = (reason: Stage49Failure) => failures.add(reason);
  const positive = (r: Stage49Rect | null): r is Stage49Rect =>
    !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;
  // 원 native 고정과 같은0.05px. 회전/scale 전후 AABB는 중심으로 실제 DOM pose에 대응한다.
  const distance = (a: Stage49Rect, b: Stage49Rect) =>
    Math.abs(a.x + a.width / 2 - b.x - b.width / 2) +
    Math.abs(a.y + a.height / 2 - b.y - b.height / 2);
  const same = (a: Stage49Rect | null, b: Stage49Rect | null) =>
    positive(a) &&
    positive(b) &&
    distance(a, b) < 0.05 &&
    Math.abs(a.width - b.width) + Math.abs(a.height - b.height) < 0.05;
  if (
    evidence.version !== 1 ||
    evidence.overflow ||
    evidence.lateRegistration ||
    !evidence.restored ||
    evidence.pending !== 0 ||
    evidence.errors.length ||
    !evidence.handIdentity ||
    evidence.initialCount !== 0 ||
    !positive(evidence.hand) ||
    evidence.records.length > 256
  )
    fail('evidence-incomplete');
  if (evidence.errors.some((s) => s.startsWith('stale-'))) fail('stale-identity');
  if (evidence.records.some((r, index) => r.seq !== index)) fail('evidence-incomplete');
  const created = evidence.records.filter((r) => r.event === 'created');
  const moves = created.filter((r) => r.target === 'ghost');
  const lights = created.filter((r) => r.target === 'light');
  const launch = moves[0],
    capture = moves[1],
    light = lights[0];
  const finish = (start: Stage49Record | undefined) =>
    evidence.records.find(
      (r) =>
        r.event === 'fulfilled' &&
        start &&
        r.animation === start.animation &&
        r.targetIdentity === start.targetIdentity &&
        r.target === start.target,
    );
  const landed = finish(launch),
    lit = finish(light),
    captured = finish(capture);
  const cleanup = evidence.records.find((r) => r.event === 'cleanup');
  if (evidence.records.some((r) => r.event === 'rejected')) fail('animation-rejected');
  if (
    ![2, 3].includes(created.length) ||
    ![1, 2].includes(moves.length) ||
    lights.length !== 1 ||
    !launch ||
    !landed ||
    !light ||
    !lit ||
    !cleanup
  )
    fail('evidence-incomplete');
  // count는 공개 Captured commit 경계다. 안전 guard의 선택 원인은 이 E2E에서 측정하지 않는다.
  const replacement = light?.snapshot?.count === 1;
  if ((!replacement && (!capture || !captured)) || !light || !lit) fail('capture-missing');
  if (replacement ? moves.length !== 1 : moves.length !== 2) fail('evidence-incomplete');
  if (replacement && moves.length === 2) fail('early-capture');
  if (evidence.records.some((r) => r.lifecycle && r.lifecycle.root !== evidence.root))
    fail('stale-identity');
  const sequence = replacement
    ? [launch, landed, light, lit, cleanup]
    : [launch, landed, light, lit, capture, captured, cleanup];
  if (
    sequence.some((r) => !r?.snapshot) ||
    sequence.some((r, i) => i > 0 && r && r.seq <= (sequence[i - 1]?.seq ?? Infinity))
  )
    fail('evidence-incomplete');
  const semantic = sequence.filter((r): r is Stage49Record => !!r);
  const boundGhost = launch?.snapshot?.ghost,
    boundNative = launch?.snapshot?.native;
  for (const r of semantic) {
    const s = r.snapshot;
    if (!s) continue;
    if (
      s.root !== evidence.root ||
      (r !== cleanup &&
        (((!replacement || r === launch || r === landed) && s.ghost !== boundGhost) ||
          (r.target === 'ghost' && r.targetIdentity !== s.ghost))) ||
      ((replacement ? [launch, landed] : [launch, landed, light, lit]).includes(r) &&
        s.native !== boundNative)
    )
      fail('stale-identity');
  }
  if (
    !boundGhost ||
    !boundNative ||
    !light?.targetIdentity ||
    new Set(created.map((r) => r.animation)).size !== created.length ||
    created.some((r) => r.animation === null)
  )
    fail('evidence-incomplete');
  const fixed = launch?.snapshot?.nativeRect ?? null;
  if (!positive(fixed)) fail('evidence-incomplete');
  const stageCheck = (
    n: Stage49Rect | null,
    hidden: boolean,
    animations: number,
    ghosts: number,
  ) => {
    if (!positive(n)) fail('evidence-incomplete');
    else if (positive(fixed) && Math.abs(n.x - fixed.x) + Math.abs(n.y - fixed.y) >= 0.05)
      fail('native-moved');
    if (!hidden) fail('native-visible');
    if (animations !== 0) fail('native-animation');
    if (ghosts !== 1) fail('ghost-count');
  };
  for (const r of replacement ? [launch, landed] : [launch, landed, light, lit]) {
    const s = r?.snapshot;
    if (!s) continue;
    stageCheck(s.nativeRect, s.hidden, s.nativeAnimations, s.ghosts);
    if (s.count !== 0) fail('early-capture');
  }
  const active = frames.filter((f) => f.native.some((c) => c.id === '49'));
  if (active.length === 0) fail('evidence-incomplete');
  const firstActive = active[0]?.native.find((c) => c.id === '49');
  let moving = false;
  for (const f of active) {
    const natives = f.native.filter((c) => c.id === '49');
    const n = natives[0] ?? null,
      ghosts = f.ghosts.filter((c) => c.id === '49');
    if (natives.length !== 1) fail('evidence-incomplete');
    stageCheck(n, n?.hidden ?? false, n?.animations ?? -1, ghosts.length);
    // 원 stageIntact의 첫 active RAF 기준도 별도로 보존한다.
    if (n && firstActive && Math.abs(n.x - firstActive.x) + Math.abs(n.y - firstActive.y) >= 0.05)
      fail('native-moved');
    const g = ghosts[0];
    if (
      positive(g ?? null) &&
      positive(evidence.hand) &&
      positive(fixed) &&
      distance(g!, evidence.hand) >= 0.05 &&
      distance(g!, fixed) >= 0.05
    )
      moving = true;
    if (f.counts.reduce((a, b) => a + b, 0) !== 0) fail('early-capture');
  }
  if (!moving) {
    fail('ghost-stationary');
    fail('evidence-incomplete');
  }
  if (!same(launch?.snapshot?.ghostRect ?? null, evidence.hand)) fail('evidence-incomplete');
  if (!same(landed?.snapshot?.ghostRect ?? null, fixed)) fail('staging-mislanded');
  const cs = replacement ? light?.snapshot : capture?.snapshot,
    ce = replacement ? lit?.snapshot : captured?.snapshot;
  if (replacement) {
    // prepareCapture가 해제한 뒤 pulseCaptured가 만드는 별도 표시 경로.
    // 누락 이동을 허용하는 대신 도착→해제(count0)→commit(count1)→새 light 완료를 요구한다.
    const release = evidence.records.find(
      (r) =>
        r.event === 'lifetime' &&
        r.seq > (landed?.seq ?? Infinity) &&
        r.seq < (light?.seq ?? -1) &&
        r.lifecycle?.ghost === null &&
        r.lifecycle.ghosts === 0 &&
        r.lifecycle.native === boundNative &&
        r.lifecycle.count === 0,
    );
    const commit = evidence.records.find(
      (r) =>
        r.event === 'lifetime' &&
        r.seq > (release?.seq ?? Infinity) &&
        r.seq < (light?.seq ?? -1) &&
        r.lifecycle?.ghost === null &&
        r.lifecycle.ghosts === 0 &&
        r.lifecycle.native === null &&
        r.lifecycle.count === 1 &&
        r.lifecycle.endpoint === cs?.endpoint?.identity,
    );
    if (!release || !commit) fail('evidence-incomplete');
    if (!cs?.ghost || cs.ghost === boundGhost || cs.native !== null || ce?.native !== null)
      fail('stale-identity');
    if (!same(cs?.ghostRect ?? null, cs?.endpoint?.rect ?? null)) fail('capture-mislanded');
    for (const r of evidence.records) {
      if (!r.lifecycle) continue;
      if (r.lifecycle.root !== evidence.root) fail('stale-identity');
      if (
        r.seq < (landed?.seq ?? Infinity) &&
        (r.lifecycle.count !== 0 ||
          r.lifecycle.ghost !== boundGhost ||
          r.lifecycle.native !== boundNative)
      )
        fail('early-capture');
      if (
        r.seq > (landed?.seq ?? Infinity) &&
        r.seq < (light?.seq ?? -1) &&
        (r.lifecycle.ghost !== null || ![0, 1].includes(r.lifecycle.count))
      )
        fail('early-capture');
    }
  } else {
    for (const r of [light, lit])
      if (!same(r?.snapshot?.ghostRect ?? null, landed?.snapshot?.ghostRect ?? null))
        fail('staging-mislanded');
    if (!same(cs?.ghostRect ?? null, landed?.snapshot?.ghostRect ?? null))
      fail('capture-mislanded');
  }
  if (!light?.targetIdentity || light.targetIdentity === light.snapshot?.ghost)
    fail('stale-identity');
  const card49 = (s: Stage49Snapshot | null | undefined) =>
    s?.endpoint?.kind === 'card' && s.endpoint.cardId === '49' && positive(s.endpoint.rect);
  if (cs?.count !== 1 || ce?.count !== 1 || !card49(cs) || !card49(ce)) fail('capture-missing');
  if (cs && ce && (cs.endpoint?.identity !== ce.endpoint?.identity || cs.ghost !== ce.ghost))
    fail('stale-identity');
  if (!same(ce?.ghostRect ?? null, cs?.endpoint?.rect ?? null)) fail('capture-mislanded');
  if (cs?.ghosts !== 1 || ce?.ghosts !== 1) fail('ghost-count');
  const end = cleanup?.snapshot;
  if (
    evidence.records.some(
      (r) =>
        r.lifecycle?.count === 1 &&
        (!cs?.endpoint || r.lifecycle.endpoint !== cs.endpoint.identity),
    )
  )
    fail('capture-missing');
  if (
    end?.count !== 1 ||
    !card49(end) ||
    end?.endpoint?.identity !== cs?.endpoint?.identity ||
    frames.at(-1)?.counts.reduce((a, b) => a + b, 0) !== 1
  )
    fail('final-capture-missing');
  if (!end || end.ghosts !== 0 || end.ghost !== null || end.scenes !== 0 || end.hiddenCards !== 0)
    fail('cleanup-incomplete');
  return { ok: failures.size === 0, failures: [...failures] };
}
