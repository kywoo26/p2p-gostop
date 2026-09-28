<script lang="ts">
  // 획득패: 광 / 열끗 / 띠 / 피 그룹 (spec 6.2 게임판 상단·하단)
  import { getCard } from '@p2p-gostop/engine';
  import type { CapturedView } from '../lib/view-types.ts';
  import Card from './Card.svelte';

  interface Props {
    captured: CapturedView;
    /** 영역 이름 (화면 읽기용). 예: "상대 획득패" */
    label: string;
  }

  let { captured, label }: Props = $props();

  const groups = $derived([
    { key: 'gwang', name: '광', cards: captured.gwang, count: captured.gwang.length },
    { key: 'yeol', name: '열끗', cards: captured.yeol, count: captured.yeol.length },
    { key: 'tti', name: '띠', cards: captured.tti, count: captured.tti.length },
    {
      key: 'pi',
      name: '피',
      cards: captured.pi,
      // 피는 장수가 아니라 가치 합(쌍피 2, 보너스 2·3)
      count: captured.pi.reduce((sum, id) => sum + getCard(id).piValue, 0),
    },
  ]);
</script>

<ul class="captured" aria-label={label}>
  {#each groups as group (group.key)}
    <li class={['group', `group-${group.key}`]} aria-label={`${group.name} ${group.count}`}>
      <span class="name" aria-hidden="true">{group.name}<b>{group.count}</b></span>
      <span class="stack">
        {#each group.cards as id (id)}
          <Card {id} size="s" />
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
    min-height: calc(var(--card-w-s) * 1.63 + 1.1rem);
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

  .stack {
    display: flex;
    min-height: calc(var(--card-w-s) * 1.63);
  }

  /* 겹쳐 쌓기: 광·열끗·띠는 10px, 피는 7px씩 보인다 */
  .stack > :global(.card + .card) {
    margin-left: calc(10px - var(--card-w-s));
  }

  .group-pi .stack > :global(.card + .card) {
    margin-left: calc(7px - var(--card-w-s));
  }
</style>
