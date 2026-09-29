<script lang="ts">
  import { untrack } from 'svelte';
  import type { RemoteJoinView } from './GuestJoin.svelte';
  import type { RemoteErrorCode, RemoteGuestController, RemoteSnapshot } from '../p2p/remote.ts';
  interface Props {
    remoteController?: RemoteGuestController;
    createRemoteController?: (origin: string) => RemoteGuestController;
    invitationUrl?: string | null;
    hasRemoteResume?: boolean;
    initialRemoteOrigin?: string;
  }
  let {
    remoteController,
    createRemoteController,
    invitationUrl = null,
    hasRemoteResume = false,
    initialRemoteOrigin = location.origin,
  }: Props = $props();
  // 게스트 모드 앱 (spec 2.2·2.4): 이름 입력 → 로비 → 게임 → 정산 → 다음 판. iPhone Safari는 해시 라우팅 대신
  // 이 화면 안의 상태로 움직인다(URL 프래그먼트는 세션 토큰 자리, MN-05). 새로고침·탭 복원 때는 토큰으로 바로 돌아온다.
  import { diagnosticsView, logLines } from '../game/diagnostics.ts';
  import { parseRelayOrigin } from '../net/index.ts';
  import { presetOf } from '../p2p/common.ts';
  import { readTicket } from '../p2p/ticket.ts';
  import { relayAddress } from '../p2p/role.ts';
  import { p2p } from '../p2p/store.svelte.ts';
  import { cleanName, settings } from '../settings/settings.svelte.ts';
  import Diagnostics from './Diagnostics.svelte';
  import Game, { type MenuItem } from './Game.svelte';
  import GuestJoin, {
    remoteErrorMessage,
    type GuestConnection,
    type GuestLobby,
  } from './GuestJoin.svelte';

  // 프래그먼트에 토큰·이름이 있으면(새로고침·탭 복원·QR 재스캔 뒤) 바로 다시 참가한다
  if (!untrack(() => remoteController) && p2p.guest === null) p2p.resumeGuest();

  let activeController = $state.raw<RemoteGuestController | undefined>(
    untrack(() => remoteController),
  );
  let activeOrigin = $state(untrack(() => initialRemoteOrigin));
  let remoteSnapshot = $state<RemoteSnapshot>(
    untrack(() => activeController?.snapshot) ?? {
      state: 'idle',
      peerPresent: false,
      requests: [],
    },
  );
  let remoteMode = $state<'link' | 'code' | 'resume'>(
    untrack(() => (hasRemoteResume ? 'resume' : invitationUrl ? 'link' : 'code')),
  );
  let remoteError = $state<RemoteErrorCode | undefined>();
  let joinNonce = 0;
  let waitUntil = $state<number | null>(null);
  let secondsLeft = $state(60);

  $effect(() => {
    const controller = activeController;
    if (!controller) return;
    const unsubscribe = untrack(() =>
      controller.subscribe((snapshot) => {
        remoteSnapshot = snapshot;
        if (
          snapshot.state === 'waiting' &&
          snapshot.error !== 'host-absent' &&
          waitUntil === null
        ) {
          secondsLeft = remoteMode === 'code' ? 60 : 35;
          waitUntil = Date.now() + secondsLeft * 1000;
        }
        if (snapshot.state !== 'waiting' || snapshot.error === 'host-absent') waitUntil = null;
      }),
    );
    return unsubscribe;
  });
  $effect(() => {
    if (waitUntil === null) return;
    const timer = window.setInterval(() => {
      if (waitUntil !== null) secondsLeft = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  });

  function remoteName(name: string) {
    const cleaned = cleanName(name, '게스트');
    settings.update({ playerName: cleaned });
    return cleaned;
  }

  async function joinRemoteLink(name: string) {
    if (!activeController || !invitationUrl) return;
    const nonce = ++joinNonce;
    remoteError = undefined;
    const outcome = await activeController.joinByLink(invitationUrl, remoteName(name));
    if (nonce !== joinNonce) return;
    if (!outcome.ok) remoteError = outcome.code;
  }

  async function joinRemoteCode(origin: string, code: string, name: string) {
    if (!activeController) return;
    let checkedOrigin: string;
    try {
      checkedOrigin = parseRelayOrigin(origin);
    } catch {
      remoteError = 'invalid';
      return;
    }
    if (checkedOrigin !== activeOrigin && createRemoteController) {
      activeController.leave();
      try {
        activeController = createRemoteController(checkedOrigin);
        activeOrigin = checkedOrigin;
      } catch {
        remoteError = 'invalid';
        return;
      }
    }
    const nonce = ++joinNonce;
    remoteError = undefined;
    const outcome = await activeController.joinByCode(checkedOrigin, code, remoteName(name));
    if (nonce !== joinNonce) return;
    if (!outcome.ok) remoteError = outcome.code;
  }

  async function resumeRemote() {
    if (!activeController) return;
    const nonce = ++joinNonce;
    remoteError = undefined;
    const outcome = await activeController.resume();
    if (nonce !== joinNonce) return;
    if (!outcome.ok) {
      remoteError = outcome.code;
      if (outcome.code === 'invalid' || outcome.code === 'expired')
        remoteMode = invitationUrl ? 'link' : 'code';
    }
  }

  function cancelRemote() {
    joinNonce += 1;
    activeController?.leave();
    remoteSnapshot = { state: 'idle', peerPresent: false, requests: [] };
    waitUntil = null;
    remoteError = undefined;
  }

  function leaveRemote() {
    joinNonce += 1;
    activeController?.leave();
    p2p.leave();
    remoteSnapshot = { state: 'idle', peerPresent: false, requests: [] };
    remoteMode = 'code';
    remoteError = undefined;
    waitUntil = null;
  }

  const remoteView = $derived<RemoteJoinView | undefined>(
    activeController
      ? {
          mode: remoteMode,
          state: remoteSnapshot.state,
          error: remoteError ?? remoteSnapshot.error,
          peerPresent: remoteSnapshot.peerPresent,
          reconnectAttempt: remoteSnapshot.reconnectAttempt,
          secondsLeft,
          origin: activeOrigin,
          onjoinLink: (name) => {
            void joinRemoteLink(name);
          },
          onjoinCode: (origin, code, name) => {
            void joinRemoteCode(origin, code, name);
          },
          onresume: () => {
            void resumeRemote();
          },
          oncancel: cancelRemote,
          onretry: () => {
            remoteError = undefined;
            activeController?.retry();
          },
          onleave: leaveRemote,
          oncode: () => {
            remoteError = undefined;
            remoteMode = 'code';
          },
        }
      : undefined,
  );
  const remoteBanner = $derived(
    activeController &&
      (remoteSnapshot.state === 'reconnecting' ||
        (remoteSnapshot.state === 'waiting' && p2p.guest !== null) ||
        remoteSnapshot.state === 'error' ||
        remoteSnapshot.state === 'ended')
      ? (remoteErrorMessage(remoteError ?? remoteSnapshot.error) ??
          (remoteSnapshot.state === 'waiting'
            ? '호스트 응답을 기다리는 중입니다.'
            : '연결을 다시 시도하는 중입니다.'))
      : null,
  );

  const game = $derived(p2p.guest);
  let showDiagnostics = $state(false);
  let status = $state<string | null>(null);

  const connection = $derived<GuestConnection>(
    game === null ? 'idle' : game.phase === 'rejected' ? 'rejected' : game.link,
  );
  const lobby = $derived.by<GuestLobby | null>(() => {
    const info = game?.lobby ?? null;
    return info === null
      ? null
      : {
          names: info.names,
          preset: presetOf(info.rules),
          pointValue: info.ledger.perPoint,
          startBalance: info.ledger.startBalance,
          unit: settings.value.unit,
        };
  });
  const playing = $derived(
    game !== null && (game.phase === 'playing' || (game.phase === 'ended' && game.lobby !== null)),
  );
  const initialName =
    readTicket().name ?? (settings.value.playerName === '호스트' ? '' : settings.value.playerName);
  const address = relayAddress();

  function join(name: string) {
    const clean = cleanName(name, '게스트');
    settings.update({ playerName: clean });
    p2p.join({ name: clean, token: readTicket().token });
  }

  function reconnect() {
    game?.reconnect();
  }

  function leave() {
    if (activeController) leaveRemote();
    else p2p.leave();
    showDiagnostics = false;
  }

  function endSettlement() {
    if (game?.bankrupt) game.endBankruptcy();
    else leave();
  }

  function upload() {
    const sent = game?.uploadLogs(logLines()) ?? 0;
    status = sent > 0 ? `호스트로 ${sent}줄 보냈습니다` : '호스트와 연결되어 있지 않습니다';
  }

  const menu: readonly MenuItem[] = [
    { id: 'diagnostics', label: '진단·로그' },
    {
      id: 'leave',
      label: '나가기',
      confirm: '게임에서 나갑니다. 같은 주소를 다시 열면 돌아올 수 있습니다',
    },
  ];

  function onmenu(id: string) {
    if (id === 'diagnostics') showDiagnostics = true;
    else if (id === 'leave' || id === 'end') leave();
  }
</script>

{#if activeController && game !== null && playing}
  {#if remoteBanner}
    <aside class="remote-banner" role="alert">
      <span>{remoteBanner} · 재접속 {remoteSnapshot.reconnectAttempt ?? 0}회</span>
      {#if remoteSnapshot.error === 'version' || remoteSnapshot.error === 'incompatible'}
        <button type="button" class="button" onclick={() => location.reload()}>새로고침</button>
      {:else if remoteSnapshot.error !== 'room-ended' && remoteSnapshot.error !== 'expired'}
        <button type="button" class="button" onclick={() => activeController?.retry()}
          >다시 시도</button
        >
      {/if}
      <button type="button" class="button" onclick={leaveRemote}>나가기</button>
    </aside>
  {/if}
  <div inert={remoteSnapshot.state !== 'connected'}>
    <Game
      controller={game}
      {menu}
      {onmenu}
      onend={endSettlement}
      ended={game.phase === 'ended'}
      onfresh={leaveRemote}
      onreconnect={() => activeController?.retry()}
    />
  </div>
{:else if activeController && remoteView}
  <GuestJoin
    name={settings.value.playerName === '호스트' ? '' : settings.value.playerName}
    joined={game !== null}
    connection="idle"
    hostPresent={null}
    {lobby}
    remote={remoteView}
  />
{:else if showDiagnostics}
  <Diagnostics
    view={diagnosticsView('guest', [
      {
        label: '호스트 연결',
        ok: game === null ? null : game.link === 'open',
        detail: `${address.host}:${address.port} · ${game?.link ?? '입장 전'}`,
      },
    ])}
    back={null}
    onupload={game === null ? undefined : upload}
    onclose={() => (showDiagnostics = false)}
    {status}
  />
{:else if game !== null && playing}
  <Game
    controller={game}
    {menu}
    {onmenu}
    onend={endSettlement}
    ended={game.phase === 'ended'}
    onfresh={leave}
    onreconnect={reconnect}
  />
{:else}
  <GuestJoin
    name={game?.name ?? initialName}
    joined={game !== null && game.phase !== 'rejected'}
    {connection}
    hostPresent={game?.hostPresent ?? null}
    {lobby}
    error={game?.error ?? null}
    onjoin={join}
    onreconnect={reconnect}
    ondiagnostics={() => (showDiagnostics = true)}
  />
{/if}

<style>
  .remote-banner {
    position: fixed;
    inset: max(var(--space-2), env(safe-area-inset-top)) var(--space-2) auto;
    z-index: 90;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--color-event-ppeok);
    border-radius: var(--radius-m);
    background: var(--color-bg);
  }
</style>
