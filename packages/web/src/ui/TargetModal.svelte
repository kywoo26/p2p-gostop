<script lang="ts">
  // 바닥 2장 중 먹을 카드 고르기 (spec 4.3 PROMPT_TARGET, 6.3 선택 모달)
  import type { CardId } from '../lib/view-types.ts';
  import Card from './Card.svelte';
  import { cardLabel } from './cards.ts';
  import PromptPanel from './PromptPanel.svelte';

  interface Props {
    /** 낸(또는 뒤집은) 카드 */
    card: CardId;
    source: 'play' | 'flip';
    options: readonly CardId[];
    onchoose?: ((id: CardId) => void) | undefined;
  }

  let { card, source, options, onchoose }: Props = $props();
</script>

<PromptPanel title="어느 패를 먹을까요?">
  <p class="played">
    <Card id={card} size="s" marks={false} />
    <span>{source === 'play' ? '낸 패' : '뒤집은 패'}: {cardLabel(card)}</span>
  </p>
  <div class="options">
    {#each options as id (id)}
      <button type="button" aria-label={`${cardLabel(id)} 먹기`} onclick={() => onchoose?.(id)}>
        <Card {id} size="m" />
        <span aria-hidden="true">{cardLabel(id)}</span>
      </button>
    {/each}
  </div>
</PromptPanel>

<style>
  .played {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: 0 0 var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  button {
    display: grid;
    justify-items: center;
    gap: var(--space-1);
    min-height: var(--touch-min);
    padding: var(--space-1) var(--space-2) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-s);
  }

  button:active {
    border-color: var(--color-event-go);
  }
</style>
