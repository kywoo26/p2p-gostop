<script lang="ts">
  import { navigating } from '$app/state';
  import { onNavigate } from '$app/navigation';
  let visible = $state(false);
  $effect(() => {
    visible = false;
    if (!navigating.to || navigating.shallow) return;
    const timer = setTimeout(() => (visible = true), 180);
    return () => clearTimeout(timer);
  });
  onNavigate((navigation) => {
    // 게임판 WAAPI와 route 화면 전환은 겹치지 않는다. 미지원/동작 줄이기는 즉시 이동한다.
    if (
      navigation.shallow ||
      !document.startViewTransition ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const games = ['/game', '/match', '/guest', '/join', '/solo', '/versus', '/remote'];
    if (
      games.includes(navigation.from?.route?.id ?? '') ||
      games.includes(navigation.to?.route?.id ?? '')
    )
      return;
    return new Promise<void>((ready) => {
      try {
        const transition = document.startViewTransition(async () => {
          ready();
          await navigation.complete.catch(() => {});
        });
        // 숨겨진 문서/겹친 전환은 snapshot 콜백 전에 실패할 수 있다. 이동은 계속한다.
        void transition.ready.catch(() => ready());
        void transition.updateCallbackDone.catch(() => {});
        void transition.finished.catch(() => ready());
      } catch {
        ready();
      }
    });
  });
</script>

{#if visible}
  <div class="navigation-status" role="status">화면을 여는 중…</div>
{/if}

<style>
  .navigation-status {
    position: fixed;
    top: max(8px, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-menu);
    padding: 8px 16px;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 14px;
    pointer-events: none;
  }
  :global(::view-transition-old(root)),
  :global(::view-transition-new(root)) {
    animation-duration: 150ms;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(::view-transition-old(root)),
    :global(::view-transition-new(root)) {
      animation: none;
    }
  }
</style>
