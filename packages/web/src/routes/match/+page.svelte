<script lang="ts">
  import { getCoordinator } from '../../app/context.ts';
  import Game from '../../routes/Game.svelte';
  import Screen from '../../ui/Screen.svelte';
  const app = getCoordinator();
  const backToken = $derived(app.backToken);
  const host = $derived(app.host);
  const HOST_MENU = $derived(app.HOST_MENU);
  const hostMenu = $derived(app.hostMenu);
  const endMatch = $derived(app.endMatch);
  const hotspot = $derived(app.hotspot);
</script>

<svelte:head><title>맞고</title></svelte:head>

{#if host !== null && host.phase !== 'lobby'}
  <Game
    controller={host}
    menu={HOST_MENU}
    onmenu={hostMenu}
    onend={endMatch}
    onreconnect={() => host?.reconnect()}
    waiting={host.waitPrompt}
    onwait={() => host.keepWaiting()}
    warning={hotspot.info.warning}
    {backToken}
  />
{:else}
  <Screen title="친구와 대전">
    <p>진행 중인 대전이 없습니다.</p>
    {#snippet actions()}
      <a class="button primary" href="#/versus">방 열기</a>
    {/snippet}
  </Screen>
{/if}
