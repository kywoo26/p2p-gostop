<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { createCoordinator } from './app/coordinator.svelte.ts';
  import { setCoordinator } from './app/context.ts';
  import { sounds } from './game/sound.ts';
  import { stopAudio, unlockAudio, playSound } from './pro-assets/runtime.ts';
  let { children }: { children: Snippet } = $props();
  const app = setCoordinator(createCoordinator());
  const { onError, settings } = app;
  onMount(() => {
    document.getElementById('boot-status')?.remove();
  });
</script>

<svelte:document
  onvisibilitychange={() => {
    if (document.hidden) stopAudio();
  }}
/>

<svelte:window
  onpointerdown={() => {
    sounds.unlock();
    unlockAudio();
    playSound('card');
  }}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') unlockAudio();
  }}
  onerror={(e) => onError(`오류: ${e instanceof ErrorEvent ? e.message : e.type}`)}
  onunhandledrejection={(e) => onError(`처리되지 않은 Promise 거부: ${String(e.reason)}`)}
/>

<div class="app-root" data-effect-intensity={settings.value.effectIntensity}>
  {@render children()}
</div>
