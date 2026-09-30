<script lang="ts">
  import Scene from '../pro-assets/Scene.svelte';
  // 게임판 (spec 6.2, FR-40): 각 진영 점수판·상대 획득패, 중앙 바닥·더미, 선택 영역, 내 획득패·현황·손패.
  // 보는 좌석(view.viewer)의 입력을 엔진 액션으로 만들어 onaction으로 올린다. 규칙 검증은 엔진(legalActions)이 한다.
  // 재생 중(busy)에는 입력을 받지 않고, 빈 바닥을 누르고 떼면 남은 애니메이션을 건너뛴다(spec 6.3, onskip).
  // data-anchor는 애니메이션 기준점(src/anim/choreo.ts), data-* 상태 속성은 E2E 자동 플레이·계측용이다.
  import {
    getCard,
    scoreCaptured,
    sameAction,
    type Action,
    type CardId,
    type Month,
    type Seat,
    type PlayerView,
  } from '@p2p-gostop/engine';
  import { onDestroy } from 'svelte';
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
  import GoStopModal from './GoStopModal.svelte';
  import Hand from './Hand.svelte';
  import type { HandVisualGroup } from './hand-visual.ts';
  import PickFirstPrompt from './PickFirstPrompt.svelte';
  import SeatBar from './SeatBar.svelte';
  import SeatProgress from './SeatProgress.svelte';
  import { gukjinAsPiOf, seatStats, type SeatExtras } from './seat-stats.ts';

  type BoardSeat = SeatView & SeatExtras;

  interface Props {
    /** 좌석에 표시용 값(국진 위치·폭탄 횟수)이 있으면 쓰고, 없으면(프로토콜 뷰·픽스처) 진행도에서 읽는다 */
    view: BoardView & {
      readonly seats: readonly [BoardSeat, BoardSeat];
      readonly staging?: readonly CardId[];
      readonly highlight?: readonly CardId[];
    };
    soloPlayerView?: PlayerView | undefined;
    extras?: BoardExtras | null;
    /** 갤러리/후속 기본 보조의 시각 슬롯. 확보 짝 판정은 여기서 하지 않는다. */
    handVisualGroups?: readonly HandVisualGroup[];
    /** 솔로 판 기록은 실제 보조 표식이 화면에 올라온 뒤 이 경로로 갱신한다. */
    onhintdisplayed?: ((level: HintLevel) => void) | undefined;
    unit?: MoneyUnit;
    perPoint?: number;
    roundChanges?: readonly [number, number];
    confirmDelay?: boolean;
    banner?: (Banner & { readonly id?: number }) | null;
    toast?: { readonly id: number; readonly text: string } | null;
    /** 이벤트 재생 중 (입력 잠금) */
    busy?: boolean;
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
    extras = null,
    handVisualGroups = [],
    onhintdisplayed,
    unit = '냥',
    perPoint = settings.value.perPoint,
    confirmDelay = false,
    banner = null,
    toast = null,
    busy = false,
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
  $effect(() => {
    // 손에 든 기기의 가로 회전만 안내한다. Mac 창은 방향·크기와 무관하게 같은 판을 쓴다.
    const media = window.matchMedia(
      '(orientation: landscape) and (pointer: coarse) and (max-width: 1023px)',
    );
    const update = () => {
      landscape = media.matches;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  const seat = $derived(view.viewer);
  const me = $derived(view.seats[seat]);
  const opponent = $derived(view.seats[seat === 0 ? 1 : 0]);
  const myStats = $derived(seatStats(me));
  const opponentStats = $derived(seatStats(opponent));
  const jokboScores = $derived(
    [0, 1].map((seat) =>
      scoreCaptured(view.seats[seat as Seat].captured, gukjinAsPiOf(view.seats[seat as Seat])),
    ) as [ReturnType<typeof scoreCaptured>, ReturnType<typeof scoreCaptured>],
  );
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
    ...previewCards,
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

<section
  class={[
    'board',
    {
      'hud-expanded': expandedHud,
      selecting,
      'two-hands': (me.hand?.length ?? 0) > 6,
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
  onpointerdowncapture={startSkip}
  onpointerupcapture={finishSkip}
  onpointercancel={() => (skipPress = null)}
>
  <Scene scene="table" />
  <div class="hud" inert={landscape} data-testid="hud">
    <div class="table-heading">
      <span>{view.round}판 · 점당 {formatCompactMoney(perPoint, unit)}</span>
      <strong title={opponent.name}
        >{pending?.kind === 'target' ? '먹을 바닥패를 선택하세요' : opponent.name}</strong
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
        score={opponent.score}
        goCount={opponent.goCount}
        balance={opponent.balance}
        delta={roundChanges[seat === 0 ? 1 : 0]}
        {unit}
        expanded={expandedHud}
      />
    </div>
  </div>

  <div class="center">
    <Floor
      compact
      groups={view.floor}
      options={pending?.kind === 'target' ? pending.options : []}
      onchoose={(card) => act({ type: 'chooseTarget', seat, card })}
      {handLinks}
      deckCount={view.deckCount}
      highlight={floorHighlight}
      staging={view.staging ?? []}
    />
  </div>
  <div
    class="decision-area"
    class:idle-slot={(!selecting || pending?.kind === 'target') && !view.canFlipOnly}
    inert={landscape}
  >
    <div class="decision-content">
      {#if timeoutText && timerText}<p class="timer-prompt">{timerText} · {timeoutText}</p>{/if}
      <EventRail
        {banner}
        {toast}
        {actor}
        round={view.round}
        viewer={seat}
        {jokboScores}
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
  <div class="mine-hud" inert={landscape}>
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
  <div class="hand-zone" inert={landscape}>
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
  .board {
    --hud-height: var(--hud-height-compact);
    --hud-extra-height: calc(var(--hud-height-expanded) - var(--hud-height));
    --decision-height: 56px;
    --hand-height: 108px;
    --capture-height: 44px;
    --my-capture-height: 48px;
    position: relative;
    display: grid;
    grid-template-rows:
      var(--hud-height) var(--capture-height) minmax(208px, 1fr) var(--decision-height)
      var(--my-capture-height) var(--hand-height);
    gap: 4px;
    height: 100dvh;
    min-height: 0;
    padding: max(8px, var(--board-safe-top, env(safe-area-inset-top)))
      max(12px, env(safe-area-inset-right))
      max(8px, var(--board-safe-bottom, env(safe-area-inset-bottom)))
      max(12px, env(safe-area-inset-left));
    background: var(--board-background);
    overflow: hidden;
  }
  .board.selecting {
    --decision-height: 132px;
  }
  .board.two-hands {
    --hand-height: 168px;
  }
  .board.hud-expanded:not(.selecting) {
    --decision-height: calc(56px + var(--hud-extra-height));
  }
  .board.hud-expanded {
    grid-template-rows:
      84px var(--capture-height) minmax(208px, 1fr) calc(
        var(--decision-height) - var(--hud-extra-height)
      )
      var(--my-capture-height) var(--hand-height);
  }
  .hud {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--hud-menu-size);
    gap: var(--hud-menu-gap);
    align-items: start;
  }

  .scoreboard {
    display: grid;
    grid-template-columns:
      minmax(32px, 64px) minmax(max-content, 1fr)
      max-content max-content max-content;
    column-gap: 8px;
    min-width: 0;
    height: var(--hud-height);
    grid-template-rows: repeat(2, minmax(0, 1fr));
    box-shadow: 0 0 0 1px var(--color-hud-outline);
    border-radius: var(--hud-radius);
    overflow: hidden;
  }

  .scoreboard.expanded {
    height: var(--hud-height-expanded);
  }
  @media (min-width: 410px) {
    .board {
      --hud-height: var(--hud-height-wide);
    }
  }

  .menu-reserved {
    width: var(--hud-menu-size);
    height: var(--hud-menu-size);
    pointer-events: none;
  }
  .captured-zone {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  /* 기존 Game의 상대 손패 anchor 패딩은 메뉴 이전 위치용이다. 실제 예약은 상단 HUD가 소유한다. */
  .board .captured-zone :global([data-anchor='opp-hand']) {
    padding-right: 0;
  }

  .captured-zone {
    position: relative;
    gap: 0;
  }
  .captured-zone :global(.captured) {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .captured-zone :global(.group) {
    min-width: 0;
  }
  .captured-zone :global(.name) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 20px;
    padding: 0 6px;
    border: 1px solid var(--color-hud-outline);
    border-radius: 6px;
    background: var(--color-hud);
    color: var(--color-hud-text);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .captured-zone :global(.name small) {
    display: none;
  }
  .captured-zone :global(.stack) {
    width: 100%;
  }
  .captured-zone :global(.stack > .card + .card) {
    margin-left: calc(
      min(7px, (100% - var(--card-w-s)) / max(1, var(--pile-count) - 1)) - var(--card-w-s)
    );
  }
  .captured-zone > :global(.captured) {
    position: absolute;
    inset: 0;
    visibility: hidden;
    min-height: 0;
  }
  .decision-area {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 48px;
    gap: 8px;
    min-height: 0;
    align-items: center;
  }
  .decision-area.idle-slot {
    height: 100%;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 3px;
    padding-left: 12px;
    border: 1px solid color-mix(in oklch, var(--color-hud-muted) 20%, transparent);
    border-radius: 12px;
    background: color-mix(in oklch, var(--color-hud) 25%, transparent);
  }
  .decision-content {
    min-height: 0;
    height: 100%;
    display: grid;
    align-items: center;
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
  .hand-zone {
    min-height: 0;
    padding-top: 0;
  }
  .center {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 0;
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
  @media (min-width: 410px) {
    .board {
      --capture-height: 48px;
      --my-capture-height: 56px;
      --decision-height: 64px;
    }
    .board.selecting {
      --decision-height: 144px;
    }
    .board.two-hands {
      --hand-height: 184px;
    }
  }
  @media (min-height: 900px) {
    .board {
      --capture-height: 110px;
      --my-capture-height: 110px;
    }
    .captured-zone > :global(.captured) {
      position: static;
      visibility: visible;
    }
  }
  @media (min-width: 410px) and (min-height: 900px) {
    .board.two-hands {
      --hand-height: clamp(
        184px,
        calc(
          100dvh - max(8px, var(--board-safe-top, env(safe-area-inset-top))) -
            max(8px, var(--board-safe-bottom, env(safe-area-inset-bottom))) - 20px -
            var(--hud-height) - var(--capture-height) - var(--my-capture-height) -
            var(--decision-height) - 208px
        ),
        220px
      );
    }
  }
  .board.first-pick {
    --decision-height: 224px;
    --hand-height: 0px;
  }
  .first-pick .hand-zone {
    padding: 0;
  }
  .board:not(.two-hands):not(.selecting):not(.hud-expanded) {
    --capture-height: 110px;
    --my-capture-height: 110px;
  }
  .board:not(.two-hands):not(.selecting):not(.hud-expanded) .captured-zone > :global(.captured) {
    position: static;
    visibility: visible;
  }
  @media (min-height: 820px) {
    .board:not(.two-hands) {
      --capture-height: 110px;
      --my-capture-height: 110px;
    }
    .board:not(.two-hands) .captured-zone > :global(.captured) {
      position: static;
      visibility: visible;
    }
  }

  /* RP-06: 동일한 뷰와 행동을 세 영역에 배치한다. DOM 순서와 카드 슬롯 판정은 그대로다. */
  @media (min-width: 1024px), (min-width: 700px) and (max-height: 600px) and (pointer: fine) {
    .board.board.board,
    .board.board.board.hud-expanded {
      --table-card: var(--board-card-wide);
      --fan-hand: 110px;
      --fan-seat: 52px;
      --fan-capture: 110px;
      --fan-top: 48px;
      --fan-gap: 8px;
      grid-template-columns: minmax(180px, 1fr) minmax(320px, 2fr) minmax(180px, 1fr);
      grid-template-rows: var(--fan-top) minmax(0, 1fr) var(--fan-hand);
      column-gap: clamp(12px, 2vw, 32px);
      max-width: 1440px;
      margin-inline: auto;
    }
    .board.board.board .hud {
      grid-column: 1 / -1;
      grid-row: 1;
    }
    .board.board.board .center {
      grid-column: 2;
      grid-row: 2;
    }
    .board.board.board .opponent-hud,
    .board.board.board .mine-hud {
      grid-row: 2;
      align-self: start;
      height: var(--fan-seat);
    }
    .board.board.board .opponent-hud,
    .board.board.board .captured-zone:not(.mine) {
      grid-column: 1;
    }
    .board.board.board .mine-hud,
    .board.board.board .captured-zone.mine {
      grid-column: 3;
    }
    .board.board.board .captured-zone {
      grid-row: 2;
      align-self: start;
      height: var(--fan-capture);
      margin-top: calc(var(--fan-seat) + 8px);
    }
    .board.board.board .decision-area,
    .board.board.board .decision-area.idle-slot {
      position: relative;
      inset: auto;
      transform: none;
      grid-column: 3;
      grid-row: 2;
      align-self: end;
      width: 100%;
      max-height: min(240px, calc(100% - var(--fan-seat) - var(--fan-capture) - 16px));
      min-height: 56px;
      margin: 0;
      pointer-events: auto;
    }
    .board.board.board.go-stop .decision-area {
      top: auto;
      bottom: auto;
      left: auto;
      right: auto;
      transform: none;
    }
    .board.board.board .hand-zone {
      grid-column: 2;
      grid-row: 3;
    }
    .board.board.board.two-hands,
    .board.board.board.first-pick {
      --fan-hand: 206px;
    }
    .board.board.board.first-pick {
      --fan-hand: 0px;
    }
  }

  /* 200% 확대의 720×450 상당: 카드 크기를 모바일과 같게 두고 영역 높이를 확보한다. */
  @media (min-width: 700px) and (max-height: 600px) and (pointer: fine) {
    .board.board.board,
    .board.board.board.hud-expanded {
      --table-card: var(--board-card-compact);
      --fan-top: 48px;
      --fan-seat: 40px;
      --fan-capture: 68px;
      --fan-hand: 100px;
      --fan-gap: 8px;
      grid-template-columns: 190px minmax(300px, 1fr) 190px;
      column-gap: 8px;
      padding-block: 4px;
    }
    .board.board.board.two-hands {
      --fan-hand: 160px;
    }
    .board.board.board .captured-zone {
      margin-top: calc(var(--fan-seat) + 8px);
    }
    .board.board.board .captured-zone :global(.stack) {
      width: calc(var(--capture-card) + max(0, var(--pile-count) - 1) * 1px);
    }
    .board.board.board .captured-zone :global(.stack > .card + .card) {
      margin-left: calc(1px - var(--capture-card));
    }
    .board.board.board .captured-zone :global(.group),
    .board.board.board .captured-zone :global(.name) {
      width: 100%;
      min-width: 0;
    }
    .board.board.board :global(.seat-bar .balance) {
      font-size: 12px;
      line-height: 18px;
      letter-spacing: -0.75px;
    }
    .board.board.board .decision-area,
    .board.board.board .decision-area.idle-slot {
      max-height: calc(100% - var(--fan-seat) - var(--fan-capture) - 8px);
    }
  }
</style>
