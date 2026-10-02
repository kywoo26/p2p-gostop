<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { returnRoute, uiState } from '../../app/navigation.ts';
  import { getCoordinator } from '../../app/context.ts';
  import Settings from '../../routes/Settings.svelte';
  const app = getCoordinator();
  const current = $derived(app.current);
  const settings = $derived(app.settings);
  const match = $derived(app.match);
  const remoteActive = $derived(app.remoteActive);
  const changeSettings = $derived(app.changeSettings);
  const sections = [
    { id: 'comfort', label: '표시·조작' },
    { id: 'play', label: '규칙·금액' },
    { id: 'connection', label: '원격 연결' },
  ] as const;
  const section = $derived(
    sections.find((item) => item.id === page.state.settingsSection)?.id ?? 'comfort',
  );
  function selectSection(value: (typeof sections)[number]['id']) {
    void goto(resolve('/settings'), {
      shallow: true,
      persistState: true,
      replace: true,
      reset: false,
      state: { ...uiState(page.state), settingsSection: value },
    });
  }
</script>

<svelte:head><title>맞고</title></svelte:head>

<Settings
  {section}
  settings={settings.value}
  sessionActive={current.resumable !== null || match !== null || remoteActive}
  onchange={changeSettings}
  back={resolve(returnRoute(page.state.returnTo))}
>
  {#snippet navigation()}
    <nav class="settings-sections" aria-label="설정 분류">
      {#each sections as item (item.id)}
        <button
          type="button"
          aria-pressed={section === item.id}
          onclick={() => selectSection(item.id)}>{item.label}</button
        >
      {/each}
    </nav>
  {/snippet}
</Settings>

<style>
  .settings-sections {
    display: flex;
    gap: 8px;
    width: 100%;
  }
  button {
    flex: 1;
    min-height: 48px;
    padding: 8px;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
  }
  button[aria-pressed='true'] {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
</style>
