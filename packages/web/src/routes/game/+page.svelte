<script lang="ts">
  import { getCoordinator } from '../../app/context.ts';
  import { go } from '../../app/navigation.ts';
  import Game from '../../routes/Game.svelte';
  import Screen from '../../ui/Screen.svelte';
  const app = getCoordinator();
  const current = $derived(app.current);
  const SOLO_MENU = $derived(app.SOLO_MENU);
  const soloMenu = $derived(app.soloMenu);
  const endSolo = $derived(app.endSolo);
  const backToken = $derived(app.backToken);
</script>

<svelte:head><title>맞고</title></svelte:head>

{#if current.solo !== null}
  <Game
    controller={current.solo}
    soloDifficulty={current.solo.difficulty}
    menu={SOLO_MENU}
    onmenu={soloMenu}
    onend={() => endSolo(true)}
    ended={current.solo.state.phase === 'ended'}
    onfresh={() => go('/solo')}
    onrecords={() => go('/records')}
    {backToken}
  />
{:else}
  <Screen title="혼자 연습">
    <p>{current.saveError ?? '진행 중인 게임이 없습니다.'}</p>
    {#snippet actions()}
      <a class="button primary" href="#/solo">새 게임</a>
    {/snippet}
  </Screen>
{/if}
