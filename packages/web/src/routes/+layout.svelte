<script lang="ts">
  import type { Snippet } from 'svelte';
  import App from '../App.svelte';
  import '../styles/tokens.css';
  import '../styles/global.css';
  import '../pro-assets/pro.css';
  let { children }: { children: Snippet } = $props();
</script>

<App>{@render children()}</App>
