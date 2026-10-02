<script lang="ts">
  import { go } from '../../app/navigation.ts';
  import SoloSetup from '../../routes/SoloSetup.svelte';
</script>

<svelte:head><title>맞고</title></svelte:head>

<SoloSetup onnavigate={go} />
