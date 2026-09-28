<script lang="ts">
  // 개발 갤러리 (plan.md 1.2): 고정 픽스처로 화면·상태·토큰을 나열한다. 스냅샷·axe 대상.
  import { CARDS, type Card } from '@p2p-gostop/engine';
  import Home from '../../Home.svelte';

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

  // spec 6.4 애니메이션 예산 ("빠름" 기준)
  const durations = [
    ['hand-to-floor', '손패 → 바닥', 120],
    ['match-highlight', '매칭 강조', 80],
    ['flip', '더미 뒤집기', 140],
    ['capture', '획득 이동', 160],
    ['capture-stagger', '획득 스태거', 30],
    ['steal', '피 뺏기', 200],
    ['banner', '이벤트 배너', 350],
    ['modal', '고/스톱 모달', 150],
    ['deal-total', '분배 총합', 1200],
    ['turn-budget', '턴 총합 상한', 700],
  ] as const;

  const kindLabel: Record<Card['kind'], string> = {
    gwang: '광',
    yeol: '열끗',
    tti: '띠',
    pi: '피',
    bonus: '보너스',
  };
</script>

<div class="gallery">
  <h1>개발 갤러리</h1>
  <p><a href="#/">홈으로</a></p>

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
      <thead
        ><tr><th scope="col">토큰</th><th scope="col">구간</th><th scope="col">빠름</th></tr></thead
      >
      <tbody>
        {#each durations as [token, label, ms] (token)}
          <tr><td><code>--dur-{token}</code></td><td>{label}</td><td>{ms}ms</td></tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section aria-labelledby="g-cards">
    <h2 id="g-cards">카드 카탈로그 ({CARDS.length}장)</h2>
    <ol class="cards">
      {#each CARDS as card (card.id)}
        <li class={['card', `kind-${card.kind}`]}>
          <span class="card-id">#{card.id}</span>
          <span>{card.month === null ? '★' : `${card.month}월`}</span>
          <span>{kindLabel[card.kind]}{card.piValue > 1 ? ` ${card.piValue}` : ''}</span>
        </li>
      {/each}
    </ol>
  </section>

  <section aria-labelledby="g-home">
    <h2 id="g-home">화면: 홈</h2>
    <div class="frame">
      <Home />
    </div>
  </section>
</div>

<style>
  .gallery {
    padding: var(--space-4);
    display: grid;
    gap: var(--space-6);
  }

  h1,
  h2 {
    margin: 0 0 var(--space-3);
  }

  a {
    color: var(--color-accent);
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
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr));
    gap: var(--space-2);
  }

  .card {
    display: grid;
    gap: 2px;
    padding: var(--space-2);
    border-radius: var(--radius-s);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    font-size: var(--font-size-s);
  }

  .card-id {
    color: var(--color-text-muted);
  }

  .kind-gwang {
    border-color: var(--color-event-go);
  }

  .kind-bonus {
    border-color: var(--color-event-shake);
  }

  .frame {
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-m);
    max-width: 24rem;
  }
</style>
