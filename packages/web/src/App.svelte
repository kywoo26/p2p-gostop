<script lang="ts">
  // 앱 내부 해시 라우팅 (SvelteKit 아님, AGENTS.md 3장). 게스트는 http origin이라 해시가 가장 단순하다.
  // 화면: 홈 / 혼자 연습(난이도) / 게임 / 기록 / 설정 / 진단 / 라이선스 / 친구와 대전(M4) / 개발 갤러리.
  import { toRecordRow } from './game/adapter.ts';
  import { current } from './game/current.svelte.ts';
  import { log } from './game/log.svelte.ts';
  import { DIFFICULTY_LABEL } from './game/solo.svelte.ts';
  import { sounds } from './game/sound.ts';
  import { BUILD_ID } from './lib/build-info.ts';
  import type { DiagnosticsView, RecordsView } from './lib/view-types.ts';
  import Diagnostics from './routes/Diagnostics.svelte';
  import Game from './routes/Game.svelte';
  import Home from './routes/Home.svelte';
  import License from './routes/License.svelte';
  import Records from './routes/Records.svelte';
  import Settings from './routes/Settings.svelte';
  import SoloSetup from './routes/SoloSetup.svelte';
  import { settings } from './settings/settings.svelte.ts';
  import { storageAvailable } from './storage/local.ts';
  import Screen from './ui/Screen.svelte';

  const GALLERY = '/dev/gallery';

  let hash = $state(location.hash);
  const route = $derived(hash.replace(/^#/, '') || '/');
  const galleryPage = $derived(
    route === GALLERY || route.startsWith(`${GALLERY}/`)
      ? route.slice(GALLERY.length).replace(/^\//, '')
      : null,
  );

  // 속도(--dur-scale, spec 6.4)와 효과음 설정을 문서에 반영한다. 갤러리는 스스로 instant로 덮어쓴다.
  $effect(() => {
    const speed = settings.speed;
    if (speed === 'fast') delete document.documentElement.dataset['speed'];
    else document.documentElement.dataset['speed'] = speed;
  });
  $effect(() => {
    sounds.enabled = settings.value.sound;
  });

  const resume = $derived.by(() => {
    const saved = current.resumable;
    return saved === null
      ? null
      : { round: saved.session.roundNumber, label: DIFFICULTY_LABEL[saved.difficulty] };
  });

  const records = $derived.by((): RecordsView => {
    const source = current.recordSource?.session ?? null;
    return {
      names: source?.config.names ?? ['나', '컴퓨터'],
      unit: settings.value.unit,
      startBalance: source?.config.startBalance ?? 0,
      rows: (source?.records ?? []).map(toRecordRow),
    };
  });

  const diagnostics = $derived.by((): DiagnosticsView => ({
    buildId: BUILD_ID,
    device: navigator.userAgent,
    mode: 'solo',
    checks: [
      {
        label: 'Web Worker (CPU)',
        status: typeof Worker === 'undefined' ? 'warn' : 'ok',
        detail: typeof Worker === 'undefined' ? '없음: 메인 스레드에서 계산' : '사용 가능',
      },
      {
        label: '저장소 (세션 이어하기)',
        status: storageAvailable() ? 'ok' : 'warn',
        detail: storageAvailable()
          ? 'localStorage 사용 가능'
          : '저장 불가: 앱을 닫으면 세션이 사라짐',
      },
      {
        label: '보안 컨텍스트',
        status: 'ok',
        detail: window.isSecureContext ? '예' : '아니오 (게스트 http: 제한 API 미사용)',
      },
    ],
    log: log.lines,
  }));

  function resumeSolo() {
    if (current.resumeSolo(settings.value) !== null) location.hash = '#/game';
  }

  function onError(message: string) {
    log.error(message);
  }
</script>

<svelte:window
  onhashchange={() => (hash = location.hash)}
  onpointerdown={() => sounds.unlock()}
  onerror={(e) => onError(`오류: ${e instanceof ErrorEvent ? e.message : e.type}`)}
  onunhandledrejection={(e) => onError(`처리되지 않은 Promise 거부: ${String(e.reason)}`)}
/>

{#if galleryPage !== null}
  <!-- 개발 갤러리는 별도 청크로 지연 로드 (스냅샷·axe 대상, plan.md 1.2) -->
  {#await import('./routes/dev/gallery/Gallery.svelte') then { default: Gallery }}
    <Gallery page={galleryPage} />
  {/await}
{:else if route === '/license'}
  <License />
{:else if route === '/solo'}
  <SoloSetup />
{:else if route === '/game'}
  <Game />
{:else if route === '/records'}
  <Records view={records} />
{:else if route === '/settings'}
  <Settings
    settings={settings.value}
    sessionActive={current.resumable !== null}
    onchange={(patch) => settings.update(patch)}
  />
{:else if route === '/diagnostics'}
  <Diagnostics view={diagnostics} />
{:else if route === '/versus'}
  <Screen title="친구와 대전">
    <p>Android 호스트 + iPhone 게스트 대전은 다음 단계(M4)에서 연결됩니다.</p>
  </Screen>
{:else}
  <Home {resume} onresume={resumeSolo} />
{/if}
