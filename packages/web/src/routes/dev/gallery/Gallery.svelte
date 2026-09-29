<script lang="ts">
  // 개발 갤러리 (plan.md 1.2): 고정 픽스처(packages/web/fixtures)로 화면·상태·토큰을 나열한다.
  // 스냅샷·axe 대상(e2e/gallery.spec.ts). 엔진과 연결하지 않는 정적 화면만 그린다.
  import { ALL_CARD_IDS } from '@p2p-gostop/engine';
  import { DUR } from '../../../anim/durations.ts';
  import { flipCard, flipMove } from '../../../anim/flip.ts';
  import type { BannerKind } from '../../../ui/banner.ts';
  import { fixtures } from '../../../lib/fixtures.ts';
  import {
    layoutFixture,
    layoutExtras,
    feedbackFixture,
    feedbackExtras,
    feedbackGroups,
  } from '../../../lib/layout-fixtures.ts';
  import { normalizeSettings } from '../../../settings/settings.svelte.ts';
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
  const upgradeEvents: Record<string, { kind: BannerKind; text: string }> = {
    'upgrade-ppeok': { kind: 'ppeok', text: '뻑' },
    'upgrade-jjok': { kind: 'jjok', text: '쪽' },
    'upgrade-ttadak': { kind: 'ttadak', text: '따닥' },
    'upgrade-bomb': { kind: 'bomb', text: '폭탄' },
    'upgrade-go': { kind: 'go', text: '3고' },
  };
  // 시각 검토 전용: 실제 카드 헬퍼의 동일 시간표를 중간 프레임에서 정지한다.
  function motionSample(root: HTMLElement) {
    if (page !== 'upgrade-motion') return {};
    let animations: Animation[] = [];
    const raf = requestAnimationFrame(() => {
      const card = root.querySelectorAll<HTMLElement>('.center .card:not(.hidden)')[1]!;
      const inner = card.querySelector<HTMLElement>('.inner')!;
      const target = card.getBoundingClientRect();
      flipCard(inner, { duration: DUR.flip });
      flipMove(
        card,
        new DOMRect(target.x - 60, target.y + 70, target.width, target.height),
        target,
        { duration: DUR.capture },
      );
      // MutationObserver 어댑터 뒤에 원본/장식 모두 같은 진행률로 정지.
      queueMicrotask(() => {
        animations = root.getAnimations({ subtree: true });
        for (const animation of animations) {
          animation.pause();
          animation.currentTime = Number(animation.effect?.getTiming().duration ?? 0) * 0.3;
        }
      });
    });
    return {
      destroy: () => {
        cancelAnimationFrame(raf);
        for (const animation of animations) animation.cancel();
      },
    };
  }

  /** 갤러리 페이지 목록 (e2e/gallery.spec.ts가 같은 이름을 쓴다) */
  const PAGES = [
    ['cards', '카드 앞면·뒷면 (세 크기)'],
    ['card-sizes', '카드 크기·표식 배치'],
    ['board', '게임판: 카드 내기'],
    ['board-target', '게임판: 대상 고르기 모달'],
    ['board-gostop', '게임판: 고/스톱 모달'],
    ['banners', '이벤트 배너'],
    ['settlement', '정산'],
    ['home', '홈'],
    ['host', '방 열기(호스트)'],
    ['guest', '접속(게스트)'],
    ['guest-lobby', '접속(게스트): 대기실'],
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

  /** 크기별 비교에 쓰는 카드: 광 5장, 홍단·청단, 국진, 쌍피 2장, 보너스 3장 (null = 뒷면) */
  const SAMPLE_IDS = [0, 8, 28, 40, 44, 1, 33, 32, 43, 47, 48, 49, 50, null] as const;
  const MONTH_CARD_IDS = ALL_CARD_IDS.filter((id) => id < 48);
  /** 26·44·62px은 앱 토큰 그대로, 88px은 손패 크기 토큰을 덮어써 확대한다 */
  const sampleSizes: { size: CardSize; label: string; style?: string }[] = [
    { size: 's', label: '26px (획득패)' },
    { size: 'm', label: '44px (바닥)' },
    { size: 'l', label: '62px (손패)' },
    { size: 'l', label: '88px (확대)', style: '--card-w-l: 88px; --card-h-l: 143px' },
  ];

  const banners = fixtures.board.events.flatMap((event) => {
    const banner = bannerFor(event);
    return banner ? [{ seq: event.seq, type: event.type, ...banner }] : [];
  });

  // 스냅샷을 결정적으로: 갤러리에 있는 동안 모든 --dur-*를 0으로(E2E 즉시 모드)
  $effect(() => {
    const root = document.documentElement;
    const previous = root.dataset['speed'];
    root.dataset['speed'] =
      new URLSearchParams(location.search).get('visual') === 'upgrade'
        ? (previous ?? 'normal')
        : 'instant';
    return () => {
      if (previous === undefined) delete root.dataset['speed'];
      else root.dataset['speed'] = previous;
    };
  });
</script>

{#if upgradeEvents[page] || page === 'upgrade-motion'}
  <main use:motionSample>
    <h1 class="fixture-title">게임판 시각 검토</h1>
    <Board
      view={feedbackFixture()}
      handVisualGroups={feedbackGroups}
      banner={upgradeEvents[page] ? { ...upgradeEvents[page]!, seat: 0 } : null}
    />
  </main>
{:else if page === 'feedback-play' || page === 'feedback-stop'}
  <main>
    <h1 class="fixture-title">게임판 시각 검토</h1>
    <Board
      view={feedbackFixture(page === 'feedback-stop')}
      handVisualGroups={feedbackGroups}
      extras={feedbackExtras(page === 'feedback-stop')}
    />
  </main>
{:else if page === 'layout-event' || page === 'layout-event-target'}
  <Board
    view={layoutFixture(page.endsWith('target') ? 'target' : 'play')}
    banner={{ kind: 'ppeok', text: '뻑 · 상대가 같은 월 세 장을 남겼습니다', seat: 1 }}
    toast={{ id: 1, text: '피 1장 이동' }}
  />
{:else if page.startsWith('layout-')}
  <Board
    view={layoutFixture(page.split('-')[1] ?? 'target', page.endsWith('-expanded'))}
    extras={layoutExtras(page.split('-')[1] ?? 'target')}
  />
{:else if page === 'board'}
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
  <HostRoom
    hotspot={{ ...fixtures.hostRoom.hotspot, error: null, lanEnabled: true, warning: null }}
    guest={fixtures.hostRoom.guest}
    rules={{
      preset: 'standard',
      perPoint: fixtures.hostRoom.rules.pointValue,
      startBalance: 150_000,
      hostName: '호스트',
      unit: fixtures.hostRoom.rules.unit,
    }}
  />
{:else if page === 'guest' || page === 'guest-lobby'}
  <GuestJoin
    name={fixtures.guestJoin.name}
    joined={page === 'guest-lobby'}
    connection={page === 'guest-lobby' ? 'open' : 'idle'}
    hostPresent={page === 'guest-lobby' ? true : null}
    lobby={page === 'guest-lobby'
      ? {
          names: ['호스트', fixtures.guestJoin.name],
          preset: 'standard',
          pointValue: 100,
          startBalance: 150_000,
          unit: '냥',
        }
      : null}
  />
{:else if page === 'records'}
  <Records view={fixtures.records} />
{:else if page === 'settings'}
  <Settings
    settings={normalizeSettings({
      preset: fixtures.settings.preset,
      perPoint: fixtures.settings.pointValue,
      unit: fixtures.settings.unit,
      speed: fixtures.settings.speed,
      sound: fixtures.settings.sound,
      vibration: fixtures.settings.vibration,
    })}
  />
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
    {:else if page === 'card-sizes'}
      {#each sampleSizes as { size, label, style } (label)}
        <section aria-label={`카드 ${label}`} {style}>
          <h2>{label}</h2>
          <ol class={['cards', 'felt', `cards-${size}`]}>
            {#each SAMPLE_IDS as id (id ?? 'back')}
              <li><Card {id} {size} marks={size !== 's'} /></li>
            {/each}
          </ol>
        </section>
      {/each}
      {#each ['bottom', 'top'] as const as markAt (markAt)}
        <section aria-label={`표식 ${markAt === 'top' ? '위' : '아래'} · 48장`}>
          <h2>표식 {markAt === 'top' ? '위 (두 줄 손패의 윗줄)' : '아래 (기본)'} · 48장</h2>
          <ol class={['cards', 'felt']}>
            {#each MONTH_CARD_IDS as id (id)}
              <li><Card {id} size="m" {markAt} /></li>
            {/each}
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
  .fixture-title {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
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

  .felt {
    padding: var(--space-3);
    border-radius: var(--radius-m);
    background: var(--color-felt);
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
