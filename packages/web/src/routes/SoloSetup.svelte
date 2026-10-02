<script lang="ts">
  import type { AppRoute } from '../app/navigation.ts';
  let { onnavigate }: { onnavigate?: (route: AppRoute) => void } = $props();
  // 혼자 연습: 난이도 선택 → 즉시 시작 (spec 2.5, AI-03). 네트워크·권한 요청 없음.
  // 규칙·금액은 설정 화면 값으로 세션을 시작할 때 고정된다(FR-24).
  import type { Difficulty } from '@p2p-gostop/ai';
  import { current } from '../game/current.svelte.ts';
  import { DIFFICULTY_LABEL } from '../game/solo.svelte.ts';
  import { formatMoney } from '../lib/format.ts';
  import { DIFFICULTY_IDS, effectiveStartBalance, settings } from '../settings/settings.svelte.ts';
  import Screen from '../ui/Screen.svelte';

  const PRESET_LABEL = { traditional: '정통', standard: '표준', arcade: '아케이드' } as const;
  const DIFFICULTY_HINT: Readonly<Record<Difficulty, string>> = {
    easy: '가볍게: 먹을 수 있는 패를 조금 더 자주 냅니다',
    normal: '평가 함수로 한 수 앞을 봅니다',
    commercial: '상대 패를 여러 번 추정해 끝까지 읽습니다 (최대 1초 생각)',
  };

  const s = $derived(settings.value);
  const resumable = $derived(current.resumable);
  const previous = $derived(current.recordSource);
  let confirmDialog = $state<HTMLDialogElement | null>(null);

  function start() {
    if (previous !== null || current.saveError !== null) {
      confirmDialog?.showModal();
      return;
    }
    startConfirmed();
  }

  function startConfirmed() {
    if (current.saveError !== null) current.discardCorruptSave();
    current.startSolo(settings.value, settings.value.difficulty);
    confirmDialog?.close();
    onnavigate?.('/game');
  }

  function resume() {
    if (current.resumeSolo(settings.value) !== null) onnavigate?.('/game');
  }
</script>

<Screen title="혼자 연습">
  {#if current.saveError}
    <p class="save-error" role="alert" data-testid="save-error">{current.saveError}</p>
  {/if}
  <fieldset>
    <legend>상대 난이도</legend>
    {#each DIFFICULTY_IDS as id (id)}
      <label class="option">
        <input
          type="radio"
          name="difficulty"
          value={id}
          checked={s.difficulty === id}
          onchange={() => settings.update({ difficulty: id })}
        />
        <span class="label">{DIFFICULTY_LABEL[id]}</span>
        <span class="hint">{DIFFICULTY_HINT[id]}</span>
      </label>
    {/each}
  </fieldset>

  <section aria-labelledby="solo-rules">
    <h2 id="solo-rules">규칙·금액</h2>
    <p>
      {s.customRules === null ? PRESET_LABEL[s.preset] : '사용자 지정'} 규칙 · 점당 {formatMoney(
        s.perPoint,
        s.unit,
      )} · 시작 {formatMoney(effectiveStartBalance(s), s.unit)}
    </p>
    <a class="link" href="#/settings">설정에서 바꾸기</a>
  </section>

  {#snippet actions()}
    {#if resumable}
      <button type="button" class="button" onclick={resume}
        >이어하기 ({resumable.session.roundNumber}판째)</button
      >
    {/if}
    <button type="button" class="button primary" data-choice="start" onclick={start}>시작</button>
  {/snippet}
</Screen>

<dialog bind:this={confirmDialog} aria-labelledby="new-game-title">
  <h2 id="new-game-title">새 게임을 시작할까요?</h2>
  <p>기존 판·잔액·기록이 새 게임으로 바뀝니다. 취소하면 현재 상태가 그대로 남습니다.</p>
  {#if current.saveError}<p role="alert">
      저장 데이터를 읽을 수 없습니다. 계속하면 기존 저장을 덮어씁니다.
    </p>{/if}
  <div class="confirm-actions">
    <button type="button" data-choice="cancel-new" onclick={() => confirmDialog?.close()}
      >취소</button
    >
    <button type="button" data-choice="confirm-new" onclick={startConfirmed}>새 게임 시작</button>
  </div>
</dialog>

<style>
  fieldset {
    display: grid;
    gap: var(--space-2);
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

  .option {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 var(--space-3);
    align-items: center;
    min-height: var(--touch-min);
    padding: var(--space-2) 0;
  }

  .option input {
    grid-row: span 2;
    width: 1.25rem;
    height: 1.25rem;
    accent-color: var(--color-accent);
  }

  .label {
    font-size: var(--font-size-l);
    font-weight: 700;
  }

  .hint {
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  p {
    margin: 0;
  }

  .link {
    color: var(--color-accent);
  }

  .save-error {
    margin: var(--space-3);
    color: var(--color-event-go);
  }
  dialog {
    width: min(22rem, calc(100% - 2 * var(--space-4)));
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface);
    color: var(--color-text);
  }
  .confirm-actions {
    display: flex;
    gap: var(--space-2);
  }
  .confirm-actions button {
    min-height: var(--touch-min);
    flex: 1;
  }
</style>
