<script lang="ts" module>
  import type { PresetId } from '@p2p-gostop/engine';
  import type { MoneyUnit } from '../lib/view-types.ts';

  export type GuestConnection =
    'idle' | 'connecting' | 'open' | 'closed' | 'replaced' | 'stopped' | 'rejected';

  export interface GuestLobby {
    readonly names: readonly [string, string];
    readonly preset: PresetId | 'custom';
    readonly pointValue: number;
    readonly startBalance: number;
    readonly unit: MoneyUnit;
  }
</script>

<script lang="ts">
  // 접속(게스트) (spec 2.2·6.2, FR-04·05): 이름 입력 → 연결 상태 → 로비(양쪽 이름·규칙·점당·시작 잔액) → 호스트가 시작.
  // iPhone Safari는 인터넷 없는 Wi-Fi에서 "인터넷 없이 사용"을 골라야 연결이 유지된다. 홈 화면 추가는 권하지 않는다
  // (IP가 세션마다 바뀌고 오프라인 캐시를 쓸 수 없다). 대신 자동 잠금 끄기를 안내한다(NF-04).
  import { untrack } from 'svelte';
  import { formatMoney } from '../lib/format.ts';
  import { PRESET_LABEL } from '../p2p/common.ts';
  import Screen from '../ui/Screen.svelte';

  interface Props {
    /** 입력칸 처음 값 */
    name: string;
    /** 이미 참가 요청을 보냈는지 (이름 입력칸 잠금) */
    joined: boolean;
    connection: GuestConnection;
    /** 중계가 알려 준 호스트 앱 연결 (모르면 null) */
    hostPresent: boolean | null;
    lobby: GuestLobby | null;
    error?: string | null;
    onjoin?: ((name: string) => void) | undefined;
    onreconnect?: (() => void) | undefined;
    ondiagnostics?: (() => void) | undefined;
  }

  let {
    name,
    joined,
    connection,
    hostPresent,
    lobby,
    error = null,
    onjoin,
    onreconnect,
    ondiagnostics,
  }: Props = $props();

  const CONNECTION_LABEL: Record<GuestConnection, string> = {
    idle: '입장 전',
    connecting: '연결하는 중…',
    open: '연결됨',
    closed: '다시 연결하는 중…',
    replaced: '다른 창에서 접속 중',
    stopped: '연결 멈춤',
    rejected: '입장 거절',
  };
  const ids = $props.id();
  // 입력 중인 이름은 이 화면의 로컬 상태(처음 값만 props에서 받는다)
  let draft = $state(untrack(() => name));

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (value !== '') onjoin?.(value.slice(0, 12));
  }

  const status = $derived(
    connection === 'open' && lobby === null && joined
      ? '호스트 응답 기다리는 중…'
      : CONNECTION_LABEL[connection],
  );
</script>

<Screen title="게임 참가" back={null}>
  <section aria-labelledby={`${ids}-name`}>
    <h2 id={`${ids}-name`}>이름</h2>
    <form class="name" onsubmit={submit}>
      <label class="field">
        <span class="visually-hidden">내 이름</span>
        <input
          type="text"
          bind:value={draft}
          maxlength="12"
          autocomplete="nickname"
          enterkeyhint="go"
          disabled={joined}
        />
      </label>
      {#if !joined}
        <button type="submit" class="button primary" disabled={draft.trim() === ''}>입장</button>
      {/if}
    </form>
  </section>

  <section aria-labelledby={`${ids}-conn`}>
    <h2 id={`${ids}-conn`}>연결</h2>
    <p class="status" role="status" data-testid="guest-connection" data-state={connection}>
      <span class={['dot', connection]} aria-hidden="true"></span>
      {status}
    </p>
    {#if hostPresent === false && connection === 'open'}
      <p class="hint">호스트 폰에서 맞고 앱이 열려 있는지 확인하세요.</p>
    {/if}
    {#if error}
      <p class="warn" role="alert">{error}</p>
    {/if}
    {#if connection === 'replaced' || connection === 'stopped' || connection === 'rejected'}
      <button type="button" class="button" onclick={() => onreconnect?.()}>다시 연결</button>
    {/if}
  </section>

  {#if lobby}
    <section aria-labelledby={`${ids}-lobby`} data-testid="lobby">
      <h2 id={`${ids}-lobby`}>대기실</h2>
      <dl class="pairs">
        <dt>호스트</dt>
        <dd>{lobby.names[0]}</dd>
        <dt>나</dt>
        <dd>{lobby.names[1]}</dd>
        <dt>규칙</dt>
        <dd>{PRESET_LABEL[lobby.preset]}</dd>
        <dt>점당</dt>
        <dd>{formatMoney(lobby.pointValue, lobby.unit)}</dd>
        <dt>시작 잔액</dt>
        <dd>{formatMoney(lobby.startBalance, lobby.unit)}</dd>
      </dl>
      <p class="hint" role="status">호스트가 시작하기를 기다리는 중…</p>
    </section>
  {/if}

  <section aria-labelledby={`${ids}-help`}>
    <h2 id={`${ids}-help`}>연결이 자꾸 끊기면</h2>
    <ul class="help">
      <li>
        Wi-Fi에 "인터넷 연결 없음"이 떠도 <b>인터넷 없이 사용</b>을 고르세요. 취소하면 연결이
        끊깁니다.
      </li>
      <li>
        게임 중에는 설정 → 디스플레이 및 밝기 → <b>자동 잠금 "안 함"</b>이 편합니다. 화면이 꺼져도
        켜면 이어집니다.
      </li>
    </ul>
    <button type="button" class="link" onclick={() => ondiagnostics?.()}>진단·로그</button>
  </section>
</Screen>

<style>
  .name {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-2);
  }

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
  .hint,
  .warn,
  .help {
    margin: 0;
  }

  .hint,
  .help {
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .help {
    display: grid;
    gap: var(--space-1);
    padding-left: 1.2rem;
  }

  .warn {
    padding: var(--space-2) var(--space-3);
    border-left: 3px solid var(--color-event-ppeok);
    font-size: var(--font-size-s);
  }

  .pairs {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-3);
    margin: 0;
  }

  .pairs dt {
    color: var(--color-text-muted);
  }

  .pairs dd {
    margin: 0;
  }

  .link {
    justify-self: start;
    min-height: var(--touch-min);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: inherit;
    text-decoration: underline;
  }

  .dot {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--color-event-go);
  }

  .dot.open {
    background: var(--color-accent);
  }

  .dot.replaced,
  .dot.stopped,
  .dot.rejected {
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
