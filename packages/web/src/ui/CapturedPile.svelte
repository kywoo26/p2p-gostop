<script lang="ts">
  // 획득패: 광 / 열끗 / 띠 / 피 그룹 (spec 6.2 게임판 상단·하단).
  // 칸과 숫자는 엔진 점수 규칙(ui/seat-stats.ts)을 따른다: 국진을 쌍피로 세면 피 칸 끝에 그리고 제목에 "국진 쌍피"를 표시한다.
  // FR-42·NF-08: 피 가치는 피 단위, 실제 장수는 장 단위로 구별한다. 요약 그림 수와 전체 장수는 별개다.
  import { GUKJIN_ID, type CardId } from '@p2p-gostop/engine';
  import Card from './Card.svelte';
  import type { CapturedStats } from './seat-stats.ts';

  interface Props {
    stats: CapturedStats;
    /** 영역 이름 (화면 읽기용). 예: "상대 획득패" */
    label: string;
    /** 잠깐 강조할 카드 (피 뺏기, M3 리뷰 I-4) */
    highlight?: readonly CardId[];
    summary?: boolean;
  }

  let { stats, label, highlight = [], summary = false }: Props = $props();

  function describe(name: string, value: number, cards: number, isPi: boolean): string {
    return isPi ? `${name} 가치 ${value}피, 실제 ${cards}장` : `${name} ${value}장`;
  }
</script>

<ul class="captured" aria-label={label}>
  {#each stats.piles as pile (pile.key)}
    {@const isPi = pile.key === 'pi'}
    <li
      class={['group', `group-${pile.key}`]}
      aria-label={`${describe(pile.name, pile.value, pile.cards.length, isPi)}${isPi && pile.cards.includes(GUKJIN_ID) ? ', 국진 쌍피 포함' : ''}`}
      data-pile={pile.key}
      data-value={pile.value}
      data-cards={pile.cards.length}
    >
      <span class="name" aria-hidden="true"
        >{pile.name}<b class={{ 'pi-value': isPi }}>{pile.value}{isPi ? '피' : ''}</b
        >{#if isPi && pile.value !== pile.cards.length}<small>({pile.cards.length}장)</small
          >{/if}{#if isPi && pile.cards.includes(GUKJIN_ID)}<small class="pile-badge"
            >국진 쌍피</small
          >{/if}</span
      >
      <span
        class="stack"
        style:--pile-count={summary ? Math.min(4, pile.cards.length) : pile.cards.length}
        data-count={pile.cards.length}
      >
        {#each summary ? pile.cards.slice(-4) : pile.cards as id (id)}
          <Card {id} size="s" marks={false} highlight={highlight.includes(id)} />
        {/each}
      </span>
    </li>
  {/each}
</ul>

<style>
  .captured {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    align-items: flex-end;
    min-height: calc(var(--card-h-s) + 1.1rem);
  }

  .group {
    display: grid;
    gap: 2px;
  }

  .name {
    font-size: var(--font-size-s);
    color: var(--color-text-muted);
    line-height: 1;
  }

  .name b {
    margin-left: 0.25em;
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
  }

  .name small {
    margin-left: 0.2em;
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;
  }

  .name .pile-badge {
    display: inline-block;
    padding: 0 3px;
    border-radius: 3px;
    background: var(--color-event-go);
    color: var(--color-banner-dark-text);
    font-size: var(--card-tag-font);
    line-height: var(--card-tag-height);
  }

  .stack {
    display: flex;
    min-height: var(--card-h-s);
  }

  /* 겹쳐 쌓기: 광·열끗·띠는 10px, 피는 7px씩 보인다 */
  .stack > :global(.card + .card) {
    margin-left: calc(10px - var(--card-w-s));
  }

  .group-pi .stack > :global(.card + .card) {
    margin-left: calc(7px - var(--card-w-s));
  }
</style>
