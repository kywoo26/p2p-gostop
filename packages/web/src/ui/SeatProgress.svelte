<script lang="ts">
  // FR-40·42 / UX-H01: 공개 획득패의 진행도만. 미래 사건·위험 인디케이터는 별도 PR.
  import type { CapturedStats } from './seat-stats.ts';

  interface Props {
    who: '내' | '상대';
    stats: CapturedStats;
    shakes: number;
    ppeokCount: number;
    bombs: number | null;
    handCount?: number | null;
    thinking?: boolean;
    anchor?: string | null;
  }
  let {
    who,
    stats,
    shakes,
    ppeokCount,
    bombs,
    handCount = null,
    thinking = false,
    anchor = null,
  }: Props = $props();
  const progress = $derived(stats.progress);
  // 기존 첫 족보 기준의 표시 상태만 분류한다. 다음 문턱 계산은 #81 API 소유.
  const milestones = $derived([
    { key: 'gwang', label: '광', value: progress.gwang, target: 3 },
    { key: 'godori', label: '고도리', value: progress.godori, target: 3 },
    { key: 'dan', label: '단', value: progress.dan, target: 3 },
    { key: 'pi', label: '피', value: progress.pi, target: 10 },
  ]);
  function stateOf(value: number, target: number) {
    return value >= target ? 'complete' : value === target - 1 ? 'near' : 'incomplete';
  }
</script>

<ul class="progress" aria-label={`${who} 족보 진행도`} data-anchor={anchor}>
  {#each milestones as item (item.key)}
    {@const state = stateOf(item.value, item.target)}
    <li
      class="milestone"
      data-stat={item.key}
      data-state={state}
      aria-label={`${item.label}${item.key === 'pi' ? ' 가치' : ''} ${item.value}/${item.target}, ${state === 'complete' ? '첫 기준 달성' : state === 'near' ? (item.key === 'pi' ? '1피 남음' : '1장 남음') : '미달'}`}
    >
      {item.label} <b>{item.value}/{item.target}</b>
    </li>
  {/each}
  <li class="counter" data-stat="ppeok">뻑 {ppeokCount}</li>
  <li class="counter" data-stat="shake">흔들 {shakes}</li>
  {#if bombs !== null}<li class="counter" data-stat="bomb">폭탄 {bombs}</li>{/if}
  {#if handCount !== null}<li class="counter hand-count">손패 {handCount}장</li>{/if}
  {#if thinking}<li class="thinking" role="status">생각 중…</li>{/if}
</ul>

<style>
  .progress {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: baseline;
    column-gap: 8px;
    row-gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;

    color: var(--color-hud-text);
    font-size: var(--hud-font-size);
    line-height: var(--hud-line-height);
    font-variant-numeric: tabular-nums;
  }
  li {
    white-space: nowrap;
  }
  .milestone {
    padding: 3px 4px;
    border: var(--hud-border-width) var(--hud-border-style) transparent;
    border-radius: var(--hud-chip-radius);
    background: var(--color-hud-chip);
    color: var(--color-hud-muted);
    text-align: center;
  }
  .milestone[data-state='complete'] {
    color: var(--color-hud-complete);
    background: var(--color-hud-complete-bg);
    border-color: var(--color-hud-complete);
  }
  .milestone[data-state='near'] {
    color: var(--color-hud-near);
    background: var(--color-hud-near-bg);
    border-color: var(--color-hud-near);
    border-style: var(--hud-near-border-style);
  }
  .counter {
    line-height: 16px;
    grid-row: 2;
    color: var(--color-hud-muted);
  }
  .counter[data-stat='ppeok'] {
    grid-column: 1;
  }
  .counter[data-stat='shake'] {
    grid-column: 2;
  }
  .counter[data-stat='bomb'] {
    grid-column: 3;
  }
  .hand-count {
    grid-column: 4;
  }
  .thinking {
    grid-column: 1 / -1;
    color: var(--color-hud-mine);
  }
</style>
