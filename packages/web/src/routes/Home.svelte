<script lang="ts">
  import { resolve } from '$app/paths';
  import Scene from '../pro-assets/Scene.svelte';
  import { proEnabled } from '../pro-assets/runtime.ts';
  import { cardSrc } from '../ui/cards.ts';
  // 홈 화면 (FR-RP-01): 핫스팟·원격 대전 / 혼자 연습 / 기록 / 설정 / 진단. 진행 중인 대전·연습이 있으면 맨 위에 이어하기.
  import { BUILD_ID, BUILD_TIME } from '../lib/build-info.ts';
  import { loadRemoteHostSettings } from '../net/index.ts';

  interface Props {
    /** 이어할 수 있는 혼자 연습 세션 (MN-05). 있으면 맨 위에 "이어하기" */
    resume?: { readonly round: number; readonly label: string } | null;
    onresume?: (() => void) | undefined;
    /** 진행 중인 친구와 대전 (호스트). 있으면 맨 위에 "대전으로 돌아가기" */
    match?: { readonly round: number; readonly guest: string } | null;
    onmatch?: (() => void) | undefined;
    remoteReady?: boolean | undefined;
    activeMode?: 'hotspot' | 'remote' | undefined;
  }

  let { resume = null, onresume, match = null, onmatch, remoteReady, activeMode }: Props = $props();

  const configured = $derived(
    remoteReady ??
      (typeof localStorage !== 'undefined' && loadRemoteHostSettings(localStorage) !== null),
  );

  const menu = [
    { id: 'versus', label: '핫스팟 대전', primary: true, href: '/versus' },
    { id: 'remote', label: '친구와 원격 대전', primary: true, href: '/remote' },
    { id: 'solo', label: '혼자 연습', primary: true, href: '/solo' },
    { id: 'records', label: '기록', primary: false, href: '/records' },
    { id: 'settings', label: '설정', primary: false, href: '/settings' },
    { id: 'diagnostics', label: '진단', primary: false, href: '/diagnostics' },
  ] as const;
</script>

<main class="home">
  <Scene scene="home" />
  <header class="hero">
    <h1>맞고 P2P</h1>
    {#if proEnabled}<div class="pro-home-art" aria-hidden="true">
        {#each [0, 8, 28] as const as id (id)}<img src={cardSrc(id)} alt="" />{/each}
      </div>{:else}<div class="hero-art" aria-hidden="true">
        <img src="cards/0.svg" alt="" /><img src="cards/28.svg" alt="" />
      </div>{/if}
  </header>
  <nav aria-label="메인 메뉴">
    {#if match}
      <button type="button" class="menu-button resume" onclick={() => onmatch?.()}>
        대전으로 돌아가기 · {match.guest}
        {match.round}판째
      </button>
    {/if}
    {#if resume}
      <button type="button" class="menu-button resume" onclick={() => onresume?.()}>
        이어하기 · {resume.label}
        {resume.round}판째
      </button>
    {/if}
    {#each menu as item (item.id)}
      {@const unavailable =
        (item.id === 'remote' && activeMode === 'hotspot') ||
        (item.id === 'versus' && activeMode === 'remote')}
      <a
        class={['menu-button', item.primary && 'primary', item.id === 'versus' && 'versus']}
        href={unavailable
          ? undefined
          : resolve(item.id === 'remote' && !configured ? '/settings' : item.href)}
        aria-disabled={unavailable || undefined}
        role={unavailable ? 'link' : undefined}
        tabindex={unavailable ? 0 : undefined}
        data-sveltekit-preload-code={unavailable ? 'false' : 'tap'}
        data-sveltekit-preload-data="false"
      >
        {item.label}<span aria-hidden="true">↗</span>
      </a>
    {/each}
    {#if !configured}<p class="remote-hint">
        원격 대전은 설정에서 중계 주소와 생성 자격을 먼저 저장하세요.
      </p>{/if}
    {#if activeMode}<p class="remote-hint">
        진행 중인 대전을 끝내면 다른 모드를 선택할 수 있습니다.
      </p>{/if}
  </nav>
  <footer>
    <span data-testid="build-id">빌드 {BUILD_ID}</span>
    <time datetime={BUILD_TIME}>{BUILD_TIME.slice(0, 16).replace('T', ' ')}</time>
    <a href={resolve('/license')}>라이선스</a>
  </footer>
</main>

<style>
  .home {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-6);
    padding: max(32px, env(safe-area-inset-top)) 24px max(20px, env(safe-area-inset-bottom));
    max-width: 28rem;
    margin: 0 auto;
  }

  .hero {
    position: relative;
    min-height: 250px;
  }
  .hero-art {
    position: absolute;
    right: 4px;
    bottom: 10px;
    width: 216px;
    height: 216px;
    border: 1px solid var(--color-divider);
    border-radius: 50%;
  }
  .hero-art::before {
    content: '';
    position: absolute;
    inset: 16px;
    border: 1px solid var(--color-divider);
    border-radius: 50%;
  }
  .hero-art img {
    position: absolute;
    width: 74px;
    bottom: 30px;
    left: 36px;
    transform: rotate(-18deg);
    box-shadow: 0 12px 20px #0005;
  }
  .hero-art img + img {
    left: 98px;
    bottom: 26px;
    transform: rotate(14deg);
  }
  h1 {
    margin: 0;
    text-align: left;
    padding-top: 12px;
    font-size: var(--type-home-size);
    line-height: var(--type-home-line);
    letter-spacing: 0.02em;
  }

  nav {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
  }
  .remote-hint {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .menu-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: var(--touch-min);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    text-decoration: none;
    font-size: 14px;
    transition: background-color var(--dur-modal) ease-out;
  }

  .menu-button.primary,
  .menu-button.resume {
    grid-column: 1 / -1;
    min-height: 64px;
    font-size: 18px;
  }
  .menu-button.primary:not(.versus) {
    background: var(--color-surface);
    color: var(--color-text);
    border-color: var(--color-border);
  }
  .menu-button:not(.primary):not(.resume) span {
    display: none;
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
  .menu-button[aria-disabled='true'] {
    opacity: 0.5;
  }

  .menu-button.primary:active {
    background: var(--color-accent-pressed);
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
    font-variant-numeric: tabular-nums;
  }

  footer a {
    display: inline-grid;
    place-items: center;
    min-height: 48px;
    min-width: 48px;
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
