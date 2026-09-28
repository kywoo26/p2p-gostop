<script lang="ts">
  // 고/스톱 선택 (spec 6.2 오버레이, 6.4 등장 150ms, 6.5 고 금색·스톱 흰색)
  import { formatMoney } from '../lib/format.ts';
  import type { MoneyUnit } from '../lib/view-types.ts';
  import PromptPanel from './PromptPanel.svelte';

  interface Props {
    score: number;
    goCount: number;
    stopAmount: number;
    unit: MoneyUnit;
    ongo?: (() => void) | undefined;
    onstop?: (() => void) | undefined;
  }

  let { score, goCount, stopAmount, unit, ongo, onstop }: Props = $props();
</script>

<PromptPanel title="고? 스톱?">
  <p class="summary">
    <strong>{score}점</strong>
    {#if goCount > 0}<span>· {goCount}고 중</span>{/if}
  </p>
  <p class="hint">지금 스톱하면 {formatMoney(stopAmount, unit)}</p>
  <div class="actions">
    <button type="button" class="go" onclick={() => ongo?.()}>{goCount + 1}고</button>
    <button type="button" class="stop" onclick={() => onstop?.()}>스톱</button>
  </div>
</PromptPanel>

<style>
  .summary {
    margin: 0;
    text-align: center;
    font-size: var(--font-size-l);
  }

  .summary strong {
    font-size: 1.75rem;
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: var(--space-1) 0 var(--space-4);
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  button {
    min-height: calc(var(--touch-min) + 8px);
    border: 0;
    border-radius: var(--radius-m);
    color: var(--color-banner-dark-text);
    font: inherit;
    font-size: 1.375rem;
    font-weight: 800;
  }

  .go {
    background: var(--color-event-go);
  }

  .stop {
    background: var(--color-event-stop);
  }
</style>
