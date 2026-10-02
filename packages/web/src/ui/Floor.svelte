<script lang="ts">
  // 바닥: 같은 월 인접 묶음 + 중앙 더미 + 뒤집기 자리 (spec 6.2 게임판 중앙)
  // data-anchor: 애니메이션 기준점(더미 = 뒤집기·분배의 출발점, src/anim/choreo.ts)
  import type { CardId, FloorGroupView } from '../lib/view-types.ts';
  import Card from './Card.svelte';
  import { cardLabel } from './cards.ts';
  import { promptFocus } from './prompt-focus.ts';
  import {
    assignFloor,
    projectFloor,
    layoutMonthFloor,
    projectMonthFloorReservations,
  } from './floor-layout.ts';
  import type {
    FloorSlot,
    MonthFloorBounds,
    MonthFloorCell,
    MonthFloorLayout,
  } from './floor-layout.ts';
  import { untrack } from 'svelte';

  interface Props {
    compact?: boolean;
    /** #202 실제 Board 검토용. 일반 적용은 별도 리뷰 뒤 전환한다. */
    monthStacks?: boolean;
    layoutSuspended?: boolean;
    round?: number;
    playbackBusy?: boolean;
    snapshotSeq?: number;
    options?: readonly CardId[];
    onchoose?: (id: CardId) => void;
    groups: readonly FloorGroupView[];
    deckCount: number;
    /** 강조할 바닥 카드 (대상 선택, 먹게 될 카드 미리보기, 매칭 강조) */
    highlight?: readonly CardId[];
    /** 바닥에 놓이기 전 잠시 머무는 카드 (뒤집은 카드, 낸 보너스) */
    staging?: readonly CardId[];
    /** 공개 손패로 판정한 폭탄·총통 짝 월. */
    handLinks?: Readonly<Record<number, 'bomb' | 'chongtong'>>;
  }

  let {
    compact = false,
    monthStacks = false,
    layoutSuspended = false,
    round = 0,
    playbackBusy = false,
    snapshotSeq = 0,
    options = [],
    onchoose,
    groups,
    deckCount,
    highlight = [],
    staging = [],
    handLinks = {},
  }: Props = $props();
  let table: HTMLElement;
  let bounds = $state<MonthFloorBounds>({ width: 0, height: 0, cardWidth: 48, obstacles: [] });
  let measurementActive = $state(false);
  let monthLayout = $state.raw<MonthFloorLayout>();
  let monthLayoutCosts = $state.raw<
    {
      ms: number;
      width: number;
      height: number;
      cardCount: number;
      searches: number;
      primaryLimit: number;
      strategy: 'scatter' | 'boundary';
      witnessSlots: number;
      witnessCandidates: number;
      witnessChecks: number;
      witnessEdges: number;
      witnessValid: boolean;
      witnessSearches: number;
      relocated: number;
      fits: boolean;
    }[]
  >([]);
  let lastGoodMonthLayout: MonthFloorLayout | undefined;
  let monthReserved = $state.raw<MonthFloorCell[]>([]);
  let monthReservedBounds: MonthFloorBounds | undefined;
  let monthRound: number | undefined;
  let monthDeck = 0;
  let monthSeq: number | undefined;
  let placed = $state.raw<FloorSlot[]>([]);
  let reserved: FloorSlot[] = [];
  let lastRound: number | undefined;
  let lastDeck = 0;
  let lastCards = '';
  let lastOptions = '';
  let lastSnapshotSeq: number | undefined;
  // 중간 commit은 seq를 유지한다. 묶음 최종 스냅 또는 큐 해제에서 예약을 푼다.
  $effect.pre(() => {
    const input = groups,
      candidates = options,
      playing = playbackBusy,
      nextRound = round,
      deck = deckCount,
      seq = snapshotSeq;
    untrack(() => {
      if (monthStacks) return;
      if (nextRound !== lastRound || deck > lastDeck) {
        placed = [];
        reserved = [];
        lastCards = '';
      }
      const ids = new Set(input.flatMap((group) => group.cards));
      const removed = (cell: FloorSlot) => cell.cards.every((id) => !ids.has(id));
      reserved = reserved.filter(removed);
      if (playing && seq === lastSnapshotSeq) reserved.push(...placed.filter(removed));
      else reserved = [];
      const cardsKey = [...ids].sort((a, b) => a - b).join(',');
      const optionsKey = [...candidates].sort((a, b) => a - b).join(',');
      if (cardsKey !== lastCards || (ids.size > 14 && optionsKey !== lastOptions))
        placed = assignFloor(
          input,
          candidates,
          placed,
          reserved.map((cell) => cell.slot),
        ).cells;
      else
        placed = placed.map((cell) => {
          const group = input.find((group) => group.month === cell.month)!;
          return { ...cell, kind: group.kind, owner: group.owner };
        });
      lastCards = cardsKey;
      lastOptions = optionsKey;
      lastRound = nextRound;
      lastDeck = deck;
      lastSnapshotSeq = seq;
    });
  });
  $effect.pre(() => {
    const input = groups,
      size = bounds,
      playing = playbackBusy,
      nextRound = round,
      seq = snapshotSeq,
      deck = deckCount;
    if (!monthStacks) return;
    untrack(() => {
      const started = import.meta.env.DEV ? performance.now() : 0;
      if (nextRound !== monthRound || deck > monthDeck) {
        monthLayout = undefined;
        monthLayoutCosts = [];
        lastGoodMonthLayout = undefined;
        monthReserved = [];
      }
      if (!playing || seq !== monthSeq) monthReserved = [];
      const ids = new Set(input.flatMap((g) => g.cards));
      if (playing && seq === monthSeq) {
        for (const cell of monthLayout?.cells ?? []) {
          if (!cell.cards.some((id) => !ids.has(id))) continue;
          if (
            !monthReserved.some(
              (r) =>
                r.origin.x === cell.origin.x &&
                r.origin.y === cell.origin.y &&
                r.cards.join(',') === cell.cards.join(','),
            )
          )
            monthReserved = [...monthReserved, cell];
        }
      }
      if (monthReserved.length && monthReservedBounds)
        monthReserved = projectMonthFloorReservations(monthReserved, monthReservedBounds, size);
      monthReservedBounds = size;
      monthLayout = layoutMonthFloor(input, size, lastGoodMonthLayout, monthReserved);
      if (monthLayout.fits) lastGoodMonthLayout = monthLayout;
      monthRound = nextRound;
      monthDeck = deck;
      monthSeq = seq;
      if (import.meta.env.DEV) {
        const r = monthLayout;
        const ms = performance.now() - started;
        monthLayoutCosts = [
          ...monthLayoutCosts.slice(-15),
          {
            ms,
            width: size.width,
            height: size.height,
            cardCount: ids.size,
            searches: r.searches,
            primaryLimit: r.primaryLimit,
            strategy: r.strategy,
            witnessSlots: r.witnessSlots,
            witnessCandidates: r.witnessCandidates,
            witnessChecks: r.witnessChecks,
            witnessEdges: r.witnessEdges,
            witnessValid: r.witnessValid,
            witnessSearches: r.witnessSearches,
            relocated: r.relocated,
            fits: r.fits,
          },
        ];
      }
    });
  });
  $effect(() => {
    void staging;
    void groups;
    void layoutSuspended;
    const paintRect = (el: Element, origin: DOMRect) => {
      const r = el.getBoundingClientRect(),
        style = getComputedStyle(el);
      const outline =
        style.outlineStyle === 'none' || style.outlineStyle === 'hidden'
          ? 0
          : parseFloat(style.outlineWidth) || 0;
      let left = outline,
        right = outline,
        top = outline,
        bottom = outline;
      // computed box-shadow의 px 오프셋·blur·spread를 보수적으로 포함한다. 색의 숫자는 px가 아니다.
      const pixels = [...style.boxShadow.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
      for (let i = 0; i + 3 < pixels.length; i += 4) {
        const x = pixels[i]!,
          y = pixels[i + 1]!,
          halo = Math.max(0, pixels[i + 2]! + pixels[i + 3]!);
        left = Math.max(left, halo - x);
        right = Math.max(right, halo + x);
        top = Math.max(top, halo - y);
        bottom = Math.max(bottom, halo + y);
      }
      return {
        x: r.x - origin.x - left,
        y: r.y - origin.y - top,
        width: r.width + left + right,
        height: r.height + top + bottom,
      };
    };
    const update = () => {
      if (monthStacks && layoutSuspended) {
        measurementActive = false;
        return;
      }
      const rect = table.getBoundingClientRect();
      if (monthStacks && (rect.width <= 0 || rect.height <= 0)) {
        measurementActive = false;
        return;
      }
      measurementActive = true;
      const measured: MonthFloorBounds = {
        width: rect.width,
        height: rect.height,
        cardWidth: parseFloat(getComputedStyle(table).getPropertyValue('--card-w-m')) || 48,
        paintPadding:
          parseFloat(getComputedStyle(table.querySelector('.card') ?? table).outlineWidth) || 1,
        obstacles: monthStacks
          ? [
              ...table.querySelectorAll(
                '.deck .card, .deck-stack, .deck-count, .compact-ppeok, .staging-reserve',
              ),
            ]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
              })
              .map((el) => paintRect(el, rect))
          : [],
      };
      if (JSON.stringify(measured) !== JSON.stringify(untrack(() => bounds))) bounds = measured;
    };
    const observer = new ResizeObserver(update);
    observer.observe(table);
    const deck = table.querySelector('.deck-area');
    if (deck) observer.observe(deck);
    update();
    return () => observer.disconnect();
  });
  $effect(() => {
    if (monthStacks || !options.length || !table) return;
    const focus = promptFocus(table);
    return () => focus.destroy();
  });
  const layout = $derived(
    projectFloor(placed, options, bounds.width, bounds.height, bounds.cardWidth),
  );
  const cells = $derived(
    monthStacks
      ? (monthLayout?.cells ?? [])
      : compact
        ? layout.cells
        : groups.map((group) => ({
            ...group,
            slot: undefined,
            x: 0,
            y: 0,
            angle: 0,
            dx: 0,
            dy: 0,
          })),
  );
</script>

<div
  role={!monthStacks && options.length ? 'dialog' : 'group'}
  aria-modal={!monthStacks && options.length ? true : undefined}
  aria-label={!monthStacks && options.length ? '먹을 바닥패 선택' : undefined}
  tabindex="-1"
  class="table"
  style:--table-card={monthStacks ? '42px' : undefined}
  style:--table-card-height={monthStacks ? 'calc(42px / 0.614)' : undefined}
  bind:this={table}
  data-floor-folded={layout.folded}
  data-floor-fits={monthStacks
    ? measurementActive && !layoutSuspended && (monthLayout?.fits ?? false)
    : layout.fits}
  data-floor-suspended={monthStacks ? layoutSuspended : undefined}
  data-floor-strategy={monthStacks ? monthLayout?.strategy : undefined}
  data-floor-searches={monthStacks ? monthLayout?.searches : undefined}
  data-floor-exhausted={monthStacks ? monthLayout?.exhausted : undefined}
  data-floor-layout-costs={monthStacks && import.meta.env.DEV
    ? JSON.stringify(monthLayoutCosts)
    : undefined}
  data-floor-model-bounds={monthStacks ? JSON.stringify(bounds) : undefined}
  data-floor-relocated={monthStacks ? monthLayout?.relocated : undefined}
  data-floor-reserved={monthStacks ? monthReserved.length : undefined}
  data-floor-round={round}
  data-floor-snapshot-seq={snapshotSeq}
  class:monthStacks
  class:compact
  class:choosing={options.length > 0}
>
  <div class="deck-area">
    <div class="deck" role="img" aria-label={`더미 ${deckCount}장`}>
      <span class="deck-stack" data-anchor="deck">
        <Card id={null} size="m" />
      </span>
      <span class="deck-count" aria-hidden="true">{deckCount}</span>
    </div>
    {#if compact}
      {#each groups.filter((g) => g.kind !== 'loose') as group (group.month)}<span
          class="compact-ppeok">{group.month}월 뻑</span
        >{/each}
    {/if}
    {#if monthStacks}<span class="staging-reserve" aria-hidden="true"></span>{/if}
    <div class="staging" data-staging-capacity={monthStacks ? 4 : undefined}>
      {#each staging as id, index (id)}
        {#if monthStacks}
          <span class="stage-card" style:z-index={index + 1}>
            <Card {id} size="m" flippable marks={false} />
          </span>
        {:else}
          <Card {id} size="m" flippable marks={false} />
        {/if}
      {/each}
    </div>
  </div>
  {#if monthStacks && monthLayout?.status === 'failed' && monthLayout.failure.reason !== 'unmeasured'}
    <p class="layout-diagnostic" role="status">
      개발 배치 검토 실패 · {monthLayout.failure.reason === 'budget'
        ? '탐색 상한'
        : '후보 미발견'}<br />미배치 카드 ID: {monthLayout.failure.cardIds.join(', ')}
    </p>
  {/if}
  <ul class="floor" aria-label="바닥">
    {#each cells as group (monthStacks ? group.month : compact ? group.slot : group.month)}
      {@const stack = monthStacks
        ? monthLayout?.cells.find((cell) => cell.month === group.month)
        : undefined}
      <li
        class={['group', `kind-${group.kind}`]}
        style:left={`${group.x}px`}
        style:width={stack ? `${stack.localWidth}px` : undefined}
        style:height={stack ? `${stack.localHeight}px` : undefined}
        style:top={`${group.y}px`}
        style:rotate={`${group.angle}deg`}
        style:translate={`${group.dx}px ${group.dy}px`}
        data-floor-slot={group.slot}
        data-floor-model-footprint={stack ? JSON.stringify(stack.footprint) : undefined}
        data-month={group.month}
        data-hand-link={handLinks[group.month]}
        aria-label={`${group.month}월 ${group.cards.length}장${group.kind === 'loose' ? '' : ' 뻑'}${handLinks[group.month] === 'bomb' ? ', 손패 폭탄 후보의 짝' : handLinks[group.month] === 'chongtong' ? ', 손패 총통 후보의 짝' : ''}`}
      >
        {#each group.cards as id (id)}
          {#if stack}
            {@const pose = stack.poses.find((p) => p.id === id)!}
            <span
              class="stack-card"
              style:left={`${pose.localX}px`}
              style:top={`${pose.localY}px`}
              style:z-index={pose.z}
              data-floor-pose-index={pose.index}
              data-floor-model-pose={JSON.stringify(pose)}
            >
              <Card
                {id}
                size="m"
                flippable
                highlight={highlight.includes(id) || handLinks[group.month] !== undefined}
                dimmed={options.length > 0}
                marks={false}
              />
            </span>
          {:else if options.includes(id)}
            <button
              type="button"
              class="floor-choice"
              data-choice={`target-${id}`}
              aria-label={cardLabel(id)}
              onclick={() => onchoose?.(id)}
            >
              <Card {id} size="m" flippable highlight marks={false} />
            </button>
          {:else}
            <Card
              {id}
              size="m"
              flippable
              highlight={highlight.includes(id)}
              dimmed={options.length > 0}
              marks={false}
            />
          {/if}
        {/each}
        {#if group.kind !== 'loose'}
          <span class="ppeok-tag" aria-hidden="true">뻑</span>
        {/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  .layout-diagnostic {
    position: absolute;
    inset: 8px;
    margin: 0;
    z-index: 3;
    background: var(--color-surface-raised);
    padding: 8px;
    font-size: 14px;
  }
  .stack-card {
    position: absolute;
    width: var(--card-w-m);
    height: var(--card-h-m);
  }
  .monthStacks .group {
    outline: none;
    transform-origin: 0 0;
  }
  .floor-choice {
    padding: 0;
    border: 0;
    background: transparent;
    min-width: 48px;
    min-height: 48px;
    position: relative;
    z-index: 4;
  }
  .floor-choice + .floor-choice {
    margin-left: 4px;
  }
  .table {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-3);
    align-items: center;
  }

  .deck-area {
    position: relative;
  }

  .deck {
    position: relative;
    display: grid;
    justify-items: center;
    gap: var(--card-badge-gap);
  }

  /* 두께감: 뒤에 두 장을 겹친 그림자 대신 테두리 오프셋 (애니메이션되는 그림자 금지) */
  .deck-stack {
    display: block;
    border-radius: 4px;
    box-shadow:
      2px 2px 0 oklch(30% 0.1 25),
      4px 4px 0 oklch(24% 0.08 25);
  }

  .deck-count {
    position: relative;
    min-width: 1.6rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-size: var(--card-tag-font);
    font-weight: 700;
    line-height: var(--card-tag-height);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* 뒤집기 자리: 더미 오른쪽 위에 겹쳐 떠 있다(격자 배치를 흔들지 않는다) */
  .staging {
    position: absolute;
    left: calc(100% + var(--space-2));
    top: -8px;
    display: flex;
    gap: var(--space-1);
    pointer-events: none;
    z-index: 2;
  }

  .staging :global(.card),
  .staging-reserve {
    box-shadow: 0 0.4rem 1rem oklch(0% 0 0 / 0.5);
  }

  .monthStacks .staging,
  .staging-reserve {
    position: absolute;
    left: 0;
    top: 0;
    width: var(--card-w-m);
    height: var(--card-h-m);
    pointer-events: none;
  }
  .staging-reserve {
    visibility: hidden;
    outline: var(--card-edge-width) solid transparent;
  }
  .monthStacks .staging :global(.card),
  .staging-reserve {
    box-shadow:
      2px 2px 0 oklch(30% 0.1 25),
      4px 4px 0 oklch(24% 0.08 25);
  }
  .monthStacks .stage-card {
    position: absolute;
    inset: 0;
  }
  :global(:root .board) .table.monthStacks .deck-count {
    top: auto;
    bottom: 1px;
    left: calc(100% + 6px);
    right: auto;
    z-index: 3;
  }

  .floor {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: calc(var(--card-tag-height) + 2 * var(--card-badge-gap)) var(--space-1);
    padding-top: calc(var(--card-tag-height) + var(--card-badge-gap));
    justify-items: start;
    align-content: center;
    min-height: calc(var(--card-h-m) * 3 + var(--space-2) * 2);
  }

  .group {
    position: relative;
    display: flex;
  }

  /* 같은 월 무더기: 12px씩 비켜 쌓기 */
  .group > :global(.card + .card) {
    margin-left: calc(12px - var(--card-w-m));
  }

  .ppeok-tag {
    position: absolute;
    bottom: calc(100% + var(--card-badge-gap));
    right: 0;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: var(--color-card-tag);
    color: var(--color-event-ppeok-text);
    font-size: var(--card-tag-font);
    font-weight: 800;
    line-height: var(--card-tag-height);
  }
  .table.compact {
    --card-w-m: 40px;
    --card-h-m: calc(40px / 0.614);
    gap: 8px;
  }
  .compact .floor {
    gap: 4px;
    padding-top: 0;
    min-height: 0;
  }
  .compact .group > :global(.card + .card) {
    margin-left: calc(8px - var(--card-w-m));
  }
  .compact .ppeok-tag {
    display: none;
  }
  .compact-ppeok {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    line-height: 16px;
    color: var(--color-text);
  }
  .compact .kind-ppeok,
  .compact .kind-natural {
    outline: 1px dashed var(--color-accent);
    outline-offset: 1px;
  }
</style>
