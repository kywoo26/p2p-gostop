<script lang="ts">
  import { page } from '$app/state';
  import Gallery from '../Gallery.svelte';
</script>

<svelte:head><title>맞고 · 화면 검토</title></svelte:head>
<Gallery page={page.params.page ?? ''} />
