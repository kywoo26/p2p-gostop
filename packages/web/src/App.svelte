<script lang="ts">
  // 앱 내부 해시 라우팅 (SvelteKit 아님, AGENTS.md 3장). 게스트는 http origin이라 해시가 가장 단순하다.
  import Home from './routes/Home.svelte';

  let hash = $state(location.hash);
  const route = $derived(hash.replace(/^#/, '') || '/');
</script>

<svelte:window onhashchange={() => (hash = location.hash)} />

{#if route === '/dev/gallery'}
  <!-- 개발 갤러리는 별도 청크로 지연 로드 (스냅샷·axe 대상, plan.md 1.2) -->
  {#await import('./routes/dev/gallery/Gallery.svelte') then { default: Gallery }}
    <Gallery />
  {/await}
{:else}
  <Home />
{/if}
