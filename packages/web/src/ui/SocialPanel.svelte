<script lang="ts">
  // FR/UX-SC: 제어형 패널. 세션·transport·game action·저장에는 접근하지 않는다.
  import {
    EMPTY_COMPOSE,
    composeInput,
    editCompose,
    submitCompose,
    type ComposeState,
    type SocialTextValidator,
  } from '../game/social-compose.ts';

  interface Choice {
    readonly id: string;
    readonly label: string;
  }
  interface Props {
    open: boolean;
    muted: boolean;
    available: boolean;
    emotes: readonly Choice[];
    phrases: readonly Choice[];
    validate: SocialTextValidator;
    onsendtext: (text: string) => boolean;
    onsendchoice: (kind: 'emote' | 'phrase', id: string) => boolean;
    onmute: (muted: boolean) => void;
    onclose: () => void;
    /** 상위 화면이 키보드의 visualViewport 높이를 전달한다. 패널 밖 geometry는 바꾸지 않는다. */
    viewportHeight?: number;
  }
  let {
    open,
    muted,
    available,
    emotes,
    phrases,
    validate,
    onsendtext,
    onsendchoice,
    onmute,
    onclose,
    viewportHeight,
  }: Props = $props();
  let draftState = $state<ComposeState>(EMPTY_COMPOSE);
  let tab = $state<'emote' | 'phrase' | 'text'>('text');
  let choiceStatus = $state<string | null>(null);
  const id = $props.id();
  const result = $derived.by(() => {
    try {
      return validate(draftState.draft);
    } catch {
      return { ok: false as const, reason: 'segmentation' };
    }
  });
  const error = $derived(
    draftState.error ??
      (draftState.draft && !draftState.composing && !result.ok ? result.reason : null),
  );
  const errors: Record<string, string> = {
    empty: '내용을 입력하세요.',
    invalidUnicode: '올바른 문자를 입력하세요.',
    control: '줄바꿈이나 숨은 제어문자는 보낼 수 없습니다.',
    graphemes: '80글자 이내로 입력하세요.',
    scalars: '문자 구성이 너무 깁니다.',
    bytes: '메시지 용량이 너무 큽니다.',
    segmentation: '이 기기에서 문자 길이를 확인할 수 없습니다.',
    notSent: '연결 상태나 전송 간격을 확인한 뒤 다시 보내세요.',
  };
  $effect(() => {
    if (!open) {
      draftState = EMPTY_COMPOSE;
      choiceStatus = null;
    }
  });
  function close() {
    draftState = EMPTY_COMPOSE;
    choiceStatus = null;
    onclose();
  }
  function sendText() {
    if (!available || draftState.composing) return;
    draftState = submitCompose(draftState, validate, onsendtext);
  }
  function sendChoice(kind: 'emote' | 'phrase', option: Choice) {
    if (!available || draftState.composing) return;
    try {
      choiceStatus = onsendchoice(kind, option.id)
        ? '전송했습니다. 수신 확인은 제공하지 않습니다.'
        : errors.notSent!;
    } catch {
      choiceStatus = errors.notSent!;
    }
  }
</script>

{#if open}
  <section
    class="social-panel"
    aria-labelledby={`${id}-title`}
    style:max-height={viewportHeight !== undefined &&
    Number.isFinite(viewportHeight) &&
    viewportHeight > 0
      ? `${viewportHeight}px`
      : '100dvh'}
  >
    <header>
      <h2 id={`${id}-title`}>대전 대화</h2>
      <button type="button" class="close" onclick={close}>닫기</button>
    </header>
    <label class="mute">
      <input
        type="checkbox"
        checked={muted}
        onchange={(event) => onmute(event.currentTarget.checked)}
      />
      상대 표현 끄기
    </label>
    <p class="receiving">상대 표현 {muted ? '꺼짐' : '켜짐'}</p>
    {#if !available}<p class="connection">
        대화 연결이나 전송 간격을 기다리는 중입니다. 게임은 계속할 수 있습니다.
      </p>{/if}
    <nav aria-label="보낼 표현 종류">
      <button
        type="button"
        disabled={draftState.composing}
        aria-pressed={tab === 'emote'}
        onclick={() => (tab = 'emote')}>감정표현</button
      >
      <button
        type="button"
        disabled={draftState.composing}
        aria-pressed={tab === 'phrase'}
        onclick={() => (tab = 'phrase')}>정형 문구</button
      >
      <button
        type="button"
        disabled={draftState.composing}
        aria-pressed={tab === 'text'}
        onclick={() => (tab = 'text')}>직접 입력</button
      >
    </nav>
    <div class="content">
      {#if tab === 'text'}
        <label for={`${id}-text`}>보낼 문장</label>
        <textarea
          id={`${id}-text`}
          rows="2"
          value={draftState.draft}
          disabled={!available}
          aria-describedby={`${id}-limit ${id}-error`}
          enterkeyhint="done"
          oninput={(event) => (draftState = editCompose(draftState, event.currentTarget.value))}
          oncompositionstart={() => (draftState = composeInput(draftState, true))}
          oncompositionend={() => (draftState = composeInput(draftState, false))}
          onkeydown={(event) => {
            // 조합 확정 Enter는 IME에 맡긴다. form이 없어 submit은 발생하지 않는다.
            if (event.key === 'Enter' && !event.isComposing && !draftState.composing)
              event.preventDefault();
          }}></textarea>
        <p id={`${id}-limit`} class="limits">
          {result.ok ? result.graphemes : '—'}/80글자 · {result.ok ? result.bytes : '—'}/1024바이트
        </p>
        <p id={`${id}-error`} class="error" role="status">
          {error ? (errors[error] ?? errors.notSent) : ''}
        </p>
        <button
          type="button"
          class="send"
          disabled={!available || draftState.composing || !result.ok}
          onclick={sendText}>전송</button
        >
      {:else}
        <div class="choices">
          {#each tab === 'emote' ? emotes : phrases as option (option.id)}
            <button
              type="button"
              disabled={!available || draftState.composing}
              onclick={() => sendChoice(tab === 'emote' ? 'emote' : 'phrase', option)}
              >{option.label}</button
            >
          {/each}
        </div>
      {/if}
    </div>
    {#if choiceStatus}<p role="status">{choiceStatus}</p>{/if}
    <p class="privacy">대화는 잠깐만 표시되며 저장하지 않습니다. 개인정보는 보내지 마세요.</p>
  </section>
{/if}

<style>
  .social-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
    min-height: 0;
    overflow: auto;
    width: 100%;
    padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
      max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    background: var(--color-surface, #f4efe4);
    color: var(--color-text, #172723);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: 18px;
  }
  button {
    min-width: 48px;
    min-height: 48px;
    padding: 8px 12px;
    border: 1px solid currentColor;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  button:focus-visible,
  textarea:focus-visible,
  input:focus-visible {
    outline: 3px solid var(--color-focus, #b34625);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.65;
  }
  button[aria-pressed='true'] {
    background: var(--color-text, #172723);
    color: var(--color-surface, #f4efe4);
  }
  .mute {
    display: flex;
    min-height: 48px;
    align-items: center;
    gap: 8px;
  }
  input {
    width: 24px;
    height: 24px;
  }
  nav,
  .choices {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .content {
    display: grid;
    gap: 8px;
    min-height: 0;
  }
  textarea {
    min-height: 64px;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    border: 1px solid currentColor;
    border-radius: 6px;
    padding: 8px;
    color: inherit;
    background: transparent;
    font: inherit;
    font-size: 16px;
  }
  .limits,
  .privacy,
  .receiving {
    font-size: 13px;
    line-height: 1.5;
  }
  .error {
    min-height: 1.5em;
  }
</style>
