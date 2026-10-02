<script lang="ts">
  import { getCoordinator } from '../../app/context.ts';
  import Records from '../../routes/Records.svelte';
  const app = getCoordinator();
  const records = $derived(app.records);
</script>

<svelte:head><title>맞고</title></svelte:head>

<Records view={records} />
