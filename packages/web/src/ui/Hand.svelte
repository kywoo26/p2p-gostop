<script lang="ts">
  // 내 손패 부채꼴 (spec 6.2: 최대 10장, 겹침 스크롤 없음 / 6.3: 탭 한 번으로 내기, 내 차례가 아니면 흐리게,
  // 누르고 있으면 먹게 될 바닥 카드 강조 / FR-12: 낼 수 있는 카드와 먹을 수 있는 카드 예고).
  // 5장까지 한 줄, 6장 이상은 두 줄로 나눠 카드마다 48px 이상의 터치 영역을 지키고 390px 화면에서 잘리지 않게 한다
  // (spec 6.1, M3 리뷰 L-3: 6장 한 줄은 392px). 손패는 월·종류 순으로 정렬해 보인다(M3 리뷰 I-2).
  // 일반 카드의 길게 누르기(400ms 이상)는 미리보기만 닫는다. 폭탄 가능 카드는 한 장 내기다.
  // 탭 한 번 = 누르기 시작할 때 이미 낼 수 있던 카드만 낸다(M3 리뷰 I-3): 재생 중에 판을 눌러 애니메이션을 건너뛰면
  // 손가락을 떼기 전에 재생이 끝나 버튼이 풀릴 수 있다. 그 click은 건너뛰기용이었으므로 카드를 내지 않는다.
  import type { CardId } from '../lib/view-types.ts';
  import Card from './Card.svelte';
  import { cardLabel, sortHand } from './cards.ts';
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
    /** 후속 사건 PR은 같은 group ID의 3개 data-slot을 이동 기준점으로 사용한다. */
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
    selectedGroup = null,
    revision,
    onplay,
    bombCards = [],
    onpreview,
    oninvalidate,
  }: Props = $props();

  const ONE_ROW_MAX = 5;
  const LONG_PRESS_MS = 400;
  const sorted = $derived(sortHand(cards));
  const rows = $derived.by(() => {
    if (sorted.length <= ONE_ROW_MAX) return [sorted];
    const middle = Math.ceil(sorted.length / 2);
    // compact는 최대 6열(360px에서 328px). 월 순서를 보존하며 행동 묶음 경계를 우선한다.
    const split = compact
      ? ([middle, middle + 1, middle - 1].find(
          (at) =>
            at <= 6 &&
            sorted.length - at <= 6 &&
            !visualGroups.some(
              (group) =>
                group.kind !== 'secured' &&
                group.cards.includes(sorted[at - 1]!) &&
                group.cards.includes(sorted[at]!),
            ),
        ) ?? middle)
      : middle;
    return [sorted.slice(0, split), sorted.slice(split)];
  });
  const myTurn = $derived(playable.length > 0);

  /** 누르기 시작한 카드·시각, 그때 낼 수 있었는지 (반응형일 필요 없음) */
  let pressed: {
    id: CardId;
    pointerId: number;
    at: number;
    armed: boolean;
    released: boolean;
  } | null = null;
  let suppressClick = false;
  let previousRevision: object | undefined;

  /** 부채꼴: 가운데에서 멀수록 기울이고 조금 내린다 */
  function fan(index: number, count: number): string {
    const offset = index - (count - 1) / 2;
    return `rotate(${offset * 3}deg) translateY(${offset * offset * 1.5}px)`;
  }

  // 낼 수 있는 카드가 없어지면(재생 중·상대 차례) 진행 중이던 누르기는 무효다: 재생이 끝난 뒤 오는 click은
  // 새 누르기가 있어야 카드를 낸다(비활성 버튼에 pointerdown이 오지 않는 브라우저에서도 안전하게).
  $effect(() => {
    if (playable.length === 0) pressed = null;
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

  /**
   * 손패 안의 모든 pointerdown(비활성 버튼 포함)을 캡처 단계에서 받는다: 비활성 버튼의 이벤트는 위임 핸들러가
   * 건너뛸 수 있으므로 버튼이 아니라 손패 영역에서 누른 카드를 기록한다.
   */
  function press(event: PointerEvent) {
    suppressClick = false;
    const slot =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-slot]') : null;
    const id = slot === null ? null : Number(slot.dataset['slot']);
    if (id === null) {
      pressed = null;
      return;
    }
    const armed = playable.includes(id);
    pressed = { id, pointerId: event.pointerId, at: performance.now(), armed, released: false };
    if (armed) onpreview?.(id);
  }

  function release() {
    onpreview?.(null);
  }

  function lift(id: CardId, event: PointerEvent) {
    const current = pressed;
    if (current?.pointerId !== event.pointerId || current.id !== id) return;
    if (performance.now() - current.at < LONG_PRESS_MS) {
      current.released = true;
      release();
      return;
    }
    pressed = null;
    suppressClick = true;
    release();
    if (current.armed && playable.includes(id) && bombCards.includes(id)) {
      onplay?.(id, current.at, true);
    }
  }

  /**
   * 누르기가 취소되면(스크롤 등) 그 누르기로는 내지 않는다. pointerleave는 터치에서 손을 뗄 때 click보다 먼저 오므로
   * 미리보기만 끈다(release).
   */
  function abandon() {
    pressed = null;
    suppressClick = true;
    release();
  }

  function activate(id: CardId, event: MouseEvent) {
    const press = pressed;
    pressed = null;
    onpreview?.(null);
    // 취소된 포인터의 합성 click만 막는다. 뒤따르는 click 없이 키보드가 눌리면 첫 입력부터 수락한다.
    if (suppressClick && event.detail !== 0) {
      suppressClick = false;
      return;
    }
    suppressClick = false;
    if (!playable.includes(id)) return;
    // 키보드(Enter·Space)와 스크립트 click은 누르기 없이 온다(detail 0): 그대로 낸다
    if (event.detail !== 0) {
      // 포인터 탭: 같은 카드를 낼 수 있을 때 눌렀어야 한다(건너뛰기 탭 방지).
      if (press === null || press.id !== id || !press.armed || !press.released) return;
      if (performance.now() - press.at >= LONG_PRESS_MS) return;
    }
    onplay?.(id, event.detail !== 0 && press ? press.at : performance.now(), false);
  }

  function keydown(id: CardId, event: KeyboardEvent) {
    if (!event.shiftKey || event.key !== 'Enter' || !bombCards.includes(id)) return;
    event.preventDefault();
    if (playable.includes(id)) onplay?.(id, performance.now(), true);
  }
</script>

<div
  class={['hand', { waiting: !myTurn, compact }]}
  role="group"
  aria-label="내 손패"
  onpointerdowncapture={press}
>
  {#each rows as row, r (r)}
    <div class="row">
      {#each row as id, i (id)}
        {@const canPlay = playable.includes(id)}
        {@const canMatch = canPlay && matchable.includes(id)}
        {@const group = visualGroups.find(
          (group) => group.kind !== 'secured' && group.cards.includes(id),
        )}
        {@const secured = visualGroups.some(
          (group) => group.kind === 'secured' && group.cards.includes(id),
        )}
        {@const cue = secured ? 'secured' : canMatch ? 'matchable' : canPlay ? 'playable' : null}
        {@const fragment = group ? row.filter((card) => group.cards.includes(card)) : []}
        {@const groupStart = group && fragment[0] === id}
        {@const firstFragment = group && sorted.find((card) => group.cards.includes(card)) === id}
        <button
          type="button"
          class={[
            'slot',
            {
              playable: canPlay,
              matchable: canMatch,
              'group-selected': group && group.id === selectedGroup,
            },
          ]}
          style:transform={compact ? 'none' : fan(i, row.length)}
          aria-label={`${cardLabel(id)}${secured ? ' (확정 획득 짝)' : canMatch ? ' (먹을 수 있음)' : ''}${group ? ` (${HAND_CUES[group.kind].label})` : ''}${bombCards.includes(id) ? ' 폭탄 내기, 한 장만 내기: 길게 누르거나 Shift+Enter' : ' 내기'}`}
          aria-keyshortcuts={bombCards.includes(id) ? 'Shift+Enter' : undefined}
          disabled={!canPlay}
          data-slot={id}
          data-hand-group={group?.id}
          data-hand-cue={cue}
          data-hand-action={group?.kind}
          onpointerup={(e) => lift(id, e)}
          onpointercancel={abandon}
          onpointerleave={(e) => {
            if (pressed && !pressed.released && pressed.pointerId === e.pointerId) abandon();
            else release();
          }}
          onkeydown={(e) => keydown(id, e)}
          onfocus={() => onpreview?.(id)}
          onblur={release}
          oncontextmenu={(e) => e.preventDefault()}
          onclick={(e) => activate(id, e)}
        >
          <span class="art-window">
            <Card
              {id}
              size="l"
              dimmed={!canPlay}
              flippable
              markAt={rows.length > 1 && r === 0 ? 'top' : 'bottom'}
            />
          </span>
          {#if compact}
            <span class="hand-label" data-cue={cue} aria-hidden="true">
              {#if !group && (cue === 'matchable' || cue === 'secured')}
                <span class="match-mark"></span><span class="hand-cue">{HAND_CUES[cue].short}</span>
              {/if}
              {#if groupStart}
                <span
                  class="group-bracket"
                  data-action={group.kind}
                  style:width={`calc(${fragment.length} * var(--card-w-l) + ${(fragment.length - 1) * 8}px)`}
                >
                  {#if firstFragment}<span class="group-word">
                      {#if cue === 'secured' || cue === 'matchable'}<span class="match-mark"
                        ></span>{/if}
                      {HAND_CUES[group.kind].short}
                    </span>{/if}
                </span>
              {/if}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  {/each}
</div>

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

  /* 두 번째 줄은 첫 줄 아래쪽 절반을 덮는다: 윗줄은 위쪽 55px(표식 포함)만 보인다.
     55px 노출 영역 안에 16px 월 표식과 최소 48px 입력 영역을 유지한다 (plan.md D1) */
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
