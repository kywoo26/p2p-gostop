<script lang="ts">
  import { getCoordinator } from '../../app/context.ts';
  import GuestApp from '../../routes/GuestApp.svelte';
  const app = getCoordinator();
  const remoteGuest = $derived(app.remoteGuest);
  const makeRemoteGuest = $derived(app.makeRemoteGuest);
  const invitationUrl = $derived(app.invitationUrl);
  const hasRemoteResume = $derived(app.hasRemoteResume);
  const remoteOrigin = $derived(app.remoteOrigin);
</script>

<svelte:head><title>맞고</title></svelte:head>

{#if remoteGuest !== null}
  <GuestApp
    remoteController={remoteGuest}
    createRemoteController={makeRemoteGuest}
    {invitationUrl}
    {hasRemoteResume}
    initialRemoteOrigin={remoteOrigin}
  />
{/if}
