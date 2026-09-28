<script lang="ts">
  // 설정 (spec 6.2): 프리셋, 토글, 금액, 속도, 효과음·진동, 라이선스·저작자 표시. 정적 틀.
  import type { SettingsView, SpeedSetting } from '../lib/view-types.ts';
  import Screen from '../ui/Screen.svelte';

  interface Props {
    view: SettingsView;
  }

  let { view }: Props = $props();

  const PRESETS: { id: SettingsView['preset']; label: string }[] = [
    { id: 'traditional', label: '정통' },
    { id: 'standard', label: '표준' },
    { id: 'arcade', label: '아케이드' },
  ];
  // spec 6.4: 보통 ×1.5, 빠름 ×1, 매우 빠름 ×0.6
  const SPEEDS: { id: SpeedSetting; label: string }[] = [
    { id: 'normal', label: '보통' },
    { id: 'fast', label: '빠름' },
    { id: 'very-fast', label: '매우 빠름' },
  ];
  const POINT_VALUES = [50, 100, 200, 500, 1000];
</script>

<Screen title="설정">
  <fieldset>
    <legend>규칙 프리셋</legend>
    <div class="segmented">
      {#each PRESETS as preset (preset.id)}
        <label>
          <input type="radio" name="preset" value={preset.id} checked={view.preset === preset.id} />
          <span>{preset.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>규칙</legend>
    {#each view.toggles as toggle (toggle.id)}
      <label class="switch">
        <span>{toggle.label}</span>
        <input type="checkbox" role="switch" checked={toggle.on} />
      </label>
    {/each}
  </fieldset>

  <fieldset>
    <legend>금액</legend>
    <label class="row">
      <span>점당</span>
      <select value={view.pointValue}>
        {#each POINT_VALUES as value (value)}
          <option {value}>{value}{view.unit}</option>
        {/each}
      </select>
    </label>
  </fieldset>

  <fieldset>
    <legend>애니메이션 속도</legend>
    <div class="segmented">
      {#each SPEEDS as speed (speed.id)}
        <label>
          <input type="radio" name="speed" value={speed.id} checked={view.speed === speed.id} />
          <span>{speed.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>소리·진동</legend>
    <label class="switch">
      <span>효과음</span>
      <input type="checkbox" role="switch" checked={view.sound} />
    </label>
    <label class="switch">
      <span>진동</span>
      <input type="checkbox" role="switch" checked={view.vibration} />
    </label>
  </fieldset>

  <a class="button" href="#/license">라이선스·저작자 표시</a>
</Screen>

<style>
  fieldset {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: 0;
    border-radius: var(--radius-m);
    background: var(--color-surface);
  }

  legend {
    float: left;
    width: 100%;
    margin-bottom: var(--space-2);
    padding: 0;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .segmented {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-m);
    background: var(--color-bg);
  }

  .segmented label {
    position: relative;
    display: grid;
  }

  .segmented input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
  }

  .segmented span {
    display: grid;
    place-items: center;
    min-height: var(--touch-min);
    border-radius: calc(var(--radius-m) - 2px);
  }

  .segmented input:checked + span {
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-weight: 700;
  }

  .segmented input:focus-visible + span {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .switch,
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--touch-min);
    gap: var(--space-3);
  }

  .switch input {
    width: 2.75rem;
    height: 1.5rem;
    accent-color: var(--color-accent);
  }

  select {
    min-height: var(--touch-min);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
  }
</style>
