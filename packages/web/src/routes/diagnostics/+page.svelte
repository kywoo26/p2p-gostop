<script lang="ts">
  import { getCoordinator } from '../../app/context.ts';
  import Diagnostics from '../../routes/Diagnostics.svelte';
  const app = getCoordinator();
  const host = $derived(app.host);
  const match = $derived(app.match);
  const diagnosticsView = $derived(app.diagnosticsView);
  const bridge = $derived(app.bridge);
  const share = $derived(app.share);
  const shareStatus = $derived(app.shareStatus);
</script>

<svelte:head><title>맞고</title></svelte:head>

<Diagnostics
  view={diagnosticsView(
    host !== null ? 'host' : 'solo',
    host === null
      ? []
      : [
          {
            label: '중계 연결 (호스트)',
            ok: host.link === 'open',
            detail: host.link,
          },
          {
            label: '게스트',
            ok: host.guestName === null ? null : host.guestOnline,
            detail:
              host.guestName === null
                ? '없음'
                : `${host.guestName} · ${host.guestOnline ? '연결됨' : '끊김'}`,
          },
        ],
  )}
  guestLog={host?.guestLogs() ?? []}
  back={match !== null ? '#/match' : '#/'}
  onshare={bridge.isNative ? share : undefined}
  ondevice={bridge.isNative ? () => void bridge.openDiagnostics() : undefined}
  status={shareStatus}
/>
