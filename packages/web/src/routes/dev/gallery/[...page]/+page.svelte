<script lang="ts">
  import { getCoordinator } from '../../../../app/context.ts';

  const app = getCoordinator();
  const galleryPage = $derived(app.galleryPage);
</script>

<svelte:head><title>맞고</title></svelte:head>

<!-- 개발 갤러리는 별도 청크로 지연 로드 (스냅샷·axe 대상, intent/plan.md 1.2) -->
{#if galleryPage !== null}
  {#await import('../../../../routes/dev/gallery/Gallery.svelte') then { default: Gallery }}
    <Gallery page={galleryPage} />
  {/await}
{/if}
