<script lang="ts">
  import { getCoordinator } from '../app/context.ts';
  import { go } from '../app/navigation.ts';
  import Home from '../routes/Home.svelte';
  const app = getCoordinator();
  const current = $derived(app.current);
  const host = $derived(app.host);
  const match = $derived(app.match);
  const remoteActive = $derived(app.remoteActive);
  const resume = $derived(app.resume);
  const resumeSolo = $derived(app.resumeSolo);
</script>

<svelte:head><title>맞고</title></svelte:head>

{#if current.saveError}<p role="alert" class="storage-error">
    {current.saveError} <a href="#/solo">저장 상태 확인</a>
  </p>{/if}
<Home
  {resume}
  onresume={resumeSolo}
  {match}
  onmatch={() => go('/match')}
  activeMode={remoteActive ? 'remote' : host && host.phase !== 'ended' ? 'hotspot' : undefined}
/>

<style>
  .storage-error {
    margin: var(--space-3);
    padding: var(--space-3);
    background: var(--color-surface-raised);
    color: var(--color-event-go);
  }
</style>
