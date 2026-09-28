<script lang="ts">
  // 고/스톱 선택 (spec 6.2 오버레이, 6.4 등장 150ms, 6.5 고 금색·스톱 흰색)
  // FR-14: 현재 점수, 배수, 스톱 시 획득액, 상대 현재 점수·피 수. 스톱 미리보기 분해(steps)가 있으면 체인으로 보인다.
  import { formatMoney } from '../lib/format.ts';
  import type { MoneyUnit, SettleStepView } from '../lib/view-types.ts';
  import PromptPanel from './PromptPanel.svelte';
  import { stepLabel } from './settle-labels.ts';

  interface Props {
    score: number;
    goCount: number;
    stopAmount: number;
    unit: MoneyUnit;
    /** 스톱 미리보기 (엔진 stopPreview) */
    detail?: {
      readonly points: number;
      readonly multiplier: number;
      readonly steps: readonly SettleStepView[];
      readonly capped: boolean;
    } | null;
    /** 상대 요약 (고 위험 판단용) */
    opponent?: { readonly name: string; readonly score: number; readonly pi: number } | null;
    ongo?: (() => void) | undefined;
    onstop?: (() => void) | undefined;
  }

  let {
    score,
    goCount,
    stopAmount,
    unit,
    detail = null,
    opponent = null,
    ongo,
    onstop,
  }: Props = $props();
</script>

<PromptPanel title="고? 스톱?">
  <p class="summary">
    <strong>{score}점</strong>
    {#if goCount > 0}<span>· {goCount}고 중</span>{/if}
  </p>
  {#if detail}
    <p class="chain" aria-label="스톱하면 받을 점수">
      {#each detail.steps as step, i (i)}
        <span
          >{i === 0 ? '' : step.op === 'add' ? ' + ' : ' × '}{stepLabel(step.kind)}
          {step.value}</span
        >
      {/each}
      <span> = <b>{detail.points}점</b></span>
    </p>
  {/if}
  <p class="hint">
    지금 스톱하면 {formatMoney(stopAmount, unit)}{#if detail?.capped}
      (상대 잔액까지){/if}
  </p>
  {#if opponent}
    <p class="opponent">{opponent.name}: {opponent.score}점 · 피 {opponent.pi}</p>
  {/if}
  <div class="actions">
    <button type="button" class="go" data-choice="go" onclick={() => ongo?.()}
      >{goCount + 1}고</button
    >
    <button type="button" class="stop" data-choice="stop" onclick={() => onstop?.()}>스톱</button>
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

  .chain {
    margin: var(--space-1) 0 0;
    text-align: center;
    font-size: var(--font-size-s);
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: var(--space-1) 0 var(--space-2);
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .opponent {
    margin: 0 0 var(--space-3);
    text-align: center;
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
