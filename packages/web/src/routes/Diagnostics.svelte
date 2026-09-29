<script lang="ts">
  // 진단·로그 (spec 6.2, FR-30~32). 비보안 컨텍스트라 Clipboard·Web Share를 쓰지 않고(NF-02),
  // 전체 선택 가능한 텍스트 영역으로 내보낸다. 호스트(Android 앱)는 게스트가 올린 로그까지 합쳐 공유 시트로 보내고
  // (bridge share), 게스트는 로그를 WebSocket으로 호스트에 올린다(NP-09).
  import type { DiagnosticsView } from '../lib/view-types.ts';
  import Screen from '../ui/Screen.svelte';

  interface Props {
    view: DiagnosticsView;
    /** 호스트가 받은 게스트 로그 (NP-09) */
    guestLog?: readonly string[];
    /** 뒤로 가기 해시 (게스트 화면은 null: 닫기 버튼을 쓴다) */
    back?: string | null;
    /** Android 공유 시트 (호스트 앱에서만) */
    onshare?: ((text: string) => void) | undefined;
    /** 게스트: 로그를 호스트로 보내기 */
    onupload?: (() => void) | undefined;
    onclose?: (() => void) | undefined;
    ondevice?: (() => void) | undefined;
    /** 공유·업로드 결과 안내 */
    status?: string | null;
  }

  let {
    view,
    guestLog = [],
    back = '#/',
    onshare,
    onupload,
    onclose,
    ondevice,
    status = null,
  }: Props = $props();
  let textarea = $state<HTMLTextAreaElement | null>(null);

  const logText = $derived(
    [
      `build ${view.buildId} · ${view.device} · ${view.mode}`,
      ...view.log.map((line) => `${line.t} ${line.level.toUpperCase()} ${line.msg}`),
      ...(guestLog.length > 0 ? ['---- 게스트 로그 (업로드) ----', ...guestLog] : []),
    ].join('\n'),
  );

  function selectAll() {
    textarea?.focus();
    textarea?.select();
  }

  const MODE_LABEL: Record<DiagnosticsView['mode'], string> = {
    host: '호스트',
    guest: '게스트',
    solo: '혼자 연습',
  };
  const STATUS_LABEL = { ok: '정상', warn: '주의', fail: '실패' } as const;
</script>

<Screen title="진단" {back}>
  <section aria-labelledby="diag-env">
    <h2 id="diag-env">환경</h2>
    <dl class="pairs">
      <dt>빌드</dt>
      <dd>{view.buildId}</dd>
      <dt>기기</dt>
      <dd>{view.device}</dd>
      <dt>모드</dt>
      <dd>{MODE_LABEL[view.mode]}</dd>
    </dl>
  </section>

  <section aria-labelledby="diag-checks">
    <h2 id="diag-checks">점검</h2>
    <ul class="checks">
      {#each view.checks as check (check.label)}
        <li>
          <span class={['badge', check.status]}>{STATUS_LABEL[check.status]}</span>
          <span>{check.label}</span>
          <span class="detail">{check.detail}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="diag-log">
    <h2 id="diag-log">로그 (최근 {view.log.length}줄)</h2>
    <ol class="log">
      {#each view.log.slice(-30) as line, i (i)}
        <li class={line.level}><time>{line.t}</time> {line.msg}</li>
      {/each}
    </ol>
    <label class="copy">
      <span>복사용 전체 로그 (길게 눌러 전체 선택 → 복사)</span>
      <textarea readonly rows="6" bind:this={textarea} value={logText}></textarea>
    </label>
  </section>

  {#if status}
    <p class="status" role="status">{status}</p>
  {/if}

  {#snippet actions()}
    {#if onshare}
      <button type="button" class="button primary" onclick={() => onshare(logText)}
        >로그 공유</button
      >
    {:else if onupload}
      <button type="button" class="button primary" onclick={() => onupload()}
        >호스트로 로그 보내기</button
      >
    {/if}
    <button type="button" class="button" onclick={selectAll}>전체 선택</button>
    {#if ondevice}
      <button type="button" class="button" onclick={() => ondevice()}>기기 진단</button>
    {/if}
    {#if onclose}
      <button type="button" class="button" onclick={() => onclose()}>닫기</button>
    {/if}
  {/snippet}
</Screen>

<style>
  .pairs {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-3);
    margin: 0;
  }

  .pairs dt {
    color: var(--color-text-muted);
  }

  .pairs dd {
    margin: 0;
  }

  .checks {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .checks li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 var(--space-2);
    align-items: center;
  }

  .detail {
    grid-column: 2;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .badge {
    grid-row: span 2;
    padding: 0 var(--space-2);
    border-radius: 999px;
    color: var(--color-banner-dark-text);
    font-size: var(--font-size-s);
    font-weight: 700;
  }

  .badge.ok {
    background: var(--color-accent);
  }

  .badge.warn {
    background: var(--color-event-go);
  }

  .badge.fail {
    background: var(--color-event-ppeok-text);
  }

  .log {
    margin: 0;
    padding: 0;
    list-style: none;
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .copy {
    display: grid;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .copy textarea {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-s);
    background: var(--color-bg);
    color: var(--color-text);
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
  }

  .status {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .log time {
    color: var(--color-text-muted);
  }

  .log .warn {
    color: var(--color-event-go);
  }

  .log .error {
    color: var(--color-event-ppeok-text);
  }
</style>
