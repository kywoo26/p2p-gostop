<script lang="ts">
  // 게임판 위에 작게 뜨는 선택 창 (spec 6.3: 배경은 계속 보인다). 네이티브 <dialog> 비모달 표시.
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';
  import { durationMs } from '../anim/durations.ts';

  interface Props {
    title: string;
    children?: Snippet;
    actions?: Snippet;
  }

  let { title, children, actions }: Props = $props();
  const titleId = $props.id();
  function scrollRegion(node: HTMLDivElement) {
    const observer = new ResizeObserver(() => {
      node.tabIndex = node.scrollHeight > node.clientHeight + 1 ? 0 : -1;
    });
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return { destroy: () => observer.disconnect() };
  }
</script>

<dialog
  class="prompt"
  open
  aria-labelledby={titleId}
  transition:fly={{ y: 24, duration: durationMs('modal') }}
>
  <h2 id={titleId}>{title}</h2>
  {#if children}<div class="prompt-content" use:scrollRegion role="region" aria-label="선택 설명">
      <div>{@render children()}</div>
    </div>{/if}
  {#if actions}<div class="prompt-actions">{@render actions()}</div>{/if}
</dialog>

<style>
  .prompt {
    position: relative;
    inset: auto;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: 100%;
    min-height: 0;
    margin: 0;
    padding: 4px 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
    color: var(--color-text);
    z-index: var(--z-prompt);
  }
  h2 {
    flex: none;
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    text-align: left;
  }
  .prompt-content {
    min-height: 0;
    flex: 1;
    overflow: auto;
  }
  .prompt-content:empty {
    display: none;
  }
  .prompt-actions {
    flex: none;
  }
</style>
