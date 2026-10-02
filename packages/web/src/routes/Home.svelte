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
    <div class="hero-art" class:pro-home-art={proEnabled} aria-hidden="true">
      {#each [0, 8, 28] as const as id (id)}<img src={cardSrc(id)} alt="" />{/each}
    </div>
  </header>
  <nav aria-label="메인 메뉴">
    {#if match}
      <button type="button" class="menu-button resume" onclick={() => onmatch?.()}>
        <span class="resume-copy"
          >대전으로 돌아가기 · {match.guest}<small>{match.round}판째</small></span
        >
        <span class="resume-arrow" aria-hidden="true">↗</span>
      </button>
    {/if}
    {#if resume}
      <button type="button" class="menu-button resume" onclick={() => onresume?.()}>
        <span class="resume-copy">이어하기 · {resume.label}<small>{resume.round}판째</small></span>
        <span class="resume-arrow" aria-hidden="true">↗</span>
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
        <svg
          class="menu-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          {#if item.id === 'versus'}
            <path d="M4 9a12 12 0 0 1 16 0M7 12a8 8 0 0 1 10 0M10 15a3 3 0 0 1 4 0" /><circle
              cx="12"
              cy="18"
              r="1"
            />
          {:else if item.id === 'remote'}
            <circle cx="8" cy="7" r="3" /><path
              d="M2 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 14a5 5 0 0 1 5 5v1"
            />
          {:else if item.id === 'solo'}
            <rect x="5" y="3" width="12" height="18" rx="2" /><path
              d="m9 12 2-3 2 3-2 3ZM19 6l2 13"
            />
          {:else if item.id === 'records'}
            <path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h4" />
          {:else if item.id === 'settings'}
            <path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle
              cx="15"
              cy="17"
              r="3"
            />
          {:else}
            <path d="M3 12h4l3-7 4 14 3-7h4" />
          {/if}
        </svg>
        <span class="menu-label">{item.label}</span><span class="menu-arrow" aria-hidden="true"
          >↗</span
        >
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
    position: relative;
    isolation: isolate;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: max(var(--space-6), env(safe-area-inset-top)) var(--space-6)
      max(var(--space-4), env(safe-area-inset-bottom));
    max-width: 32rem;
    margin: 0 auto;
    background:
      radial-gradient(ellipse at 70% 12%, var(--color-surface), transparent 58%), var(--color-bg);
  }
  .hero {
    position: relative;
    display: grid;
    align-content: start;
    min-height: 272px;
    isolation: isolate;
  }
  h1 {
    z-index: 1;
    margin: 0;
    padding-top: var(--space-3);
    font-size: clamp(2.5rem, 9vw, 3.25rem);
    line-height: 1.1;
    letter-spacing: -0.045em;
    font-weight: 800;
  }
  h1::after {
    content: '';
    display: block;
    width: 2rem;
    height: 4px;
    margin-top: var(--space-4);
    border-radius: var(--radius-pill);
    background: var(--color-accent-secondary, var(--color-event-ppeok));
  }
  .hero-art {
    position: absolute;
    inset: 76px -8px 0;
    overflow: hidden;
    border-radius: 50% 50% var(--radius-panel) var(--radius-panel);
    background:
      linear-gradient(180deg, transparent 30%, var(--color-bg)),
      var(--pro-key-art, var(--skin-key-art)) center 44% / cover no-repeat;
    isolation: isolate;
  }
  .hero-art::before {
    content: '';
    position: absolute;
    inset: 10px 16px -36px;
    border: 1px solid var(--color-border);
    border-radius: 50%;
    opacity: 0.4;
  }
  .hero-art img {
    position: absolute;
    width: 76px;
    bottom: 24px;
    left: calc(50% - 88px);
    transform: rotate(-20deg);
    transform-origin: bottom center;
    box-shadow: 0 12px 18px #0006;
  }
  .hero-art img:nth-child(2) {
    left: calc(50% - 38px);
    bottom: 32px;
    transform: rotate(-3deg);
  }
  .hero-art img:nth-child(3) {
    left: calc(50% + 12px);
    transform: rotate(17deg);
  }
  nav {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    column-gap: var(--space-2);
    row-gap: var(--space-3);
  }
  .menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-width: 0;
    min-height: 64px;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-control);
    background: var(--color-surface-soft, var(--color-surface));
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-s);
    text-decoration: none;
    transition: background-color var(--dur-modal) ease-out;
  }
  .menu-icon {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
  }
  .menu-button:not(.primary):not(.resume) {
    flex-direction: column;
    margin-top: var(--space-2);
  }
  .menu-button:not(.primary) .menu-arrow {
    display: none;
  }
  .menu-button.primary,
  .menu-button.resume {
    grid-column: 1 / -1;
    justify-content: start;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    font-size: var(--font-size-l);
    font-weight: 650;
  }
  .menu-label {
    flex: 1;
    min-width: 0;
  }
  .menu-arrow,
  .resume-arrow {
    margin-left: auto;
    font-size: 1.3rem;
  }
  .menu-button.versus {
    min-height: 76px;
    background: var(--color-accent);
    color: var(--color-on-accent);
    box-shadow: var(--shadow-control, 0 6px 18px #0003);
    font-weight: 750;
  }
  .menu-button.primary:not(.versus) {
    background: transparent;
    border-bottom: 1px solid var(--color-divider);
    border-radius: 0;
  }
  .menu-button.resume {
    border-inline-start: 3px solid var(--color-accent);
    background: var(--color-surface-raised);
    font-size: var(--font-size-m);
  }
  .resume-copy {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .resume-copy small {
    display: block;
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
    font-weight: 400;
  }
  .remote-hint {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
    line-height: 1.6;
  }
  .menu-button:active {
    background: var(--color-surface-raised);
  }
  .menu-button.versus:active {
    background: var(--color-accent-pressed);
  }
  .menu-button[aria-disabled='true'] {
    color: var(--color-text-muted);
    background: var(--color-surface-soft);
    box-shadow: none;
    border-bottom-style: dashed;
  }
  .menu-button:focus-visible,
  footer a:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 3px;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: auto;
    padding-top: var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--type-caption-size);
    font-variant-numeric: tabular-nums;
  }
  footer a {
    display: inline-grid;
    place-items: center;
    min-height: 48px;
    min-width: 48px;
    color: var(--color-text-muted);
  }
  [data-testid='build-id'] {
    display: inline-block;
    width: 8.5em;
    font-family: ui-monospace, monospace;
    white-space: nowrap;
  }
  @media (min-width: 768px) {
    .home {
      max-width: 40rem;
      padding-inline: var(--space-8);
    }
    .hero {
      min-height: 320px;
    }
    .hero-art img {
      width: 92px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .menu-button {
      transition: none;
    }
  }
</style>
