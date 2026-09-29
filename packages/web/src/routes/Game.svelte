<script lang="ts" module>
  export interface MenuItem {
    readonly id: string;
    readonly label: string;
    /** 누르면 한 번 더 확인한다 */
    readonly confirm?: string;
  }
</script>

<script lang="ts">
  // 게임 화면 (spec 2.3·6.2): 솔로·호스트·게스트 공통. 게임판 + 판이 끝나면 정산을 위에 덮는다.
  // 게임판은 정산 중에도 마운트된 채로 둔다(다음 판 분배 애니메이션의 기준점, src/anim/choreo.ts).
  // 오른쪽 위 메뉴(이슈 #10)에서 계속·설정·홈·세션 종료(확인). Android Back은 메뉴를 연다/닫는다.
  // data-* 속성은 E2E 자동 플레이·원장 검사·턴 시간 계측(spec AC-04·AC-06)이 읽는다.
  import { tick, untrack } from 'svelte';
  import type { GameController } from '../game/controller.ts';
  import { formatMoney } from '../lib/format.ts';
  import { settings } from '../settings/settings.svelte.ts';
  import Board from '../ui/Board.svelte';
  import Settlement from './Settlement.svelte';

  interface Props {
    controller: GameController;
    /** 메뉴 항목 (없으면 계속하기만) */
    menu?: readonly MenuItem[];
    onmenu?: ((id: string) => void) | undefined;
    /** 정산 화면의 "종료" */
    onend?: (() => void) | undefined;
    /** 종료 알림 뒤 마지막 정산을 유지하고 새 참가로 이동한다 */
    ended?: boolean;
    onfresh?: (() => void) | undefined;
    onreconnect?: (() => void) | undefined;
    /** 호스트: 게스트가 3분 넘게 돌아오지 않음 (spec 2.4) */
    waiting?: boolean;
    onwait?: (() => void) | undefined;
    /** 호스트: LAN 전체에 열린 주소만 표시 경고 (NF-06, 브리지 hotspot.warning) */
    warning?: string | null;
    backToken?: number;
    onrecords?: (() => void) | undefined;
  }

  let {
    controller,
    menu = [],
    onmenu,
    onend,
    ended = false,
    onfresh,
    onreconnect,
    waiting = false,
    onwait,
    warning = null,
    backToken = 0,
    onrecords,
  }: Props = $props();

  const pb = $derived(controller.playback);
  let root = $state<HTMLElement | null>(null);

  $effect(() => {
    const c = controller;
    const el = root;
    if (el === null) return;
    // 붙이는 동안 재생 큐가 읽는 값(정산·토스트 등)에 이 효과가 묶이지 않게 한다
    untrack(() => c.attach(el));
    return () => untrack(() => c.attach(null));
  });

  const extras = $derived({
    pickFirst: pb.board.firstPick,
    bombMonths: pb.board.bombMonths,
    canFlipOnly: pb.board.canFlipOnly,
    goStop: pb.board.goStop,
    dealer: pb.board.dealer,
  });

  /** 카드 내기 계열 액션의 탭→턴 종료 시간 (spec AC-06) */
  const playTimings = $derived(
    pb.timings
      .filter((t) => t.action === 'play' || t.action === 'bomb' || t.action === 'flipOnly')
      .map((t) => t.ms)
      .join(','),
  );
  const playPlans = $derived(
    pb.timings
      .filter((t) => t.action === 'play' || t.action === 'bomb' || t.action === 'flipOnly')
      .map((t) => t.plannedMs)
      .join(','),
  );
  const stats = $derived(controller.stats);

  // ---- 메뉴 (이슈 #10) ----
  let menuDialog = $state<HTMLDialogElement | null>(null);
  let confirming = $state<MenuItem | null>(null);
  let menuOpen = $state(false);
  let previousFocus: HTMLElement | null = null;
  // 새 Game 인스턴스는 이미 전달된 Back을 소비한 상태에서 시작한다.
  let handledBackToken = untrack(() => backToken);

  function openMenu() {
    if (menuDialog?.open) return;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirming = null;
    menuOpen = true;
    menuDialog?.showModal();
  }

  function closeMenu() {
    menuDialog?.close();
    menuOpen = false;
    confirming = null;
    const target = previousFocus;
    previousFocus = null;
    void tick().then(() => {
      if (target?.isConnected) target.focus();
    });
  }

  $effect(() => {
    if (backToken === handledBackToken) return;
    handledBackToken = backToken;
    if (menuDialog?.open) closeMenu();
    else openMenu();
  });

  function choose(item: MenuItem) {
    if (item.confirm !== undefined && confirming?.id !== item.id) {
      confirming = item;
      return;
    }
    closeMenu();
    onmenu?.(item.id);
  }

  function endConfirm(item: MenuItem): string | undefined {
    if (controller.pushDecision !== null) {
      if (controller.mode === 'guest')
        return '아직 정산되지 않은 판입니다. 지금 나가면 금액은 이동하지 않고 호스트가 선택을 기다립니다.';
      return `아직 밀지 않은 판입니다. 받기 정산 ${formatMoney(controller.pushDecision.acceptAmount ?? 0, settings.value.unit)}을 확정한 뒤 세션을 끝냅니다. 밀면 이번 판 지급 0${settings.value.unit}이며 ${controller.pushDecision.forfeitedPoints ?? 0}점을 포기합니다.`;
    }
    const settlement = pb.settlement?.view;
    if (settlement?.pushed)
      return `이미 민 판은 정산 0${settlement.unit}입니다. ${settlement.forfeitedPoints ?? 0}점은 포기한 채 유지하며 별도 환급 없이 끝냅니다.`;
    return item.confirm;
  }

  function endFromSettlement() {
    if (pb.settlement?.view.pushed) {
      const item = menu.find((entry) => entry.id === 'end' || entry.id === 'leave');
      if (item) {
        openMenu();
        confirming = item;
        return;
      }
    }
    onend?.();
  }

  function endFromWait() {
    const item = menu.find((entry) => entry.id === 'end');
    if (item) {
      waitDialog?.close();
      openMenu();
      confirming = item;
    } else onmenu?.('end');
  }

  let waitDialog = $state<HTMLDialogElement | null>(null);
  $effect(() => {
    const dialog = waitDialog;
    if (dialog === null) return;
    if (waiting && !dialog.open) dialog.showModal();
    if (!waiting && dialog.open) dialog.close();
  });
</script>

<div
  class="game"
  data-testid={controller.mode === 'solo' ? 'solo' : 'match'}
  data-mode={controller.mode}
  data-round={stats.round}
  data-phase={stats.phase}
  data-rounds-played={stats.roundsPlayed}
  data-balances={stats.balances.join(',')}
  data-refilled={stats.refilled?.join(',') ?? ''}
  data-start-balance={stats.startBalance}
  data-seq={stats.seq ?? ''}
  data-can-act={controller.canAct}
  data-play-timings={playTimings}
  data-play-plans={playPlans}
>
  <div
    class="board-wrap"
    inert={pb.settlement !== null || controller.pushDecision != null || menuOpen || ended}
  >
    <Board
      view={pb.board}
      {extras}
      unit={settings.value.unit}
      banner={pb.banner}
      toast={pb.toast}
      busy={pb.busy || !controller.canAct}
      thinking={controller.thinking}
      turnMs={pb.lastTiming?.ms ?? null}
      onaction={(action, at) => controller.submit(action, at)}
      onskip={() => controller.skipAnimations()}
      onnotice={(text) => pb.showToast(text)}
      bind:root
    />
  </div>

  <button
    type="button"
    class="menu-button"
    aria-label="게임 메뉴"
    aria-haspopup="dialog"
    data-testid="game-menu"
    onclick={openMenu}
  >
    <span aria-hidden="true">☰</span>
  </button>

  {#if controller.notice}
    <p class="notice" role="status" data-testid="game-notice">{controller.notice}</p>
  {/if}

  {#if controller.mode !== 'solo' && 'link' in controller && controller.link === 'replaced'}
    <button type="button" class="reconnect" onclick={() => onreconnect?.()}>다시 연결</button>
  {/if}

  {#if ended && controller.mode !== 'solo' && pb.settlement === null}
    <button type="button" class="fresh" onclick={() => onfresh?.()}>새로 참가</button>
  {/if}

  {#if ended && controller.mode === 'solo'}
    <div class="overlay ended" data-testid="session-ended">
      <h1>세션 종료</h1>
      <p>{stats.roundsPlayed}판 진행 · 최종 잔액 {stats.balances[0]}냥 / {stats.balances[1]}냥</p>
      <button type="button" class="item primary" data-choice="fresh" onclick={() => onfresh?.()}
        >새 게임</button
      >
      <button type="button" class="item" data-choice="records" onclick={() => onrecords?.()}
        >기록 보기</button
      >
    </div>
  {:else if pb.settlement || controller.pushDecision}
    <div class="overlay" inert={menuOpen}>
      <Settlement
        view={pb.settlement?.view ?? null}
        instant={pb.settlement?.instant ?? []}
        nextCarry={pb.settlement?.nextCarry ?? null}
        decision={controller.pushDecision}
        guest={controller.mode === 'guest'}
        onpush={(push) => controller.choosePush(push)}
        bankrupt={controller.bankrupt}
        note={controller.settlementNote ?? null}
        waiting={controller.settlementWaiting ?? false}
        {ended}
        onnext={() => controller.nextRound()}
        onrefill={() => controller.refill()}
        onend={endFromSettlement}
        onfresh={() => onfresh?.()}
      />
    </div>
  {/if}

  <dialog
    class="sheet"
    bind:this={menuDialog}
    aria-labelledby="game-menu-title"
    oncancel={(event) => {
      event.preventDefault();
      closeMenu();
    }}
    onclose={() => {
      menuOpen = false;
      confirming = null;
    }}
  >
    <h2 id="game-menu-title">메뉴</h2>
    {#if confirming}
      <p class="confirm" role="alert">{endConfirm(confirming)}</p>
    {/if}
    {#if warning}
      <p class="lan-warning" role="note">{warning}</p>
    {/if}
    <div class="items">
      <button type="button" class="item primary" data-menu="resume" onclick={closeMenu}
        >계속하기</button
      >
      {#each menu as item (item.id)}
        <button
          type="button"
          class={['item', { danger: confirming?.id === item.id }]}
          data-menu={item.id}
          onclick={() => choose(item)}
          >{confirming?.id === item.id ? `${item.label} (한 번 더 누르기)` : item.label}</button
        >
      {/each}
    </div>
  </dialog>

  <dialog class="sheet" bind:this={waitDialog} aria-labelledby="game-wait-title">
    <h2 id="game-wait-title">상대가 돌아오지 않습니다</h2>
    <p>3분 넘게 연결이 끊겨 있습니다. 판은 그대로 멈춰 있습니다.</p>
    <div class="items">
      <button type="button" class="item primary" data-menu="wait" onclick={() => onwait?.()}
        >계속 기다리기</button
      >
      {#if controller.pushDecision?.winner === false && controller.acceptAbsentWinner}
        <button
          type="button"
          class="item"
          data-menu="accept-absent"
          onclick={() => controller.acceptAbsentWinner?.()}>부재한 승자 대신 받기</button
        >
      {/if}
      <button type="button" class="item" data-menu="end" onclick={endFromWait}>세션 종료</button>
    </div>
  </dialog>
</div>

<style>
  .game {
    position: relative;
  }

  /* 메뉴 버튼 자리: 상대 정보 줄 오른쪽을 비운다 */
  .menu-button {
    position: absolute;
    top: max(var(--space-2), env(safe-area-inset-top));
    right: max(var(--space-3), env(safe-area-inset-right));
    display: grid;
    place-items: center;
    width: var(--touch-min);
    height: var(--touch-min);
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: oklch(20% 0.03 160 / 0.8);
    color: var(--color-text);
    font-size: 1.25rem;
    z-index: 70;
  }

  .notice {
    position: fixed;
    left: 50%;
    top: calc(max(var(--space-1), env(safe-area-inset-top)) + var(--touch-min) + var(--space-2));
    translate: -50% 0;
    max-width: 90%;
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border-radius: 999px;
    background: oklch(30% 0.1 40 / 0.95);
    font-size: var(--font-size-s);
    text-align: center;
    pointer-events: none;
    z-index: 16;
  }

  .reconnect,
  .fresh {
    position: fixed;
    right: var(--space-3);
    top: calc(max(var(--space-1), env(safe-area-inset-top)) + var(--touch-min) + var(--space-2));
    min-height: var(--touch-min);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    z-index: 21;
  }

  .overlay {
    position: fixed;
    inset: 0;
    overflow: auto;
    background: var(--color-bg);
    z-index: 20;
  }

  .ended {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    text-align: center;
  }

  .ended p {
    margin: 0;
  }

  .sheet {
    width: min(22rem, calc(100% - 2 * var(--space-4)));
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .sheet::backdrop {
    background: oklch(0% 0 0 / 0.55);
  }

  .sheet h2 {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-l);
    text-align: center;
  }

  .sheet p {
    margin: 0 0 var(--space-3);
  }

  .confirm {
    color: var(--color-event-go);
  }

  .lan-warning {
    padding: var(--space-2) var(--space-3);
    border-left: 3px solid var(--color-event-ppeok);
    font-size: var(--font-size-s);
  }

  .items {
    display: grid;
    gap: var(--space-2);
  }

  .item {
    min-height: var(--touch-min);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-weight: 700;
  }

  .item.primary {
    background: var(--color-accent);
    border-color: transparent;
    color: var(--color-on-accent);
  }

  .item.danger {
    border-color: var(--color-event-ppeok);
  }
</style>
