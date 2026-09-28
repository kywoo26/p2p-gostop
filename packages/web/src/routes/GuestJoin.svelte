<script lang="ts">
  // 접속(게스트) (spec 6.2): 이름 입력, 연결 상태, 홈 화면 추가 안내
  import type { GuestJoinView } from '../lib/view-types.ts';
  import Screen from '../ui/Screen.svelte';

  interface Props {
    view: GuestJoinView;
  }

  let { view }: Props = $props();

  const CONNECTION_LABEL: Record<GuestJoinView['connection'], string> = {
    idle: '연결 전',
    connecting: '연결하는 중…',
    connected: '연결됨',
    reconnecting: '다시 연결하는 중…',
    failed: '연결 실패',
  };
  const nameId = $props.id();
</script>

<Screen title="게임 참가" back={null}>
  <section aria-labelledby={`${nameId}-h`}>
    <h2 id={`${nameId}-h`}>이름</h2>
    <label class="field">
      <span class="visually-hidden">내 이름</span>
      <input type="text" value={view.name} maxlength="12" autocomplete="nickname" />
    </label>
  </section>

  <section aria-labelledby={`${nameId}-c`}>
    <h2 id={`${nameId}-c`}>연결</h2>
    <p class="status" role="status">
      <span class={['dot', view.connection]} aria-hidden="true"></span>
      {CONNECTION_LABEL[view.connection]}
    </p>
    <p class="host">호스트 {view.host}</p>
  </section>

  {#if view.showAddToHomeScreen}
    <section aria-labelledby={`${nameId}-a`}>
      <h2 id={`${nameId}-a`}>홈 화면에 추가</h2>
      <p class="hint">
        Safari 아래쪽 공유 버튼 → "홈 화면에 추가"를 누르면 다음부터 주소창 없이 열립니다. 화면이
        꺼지면 연결이 끊기니 게임 중에는 자동 잠금을 꺼 두세요.
      </p>
    </section>
  {/if}

  {#snippet actions()}
    <button type="button" class="button primary" disabled={view.connection !== 'connected'}>
      입장
    </button>
  {/snippet}
</Screen>

<style>
  .field input {
    width: 100%;
    min-height: var(--touch-min);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-l);
  }

  .status,
  .host,
  .hint {
    margin: 0;
  }

  .host,
  .hint {
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .dot {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--color-event-go);
  }

  .dot.connected {
    background: var(--color-accent);
  }

  .dot.failed {
    background: var(--color-event-ppeok);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
