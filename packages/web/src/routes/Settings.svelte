<script lang="ts">
  // 설정 (FR-21·FR-22·FR-23·FR-46): 세션 규칙·금액과 기기별 표시·입력 설정을 분리한다.
  import { MONEY_MODEL_BASIS, MONEY_STATS, PER_POINT_OPTIONS, type PerPoint } from '@p2p-gostop/ai';
  import { PRESETS, type PresetId } from '@p2p-gostop/engine';
  import { getBridge } from '../bridge/bridge.ts';
  import { formatMoney } from '../lib/format.ts';
  import type { SpeedSetting } from '../lib/view-types.ts';
  import {
    effectiveRules,
    effectiveStartBalance,
    presetSettingsPatch,
    type AppSettings,
  } from '../settings/settings.svelte.ts';
  import Screen from '../ui/Screen.svelte';
  import RuleSettings from '../ui/RuleSettings.svelte';

  interface Props {
    settings: AppSettings;
    onchange?: ((patch: Partial<AppSettings>) => void) | undefined;
    /** 진행 중인 세션이 있으면 규칙·금액 변경이 다음 세션부터라고 알린다 */
    sessionActive?: boolean;
    back?: string;
  }

  let { settings, onchange, sessionActive = false, back = '#/' }: Props = $props();
  const native = getBridge().isNative;

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

  const rules = $derived(effectiveRules(settings));
  const moneyStats = $derived(MONEY_STATS[settings.preset]);
  function changeRule(key: keyof typeof rules, value: unknown) {
    if (sessionActive) return;
    if (key === 'gukjin') {
      onchange?.({
        customRules: { ...rules, gukjin: value as 'auto' | 'ask' },
        gukjinAsk: value === 'ask',
      });
      return;
    }
    onchange?.({ customRules: { ...rules, [key]: value } });
  }
  const ruleSummary = $derived([
    `보너스 카드 ${rules.bonusCards}장`,
    `보너스 뺏기 ${rules.bonusSteal ? '켬' : '끔'}`,
    `2장 폭탄 ${rules.twoCardBomb === 'off' ? '끔' : '켬'}`,
    `대박판 ${rules.jackpotRound === null ? '끔' : `${rules.jackpotRound.every}판마다 ×${rules.jackpotRound.multiplier}`}`,
    `나가리 배수 상한 ${rules.nagariCap === null ? '없음' : `×${rules.nagariCap}`}`,
  ]);
</script>

<Screen title="설정" {back}>
  <fieldset>
    <legend>규칙 프리셋</legend>
    <div class="segmented">
      {#each PRESET_OPTIONS as preset (preset.id)}
        <label>
          <input
            type="radio"
            name="preset"
            value={preset.id}
            checked={settings.preset === preset.id && settings.customRules === null}
            disabled={sessionActive}
            onchange={() => onchange?.(presetSettingsPatch(preset.id))}
          />
          <span>{preset.label}</span>
        </label>
      {/each}
    </div>
    {#if settings.customRules !== null}<p class="help">
        사용자 지정 · 기준 프리셋 {PRESET_OPTIONS.find((p) => p.id === settings.preset)?.label}
      </p>
      <button
        type="button"
        disabled={sessionActive}
        onclick={() =>
          onchange?.({ customRules: null, gukjinAsk: PRESETS[settings.preset].gukjin === 'ask' })}
        >프리셋 규칙 복원</button
      >
    {/if}
    <ul class="summary">
      {#each ruleSummary as line (line)}<li>{line}</li>{/each}
    </ul>
  </fieldset>

  <RuleSettings {rules} disabled={sessionActive} onchange={changeRule} />

  <fieldset>
    <legend>금액</legend>
    <label class="row">
      <span>점당</span>
      <select
        value={settings.perPoint}
        disabled={sessionActive}
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
    <label class="row"
      ><span>시작 잔액 직접 입력</span><input
        type="number"
        min="1"
        max="1000000000"
        step="1"
        value={settings.startBalance ?? ''}
        placeholder={String(effectiveStartBalance({ ...settings, startBalance: null }))}
        disabled={sessionActive}
        onchange={(e) =>
          onchange?.({
            startBalance: e.currentTarget.value === '' ? null : Number(e.currentTarget.value),
          })}
      /></label
    >
    <button
      type="button"
      disabled={sessionActive || settings.startBalance === null}
      onclick={() => onchange?.({ startBalance: null })}>권장 잔액 복원</button
    >
    <label class="row"
      ><span>단위</span><select
        value={settings.unit}
        disabled={sessionActive}
        onchange={(e) => onchange?.({ unit: e.currentTarget.value as AppSettings['unit'] })}
        ><option value="냥">냥</option><option value="원">원</option><option value="점">점</option
        ></select
      ></label
    >
    <p class="help">
      {settings.preset} 프리셋: {MONEY_MODEL_BASIS.roundsPerPreset}판 셀프플레이, {MONEY_MODEL_BASIS.monteCarloSessions.toLocaleString(
        'ko-KR',
      )}회 무작위 {MONEY_MODEL_BASIS.sessionLength}판 세션으로 파산 위험 {(
        moneyStats.bankruptcyRisk * 100
      ).toFixed(2)}%를 추정했습니다. 점당 {MONEY_MODEL_BASIS.referencePerPoint} 기준 {formatMoney(
        moneyStats.startBalance,
        settings.unit,
      )}이며 점당 금액에 비례합니다.
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
    <legend>효과·소리</legend>
    <label class="row"
      ><span>효과 강도</span><select
        value={settings.effectIntensity}
        onchange={(e) =>
          onchange?.({ effectIntensity: e.currentTarget.value as AppSettings['effectIntensity'] })}
        ><option value="off">끔</option><option value="subtle">절제</option><option value="strong"
          >강조</option
        ></select
      ></label
    >
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

  <fieldset>
    <legend>기기 설정</legend>
    {#if native}<label class="switch"
        ><span>진동</span><input
          type="checkbox"
          role="switch"
          checked={settings.vibrate}
          onchange={(e) => onchange?.({ vibrate: e.currentTarget.checked })}
        /></label
      >{/if}
    <div class="row">
      <span>힌트 등급</span><select
        aria-label="힌트 등급"
        value={settings.hintLevel}
        onchange={(e) =>
          onchange?.({ hintLevel: e.currentTarget.value as AppSettings['hintLevel'] })}
        ><option value="off">끔</option><option value="basic">기본</option><option value="detail"
          >상세</option
        ></select
      >
    </div>
    <p class="help">
      상세 힌트 계산과 AI 조언은 후속 구현 예정입니다. 설정은 이 기기에만 저장됩니다.
    </p>
    <label class="switch"
      ><span>120ms 취소 지연</span><input
        type="checkbox"
        role="switch"
        checked={settings.confirmDelay}
        onchange={(e) => onchange?.({ confirmDelay: e.currentTarget.checked })}
      /></label
    >
    <p class="help">켜면 손패를 누른 뒤 120ms 안에 다시 눌러 취소할 수 있습니다.</p>
    <label class="switch"
      ><span>자동치기 (준비 중)</span><input
        type="checkbox"
        role="switch"
        checked={false}
        disabled
      /></label
    >
    <p class="help">
      구현 후에도 선택 없는 합법 수만 진행합니다. 고/스톱·밀기·흔들기 등 결정은 직접 합니다.
    </p>
  </fieldset>

  <a class="button" href="#/license">라이선스·저작자 표시</a>
</Screen>

<style>
  fieldset {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-4);
    border: 0;
    border-top: 1px solid var(--color-divider);
    border-radius: var(--radius-m);
    background: var(--color-surface);
  }

  legend {
    float: left;
    width: 100%;
    margin-bottom: var(--space-2);
    padding: 0;
    color: var(--color-text-muted);
    font-weight: 700;
    font-size: var(--type-section-size);
  }

  .segmented {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 8px;
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
    width: 48px;
    height: 48px;
    appearance: none;
    position: relative;
    margin: 0;
    cursor: pointer;
    border-radius: 12px;
  }
  .switch input::before {
    content: '';
    position: absolute;
    inset: 11px 2px;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface-raised);
  }
  .switch input::after {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    top: 15px;
    left: 6px;
    border-radius: 50%;
    background: var(--color-text);
  }
  .switch input:checked::before {
    background: var(--color-accent);
  }
  .switch input:checked::after {
    left: 24px;
    background: var(--color-on-accent);
  }

  .help {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  button,
  input[type='number'] {
    min-height: var(--touch-min);
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
