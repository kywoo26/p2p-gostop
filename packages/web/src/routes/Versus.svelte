<script lang="ts">
  import type { AppRoute } from '../app/navigation.ts';
  import { onMount } from 'svelte';
  let { onnavigate }: { onnavigate?: (route: AppRoute) => void } = $props();
  import { PRESETS } from '@p2p-gostop/engine';
  // 친구와 대전(호스트) 방 열기 화면의 동작 (spec 2.1, FR-01~05): 브리지로 핫스팟을 켜고(LAN 노출은 명시적으로, NF-06),
  // HostGame 로비에 규칙·금액을 넣고, 게스트가 연결되면 시작한다. 그리는 것은 HostRoom.svelte.
  import { getBridge } from '../bridge/bridge.ts';
  import { hotspot } from '../p2p/hotspot.svelte.ts';
  import { hostConfigFrom, p2p } from '../p2p/store.svelte.ts';
  import { presetOf } from '../p2p/common.ts';
  import { presetSettingsPatch, settings } from '../settings/settings.svelte.ts';
  import HostRoom, { type HostRoomRules } from './HostRoom.svelte';

  const bridge = getBridge();
  // 화면을 열 때 방이 없으면(또는 끝났으면) 연다. 이미 판이 진행 중이면 게임 화면으로 보낸다
  if (p2p.host === null || p2p.host.phase === 'ended') p2p.openRoom(settings.value);
  else if (p2p.host.phase === 'playing')
    onMount(() => {
      onnavigate?.('/match');
    });
  hotspot.watch();
  const room = $derived(p2p.host as NonNullable<typeof p2p.host>);

  const rules = $derived<HostRoomRules>({
    preset: room.config.preset,
    custom:
      presetOf(room.config.rules) === 'custom' ||
      room.config.rules.gukjin !== PRESETS[room.config.preset].gukjin,
    perPoint: room.config.perPoint,
    startBalance: room.config.startBalance,
    hostName: room.config.hostName,
    unit: settings.value.unit,
    timerDecisionMs:
      room.resumable?.state.v === 1
        ? null
        : room.resumable?.state.timerSettings?.decisionMs !== undefined
          ? room.resumable.state.timerSettings.decisionMs
          : room.config.timerDecisionMs === undefined
            ? 10_000
            : room.config.timerDecisionMs,
  });

  function changeRules(patch: Partial<HostRoomRules>) {
    if (
      patch.timerDecisionMs !== undefined ||
      ('timerDecisionMs' in patch && patch.timerDecisionMs === null)
    ) {
      room.configure({ ...room.config, timerDecisionMs: patch.timerDecisionMs });
      return;
    }
    const next = { ...settings.value };
    if (patch.preset !== undefined) Object.assign(next, presetSettingsPatch(patch.preset));
    if (patch.perPoint !== undefined)
      Object.assign(next, { perPoint: patch.perPoint, startBalance: null });
    if (patch.hostName !== undefined) Object.assign(next, { playerName: patch.hostName });
    settings.update(next);
    room.configure({
      ...hostConfigFrom(settings.value),
      timerDecisionMs:
        room.config.timerDecisionMs === undefined ? 10_000 : room.config.timerDecisionMs,
    });
  }

  function start() {
    const ok = room.resumable !== null ? room.resumeSaved() : room.start();
    if (ok) onnavigate?.('/match');
  }

  const resume = $derived(
    room.resumable === null
      ? null
      : { round: room.resumable.state.roundNumber, guestName: room.resumable.state.guestName },
  );
  const guest = $derived(
    room.guestName === null ? null : { name: room.guestName, connected: room.guestOnline },
  );
</script>

<HostRoom
  hotspot={hotspot.info}
  pageAddress={bridge.isNative ? null : location.host}
  {guest}
  {rules}
  {resume}
  busy={hotspot.busy}
  timerSaveFailed={room.timerSaveFailed}
  onhotspot={() => void hotspot.start()}
  onaddressonly={() => void hotspot.addressOnly()}
  ondiagnostics={() => void bridge.openDiagnostics()}
  onrules={changeRules}
  onstart={start}
  onfresh={() => p2p.openRoom(settings.value, { fresh: true })}
/>
