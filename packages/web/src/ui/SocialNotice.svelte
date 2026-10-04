<script lang="ts">
  // UX-SC-02: 제어형 임시 표시. frame 원문/nonce/게임 상태를 받지 않는다.
  interface Notice {
    /** 같은 notice/channel 소유 수명에서 단조 증가한다. 새 소유는 패널도 새로 mount한다. */
    readonly id: number;
    readonly text: string;
    readonly expiresAt: number;
  }
  interface Props {
    entries: readonly Notice[];
    muted: boolean;
    now: number;
    /** protocol rate 결과와 UI 낭독 간격 모두를 통과한 최신 notice ID만. */
    announceId?: number | null;
  }
  let { entries, muted, now, announceId = null }: Props = $props();
  let clearedThrough = $state(0);
  const visible = $derived(
    muted
      ? []
      : entries.filter((entry) => entry.id > clearedThrough && entry.expiresAt > now).slice(-2),
  );
  let lastAt: number | null = null;
  let lastId: number | null = null;
  let seenId: number | null = null;
  let announcement = $state('');
  $effect(() => {
    const at = now;
    if (muted) {
      clearedThrough = Math.max(clearedThrough, ...entries.map((entry) => entry.id));
      announcement = '';
      return;
    }
    if (!visible.some((entry) => entry.id === lastId)) announcement = '';
    const item = visible.find((entry) => entry.id === announceId);
    if (!item || item.id === seenId || !Number.isFinite(at) || at < 0) return;
    seenId = item.id; // 간격에 막힌 표현을 시간이 지난 뒤 낭독 대기열처럼 재생하지 않는다.
    if (lastAt !== null && at - lastAt < 5000) return;
    lastId = item.id;
    lastAt = at;
    announcement = item.text;
  });
</script>

<section class="social-notices" aria-label="상대 표현">
  {#if muted}<p class="muted">상대 표현 꺼짐</p>{:else}
    <ol aria-live="off">
      {#each visible as item (item.id)}<li><bdi>{item.text}</bdi></li>{/each}
    </ol>
  {/if}
  <span class="announcement" role="status" aria-live={muted ? 'off' : 'polite'} aria-atomic="true"
    >{muted ? '' : announcement}</span
  >
</section>

<style>
  .social-notices {
    overflow-wrap: anywhere;
    color: var(--color-text, #172723);
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 4px;
  }
  li,
  .muted {
    margin: 0;
    border-radius: 6px;
    background: var(--color-surface, #f4efe4);
    padding: 6px 8px;
    font-size: 14px;
  }
  .announcement {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
