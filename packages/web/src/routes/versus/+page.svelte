<script lang="ts">
  import { go } from '../../app/navigation.ts';
  import Versus from '../../routes/Versus.svelte';
</script>

<svelte:head><title>맞고</title></svelte:head>

<Versus onnavigate={go} />
