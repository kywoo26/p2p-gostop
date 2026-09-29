<script lang="ts">
  // FR-40 / UX-H01: 점수와 잔액은 같은 열에서 비교한다. 진행도는 SeatProgress 소유.
  import { formatMoney } from '../lib/format.ts';
  import type { MoneyUnit } from '../lib/view-types.ts';

  interface Props {
    who: '나' | '상대';
    name: string;
    score: number;
    goCount: number;
    balance: number;
    unit: MoneyUnit;
    multiplier?: number | null;
    stopPreview?: boolean;
    expanded?: boolean;
  }

  let {
    who,
    name,
    score,
    goCount,
    balance,
    unit,
    multiplier = null,
    stopPreview = false,
    expanded = false,
  }: Props = $props();
  const multiplierLabel = $derived(stopPreview ? '스톱 배수' : '누적 배수, 박 제외');
</script>

<div
  class={['seat-bar', { me: who === '나', expanded }]}
  aria-label={`${name === who ? who : `${name} (${who})`} 점수판`}
>
  <h2 class="identity" title={name}>
    <span class="who">{who}</span><span class="name">{name === who ? '' : name}</span>
  </h2>
  <span class="score" aria-label={`${who} 현재 족보 점수 ${score}점`}>
    <b data-testid={who === '나' ? 'my-score' : 'opponent-score'}>{score}</b><span>점</span>
  </span>
  <span class="go" aria-label={`${who} 고 ${goCount}회`}>{goCount}고</span>
  <span
    class="multiplier"
    aria-label={multiplier === null
      ? `${who} 배수 미제공`
      : `${who} ${multiplierLabel} ×${multiplier}`}
    title={multiplierLabel}
  >
    {#if multiplier === null}—{:else}×{multiplier}{/if}
  </span>
  <span class="balance" aria-label={`${who} 잔액 ${formatMoney(balance, unit)}`}
    >{formatMoney(balance, unit)}</span
  >
</div>

<style>
  .seat-bar {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    align-items: center;
    column-gap: 6px;
    row-gap: 0;
    min-height: 0;
    padding: 0 var(--space-2);
    color: var(--color-hud-text);
    background: var(--color-hud);
    font-size: var(--hud-font-size);
    line-height: var(--hud-line-height);
    font-variant-numeric: tabular-nums;
  }

  .me {
    outline: var(--hud-border);
    outline-offset: calc(-1 * var(--hud-border-width));
  }
  .identity {
    display: flex;
    gap: 4px;
    min-width: 0;
    margin: 0;
    font: inherit;
  }
  .who {
    color: var(--color-hud-muted);
    flex-shrink: 0;
  }
  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--color-hud-muted);
  }
  .me .who,
  .me .score {
    color: var(--color-hud-mine);
  }
  .score {
    white-space: nowrap;
  }
  .score b {
    font-size: var(--hud-score-font-size);
    line-height: var(--hud-score-line-height);
    font-weight: var(--hud-score-font-weight);
  }
  .go,
  .multiplier {
    color: var(--color-hud-muted);
    white-space: nowrap;
  }
  .multiplier {
    min-width: 2ch;
  }
  .balance {
    text-align: right;
    white-space: nowrap;
  }
  .expanded {
    grid-template-rows: var(--hud-score-line-height) var(--hud-money-line-height);
  }
  .expanded .balance {
    grid-column: 1 / -1;
    line-height: var(--hud-money-line-height);
  }
</style>
