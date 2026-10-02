<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { getCoordinator } from '../app/context.ts';
  import { uiState, type AppRoute } from '../app/navigation.ts';
  import { log } from '../game/log.svelte.ts';
  import Screen from '../ui/Screen.svelte';
  const app = getCoordinator();
  const back = $derived<AppRoute>(
    app.current.solo || app.current.resumable
      ? '/game'
      : app.match
        ? '/match'
        : app.remoteActive
          ? '/remote'
          : '/',
  );
  let retrying = $state(false);
  let retryFailed = $state(false);
  async function retry() {
    if (retrying) return;
    retrying = true;
    try {
      await goto(page.url.href, {
        replace: true,
        refreshAll: true,
        state: uiState(page.state),
        persistState: page.state.returnTo !== undefined,
      });
      retryFailed = page.error !== null;
    } catch {
      retryFailed = true;
      log.error('화면을 열지 못했습니다.');
    } finally {
      retrying = false;
    }
  }
</script>

<svelte:head><title>맞고 · 화면 오류</title></svelte:head>
<Screen title="화면을 열지 못했습니다" back={resolve(back)}>
  <p role="alert">진행 중인 게임은 유지됩니다. 다시 시도하거나 이전 화면으로 돌아가세요.</p>
  {#if retryFailed}<p>새로고침해도 열리지 않으면 이전 화면으로 돌아가세요.</p>{/if}
  {#snippet actions()}
    <button class="button primary" disabled={retrying} onclick={() => void retry()}
      >다시 시도</button
    >
    {#if retryFailed}
      <button class="button" onclick={() => location.reload()}>새로고침</button>
    {/if}
    <a class="button" href={resolve(back)}>{back === '/' ? '홈으로' : '게임으로 돌아가기'}</a>
  {/snippet}
</Screen>
