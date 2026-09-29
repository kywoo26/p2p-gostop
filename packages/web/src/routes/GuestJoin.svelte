<script lang="ts" module>
  import type { PresetId } from '@p2p-gostop/engine';
  import type { MoneyUnit } from '../lib/view-types.ts';
  import type { TimerSettings } from '@p2p-gostop/protocol';

  export type GuestConnection =
    'idle' | 'connecting' | 'open' | 'closed' | 'replaced' | 'stopped' | 'rejected';

  export interface GuestLobby {
    readonly names: readonly [string, string];
    readonly preset: PresetId | 'custom';
    readonly pointValue: number;
    readonly startBalance: number;
    readonly unit: MoneyUnit;
    readonly timerSettings: TimerSettings;
  }

  export type RemoteJoinError =
    | 'auth'
    | 'replaced'
    | 'host-absent'
    | 'room-ended'
    | 'version'
    | 'network'
    | 'expired'
    | 'invalid'
    | 'unavailable'
    | 'denied'
    | 'timeout'
    | string;

  const TEMPORARY_REMOTE_MESSAGES: Record<string, string> = {
    expired: '초대가 만료되었습니다. 호스트에게 새 링크나 코드를 요청하세요.',
    denied: '호스트가 참여 요청을 거절했습니다.',
    timeout: '60초 안에 승인을 받지 못했습니다. 다시 요청하세요.',
    unavailable: '지금 참여할 수 없습니다. 코드와 방 상태를 확인하세요.',
    invalid: '이 초대로 참여할 수 없습니다. 호스트에게 새 초대 링크를 요청하세요.',
    'room-ended': '방이 종료되었습니다. 새 초대를 요청하세요.',
    'host-absent': '호스트 응답을 기다리는 중입니다. 호스트 앱이 열려 있는지 확인하세요.',
    replaced: '다른 창에서 접속 중입니다.',
    version:
      '버전이 맞지 않습니다. 페이지를 새로고침하고, 계속되면 호스트 앱 업데이트를 요청하세요.',
    incompatible:
      '버전이 맞지 않습니다. 페이지를 새로고침하고, 계속되면 호스트 앱 업데이트를 요청하세요.',
    network: '중계에 연결할 수 없습니다. 네트워크와 중계 주소를 확인하세요.',
    http: '중계가 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.',
    cors: '이 페이지에서 중계 접속이 허용되지 않습니다. 초대 링크를 다시 확인하세요.',
    invalidResponse: '중계 응답을 확인할 수 없습니다. 중계 주소를 확인하세요.',
    auth: '참여 자격을 확인할 수 없습니다. 새 초대를 요청하세요.',
  };

  export function remoteErrorMessage(error: RemoteJoinError | undefined): string | null {
    if (!error || error === 'cancelled') return null;
    return TEMPORARY_REMOTE_MESSAGES[error] ?? '연결할 수 없습니다. 잠시 후 다시 시도하세요.';
  }

  export interface RemoteJoinView {
    mode: 'link' | 'code' | 'resume';
    state:
      | 'idle'
      | 'checking'
      | 'creating'
      | 'waiting'
      | 'connected'
      | 'reconnecting'
      | 'ended'
      | 'error';
    error?: RemoteJoinError | undefined;
    peerPresent: boolean;
    reconnectAttempt?: number | undefined;
    secondsLeft?: number | undefined;
    origin: string;
    onjoinLink: (name: string) => void;
    onjoinCode: (origin: string, code: string, name: string) => void;
    onresume: () => void;
    oncancel: () => void;
    onretry: () => void;
    onleave: () => void;
    oncode: () => void;
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
    remote?: RemoteJoinView | undefined;
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
    remote,
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
  let code = $state('');
  let origin = $state(untrack(() => remote?.origin ?? ''));
  const normalizedCode = $derived(
    code
      .replace(/[^a-z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 12),
  );
  const validCode = $derived(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(normalizedCode));
  const displayCode = $derived(normalizedCode.match(/.{1,4}/g)?.join('-') ?? '');

  function codeInput(event: Event) {
    code = (event.currentTarget as HTMLInputElement).value;
  }

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

  const remoteMessage = $derived(
    remote?.error === 'invalid' && remote.mode === 'code'
      ? '코드로 참여할 수 없습니다. 방 코드를 다시 확인하세요.'
      : remoteErrorMessage(remote?.error),
  );
</script>

<Screen title="게임 참가" back={null}>
  {#if remote}
    <section aria-label="원격 참여" data-testid="remote-join">
      <h2>
        {remote.mode === 'code'
          ? '코드로 참여'
          : remote.mode === 'resume'
            ? '방으로 돌아가기'
            : '초대로 참여'}
      </h2>
      {#if remote.state === 'connected' || remote.state === 'reconnecting' || remote.state === 'waiting'}
        <!-- 연결된 방은 입력을 다시 받지 않는다. -->
      {:else if remote.mode === 'resume'}
        <p>이 방에 다시 연결할 수 있습니다.</p>
        <button type="button" class="button primary" onclick={remote.onresume}>이어하기</button>
        <button type="button" class="button" onclick={remote.oncode}>코드로 참여</button>
      {:else}
        <form
          onsubmit={(event) => {
            event.preventDefault();
            const nickname = draft.trim().slice(0, 12);
            if (!nickname) return;
            if (remote.mode === 'link') remote.onjoinLink(nickname);
            else if (validCode) remote.onjoinCode(origin.trim(), normalizedCode, nickname);
          }}
        >
          <label class="field"
            >이름
            <input type="text" bind:value={draft} maxlength="12" autocomplete="nickname" required />
          </label>
          {#if remote.mode === 'code'}
            <label class="field"
              >중계 주소
              <input
                type="url"
                bind:value={origin}
                inputmode="url"
                required
                placeholder="중계 주소"
              />
            </label>
            <label class="field"
              >12자리 방 코드
              <input
                type="text"
                value={displayCode}
                oninput={codeInput}
                inputmode="text"
                autocapitalize="characters"
                autocomplete="off"
                spellcheck="false"
                placeholder="XXXX-XXXX-XXXX"
                required
              />
            </label>
          {/if}
          <button
            type="submit"
            class="button primary"
            disabled={!draft.trim() || (remote.mode === 'code' && (!validCode || !origin.trim()))}
            >참여하기</button
          >
        </form>
      {/if}
      {#if remote.state === 'waiting' && remote.error !== 'host-absent' && !joined}
        <p role="status">호스트 승인 대기 · {remote.secondsLeft ?? 60}초 남음</p>
        <button type="button" class="button" onclick={remote.oncancel}>요청 취소</button>
      {:else if remote.state === 'connected'}
        <p role="status">로비에 연결되었습니다. 호스트가 시작하기를 기다리는 중…</p>
        {#if lobby}
          <dl class="pairs" data-testid="lobby">
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
            <dt>생각 시간</dt>
            <dd>
              {lobby.timerSettings.decisionMs === null
                ? '끄기'
                : `${lobby.timerSettings.decisionMs / 1000}초 · 결정마다 적용`}
            </dd>
          </dl>
        {/if}
      {:else if remote.state === 'reconnecting' || remote.state === 'waiting' || remote.error === 'host-absent'}
        <p role="status">
          {remote.peerPresent ? '중계 연결을 다시 시도하는 중' : '호스트 응답 대기'} · 재접속 {remote.reconnectAttempt ??
            0}회
        </p>
      {/if}
      {#if remoteMessage}<p class="warn" role="alert">{remoteMessage}</p>{/if}
      {#if remote.error === 'version' || remote.error === 'incompatible'}
        <button type="button" class="button" onclick={() => location.reload()}>새로고침</button>
      {:else if remote.error !== 'expired' && remote.error !== 'room-ended' && !(remote.error === 'invalid' && remote.mode === 'link') && (remote.state === 'error' || remote.state === 'reconnecting' || remote.error === 'host-absent')}
        <button
          type="button"
          class="button"
          onclick={() => {
            if (
              remote.state === 'reconnecting' ||
              remote.error === 'host-absent' ||
              remote.error === 'replaced'
            )
              remote.onretry();
            else if (remote.mode === 'link') remote.onjoinLink(draft.trim());
            else if (remote.mode === 'code' && validCode)
              remote.onjoinCode(origin.trim(), normalizedCode, draft.trim());
            else remote.onresume();
          }}>다시 시도</button
        >
      {/if}
      <button type="button" class="button" onclick={remote.onleave}>나가기</button>
    </section>
  {:else}
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
          <dt>생각 시간</dt>
          <dd>
            {lobby.timerSettings.decisionMs === null
              ? '끄기'
              : `${lobby.timerSettings.decisionMs / 1000}초 · 결정마다 적용`}
          </dd>
        </dl>
        <p class="hint">
          시간 초과 시 정해진 합법 행동으로 진행합니다. 선 고르기·밀기/받기·다음 판·재충전은 직접
          선택합니다.
        </p>
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
  {/if}
</Screen>

<style>
  [data-testid='remote-join'],
  [data-testid='remote-join'] form {
    display: grid;
    gap: var(--space-3);
  }

  [data-testid='remote-join'] .field {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
  }

  [data-testid='remote-join'] .button {
    width: 100%;
  }

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
