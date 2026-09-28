<script lang="ts">
  // 내 손패 부채꼴 (spec 6.2: 최대 10장, 겹침 스크롤 없음 / 6.3: 탭 한 번으로 내기, 내 차례가 아니면 흐리게,
  // 누르고 있으면 먹게 될 바닥 카드 강조 / FR-12: 낼 수 있는 카드와 먹을 수 있는 카드 예고).
  // 6장까지 한 줄, 7장 이상은 두 줄로 나눠 카드마다 48px 이상의 터치 영역을 지킨다(spec 6.1).
  // 길게 누르기(400ms 이상)는 미리보기 전용이라 떼어도 내지 않는다(실수 방지).
  import type { CardId } from '../lib/view-types.ts';
  import Card from './Card.svelte';
  import { cardLabel } from './cards.ts';

  interface Props {
    cards: readonly CardId[];
    /** 지금 낼 수 있는 카드 */
    playable: readonly CardId[];
    /** 바닥에 같은 월이 있어 먹을 수 있는 카드 (FR-12 예고 표식) */
    matchable?: readonly CardId[];
    /** 카드를 냈다. at = 탭 시각(performance.now 기준, spec AC-06 계측) */
    onplay?: ((id: CardId, at: number) => void) | undefined;
    /** 누르고 있는 카드 (떼면 null) */
    onpreview?: ((id: CardId | null) => void) | undefined;
  }

  let { cards, playable, matchable = [], onplay, onpreview }: Props = $props();

  const ONE_ROW_MAX = 6;
  const LONG_PRESS_MS = 400;
  const rows = $derived(
    cards.length <= ONE_ROW_MAX
      ? [cards]
      : [cards.slice(0, Math.ceil(cards.length / 2)), cards.slice(Math.ceil(cards.length / 2))],
  );
  const myTurn = $derived(playable.length > 0);

  /** 누르기 시작한 카드와 시각 (반응형일 필요 없음) */
  let pressed: { id: CardId; at: number } | null = null;

  /** 부채꼴: 가운데에서 멀수록 기울이고 조금 내린다 */
  function fan(index: number, count: number): string {
    const offset = index - (count - 1) / 2;
    return `rotate(${offset * 3}deg) translateY(${offset * offset * 1.5}px)`;
  }

  function press(id: CardId) {
    pressed = { id, at: performance.now() };
    onpreview?.(id);
  }

  function release() {
    onpreview?.(null);
  }

  function activate(id: CardId, event: MouseEvent) {
    const longPress = pressed?.id === id && performance.now() - pressed.at >= LONG_PRESS_MS;
    pressed = null;
    onpreview?.(null);
    if (longPress) return;
    onplay?.(id, event.timeStamp > 0 ? event.timeStamp : performance.now());
  }
</script>

<div class={['hand', { waiting: !myTurn }]} role="group" aria-label="내 손패">
  {#each rows as row, r (r)}
    <div class="row">
      {#each row as id, i (id)}
        {@const canPlay = playable.includes(id)}
        {@const canMatch = canPlay && matchable.includes(id)}
        <button
          type="button"
          class={['slot', { playable: canPlay, matchable: canMatch }]}
          style:transform={fan(i, row.length)}
          aria-label={`${cardLabel(id)}${canMatch ? ' (먹을 수 있음)' : ''} 내기`}
          disabled={!canPlay}
          onpointerdown={() => press(id)}
          onpointerup={release}
          onpointercancel={release}
          onpointerleave={release}
          onfocus={() => onpreview?.(id)}
          onblur={release}
          oncontextmenu={(e) => e.preventDefault()}
          onclick={(e) => activate(id, e)}
        >
          <Card {id} size="l" dimmed={!canPlay} flippable />
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

  /* 두 번째 줄은 첫 줄 아래쪽 절반을 덮는다 */
  .row + .row {
    margin-top: calc(var(--card-w-l) * -0.75);
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

  .slot.playable > :global(.card) {
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
</style>
