# SvelteKit 3 채택 설계 (SK3)

상태: 검증 중 · 2026-10-02 · 기준 `991334023d48eaf7e77848c61048e18de5f49bfb` (`v0.4.1`). 요구: NF-01/02/03/04/05/07/08/09, MN-05, NP-02/03, AI-05, AC-04/05/06/07. 실행·소유권 정본은 [plan SK3](../../intent/plan.md#sk3). 사용자 위임: SvelteKit **3** 공식 맥락 학습 후 도입·필요 재설계. 기존 Vite 앱에 새 프레임워크를 채택하는 변경이며 Kit 2→3 codemod 대상이 아니다.

## 선택과 성공 조건

| 대안 | 이득 | 비용·판정 |
|---|---|---|
| Vite 유지 + 수동 lazy route | 변경 범위가 작고 기존 배포물·수명 유지가 쉽다 | router·chunk·focus·오류 경계를 계속 직접 관리. 사용자 Kit 3 도입 목표의 비교 기준으로만 유지 |
| Kit 3 static hash SPA + 점진 route 분리 | 기존 `#/game` 등 공개 주소와 Ktor 정적 서빙을 보존하면서 route 단위 code splitting·타입·오류 경계·navigation 수명 관리 도입 | fragment 토큰, asset base, 상태 소유권, build 도구 변경을 먼저 증명. **추천 가설**, proof 통과 전 생산 전환하지 않음 |
| pathname SPA / 서버 중심 재설계 | 일반 웹 deep link·SSR 경로 제공 | 같은 APK 정적 artifact, LAN 비보안 HTTP, 토큰 fragment·기존 URL 계약에 불필요한 변경. 런타임 SSR·remote functions는 현 배포에 부적합 |

큰 App을 Kit catch-all page에 영구 포장하는 것을 완료로 보지 않는다. 먼저 작은 shell로 위험을 검증하고, 실제 화면 route별로 분리하여 초기 필수 다운로드 감소를 측정한다. 게임 모델·규칙·프로토콜을 Kit load/page state에 옮기지 않는다. UI 의미·연출 시간·카드 배치·기준샷·예산 상한은 유지한다.

## 공식 근거와 기능 구분

공식 [발표](https://svelte.dev/blog/sveltekit-3-is-here), [v3 이행](https://svelte.dev/docs/kit/migrating-to-sveltekit-3), [전체 원문](https://svelte.dev/docs/kit/llms.txt)을 조사한다. Context7 도구가 현재 세션에 노출되지 않아 공식 원문을 직접 조회했다. 원문 예제의 외부 서비스·의존성은 자동 채택하지 않는다.

| 기능 | 구분·우리 앱 적용 |
|---|---|
| 파일 routing, layout 보존, route code splitting, hash router | Kit의 기존 기능이며 3에서 처음 생긴 것으로 표현하지 않음. [routing](https://svelte.dev/docs/kit/routing)·[설정](https://svelte.dev/docs/kit/@sveltejs-kit-vite). 자체 hash switch를 단계적으로 대체 |
| runes, snippets, context, WAAPI | 기존 Svelte 5/웹 기능. 이미 쓰는 앱에 Kit 고유 개선으로 계산하지 않음 |
| Vite plugin 안의 설정, `$app/tsconfig`, `#lib` package imports | 3의 현행 구성으로 채택. 상대 `.ts` import·workspace 공개 경계 보존. `#lib/*`는 필요한 UI 내부 경로만 사용하며 lint/probe 우회 수단으로 쓰지 않음 |
| `goto` shallow/replace/reset, `page.state` restore | 3 변경. hooks가 shallow에도 실행됨. `persistState`는 UI 상태만 후보이며 게임·토큰·원장을 넣지 않음. 기존 Android 메뉴 Back 동작을 먼저 보존; 메뉴 history 전환은 자동 도입하지 않음 |
| `asset`/`resolve`, readonly `page.url` | [paths](https://svelte.dev/docs/kit/$app-paths)로 타입 있는 route/asset 참조. asset 인자는 선행 `/` 없음. `resolve` hash 출력과 물리 version prefix를 구별 |
| rendering 오류·`handleError` | 3 stable. route 오류 경계와 동기 client hook을 사용해 로컬 익명 오류 코드/복구 경로 제공. session을 초기화하거나 raw URL·토큰·상대 손패를 log하지 않음 |
| 기본 version polling 1시간 | 명시 `pollInterval: 0`. 이 값으로 focus/visibility 기반 확인까지 꺼진다고 주장하지 않음. source BUILD_ID에 version.name 연결하고 실제 같은 origin/version prefix 요청·404/재시작 유무 측정 |
| Svelte async·remote functions·fork preloads | experimental. 이번 도입에 필요하지 않아 켜지 않음. `p2p/remote.ts` 같은 일반 모듈 이름도 3의 reserved remote segment와 충돌하므로 별도 rename 필요 |
| observability·instrumentation | [서버 span 기능](https://svelte.dev/docs/kit/observability)이 stable로 바뀌어도 정적 앱에는 수집 서버가 없음. OpenTelemetry exporter/외부 수집기 도입 안 함; 기존 로컬 진단·브라우저 timing 재사용 |
| server-only/env/security | [이행 보안](https://svelte.dev/docs/kit/migrating-to-sveltekit-3#Security)·[env](https://svelte.dev/docs/kit/environment-variables) 학습. 현재 서버 env·form action 없음. CSP/CSRF를 이유로 HTTP LAN·WS 인증 계약을 변경하지 않음 |

## 배포·책임 경계

`adapter-static`의 최종 `dist`만 Android assets와 CI artifact에 들어간다. `.svelte-kit` 중간 서버 빌드를 배포하지 않는다. hash router는 SSR/prerender를 사용할 수 없으며 서버 endpoint를 만들지 않는다. [SPA](https://svelte.dev/docs/kit/single-page-apps)·[adapter-static](https://svelte.dev/docs/kit/adapter-static)의 일반 fallback은 절대 asset 경로를 만들 수 있다. 따라서 `paths.relative: true`만으로 `/r/<version>/<hash>/` 이식성을 증명하지 않고 실제 산출물과 요청을 확인한다. 기존 같은 artifact의 루트·versioned prefix 재사용이 수용 조건이다.

| 소유자 | 수명·책임 | 금지 반례 |
|---|---|---|
| entry bootstrap | 역할 판별, `#g`/`#/join?...` 입력의 안전한 인수와 canonical route 결정 | router가 토큰을 404 URL·diagnostics·HTTP query로 내보냄 |
| root layout / 앱 coordinator | native bridge/back listener, 설정, 모드·remote controller 소유권. 문서 수명당 한 번 시작·종료 | route 이동마다 hotspot/watch/WS/worker 중복 생성 |
| 기존 current/P2P/session | 권위 상태·저장·복원·원장·commit-reveal, AI worker 수명 | Kit `load`, snapshot, `page.state`, module preloading이 새 세션 시작/정산을 실행 |
| route `+page.svelte` | 얇은 props wiring·화면 전환·화면 제목 | App 전체 eager import를 모든 route에서 유지하여 chunk 분리 무효화 |
| Game/Board/Playback | 공개 뷰·WAAPI 실제 착지·렌더 attach/detach·skip/reduced 보정 | route destroy를 session destroy와 혼동, 숨은 뷰의 late continuation |
| Kit router | URL·typed navigation·route loading/error·기본 focus/scroll | shallow hook도 전체 leave로 처리, Android Back을 무조건 history.back으로 치환 |

추천 route는 `/`, `/solo`, `/game`, `/versus`, `/remote`, `/match`, `/records`, `/settings`, `/diagnostics`, `/license`, `/join`, 개발 `/dev/gallery/[...page]`다. guest 진입과 host 진입의 공통 배포물은 유지하되 guest가 host/AI 화면을 eager import하지 않도록 분리한다. 기존 LAN `#g=<token>&n=<name>` 새로고침·재방문은 명시 호환 입력이다. 새로운 router 표현이 필요해도 토큰 HTTP 전송·기존 저장 스키마 변경·복귀 상실을 허용하지 않는다. 방식 확정은 proof 이후 같은 commit에 이 문서를 갱신한다.

설정→게임, 홈→이어하기, guest 재접속, 정산→다음 판의 session/round/seq/ledger가 보존되어야 한다. Android Back은 게임 메뉴 열기/닫기, 설정의 실제 출발 화면 복귀, 홈 native 종료 확인을 유지한다. Kit의 route focus/announcer가 기존 Screen heading·dialog focus restore·48px hit target과 충돌하는지 두 브라우저에서 검사한다. game DOM의 focus를 임의 reset하지 않으며 의미 있는 시각/flow 변경은 실제 그림으로 root에 집약한다.

## 의존성·설치 경계

확인일 2026-10-02. Node 24.21.0/npm 11.19.0, TS web 6.0.3, Vite 8.3.1, Svelte 5.57.1, plugin 7.3.1은 Kit 3의 peer 최소를 충족한다. Kit·adapter는 MIT. 두 registry tarball integrity/provenance 메타 존재는 실행 코드 안전성 보증과 구별한다.

| 정확한 핀 | 공식 npm 게시 UTC | 72시간 경과 UTC | 적용 범위 |
|---|---|---|---|
| `@sveltejs/kit@3.0.0` | 2026-10-01 17:22:34.593 | 2026-10-04 17:22:34.593 | root 승인 격리 finite proof의 명령 단위 예외 |
| `@sveltejs/adapter-static@4.0.0` | 2026-10-01 17:21:55.874 | 2026-10-04 17:21:55.874 | 위와 같음 |

[npm 공식 설정](https://docs.npmjs.com/cli/v11/using-npm/config/#min-release-age-exclude)과 설치된 11.19.0 정의를 대조했다. exclude는 **패키지 이름**에만 매칭하며 `package@version` 구문은 지원하지 않는다. 따라서 아래처럼 두 정확한 설치 핀 + 두 정확한 이름(와일드카드 없음) + 해석된 lock 검사로 범위를 제한한다. 전이 의존성에는 예외가 전파되지 않는다. 저장소·전역 `.npmrc`와 CI 기본 3일 제한, `ignore-scripts=true`는 바꾸지 않는다.

```sh
# 격리 proof 디렉터리에서 실행. 생산 workspace 명령이 아니다.
# 먼저 --package-lock-only로 해석하고 전체 resolved version의 게시 시각·integrity·peer를 검사한다.
npm install --package-lock-only --save-exact --ignore-scripts=true --min-release-age=3 \
  --min-release-age-exclude='@sveltejs/kit' \
  --min-release-age-exclude='@sveltejs/adapter-static' \
  '@sveltejs/kit@3.0.0' '@sveltejs/adapter-static@4.0.0'
# 검사가 통과한 같은 lock만 설치한다.
npm ci --ignore-scripts=true --min-release-age=3 \
  --min-release-age-exclude='@sveltejs/kit' \
  --min-release-age-exclude='@sveltejs/adapter-static'
```

새 미달 전이는 package/version/time/필요성을 root에 보고한다. 생산 lock 반영과 일반 CI 설치는 별도 checkpoint이며 위 예외를 묵시적으로 확대하지 않는다.

## 유한 proof와 예산

1. 기준 checkout에서 정상 `npm ci`·web build, 기존 frozen CI 36969821582의 raw/body/worker 기준 인수. 새 측정은 기존 artifact 결과와 구분한다.
2. 격리 Kit 3 shell을 실제 정적 build: route 2개, worker, 번들 자산, version manifest, error/focus/navigation. 루트와 합성 `/r/<version>/<hash>/`에서 동일 파일을 서빙하여 deep hash reload·asset/worker 경로 검사.
3. 기존 실제 App의 최소 통합으로 home→solo→첫 합법 입력, 설정/Back/홈/복원, LAN guest fragment·remote invitation·정산 restart까지 확대. 출하와 같은 원본 자산/폰트·worker 포함 body를 계측. 장난감 shell 수치를 제품 절감으로 제시하지 않음.
4. 실제 route 분리 후보와 기준을 cold context·같은 browser/viewport·같은 seed/설정/입력 endpoint로 비교. focus/visibility 후 version 요청·같은 origin 경계와 문서 재시작을 기록. Android JVM 정적 서빙/asset 계약과 source BUILD_ID/wire manifest/OSS를 확인.

| 항목 | v0.4.1 frozen 기준 | 상한·판정 |
|---|---:|---|
| 전체 dist raw | 1,616,921 B | 2,097,152 B. license/metadata/지연 chunk 전부 포함 |
| host 초기 body | 1,101,543 B | 1,500,000 B |
| guest 초기 body | 1,014,701 B | 1,500,000 B |
| solo 초기 body | 1,211,434 B | 1,500,000 B. worker 49,658 B 포함 |

기존 첫 합법 입력 정의·encoded HTTP body·worker 포함을 유지한다. raw·요청 수·실제 body·parse/CPU·2초/100ms/60fps·기기 결과를 혼합하지 않는다. 개선 주장은 새 수치가 나온 항목에만 한다. 외부 요청 0·service worker/Cache API 0·baseline image 일괄 갱신 0·threshold 완화 0이다.

## 이행·되돌리기

SK3-P0 설계/유한 proof → P1 build shell·entry/token/path/오류·도구 → P2 route·coordinator 분리 → P3 필수 검증·독립 review·root 통합 순서다. proof 실패로 조정한 선택은 코드와 같은 commit에 문서화한다. v0.4.1 배포는 계속 유지한다. 저장/wire 형식을 바꾸지 않아 검증 실패 시 branch 또는 미출하 변경을 revert하고 원 artifact를 사용할 수 있다. 운영 포인터·main 병합·tag/release·서명은 root만 소유한다. Galaxy/iPhone 사람 수용은 별도 절차/사람 결과가 필요하며 자동 테스트로 PASS 처리하지 않는다.
