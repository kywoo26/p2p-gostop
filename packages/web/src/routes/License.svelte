<script lang="ts">
  // 라이선스·저작자 표시 (spec 6.6·NF-07, code-refs.md 4.2). 설정 > 라이선스에서 연다.
  // 외부 주소는 글자로만 보여 준다(링크를 걸지 않음: 오프라인 앱, spec NF-01). 파일별 출처는 번들 안의 ATTRIBUTION.md.
  import {
    CARD_ART_AUTHORS,
    CARD_ART_CHANGES,
    CARD_ART_CREDIT,
    CARD_ART_LICENSE,
    CARD_ART_SOURCE,
    CODE_LICENSE,
    ORIGINAL_ART_LICENSE,
  } from '../cards/attribution.ts';
  import Screen from '../ui/Screen.svelte';

  const attributionHref = `${import.meta.env.BASE_URL}cards/ATTRIBUTION.md`;
</script>

<Screen title="라이선스">
  <section aria-labelledby="lic-cards">
    <h2 id="lic-cards">화투 그림 (0~47번 카드)</h2>
    <p class="credit" lang="en">{CARD_ART_CREDIT}</p>
    <ul class="authors">
      {#each CARD_ART_AUTHORS as author (author.name)}
        <li><strong>{author.name}</strong> — {author.role}</li>
      {/each}
    </ul>
    <dl class="pairs">
      <dt>라이선스</dt>
      <dd>
        {CARD_ART_LICENSE.title} ({CARD_ART_LICENSE.name})<br /><code>{CARD_ART_LICENSE.url}</code>
      </dd>
      <dt>원본</dt>
      <dd>{CARD_ART_SOURCE.name}<br /><code>{CARD_ART_SOURCE.url}</code></dd>
      <dt>변경</dt>
      <dd>{CARD_ART_CHANGES}</dd>
    </dl>
    <a class="button" href={attributionHref}>파일별 출처 목록 (ATTRIBUTION.md)</a>
  </section>

  <section aria-labelledby="lic-original">
    <h2 id="lic-original">보너스 카드(48~50번)·카드 뒷면</h2>
    <p>{ORIGINAL_ART_LICENSE.scope}</p>
    <p>
      {ORIGINAL_ART_LICENSE.title} ({ORIGINAL_ART_LICENSE.name})<br /><code
        >{ORIGINAL_ART_LICENSE.url}</code
      >
    </p>
  </section>

  <section aria-labelledby="lic-code">
    <h2 id="lic-code">앱 코드</h2>
    <p>{CODE_LICENSE.scope} 카드 그림의 동일조건(ShareAlike)은 그림과 그 변경본에만 적용됩니다.</p>
  </section>
</Screen>

<style>
  p {
    margin: 0;
  }

  .credit {
    font-weight: 600;
  }

  .authors {
    margin: 0;
    padding-left: 1.2rem;
  }

  .pairs {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2) var(--space-3);
    margin: 0;
  }

  .pairs dt {
    color: var(--color-text-muted);
  }

  .pairs dd {
    margin: 0;
  }

  code {
    font-size: var(--font-size-s);
    overflow-wrap: anywhere;
    color: var(--color-text-muted);
  }
</style>
