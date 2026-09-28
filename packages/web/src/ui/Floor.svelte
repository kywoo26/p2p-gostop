<script lang="ts">
  // 바닥: 월별 무더기 격자 + 더미 (spec 6.2 게임판 중앙)
  import type { CardId, FloorGroupView } from '../lib/view-types.ts';
  import Card from './Card.svelte';

  interface Props {
    groups: readonly FloorGroupView[];
    deckCount: number;
    /** 강조할 바닥 카드 (대상 선택, 먹게 될 카드) */
    highlight?: readonly CardId[];
  }

  let { groups, deckCount, highlight = [] }: Props = $props();
</script>

<div class="table">
  <div class="deck" role="img" aria-label={`더미 ${deckCount}장`}>
    <span class="deck-stack">
      <Card id={null} size="m" />
    </span>
    <span class="deck-count" aria-hidden="true">{deckCount}</span>
  </div>
  <ul class="floor" aria-label="바닥">
    {#each groups as group (group.month)}
      <li
        class={['group', `kind-${group.kind}`]}
        aria-label={`${group.month}월 ${group.cards.length}장${group.kind === 'loose' ? '' : ' 뻑'}`}
      >
        {#each group.cards as id (id)}
          <Card {id} size="m" highlight={highlight.includes(id)} />
        {/each}
        {#if group.kind !== 'loose'}
          <span class="ppeok-tag" aria-hidden="true">뻑</span>
        {/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  .table {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-3);
    align-items: center;
  }

  .deck {
    position: relative;
    display: grid;
    justify-items: center;
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
    position: absolute;
    right: -6px;
    bottom: -6px;
    min-width: 1.6rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-size: var(--font-size-s);
    font-weight: 700;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .floor {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2) var(--space-1);
    justify-items: start;
    align-content: center;
    min-height: calc((var(--card-w-m) * 1.63) * 3 + var(--space-2) * 2);
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
    top: -6px;
    right: -6px;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: var(--color-event-ppeok);
    color: var(--color-banner-light-text);
    font-size: var(--font-size-s);
    font-weight: 800;
    line-height: 1.4;
  }
</style>
