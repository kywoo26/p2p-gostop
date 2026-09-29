<script lang="ts">
  // FR-40 / UX-11: 진영별 잔액·변동·점수. 정확한 금액과 고/배수는 접근성 이름과 판 정보에 유지한다.
  import { formatCompactMoney, formatMoney, formatSignedCompactMoney } from '../lib/format.ts';
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
    timerText?: string | null;
    estimatedAmount?: number | null;
    shakes?: number;
    ppeokCount?: number;
    dealer?: boolean;
    delta?: number;
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
    timerText = null,
    estimatedAmount = null,
    shakes = 0,
    ppeokCount = 0,
    dealer = false,
    delta = 0,
  }: Props = $props();
</script>

<div
  class={['seat-bar', { me: who === '나', expanded }]}
  aria-label={`${who} ${name === who ? '' : name + ' '}점수판`}
>
  <div class="seat-main">
    <h2 class="identity" title={name}>
      {#if who === '나' && dealer}<span class="dealer">선</span>{/if}
      <span class="who">{who}</span>
      {#if name !== who}<span class="name">{name}</span>{/if}
      <span class="counters" role="img" aria-label={`뻑 ${ppeokCount}회, 흔들기 ${shakes}회`}>
        <span class="counter" aria-hidden="true" title={`뻑 ${ppeokCount}회`}>
          <svg
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            aria-hidden="true"><path d="m3 4 4 4m10-4-4 4M2 13h5m11 0h-5m-3-3v7" /></svg
          >{ppeokCount}
        </span>
        <span class="counter" aria-hidden="true" title={`흔들기 ${shakes}회`}
          ><svg
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            aria-hidden="true"><path d="M6 4h8l2 10H4L6 4Zm2 12h4m-2-14v2M3 7 1 9m16-2 2 2" /></svg
          >{shakes}</span
        >
      </span>
      {#if timerText}<span class="timer" data-testid="decision-timer" title={timerText}
          >{timerText}</span
        >{/if}
    </h2>
    <div class="amounts">
      <span class="balance" aria-label={`${who} 잔액 ${formatMoney(balance, unit)}`}
        >{formatCompactMoney(balance, unit)}</span
      >
      <span
        class="delta"
        class:positive={delta > 0}
        class:negative={delta < 0}
        aria-label={`${who} 최근 정산 변동 ${formatMoney(delta, unit)}`}
        >{formatSignedCompactMoney(delta, unit)}</span
      >
    </div>
  </div>
  <div class="score-area">
    <span class="score" aria-label={`${who} 현재 족보 점수 ${score}점`}>
      <b data-testid={who === '나' ? 'my-score' : 'opponent-score'}>{score}</b><span>점</span>
    </span>
    <span class="score-meta">
      <span class="go" aria-label={`${who} 고 ${goCount}회`}>{goCount}고</span>
      {#if multiplier !== null}<span
          class="multiplier"
          aria-label={`${who} ${stopPreview ? '스톱 배수' : '누적 배수, 박 제외'} ${multiplier}배`}
        >
          · ×{multiplier}</span
        >{/if}
    </span>
  </div>
  <span class="sr-only"
    >{goCount}고, {multiplier === null ? '배수 미정' : `배수 ${multiplier}`}, {stopPreview
      ? '스톱 선택 중, '
      : ''}스톱 예상액 {estimatedAmount === null
      ? '미제공'
      : formatMoney(estimatedAmount, unit)}</span
  >
</div>

<style>
  .seat-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: 100%;
    color: var(--color-hud-text);
    font-variant-numeric: tabular-nums;
  }
  .seat-main {
    flex: 1;
    min-width: 0;
  }
  .identity {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    height: 18px;
    margin: 0;
    font-size: 14px;
    line-height: 18px;
    font-weight: 400;
    white-space: nowrap;
  }
  .who {
    flex: none;
    color: var(--skin-paper);
    font-weight: 600;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-hud-muted);
  }
  .dealer {
    display: grid;
    place-items: center;
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 2px;
    background: #843d38;
    color: var(--skin-paper);
    font-weight: 600;
  }
  .counter {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .counter svg {
    color: var(--skin-brass);
  }
  .counters {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    flex: none;
    color: var(--color-hud-muted);
  }
  .timer {
    flex: none;
    margin-left: auto;
    font-size: 12px;
    color: var(--skin-paper);
  }
  .amounts {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    white-space: nowrap;
  }
  .balance {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--skin-paper);
    font-size: 24px;
    line-height: 30px;
    font-weight: 600;
    letter-spacing: 0;
  }
  .delta {
    flex: none;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-hud-muted);
  }
  .delta.positive {
    color: var(--color-hud-mine);
  }
  .delta.negative {
    color: var(--color-event-ppeok-text);
  }
  .score {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    flex: none;
    min-width: 52px;
    height: 32px;
    padding: 0 6px;
    border-radius: 5px;
    background: oklch(14% 0.02 160 / 0.8);
    color: var(--skin-paper);
    white-space: nowrap;
  }
  .score b {
    font-size: 24px;
    line-height: 30px;
  }
  .score span {
    font-size: 12px;
    line-height: 30px;
  }
  .score-area {
    flex: none;
    display: grid;
    justify-items: stretch;
    gap: 2px;
  }
  .score-meta {
    text-align: center;
    line-height: 14px;
    font-size: 12px;
    white-space: nowrap;
    color: var(--color-hud-muted);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
