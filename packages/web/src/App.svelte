<script lang="ts">
  import { proEnabled, unlockAudio, playSound, stopAudio } from './pro-assets/runtime.ts';
  // 앱 진입점. 역할은 주소로 정한다(src/p2p/role.ts): 루프백 origin(Android WebView `/?build=…`, 개발 브라우저)은
  // 호스트 앱, 루프백이 아닌 origin(iPhone이 QR로 연 `http://<핫스팟 IP>:17777/`)이나 `?role=guest`는 게스트 화면.
  // 호스트 앱은 해시 라우팅(SvelteKit 아님, AGENTS.md 3장): 홈 / 혼자 연습 / 게임 / 친구와 대전(방 열기·대전) / 기록 /
  // 설정 / 진단 / 라이선스 / 개발 갤러리. 게스트는 GuestApp 안의 상태로 움직인다(프래그먼트는 세션 토큰 자리).
  import { onMount } from 'svelte';
  import { getBridge } from './bridge/bridge.ts';
  import { current } from './game/current.svelte.ts';
  import { diagnosticsView } from './game/diagnostics.ts';
  import { log } from './game/log.svelte.ts';
  import { toRecordRow } from './game/adapter.ts';
  import { DIFFICULTY_LABEL } from './game/solo.svelte.ts';
  import { sounds } from './game/sound.ts';
  import type { RecordsView } from './lib/view-types.ts';
  import { hotspot } from './p2p/hotspot.svelte.ts';
  import { detectMode } from './p2p/role.ts';
  import { hostConfigFrom, p2p } from './p2p/store.svelte.ts';
  import Diagnostics from './routes/Diagnostics.svelte';
  import Game, { type MenuItem } from './routes/Game.svelte';
  import GuestApp from './routes/GuestApp.svelte';
  import Home from './routes/Home.svelte';
  import License from './routes/License.svelte';
  import Records from './routes/Records.svelte';
  import Settings from './routes/Settings.svelte';
  import SoloSetup from './routes/SoloSetup.svelte';
  import Versus from './routes/Versus.svelte';
  import { settings } from './settings/settings.svelte.ts';
  import Screen from './ui/Screen.svelte';

  const GALLERY = '/dev/gallery';
  const mode = detectMode();
  const bridge = getBridge();
  // Android 앱: 핫스팟·LAN 상태(NF-06 경고)를 앱 전체에서 본다
  if (mode === 'host' && bridge.isNative) hotspot.watch();

  let hash = $state(location.hash);
  const route = $derived(hash.replace(/^#/, '') || '/');
  let returnFromSettings = $state<string | null>(null);
  let backToken = $state(0);
  let backListenerReady = $state(false);
  const galleryPage = $derived(
    route === GALLERY || route.startsWith(`${GALLERY}/`)
      ? route.slice(GALLERY.length).replace(/^\//, '')
      : null,
  );

  // 속도(UX-15 단계 시간표와 --dur-scale)와 효과음 설정을 문서에 반영한다.
  $effect(() => {
    const speed = settings.speed;
    if (speed === 'fast') delete document.documentElement.dataset['speed'];
    else document.documentElement.dataset['speed'] = speed;
  });
  $effect(() => {
    sounds.enabled = settings.value.sound && !proEnabled;
    if (!settings.value.sound) stopAudio();
  });

  // 앱을 #/game으로 다시 열면 저장된 솔로 세션을 이어받는다 (MN-05)
  if (
    mode === 'host' &&
    location.hash === '#/game' &&
    current.solo === null &&
    current.resumable !== null
  )
    current.resumeSolo(settings.value);

  const host = $derived(p2p.host);
  const inGame = $derived(
    mode === 'host' &&
      ((route === '/game' && current.solo !== null && current.solo.state.phase !== 'ended') ||
        (route === '/match' && host !== null && host.phase === 'playing')),
  );

  const nativeBackActive = $derived(
    inGame || (route === '/game' && current.solo !== null) || route === '/settings',
  );

  // Android Back은 웹 메뉴와 설정 복귀로 전달한다. 홈에서는 네이티브 종료 확인을 유지한다.
  $effect(() => {
    void bridge.gameActive({ active: nativeBackActive && backListenerReady });
    void bridge.keepScreenOn({ enabled: inGame || (host !== null && host.phase !== 'ended') });
  });

  onMount(() => {
    let disposed = false;
    let remove: (() => Promise<void>) | null = null;
    void bridge
      .addBackListener(() => {
        if (route === '/settings') {
          location.hash = returnFromSettings ?? '#/';
          returnFromSettings = null;
        } else if (route === '/game' || route === '/match') {
          backToken += 1;
        }
      })
      .then((handle) => {
        if (disposed) void handle.remove();
        else {
          remove = () => handle.remove();
          backListenerReady = true;
        }
      });
    return () => {
      disposed = true;
      backListenerReady = false;
      if (remove !== null) void remove();
    };
  });

  const resume = $derived.by(() => {
    const saved = current.resumable;
    return saved === null
      ? null
      : { round: saved.session.roundNumber, label: DIFFICULTY_LABEL[saved.difficulty] };
  });
  const match = $derived(
    host !== null && host.phase === 'playing'
      ? { round: host.stats.round, guest: host.guestName ?? '상대' }
      : null,
  );

  const records = $derived.by((): RecordsView => {
    const source = current.recordSource?.session ?? null;
    return {
      names: source?.config.names ?? ['나', '컴퓨터'],
      unit: settings.value.unit,
      startBalance: source?.config.startBalance ?? 0,
      rows: (source?.records ?? []).map(toRecordRow),
    };
  });

  let shareStatus = $state<string | null>(null);
  async function share(text: string) {
    const result = await bridge.share({ text, title: '맞고 진단 로그' });
    shareStatus = result.shared
      ? '공유 시트를 열었습니다'
      : '공유할 수 없습니다 (Android 앱에서만)';
  }

  function resumeSolo() {
    if (current.resumeSolo(settings.value) !== null) location.hash = '#/game';
  }

  const SOLO_MENU: readonly MenuItem[] = [
    { id: 'settings', label: '설정' },
    { id: 'home', label: '홈으로' },
    {
      id: 'end',
      label: '세션 종료',
      confirm: '이 세션을 끝냅니다. 종료 후 기록을 볼 수 있습니다.',
    },
  ];
  const HOST_MENU: readonly MenuItem[] = [
    { id: 'settings', label: '설정' },
    { id: 'home', label: '홈으로 (대전은 계속)' },
    { id: 'diagnostics', label: '진단·로그' },
    { id: 'end', label: '대전 끝내기', confirm: '대전을 끝냅니다. 상대의 연결도 끊깁니다' },
  ];

  function endSolo(showRecords = false) {
    current.solo?.end();
    if (showRecords) location.hash = '#/records';
  }

  function soloMenu(id: string) {
    if (id === 'end') endSolo();
    else {
      if (id === 'settings') returnFromSettings = '#/game';
      location.hash = id === 'settings' ? '#/settings' : '#/';
    }
  }

  function endMatch() {
    host?.end();
    p2p.closeRoom();
    location.hash = '#/';
  }

  function hostMenu(id: string) {
    if (id === 'end') endMatch();
    else if (id === 'diagnostics') location.hash = '#/diagnostics';
    else {
      if (id === 'settings') returnFromSettings = '#/match';
      location.hash = id === 'settings' ? '#/settings' : '#/';
    }
  }

  function changeSettings(patch: Parameters<typeof settings.update>[0]) {
    settings.update(patch);
    // 로비에서 바뀐 국진 규칙은 기존 방의 welcome에도 곧바로 싣는다.
    if (
      host?.stage === 'lobby' &&
      host.resumable === null &&
      ('preset' in patch ||
        'gukjinAsk' in patch ||
        'perPoint' in patch ||
        'startBalance' in patch ||
        'playerName' in patch)
    )
      host.configure(hostConfigFrom(settings.value));
  }

  function onError(message: string) {
    log.error(message);
  }

  function onHashChange() {
    const previous = route;
    hash = location.hash;
    if (previous === '/settings' || location.hash === '#/' || location.hash === '')
      returnFromSettings = null;
  }
</script>

<svelte:document
  onvisibilitychange={() => {
    if (document.hidden) stopAudio();
  }}
/>

<svelte:window
  onhashchange={onHashChange}
  onpointerdown={() => {
    sounds.unlock();
    unlockAudio();
    playSound('card');
  }}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') unlockAudio();
  }}
  onerror={(e) => onError(`오류: ${e instanceof ErrorEvent ? e.message : e.type}`)}
  onunhandledrejection={(e) => onError(`처리되지 않은 Promise 거부: ${String(e.reason)}`)}
/>

{#if mode === 'guest' && galleryPage === null}
  <GuestApp />
{:else if galleryPage !== null}
  <!-- 개발 갤러리는 별도 청크로 지연 로드 (스냅샷·axe 대상, plan.md 1.2) -->
  {#await import('./routes/dev/gallery/Gallery.svelte') then { default: Gallery }}
    <Gallery page={galleryPage} />
  {/await}
{:else if route === '/license'}
  <License />
{:else if route === '/solo'}
  <SoloSetup />
{:else if route === '/game'}
  {#if current.solo !== null}
    <Game
      controller={current.solo}
      menu={SOLO_MENU}
      onmenu={soloMenu}
      onend={() => endSolo(true)}
      ended={current.solo.state.phase === 'ended'}
      onfresh={() => (location.hash = '#/solo')}
      onrecords={() => (location.hash = '#/records')}
      {backToken}
    />
  {:else}
    <Screen title="혼자 연습">
      <p>{current.saveError ?? '진행 중인 게임이 없습니다.'}</p>
      {#snippet actions()}
        <a class="button primary" href="#/solo">새 게임</a>
      {/snippet}
    </Screen>
  {/if}
{:else if route === '/versus'}
  <Versus />
{:else if route === '/match'}
  {#if host !== null && host.phase !== 'lobby'}
    <Game
      controller={host}
      menu={HOST_MENU}
      onmenu={hostMenu}
      onend={endMatch}
      onreconnect={() => host?.reconnect()}
      waiting={host.waitPrompt}
      onwait={() => host.keepWaiting()}
      warning={hotspot.info.warning}
      {backToken}
    />
  {:else}
    <Screen title="친구와 대전">
      <p>진행 중인 대전이 없습니다.</p>
      {#snippet actions()}
        <a class="button primary" href="#/versus">방 열기</a>
      {/snippet}
    </Screen>
  {/if}
{:else if route === '/records'}
  <Records view={records} />
{:else if route === '/settings'}
  <Settings
    settings={settings.value}
    sessionActive={current.resumable !== null || match !== null}
    onchange={changeSettings}
    back={returnFromSettings ?? '#/'}
  />
{:else if route === '/diagnostics'}
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
{:else}
  {#if current.saveError}<p role="alert" class="storage-error">
      {current.saveError} <a href="#/solo">저장 상태 확인</a>
    </p>{/if}
  <Home {resume} onresume={resumeSolo} {match} onmatch={() => (location.hash = '#/match')} />
{/if}

<style>
  .storage-error {
    margin: var(--space-3);
    padding: var(--space-3);
    background: var(--color-surface-raised);
    color: var(--color-event-go);
  }
</style>
