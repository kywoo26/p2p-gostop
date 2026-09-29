<script lang="ts">
  import { loadImage, proEnabled, playSound, type AssetId } from './runtime.ts';
  import { durationMs } from '../anim/durations.ts';
  let { kind }: { kind: string } = $props();
  let canvas = $state<HTMLCanvasElement>();
  $effect(() => {
    if (!proEnabled || !canvas) return;
    const id: AssetId =
      kind === 'ppeok' ? 'ppeok' : kind === 'jjok' ? 'jjok' : kind === 'bomb' ? 'bomb' : 'ttadak';
    let alive = true;
    let raf = 0;
    const ctx = canvas.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const still = new URLSearchParams(location.search).has('still');
    playSound(kind);
    void loadImage(id)
      .then((image) => {
        if (!alive || !ctx) return;
        const cell = image.width / 8;
        const start = performance.now();
        // Consume owner timing; instant gallery renders one representative frame.
        const duration = durationMs('banner');
        const render = (now: number) => {
          if (!alive) return;
          const frame =
            reduced || still || duration === 0
              ? 10
              : Math.min(63, Math.floor(((now - start) / duration) * 64));
          ctx.clearRect(0, 0, 384, 384);
          ctx.drawImage(
            image,
            (frame % 8) * cell,
            Math.floor(frame / 8) * cell,
            cell,
            cell,
            0,
            0,
            384,
            384,
          );
          if (!reduced && !still && duration > 0 && now - start < duration && !document.hidden)
            raf = requestAnimationFrame(render);
        };
        render(start);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  });
</script>

{#if proEnabled}<canvas
    class="pro-sprite"
    bind:this={canvas}
    width="384"
    height="384"
    aria-hidden="true"
  ></canvas>{/if}
