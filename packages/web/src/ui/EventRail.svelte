<script lang="ts">
  // UX-08 / #47: 사건은 예약 행만 사용. 선택 중 마지막 문구를 보관한다.
  // 시간/소리/효과 강도는 기존 재생기와 후속 effects PR 소유.
  import type { Banner } from './banner.ts';
  import EventBanner from './EventBanner.svelte';
  import Impact from './visual-upgrade/Impact.svelte';
  const upgrade = document.documentElement.dataset['visual'] === 'upgrade';
  const frame = new URLSearchParams(location.search).get('impact-frame');
  const sample = frame === null ? null : Math.max(0, Math.min(1, Number(frame) || 0));
  let {
    banner = null,
    toast = null,
    actor = null,
    blocked = false,
    idle,
  }: {
    banner?: (Banner & { readonly id?: number }) | null;
    toast?: { readonly id: number; readonly text: string } | null;
    actor?: string | null;
    blocked?: boolean;
    idle: string;
  } = $props();
  let deferred = $state('');
  $effect(() => {
    if (blocked && (banner || toast)) {
      deferred = [banner ? `${actor ?? ''} ${banner.text}`.trim() : '', toast?.text]
        .filter(Boolean)
        .join(' · ');
    } else if (!blocked && (banner || toast)) deferred = '';
  });
</script>

{#if !blocked}
  <div class="event-rail" data-testid="event-rail">
    {#if upgrade && banner && (banner.kind === 'ppeok' || banner.kind === 'jjok')}
      {#key banner.id ?? banner.kind}<Impact kind={banner.kind} {sample} />{/key}
    {/if}
    {#if banner}
      <EventBanner
        kind={banner.kind}
        text={[banner.text, toast?.text].filter(Boolean).join(' · ')}
        {actor}
      />
    {:else}<p role="status">{toast?.text ?? (deferred ? `${idle} · ${deferred}` : idle)}</p>{/if}
  </div>
{/if}

<style>
  .event-rail {
    min-width: 0;
    max-height: 100%;
    overflow: hidden;
    pointer-events: none;
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
    font-size: 20px;
    line-height: 22px;
    padding: 2px 8px;
    box-shadow: none;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .event-rail :global(.actor) {
    display: inline;
    font-size: inherit;
    line-height: inherit;
    opacity: 1;
  }
</style>
