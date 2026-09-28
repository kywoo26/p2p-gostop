<script lang="ts">
  // 진단·로그 (spec 6.2, FR-30~32). 비보안 컨텍스트라 Clipboard·Web Share를 쓰지 않고(NF-02),
  // 전체 선택 가능한 텍스트 영역으로 내보낸다. Android 공유 시트 연동(bridge share)은 M4.
  import type { DiagnosticsView } from '../lib/view-types.ts';
  import Screen from '../ui/Screen.svelte';

  interface Props {
    view: DiagnosticsView;
  }

  let { view }: Props = $props();
  let textarea = $state<HTMLTextAreaElement | null>(null);

  const logText = $derived(
    [
      `build ${view.buildId} · ${view.device} · ${view.mode}`,
      ...view.log.map((line) => `${line.t} ${line.level.toUpperCase()} ${line.msg}`),
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

<Screen title="진단">
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

  {#snippet actions()}
    <button type="button" class="button primary" onclick={selectAll}>로그 전체 선택</button>
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
