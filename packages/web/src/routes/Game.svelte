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
  // 오른쪽 위 메뉴(이슈 #10)에서 계속·설정·홈·세션 종료(확인). Android 뒤로 가기는 브리지 gameActive로 확인 창이 된다.
  // data-* 속성은 E2E 자동 플레이·원장 검사·턴 시간 계측(spec AC-04·AC-06)이 읽는다.
  import type { GameController } from '../game/controller.ts';
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
    /** 호스트: 게스트가 3분 넘게 돌아오지 않음 (spec 2.4) */
    waiting?: boolean;
    onwait?: (() => void) | undefined;
    /** 호스트: LAN 전체에 열린 주소만 표시 경고 (NF-06, 브리지 hotspot.warning) */
    warning?: string | null;
  }

  let {
    controller,
    menu = [],
    onmenu,
    onend,
    waiting = false,
    onwait,
    warning = null,
  }: Props = $props();

  const pb = $derived(controller.playback);
  let root = $state<HTMLElement | null>(null);

  $effect(() => {
    const c = controller;
    const el = root;
    if (el === null) return;
    c.attach(el);
    return () => c.attach(null);
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
  const stats = $derived(controller.stats);

  // ---- 메뉴 (이슈 #10) ----
  let menuDialog = $state<HTMLDialogElement | null>(null);
  let confirming = $state<MenuItem | null>(null);

  function openMenu() {
    confirming = null;
    menuDialog?.showModal();
  }

  function closeMenu() {
    menuDialog?.close();
    confirming = null;
  }

  function choose(item: MenuItem) {
    if (item.confirm !== undefined && confirming?.id !== item.id) {
      confirming = item;
      return;
    }
    closeMenu();
    onmenu?.(item.id);
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
>
  <div class="board-wrap" inert={pb.settlement !== null}>
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

  {#if pb.settlement}
    <div class="overlay">
      <Settlement
        view={pb.settlement.view}
        instant={pb.settlement.instant}
        nextCarry={pb.settlement.nextCarry}
        bankrupt={controller.bankrupt}
        onnext={() => controller.nextRound()}
        onrefill={() => controller.refill()}
        onend={() => onend?.()}
      />
    </div>
  {/if}

  <dialog
    class="sheet"
    bind:this={menuDialog}
    aria-labelledby="game-menu-title"
    onclose={() => (confirming = null)}
  >
    <h2 id="game-menu-title">메뉴</h2>
    {#if confirming}
      <p class="confirm" role="alert">{confirming.confirm}</p>
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
      <button type="button" class="item" data-menu="end" onclick={() => onmenu?.('end')}
        >세션 종료</button
      >
    </div>
  </dialog>
</div>

<style>
  .game {
    position: relative;
  }

  /* 메뉴 버튼 자리: 상대 정보 줄 오른쪽을 비운다 */
  .game :global([data-anchor='opp-hand']) {
    padding-right: calc(var(--touch-min) + var(--space-1));
  }

  .menu-button {
    position: absolute;
    top: max(var(--space-1), env(safe-area-inset-top));
    right: var(--space-2);
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
    z-index: 15;
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

  .overlay {
    position: fixed;
    inset: 0;
    overflow: auto;
    background: var(--color-bg);
    z-index: 20;
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
