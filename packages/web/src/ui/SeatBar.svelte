<script lang="ts">
  // 좌석 막대 (spec 6.1 "정보는 상시 노출", M3 리뷰 I-4): 이름·점수·잔액, 족보 진행도(광 n/3, 고도리 n/3, 단 n/3,
  // 피 n/10), 뻑·흔들기·폭탄 횟수. 내 막대에는 현재 배수, 상대 막대에는 손패 수를 더한다.
  // 진행도 숫자는 획득패 칸과 같은 계산(ui/seat-stats.ts, 엔진 scoreCaptured)이라 한 화면에 피 숫자가 둘 뜨지 않는다.
  import { formatMoney } from '../lib/format.ts';
  import type { MoneyUnit } from '../lib/view-types.ts';
  import type { CapturedStats } from './seat-stats.ts';

  interface Props {
    /** "나" 또는 "상대": 화면 읽기용 이름 앞말 */
    who: '나' | '상대';
    name: string;
    stats: CapturedStats;
    score: number;
    goCount: number;
    shakes: number;
    ppeokCount: number;
    /** null이면(프로토콜 뷰에 아직 없음) 폭탄 칩을 그리지 않는다 */
    bombs: number | null;
    balance: number;
    unit: MoneyUnit;
    /** 상대 손패 수 (내 막대는 null) */
    handCount?: number | null;
    /** 지금 스톱하면 적용될 배수 (내 막대만) */
    multiplier?: number | null;
    thinking?: boolean;
    /** 애니메이션 기준점 (상대 손패 자리) */
    anchor?: string | null;
  }

  let {
    who,
    name,
    stats,
    score,
    goCount,
    shakes,
    ppeokCount,
    bombs,
    balance,
    unit,
    handCount = null,
    multiplier = null,
    thinking = false,
    anchor = null,
  }: Props = $props();

  const progress = $derived(stats.progress);
</script>

<div class={['seat-bar', who === '나' ? 'me' : 'opponent']} data-anchor={anchor}>
  <h2 class="name">{name}</h2>
  <dl class="stats">
    <div>
      <dt>점수</dt>
      <dd data-testid={who === '나' ? 'my-score' : 'opponent-score'}>{score}</dd>
    </div>
    {#if handCount !== null}<div>
        <dt>손패</dt>
        <dd>{handCount}</dd>
      </div>{/if}
    {#if goCount > 0}<div>
        <dt>고</dt>
        <dd>{goCount}</dd>
      </div>{/if}
    {#if multiplier !== null}<div>
        <dt>배수</dt>
        <dd>×{multiplier}</dd>
      </div>{/if}
    <div class="balance">
      <dt>잔액</dt>
      <dd>{formatMoney(balance, unit)}</dd>
    </div>
  </dl>
  <ul class="progress" aria-label={`${who === '나' ? '내' : '상대'} 족보 진행도`}>
    <li data-stat="gwang">광 {progress.gwang}/3</li>
    <li data-stat="godori">고도리 {progress.godori}/3</li>
    <li data-stat="dan">단 {progress.dan}/3</li>
    <li data-stat="pi">피 {progress.pi}/10</li>
    <li class={['counter', { danger: ppeokCount >= 2 }]} data-stat="ppeok">뻑 {ppeokCount}</li>
    <li class="counter" data-stat="shake">흔들 {shakes}</li>
    {#if bombs !== null}<li class="counter" data-stat="bomb">폭탄 {bombs}</li>{/if}
  </ul>
  {#if thinking}<p class="thinking" role="status">생각 중…</p>{/if}
</div>

<style>
  .seat-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
  }

  .name {
    margin: 0;
    font-size: var(--font-size-m);
    font-weight: 700;
  }

  .stats {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--font-size-s);
  }

  .stats div {
    display: flex;
    gap: 0.25em;
  }

  .stats dt {
    color: var(--color-text-muted);
  }

  .stats dd {
    margin: 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .balance {
    margin-left: auto;
  }

  .thinking {
    margin: 0;
    font-size: var(--font-size-s);
    color: var(--color-event-go);
  }

  .progress {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-s);
  }

  .progress li {
    padding: 0 var(--space-2);
    border-radius: 999px;
    background: oklch(20% 0.03 160 / 0.7);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .progress .counter {
    padding: 0 var(--space-1);
    background: none;
    border: 1px solid oklch(45% 0.03 160);
    color: var(--color-text-muted);
  }

  /* 3뻑이면 즉시 끝난다 (E5): 2뻑부터 눈에 띄게 */
  .progress .danger {
    border-color: var(--color-event-ppeok);
    color: var(--color-event-ppeok-text);
    font-weight: 700;
  }
</style>
