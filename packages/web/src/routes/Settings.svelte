<script lang="ts">
  // 설정 (spec 6.2, FR-20·FR-22·FR-23): 규칙 프리셋, 점당 금액(시작 잔액 자동 제안), 진행 속도, 효과음.
  // 규칙·금액은 새 세션부터 적용된다(FR-24). 24개 개별 토글(FR-21)과 진동은 M6.
  import { PER_POINT_OPTIONS, type PerPoint } from '@p2p-gostop/ai';
  import { PRESETS, type PresetId } from '@p2p-gostop/engine';
  import { formatMoney } from '../lib/format.ts';
  import type { SpeedSetting } from '../lib/view-types.ts';
  import { effectiveStartBalance, type AppSettings } from '../settings/settings.svelte.ts';
  import Screen from '../ui/Screen.svelte';

  interface Props {
    settings: AppSettings;
    onchange?: ((patch: Partial<AppSettings>) => void) | undefined;
    /** 진행 중인 세션이 있으면 규칙·금액 변경이 다음 세션부터라고 알린다 */
    sessionActive?: boolean;
  }

  let { settings, onchange, sessionActive = false }: Props = $props();

  const PRESET_OPTIONS: { id: PresetId; label: string }[] = [
    { id: 'traditional', label: '정통' },
    { id: 'standard', label: '표준' },
    { id: 'arcade', label: '아케이드' },
  ];
  // UX-15: 보통은 단계별 정지가 있는 기본 페이싱, 빠름은 AC-06 시간표
  const SPEED_OPTIONS: { id: SpeedSetting; label: string }[] = [
    { id: 'normal', label: '보통' },
    { id: 'fast', label: '빠름' },
    { id: 'very-fast', label: '매우 빠름' },
  ];

  const rules = $derived(PRESETS[settings.preset]);
  const ruleSummary = $derived([
    `보너스 카드 ${rules.bonusCards}장`,
    `보너스 뺏기 ${rules.bonusSteal ? '켬' : '끔'}`,
    `2장 폭탄 ${rules.twoCardBomb === 'off' ? '끔' : '켬'}`,
    `대박판 ${rules.jackpotRound === null ? '끔' : `${rules.jackpotRound.every}판마다 ×${rules.jackpotRound.multiplier}`}`,
    `나가리 배수 상한 ${rules.nagariCap === null ? '없음' : `×${rules.nagariCap}`}`,
  ]);
</script>

<Screen title="설정">
  <fieldset>
    <legend>규칙 프리셋</legend>
    <div class="segmented">
      {#each PRESET_OPTIONS as preset (preset.id)}
        <label>
          <input
            type="radio"
            name="preset"
            value={preset.id}
            checked={settings.preset === preset.id}
            onchange={() => onchange?.({ preset: preset.id })}
          />
          <span>{preset.label}</span>
        </label>
      {/each}
    </div>
    <ul class="summary">
      {#each ruleSummary as line (line)}<li>{line}</li>{/each}
    </ul>
  </fieldset>

  <fieldset>
    <legend>금액</legend>
    <label class="row">
      <span>점당</span>
      <select
        value={settings.perPoint}
        onchange={(e) =>
          onchange?.({ perPoint: Number(e.currentTarget.value) as PerPoint, startBalance: null })}
      >
        {#each PER_POINT_OPTIONS as value (value)}
          <option {value}>{formatMoney(value, settings.unit)}</option>
        {/each}
      </select>
    </label>
    <p class="row">
      <span>시작 잔액</span>
      <strong>{formatMoney(effectiveStartBalance(settings), settings.unit)}</strong>
    </p>
    <p class="help">
      30판 세션에서 파산 확률 5% 이하가 되도록 셀프플레이로 산정한 값입니다(점당 금액에 비례).
    </p>
    {#if sessionActive}
      <p class="help">규칙·금액은 새 세션부터 적용됩니다.</p>
    {/if}
  </fieldset>

  <fieldset>
    <legend>진행 속도</legend>
    <div class="segmented">
      {#each SPEED_OPTIONS as speed (speed.id)}
        <label>
          <input
            type="radio"
            name="speed"
            value={speed.id}
            checked={settings.speed === speed.id}
            onchange={() => onchange?.({ speed: speed.id })}
          />
          <span>{speed.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>소리</legend>
    <label class="switch">
      <span>효과음</span>
      <input
        type="checkbox"
        role="switch"
        checked={settings.sound}
        onchange={(e) => onchange?.({ sound: e.currentTarget.checked })}
      />
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

  .summary {
    margin: var(--space-2) 0 0;
    padding-left: 1.2rem;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .switch,
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--touch-min);
    gap: var(--space-3);
    margin: 0;
  }

  .switch input {
    width: 2.75rem;
    height: 1.5rem;
    accent-color: var(--color-accent);
  }

  .help {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
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
