<script lang="ts">
  import { PRO_CREDITS } from '../pro-assets/credits.ts';
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
  import notices from '../oss-notices.json';
  import fontLicense from '../styles/fonts/GostopSans-OFL.txt?raw';
  import {
    FONT_ATTRIBUTION_URLS,
    FONT_CREDIT,
    FONT_ORIGINAL,
    FONT_MODIFIED,
  } from '../fonts/attribution.ts';

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

  <section aria-labelledby="lic-font">
    <h2 id="lic-font">글꼴</h2>
    <p>{FONT_ORIGINAL} · {FONT_MODIFIED}</p>
    <p lang="en">{FONT_CREDIT}</p>
    <p>
      SIL Open Font License 1.1. UI 문자 서브셋·WOFF2 변환·힌팅 제거·수정본 이름 변경. 가변 가중치와
      등폭 숫자 기능 유지.
    </p>
    {#each FONT_ATTRIBUTION_URLS as url (url)}<code>{url}</code>{/each}
    <details>
      <summary>폰트 라이선스 원문</summary>
      <pre lang="en">{fontLicense}</pre>
    </details>
  </section>

  <section aria-labelledby="lic-code">
    <h2 id="lic-code">앱 코드</h2>
    <p>{CODE_LICENSE.scope} 카드 그림의 동일조건(ShareAlike)은 그림과 그 변경본에만 적용됩니다.</p>
  </section>
  <section aria-labelledby="lic-dependencies">
    <h2 id="lic-dependencies">배포 의존성</h2>
    <p>
      웹과 Android 앱에 포함되는 공개 소스 의존성입니다. 목록과 라이선스 원문은 앱에 함께 들어
      있습니다.
    </p>
    <a class="button" href={`${import.meta.env.BASE_URL}oss/NOTICE.txt`}>전체 공개 소스 고지 읽기</a
    >
    <details>
      <summary>웹 의존성 ({notices.web.length})</summary>
      <ul>
        {#each notices.web as item (item.name)}<li>
            {item.name}
            {item.version} · {item.license}
          </li>{/each}
      </ul>
    </details>
    <details>
      <summary>Android 의존성 ({notices.android.length})</summary>
      <ul>
        {#each notices.android as item (item.name)}<li>
            {item.name}
            {item.version} · {item.license}
          </li>{/each}
      </ul>
    </details>
  </section>
  <section aria-labelledby="lic-pro">
    <h2 id="lic-pro">게임 자산</h2>
    {#each PRO_CREDITS as item (item.source)}<p>{item.author} · {item.license}</p>
      <code>{item.source}</code><code>{item.licenseUrl}</code>
      <p>{item.changes}</p>{/each}
    <a class="button" href="/pro/NOTICE.md">파일별 출처 목록</a>
  </section>
</Screen>

<style>
  summary {
    min-height: var(--touch-min);
    padding-block: var(--space-3);
    cursor: pointer;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: inherit;
    font-size: var(--font-size-s);
  }
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
