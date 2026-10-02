<script lang="ts">
  import { go } from '../../app/navigation.ts';
  import { getCoordinator } from '../../app/context.ts';
  import Versus from '../../routes/Versus.svelte';
  const app = getCoordinator();
  $effect(() => {
    if (app.remoteActive) go('/remote', { replace: true });
  });
</script>

<svelte:head><title>맞고</title></svelte:head>

<!-- page 진입 부작용보다 먼저 판정한다. 지연된 탐색도 LAN 방을 만들지 않는다. -->
{#if !app.remoteActive}<Versus onnavigate={go} />{/if}
