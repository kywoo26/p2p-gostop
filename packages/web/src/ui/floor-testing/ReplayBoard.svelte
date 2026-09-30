<script lang="ts">
  import { untrack } from 'svelte';
  import Board from '../Board.svelte';
  import type { Playback } from '../../game/playback.svelte.ts';
  import '../../styles/skin-fan.css';
  let { playback, inputBusy = false }: { playback: Playback; inputBusy?: boolean } = $props();
  let root = $state<HTMLElement | null>(null);
  $effect(() => {
    const host = root,
      current = playback;
    untrack(() => current.attach(host));
    return () => untrack(() => current.attach(null));
  });
</script>

<Board
  view={playback.board}
  busy={playback.busy || inputBusy}
  playbackBusy={playback.busy}
  bind:root
/>
