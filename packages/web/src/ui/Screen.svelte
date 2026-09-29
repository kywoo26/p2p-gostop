<script lang="ts">
  // 일반 화면 틀: 제목 + 뒤로 가기 링크 + 본문 (한 손 세로 화면, spec 6.1)
  import type { Snippet } from 'svelte';
  import Impact from './visual-upgrade/Impact.svelte';
  const rich = document.documentElement.dataset['visualVariant'] === 'rich';
  const frame = new URLSearchParams(location.search).get('impact-frame');
  const sample = frame === null ? null : Math.max(0, Math.min(1, Number(frame) || 0));

  interface Props {
    title: string;
    /** 뒤로 가기 해시 경로. 없으면 링크를 숨긴다 */
    back?: string | null;
    children: Snippet;
    actions?: Snippet;
  }

  let { title, back = '#/', children, actions }: Props = $props();
</script>

<main class={['screen', { 'vu-settlement': rich && title === '정산' }]}>
  <header>
    {#if rich && title === '정산'}<Impact kind="settlement" {sample} />{/if}
    {#if back !== null}<a class="back" href={back} aria-label="뒤로">←</a>{/if}
    <h1>{title}</h1>
  </header>
  <div class="body">
    {@render children()}
  </div>
  {#if actions}
    <footer class="actions">{@render actions()}</footer>
  {/if}
</main>

<style>
  .screen {
    min-height: 100dvh;
    max-width: 30rem;
    margin: 0 auto;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: var(--space-4);
    padding: max(var(--space-3), env(safe-area-inset-top)) var(--space-4)
      max(var(--space-4), env(safe-area-inset-bottom));
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  h1 {
    margin: 0;
    font-size: var(--type-title-size);
    line-height: var(--type-title-line);
    letter-spacing: -0.04em;
  }

  .back {
    display: grid;
    place-items: center;
    width: var(--touch-min);
    height: var(--touch-min);
    margin-left: calc(var(--space-2) * -1);
    border-radius: var(--radius-m);
    color: var(--color-text);
    font-size: 1.5rem;
    text-decoration: none;
  }

  .body {
    display: grid;
    align-content: start;
    gap: var(--space-4);
  }

  .actions {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--space-3);
  }

  /* 화면 공통 버튼·표·구역 (자식 화면에서 쓴다) */
  .screen :global(.button) {
    display: grid;
    place-items: center;
    min-height: var(--touch-min);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-l);
    text-decoration: none;
  }

  .screen :global(.button.primary) {
    background: var(--color-accent);
    border-color: transparent;
    color: var(--color-on-accent);
    font-weight: 700;
  }

  .screen :global(section) {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-m);
    background: var(--color-surface);
  }

  .screen :global(h2) {
    margin: 0;
    font-size: var(--font-size-m);
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .screen :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  .screen :global(th),
  .screen :global(td) {
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--color-divider);
    text-align: left;
  }

  .screen :global(.num) {
    text-align: right;
  }

  .screen :global(tr:last-child > *) {
    border-bottom: 0;
  }
</style>
