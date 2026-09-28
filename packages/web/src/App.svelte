<script lang="ts">
  // 앱 내부 해시 라우팅 (SvelteKit 아님, AGENTS.md 3장). 게스트는 http origin이라 해시가 가장 단순하다.
  import Home from './routes/Home.svelte';
  import License from './routes/License.svelte';

  const GALLERY = '/dev/gallery';

  let hash = $state(location.hash);
  const route = $derived(hash.replace(/^#/, '') || '/');
  const galleryPage = $derived(
    route === GALLERY || route.startsWith(`${GALLERY}/`)
      ? route.slice(GALLERY.length).replace(/^\//, '')
      : null,
  );
</script>

<svelte:window onhashchange={() => (hash = location.hash)} />

{#if galleryPage !== null}
  <!-- 개발 갤러리는 별도 청크로 지연 로드 (스냅샷·axe 대상, plan.md 1.2) -->
  {#await import('./routes/dev/gallery/Gallery.svelte') then { default: Gallery }}
    <Gallery page={galleryPage} />
  {/await}
{:else if route === '/license'}
  <License />
{:else}
  <Home />
{/if}
