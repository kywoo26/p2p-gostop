<script lang="ts">
  // 게임판 위에 작게 뜨는 선택 창 (spec 6.3: 배경은 계속 보인다). 네이티브 <dialog> 비모달 표시.
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';
  import { durationMs } from '../anim/durations.ts';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();
  const titleId = $props.id();
</script>

<dialog
  class="prompt"
  open
  aria-labelledby={titleId}
  transition:fly={{ y: 24, duration: durationMs('modal') }}
>
  <h2 id={titleId}>{title}</h2>
  {@render children()}
</dialog>

<style>
  .prompt {
    position: absolute;
    left: var(--space-3);
    right: var(--space-3);
    bottom: calc(var(--card-h-l) + var(--space-6));
    width: auto;
    max-width: 22rem;
    margin: 0 auto;
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: oklch(23% 0.02 260 / 0.96);
    color: var(--color-text);
    box-shadow: 0 0.75rem 2rem oklch(0% 0 0 / 0.5);
    z-index: 10;
  }

  h2 {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-l);
    text-align: center;
  }
</style>
