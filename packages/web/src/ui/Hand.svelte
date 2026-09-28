<script lang="ts">
  // 내 손패 부채꼴 (spec 6.2: 최대 10장, 겹침 스크롤 없음 / 6.3: 탭 한 번으로 내기, 내 차례가 아니면 흐리게)
  // 6장까지 한 줄, 7장 이상은 두 줄로 나눠 카드마다 48px 이상의 터치 영역을 지킨다(spec 6.1).
  import type { CardId } from '../lib/view-types.ts';
  import Card from './Card.svelte';
  import { cardLabel } from './cards.ts';

  interface Props {
    cards: readonly CardId[];
    /** 지금 낼 수 있는 카드 */
    playable: readonly CardId[];
    onplay?: ((id: CardId) => void) | undefined;
  }

  let { cards, playable, onplay }: Props = $props();

  const ONE_ROW_MAX = 6;
  const rows = $derived(
    cards.length <= ONE_ROW_MAX
      ? [cards]
      : [cards.slice(0, Math.ceil(cards.length / 2)), cards.slice(Math.ceil(cards.length / 2))],
  );
  const myTurn = $derived(playable.length > 0);

  /** 부채꼴: 가운데에서 멀수록 기울이고 조금 내린다 */
  function fan(index: number, count: number): string {
    const offset = index - (count - 1) / 2;
    return `rotate(${offset * 3}deg) translateY(${offset * offset * 1.5}px)`;
  }
</script>

<div class={['hand', { waiting: !myTurn }]} role="group" aria-label="내 손패">
  {#each rows as row, r (r)}
    <div class="row">
      {#each row as id, i (id)}
        {@const canPlay = playable.includes(id)}
        <button
          type="button"
          class={['slot', { playable: canPlay }]}
          style:transform={fan(i, row.length)}
          aria-label={`${cardLabel(id)} 내기`}
          disabled={!canPlay}
          onclick={() => onplay?.(id)}
        >
          <Card {id} size="l" dimmed={!canPlay} />
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
    min-width: var(--touch-min);
    min-height: var(--touch-min);
    padding: 0;
    border: 0;
    background: none;
    border-radius: 6px;
    transform-origin: 50% 120%;
  }

  .slot.playable > :global(.card) {
    translate: 0 -6px;
  }

  .slot:disabled {
    cursor: default;
  }
</style>
