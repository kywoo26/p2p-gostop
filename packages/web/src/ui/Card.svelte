<script lang="ts">
  // 카드 한 장. <img>로 svgo 최적화 SVG를 그린다(인라인 SVG·filter 금지, plan.md 1.6).
  // 구조: .card(이동: flipMove 대상) > .inner(뒤집기: flipCard 대상) > 앞면·뒷면 <img>
  // 어느 면이 보이는지는 3D 뒷면 감추기(backface-visibility)에 맡기지 않고 불투명도로 정한다(M3 리뷰 S-1):
  // WebKit은 합성 레이어가 없는 preserve-3d 안의 뒷면을 감추지 않아, DOM 순서상 위인 뒷면 <img>가 앞면을 덮었다.
  // 앞면 카드의 뒷면 <img>는 뒤집기 애니메이션(src/anim/flip.ts flipCard) 동안에만 보인다.
  import type { CardId } from '../lib/view-types.ts';
  import { CARD_BACK_SRC, type CardSize, cardLabel, cardMark, cardSrc } from './cards.ts';

  interface Props {
    /** null이면 가려진 카드(상대 손패·더미) */
    id?: CardId | null;
    size?: CardSize;
    faceDown?: boolean;
    /** 뒤집기 애니메이션용으로 뒷면도 미리 그린다 */
    flippable?: boolean;
    /** 모서리 표식(월·종류). 기본: s 크기는 숨김 */
    marks?: boolean;
    /** 모서리 표식 위치: 두 줄 손패의 윗줄은 아랫줄에 가리지 않게 위쪽 (M3 리뷰 L-4) */
    markAt?: 'top' | 'bottom';
    /** 오른쪽 위 작은 표지. 예: 쌍피로 세는 국진 "쌍피" (M3 리뷰 S-2) */
    badge?: string | null;
    highlight?: boolean;
    dimmed?: boolean;
  }

  let {
    id = null,
    size = 'm',
    faceDown = false,
    flippable = false,
    marks = size !== 's',
    markAt = 'bottom',
    badge = null,
    highlight = false,
    dimmed = false,
  }: Props = $props();

  const hidden = $derived(id === null || faceDown);
  const label = $derived(id === null ? '카드 뒷면' : cardLabel(id));
</script>

<span
  class={['card', `size-${size}`, { hidden, highlight, dimmed }]}
  data-card-id={id}
  role="img"
  aria-label={hidden ? '카드 뒷면' : label}
>
  <span class="inner">
    {#if id !== null}
      <img class="face front" src={cardSrc(id)} alt="" draggable="false" />
    {/if}
    {#if hidden || flippable}
      <img class="face back" src={CARD_BACK_SRC} alt="" draggable="false" />
    {/if}
  </span>
  {#if marks && !hidden && id !== null}
    <span class={['mark', `mark-${markAt}`]} aria-hidden="true">{cardMark(id)}</span>
  {/if}
  {#if badge && !hidden}
    <span class="badge" aria-hidden="true">{badge}</span>
  {/if}
</span>

<style>
  .card {
    --w: var(--card-w-m);
    position: relative;
    display: inline-block;
    flex: none;
    width: var(--w);
    aspect-ratio: 103.2 / 168.2;
    border-radius: calc(var(--w) * 0.06);
    user-select: none;
    -webkit-user-select: none;
  }

  .size-s {
    --w: var(--card-w-s);
  }

  .size-l {
    --w: var(--card-w-l);
  }

  .inner {
    position: absolute;
    inset: 0;
  }

  .face {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  /* 앞면 카드: 뒷면은 뒤집기 애니메이션만 쓴다. 가려진 카드: 앞면(faceDown)을 감춘다 */
  .back,
  .hidden .front {
    opacity: 0;
  }

  .hidden .back {
    opacity: 1;
  }

  .highlight {
    outline: 3px solid var(--color-event-go);
    outline-offset: 1px;
  }

  /* 차례가 아닐 때도 다음 수를 계획할 수 있게 너무 흐리지 않게 (spec 6.3, M3 리뷰 L-13) */
  .dimmed {
    opacity: 0.7;
  }

  .mark {
    position: absolute;
    left: 6%;
    padding: 0 0.3em;
    border-radius: 0.3em;
    background: oklch(18% 0.01 260 / 0.88);
    color: oklch(98% 0 0);
    font-size: max(9px, calc(var(--w) * 0.19));
    font-weight: 700;
    line-height: 1.35;
    letter-spacing: -0.02em;
    pointer-events: none;
  }

  .mark-bottom {
    bottom: 5%;
  }

  .mark-top {
    top: 5%;
  }

  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    padding: 0 3px;
    border-radius: 999px;
    background: var(--color-event-go);
    color: var(--color-banner-dark-text);
    font-size: 10px;
    font-weight: 800;
    line-height: 1.4;
    white-space: nowrap;
    pointer-events: none;
    z-index: 1;
  }
</style>
