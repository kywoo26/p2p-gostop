<script lang="ts">
  // UX-08 / PA-06: 사건은 예약 행만 사용. 선택 중 마지막 문구를 보관한다.
  import type { ScoreBreakdown, Seat } from '@p2p-gostop/engine';
  import type { Banner } from './banner.ts';
  import { completedJokbo } from './banner.ts';
  import EventBanner from './EventBanner.svelte';
  let {
    banner = null,
    toast = null,
    actor = null,
    blocked = false,
    idle,
    round = 0,
    viewer = 0,
    jokboScores = null,
  }: {
    banner?: (Banner & { readonly id?: number }) | null;
    toast?: { readonly id: number; readonly text: string } | null;
    actor?: string | null;
    blocked?: boolean;
    idle: string;
    round?: number;
    viewer?: Seat;
    jokboScores?: readonly [ScoreBreakdown, ScoreBreakdown] | null;
  } = $props();
  let deferred = $state('');
  let latched = $state<(Banner & { readonly id?: number }) | null>(null);
  let milestone = $state<{
    readonly kind: 'jokbo';
    readonly text: string;
    readonly seat: Seat;
    readonly id: number;
  } | null>(null);
  let previous: { round: number; scores: readonly [ScoreBreakdown, ScoreBreakdown] } | null = null;
  let sequence = 0;
  const shown = $derived(banner ?? latched ?? milestone);
  $effect(() => {
    if (blocked) {
      latched = null;
      return;
    }
    if (banner === null) return;
    latched = banner;
    const timer = window.setTimeout(() => (latched = null), 1200);
    return () => window.clearTimeout(timer);
  });
  $effect(() => {
    if (jokboScores === null) return;
    if (previous?.round === round) {
      for (const seat of [0, 1] as const) {
        const text = completedJokbo(previous.scores[seat], jokboScores[seat]);
        if (text !== null) {
          milestone = { kind: 'jokbo', text, seat, id: ++sequence };
        }
      }
    } else {
      milestone = null;
    }
    previous = { round, scores: jokboScores };
  });
  $effect(() => {
    if (milestone === null || banner !== null || latched !== null || blocked) return;
    const id = milestone.id;
    const timer = window.setTimeout(() => {
      if (milestone?.id === id) milestone = null;
    }, 1200);
    return () => window.clearTimeout(timer);
  });
  $effect(() => {
    if (blocked && (shown || toast)) {
      deferred = [shown ? `${actor ?? ''} ${shown.text}`.trim() : '', toast?.text]
        .filter(Boolean)
        .join(' · ');
    } else if (!blocked && (shown || toast)) deferred = '';
  });
</script>

{#if !blocked}
  <div class="event-rail" data-testid="event-rail">
    {#if shown}
      <EventBanner
        kind={shown.kind}
        text={[shown.text, toast?.text].filter(Boolean).join(' · ')}
        actor={shown.seat === undefined || shown.seat === null
          ? actor
          : shown.seat === viewer
            ? '나'
            : '상대'}
      />
    {:else}<p role="status" class:quiet={!toast && !deferred}>
        {toast?.text ?? (deferred ? `${idle} · ${deferred}` : idle)}
      </p>{/if}
  </div>
{/if}

<style>
  .event-rail {
    min-width: 0;
    max-height: 100%;
    overflow: hidden;
    pointer-events: none;
  }
  .quiet {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  p {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--color-text-muted);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .event-rail :global(.banner) {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }
  .event-rail :global(.actor) {
    display: inline;
    font-size: inherit;
    line-height: inherit;
    opacity: 1;
  }
</style>
