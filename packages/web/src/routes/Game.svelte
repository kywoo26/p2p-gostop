<script lang="ts">
  // 혼자 연습 게임 화면 (spec 2.5·6.2): 게임판 + 판이 끝나면 정산을 위에 덮는다.
  // 게임판은 정산 중에도 마운트된 채로 둔다(다음 판 분배 애니메이션의 기준점, src/anim/choreo.ts).
  // data-* 속성은 E2E 자동 플레이·원장 검사·턴 시간 계측(spec AC-04·AC-06)이 읽는다.
  import { toSettlementView } from '../game/adapter.ts';
  import { current } from '../game/current.svelte.ts';
  import { settings } from '../settings/settings.svelte.ts';
  import Board from '../ui/Board.svelte';
  import Screen from '../ui/Screen.svelte';
  import { INSTANT_LABEL } from '../ui/settle-labels.ts';
  import Settlement from './Settlement.svelte';

  // 앱을 #/game으로 다시 열면 저장된 세션을 바로 이어받는다 (MN-05)
  if (current.solo === null && current.resumable !== null) current.resumeSolo(settings.value);

  const solo = $derived(current.solo);
  let root = $state<HTMLElement | null>(null);

  $effect(() => {
    const session = solo;
    const el = root;
    if (session === null || el === null) return;
    session.attach(el);
    return () => session.attach(null);
  });

  const settlement = $derived.by(() => {
    if (solo === null || !solo.settlementReady) return null;
    const state = solo.state;
    const record = state.records.at(-1);
    if (record === undefined) return null;
    return {
      view: toSettlementView({
        settlement: record.settlement,
        captured: record.captured,
        names: state.config.names,
        unit: settings.value.unit,
        perPoint: state.config.perPoint,
        amount: record.amount,
        before: record.before,
        after: record.after,
      }),
      instant: record.settlement.instantPayouts.map((p) => ({
        label: INSTANT_LABEL[p.kind] ?? p.kind,
        name: state.config.names[p.to],
        points: p.points,
      })),
      nextCarry: record.winner === null ? record.settlement.nextCarry : null,
      bankrupt: state.phase === 'bankrupt',
    };
  });

  /** 카드 내기 계열 액션의 탭→턴 종료 시간 (spec AC-06) */
  const playTimings = $derived(
    (solo?.timings ?? [])
      .filter((t) => t.action === 'play' || t.action === 'bomb' || t.action === 'flipOnly')
      .map((t) => t.ms)
      .join(','),
  );

  function endSession() {
    solo?.end();
    location.hash = '#/records';
  }
</script>

{#if solo === null}
  <Screen title="혼자 연습">
    <p>진행 중인 게임이 없습니다.</p>
    {#snippet actions()}
      <a class="button primary" href="#/solo">새 게임</a>
    {/snippet}
  </Screen>
{:else}
  <div
    class="game"
    data-testid="solo"
    data-round={solo.state.roundNumber}
    data-phase={solo.state.phase}
    data-rounds-played={solo.state.records.length}
    data-balances={solo.state.ledger.balances.join(',')}
    data-refilled={solo.state.refilled.join(',')}
    data-start-balance={solo.state.config.startBalance}
    data-play-timings={playTimings}
  >
    <div class="board-wrap" inert={settlement !== null}>
      <Board
        view={solo.board}
        extras={solo.extras}
        unit={settings.value.unit}
        banner={solo.banner}
        toast={solo.toast}
        busy={solo.busy || !solo.awaitingHuman}
        thinking={solo.thinking}
        turnMs={solo.lastTiming?.ms ?? null}
        onaction={(action, at) => solo.submit(action, at)}
        onskip={() => solo.skipAnimations()}
        bind:root
      />
    </div>
    {#if settlement}
      <div class="overlay">
        <Settlement
          view={settlement.view}
          instant={settlement.instant}
          nextCarry={settlement.nextCarry}
          bankrupt={settlement.bankrupt}
          onnext={() => solo.nextRound()}
          onrefill={() => solo.refill()}
          onend={endSession}
        />
      </div>
    {/if}
  </div>
{/if}

<style>
  .game {
    position: relative;
  }

  .overlay {
    position: fixed;
    inset: 0;
    overflow: auto;
    background: var(--color-bg);
    z-index: 20;
  }
</style>
