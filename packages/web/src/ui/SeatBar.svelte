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
  const rich = document.documentElement.dataset['visualVariant'] === 'rich';
</script>

<div
  class={['seat-bar', { me: who === '나', expanded }]}
  aria-label={`${name === who ? who : `${name} (${who})`} 점수판`}
>
  <h2 class="identity" title={name}>
    {#if rich}<span class="vu-avatar" aria-hidden="true"></span>{/if}
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
  <span class="balance" aria-label={`${who} 잔액 ${formatMoney(balance, unit)}`} title="잔액"
    >{formatMoney(balance, unit)}</span
  >
</div>

<style>
  .seat-bar {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    align-items: center;
    column-gap: 8px;
    row-gap: 0;
    min-height: 0;
    padding: 0 8px;
    color: var(--color-hud-text);
    background: var(--color-hud);
    font-size: var(--hud-font-size);
    line-height: var(--hud-line-height);
    font-variant-numeric: tabular-nums;
  }

  .me {
    background: var(--color-hud-my-surface);
    box-shadow: inset 3px 0 var(--color-hud-mine);
  }
  .identity {
    display: flex;
    gap: 4px;
    min-width: 0;
    margin: 0;
    font: inherit;
  }
  .who {
    color: var(--color-hud-text);
    font-weight: 750;
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
    display: flex;
    align-items: center;
    height: 24px;
    gap: 2px;
    white-space: nowrap;
  }
  .score > span {
    font-size: 12px;
    color: var(--color-hud-muted);
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
    font-weight: 600;
  }
  .expanded {
    grid-template-rows: var(--hud-score-line-height) var(--hud-money-line-height);
  }
  .expanded .balance {
    grid-column: 1 / -1;
    line-height: var(--hud-money-line-height);
  }
</style>
