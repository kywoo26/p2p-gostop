<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { getCoordinator } from '../app/context.ts';
  import { returnRoute, uiState, type AppRoute } from '../app/navigation.ts';
  import { log } from '../game/log.svelte.ts';
  import Screen from '../ui/Screen.svelte';
  const app = getCoordinator();
  const back = $derived.by<AppRoute>(() => {
    const solo = app.current.resumable !== null;
    const match = app.match !== null;
    // 복귀 화면의 소유자가 끝났다면 다른 게임으로 보내지 않는다.
    if (page.state.returnTo !== undefined) {
      switch (returnRoute(page.state.returnTo)) {
        case '/game':
          return solo ? '/game' : '/';
        case '/match':
          return match ? '/match' : '/';
        case '/remote':
          return app.remoteActive ? '/remote' : '/';
        default:
          return '/';
      }
    }
    // 직접 오류 주소로 진입하여 복귀 정보가 없으면 단일 유효 소유만 복구한다.
    if (solo && (match || app.remoteActive)) return '/';
    return solo ? '/game' : match ? '/match' : app.remoteActive ? '/remote' : '/';
  });
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
  <p role="alert">화면을 다시 시도하거나 아래 복귀 경로를 이용하세요.</p>
  {#if app.remoteActive}
    <p>새로고침하면 이 기기의 원격 대전 상태를 잃습니다. 새로고침하지 않고 돌아가세요.</p>
  {:else if retryFailed}
    <p>새로고침해도 열리지 않을 수 있습니다. 저장된 게임은 복귀 경로에서 확인하세요.</p>
  {/if}
  {#snippet actions()}
    <button class="button primary" disabled={retrying} onclick={() => void retry()}
      >다시 시도</button
    >
    {#if retryFailed && !app.remoteActive}
      <button class="button" onclick={() => location.reload()}>새로고침</button>
    {/if}
    <a class="button" href={resolve(back)}>{back === '/' ? '홈으로' : '게임으로 돌아가기'}</a>
  {/snippet}
</Screen>
