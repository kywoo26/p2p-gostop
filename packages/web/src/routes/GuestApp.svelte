<script lang="ts">
  // 게스트 모드 앱 (spec 2.2·2.4): 이름 입력 → 로비 → 게임 → 정산 → 다음 판. iPhone Safari는 해시 라우팅 대신
  // 이 화면 안의 상태로 움직인다(URL 프래그먼트는 세션 토큰 자리, MN-05). 새로고침·탭 복원 때는 토큰으로 바로 돌아온다.
  import { diagnosticsView, logLines } from '../game/diagnostics.ts';
  import { presetOf } from '../p2p/common.ts';
  import { readTicket } from '../p2p/ticket.ts';
  import { relayAddress } from '../p2p/role.ts';
  import { p2p } from '../p2p/store.svelte.ts';
  import { cleanName, settings } from '../settings/settings.svelte.ts';
  import Diagnostics from './Diagnostics.svelte';
  import Game, { type MenuItem } from './Game.svelte';
  import GuestJoin, { type GuestConnection, type GuestLobby } from './GuestJoin.svelte';

  // 프래그먼트에 토큰·이름이 있으면(새로고침·탭 복원·QR 재스캔 뒤) 바로 다시 참가한다
  if (p2p.guest === null) p2p.resumeGuest();

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
          timerSettings: info.timerSettings,
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
    p2p.leave();
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

{#if showDiagnostics}
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
