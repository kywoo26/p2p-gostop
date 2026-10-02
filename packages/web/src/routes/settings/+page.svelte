<script lang="ts">
  import { getCoordinator } from '../../app/context.ts';
  import Settings from '../../routes/Settings.svelte';
  const app = getCoordinator();
  const current = $derived(app.current);
  const settings = $derived(app.settings);
  const match = $derived(app.match);
  const remoteActive = $derived(app.remoteActive);
  const changeSettings = $derived(app.changeSettings);
  const returnFromSettings = $derived(app.returnFromSettings);
</script>

<svelte:head><title>맞고</title></svelte:head>

<Settings
  settings={settings.value}
  sessionActive={current.resumable !== null || match !== null || remoteActive}
  onchange={changeSettings}
  back={returnFromSettings ?? '#/'}
/>
