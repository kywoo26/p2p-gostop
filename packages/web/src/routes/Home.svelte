<script lang="ts">
  // 홈 화면 (spec 6.2). 메뉴 동작은 M3·M4에서 연결한다.
  import { BUILD_ID, BUILD_TIME } from '../lib/build-info.ts';

  const menu = [
    { id: 'versus', label: '친구와 대전', primary: true },
    { id: 'solo', label: '혼자 연습', primary: true },
    { id: 'records', label: '기록', primary: false },
    { id: 'settings', label: '설정', primary: false },
    { id: 'diagnostics', label: '진단', primary: false },
  ] as const;
</script>

<main class="home">
  <h1>맞고 P2P</h1>
  <nav aria-label="메인 메뉴">
    {#each menu as item (item.id)}
      <button type="button" class={['menu-button', item.primary && 'primary']}>
        {item.label}
      </button>
    {/each}
  </nav>
  <footer>
    <span data-testid="build-id">빌드 {BUILD_ID}</span>
    <time datetime={BUILD_TIME}>{BUILD_TIME.slice(0, 16).replace('T', ' ')}</time>
  </footer>
</main>

<style>
  .home {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-6);
    padding: var(--space-6) var(--space-4);
    max-width: 28rem;
    margin: 0 auto;
  }

  h1 {
    margin: 0;
    text-align: center;
    font-size: var(--font-size-title);
    letter-spacing: 0.02em;
  }

  nav {
    display: grid;
    gap: var(--space-3);
  }

  .menu-button {
    min-height: var(--touch-min);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-l);
    transition: background-color var(--dur-modal) ease-out;
  }

  .menu-button.primary {
    background: var(--color-accent);
    border-color: transparent;
    color: var(--color-on-accent);
    font-weight: 700;
  }

  .menu-button:active {
    background: var(--color-surface-raised);
  }

  .menu-button.primary:active {
    background: var(--color-accent-pressed);
  }

  footer {
    display: flex;
    justify-content: center;
    gap: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
    font-variant-numeric: tabular-nums;
  }
</style>
