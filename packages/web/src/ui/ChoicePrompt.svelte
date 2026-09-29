<script lang="ts">
  // 짧은 선택 창 (spec 2.3-3·6.3: 국진·흔들기·총통·폭탄 선택. 기본값·자동 선택 없음, FR-16)
  import type { CardId } from '../lib/view-types.ts';
  import Card from './Card.svelte';
  import PromptPanel from './PromptPanel.svelte';

  interface Choice {
    readonly id: string;
    readonly label: string;
    readonly primary?: boolean;
  }

  interface Props {
    title: string;
    message?: string;
    /** 관련 카드 (흔드는 카드, 총통 카드 등) */
    cards?: readonly CardId[];
    choices: readonly Choice[];
    onchoose?: ((id: string) => void) | undefined;
  }

  let { title, message = '', cards = [], choices, onchoose }: Props = $props();
</script>

<PromptPanel {title}>
  {#if message}<p class="message">{message}</p>{/if}
  {#if cards.length > 0}
    <p class="cards">
      {#each cards as id (id)}<Card {id} size="s" />{/each}
    </p>
  {/if}
  {#snippet actions()}
    <div class="choices" style:--count={choices.length}>
      {#each choices as choice (choice.id)}
        <button
          type="button"
          class={{ primary: choice.primary }}
          data-choice={choice.id}
          onclick={() => onchoose?.(choice.id)}>{choice.label}</button
        >
      {/each}
    </div>
  {/snippet}
</PromptPanel>

<style>
  .message {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    text-align: center;
    color: var(--color-text-muted);
  }

  .cards {
    display: flex;
    justify-content: center;
    gap: var(--space-1);
    margin: 0;
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(min(var(--count), 3), 1fr);
    gap: var(--space-2);
  }

  button {
    min-height: var(--touch-min);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-weight: 700;
  }

  button.primary {
    background: var(--color-accent);
    border-color: transparent;
    color: var(--color-on-accent);
  }
</style>
