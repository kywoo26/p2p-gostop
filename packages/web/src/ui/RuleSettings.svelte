<script lang="ts">
  import type { RuleOptions } from '@p2p-gostop/engine';
  import { RULE_FIELDS } from '../settings/rule-options.ts';

  interface Props {
    rules: RuleOptions;
    disabled?: boolean;
    onchange?: (key: keyof RuleOptions, value: unknown) => void;
  }
  let { rules, disabled = false, onchange }: Props = $props();
  const visible = RULE_FIELDS.filter((field) => !field.hidden);
  function changed(key: keyof RuleOptions, raw: string) {
    const field = RULE_FIELDS.find((item) => item.key === key);
    const value = field?.choices.find((item) => JSON.stringify(item.value) === raw);
    if (value !== undefined && !value.disabled) onchange?.(key, value.value);
  }
</script>

<fieldset>
  <legend>세션 규칙</legend>
  <p class="help">새 세션을 시작할 때 고정됩니다. 진행 중에는 변경할 수 없습니다.</p>
  {#each visible as field (field.key)}
    <div class="option">
      <label for={`rule-${field.key}`}>{field.label}</label>
      <select
        id={`rule-${field.key}`}
        value={JSON.stringify(rules[field.key])}
        {disabled}
        onchange={(e) => changed(field.key, e.currentTarget.value)}
      >
        {#each field.choices as option (JSON.stringify(option.value))}
          <option value={JSON.stringify(option.value)} disabled={option.disabled}
            >{option.label}</option
          >
        {/each}
      </select>
      {#if field.note}<small>{field.note}</small>{/if}
    </div>
  {/each}
  <p class="help">
    분배 시 바닥 보너스 뺏기는 2인 맞고에서 상대 피가 없어 효과가 없으므로 숨겼습니다.
  </p>
</fieldset>

<style>
  fieldset {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: var(--space-4);
    border: 0;
    border-top: 1px solid var(--color-divider);
    background: var(--color-surface);
  }
  legend {
    float: left;
    width: 100%;
    padding: 0;
    margin-bottom: var(--space-2);
    color: var(--color-text-muted);
    font-weight: 700;
    font-size: var(--type-section-size);
  }
  .option {
    display: grid;
    gap: var(--space-1);
  }
  label {
    font-weight: 600;
  }
  select {
    min-height: var(--touch-min);
    width: 100%;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
  }
  small,
  .help {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }
</style>
