<script lang="ts">
  // 첫 판 선 고르기 (rules R4: 엎어 둔 패 중 한 장을 골라 높은 월이 선). 가려진 카드만 보인다.
  import Card from './Card.svelte';
  import PromptPanel from './PromptPanel.svelte';

  interface Props {
    poolSize: number;
    /** 상대가 이미 고른 자리 */
    taken: number | null;
    onpick?: ((index: number) => void) | undefined;
  }

  let { poolSize, taken, onpick }: Props = $props();
  const slots = $derived(Array.from({ length: poolSize }, (_, i) => i));
</script>

<PromptPanel title="선 고르기">
  <p class="message">한 장을 고르세요. 높은 월이 선입니다.</p>
  <div class="pool">
    {#each slots as index (index)}
      <button
        type="button"
        aria-label={`${index + 1}번째 패 고르기`}
        data-choice={`pick-${index}`}
        disabled={index === taken}
        onclick={() => onpick?.(index)}
      >
        <Card id={null} size="m" />
      </button>
    {/each}
  </div>
</PromptPanel>

<style>
  .message {
    margin: 0 0 var(--space-3);
    text-align: center;
    color: var(--color-text-muted);
  }

  .pool {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
    justify-items: center;
  }

  button {
    min-width: var(--touch-min);
    min-height: var(--touch-min);
    padding: 0;
    border: 0;
    background: none;
  }

  button:disabled {
    opacity: 0.3;
  }
</style>
