<script lang="ts">
  // 내 손패 부채꼴 (spec 6.2: 최대 10장, 겹침 스크롤 없음 / 6.3: 탭 한 번으로 내기, 내 차례가 아니면 흐리게,
  // 누르고 있으면 먹게 될 바닥 카드 강조 / FR-12: 낼 수 있는 카드와 먹을 수 있는 카드 예고).
  // 5장까지 한 줄, 6장 이상은 두 줄로 나눠 카드마다 48px 이상의 터치 영역을 지키고 390px 화면에서 잘리지 않게 한다
  // (spec 6.1, M3 리뷰 L-3: 6장 한 줄은 392px). 손패는 월·종류 순으로 정렬해 보인다(M3 리뷰 I-2).
  // 길게 누르기(400ms 이상)는 미리보기 전용이라 떼어도 내지 않는다(실수 방지).
  // 탭 한 번 = 누르기 시작할 때 이미 낼 수 있던 카드만 낸다(M3 리뷰 I-3): 재생 중에 판을 눌러 애니메이션을 건너뛰면
  // 손가락을 떼기 전에 재생이 끝나 버튼이 풀릴 수 있다. 그 click은 건너뛰기용이었으므로 카드를 내지 않는다.
  import type { CardId } from '../lib/view-types.ts';
  import Card from './Card.svelte';
  import { cardLabel } from './cards.ts';
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
    /** 카드를 냈다. at = 탭 시각(performance.now 기준, spec AC-06 계측) */
    onplay?: ((id: CardId, at: number) => void) | undefined;
    /** 누르고 있는 카드 (떼면 null) */
    onpreview?: ((id: CardId | null) => void) | undefined;
  }

  let {
    compact = false,
    cards,
    playable,
    matchable = [],
    visualGroups = [],
    cuesEnabled = true,
    selectedGroup = null,
    onplay,
    onpreview,
  }: Props = $props();

  const LONG_PRESS_MS = 400;
  const rows = $derived(handRows(cards));
  const myTurn = $derived(playable.length > 0);

  /** 누르기 시작한 카드·시각, 그때 낼 수 있었는지 (반응형일 필요 없음) */
  let pressed: { id: CardId; at: number; armed: boolean } | null = null;
  let handRoot: HTMLElement;
  let previousOrder = '';
  $effect(() => {
    const order = rows.map((row) => row.join(',')).join('|');
    if (previousOrder !== order) {
      pressed = null;
      onpreview?.(null);
      previousOrder = order;
    }
  });
  function moving(): boolean {
    return handRoot?.querySelector('.card[style*="will-change"]') !== null;
  }

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

  /**
   * 손패 안의 모든 pointerdown(비활성 버튼 포함)을 캡처 단계에서 받는다: 비활성 버튼의 이벤트는 위임 핸들러가
   * 건너뛸 수 있으므로 버튼이 아니라 손패 영역에서 누른 카드를 기록한다.
   */
  function press(event: PointerEvent) {
    if (moving()) {
      pressed = null;
      return;
    }
    const slot =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-slot]') : null;
    const id = slot === null ? null : Number(slot.dataset['slot']);
    if (id === null) {
      pressed = null;
      return;
    }
    const armed = playable.includes(id);
    pressed = { id, at: performance.now(), armed };
    if (armed) onpreview?.(id);
  }

  function release() {
    onpreview?.(null);
  }

  /**
   * 누르기가 취소되면(스크롤 등) 그 누르기로는 내지 않는다. pointerleave는 터치에서 손을 뗄 때 click보다 먼저 오므로
   * 미리보기만 끈다(release).
   */
  function abandon() {
    pressed = null;
    release();
  }

  function activate(id: CardId, event: MouseEvent) {
    const press = pressed;
    pressed = null;
    onpreview?.(null);
    if (!playable.includes(id) || moving()) return;
    // 키보드(Enter·Space)와 스크립트 click은 누르기 없이 온다(detail 0): 그대로 낸다
    if (event.detail !== 0) {
      // 포인터 탭: 같은 카드를 낼 수 있을 때 눌렀어야 한다(건너뛰기 탭 방지), 길게 누르기는 미리보기 전용
      if (press === null || press.id !== id || !press.armed) return;
      if (performance.now() - press.at >= LONG_PRESS_MS) return;
    }
    onplay?.(id, event.timeStamp > 0 ? event.timeStamp : performance.now());
  }
</script>

<div
  bind:this={handRoot}
  class={['hand', { waiting: !myTurn, compact }]}
  role="group"
  aria-label="내 손패"
  onpointerdowncapture={press}
>
  {#each rows as row, r (r)}
    <div class="row">
      {#each row as id, i (id)}
        {@const canPlay = playable.includes(id)}
        {@const canMatch = cuesEnabled && canPlay && matchable.includes(id)}
        {@const group = cuesEnabled
          ? visualGroups.find((group) => group.kind !== 'secured' && group.cards.includes(id))
          : undefined}
        {@const secured =
          cuesEnabled &&
          visualGroups.some((group) => group.kind === 'secured' && group.cards.includes(id))}
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
              'group-selected': group && group.id === selectedGroup,
            },
          ]}
          style:transform={compact ? 'none' : fan(i, row.length)}
          aria-label={[
            cardLabel(id),
            secured ? '확정 획득 짝' : canMatch ? '먹을 수 있음' : null,
            group ? HAND_CUES[group.kind].label : null,
            '내기',
          ]
            .filter(Boolean)
            .join(', ')}
          disabled={!canPlay}
          data-slot={id}
          data-hand-group={monthGroup ? month : undefined}
          data-hand-cue={cuesEnabled
            ? secured
              ? 'secured'
              : canMatch
                ? 'matchable'
                : undefined
            : undefined}
          data-hand-action={group?.kind}
          onpointerup={release}
          onpointercancel={abandon}
          onpointerleave={release}
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
  .compact .row {
    gap: 8px;
  }
  .compact .row + .row {
    margin-top: 0;
  }
  .compact .slot.playable :global(.card) {
    translate: none;
  }
  .compact .group-selected {
    outline: 2px dashed var(--color-hand-bomb);
    outline-offset: 2px;
  }
  .compact .slot:focus-visible {
    outline: var(--focus-width) solid var(--color-focus);
    outline-offset: var(--focus-offset);
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
