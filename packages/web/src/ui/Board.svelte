<script lang="ts">
  import './board-layout.css';
  import type { Difficulty } from '@p2p-gostop/ai';
  import { conciseSoloNotice, difficultyLabels, playerLabel } from '../game/player-labels.ts';
  import Scene from '../pro-assets/Scene.svelte';
  // 게임판 (spec 6.2, FR-40): 각 진영 점수판·상대 획득패, 중앙 바닥·더미, 선택 영역, 내 획득패·현황·손패.
  // 보는 좌석(view.viewer)의 입력을 엔진 액션으로 만들어 onaction으로 올린다. 규칙 검증은 엔진(legalActions)이 한다.
  // 재생 중(busy)에는 입력을 받지 않고, 빈 바닥을 누르고 떼면 남은 애니메이션을 건너뛴다(spec 6.3, onskip).
  // data-anchor는 애니메이션 기준점(src/anim/choreo.ts), data-* 상태 속성은 E2E 자동 플레이·계측용이다.
  import {
    getCard,
    sameAction,
    type Action,
    type CardId,
    type Month,
    type Seat,
    type PlayerView,
  } from '@p2p-gostop/engine';
  import { onDestroy, untrack } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import type { BoardExtras } from '../game/adapter.ts';
  import { handAssist, handAssistPlayer, hintLevelOf } from '../game/assist.ts';
  import type { HintLevel } from '../game/assist.ts';
  import { boardNotices } from '../game/display.ts';
  import { formatCompactMoney, formatMoney } from '../lib/format.ts';
  import type { BoardView, MoneyUnit, SeatView } from '../lib/view-types.ts';
  import { settings } from '../settings/settings.svelte.ts';
  import { bannerActor, type Banner } from './banner.ts';
  import { stepLabel } from './settle-labels.ts';
  import { cardLabel, cardSrc } from './cards.ts';
  import CapturedPile from './CapturedPile.svelte';
  import ChoicePrompt from './ChoicePrompt.svelte';
  import EventRail from './EventRail.svelte';
  import Floor from './Floor.svelte';
  import PromptPanel from './PromptPanel.svelte';
  import GoStopModal from './GoStopModal.svelte';
  import Hand from './Hand.svelte';
  import type { HandVisualGroup } from './hand-visual.ts';
  import PickFirstPrompt from './PickFirstPrompt.svelte';
  import SeatBar from './SeatBar.svelte';
  import SeatProgress from './SeatProgress.svelte';
  import { seatStats, type SeatExtras } from './seat-stats.ts';

  type BoardSeat = SeatView & SeatExtras;

  interface Props {
    /** 좌석에 표시용 값(국진 위치·폭탄 횟수)이 있으면 쓰고, 없으면(프로토콜 뷰·픽스처) 진행도에서 읽는다 */
    view: BoardView & {
      readonly seats: readonly [BoardSeat, BoardSeat];
      readonly staging?: readonly CardId[];
      readonly highlight?: readonly CardId[];
    };
    soloPlayerView?: PlayerView | undefined;
    soloDifficulty?: Difficulty | undefined;
    extras?: BoardExtras | null;
    /** 갤러리/후속 기본 보조의 시각 슬롯. 확보 짝 판정은 여기서 하지 않는다. */
    handVisualGroups?: readonly HandVisualGroup[];
    /** 솔로 판 기록은 실제 보조 표식이 화면에 올라온 뒤 이 경로로 갱신한다. */
    onhintdisplayed?: ((level: HintLevel) => void) | undefined;
    /** #202 첫 실제 Board checkpoint 전용. 일반 경로 전환은 후속 리뷰 대상. */
    monthStacks?: boolean;
    unit?: MoneyUnit;
    perPoint?: number;
    roundChanges?: readonly [number, number];
    confirmDelay?: boolean;
    banner?: (Banner & { readonly id?: number }) | null;
    toast?: { readonly id: number; readonly text: string } | null;
    milestones?: readonly {
      readonly id: number;
      readonly round: number;
      readonly seat: Seat;
      readonly text: string;
    }[];
    /** 재생 또는 권위 입력 대기 (입력 잠금) */
    busy?: boolean;
    /** 실제 재생 큐 수명. 바닥 슬롯 해제는 입력 잠금과 분리한다. */
    playbackBusy?: boolean;
    /** 상대(CPU)가 생각 중 */
    thinking?: boolean;
    /** 마지막 탭→턴 종료 시간 ms (spec AC-06 계측, E2E가 읽는다) */
    turnMs?: number | null;
    timerText?: string | null;
    timerSeat?: Seat | null;
    timeoutText?: string | null;
    onaction?: ((action: Action, at: number) => void) | undefined;
    onskip?: (() => void) | undefined;
    /** 판 정보 대화상자의 열림 상태를 게임 화면에 알린다 (U14). */
    oninfochange?: ((open: boolean) => void) | undefined;
    /**
     * 짧게 알릴 문구 (국진 열끗↔쌍피 이동, 피 뺏기: M3 리뷰 S-2·I-4). 한 번만 부른다.
     * 표시·지우기(토스트 타이머)는 부르는 쪽이 한다.
     */
    onnotice?: ((text: string) => void) | undefined;
    /** 보드 루트 요소 (애니메이션 측정·건너뛰기 범위) */
    root?: HTMLElement | null;
  }

  let {
    view,
    roundChanges = [0, 0],
    soloPlayerView,
    soloDifficulty,
    extras = null,
    handVisualGroups = [],
    onhintdisplayed,
    monthStacks = false,
    unit = '냥',
    perPoint = settings.value.perPoint,
    confirmDelay = false,
    banner = null,
    toast = null,
    milestones = [],
    busy = false,
    playbackBusy = false,
    thinking = false,
    turnMs = null,
    timerText = null,
    timerSeat = null,
    timeoutText = null,
    onaction,
    onskip,
    oninfochange,
    onnotice,
    root = $bindable(null),
  }: Props = $props();

  let landscape = $state(false);
  let infoDialog: HTMLDialogElement;
  // UX-07/24: 회전 잠금과 선택 창 잠금은 이 보드 한 곳에서 합성한다.
  // 선택 창 전환 중에는 여러 창이 공존할 수 있으므로 활성 창을 모두 추적한다.
  const promptPanels = new SvelteSet<HTMLElement>();
  const dismissedPanels = new SvelteSet<HTMLElement>();
  const appliedInert = new SvelteMap<HTMLElement, boolean>();
  function applyBackgroundInert(board: HTMLElement) {
    const next = new SvelteSet<HTMLElement>();
    if (landscape) {
      for (const selector of ['.hud', '.decision-area', '.mine-hud', '.hand-zone']) {
        const node = board.querySelector<HTMLElement>(selector);
        if (node) next.add(node);
      }
    }
    for (const panel of promptPanels) {
      for (let child = panel; child.parentElement; child = child.parentElement) {
        for (const sibling of child.parentElement.children) {
          if (
            sibling instanceof HTMLElement &&
            sibling !== child &&
            !sibling.matches('script, style')
          )
            next.add(sibling);
        }
        if (child.parentElement === board || child.parentElement === document.body) break;
      }
    }
    for (const panel of dismissedPanels) next.add(panel);
    for (const [node, previous] of appliedInert) {
      if (next.has(node)) continue;
      node.inert = previous;
      appliedInert.delete(node);
    }
    for (const node of next) {
      if (!appliedInert.has(node)) appliedInert.set(node, node.inert);
      node.inert = true;
    }
  }
  function managePromptLock(board: HTMLElement) {
    const change = (event: Event) => {
      const { panel, active } = (
        event as CustomEvent<{ panel: HTMLElement; active: boolean | null }>
      ).detail;
      if (active) {
        if (dismissedPanels.delete(panel)) appliedInert.set(panel, false);
        promptPanels.add(panel);
      } else {
        promptPanels.delete(panel);
        if (active === null) dismissedPanels.delete(panel);
        else dismissedPanels.add(panel);
      }
      applyBackgroundInert(board);
    };
    board.addEventListener('promptlockchange', change);
    return {
      destroy() {
        board.removeEventListener('promptlockchange', change);
        for (const [node, previous] of appliedInert) node.inert = previous;
        appliedInert.clear();
        promptPanels.clear();
        dismissedPanels.clear();
      },
    };
  }
  $effect(() => {
    // 손에 든 기기의 가로 회전만 안내한다. Mac 창은 방향·크기와 무관하게 같은 판을 쓴다.
    const media = window.matchMedia(
      '(orientation: landscape) and (pointer: coarse) and (max-width: 1023px)',
    );
    const update = () => {
      const wasLandscape = untrack(() => landscape);
      landscape = media.matches;
      const board = root;
      if (board) untrack(() => applyBackgroundInert(board));
      if (wasLandscape && !media.matches && !document.querySelector('dialog:modal')) {
        const panel = untrack(() => [...promptPanels].find((node) => node.isConnected));
        if (panel && !panel.contains(document.activeElement))
          (panel.querySelector<HTMLElement>('h2') ?? panel).focus({ preventScroll: true });
      }
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const seat = $derived(view.viewer);
  const me = $derived(view.seats[seat]);
  const opponent = $derived(view.seats[seat === 0 ? 1 : 0]);
  const opponentLabel = $derived(
    playerLabel(opponent.name, soloDifficulty !== undefined && seat === 0),
  );
  const displayToast = $derived(
    toast && soloDifficulty !== undefined
      ? {
          ...toast,
          fullText: toast.text,
          text: conciseSoloNotice(toast.text, [view.seats[0].name, view.seats[1].name]),
        }
      : toast,
  );
  const myStats = $derived(seatStats(me));
  const opponentStats = $derived(seatStats(opponent));
  const expandedHud = $derived(
    [me.balance, opponent.balance].some((balance) => formatMoney(balance, unit).length > 10),
  );
  const actor = $derived(banner ? bannerActor(banner, seat) : null);

  // #104의 판 정보 UI가 들어오면 dialog[aria-label="판 정보"]의 open 상태를
  // Game에 전달한다. showModal/close/ESC 모두 open 속성 변경으로 관찰된다.
  $effect(() => {
    const board = root;
    if (board === null || oninfochange === undefined) return;
    let reported = false;
    const report = () => {
      const open =
        board.querySelector<HTMLDialogElement>('dialog[aria-label="판 정보"]')?.open ?? false;
      if (open === reported) return;
      reported = open;
      oninfochange(open);
    };
    const observer = new MutationObserver(report);
    observer.observe(board, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    report();
    return () => {
      observer.disconnect();
      if (reported) oninfochange(false);
    };
  });

  /** 직전에 그린 판 (알림 비교용, 반응형일 필요 없음) */
  let previous: Props['view'] | null = null;
  $effect(() => {
    const next = view;
    const prev = previous;
    previous = next;
    if (prev === null || onnotice === undefined) return;
    for (const text of boardNotices(prev, next)) onnotice(text);
  });
  const pending = $derived(!busy && view.pending?.seat === seat ? view.pending : null);
  const legal = $derived(
    view.legal ?? view.playable.map((card) => ({ type: 'play' as const, seat, card })),
  );
  const pickFirst = $derived(busy ? null : (extras?.pickFirst ?? null));
  const playable = $derived(busy || landscape ? [] : view.playable);
  const localHintLevel = $derived(hintLevelOf(settings.value));
  const soloAligned = $derived(
    soloPlayerView === undefined || soloPlayerView.eventSeq === view.eventSeq,
  );
  const assist = $derived(
    soloPlayerView === undefined
      ? handAssist(view, busy || landscape ? 'off' : localHintLevel)
      : handAssistPlayer(
          soloPlayerView,
          busy || landscape || !soloAligned ? 'off' : localHintLevel,
        ),
  );
  $effect(() => {
    const level = localHintLevel;
    const shown =
      assist.matchable.length > 0 || assist.secured.length > 0 || assist.groups.length > 0;
    // 상세 전용 설명은 #81/#82에서 붙는다. 지금 보이는 기본 표식은 기본 사용으로 기록한다.
    if (shown && onhintdisplayed) onhintdisplayed(level === 'detail' ? 'basic' : level);
  });
  const matchable = $derived(assist.matchable);

  /** 누르고 있는 손패 카드 (먹게 될 바닥 카드 미리보기, spec 6.3) */
  let preview = $state<CardId | null>(null);
  let singleCard = $state<CardId | null>(null);
  const bombCards = $derived(
    playable.filter((card) => {
      const month = getCard(card).month;
      return month !== null && legal.some((a) => a.type === 'bomb' && a.month === month);
    }),
  );
  const handGroups = $derived<readonly HandVisualGroup[]>([
    ...assist.groups,
    ...(extras?.bombMonths ?? []).map((month) => ({
      id: `bomb-${month}`,
      kind: 'bomb' as const,
      cards: handCardsOfMonth(month),
    })),
    ...(pending?.kind === 'shake'
      ? [
          {
            id: `shake-${pending.month}`,
            kind: 'shake' as const,
            cards: handCardsOfMonth(pending.month),
          },
        ]
      : []),
    ...handVisualGroups,
  ]);
  const handLinks = $derived.by(() => {
    const links: Record<number, 'bomb' | 'chongtong'> = {};
    if (localHintLevel === 'off' || busy || landscape) return links;
    for (const group of assist.groups) {
      if (group.kind !== 'bomb' && group.kind !== 'chongtong') continue;
      const month = getCard(group.cards[0]!).month;
      if (month !== null && view.floor.some((floor) => floor.month === month))
        links[month] = group.kind;
    }
    return links;
  });
  const selectedHandGroup = $derived(
    handGroups.find((group) => group.kind === 'bomb' && group.cards.includes(preview ?? -1))?.id ??
      null,
  );

  const previewCards = $derived.by(() => {
    if (preview === null) return [];
    const month = getCard(preview).month;
    return view.floor.find((g) => g.month === month)?.cards ?? [];
  });
  const floorHighlight = $derived([
    ...(pending?.kind === 'target' ? pending.options : []),
    ...(view.highlight ?? []),
    ...(localHintLevel === 'off' ? [] : previewCards),
  ]);
  const selecting = $derived(pickFirst !== null || (pending !== null && pending.kind !== 'play'));
  const awaiting = $derived(pending !== null || pickFirst !== null);

  let reserved: { action: Action; at: number; timer: ReturnType<typeof setTimeout> } | null = null;
  function cancelReserved() {
    if (reserved !== null) clearTimeout(reserved.timer);
    reserved = null;
  }
  $effect(() => {
    if (busy || landscape || view.pending?.kind !== 'play') {
      cancelReserved();
      singleCard = null;
    }
    return () => {
      cancelReserved();
      singleCard = null;
    };
  });
  onDestroy(cancelReserved);

  function act(action: Action, at = performance.now()) {
    cancelReserved();
    preview = null;
    singleCard = null;
    if (!landscape) onaction?.(action, at);
  }

  function play(card: CardId, at: number, single: boolean) {
    if (selecting || busy || landscape) return;
    const month = getCard(card).month;
    const action: Action =
      !single && month !== null && bombCards.includes(card)
        ? { type: 'bomb', seat, month }
        : { type: 'play', seat, card };
    if (!legal.some((candidate) => sameAction(candidate, action))) return;
    if (!confirmDelay || single) {
      act(action, at);
      return;
    }
    if (reserved !== null && sameAction(reserved.action, action)) {
      cancelReserved();
      return;
    }
    cancelReserved();
    const timer = setTimeout(() => {
      reserved = null;
      if (!busy && !landscape && legal.some((candidate) => sameAction(candidate, action)))
        act(action, at);
    }, 120);
    reserved = { action, at, timer };
  }

  function handCardsOfMonth(month: Month | null): CardId[] {
    return (me.hand ?? []).filter((id) => getCard(id).month === month);
  }

  const targetKey = $derived(
    pending?.kind === 'target'
      ? `${view.round}:${view.eventSeq}:${pending.source}:${pending.card}:${pending.options.join(',')}`
      : '',
  );
  let targetPress: {
    pointer: number;
    key: string;
    card: CardId;
    width: number;
    height: number;
  } | null = null;
  let targetRelease: { source: 'pointer' | 'keyboard'; key: string; card: CardId } | null = null;
  let heldTargetKey: string | null = null;
  let cancelledTargetKey = false;
  function cancelTarget() {
    targetPress = null;
    targetRelease = null;
  }
  function startTarget(e: PointerEvent, key: string, card: CardId) {
    const button = e.currentTarget as HTMLElement;
    cancelTarget();
    if (key !== targetKey || e.button !== 0 || landscape) return;
    targetPress = { pointer: e.pointerId, key, card, width: innerWidth, height: innerHeight };
    try {
      button.setPointerCapture(e.pointerId);
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
      // 이미 끝난 포인터는 이후 up/click으로 후보를 제출하지 않는다. 수락된 액션은 건드리지 않는다.
      cancelTarget();
    }
  }
  function finishTarget(e: PointerEvent, key: string, card: CardId) {
    const p = targetPress;
    targetPress = null;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      p &&
      p.pointer === e.pointerId &&
      p.key === key &&
      p.card === card &&
      key === targetKey &&
      p.width === innerWidth &&
      p.height === innerHeight &&
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top &&
      e.clientY <= r.bottom
    )
      targetRelease = { source: 'pointer', key, card };
  }
  function targetKeyDown(e: KeyboardEvent, key: string, card: CardId) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.repeat || cancelledTargetKey || key !== targetKey || landscape) {
      e.preventDefault();
      return;
    }
    heldTargetKey = e.key;
    // Enter의 native click은 currentTarget의 키 입력과 같은 후보만 소비한다.
    targetRelease = { source: 'keyboard', key, card };
  }
  function targetKeyUp(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (cancelledTargetKey) {
      e.preventDefault();
      if (targetRelease?.source === 'keyboard') targetRelease = null;
    }
    heldTargetKey = null;
    cancelledTargetKey = false;
  }
  function chooseTarget(e: MouseEvent, key: string, card: CardId) {
    const p = targetRelease;
    const pointerClick = e.detail > 0;
    if (
      key !== targetKey ||
      landscape ||
      pending?.kind !== 'target' ||
      !pending.options.includes(card) ||
      (pointerClick && (p?.source !== 'pointer' || p.key !== key || p.card !== card)) ||
      (!pointerClick && (cancelledTargetKey || p?.source === 'pointer'))
    )
      return;
    targetRelease = null;
    act({ type: 'chooseTarget', seat, card });
  }
  $effect(() => {
    void targetKey;
    void landscape;
    cancelTarget();
    if (heldTargetKey) cancelledTargetKey = true;
  });
  function resizeTarget() {
    cancelTarget();
    if (heldTargetKey) cancelledTargetKey = true;
  }
  $effect(() => {
    const key = targetKey;
    if (!monthStacks || !key || !root) return;
    const wrapper = [...root.querySelectorAll<HTMLElement>('.floor-target')].find(
      (candidate) => candidate.dataset['targetKey'] === key,
    );
    if (!wrapper) return;
    let before = '';
    const check = () => {
      const next = [...wrapper.querySelectorAll('button')]
        .map((b) => {
          const r = b.getBoundingClientRect();
          return `${r.x}:${r.y}:${r.width}:${r.height}`;
        })
        .join('|');
      if (before && before !== next) resizeTarget();
      before = next;
    };
    const observer = new ResizeObserver(check);
    observer.observe(wrapper);
    check();
    return () => observer.disconnect();
  });
  let skipPress: { id: number; x: number; y: number } | null = null;
  function emptyFloor(target: EventTarget | null) {
    return (
      target instanceof Element &&
      !!target.closest('.center') &&
      !target.closest('.card, .group, .deck-area, button, [role="dialog"]')
    );
  }
  function startSkip(event: PointerEvent) {
    skipPress =
      busy && event.button === 0 && emptyFloor(event.target)
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
  }
  function finishSkip(event: PointerEvent) {
    const press = skipPress;
    skipPress = null;
    if (
      !busy ||
      !press ||
      press.id !== event.pointerId ||
      !emptyFloor(event.target) ||
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    onskip?.();
  }
</script>

<svelte:window onresize={resizeTarget} onkeyup={targetKeyUp} onpointercancel={cancelTarget} />

<section
  data-board-layout="match"
  class={[
    'board',
    {
      monthStacks,
      'hud-expanded': expandedHud,
      selecting,
      'two-hands': pickFirst === null,
      'first-pick': pickFirst !== null,
      'go-stop': pending?.kind === 'goStop',
    },
  ]}
  aria-label="게임판"
  tabindex="-1"
  aria-busy={busy}
  data-testid="board"
  data-awaiting={awaiting || (!busy && playable.length > 0) ? 'me' : 'other'}
  data-busy={busy}
  data-turn-ms={turnMs}
  bind:this={root}
  use:managePromptLock
  onpointerdowncapture={startSkip}
  onpointerupcapture={finishSkip}
  onpointercancel={() => (skipPress = null)}
>
  <Scene scene="table" />
  <div class="hud" data-testid="hud">
    <div class="table-heading">
      <span>{view.round}판 · 점당 {formatCompactMoney(perPoint, unit)}</span>
      <strong title={opponent.name}
        >{pending?.kind === 'target' ? '먹을 바닥패를 선택하세요' : opponentLabel}</strong
      >
    </div>
    <div class="menu-reserved" data-testid="menu-reserved" aria-hidden="true">메뉴</div>
  </div>
  <div class="captured-zone" data-anchor="opp-hand">
    <CapturedPile
      summary
      stats={opponentStats}
      label="상대 획득패"
      highlight={view.highlight ?? []}
    />
  </div>
  <div class="opponent-hud">
    <div class="scoreboard" class:expanded={expandedHud} aria-label="상대 점수판">
      <SeatBar
        who="상대"
        timerText={timerSeat !== null && timerSeat !== seat ? timerText : null}
        name={opponent.name}
        displayName={opponentLabel}
        score={opponent.score}
        goCount={opponent.goCount}
        balance={opponent.balance}
        delta={roundChanges[seat === 0 ? 1 : 0]}
        {unit}
        expanded={expandedHud}
      />
    </div>
  </div>

  <div class="center" class:monthStacks>
    <Floor
      compact
      {monthStacks}
      layoutSuspended={landscape}
      round={view.round}
      {playbackBusy}
      snapshotSeq={view.eventSeq}
      groups={view.floor}
      options={pending?.kind === 'target' ? pending.options : []}
      onchoose={(card) => act({ type: 'chooseTarget', seat, card })}
      {handLinks}
      deckCount={view.deckCount}
      highlight={floorHighlight}
      staging={view.staging ?? []}
    />
    {#if monthStacks && pending?.kind === 'target'}
      {#key `${view.round}:${view.eventSeq}:${pending.source}:${pending.card}:${pending.options.join(',')}`}
        {@const promptKey = targetKey}
        <div class="floor-target" data-testid="floor-target" data-target-key={promptKey}>
          <PromptPanel title={`${getCard(pending.options[0]!).month}월 먹을 패`}>
            {#snippet actions()}
              <div class="floor-target-choices">
                {#each pending.options as card (card)}
                  <button
                    type="button"
                    data-choice={`target-${card}`}
                    data-candidate-id={card}
                    aria-label={cardLabel(card)}
                    onpointerdown={(e) => startTarget(e, promptKey, card)}
                    onpointerup={(e) => finishTarget(e, promptKey, card)}
                    onpointercancel={cancelTarget}
                    onkeydown={(e) => targetKeyDown(e, promptKey, card)}
                    onkeyup={targetKeyUp}
                    onclick={(e) => chooseTarget(e, promptKey, card)}
                  >
                    <img src={cardSrc(card)} alt="" draggable="false" />
                    <span>{cardLabel(card).replace(/^\d+월 /, '')}</span>
                  </button>
                {/each}
              </div>
            {/snippet}
          </PromptPanel>
        </div>
      {/key}
    {/if}
  </div>
  <div
    class="decision-area"
    class:idle-slot={(!selecting || pending?.kind === 'target') && !view.canFlipOnly}
  >
    <div class="decision-content">
      {#if timeoutText && timerText}<p class="timer-prompt">{timerText} · {timeoutText}</p>{/if}
      <EventRail
        {banner}
        toast={displayToast}
        {actor}
        round={view.round}
        viewer={seat}
        {milestones}
        blocked={selecting || view.canFlipOnly}
        idle={thinking
          ? '상대 차례 · 생각 중'
          : busy
            ? '진행 중'
            : playable.length > 0
              ? '내 차례'
              : '상대 차례'}
      />
      {#if !busy && view.canFlipOnly && legal.some((a) => a.type === 'flipOnly') && (me.bombTokens ?? 0) > 0 && legal.length > 1}
        <button
          type="button"
          class="flip-only"
          data-choice="flipOnly"
          onclick={(e) => act({ type: 'flipOnly', seat }, e.timeStamp)}
          >뒤집기만 {me.bombTokens}회</button
        >
      {/if}
      {#if !busy && singleCard !== null && bombCards.includes(singleCard)}
        <button
          type="button"
          class="flip-only"
          data-choice="single"
          onclick={(e) => {
            if (singleCard !== null) play(singleCard, e.timeStamp, true);
          }}>선택 카드 한 장만 내기</button
        >
      {/if}

      {#if pickFirst}
        <PickFirstPrompt
          poolSize={pickFirst.poolSize}
          taken={pickFirst.taken}
          onpick={(index) => act({ type: 'pickFirst', seat, index })}
        />
      {:else if pending?.kind === 'goStop'}
        <GoStopModal
          score={pending.score}
          goCount={pending.goCount}
          stopAmount={pending.stopAmount}
          {unit}
          detail={extras?.goStop ?? null}
          opponent={{ name: opponent.name, score: opponent.score, pi: opponentStats.piCount }}
          ongo={() => act({ type: 'go', seat })}
          onstop={() => act({ type: 'stop', seat })}
        />
      {:else if pending?.kind === 'shake'}
        <ChoicePrompt
          title="흔들고 내기"
          message={`${pending.month}월 ${handCardsOfMonth(pending.month).length}장을 보여 주고 이기면 ×2`}
          cards={handCardsOfMonth(pending.month)}
          choices={[
            { id: 'shake', label: '흔들고 내기' },
            { id: 'noShake', label: '그냥 내기' },
          ]}
          onchoose={(id) => act({ type: 'shake', seat, accept: id === 'shake' })}
        />
      {:else if pending?.kind === 'chongtong'}
        <ChoicePrompt
          title="총통!"
          message={`${pending.months.join('·')}월 4장. 끝내면 바로 이깁니다`}
          cards={handCardsOfMonth(pending.months[0] ?? null)}
          choices={[
            { id: 'end', label: '끝내기', primary: true },
            { id: 'continue', label: '계속하기' },
          ]}
          onchoose={(id) =>
            act({ type: 'chongtong', seat, choice: id === 'end' ? 'end' : 'continue' })}
        />
      {:else if pending?.kind === 'gukjin'}
        <ChoicePrompt
          title="국진을 어디에 둘까요?"
          message="9월 열끗(국진)은 열끗 또는 쌍피로 셀 수 있습니다"
          choices={[
            { id: 'yeol', label: '열끗' },
            { id: 'pi', label: '쌍피', primary: true },
          ]}
          onchoose={(id) => act({ type: 'gukjin', seat, asPi: id === 'pi' })}
        />
      {/if}
    </div>
  </div>
  <div class="mine-hud">
    <div class="scoreboard" class:expanded={expandedHud} aria-label="내 점수판">
      <SeatBar
        who="나"
        timerText={timerSeat === seat ? timerText : null}
        name={me.name}
        score={me.score}
        goCount={me.goCount}
        balance={me.balance}
        delta={roundChanges[seat]}
        {unit}
        expanded={expandedHud}
        multiplier={view.multiplier}
        estimatedAmount={pending?.kind === 'goStop' ? pending.stopAmount : null}
        stopPreview={view.pending?.kind === 'goStop' && view.pending.seat === seat}
        shakes={me.shakes}
        ppeokCount={me.ppeokCount}
        dealer={view.dealer === seat}
      />
    </div>
  </div>
  <div class="captured-zone mine">
    <CapturedPile summary stats={myStats} label="내 획득패" highlight={view.highlight ?? []} />
  </div>
  <div class="hand-zone">
    <Hand
      compact
      cards={me.hand ?? []}
      revision={view}
      {playable}
      {matchable}
      cuesEnabled={localHintLevel !== 'off' && !busy && !landscape && soloAligned}
      visualGroups={[
        ...handGroups,
        ...assist.secured.map((card) => ({
          id: `secured-${card}`,
          kind: 'secured' as const,
          cards: [card],
        })),
      ]}
      {bombCards}
      selectedGroup={selectedHandGroup}
      onplay={play}
      oninvalidate={cancelReserved}
      onpreview={(id) => {
        preview = id;
        if (id !== null) singleCard = bombCards.includes(id) ? id : null;
      }}
    />
  </div>
  <dialog class="board-info" bind:this={infoDialog} aria-label="판 정보">
    <header>
      <h2>판 정보</h2>
      <button type="button" onclick={() => infoDialog.close()}>닫기</button>
    </header>
    {#if soloDifficulty !== undefined}
      <p>컴퓨터 난이도: {difficultyLabels[soloDifficulty]}</p>
    {/if}
    <p>나: {me.name} · 상대: {opponent.name}</p>
    {#if timerText}
      <p>{timerText}{timeoutText ? ` · ${timeoutText}` : ''}</p>
      <p>판 정보를 보는 동안에도 시간은 흐릅니다.</p>
    {/if}
    {#if pending?.kind === 'target'}<p>
        {pending.source === 'play' ? '낸 패' : '뒤집은 패'}: {cardLabel(pending.card)}
      </p>{/if}
    {#if pending?.kind === 'goStop'}
      <h3>스톱 예상액</h3>
      <p>{formatMoney(pending.stopAmount, unit)}</p>
      {#if extras?.goStop}
        <h3>배수 상세</h3>
        {#each extras.goStop.steps as step, i (i)}<p>
            {stepLabel(step.kind)}
            {step.op === 'mul' ? '×' : '+'}{step.value}
          </p>{/each}
        {#if extras.goStop.capped}<p>상대 잔액까지</p>{/if}
      {/if}
    {/if}
    <h3>족보 진행</h3>
    <SeatProgress
      who="상대"
      stats={opponentStats}
      shakes={opponent.shakes}
      ppeokCount={opponent.ppeokCount}
      bombs={opponent.bombs ?? null}
      handCount={opponent.handCount}
    />
    <SeatProgress
      who="내"
      stats={myStats}
      shakes={me.shakes}
      ppeokCount={me.ppeokCount}
      bombs={me.bombs ?? null}
    />
    {#each [{ who: '상대', stats: opponentStats }, { who: '내', stats: myStats }] as entry (entry.who)}
      <h3>{entry.who} 획득패</h3>
      {#each entry.stats.piles as pile (pile.key)}
        <p>{pile.name} {pile.value}{pile.key === 'pi' ? '피' : '장'}</p>
        <div class="info-cards">
          {#each pile.cards as id (id)}<figure>
              <img src={cardSrc(id)} alt={cardLabel(id)} />
              <figcaption>{cardLabel(id)}</figcaption>
            </figure>{/each}
        </div>
      {/each}
    {/each}
  </dialog>
  {#if landscape}<div class="rotate-notice" role="alert">세로로 돌려 게임을 계속하세요</div>{/if}
</section>

<style>
  .center.monthStacks {
    position: relative;
  }
  .floor-target {
    position: absolute;
    top: 8px;
    left: 0;
    right: 0;
    max-height: calc(100% - 16px);
    z-index: var(--z-prompt);
  }
  .floor-target :global(.prompt) {
    height: auto;
    border-color: var(--color-divider);
    background: var(--color-bg);
  }
  .floor-target-choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .floor-target-choices button {
    min-width: 48px;
    min-height: 48px;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
  }
  .floor-target-choices button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
  .floor-target-choices img {
    width: var(--table-card);
    height: var(--table-card-height);
    flex: none;
  }
  .floor-target-choices span {
    font-size: 14px;
    line-height: 20px;
  }

  .flip-only {
    min-width: 48px;
    min-height: 48px;
    padding: 0 4px;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
    line-height: 20px;
  }
  .board-info {
    width: min(90vw, 28rem);
    max-height: 85dvh;
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: 16px;
    padding: 16px;
    background: var(--color-bg);
    color: var(--color-text);
  }
  .board-info::backdrop {
    background: var(--color-scrim);
  }
  .board-info header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .board-info button {
    min-height: 48px;
    min-width: 48px;
    font: inherit;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
  }
  .info-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .info-cards figure {
    margin: 0;
  }
  .info-cards img {
    width: 44px;
    height: auto;
  }
  .info-cards figcaption {
    font-size: 14px;
  }
  .rotate-notice {
    position: absolute;
    inset: 0;
    z-index: var(--z-menu);
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--color-bg);
    text-align: center;
  }
</style>
