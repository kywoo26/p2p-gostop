<script lang="ts">
  // 기록 (spec 6.2): 판별 결과 목록, 세션 합계
  import { formatMoney, formatSignedMoney } from '../lib/format.ts';
  import type { RecordsView } from '../lib/view-types.ts';
  import Screen from '../ui/Screen.svelte';

  interface Props {
    view: RecordsView;
  }

  let { view }: Props = $props();

  const total = $derived(view.rows.reduce((sum, row) => sum + row.amount, 0));
  const wins = $derived([0, 1].map((seat) => view.rows.filter((r) => r.winner === seat).length));
</script>

<Screen title="기록">
  <section aria-labelledby="rec-sum">
    <h2 id="rec-sum">세션 합계</h2>
    <p class="summary">
      {view.rows.length}판 · {view.names[0]}
      {wins[0]}승 · {view.names[1]}
      {wins[1]}승
    </p>
    <p class="summary">
      <strong class={total >= 0 ? 'gain' : 'loss'}>{formatSignedMoney(total, view.unit)}</strong>
      <span class="muted">
        ({formatMoney(view.startBalance, view.unit)} → {formatMoney(
          view.startBalance + total,
          view.unit,
        )})
      </span>
    </p>
  </section>

  <section aria-labelledby="rec-rows">
    <h2 id="rec-rows">판별 결과</h2>
    {#if view.rows.length === 0}
      <p class="summary">아직 끝난 판이 없습니다.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th scope="col">판</th>
            <th scope="col">승자</th>
            <th scope="col" class="num">점수</th>
            <th scope="col" class="num">금액</th>
          </tr>
        </thead>
        <tbody>
          {#each view.rows as row (row.round)}
            <tr>
              <td>{row.round}</td>
              <td>{row.winner === null ? '나가리' : view.names[row.winner]}</td>
              <td class="num">{row.points}</td>
              <td class={['num', row.amount >= 0 ? 'gain' : 'loss']}>
                {formatSignedMoney(row.amount, view.unit)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</Screen>

<style>
  .summary {
    margin: 0;
  }

  .summary strong {
    font-size: 1.5rem;
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .gain {
    color: var(--color-accent);
  }

  .loss {
    color: var(--color-event-ppeok-text);
  }
</style>
