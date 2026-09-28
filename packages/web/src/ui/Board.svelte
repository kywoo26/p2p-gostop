<script lang="ts">
  // 게임판 (spec 6.2): 상단 상대 정보·획득패, 중앙 바닥·더미, 하단 내 획득패·상태·손패, 오버레이(배너·선택 창).
  // 정적 뷰만 그린다. 엔진 연결·애니메이션 큐는 M3 배선 단계에서 붙인다.
  import { formatMoney } from '../lib/format.ts';
  import type { BoardView, CardId, MoneyUnit } from '../lib/view-types.ts';
  import type { BannerKind } from './banner.ts';
  import CapturedPile from './CapturedPile.svelte';
  import EventBanner from './EventBanner.svelte';
  import Floor from './Floor.svelte';
  import GoStopModal from './GoStopModal.svelte';
  import Hand from './Hand.svelte';
  import TargetModal from './TargetModal.svelte';

  interface Props {
    view: BoardView;
    unit?: MoneyUnit;
    banner?: { kind: BannerKind; text: string } | null;
    onplay?: ((id: CardId) => void) | undefined;
  }

  let { view, unit = '냥', banner = null, onplay }: Props = $props();

  const me = $derived(view.seats[view.viewer]);
  const opponent = $derived(view.seats[view.viewer === 0 ? 1 : 0]);
  const pending = $derived(view.pending?.seat === view.viewer ? view.pending : null);
  const floorHighlight = $derived(pending?.kind === 'target' ? pending.options : []);
</script>

<section class="board" aria-label="게임판">
  <header class="seat-bar">
    <h2 class="name">{opponent.name}</h2>
    <dl class="stats">
      <div>
        <dt>점수</dt>
        <dd>{opponent.score}</dd>
      </div>
      <div>
        <dt>피</dt>
        <dd>{opponent.progress.pi}</dd>
      </div>
      <div>
        <dt>손패</dt>
        <dd>{opponent.handCount}</dd>
      </div>
      {#if opponent.goCount > 0}<div>
          <dt>고</dt>
          <dd>{opponent.goCount}</dd>
        </div>{/if}
    </dl>
  </header>
  <CapturedPile captured={opponent.captured} label="상대 획득패" />

  <div class="center">
    <Floor groups={view.floor} deckCount={view.deckCount} highlight={floorHighlight} />
    {#if banner}
      <div class="banner-layer">
        <EventBanner kind={banner.kind} text={banner.text} />
      </div>
    {/if}
  </div>

  <CapturedPile captured={me.captured} label="내 획득패" />
  <div class="seat-bar me">
    <h2 class="name">{me.name}</h2>
    <dl class="stats">
      <div>
        <dt>점수</dt>
        <dd>{me.score}</dd>
      </div>
      {#if me.goCount > 0}<div>
          <dt>고</dt>
          <dd>{me.goCount}</dd>
        </div>{/if}
      <div>
        <dt>배수</dt>
        <dd>×{view.multiplier}</dd>
      </div>
      <div class="balance">
        <dt>잔액</dt>
        <dd>{formatMoney(me.balance, unit)}</dd>
      </div>
    </dl>
    <ul class="progress" aria-label="족보 진행도">
      <li>광 {me.progress.gwang}/3</li>
      <li>고도리 {me.progress.godori}/3</li>
      <li>단 {me.progress.dan}/3</li>
      <li>피 {me.progress.pi}/10</li>
    </ul>
  </div>
  <Hand cards={me.hand ?? []} playable={view.playable} {onplay} />

  {#if pending?.kind === 'target'}
    <TargetModal card={pending.card} source={pending.source} options={pending.options} />
  {:else if pending?.kind === 'goStop'}
    <GoStopModal
      score={pending.score}
      goCount={pending.goCount}
      stopAmount={pending.stopAmount}
      {unit}
    />
  {/if}
</section>

<style>
  .board {
    position: relative;
    display: grid;
    grid-template-rows: auto auto 1fr auto auto auto;
    gap: var(--space-2);
    min-height: 100dvh;
    padding: max(var(--space-2), env(safe-area-inset-top)) var(--space-3)
      max(var(--space-2), env(safe-area-inset-bottom));
    background:
      radial-gradient(ellipse at 50% 45%, oklch(38% 0.07 160), transparent 70%), var(--color-felt);
    overflow: hidden;
  }

  .seat-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
  }

  .name {
    margin: 0;
    font-size: var(--font-size-m);
    font-weight: 700;
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--font-size-s);
  }

  .stats div {
    display: flex;
    gap: 0.25em;
  }

  .stats dt {
    color: var(--color-text-muted);
  }

  .stats dd {
    margin: 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .balance {
    margin-left: auto;
  }

  .progress {
    display: flex;
    gap: var(--space-2);
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-s);
  }

  .progress li {
    padding: 0 var(--space-2);
    border-radius: 999px;
    background: oklch(20% 0.03 160 / 0.7);
    font-variant-numeric: tabular-nums;
  }

  .center {
    position: relative;
    display: grid;
    align-content: center;
  }

  .banner-layer {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
</style>
