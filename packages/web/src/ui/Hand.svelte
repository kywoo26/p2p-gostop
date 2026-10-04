<script lang="ts">
  // 내 손패 (spec 6.2: 최대 10장, 겹침 스크롤 없음 / 6.3: 탭 한 번으로 내기, 내 차례가 아니면 흐리게,
  // 누르고 있으면 먹게 될 바닥 카드 강조 / FR-12: 낼 수 있는 카드와 먹을 수 있는 카드 예고).
  // 6장까지 한 줄, 7~10장은 비겹침 두 줄. 주 버튼으로 같은 카드를 누르고 놓을 때 한 번 실행한다(UX-06).
  // 일반 카드의 길게 누르기(400ms 이상)는 미리보기만 닫는다. 폭탄 가능 카드는 한 장 내기다.
  // 탭 한 번 = 누르기 시작할 때 이미 낼 수 있던 카드만 낸다(M3 리뷰 I-3): 재생 중에 판을 눌러 애니메이션을 건너뛰면
  // 손가락을 떼기 전에 재생이 끝나 버튼이 풀릴 수 있다. 그 click은 건너뛰기용이었으므로 카드를 내지 않는다.
  import type { CardId } from '../lib/view-types.ts';
  import Card from './Card.svelte';
  import { cardLabel, sortHand } from './cards.ts';
  import { handRows } from './hand-layout.ts';
  import { getCard } from '@p2p-gostop/engine';
  import { HAND_CUES, type HandVisualGroup } from './hand-visual.ts';

  interface Props {
    compact?: boolean;
    cards: readonly CardId[];
    /** 지금 낼 수 있는 카드 */
    playable: readonly CardId[];
    /** 바닥에 같은 월이 있어 먹을 수 있는 카드 (FR-12 예고 표식) */
    matchable?: readonly CardId[];
    /** 시각 슬롯. 확정 획득 판정은 공개 보조 API가 전달하며 UI가 숨은 패를 읽지 않는다. */
    visualGroups?: readonly HandVisualGroup[];
    cuesEnabled?: boolean;
    /** 선택한 행동 묶음 ID. 2~4장 구성은 카드가 아닌 공개 계산 결과가 정한다. */
    selectedGroup?: string | null;
    /** 권위 뷰가 바뀌면 진행 중인 포인터를 무효화한다. */
    revision?: object;
    /** 카드를 냈다. at = 탭 시각(performance.now 기준, spec AC-06 계측) */
    onplay?: ((id: CardId, at: number, single: boolean) => void) | undefined;
    /** 합법 폭탄 월의 카드만 길게 누르면 한 장 내기 */
    bombCards?: readonly CardId[];
    /** 누르고 있는 카드 (떼면 null) */
    onpreview?: ((id: CardId | null) => void) | undefined;
    oninvalidate?: (() => void) | undefined;
  }

  let {
    compact = false,
    cards,
    playable,
    matchable = [],
    visualGroups = [],
    cuesEnabled = true,
    selectedGroup = null,
    revision,
    onplay,
    bombCards = [],
    onpreview,
    oninvalidate,
  }: Props = $props();

  const LONG_PRESS_MS = 400;
  const rows = $derived(compact && cards.length <= 6 ? [sortHand(cards)] : handRows(cards));
  const myTurn = $derived(playable.length > 0);
  let selectedCard = $state<CardId | null>(null);

  /** 누르기 시작한 카드·시각, 그때 낼 수 있었는지 (반응형일 필요 없음) */
  let pressed: {
    id: CardId;
    pointerId: number;
    at: number;
    armed: boolean;
  } | null = null;
  let previousRevision: object | undefined;
  let handRoot: HTMLElement;

  function moving(): boolean {
    return handRoot.querySelector('.card[style*="will-change"]') !== null;
  }

  /** 부채꼴: 가운데에서 멀수록 기울이고 조금 내린다 */
  function fan(index: number, count: number): string {
    const offset = index - (count - 1) / 2;
    return `rotate(${offset * 3}deg) translateY(${offset * offset * 1.5}px)`;
  }

  // 낼 수 있는 카드가 없어지면(재생 중·상대 차례) 진행 중이던 누르기는 무효다: 재생이 끝난 뒤 오는 click은
  // 새 누르기가 있어야 카드를 낸다(비활성 버튼에 pointerdown이 오지 않는 브라우저에서도 안전하게).
  $effect(() => {
    if (playable.length === 0) {
      pressed = null;
      selectedCard = null;
    }
  });
  $effect(() => {
    // 손패 보충·재정렬·뷰 교체 시 이전 포인터의 후속 click을 무효화한다.
    const currentCards = cards;
    const currentPlayable = playable;
    const currentRevision = revision;
    if (previousRevision !== undefined && currentRevision !== previousRevision) pressed = null;
    previousRevision = currentRevision;
    if (pressed && (!currentCards.includes(pressed.id) || !currentPlayable.includes(pressed.id))) {
      pressed = null;
    }
    return () => {
      pressed = null;
      oninvalidate?.();
    };
  });
  $effect(() => {
    if (selectedCard !== null && !cards.includes(selectedCard)) selectedCard = null;
  });

  /**
   * 손패 안의 모든 pointerdown(비활성 버튼 포함)을 캡처 단계에서 받는다: 비활성 버튼의 이벤트는 위임 핸들러가
   * 건너뛸 수 있으므로 버튼이 아니라 손패 영역에서 누른 카드를 기록한다.
   */
  function press(event: PointerEvent) {
    if (event.button !== 0) {
      event.preventDefault();
      abandon();
      return;
    }
    if (moving()) {
      pressed = null;
      return;
    }
    const slot =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-slot]') : null;
    const id = slot === null ? null : Number(slot.dataset['slot']);
    if (id === null) {
      pressed = null;
      selectedCard = null;
      onpreview?.(null);
      return;
    }
    const armed = playable.includes(id);
    pressed = { id, pointerId: event.pointerId, at: performance.now(), armed };
    if (armed) {
      selectedCard = id;
      if (event.isTrusted) handRoot.setPointerCapture(event.pointerId);
      onpreview?.(id);
    }
  }

  function release() {
    onpreview?.(null);
  }

  function insidePressedCard(event: PointerEvent, id: CardId): boolean {
    const slot = handRoot.querySelector<HTMLElement>(`[data-slot="${id}"]`);
    if (!slot) return false;
    const r = slot.getBoundingClientRect();
    const hand = handRoot.getBoundingClientRect();
    return (
      event.clientX >= Math.max(r.left, hand.left) &&
      event.clientX < Math.min(r.right, hand.right) &&
      event.clientY >= Math.max(r.top, hand.top) &&
      event.clientY < Math.min(r.bottom, hand.bottom)
    );
  }

  function move(event: PointerEvent) {
    if (!pressed?.armed || pressed.pointerId !== event.pointerId) return;
    selectedCard = insidePressedCard(event, pressed.id) ? pressed.id : null;
    onpreview?.(selectedCard);
  }

  function lift(event: PointerEvent) {
    const current = pressed;
    if (current?.pointerId !== event.pointerId) return;
    pressed = null;
    const id = selectedCard;
    selectedCard = null;
    release();
    if (handRoot.hasPointerCapture(event.pointerId))
      handRoot.releasePointerCapture(event.pointerId);
    if (
      event.button !== 0 ||
      !current.armed ||
      id !== current.id ||
      !insidePressedCard(event, current.id) ||
      !playable.includes(current.id) ||
      moving()
    )
      return;
    const held = performance.now() - current.at >= LONG_PRESS_MS;
    if (held && !bombCards.includes(id)) return;
    onplay?.(id, current.at, held);
  }

  function abandon() {
    const pointerId = pressed?.pointerId;
    pressed = null;
    if (pointerId !== undefined && handRoot.hasPointerCapture(pointerId))
      handRoot.releasePointerCapture(pointerId);
    selectedCard = null;
    release();
  }

  function activate(id: CardId, event: MouseEvent) {
    // pointerup에서 이미 실행한다. 키보드·보조기기의 detail 0 click만 별도로 실행한다.
    if (event.button !== 0 || event.detail !== 0 || moving()) return;
    if (playable.includes(id)) onplay?.(id, performance.now(), false);
  }

  function keydown(id: CardId, event: KeyboardEvent) {
    if (!event.shiftKey || event.key !== 'Enter' || !bombCards.includes(id)) return;
    event.preventDefault();
    if (playable.includes(id) && !moving()) onplay?.(id, performance.now(), true);
  }
</script>

<div
  bind:this={handRoot}
  class={['hand', { waiting: !myTurn, compact }]}
  role="group"
  aria-label="내 손패"
  onpointerdowncapture={press}
  onpointermove={move}
  onpointerup={lift}
  onpointercancel={abandon}
  data-count={cards.length}
  style:--fan-count={cards.length}
>
  {#each rows as row, r (r)}
    <div class="row" style:--fan-count={row.length}>
      {#each row as id, i (id)}
        {@const canPlay = playable.includes(id)}
        {@const canMatch = cuesEnabled && canPlay && matchable.includes(id)}
        {@const group = cuesEnabled
          ? visualGroups.find(
              (group) =>
                group.kind !== 'secured' && group.kind !== 'heldPair' && group.cards.includes(id),
            )
          : undefined}
        {@const secured =
          cuesEnabled &&
          visualGroups.some((group) => group.kind === 'secured' && group.cards.includes(id))}
        {@const heldPair =
          cuesEnabled &&
          canPlay &&
          visualGroups.some((group) => group.kind === 'heldPair' && group.cards.includes(id))}
        {@const month = getCard(id).month}
        {@const monthGroup =
          cuesEnabled &&
          month !== null &&
          cards.filter((card) => getCard(card).month === month).length > 1}
        <button
          type="button"
          class={[
            'slot',
            {
              playable: canPlay,
              selected: compact && selectedCard === id,
              'group-selected': group && group.id === selectedGroup,
            },
          ]}
          style:transform={compact ? 'none' : fan(i, row.length)}
          style:--fan-progress={i / Math.max(1, row.length - 1)}
          style:--fan-index={i + 1}
          aria-label={[
            cardLabel(id),
            heldPair
              ? HAND_CUES.heldPair.label
              : secured
                ? HAND_CUES.secured.label
                : canMatch
                  ? HAND_CUES.matchable.label
                  : null,
            group ? HAND_CUES[group.kind].label : null,
            bombCards.includes(id) ? '폭탄 내기, 한 장만 내기: 길게 누르거나 Shift+Enter' : null,
            '내기',
          ]
            .filter(Boolean)
            .join(', ')}
          aria-keyshortcuts={bombCards.includes(id) ? 'Shift+Enter' : undefined}
          disabled={!canPlay}
          data-slot={id}
          data-hand-group={monthGroup ? month : undefined}
          data-hand-cue={cuesEnabled
            ? secured || heldPair
              ? 'secured'
              : canMatch
                ? 'matchable'
                : undefined
            : undefined}
          data-hand-action={group?.kind}
          onkeydown={(e) => keydown(id, e)}
          onfocus={() => {
            selectedCard = id;
            onpreview?.(id);
          }}
          onblur={() => {
            if (!pressed) selectedCard = null;
            release();
          }}
          oncontextmenu={(e) => e.preventDefault()}
          onclick={(e) => activate(id, e)}
        >
          <span class="art-window">
            <Card {id} size="l" dimmed={!canPlay} flippable marks={false} />
          </span>
        </button>
      {/each}
    </div>
  {/each}
</div>

<!-- svelte-ignore css_unused_selector (기존 카드 상태 CSS는 디자인 리드가 정리) -->
<style>
  .hand {
    display: grid;
    justify-content: center;
    padding-bottom: var(--space-2);
  }

  .row {
    display: flex;
    justify-content: center;
    gap: var(--space-1);
  }

  /* 두 번째 줄은 첫 줄 아래쪽 절반을 덮는다. 카드 그림과 최소 48px 입력 영역을 유지한다 (UX-06). */
  .row + .row {
    margin-top: calc(55px - var(--card-h-l));
  }

  .slot {
    position: relative;
    min-width: var(--touch-min);
    min-height: var(--touch-min);
    padding: 0;
    border: 0;
    background: none;
    border-radius: 6px;
    transform-origin: 50% 120%;
    -webkit-touch-callout: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .slot.playable :global(.card) {
    translate: 0 -6px;
  }

  /* FR-12: 먹을 수 있는 카드는 아래에 금색 막대 (색만으로 구분하지 않도록 이름에도 "먹을 수 있음") */
  .slot.matchable::after {
    content: '';
    position: absolute;
    left: 20%;
    right: 20%;
    bottom: -2px;
    height: 4px;
    border-radius: 2px;
    background: var(--color-event-go);
  }

  .slot:disabled {
    cursor: default;
  }
  .hand.compact {
    --card-w-l: 48px;
    --card-h-l: calc(var(--card-w-l) / 0.614);
    --hand-art-visible: 50px;
    padding-bottom: 0;
    gap: 4px;
  }
  .compact .slot {
    display: grid;
    grid-template-rows: auto 16px;
    width: var(--card-w-l);
    border-radius: 3px;
    background: var(--color-felt);
  }
  .art-window {
    display: contents;
  }
  .compact .art-window {
    display: block;
    height: var(--card-h-l);
    overflow: hidden;
    border-radius: 3px 3px 0 0;
  }
  .compact .row:not(:last-child) .art-window {
    height: var(--hand-art-visible);
  }
  /* 기존 FLIP이 설정/회수하는 will-change 동안만 이동 경로를 연다. 시간축은 변경하지 않는다. */
  .compact .art-window:has(:global(.card[style*='will-change'])) {
    overflow: visible;
  }
  .compact .slot:has(:global(.card[style*='will-change'])) {
    z-index: var(--z-moving);
  }
  .compact .slot:has(:global(.card[style*='will-change'])) .hand-label {
    visibility: hidden;
  }
  .compact .row {
    gap: 8px;
  }
  .compact .row + .row {
    margin-top: 0;
  }
  .compact .slot.playable :global(.card) {
    translate: none;
  }
  .compact .slot.matchable::after {
    display: none;
  }
  .hand-label {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 16px;
    color: var(--color-hud-text);
    font-size: 14px;
    font-weight: 650;
    line-height: 16px;
  }
  .match-mark {
    flex: none;
    width: 8px;
    height: 8px;
    box-sizing: border-box;
  }
  .hand-label[data-cue='matchable'] {
    color: var(--color-hand-match);
  }
  .hand-label[data-cue='matchable'] .match-mark {
    border: 1.5px solid currentColor;
    background: transparent;
    rotate: 45deg;
  }
  .hand-label[data-cue='secured'] {
    color: var(--color-hand-secured);
  }
  .hand-label[data-cue='secured'] .match-mark {
    border-radius: 50%;
    background: currentColor;
    outline: 1px solid currentColor;
    outline-offset: 2px;
  }
  .group-bracket {
    position: absolute;
    top: 1px;
    left: 0;
    height: 14px;
    border: 1px solid var(--color-hand-bomb);
    border-width: 0 1px 1px;
    border-radius: 0 0 3px 3px;
    pointer-events: none;
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--color-hand-bomb);
    z-index: 1;
  }
  .group-bracket[data-action='shake'] {
    color: var(--color-hand-shake);
    border-color: currentColor;
    border-style: dashed;
  }
  .group-word {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px;
    background: var(--color-felt);
  }
  .group-word .match-mark {
    color: var(--color-hand-secured);
  }
  .hand-label[data-cue='matchable'] .group-word .match-mark {
    color: var(--color-hand-match);
  }
  .compact .group-selected {
    outline: 2px dashed var(--color-hand-bomb);
    outline-offset: 2px;
  }
  .compact .slot:focus-visible {
    outline: var(--focus-width) solid var(--color-focus);
    outline-offset: var(--focus-offset);
  }
  .compact .group-selected .hand-label {
    background: var(--color-hand-bomb);
    color: var(--color-on-accent);
  }
  .compact .group-selected .hand-cue {
    color: inherit;
  }
  @media (min-width: 410px) {
    .hand.compact {
      --card-w-l: 56px;
      --hand-art-visible: clamp(
        56px,
        calc(var(--hand-height, 184px) - var(--card-h-l) - 36px),
        var(--card-h-l)
      );
    }
  }
</style>
