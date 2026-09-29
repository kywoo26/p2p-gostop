<script lang="ts">
  import { loadImage, proEnabled, playSound, type AssetId } from './runtime.ts';
  let { scene }: { scene: 'home' | 'table' | 'settlement' | 'screen' } = $props();
  let anchor = $state<HTMLDivElement>();
  let completed = $state(0);
  let failed = $state(false);
  let retry = $state(0);
  let total = $state(0);
  $effect(() => {
    if (!proEnabled || !anchor) return;
    void retry;
    const parent = anchor.parentElement!;
    const ids: AssetId[] = ['felt', 'wood', 'gold', 'leather'];
    if (scene === 'table') ids.push('avatar-01', 'avatar-10');
    if (scene === 'home') ids.push('key-art');
    if (scene === 'settlement') ids.push('settlement-art');
    let alive = true;
    completed = 0;
    failed = false;
    total = ids.length;
    parent.dataset['proScene'] = scene;
    void Promise.all(
      ids.map(async (id) => {
        try {
          const image = await loadImage(id);
          if (alive) {
            parent.style.setProperty(`--pro-${id}`, `url("${image.src}")`);
            completed += 1;
          }
        } catch {
          if (alive) failed = true;
        }
      }),
    ).then(() => {
      if (alive) {
        parent.dataset['proReady'] = String(!failed);
        if (!failed) performance.mark('pro-scene-ready');
        if (scene === 'settlement') playSound('settlement');
      }
    });
    return () => {
      alive = false;
    };
  });
</script>

{#if proEnabled}
  <div bind:this={anchor} class="pro-scene" aria-hidden="true"></div>
  {#if completed < total}
    <div class="pro-loading" role="status">
      {#if failed}<button onclick={() => (retry += 1)}>다시 시도</button>{:else}불러오는 중 {completed}/{total}<progress
          value={completed}
          max={total}
          aria-label="불러오는 중"
        ></progress>{/if}
    </div>
  {/if}
{/if}
