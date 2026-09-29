<script lang="ts">
  import Scene from '../pro-assets/Scene.svelte';
  // 게임판 (spec 6.2): 상단 상대 정보·획득패, 중앙 바닥·더미, 하단 내 획득패·상태·손패, 오버레이(배너·선택 창).
  // 보는 좌석(view.viewer)의 입력을 엔진 액션으로 만들어 onaction으로 올린다. 규칙 검증은 엔진(legalActions)이 한다.
  // 재생 중(busy)에는 입력을 받지 않고, 판을 탭하면 남은 애니메이션을 건너뛴다(spec 6.3, onskip).
  // data-anchor는 애니메이션 기준점(src/anim/choreo.ts), data-* 상태 속성은 E2E 자동 플레이·계측용이다.
  import { getCard, type Action, type CardId, type Month } from '@p2p-gostop/engine';
  import type { BoardExtras } from '../game/adapter.ts';
  import { boardNotices } from '../game/display.ts';
  import type { BoardView, MoneyUnit, SeatView } from '../lib/view-types.ts';
  import { bannerActor, type Banner } from './banner.ts';
  import CapturedPile from './CapturedPile.svelte';
  import ChoicePrompt from './ChoicePrompt.svelte';
  import EventBanner from './EventBanner.svelte';
  import Floor from './Floor.svelte';
  import GoStopModal from './GoStopModal.svelte';
  import Hand from './Hand.svelte';
  import PickFirstPrompt from './PickFirstPrompt.svelte';
  import SeatBar from './SeatBar.svelte';
  import { seatStats, type SeatExtras } from './seat-stats.ts';
  import TargetModal from './TargetModal.svelte';

  type BoardSeat = SeatView & SeatExtras;

  interface Props {
    /** 좌석에 표시용 값(국진 위치·폭탄 횟수)이 있으면 쓰고, 없으면(프로토콜 뷰·픽스처) 진행도에서 읽는다 */
    view: BoardView & {
      readonly seats: readonly [BoardSeat, BoardSeat];
      readonly staging?: readonly CardId[];
      readonly highlight?: readonly CardId[];
    };
    extras?: BoardExtras | null;
    unit?: MoneyUnit;
    banner?: (Banner & { readonly id?: number }) | null;
    toast?: { readonly id: number; readonly text: string } | null;
    /** 이벤트 재생 중 (입력 잠금) */
    busy?: boolean;
    /** 상대(CPU)가 생각 중 */
    thinking?: boolean;
    /** 마지막 탭→턴 종료 시간 ms (spec AC-06 계측, E2E가 읽는다) */
    turnMs?: number | null;
    onaction?: ((action: Action, at: number) => void) | undefined;
    onskip?: (() => void) | undefined;
    /**
     * 짧게 알릴 문구 (국진 열끗↔쌍피 이동, 피 뺏기: M3 리뷰 S-2·I-4). 한 번만 부른다.
     * 표시·지우기(토스트 타이머)는 부르는 쪽이 한다.
     */
    onnotice?: ((text: string) => void) | undefined;
    /** 보드 루트 요소 (애니메이션 측정·건너뛰기 범위) */
    root?: HTMLElement | null;
  }

  let {
    view,
    extras = null,
    unit = '냥',
    banner = null,
    toast = null,
    busy = false,
    thinking = false,
    turnMs = null,
    onaction,
    onskip,
    onnotice,
    root = $bindable(null),
  }: Props = $props();

  const seat = $derived(view.viewer);
  const me = $derived(view.seats[seat]);
  const opponent = $derived(view.seats[seat === 0 ? 1 : 0]);
  const myStats = $derived(seatStats(me));
  const opponentStats = $derived(seatStats(opponent));
  const actor = $derived(banner ? bannerActor(banner, seat) : null);

  /** 직전에 그린 판 (알림 비교용, 반응형일 필요 없음) */
  let previous: Props['view'] | null = null;
  $effect(() => {
    const next = view;
    const prev = previous;
    previous = next;
    if (prev === null || onnotice === undefined) return;
    for (const text of boardNotices(prev, next)) onnotice(text);
  });
  const pending = $derived(!busy && view.pending?.seat === seat ? view.pending : null);
  const pickFirst = $derived(busy ? null : (extras?.pickFirst ?? null));
  const playable = $derived(busy ? [] : view.playable);
  const floorMonths = $derived(new Set(view.floor.map((g) => g.month)));
  const matchable = $derived(
    playable.filter((id) => {
      const month = getCard(id).month;
      return month === null || floorMonths.has(month);
    }),
  );

  /** 누르고 있는 손패 카드 (먹게 될 바닥 카드 미리보기, spec 6.3) */
  let preview = $state<CardId | null>(null);
  /** 폭탄을 할 수 있는 월의 카드를 탭했을 때 확인 */
  let bombCard = $state<CardId | null>(null);

  const previewCards = $derived.by(() => {
    if (preview === null) return [];
    const month = getCard(preview).month;
    return view.floor.find((g) => g.month === month)?.cards ?? [];
  });
  const floorHighlight = $derived([
    ...(pending?.kind === 'target' ? pending.options : []),
    ...(view.highlight ?? []),
    ...previewCards,
  ]);
  const awaiting = $derived(pending !== null || pickFirst !== null);

  function act(action: Action, at = performance.now()) {
    bombCard = null;
    preview = null;
    onaction?.(action, at);
  }

  function play(card: CardId, at: number) {
    const month = getCard(card).month;
    if (month !== null && extras?.bombMonths.includes(month)) {
      bombCard = card;
      return;
    }
    act({ type: 'play', seat, card }, at);
  }

  function bombMonth(): Month | null {
    return bombCard === null ? null : getCard(bombCard).month;
  }

  function handCardsOfMonth(month: Month | null): CardId[] {
    return (me.hand ?? []).filter((id) => getCard(id).month === month);
  }

  function skipIfBusy() {
    if (busy) onskip?.();
  }
</script>

<section
  class="board"
  aria-label="게임판"
  aria-busy={busy}
  data-testid="board"
  data-awaiting={awaiting || (!busy && playable.length > 0) ? 'me' : 'other'}
  data-busy={busy}
  data-turn-ms={turnMs}
  bind:this={root}
  onpointerdowncapture={skipIfBusy}
>
  <Scene scene="table" />
  <SeatBar
    who="상대"
    name={opponent.name}
    stats={opponentStats}
    score={opponent.score}
    goCount={opponent.goCount}
    shakes={opponent.shakes}
    ppeokCount={opponent.ppeokCount}
    bombs={opponent.bombs ?? null}
    balance={opponent.balance}
    {unit}
    handCount={opponent.handCount}
    {thinking}
    anchor="opp-hand"
  />
  <CapturedPile stats={opponentStats} label="상대 획득패" highlight={view.highlight ?? []} />

  <div class="center">
    <Floor
      groups={view.floor}
      deckCount={view.deckCount}
      highlight={floorHighlight}
      staging={view.staging ?? []}
    />
    <div class={['banner-layer', actor === '상대' ? 'at-top' : actor === '나' ? 'at-bottom' : '']}>
      {#if banner}
        {#key banner.id ?? banner.text}
          <EventBanner kind={banner.kind} text={banner.text} {actor} />
        {/key}
      {/if}
    </div>
    {#if toast}
      {#key toast.id}
        <p class="toast" role="status">{toast.text}</p>
      {/key}
    {/if}
  </div>

  <CapturedPile stats={myStats} label="내 획득패" highlight={view.highlight ?? []} />
  <SeatBar
    who="나"
    name={me.name}
    stats={myStats}
    score={me.score}
    goCount={me.goCount}
    shakes={me.shakes}
    ppeokCount={me.ppeokCount}
    bombs={me.bombs ?? null}
    balance={me.balance}
    {unit}
    multiplier={view.multiplier}
  />
  <Hand
    cards={me.hand ?? []}
    {playable}
    {matchable}
    onplay={play}
    onpreview={(id) => (preview = id)}
  />
  {#if !busy && extras?.canFlipOnly}
    <button
      type="button"
      class="flip-only"
      data-choice="flipOnly"
      onclick={(e) => act({ type: 'flipOnly', seat }, e.timeStamp)}>폭탄패로 뒤집기</button
    >
  {/if}

  {#if pickFirst}
    <PickFirstPrompt
      poolSize={pickFirst.poolSize}
      taken={pickFirst.taken}
      onpick={(index) => act({ type: 'pickFirst', seat, index })}
    />
  {:else if bombCard !== null && pending?.kind === 'play'}
    {@const month = bombMonth()}
    <ChoicePrompt
      title="폭탄?"
      message={`${month}월 ${handCardsOfMonth(month).length}장으로 바닥 패를 한꺼번에 먹습니다`}
      cards={handCardsOfMonth(month)}
      choices={[
        { id: 'bomb', label: '폭탄', primary: true },
        { id: 'single', label: '한 장만' },
        { id: 'cancel', label: '취소' },
      ]}
      onchoose={(id) => {
        const card = bombCard;
        if (id === 'cancel' || card === null || month === null) bombCard = null;
        else if (id === 'bomb') act({ type: 'bomb', seat, month });
        else act({ type: 'play', seat, card });
      }}
    />
  {:else if pending?.kind === 'target'}
    <TargetModal
      card={pending.card}
      source={pending.source}
      options={pending.options}
      onchoose={(card) => act({ type: 'chooseTarget', seat, card })}
    />
  {:else if pending?.kind === 'goStop'}
    <GoStopModal
      score={pending.score}
      goCount={pending.goCount}
      stopAmount={pending.stopAmount}
      {unit}
      detail={extras?.goStop ?? null}
      opponent={{ name: opponent.name, score: opponent.score, pi: opponentStats.piCount }}
      ongo={() => act({ type: 'go', seat })}
      onstop={() => act({ type: 'stop', seat })}
    />
  {:else if pending?.kind === 'shake'}
    <ChoicePrompt
      title="흔들까요?"
      message={`${pending.month}월 ${handCardsOfMonth(pending.month).length}장을 보여 주고 이기면 ×2`}
      cards={handCardsOfMonth(pending.month)}
      choices={[
        { id: 'shake', label: '흔들기', primary: true },
        { id: 'noShake', label: '그냥 내기' },
      ]}
      onchoose={(id) => act({ type: 'shake', seat, accept: id === 'shake' })}
    />
  {:else if pending?.kind === 'chongtong'}
    <ChoicePrompt
      title="총통!"
      message={`${pending.months.join('·')}월 4장. 끝내면 바로 이깁니다`}
      cards={handCardsOfMonth(pending.months[0] ?? null)}
      choices={[
        { id: 'end', label: '끝내기', primary: true },
        { id: 'continue', label: '계속하기' },
      ]}
      onchoose={(id) => act({ type: 'chongtong', seat, choice: id === 'end' ? 'end' : 'continue' })}
    />
  {:else if pending?.kind === 'gukjin'}
    <ChoicePrompt
      title="국진을 어디에 둘까요?"
      message="9월 열끗(국진)은 열끗 또는 쌍피로 셀 수 있습니다"
      choices={[
        { id: 'yeol', label: '열끗' },
        { id: 'pi', label: '쌍피', primary: true },
      ]}
      onchoose={(id) => act({ type: 'gukjin', seat, asPi: id === 'pi' })}
    />
  {/if}
</section>

<style>
  .board {
    position: relative;
    display: grid;
    grid-template-rows: auto auto 1fr auto auto auto;
    gap: var(--space-2);
    min-height: 100dvh;
    padding: max(var(--space-2), env(safe-area-inset-top)) var(--space-3)
      max(var(--space-2), env(safe-area-inset-bottom));
    background:
      radial-gradient(ellipse at 50% 45%, oklch(38% 0.07 160), transparent 70%), var(--color-felt);
    overflow: hidden;
  }

  .center {
    position: relative;
    display: grid;
    align-content: center;
  }

  .banner-layer {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    z-index: 3;
  }

  /* 배너는 한 사람의 쪽에 뜬다: 상대는 바닥 위쪽, 나는 아래쪽 (M3 리뷰 I-4) */
  .banner-layer.at-top {
    align-items: start;
  }

  .banner-layer.at-bottom {
    align-items: end;
  }

  .toast {
    position: absolute;
    left: 50%;
    top: 0;
    translate: -50% -50%;
    max-width: 90%;
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border-radius: 999px;
    background: oklch(15% 0.02 260 / 0.9);
    font-size: var(--font-size-s);
    text-align: center;
    pointer-events: none;
    z-index: 3;
  }

  .flip-only {
    justify-self: center;
    min-height: var(--touch-min);
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-weight: 700;
  }
</style>
