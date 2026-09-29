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
  const shownActor = $derived(
    shown?.seat === undefined || shown.seat === null
      ? actor
      : shown.seat === viewer
        ? '나'
        : '상대',
  );
  $effect(() => {
    if (blocked) {
      latched = null;
      return;
    }
    if (banner !== null) latched = banner;
  });
  $effect(() => {
    if (latched === null) return;
    const id = latched.id;
    const timer = window.setTimeout(() => {
      if (latched?.id === id) latched = null;
    }, 1200);
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
      deferred = [shown ? `${shownActor ?? ''} ${shown.text}`.trim() : '', toast?.text]
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
        text={shown.text.split(' · ')[0] ?? shown.text}
        actor={shownActor}
      />
    {:else}<p role="status" class:quiet={!toast && !deferred}>
        {toast?.text ?? (deferred ? `${idle} · ${deferred}` : idle)}
      </p>{/if}
  </div>
{/if}

<style>
  .event-rail {
    display: flex;
    justify-content: flex-end;
    min-width: 0;
    max-height: 100%;
    overflow: hidden;
    pointer-events: none;
  }
  @media (min-height: 900px) {
    .event-rail {
      justify-content: center;
    }
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
  @media (max-height: 899px) {
    .event-rail :global(.banner) {
      flex-direction: column;
      gap: 0;
      max-width: 82px;
      padding: 4px;
    }
    .event-rail :global(.banner::before) {
      display: none;
    }
    .event-rail :global(.banner strong) {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }
</style>
