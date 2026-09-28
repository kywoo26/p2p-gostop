<script lang="ts">
  // 카드 한 장. <img>로 svgo 최적화 SVG를 그린다(인라인 SVG·filter 금지, plan.md 1.6).
  // 구조: .card(이동: flipMove 대상) > .inner(뒤집기: flipCard 대상) > 앞면·뒷면 <img>
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
    highlight?: boolean;
    dimmed?: boolean;
  }

  let {
    id = null,
    size = 'm',
    faceDown = false,
    flippable = false,
    marks = size !== 's',
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
    <span class="mark" aria-hidden="true">{cardMark(id)}</span>
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
    transform-style: preserve-3d;
  }

  .hidden .inner {
    transform: rotateY(180deg);
  }

  .face {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .back {
    transform: rotateY(180deg);
  }

  .highlight {
    outline: 3px solid var(--color-event-go);
    outline-offset: 1px;
  }

  .dimmed {
    opacity: 0.45;
  }

  .mark {
    position: absolute;
    left: 6%;
    bottom: 5%;
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
</style>
