<script lang="ts">
  // PA-06 / UX-09: 예약 레일 안의 짧은 한지 콜아웃. 시간 토큰은 durationMs와 동기화된다.
  import { fade } from 'svelte/transition';
  import { durationMs } from '../anim/durations.ts';
  import type { BannerKind } from './banner.ts';

  interface Props {
    kind: BannerKind | 'jokbo';
    text: string;
    /** 누가 했는지 ("상대 쪽!", M3 리뷰 I-4). 없으면 문구만 */
    actor?: string | null;
  }

  let { kind, text, actor = null }: Props = $props();
</script>

<div
  class={['banner', `kind-${kind}`]}
  role="status"
  in:fade={{ duration: durationMs('modal') }}
  out:fade={{ duration: durationMs('modal') }}
>
  {#if actor}<span class="actor">{`${actor} `}</span>{/if}<strong>{text}!</strong>
</div>

<style>
  .banner {
    --mark: var(--skin-brass);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-height: 32px;
    padding: 4px 6px;
    border: 1px solid var(--skin-brass);
    border-radius: 4px;
    background: var(--skin-paper);
    color: var(--color-hud);
    font-size: 16px;
    font-weight: 600;
    line-height: 20px;
    letter-spacing: 0;
    text-align: center;
    pointer-events: none;
  }
  .banner::before {
    content: '';
    flex: none;
    width: 4px;
    height: 18px;
    border-radius: 2px;
    background: var(--mark);
  }
  strong {
    font-weight: 600;
  }
  .actor {
    font-size: 14px;
    font-weight: 400;
    line-height: 16px;
  }
  .kind-go {
    flex-direction: column;
    gap: 0;
    min-width: 72px;
    font-size: 24px;
    line-height: 28px;
    min-height: 52px;
    padding: 4px;
  }
  .kind-go::before {
    display: none;
  }
  .kind-ppeok {
    --mark: var(--color-event-ppeok);
  }
  .kind-jjok {
    --mark: var(--color-event-jjok);
  }
  .kind-ttadak {
    --mark: var(--color-event-ttadak);
  }
  .kind-sseul {
    --mark: var(--color-event-sseul);
  }
  .kind-shake,
  .kind-bomb,
  .kind-chongtong {
    --mark: var(--color-event-shake);
  }
  .kind-nagari,
  .kind-hudang {
    --mark: var(--color-hud-muted);
  }
  :global([data-effect-intensity='subtle']) .banner {
    padding: 4px 8px;
  }
  :global([data-effect-intensity='strong']) .banner {
    padding: 6px 12px;
  }
  :global([data-effect-intensity='strong']) .kind-go {
    padding: 4px;
  }
  :global([data-effect-intensity='off']) .banner {
    --mark: var(--color-hud);
  }
</style>
