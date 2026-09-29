<script lang="ts">
  // 고/스톱 선택 (spec 6.2 오버레이, 6.4 등장 150ms, 6.5 고 금색·스톱 흰색)
  // FR-14: 현재 점수, 배수, 스톱 시 획득액, 상대 현재 점수·피 수. 스톱 미리보기 분해(steps)가 있으면 체인으로 보인다.
  import { formatMoney } from '../lib/format.ts';
  import type { MoneyUnit, SettleStepView } from '../lib/view-types.ts';
  import PromptPanel from './PromptPanel.svelte';

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
  {#snippet actions()}
    <p class="risk">
      <strong>{score}점</strong>{#if opponent}<span>상대 {opponent.score}점 · 피 {opponent.pi}</span
        >{/if}{#if detail?.capped}<span>상한 적용</span>{/if}
    </p>
    <div class="actions">
      <button type="button" class="go" data-choice="go" onclick={() => ongo?.()}
        >{goCount + 1}고</button
      >
      <button
        type="button"
        class="stop"
        data-choice="stop"
        aria-label="스톱"
        onclick={() => onstop?.()}
        ><span>스톱</span><strong>{formatMoney(stopAmount, unit)}</strong></button
      >
    </div>
  {/snippet}
</PromptPanel>

<style>
  .risk {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    flex-wrap: wrap;
    margin: 0 0 2px;
    font-size: 14px;
    line-height: 20px;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  button {
    min-width: 48px;
    min-height: 48px;
    padding: 2px;
    border: 0;
    border-radius: 12px;
    color: var(--color-on-accent);
    font: inherit;
    font-size: 18px;
    font-weight: 750;
  }
  .go {
    background: var(--color-surface-raised);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }
  .stop {
    display: grid;
    align-content: center;
    background: var(--color-accent);
  }
  .stop strong {
    font-size: 14px;
    line-height: 20px;
    overflow-wrap: anywhere;
  }
</style>
