<script lang="ts">
  // 개발 갤러리 (plan.md 1.2): 고정 픽스처(packages/web/fixtures)로 화면·상태·토큰을 나열한다.
  // 스냅샷·axe 대상(e2e/gallery.spec.ts). 엔진과 연결하지 않는 정적 화면만 그린다.
  import { ALL_CARD_IDS } from '@p2p-gostop/engine';
  import { DUR } from '../../../anim/durations.ts';
  import { fixtures } from '../../../lib/fixtures.ts';
  import { bannerFor } from '../../../ui/banner.ts';
  import Board from '../../../ui/Board.svelte';
  import Card from '../../../ui/Card.svelte';
  import type { CardSize } from '../../../ui/cards.ts';
  import EventBanner from '../../../ui/EventBanner.svelte';
  import Diagnostics from '../../Diagnostics.svelte';
  import GuestJoin from '../../GuestJoin.svelte';
  import Home from '../../Home.svelte';
  import HostRoom from '../../HostRoom.svelte';
  import Records from '../../Records.svelte';
  import Settings from '../../Settings.svelte';
  import Settlement from '../../Settlement.svelte';

  interface Props {
    /** '#/dev/gallery/<page>'의 <page>. 빈 문자열이면 목차 */
    page: string;
  }

  let { page }: Props = $props();

  /** 갤러리 페이지 목록 (e2e/gallery.spec.ts가 같은 이름을 쓴다) */
  const PAGES = [
    ['cards', '카드 앞면·뒷면 (세 크기)'],
    ['board', '게임판: 카드 내기'],
    ['board-target', '게임판: 대상 고르기 모달'],
    ['board-gostop', '게임판: 고/스톱 모달'],
    ['banners', '이벤트 배너'],
    ['settlement', '정산'],
    ['home', '홈'],
    ['host', '방 열기(호스트)'],
    ['guest', '접속(게스트)'],
    ['records', '기록'],
    ['settings', '설정'],
    ['diagnostics', '진단·로그'],
  ] as const;

  const colorTokens = [
    'bg',
    'surface',
    'surface-raised',
    'border',
    'text',
    'text-muted',
    'accent',
    'felt',
    'event-ppeok',
    'event-jjok',
    'event-ttadak',
    'event-sseul',
    'event-shake',
    'event-go',
    'event-stop',
  ];

  const durations = [
    ['hand-to-floor', '손패 → 바닥', DUR.handToFloor],
    ['match-highlight', '매칭 강조', DUR.matchHighlight],
    ['flip', '더미 뒤집기', DUR.flip],
    ['capture', '획득 이동', DUR.capture],
    ['capture-stagger', '획득 스태거', DUR.captureStagger],
    ['steal', '피 뺏기', DUR.steal],
    ['banner', '이벤트 배너', DUR.banner],
    ['modal', '고/스톱 모달', DUR.modal],
    ['deal-total', '분배 총합', DUR.dealTotal],
    ['turn-budget', '턴 총합 상한', DUR.turnBudget],
  ] as const;

  const sizes: { size: CardSize; label: string }[] = [
    { size: 's', label: '작게 (획득패)' },
    { size: 'm', label: '보통 (바닥)' },
    { size: 'l', label: '크게 (손패)' },
  ];

  const banners = fixtures.board.events.flatMap((event) => {
    const banner = bannerFor(event);
    return banner ? [{ seq: event.seq, type: event.type, ...banner }] : [];
  });

  // 스냅샷을 결정적으로: 갤러리에 있는 동안 모든 --dur-*를 0으로(E2E 즉시 모드)
  $effect(() => {
    const root = document.documentElement;
    const previous = root.dataset['speed'];
    root.dataset['speed'] = 'instant';
    return () => {
      if (previous === undefined) delete root.dataset['speed'];
      else root.dataset['speed'] = previous;
    };
  });
</script>

{#if page === 'board'}
  <Board view={fixtures.board.states.play} />
{:else if page === 'board-target'}
  <Board view={fixtures.board.states.target} />
{:else if page === 'board-gostop'}
  <Board view={fixtures.board.states.goStop} />
{:else if page === 'settlement'}
  <Settlement view={fixtures.settlement} />
{:else if page === 'home'}
  <Home />
{:else if page === 'host'}
  <HostRoom view={fixtures.hostRoom} />
{:else if page === 'guest'}
  <GuestJoin view={fixtures.guestJoin} />
{:else if page === 'records'}
  <Records view={fixtures.records} />
{:else if page === 'settings'}
  <Settings view={fixtures.settings} />
{:else if page === 'diagnostics'}
  <Diagnostics view={fixtures.diagnostics} />
{:else}
  <main class="gallery">
    <h1>개발 갤러리</h1>
    <p><a href="#/">홈으로</a> · <a href="#/dev/gallery">목차</a></p>

    {#if page === 'cards'}
      {#each sizes as { size, label } (size)}
        <section aria-labelledby={`g-cards-${size}`}>
          <h2 id={`g-cards-${size}`}>카드 {label} · {ALL_CARD_IDS.length}장 + 뒷면</h2>
          <ol class={['cards', `cards-${size}`]}>
            {#each ALL_CARD_IDS as id (id)}
              <li><Card {id} {size} /><span class="card-id">#{id}</span></li>
            {/each}
            <li><Card id={null} {size} /><span class="card-id">뒷면</span></li>
          </ol>
        </section>
      {/each}
    {:else if page === 'banners'}
      <section aria-labelledby="g-banners">
        <h2 id="g-banners">이벤트 배너 (spec 6.5)</h2>
        <ul class="banners">
          {#each banners as banner (banner.seq)}
            <li>
              <EventBanner kind={banner.kind} text={banner.text} />
              <code>{banner.type}</code>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      {#if page !== ''}
        <p role="alert">없는 갤러리 페이지: {page}</p>
      {/if}
      <nav aria-labelledby="g-pages">
        <h2 id="g-pages">페이지</h2>
        <ul class="links">
          {#each PAGES as [id, label] (id)}
            <li><a href={`#/dev/gallery/${id}`}>{label}</a></li>
          {/each}
          <li><a href="#/license">라이선스</a></li>
        </ul>
      </nav>

      <section aria-labelledby="g-colors">
        <h2 id="g-colors">색상 토큰 (OKLCH)</h2>
        <ul class="swatches">
          {#each colorTokens as token (token)}
            <li>
              <span class="swatch" style:background={`var(--color-${token})`}></span>
              <code>--color-{token}</code>
            </li>
          {/each}
        </ul>
      </section>

      <section aria-labelledby="g-durations">
        <h2 id="g-durations">애니메이션 시간 (--dur-*, ×--dur-scale)</h2>
        <table>
          <thead>
            <tr><th scope="col">토큰</th><th scope="col">구간</th><th scope="col">빠름</th></tr>
          </thead>
          <tbody>
            {#each durations as [token, label, ms] (token)}
              <tr><td><code>--dur-{token}</code></td><td>{label}</td><td>{ms}ms</td></tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  </main>
{/if}

<style>
  .gallery {
    display: grid;
    gap: var(--space-6);
    padding: var(--space-4);
  }

  h1,
  h2 {
    margin: 0 0 var(--space-3);
  }

  p {
    margin: 0;
  }

  a {
    color: var(--color-accent);
  }

  .links {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .links a {
    display: flex;
    align-items: center;
    min-height: var(--touch-min);
  }

  .swatches {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--space-2);
  }

  .swatches li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .swatch {
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-s);
    border: 1px solid var(--color-border);
  }

  table {
    border-collapse: collapse;
  }

  th,
  td {
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    text-align: left;
  }

  .cards {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .cards li {
    display: grid;
    justify-items: center;
    gap: 2px;
  }

  .card-id {
    color: var(--color-text-muted);
    font-size: 0.6875rem;
  }

  .banners {
    list-style: none;
    padding: var(--space-4);
    margin: 0;
    display: grid;
    gap: var(--space-3);
    justify-items: center;
    border-radius: var(--radius-m);
    background: var(--color-felt);
  }

  .banners li {
    display: grid;
    justify-items: center;
    gap: var(--space-1);
  }

  .banners code {
    font-size: var(--font-size-s);
  }
</style>
