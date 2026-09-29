<script lang="ts">
  // 게임판 (spec 6.2, FR-40): 상단 양쪽 점수판·상대 획득패, 중앙 바닥·더미, 선택 영역, 내 획득패·현황·손패.
  // 보는 좌석(view.viewer)의 입력을 엔진 액션으로 만들어 onaction으로 올린다. 규칙 검증은 엔진(legalActions)이 한다.
  // 재생 중(busy)에는 입력을 받지 않고, 판을 탭하면 남은 애니메이션을 건너뛴다(spec 6.3, onskip).
  // data-anchor는 애니메이션 기준점(src/anim/choreo.ts), data-* 상태 속성은 E2E 자동 플레이·계측용이다.
  import { getCard, type Action, type CardId, type Month } from '@p2p-gostop/engine';
  import type { BoardExtras } from '../game/adapter.ts';
  import { boardNotices } from '../game/display.ts';
  import { formatMoney } from '../lib/format.ts';
  import type { BoardView, MoneyUnit, SeatView } from '../lib/view-types.ts';
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
  import { seatStats, type SeatExtras } from './seat-stats.ts';
  import TargetModal from './TargetModal.svelte';

  type BoardSeat = SeatView & SeatExtras;

  interface Props {
    /** 좌석에 표시용 값(국진 위치·폭탄 횟수)이 있으면 쓰고, 없으면(프로토콜 뷰·픽스처) 진행도에서 읽는다 */
    view: BoardView & {
      readonly seats: readonly [BoardSeat, BoardSeat];
      readonly staging?: readonly CardId[];
      readonly highlight?: readonly CardId[];
    };
    extras?: BoardExtras | null;
    /** 갤러리/후속 기본 보조의 시각 슬롯. 확보 짝 판정은 여기서 하지 않는다. */
    handVisualGroups?: readonly HandVisualGroup[];
    unit?: MoneyUnit;
    banner?: (Banner & { readonly id?: number }) | null;
    toast?: { readonly id: number; readonly text: string } | null;
    /** 이벤트 재생 중 (입력 잠금) */
    busy?: boolean;
    /** 상대(CPU)가 생각 중 */
    thinking?: boolean;
    /** 마지막 탭→턴 종료 시간 ms (spec AC-06 계측, E2E가 읽는다) */
    turnMs?: number | null;
    onaction?: ((action: Action, at: number) => void) | undefined;
    onskip?: (() => void) | undefined;
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
    extras = null,
    handVisualGroups = [],
    unit = '냥',
    banner = null,
    toast = null,
    busy = false,
    thinking = false,
    turnMs = null,
    onaction,
    onskip,
    onnotice,
    root = $bindable(null),
  }: Props = $props();

  let landscape = $state(false);
  let infoDialog: HTMLDialogElement;
  $effect(() => {
    const media = window.matchMedia('(orientation: landscape)');
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
  const expandedHud = $derived(
    [me.balance, opponent.balance].some((balance) => formatMoney(balance, unit).length > 10),
  );
  const actor = $derived(banner ? bannerActor(banner, seat) : null);

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
  const pickFirst = $derived(busy ? null : (extras?.pickFirst ?? null));
  const playable = $derived(busy || landscape ? [] : view.playable);
  const floorMonths = $derived(new Set(view.floor.map((g) => g.month)));
  const matchable = $derived(
    playable.filter((id) => {
      const month = getCard(id).month;
      return month === null || floorMonths.has(month);
    }),
  );

  /** 누르고 있는 손패 카드 (먹게 될 바닥 카드 미리보기, spec 6.3) */
  let preview = $state<CardId | null>(null);
  /** 폭탄을 할 수 있는 월의 카드를 탭했을 때 확인 */
  let bombCard = $state<CardId | null>(null);
  const handGroups = $derived<readonly HandVisualGroup[]>([
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
  const selectedHandGroup = $derived(
    handGroups.find(
      (group) => group.kind === 'bomb' && group.cards.includes(bombCard ?? preview ?? -1),
    )?.id ?? null,
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
  const selecting = $derived(
    pickFirst !== null || bombCard !== null || (pending !== null && pending.kind !== 'play'),
  );
  const awaiting = $derived(pending !== null || pickFirst !== null);

  function act(action: Action, at = performance.now()) {
    bombCard = null;
    preview = null;
    if (!landscape) onaction?.(action, at);
  }

  function play(card: CardId, at: number) {
    const month = getCard(card).month;
    if (month !== null && extras?.bombMonths.includes(month)) {
      bombCard = card;
      return;
    }
    act({ type: 'play', seat, card }, at);
  }

  function bombMonth(): Month | null {
    return bombCard === null ? null : getCard(bombCard).month;
  }

  function handCardsOfMonth(month: Month | null): CardId[] {
    return (me.hand ?? []).filter((id) => getCard(id).month === month);
  }

  function skipIfBusy() {
    if (busy) onskip?.();
  }
</script>

<section
  class={[
    'board',
    {
      'hud-expanded': expandedHud,
      selecting,
      'two-hands': (me.hand?.length ?? 0) > 5,
      'first-pick': pickFirst !== null,
    },
  ]}
  aria-label="게임판"
  aria-busy={busy}
  data-testid="board"
  data-awaiting={awaiting || (!busy && playable.length > 0) ? 'me' : 'other'}
  data-busy={busy}
  data-turn-ms={turnMs}
  bind:this={root}
  onpointerdowncapture={skipIfBusy}
>
  <div class="hud" inert={landscape} data-testid="hud">
    <div class="scoreboard" class:expanded={expandedHud} aria-label="양쪽 점수판">
      <SeatBar
        who="상대"
        name={opponent.name}
        score={opponent.score}
        goCount={opponent.goCount}
        balance={opponent.balance}
        {unit}
        expanded={expandedHud}
      />
      <SeatBar
        who="나"
        name={me.name}
        score={me.score}
        goCount={me.goCount}
        balance={me.balance}
        {unit}
        expanded={expandedHud}
        multiplier={view.multiplier}
        stopPreview={view.pending?.kind === 'goStop' && view.pending.seat === seat}
      />
    </div>
    <div class="menu-reserved" data-testid="menu-reserved" aria-hidden="true"></div>
  </div>
  <div class="captured-zone">
    <CapturedPile stats={opponentStats} label="상대 획득패" highlight={view.highlight ?? []} />
    <SeatProgress
      who="상대"
      stats={opponentStats}
      shakes={opponent.shakes}
      ppeokCount={opponent.ppeokCount}
      bombs={opponent.bombs ?? null}
      handCount={opponent.handCount}
      anchor="opp-hand"
    />
  </div>

  <div class="center">
    <Floor
      compact
      groups={view.floor}
      deckCount={view.deckCount}
      highlight={floorHighlight}
      staging={view.staging ?? []}
    />
  </div>

  <div class="decision-area" class:idle-slot={!selecting && !extras?.canFlipOnly} inert={landscape}>
    <div class="decision-content">
      <EventRail
        {banner}
        {toast}
        {actor}
        blocked={selecting || !!extras?.canFlipOnly}
        idle={thinking
          ? '상대 차례 · 생각 중'
          : busy
            ? '진행 중'
            : playable.length > 0
              ? '내 차례'
              : '상대 차례'}
      />
      {#if !busy && extras?.canFlipOnly}
        <button
          type="button"
          class="flip-only"
          data-choice="flipOnly"
          onclick={(e) => act({ type: 'flipOnly', seat }, e.timeStamp)}>폭탄패로 뒤집기</button
        >
      {/if}

      {#if pickFirst}
        <PickFirstPrompt
          poolSize={pickFirst.poolSize}
          taken={pickFirst.taken}
          onpick={(index) => act({ type: 'pickFirst', seat, index })}
        />
      {:else if bombCard !== null && pending?.kind === 'play'}
        {@const month = bombMonth()}
        <ChoicePrompt
          title="폭탄?"
          message={`${month}월 ${handCardsOfMonth(month).length}장으로 바닥 패를 한꺼번에 먹습니다`}
          cards={handCardsOfMonth(month)}
          choices={[
            { id: 'bomb', label: '폭탄', primary: true },
            { id: 'single', label: '한 장만' },
            { id: 'cancel', label: '취소' },
          ]}
          onchoose={(id) => {
            const card = bombCard;
            if (id === 'cancel' || card === null || month === null) bombCard = null;
            else if (id === 'bomb') act({ type: 'bomb', seat, month });
            else act({ type: 'play', seat, card });
          }}
        />
      {:else if pending?.kind === 'target'}
        <TargetModal
          card={pending.card}
          source={pending.source}
          options={pending.options}
          onchoose={(card) => act({ type: 'chooseTarget', seat, card })}
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
          title="흔들까요?"
          message={`${pending.month}월 ${handCardsOfMonth(pending.month).length}장을 보여 주고 이기면 ×2`}
          cards={handCardsOfMonth(pending.month)}
          choices={[
            { id: 'shake', label: '흔들기', primary: true },
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
    <button
      class="info-button"
      type="button"
      onclick={() => {
        if (busy) onskip?.();
        infoDialog.showModal();
      }}>판 정보</button
    >
  </div>
  <div class="captured-zone mine">
    <CapturedPile stats={myStats} label="내 획득패" highlight={view.highlight ?? []} />
    <SeatProgress
      who="내"
      stats={myStats}
      shakes={me.shakes}
      ppeokCount={me.ppeokCount}
      bombs={me.bombs ?? null}
    />
  </div>
  <div class="hand-zone" inert={landscape}>
    <Hand
      compact
      cards={me.hand ?? []}
      {playable}
      {matchable}
      visualGroups={handGroups}
      selectedGroup={selectedHandGroup}
      onplay={play}
      onpreview={(id) => (preview = id)}
    />
  </div>
  <dialog class="board-info" bind:this={infoDialog} aria-label="판 정보">
    <header>
      <h2>판 정보</h2>
      <button type="button" onclick={() => infoDialog.close()}>닫기</button>
    </header>
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
  .idle-slot .info-button {
    padding: 0 12px;
    white-space: nowrap;
  }
  .decision-content {
    min-height: 0;
    height: 100%;
    display: grid;
    align-items: center;
  }
  .info-button,
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
</style>
