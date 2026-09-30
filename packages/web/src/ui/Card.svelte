<script lang="ts">
  // 카드 한 장. <img>로 svgo 최적화 SVG를 그린다(인라인 SVG·filter 금지, intent/plan.md 1.6).
  // 구조: .card(이동: flipMove 대상) > .inner(뒤집기: flipCard 대상) > 앞면·뒷면 <img>
  // 어느 면이 보이는지는 3D 뒷면 감추기(backface-visibility)에 맡기지 않고 불투명도로 정한다(M3 리뷰 S-1):
  // WebKit은 합성 레이어가 없는 preserve-3d 안의 뒷면을 감추지 않아, DOM 순서상 위인 뒷면 <img>가 앞면을 덮었다.
  // 앞면 카드의 뒷면 <img>는 뒤집기 애니메이션(src/anim/flip.ts flipCard) 동안에만 보인다.
  import type { CardId } from '../lib/view-types.ts';
  import {
    CARD_BACK_SRC,
    type CardSize,
    cardIndex,
    cardLabel,
    cardSrc,
    markSide,
  } from './cards.ts';

  interface Props {
    /** null이면 가려진 카드(상대 손패·더미) */
    id?: CardId | null;
    size?: CardSize;
    faceDown?: boolean;
    /** 뒤집기 애니메이션용으로 뒷면도 미리 그린다 */
    flippable?: boolean;
    /** 모서리 표식(월 숫자 + 종류 기호). 기본: s 크기는 숨김 */
    marks?: boolean;
    /** 모서리 표식 위·아래: 두 줄 손패의 윗줄은 아랫줄에 가리지 않게 위쪽 (M3 리뷰 L-4). 왼쪽·오른쪽은 카드마다 정한다 */
    markAt?: 'top' | 'bottom';
    /** 그림 밖 위쪽 표지(부모가 18px 여백을 예약). 획득패 국진 표시는 CapturedPile 제목에서 처리한다 */
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
  const index = $derived(marks && !hidden && id !== null ? cardIndex(id) : null);
  const side = $derived(id === null ? 'left' : markSide(id, markAt));
</script>

<span
  class={['card', `size-${size}`, { hidden, highlight, dimmed }]}
  data-card-id={id}
  role="img"
  aria-label={hidden ? '카드 뒷면' : badge ? `${label}, ${badge}` : label}
>
  <span class="inner">
    {#if id !== null}
      <img class="face front" src={cardSrc(id)} alt="" draggable="false" />
    {/if}
    {#if hidden || flippable}
      <img class="face back" src={CARD_BACK_SRC} alt="" draggable="false" />
    {/if}
  </span>
  {#if index}
    <span
      class={['mark', `mark-${markAt}`, `mark-${side}`]}
      data-kind={index.kind}
      aria-hidden="true"
      >{index.month}{#if index.kind !== 'pi' && index.kind !== 'gwang'}<span
          class={['kind', `kind-${index.kind}`]}
        ></span>{/if}</span
    >
  {/if}
  {#if badge && !hidden}
    <span class="badge" aria-hidden="true">{badge}</span>
  {/if}
</span>

<style>
  /* 크기는 tokens.css --card-w-*·--card-h-*로 통일한다.
     SVG는 <img>가 기기 배율로 래스터화하므로 image-rendering은 기본값(auto)으로 둔다
     (crisp-edges·pixelated는 벡터 가장자리의 안티에일리어싱을 없애 계단이 생긴다). */
  .card {
    --w: var(--card-w-m);
    --h: var(--card-h-m);
    position: relative;
    display: inline-block;
    flex: none;
    width: var(--w);
    height: var(--h);
    /* Commons 테두리의 바깥 모서리 반경 5 / 폭 103.2 */
    border-radius: calc(var(--w) * 0.0485);
    /* UX-12: 그림 바깥의 한지색 실루엣. 붉은 원본 테두리는 덧칠하지 않는다. */
    outline: var(--card-edge-width) solid var(--color-card-edge);
    user-select: none;
    -webkit-user-select: none;
  }

  .size-s {
    --w: var(--card-w-s);
    --h: var(--card-h-s);
  }

  .size-l {
    --w: var(--card-w-l);
    --h: var(--card-h-l);
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
    outline: var(--card-highlight-width) solid var(--color-event-go);
    outline-offset: var(--card-highlight-offset);
  }

  /* 차례가 아닐 때도 다음 수를 계획할 수 있게 너무 흐리지 않게 (spec 6.3, M3 리뷰 L-13) */
  .dimmed {
    opacity: 0.7;
  }

  /* 명시적으로 켠 카드 색인 (손패·바닥은 NF-08 개정으로 marks=false): 카드 모서리에 붙은 먹색 탭. 월 숫자 + 종류 기호.
     12/16px 최소 글자 크기를 유지하며 光 원·띠 글자의 보호 영역과 겹치지 않는다(CardArt.test.ts). 주요 도상이
     있는 쪽은 피한다(cards.ts markSide). 광은 원본의 光 원을 그대로 읽는다. 나머지 기호는 색이 아니라 모양으로 구분한다: 열끗 ◆, 띠 ▮(띠),
     쌍피 ••, 피는 숫자만. */
  .mark {
    --r: calc(var(--w) * 0.0485);
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 0.14em;
    padding: 0 3px;
    background: var(--color-card-tag);
    color: var(--color-on-card-tag);
    font-size: var(--card-tag-font);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: var(--card-tag-height);
    letter-spacing: -0.04em;
    pointer-events: none;
  }

  .mark-top {
    top: calc(0px - var(--card-edge-width));
  }

  .mark-bottom {
    bottom: calc(0px - var(--card-edge-width));
  }

  .mark-left {
    left: 0;
  }

  .mark-right {
    right: 0;
  }

  /* 카드 모서리 쪽은 카드 반경, 그림 쪽은 작은 반경 */
  .mark-top.mark-left {
    border-radius: var(--r) 0 0.3em 0;
  }

  .mark-top.mark-right {
    border-radius: 0 var(--r) 0 0.3em;
  }

  .mark-bottom.mark-left {
    border-radius: 0 0.3em 0 var(--r);
  }

  .mark-bottom.mark-right {
    border-radius: 0.3em 0 var(--r) 0;
  }

  .kind {
    flex: none;
    display: block;
    box-sizing: border-box;
    min-width: var(--card-symbol-stroke);
    min-height: var(--card-symbol-stroke);
  }

  /* 열끗: 마름모 */
  .kind-yeol {
    width: 0.4em;
    height: 0.4em;
    margin: 0 0.06em;
    background: currentColor;
    rotate: 45deg;
  }

  /* 띠: 세로 막대 */
  .kind-tti {
    width: 0.24em;
    height: 0.66em;
    border-radius: 0.04em;
    background: currentColor;
  }

  /* 쌍피: 두 점 */
  .kind-ssangpi {
    width: 0.24em;
    height: 0.24em;
    margin-right: 0.32em;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0.32em 0 0 currentColor;
  }

  .badge {
    position: absolute;
    bottom: calc(100% + var(--card-badge-gap));
    right: 0;
    padding: 0 3px;
    border-radius: 999px;
    background: var(--color-event-go);
    color: var(--color-banner-dark-text);
    font-size: var(--card-tag-font);
    font-weight: 800;
    line-height: var(--card-tag-height);
    white-space: nowrap;
    pointer-events: none;
    z-index: 1;
  }
</style>
