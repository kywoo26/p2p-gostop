<script lang="ts">
  // 이벤트 배너 (spec 6.4: 350ms 표시 후 다음 단계와 겹쳐 사라짐, 6.5: 문구·색). 모달·배너는 Svelte transition(plan.md 1.6).
  import { fade, scale } from 'svelte/transition';
  import { durationMs } from '../anim/durations.ts';
  import type { BannerKind } from './banner.ts';

  interface Props {
    kind: BannerKind;
    text: string;
    /** 누가 했는지 ("상대 쪽!", M3 리뷰 I-4). 없으면 문구만 */
    actor?: string | null;
  }

  let { kind, text, actor = null }: Props = $props();
</script>

<div
  class={['banner', `kind-${kind}`]}
  role="status"
  in:scale={{ duration: durationMs('modal'), start: 0.7 }}
  out:fade={{ duration: durationMs('banner') / 2 }}
>
  {#if actor}<span class="actor">{`${actor} `}</span>{/if}{text}!
</div>

<style>
  .banner {
    --bg: var(--color-event-stop);
    --fg: var(--color-banner-dark-text);
    display: inline-block;
    min-width: 7rem;
    padding: var(--space-2) var(--space-6);
    border-radius: var(--radius-m);
    border: 2px solid oklch(100% 0 0 / 0.35);
    background: var(--bg);
    color: var(--fg);
    font-size: 2rem;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: 0.04em;
    text-align: center;
    box-shadow: 0 0.5rem 1.5rem oklch(0% 0 0 / 0.45);
  }

  .actor {
    display: block;
    font-size: var(--font-size-m);
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.1;
    opacity: 0.85;
  }

  /* 밝은 배경(따닥·쓸·고·스톱)은 어두운 글자, 진한 배경(뻑·쪽·흔들기·폭탄)은 흰 글자 (명도 대비 3:1 이상, 큰 글자) */
  .kind-ppeok {
    --bg: var(--color-event-ppeok);
    --fg: var(--color-banner-light-text);
  }

  .kind-jjok {
    --bg: var(--color-event-jjok);
    --fg: var(--color-banner-light-text);
  }

  .kind-ttadak {
    --bg: var(--color-event-ttadak);
  }

  .kind-sseul {
    --bg: var(--color-event-sseul);
  }

  .kind-shake,
  .kind-bomb,
  .kind-chongtong {
    --bg: var(--color-event-shake);
    --fg: var(--color-banner-light-text);
  }

  .kind-go {
    --bg: var(--color-event-go);
  }

  /* 나가리·허당: 판이 그냥 끝남 (중립색) */
  .kind-nagari,
  .kind-hudang {
    --bg: var(--color-surface-raised);
    --fg: var(--color-text);
  }
</style>
