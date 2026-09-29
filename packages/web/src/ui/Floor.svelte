<script lang="ts">
  // 바닥: 같은 월 인접 묶음 + 중앙 더미 + 뒤집기 자리 (spec 6.2 게임판 중앙)
  // data-anchor: 애니메이션 기준점(더미 = 뒤집기·분배의 출발점, src/anim/choreo.ts)
  import type { CardId, FloorGroupView } from '../lib/view-types.ts';
  import Card from './Card.svelte';
  import { cardLabel } from './cards.ts';
  import { promptFocus } from './prompt-focus.ts';
  import { floorLayout } from './floor-layout.ts';

  interface Props {
    compact?: boolean;
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
    options = [],
    onchoose,
    groups,
    deckCount,
    highlight = [],
    staging = [],
    handLinks = {},
  }: Props = $props();
  let table: HTMLElement;
  let bounds = $state({ width: 0, height: 0, cardWidth: 48 });
  $effect(() => {
    const update = () => {
      const rect = table.getBoundingClientRect();
      bounds = {
        width: rect.width,
        height: rect.height,
        cardWidth: parseFloat(getComputedStyle(table).getPropertyValue('--card-w-m')) || 48,
      };
    };
    const observer = new ResizeObserver(update);
    observer.observe(table);
    update();
    return () => observer.disconnect();
  });
  $effect(() => {
    if (!options.length || !table) return;
    const focus = promptFocus(table);
    return () => focus.destroy();
  });
  const layout = $derived(
    floorLayout(groups, options, bounds.width, bounds.height, bounds.cardWidth),
  );
  const cells = $derived(
    compact
      ? layout.cells
      : groups.map((group) => ({ ...group, x: 0, y: 0, angle: 0, dx: 0, dy: 0 })),
  );
</script>

<div
  role={options.length ? 'dialog' : 'group'}
  aria-modal={options.length ? true : undefined}
  aria-label={options.length ? '먹을 바닥패 선택' : undefined}
  tabindex="-1"
  class="table"
  bind:this={table}
  data-floor-folded={layout.folded}
  data-floor-fits={layout.fits}
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
    <div class="staging">
      {#each staging as id (id)}
        <Card {id} size="m" flippable marks={false} />
      {/each}
    </div>
  </div>
  <ul class="floor" aria-label="바닥">
    {#each cells as group (group.cards[0])}
      <li
        class={['group', `kind-${group.kind}`]}
        style:left={`${group.x}px`}
        style:top={`${group.y}px`}
        style:rotate={`${group.angle ?? 0}deg`}
        style:translate={`${group.dx ?? 0}px ${group.dy ?? 0}px`}
        data-month={group.month}
        data-hand-link={handLinks[group.month]}
        aria-label={`${group.month}월 ${group.cards.length}장${group.kind === 'loose' ? '' : ' 뻑'}${handLinks[group.month] === 'bomb' ? ', 손패 폭탄 후보의 짝' : handLinks[group.month] === 'chongtong' ? ', 손패 총통 후보의 짝' : ''}`}
      >
        {#each group.cards as id (id)}
          {#if options.includes(id)}
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

  .staging > :global(.card) {
    box-shadow: 0 0.4rem 1rem oklch(0% 0 0 / 0.5);
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
