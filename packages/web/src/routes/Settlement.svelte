<script lang="ts">
  // 정산 (spec 6.2): 점수 분해 표, 배수 체인, 금액, 잔액 변화, 다음 판/종료
  import { formatMoney, formatNumber, formatSignedMoney } from '../lib/format.ts';
  import type { ScoreRowKind, SettleStepKind, SettlementView } from '../lib/view-types.ts';
  import Screen from '../ui/Screen.svelte';

  interface Props {
    view: SettlementView;
  }

  let { view }: Props = $props();

  const SCORE_LABEL: Record<ScoreRowKind, string> = {
    gwang: '광',
    yeol: '열끗',
    godori: '고도리',
    tti: '띠',
    hongdan: '홍단',
    cheongdan: '청단',
    chodan: '초단',
    pi: '피',
  };

  const STEP_LABEL: Record<SettleStepKind, string> = {
    base: '족보 점수',
    goBonus: '고 가산',
    goMultiplier: '3고 이상 배수',
    shake: '흔들기',
    bomb: '폭탄',
    piBak: '피박',
    gwangBak: '광박',
    meongtta: '멍따',
    goBak: '고박',
    nagariCarry: '나가리 이월',
    jackpot: '대박판',
  };

  const REASON_LABEL: Record<SettlementView['reason'], string> = {
    stop: '스톱',
    autoStop: '자동 스톱',
    threePpeok: '3뻑',
    chongtong: '총통',
    exhausted: '패 소진',
    hudang: '허당',
  };

  const headline = $derived(
    view.winner === null
      ? '무승부'
      : `${view.names[view.winner]} 승리 · ${REASON_LABEL[view.reason]}`,
  );
  const baseTotal = $derived(view.breakdown.reduce((sum, row) => sum + row.points, 0));
</script>

<Screen title="정산" back={null}>
  <p class="headline">{headline}</p>

  <section aria-labelledby="settle-score">
    <h2 id="settle-score">점수</h2>
    <table>
      <tbody>
        {#each view.breakdown as row (row.kind)}
          <tr><th scope="row">{SCORE_LABEL[row.kind]}</th><td class="num">{row.points}점</td></tr>
        {/each}
        <tr class="total"><th scope="row">합계</th><td class="num">{baseTotal}점</td></tr>
      </tbody>
    </table>
  </section>

  <section aria-labelledby="settle-chain">
    <h2 id="settle-chain">배수</h2>
    <ol class="chain">
      {#each view.steps as step, i (i)}
        <li>
          <span>{STEP_LABEL[step.kind]}</span>
          <span class="op">{step.op === 'add' ? (i === 0 ? '' : '+') : '×'}{step.value}</span>
          <span class="num">{step.total}점</span>
        </li>
      {/each}
    </ol>
  </section>

  <section aria-labelledby="settle-amount">
    <h2 id="settle-amount">금액</h2>
    <p class="amount">
      {view.finalPoints}점 × {formatMoney(view.pointValue, view.unit)} =
      <strong>{formatMoney(view.amount, view.unit)}</strong>
    </p>
  </section>

  <section aria-labelledby="settle-balance">
    <h2 id="settle-balance">잔액</h2>
    <table>
      <thead>
        <tr>
          <th scope="col">이름</th>
          <th scope="col" class="num">이전</th>
          <th scope="col" class="num">이후</th>
          <th scope="col" class="num">변화</th>
        </tr>
      </thead>
      <tbody>
        {#each view.balances as balance, seat (seat)}
          <tr>
            <th scope="row">{view.names[seat]}</th>
            <td class="num">{formatNumber(balance.before)}</td>
            <td class="num">{formatNumber(balance.after)}</td>
            <td class={['num', balance.after >= balance.before ? 'gain' : 'loss']}>
              {formatSignedMoney(balance.after - balance.before, view.unit)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  {#snippet actions()}
    <button type="button" class="button">종료</button>
    <button type="button" class="button primary">다음 판</button>
  {/snippet}
</Screen>

<style>
  .headline {
    margin: 0;
    font-size: var(--font-size-l);
    font-weight: 700;
  }

  .total th,
  .total td {
    font-weight: 700;
  }

  .chain {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    font-variant-numeric: tabular-nums;
  }

  .chain li {
    display: grid;
    grid-template-columns: 1fr auto 4.5rem;
    gap: var(--space-2);
  }

  .op {
    color: var(--color-event-go);
    font-weight: 700;
  }

  .amount {
    margin: 0;
    font-size: var(--font-size-l);
  }

  .amount strong {
    color: var(--color-event-go);
  }

  .gain {
    color: var(--color-accent);
  }

  .loss {
    color: var(--color-event-ppeok-text);
  }
</style>
