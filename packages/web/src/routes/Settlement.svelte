<script lang="ts">
  // 정산 (spec 6.2, FR-18): 점수 분해 표, 배수 체인, 금액, 잔액 변화, 다음 판/종료.
  // 잔액 0이면 재충전(시작 잔액으로)·세션 종료를 묻는다(MN-02).
  import type { Difficulty } from '@p2p-gostop/ai';
  import { conciseSoloNotice, playerLabel } from '../game/player-labels.ts';
  import type { SettlementDisplay } from '../game/adapter.ts';
  import type { PendingRoundResult } from '../game/controller.ts';
  import { formatMoney, formatNumber, formatSignedMoney } from '../lib/format.ts';
  import Screen from '../ui/Screen.svelte';
  import { REASON_LABEL, SCORE_LABEL, stepLabel } from '../ui/settle-labels.ts';

  interface Props {
    /** 국진 위치(gukjin)는 솔로 어댑터만 넣는다(프로토콜 뷰에는 아직 없다) */
    view: SettlementDisplay | null;
    pending?: PendingRoundResult | null;
    onacknowledge?: ((key: string) => void) | undefined;
    soloDifficulty?: Difficulty | undefined;
    decision?: {
      readonly winner: boolean;
      readonly canPush: boolean;
      readonly nextMultiplier: number;
      readonly acceptAmount: number | null;
      readonly forfeitedPoints: number | null;
    } | null;
    guest?: boolean;
    onpush?: ((push: boolean) => void) | undefined;
    /** 이 판의 즉시 정산 (첫뻑·첫따닥 등, FR-18 "별도 원장 항목") */
    instant?: readonly { readonly label: string; readonly name: string; readonly points: number }[];
    /** 나가리면 다음 판 배수 (G9) */
    nextCarry?: number | null;
    /** 누군가 잔액 0 (MN-02) */
    bankrupt?: boolean;
    /** 친구와 대전: 셔플 검증 결과·상대 선택 대기 같은 안내 */
    note?: string | null;
    /** 상대의 선택을 기다리는 중이면 "다음 판"을 잠근다 */
    waiting?: boolean;
    ended?: boolean;
    onnext?: (() => void) | undefined;
    onend?: (() => void) | undefined;
    onrefill?: (() => void) | undefined;
    onfresh?: (() => void) | undefined;
  }

  let {
    view,
    pending = null,
    onacknowledge,
    soloDifficulty,
    decision = null,
    guest = false,
    onpush,
    instant = [],
    nextCarry = null,
    bankrupt = false,
    note = null,
    waiting = false,
    ended = false,
    onnext,
    onend,
    onrefill,
    onfresh,
  }: Props = $props();

  let heading = $state<HTMLParagraphElement | null>(null);
  let hadPendingResult = false;
  const stage = $derived(pending ? (pending.acknowledged ? '받기·밀기 선택' : '판 결과') : '정산');
  $effect(() => {
    void stage;
    const target = heading;
    const focusResult = pending !== null || hadPendingResult;
    hadPendingResult = pending !== null;
    if (!focusResult || target === null) return;
    // $effect는 DOM 갱신 뒤 실행된다. 추가 tick 없이 같은 전이에서 초점을 옮긴다.
    if (target.isConnected && !target.closest('[inert]')) target.focus();
  });

  const headline = $derived(
    view === null
      ? '밀기 선택 대기'
      : view.pushed
        ? `${view.names[view.winner ?? 0]} 밀기 · 다음 판 ×${2 ** (view.nextPushes ?? 0)}`
        : view.winner === null
          ? `나가리${nextCarry !== null && nextCarry > 1 ? ` · 다음 판 ×${nextCarry}` : ''}`
          : `${view.names[view.winner]} 승리 · ${REASON_LABEL[view.reason]}`,
  );
  const displayHeadline = $derived(
    view !== null && soloDifficulty !== undefined
      ? conciseSoloNotice(headline, view.names)
      : headline,
  );
  const baseTotal = $derived(view?.breakdown.reduce((sum, row) => sum + row.points, 0) ?? 0);
  /** 정산에 쓴 국진 위치 (rules S5: 승자는 점수 최대, 패자는 피박 회피 쪽) */
  const gukjin = $derived(
    (view?.winner === null ? [] : (view?.gukjin ?? []))
      .map(({ seat, asPi }) => `${view?.names[seat]} ${asPi ? '쌍피' : '열끗'}`)
      .join(' · '),
  );
  /** 잔액이 0이 된 좌석 (MN-02, M3 리뷰 L-12) */
  const broke = $derived(
    view?.balances.flatMap((b, seat) => (b.after <= 0 ? [view.names[seat as 0 | 1]] : [])) ?? [],
  );
</script>

<Screen title={stage} back={null} scrollBody>
  <div class="result-scene" class:pending-result={pending !== null}>
    <svg
      class="result-mark"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <rect x="9" y="8" width="19" height="30" rx="3" transform="rotate(-14 18 23)" />
      <rect x="21" y="9" width="19" height="30" rx="3" transform="rotate(12 30 24)" />
      <path d="m29 19 4 5-4 5-4-5Z" />
    </svg>
    <p
      class="headline"
      data-testid="settlement-headline"
      title={headline}
      tabindex="-1"
      bind:this={heading}
    >
      <span aria-hidden="true">{displayHeadline}</span><span class="sr-only">{headline}</span>
    </p>

    {#if pending}
      <p class="pending-note" role="status" data-testid="pending-result-note">
        {pending.acknowledged
          ? '결과 확인 완료 · 받기·밀기 결정 대기'
          : '결과를 확인한 뒤 받기·밀기를 진행합니다.'}
        아직 정산되지 않았습니다.
      </p>
    {/if}

    {#if view?.pushed}
      <p class="push-result" data-testid="push-forfeit">
        정산 0{view.unit} · {view.forfeitedPoints ?? 0}점 포기 ·
        <span class="next-factor">다음 판 ×{2 ** (view.nextPushes ?? 0)}</span>
      </p>
    {/if}

    {#if decision}
      {#if decision.winner}
        <p class="decision-summary" role="status">
          {#if decision.acceptAmount !== null}
            받기 {formatMoney(decision.acceptAmount, view?.unit ?? '냥')} · 밀면 {decision.forfeitedPoints ??
              0}점 포기, 정산 0{view?.unit ?? '냥'} ·
            <span class="next-factor">다음 판 ×{decision.nextMultiplier}</span>
          {:else}
            이번 판을 받고 정산하거나 포기하고 다음 판 ×{decision.nextMultiplier}로 밉니다.
          {/if}
        </p>
      {:else}
        <p class="decision-summary" role="status">승자의 받기·밀기 선택을 기다리는 중</p>
      {/if}
    {/if}

    {#if view && view.winner !== null}
      <section class="settlement-section amount-section" aria-labelledby="settle-amount">
        <h2 id="settle-amount">{pending ? '받을 경우 예상 금액' : '금액'}</h2>
        <p class="amount">
          {view.finalPoints}점 × {formatMoney(view.pointValue, view.unit)} =
          <strong>{formatMoney(view.amount, view.unit)}</strong>
          {#if view.amount < view.finalPoints * view.pointValue}<span class="muted">
              (잔액까지만)</span
            >{/if}
        </p>
      </section>
    {/if}
  </div>

  <div class="settlement-details">
    {#if view && view.breakdown.length > 0}
      <section class="settlement-section" aria-labelledby="settle-score">
        <h2 id="settle-score">점수</h2>
        <table>
          <tbody>
            {#each view.breakdown as row (row.kind)}
              <tr
                ><th scope="row">{SCORE_LABEL[row.kind]}</th><td class="num">{row.points}점</td></tr
              >
            {/each}
            <tr class="total"><th scope="row">합계</th><td class="num">{baseTotal}점</td></tr>
          </tbody>
        </table>
      </section>
    {/if}
    {#if gukjin}
      <p class="gukjin" data-testid="settlement-gukjin">국진: {gukjin}</p>
    {/if}

    {#if view && view.steps.length > 0}
      <section class="settlement-section" aria-labelledby="settle-chain">
        <h2 id="settle-chain">배수</h2>
        <ol class="chain">
          {#each view.steps as step, i (i)}
            <li>
              <span>{stepLabel(step.kind, step.origin)}</span>
              <span class="op">{step.op === 'add' ? (i === 0 ? '' : '+') : '×'}{step.value}</span>
              <span class="num">{step.total}점</span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    {#if instant.length > 0}
      <section class="settlement-section" aria-labelledby="settle-instant">
        <h2 id="settle-instant">즉시 정산</h2>
        <ul class="instant">
          {#each instant as row, i (i)}
            <li>{row.name} {row.label} +{row.points}점</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if view && !pending}
      <section class="settlement-section balance-section" aria-labelledby="settle-balance">
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
                <th scope="row" aria-label={view.names[seat]} title={view.names[seat]}
                  >{playerLabel(
                    view.names[seat as 0 | 1],
                    soloDifficulty !== undefined && seat === 1,
                  )}</th
                >
                <td class="num">{formatNumber(balance.before)}</td>
                <td class="num" data-testid={`balance-${seat}`}>{formatNumber(balance.after)}</td>
                <td class={['num', balance.after >= balance.before ? 'gain' : 'loss']}>
                  {formatSignedMoney(balance.after - balance.before, view.unit)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    {#if note}
      <p class="note" role="status" data-testid="settlement-note">{note}</p>
    {/if}

    {#if bankrupt}
      <p class="bankrupt" role="alert">
        {broke.length > 0 ? `${broke.join(', ')}: ` : ''}잔액이 0이 되었습니다. 시작 잔액으로
        재충전하거나 끝낼 수 있습니다.
      </p>
    {/if}
  </div>

  {#snippet actions()}
    {#if pending && !pending.acknowledged}
      <button
        type="button"
        class="button primary"
        data-choice="acknowledge"
        onclick={() => onacknowledge?.(pending!.key)}>결과 확인</button
      >
    {:else if decision}
      {#if decision.winner}
        <button
          type="button"
          class="button primary"
          data-choice="accept"
          onclick={() => onpush?.(false)}>{guest ? '받기 · 다음 판 준비' : '받기'}</button
        >
        {#if decision.canPush}<button
            type="button"
            class="button"
            data-choice="push"
            onclick={() => onpush?.(true)}>밀기 · 다음 판 ×{decision.nextMultiplier}</button
          >{/if}
      {/if}
    {:else if pending}
      <p role="status">결정을 기다리는 중</p>
    {:else if ended}
      <button type="button" class="button primary" data-choice="fresh" onclick={() => onfresh?.()}
        >새로 참가</button
      >
    {:else}
      <button type="button" class="button" data-choice="end" onclick={() => onend?.()}>종료</button>
    {/if}
    {#if !pending && !decision && !ended && bankrupt}
      <button type="button" class="button primary" data-choice="refill" onclick={() => onrefill?.()}
        >재충전</button
      >
    {:else if !pending && !decision && !ended}
      <button
        type="button"
        class="button primary"
        data-choice="next"
        disabled={waiting}
        onclick={() => onnext?.()}>다음 판</button
      >
    {/if}
  {/snippet}
</Screen>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .result-scene {
    display: grid;
    gap: var(--space-3);
    position: relative;
    min-width: 0;
    padding: var(--space-4);
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
    box-shadow: var(--shadow-panel, 0 8px 24px #0002);
  }
  .result-scene.pending-result {
    border-style: dashed;
    background: var(--color-surface-soft, var(--color-surface));
    box-shadow: none;
  }
  .result-mark {
    width: 48px;
    height: 48px;
    color: var(--color-accent-secondary, var(--color-accent));
  }
  .headline {
    margin: 0;
    font-size: 24px;
    line-height: 1.35;
    font-weight: 750;
    letter-spacing: -0.035em;
    overflow-wrap: anywhere;
  }
  .pending-note {
    margin: 0;
    padding: var(--space-3);
    border-left: 3px solid var(--color-accent-secondary, var(--color-accent));
    background: var(--color-bg);
    font-size: var(--font-size-m);
    line-height: 1.65;
    font-weight: 600;
  }
  .settlement-details {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }
  section.settlement-section {
    min-width: 0;
    padding: var(--space-3) 0;
    border: 0;
    border-bottom: 1px solid var(--color-divider);
    border-radius: 0;
    background: transparent;
    gap: var(--space-3);
  }
  .push-result,
  .decision-summary {
    margin: 0;
    padding: var(--space-3) 0;
    border-top: 1px solid var(--color-divider);
    color: var(--color-text);
    font-size: var(--font-size-m);
    line-height: 1.65;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .push-result {
    border-top-style: dashed;
  }
  .next-factor {
    display: inline-block;
    font-weight: 700;
    white-space: nowrap;
  }
  .button[data-choice][type='button'] {
    min-width: 0;
    min-height: 56px;
    padding-inline: var(--space-3);
    font-size: var(--font-size-m);
    line-height: 1.5;
    text-align: center;
    text-wrap: balance;
  }
  .button[data-choice][type='button']:disabled {
    color: var(--color-text-muted);
    background: var(--color-surface);
    border: 1px dashed var(--color-border);
    box-shadow: none;
  }
  section.balance-section {
    padding: var(--space-4) var(--space-3);
    border: 0;
    border-radius: var(--radius-panel);
    background: var(--color-surface-soft, var(--color-surface));
  }
  .balance-section table {
    table-layout: fixed;
    font-size: 16px;
  }
  .balance-section th,
  .balance-section td {
    overflow-wrap: anywhere;
    vertical-align: top;
    padding-block: var(--space-2);
  }
  .balance-section th:first-child {
    width: 22%;
  }
  .total th,
  .total td {
    padding-top: var(--space-3);
    font-size: 24px;
    font-weight: 700;
  }
  .chain {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    font-variant-numeric: tabular-nums;
  }
  .chain li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 4.5rem;
    align-items: baseline;
    gap: var(--space-2);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-divider);
  }
  .chain li:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }
  .op {
    color: var(--color-accent);
    font-weight: 700;
  }
  .amount {
    margin: 0;
    font-size: var(--font-size-m);
    line-height: 1.6;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .amount strong {
    display: block;
    margin-top: var(--space-2);
    color: var(--color-accent);
    font-size: var(--type-amount-size);
    font-weight: 750;
    line-height: var(--type-amount-line);
    letter-spacing: -0.04em;
  }
  section.amount-section {
    padding: var(--space-4) 0 0;
    border-top: 1px solid var(--color-divider);
    border-bottom: 0;
  }
  .pending-result .amount strong {
    font-size: 2rem;
    line-height: 1.3;
  }
  .gukjin {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
    line-height: 1.6;
  }
  .note {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
    line-height: 1.65;
    overflow-wrap: anywhere;
  }
  .muted {
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }
  .instant {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding-left: 1.2rem;
    line-height: 1.6;
  }
  .bankrupt {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-left: 3px solid var(--color-event-go);
    border-radius: var(--radius-m);
    background: var(--color-surface-raised);
    color: var(--color-event-go);
    line-height: 1.65;
  }
  .gain {
    color: var(--color-accent);
  }
  .loss {
    color: var(--color-event-ppeok-text);
  }
  .headline:focus-visible,
  .button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 3px;
  }
</style>
