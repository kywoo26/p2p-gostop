<script lang="ts">
  import { getCoordinator } from '../../app/context.ts';
  import HostRoom from '../../routes/HostRoom.svelte';
  const app = getCoordinator();
  const host = $derived(app.host);
  const remoteHost = $derived(app.remoteHost);
  const hotspot = $derived(app.hotspot);
  const remoteRules = $derived(app.remoteRules);
  const changeRemoteRules = $derived(app.changeRemoteRules);
  const startRemote = $derived(app.startRemote);
</script>

<svelte:head><title>맞고</title></svelte:head>

{#if remoteHost}
  <HostRoom
    hotspot={hotspot.info}
    guest={host?.guestName ? { name: host.guestName, connected: host.guestOnline } : null}
    rules={remoteRules}
    remote={remoteHost}
    onrules={changeRemoteRules}
    onstart={startRemote}
  />
{/if}
