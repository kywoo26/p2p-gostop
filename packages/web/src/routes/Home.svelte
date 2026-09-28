<script lang="ts">
  // 홈 화면 (spec 6.2). 친구와 대전은 M4(호스트/게스트)에서 연결한다.
  import { BUILD_ID, BUILD_TIME } from '../lib/build-info.ts';

  interface Props {
    /** 이어할 수 있는 혼자 연습 세션 (MN-05). 있으면 맨 위에 "이어하기" */
    resume?: { readonly round: number; readonly label: string } | null;
    onresume?: (() => void) | undefined;
  }

  let { resume = null, onresume }: Props = $props();

  const menu = [
    { id: 'versus', label: '친구와 대전', primary: true, href: '#/versus' },
    { id: 'solo', label: '혼자 연습', primary: true, href: '#/solo' },
    { id: 'records', label: '기록', primary: false, href: '#/records' },
    { id: 'settings', label: '설정', primary: false, href: '#/settings' },
    { id: 'diagnostics', label: '진단', primary: false, href: '#/diagnostics' },
  ] as const;
</script>

<main class="home">
  <h1>맞고 P2P</h1>
  <nav aria-label="메인 메뉴">
    {#if resume}
      <button type="button" class="menu-button resume" onclick={() => onresume?.()}>
        이어하기 · {resume.label}
        {resume.round}판째
      </button>
    {/if}
    {#each menu as item (item.id)}
      <button
        type="button"
        class={['menu-button', item.primary && 'primary']}
        onclick={() => (location.hash = item.href)}
      >
        {item.label}
      </button>
    {/each}
  </nav>
  <footer>
    <span data-testid="build-id">빌드 {BUILD_ID}</span>
    <time datetime={BUILD_TIME}>{BUILD_TIME.slice(0, 16).replace('T', ' ')}</time>
    <a href="#/license">라이선스</a>
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

  .menu-button.resume {
    border-color: var(--color-accent);
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

  footer a {
    color: var(--color-text-muted);
  }

  /* 빌드 식별자(커밋 해시 7자 또는 dev)는 빌드마다 글자·길이가 달라 푸터 배치가 흔들린다:
     고정폭 글꼴 + 고정 폭 상자로 스크린샷을 안정시킨다 */
  [data-testid='build-id'] {
    display: inline-block;
    width: 8.5em;
    font-family: ui-monospace, monospace;
    text-align: right;
    white-space: nowrap;
  }
</style>
