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
| Svelte async·remote functions·fork preloads | experimental. 이번 도입에 필요하지 않아 켜지 않음. 문서의 reserved remote segment에서 추정한 5파일 rename은 철회: Kit 3.0.0의 기능 OFF guard는 `/\.remote\.(js\|ts)$/`에 해당하며 기존 `remote.ts`·`remote.net.ts` 등은 매칭되지 않는다. 이름 변경 0으로 전체 App compile 성공. 더 넓은 experimental transform 필터와 혼동하지 않음 |
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

[npm 공식 설정](https://docs.npmjs.com/cli/v11/using-npm/config/#min-release-age-exclude)과 설치된 11.19.0 정의를 대조했다. exclude는 **패키지 이름**에만 매칭하며 패키지 이름에 버전을 붙인 구문은 지원하지 않는다. 따라서 아래처럼 두 정확한 설치 핀 + 두 정확한 이름(와일드카드 없음) + 해석된 lock 검사로 범위를 제한한다. 전이 의존성에는 예외가 전파되지 않는다. 저장소·전역 `.npmrc`와 CI 기본 3일 제한, `ignore-scripts=true`는 바꾸지 않는다.

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

격리 shell lock 사전검사: resolved 75개(다른 플랫폼 optional 포함)의 registry 게시 시각·lock integrity 일치·Node engine·설치된 peer 범위 검사에서 문제 0. 새 항목은 위 두 핀, `@standard-schema/spec@1.1.0`(2025-12-15), `cookie@2.0.1`(2026-06-30)이다. 독립 해석으로 기준 lock과 달라진 항목은 `@oxc-project/types@0.151.0`(2026-09-21), `esrap@2.4.0`(2026-09-26). 임시 App 수명 proof에도 이 차이가 남아 있으므로 Kit 자체 성능 효과로 계산하지 않는다. 채택안 성능 비교 전에 기준 전이를 맞춘다. 추가 연령 예외 0. 이 기록은 격리 shell이며 생산 lock delta가 아니다.

P1 root 설치 checkpoint: 격리 lock-only 후보는 web에 두 정확 dev 핀만 추가하고 npm 항목은 Kit/adapter/standard-schema/cookie 4개만 추가했다. 기존 항목의 교체·삭제는 0이다. 특히 esrap 2.3.12, Oxc types root 0.150.0/rolldown 하위 0.151.0, Svelte/Vite/rolldown 핀을 기준과 일치시켰다. 후보 lock SHA-256은 `3f69190da729bcfadab0d8a98e0558ad6fd202f8ea3b19ffc53623c56b1900d5`다. 2026-10-02 09:44Z 추가4 registry 원문과 version/integrity/engine/dependency/peer를 대조했고 제3 연령 예외·install lifecycle script는 0이었다. root는 이 두 파일의 migration branch 반영과 두 이름 예외의 로컬 npm ci 1회를 명시 승인했다. 승인된 로컬 npm ci 1회가 성공했고 설치된 registry 패키지 256개는 lock과 일치했다(지원하지 않는 플랫폼 optional 제외, workspace link 별도). lock 바이트 변경·예상 밖 의존성 변경은 0이며 CI 기본 제한·main/운영 소유권은 유지한다.

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

### P0 관측과 남은 경계

- 정적 shell은 Chromium·WebKit의 **prefix-only** 서버에서 원본 split/single의 루트 `/_app` 요청이 404로 실패했다. split의 생성 HTML bootstrap import와 modulepreload/stylesheet만 상대화한 뒤 첫 load→지연 settings→Back/deep hash reload→지속 worker·CSS/font 응답이 모두 prefix 안에서 성공했다. shell은 14곳/+14 B, 실제 App wrapper는 16곳이었다. 이 숫자는 각 출력의 관측값이며 미래 출력의 상수가 아니다. 승인된 입력 digest·구조·개수, Kit/adapter 핀을 검사하고 불일치하면 실패해야 한다. 원본 보존·멱등성, CSP hash/SRI/nonce 존재 시 별도 생성 검토, 사용자 문자열/JS 일괄 치환 금지를 조건으로 한다. node_modules 또는 브라우저 runtime 수정은 없다.
- 같은 cold readiness(화면·font ready·worker 응답), identity/no-store Node 응답에서 shell split은 229,900 B/19응답, single은 244,665 B/6응답이었다. split은 settings 진입 때 1청크 추가, single은 추가 0. inline 후보는 이 worker/font fixture에서 정상 readiness에 도달하지 못했다. 요청 수와 body는 속도 판정이 아니며 shell 수치를 제품 절감으로 쓰지 않는다. 이 범위에서 공식 출력 옵션만으로 같은 artifact의 임의 prefix 이동성과 코드 분리를 함께 만족하지 못했다. 제한 HTML 변환의 유지 비용을 채택 비용에 포함한다.
- `pollInterval: 0`에서도 focus+visibility가 합쳐져 같은 prefix `/_app/version.json`에 GET 1건(`cache-control: no-cache`)이 발생했다. 503 후 자동 재시도·document reload 0, 다음 focus 때 재요청 1건/200·34 B였다. 외부 origin 0과 같은 origin 정적 확인을 구별한다. token fixture는 HTTP/history state/title/announcer/error 노출 0이었으며 실제 P2P 종료·복원 증명은 별도다.
- 실제 App 임시 wrapper는 raw hash 대입 시 full reload·Back 실패를 재현했다. 공식 `goto`로 전환 후 두 브라우저에서 솔로 첫 합법 입력→설정/native Back→홈/이어하기→문서 reload/저장 복원→종료가 통과했다. seed/round/잔액/기록이 같고 화면 왕복 중 worker 재생성 0, worker 49,658 B와 SHA-256이 기준과 같다. 초기 body는 Vite 1,211,434 B/32응답, Kit Chromium 1,264,526 B/47응답, WebKit 1,275,592 B/48응답이다. WebKit의 같은 `cards/0.svg` 11,066 B 1건 추가만 요청 멀티셋 차이로 확인했다. 기존 로그에는 initiator/cache 정보가 없어 중복 원인·성능 개선을 주장하지 않는다. 예산 내 통과이며 route 분리 순효과는 아직 미입증이다.
- 후속 실제 page 분리와 문서 수명 coordinator 첫 proof도 같은 솔로 시나리오 C/W PASS. body는 각각 1,173,968 B/70응답·1,185,034 B/71응답으로 wrapper보다 90,558 B 감소했다. Vite와 비교한 관측 감소는 37,466 B·26,400 B다. 아직 compiler 전이 차이·OSS 고지 추가 전 값이며 host/guest controller의 root eager import가 남는다. 제품 성능 수용이나 최종 절감으로 승격하지 않는다. 다음 범위는 실제 guest 초대/복원·진행 중 navigation 무효화·종료 소유권·최종 정적 metadata/OSS다.
- 실제 원본 `StaticSite`의 wire 4/hash 검사를 거친 artifact를 version prefix에서 제공하고 Chromium host/WebKit guest의 LAN pair를 확인했다. settings 청크 응답을 보류한 상태에서 native Back은 committed match 메뉴를 유지했고, 응답을 풀어도 settings가 뒤늦게 반영되지 않았다. settings popstate·guest reload의 seq/round 보존·기존 `#g` 링크 재진입·HTTP/history state/title/body/announcer 토큰 비노출도 통과했다. host 종료 통지 뒤 guest가 명시적으로 나가면 양쪽 WS가 닫히고 3.2초+focus에 새 시도 0이었다. 이는 31초 원격 RP07 회귀가 아니다. 하네스의 이중 응답 해제·메뉴 selector·솔로 전용 종료 selector 오류는 별도 실패 자료로 보존했고 제품 결함으로 분류하지 않았다. 원 relay에서 Kit version 요청 404는 그대로 관측했으며 정적 호환 수정 대상이다.
- SK3-P0S 정적 호환: 원 relay가 JSON을 제외하여 Kit 확인은 404였다. 실제 생성 경로 `_app/version.json` 하나만 producer/consumer의 해시·JSON MIME에 추가하고 `no-store`로 제공한다. 앱 wire `version.json` 형식과 기존 Vite artifact 해시는 유지하며 relay에서 wire 파일 자체를 새로 공개하지 않는다. Android의 기존 JSON MIME/no-store를 유지하고 `_app/immutable`의 hash 이름 JS/CSS/font/worker만 장기 캐시에 넣는다. source map·숨김 파일은 asset callback 전에 거절한다. relay 3 tests(실제 write-version 격리 실행), Android M4 11 tests가 통과했다. 같은 실제 prefix LAN pair에서 Kit GET은 404→200·21 B·request no-cache/response no-store, focus document reload 0과 세션/종료 수명을 확인했다. 이 후속은 524ce3d 고정 리뷰와 별개다.
- 최종 출하 미완: client chunk 수집 결과 `@sveltejs/kit`·`clsx`·`devalue`·`svelte`·`uqr`·`zod`가 포함되었다. 새 Kit/devalue를 dev-only라며 고지에서 제외하지 않는다. 원문 라이선스·runtime table·UI JSON을 일치시키고 Android 고지 부분은 보존한다. 최종 HTML 변환→OSS/metadata 조립→최종 write-version/hash→예산 검사를 증명해야 하며 `.svelte-kit` SSR 중간물·source map은 출하하지 않는다.

P0S 시점 wire artifact hash의 분모는 기존 producer/relay가 함께 다루는 허용 확장자의 정적 파일과 새로 명시한 `_app/version.json`이다. root `version.json`은 자기 참조를 피하려고 제외하며 나머지 JSON·license text를 임의로 포함하지 않는다. NF-03 raw 예산의 분모는 이와 달리 license/metadata/지연 파일을 포함한 **모든 dist 파일**이다. OSS를 포함한 최종 파일 조립 후 write-version을 실행하고 raw gate를 검사한다.

### P0L 공개 고지와 artifact 집합

Vite 기준과 Kit proof의 실제 relay에서 `cards/ATTRIBUTION.md`, `pro/NOTICE.md`, `oss/NOTICE.txt`는 모두 파일이 존재하지만 404였다(6개 HTTP 관측). Kit 회귀가 아닌 기존 결함이다. 세 정확 경로만 relay 공개 목록에 넣고 UTF-8 plain text·nosniff로 읽는다. Android는 기존 공개 범위를 늘리지 않고 이 세 경로의 MIME만 원문 읽기에 맞춘다. 기존 절대 pro 링크를 BASE_URL로 고치며 Kit에서는 [공식 data-sveltekit-reload](https://svelte.dev/docs/kit/link-options#data-sveltekit-reload)로 정적 원문을 문서 탐색한다. 새 UI나 게임 의미 변경은 없다.

새 producer는 필수 세 고지까지 조립한 뒤 `assetSetVersion:2`와 hash를 쓴다. consumer는 필드가 없는 기존 artifact를 기존 집합으로 검증하며 고지 세 파일은 **기존 hash 무결성 범위 밖**이므로 no-store로 제공한다. 2는 고지 포함 집합과 immutable prefix 캐시를 사용한다. string/null/그 밖 명시 값, 새 집합의 고지 누락·변조·메타만 제거/변경은 거절하며 digest 실패 후 다른 집합으로 fallback하지 않는다. wireVersion 4와 독립적인 배포 호환 변경이다. 기존 artifact 파일·manifest를 다시 쓰지 않으면 새 consumer에서도 기존 hash가 그대로 유효하다. 새 producer를 재실행한 artifact는 새 hash가 필요하다.

재현 순서는 새 consumer의 구형 artifact 인수→새 집합 artifact 인수다. 구형 consumer는 새 집합 hash를 거절하므로 consumer를 먼저 갱신해야 한다. 실제 운영 갱신은 실행하지 않으며 root 소유다. 롤백 시 기존 v0.4.1 artifact와 구분자 없는 manifest를 함께 유지한다. HTML 한정 변환→최종 OSS/자산 조립→write-version→raw/body 검증 순서를 따른다. artifact hash 분모는 허용 정적 자산+정확 Kit version+새 집합의 세 고지이며, raw 분모는 계속 모든 dist 파일이다.

총괄 회귀: producer/relay 4 tests(legacy/new cache·GET/HEAD·정확 경로·discriminator/누락/변조), Android M4 12 tests, 실제 Vite UI 링크 클릭 C/W root·prefix 4 tests PASS. root 브라우저 서버는 Ktor MIME의 대역이며 실제 Ktor 근거는 JVM 테스트다. prefix 브라우저는 실제 relay CLI/StaticSite와 dist를 사용했다. d114b28의 실제 구형 consumer도 새 Vite artifact를 hash 불일치로 거절했다. 새 source의 웹 고지 검사는 실제 번들 목록/lock/UI JSON에 더해 설치 패키지 LICENSE 원문 바이트와 배포 NOTICE의 동일성을 대조한다. legacy 고지의 패키지 집합은 그대로이며 Kit 6개 집합은 별도 scratch에서 검증한다.

Kit P0L 격리 재빌드의 실제 client 수집 경로는 `dist/oss/bundled-packages.json`이며, Kit 3.0.0·clsx 2.1.1·devalue 5.9.4·Svelte 5.57.1·uqr 0.1.3·zod 4.6.5다. 이 6개와 scratch `src/oss-notices.json`·NOTICE 런타임 표·설치 LICENSE 원문 바이트·정확 lock 버전을 대조했다. 생산 고지 4개/생산 lock은 변경하지 않았다. client-only dist 143파일에 source map/SSR 중간물 없음, 원문 포함 최종 raw 1,691,537 B(상한 2,097,152 B)다. final body/사용자 성능은 이번 검사 범위가 아니다.

이 재빌드의 생성 HTML은 preloads 27·style 1·bootstrap imports 2, 총 30곳/+30 B이며 원본 SHA-256 `0876371b8f3d701c6c4e68906d3351beb0774ff5516c89e05ae6f203d4975526`→변환 `6c6027da6d31c01dd62d80a77de2fe94dab76d0e6d7cb4ac4f45c4883f881703`로 고정해 엄격 변환·멱등성을 확인했다. 최종 고지 조립 뒤 새 write-version, 실제 StaticSite 인수, 전체 raw 검사 순서다. 최종 wire artifact hash는 `2112c0574162cf25e5d7f29aa40ddb9c6afef65d97b7500049a096e74486fc3e`, Kit source ID는 계속 `9913340`이다. 이 값은 격리 route/coordinator 소스와 P0L 고지 변경의 산출물이며 생산 d114b28 빌드와 동일하다는 뜻이 아니다. compiler 전이 차이 통일과 생산 routing/lock 채택은 여전히 남아 있다.

재현용 shell 원형·정확 lock·관측 자료는 [유한 proof fixture](../../tools/proofs/sveltekit3/fixtures/proof.fixture.json)에 모았다. `commands` 순서로 저장소 밖 새 `PROOF_SCRATCH`(실행자가 설정하는 환경변수)에 준비→현재 registry preflight→명령 단위 예외 설치→build→browser를 실행한다. 생산 workspace 설치 명령이 아니다. 총괄은 패키징된 소스의 순수 변환 4 tests/18 negative cases·lint를 통과한 뒤 새 scratch에서 75개 사전검사, `npm ci`, split/single/inline build, prefix-only C/W를 실제 재현했다. 원본 실패와 변환 성공은 예상대로이며 입력 HTML digest도 일치했다. 패키징 역할의 실행 전 기록과 부모의 실제 재현을 구별한다. App/coordinator 수명 proof는 이 작은 shell의 성공 판정에 포함하지 않는다.

재현 CLI는 knip entry로 등록했다. browser CLI 한 파일의 `unlisted` 예외는 web workspace의 기존 Playwright dev 핀을 직접 검증·재사용하기 위한 것이며 루트 manifest에 중복 핀을 만들지 않는다. registry preflight의 semver 판정은 버전을 검증한 npm 11.19.0 도구체계에서 가져온다. privacy 예외는 parser 코드가 초대값으로 오인된 2곳과 공개 합성 토큰 2곳의 파일·행·정확 지문에만 묶었다.

## P1 실제 채택 checkpoint

P0L·P2 URL 텍스트 수정의 독립 검토와 `3445540` CI 성공을 인수한 뒤의 별도 제품 단위다. `+layout`이 문서 수명 coordinator를 만들고 각 `+page`는 Home/솔로/대전/설정/기록/고지 등을 필요한 때 가져온다. 기존 세션/worker/Playback는 그대로 사용하며 URL switch의 화면 선택을 Kit router로 옮겼다. Home/SoloSetup/Versus는 이동 callback을 받는다. `hooks.client.init`은 Kit route 해석 전에 원격 초대를 메모리로 옮겨 scrub하고 LAN 구형 `#g` 입력을 `#/guest#g`로 인수한다. committed route와 진행 중 navigation을 구별해 native Back은 이전 화면의 메뉴/설정 복귀를 우선하며 늦게 받은 route 응답을 무효화한다. 기본 focus/announcer와 전체 수명 반례 수용은 후속 필수 gate까지 계속한다.

[공식 adapter 표면](https://svelte.dev/docs/kit/writing-adapters)을 감싼 `scripts/relocatable-static.mjs`는 공식 static 출력을 받은 뒤 index만 상대화한다. `kit-entry-graph.mjs`가 두 [Vite JSON graph](https://vite.dev/guide/backend-integration.html)에서 start의 첫 runtime dynamic edge·app·root0의 정적 JS 폐포를 도출한다. lazy route와 worker를 초기 preload로 합치지 않는다. 현재 root CSS는 client node0 한 정적 group과 server +layout 한 group의 교집합이며 대응 CSS 원문 바이트도 같아야 한다. 동적 CSS/asset group·root universal/server·bootstrap CSS는 지원하지 않고 실패한다. builder.manifest 파일 목록이나 HTML에서 센 개수를 정답으로 사용하지 않는다.

정확 Kit/adapter 핀·hash/split/client 설정·app template 소스 digest·전체 bootstrap 문법을 고정하고 예상 HTML과 byte 단위로 비교한다. 소스 template 변경은 명시 구조 재검토 대상이나 BUILD_ID/출력 hash는 graph로 도출하므로 생성 HTML digest의 수동/자동 갱신이 필요 없다. CSP/SRI/nonce·추가 코드·외부/절대/혼합 URL·중복/누락·다른 graph는 실패한다. 원본 HTML/두 graph/입출력 digest/개수는 `.svelte-kit/relocation`에 보존하고 같은 원본·graph·증거·결과만 재실행 no-op을 허용한다. 내부 import/fork/monkeypatch는 없다. 이 방식도 Kit 3.0.0의 entry topology·root0·bootstrap 문법에 의존하므로 핀 갱신 때 실제 구조 검토가 필요하다. 함께 생성된 graph/HTML의 **구조 정합**이며 공급망 인증이나 악의적 동시 writer 전체 방어가 아니다.

최종 순서는 adapter HTML 제한 변환→평가용 pro 자산 정리/OSS 원문 포함 정적 조립→metadata 공백 정리→write-version/hash→OSS·전체 raw 검사다. source BUILD_ID와 Kit version.name은 같고 wireVersion 4/assetSetVersion 2와는 의미가 다르다. 배포 분모는 client-only dist의 모든 파일(고지·JSON·lazy chunk·worker 포함), artifact hash의 허용 집합은 P0L 계약을 따른다. `.svelte-kit`/SSR/graph/원본 HTML/source map은 dist에 넣지 않는다. 기존 public 파일 URL의 `BASE_URL='./'` 호환 define은 유지하며 typed asset API 전환으로 계측 없이 링크 표현을 바꾸지 않는다.

실제 client 수집은 이제 branch 산출물의 Kit·clsx·devalue·Svelte·uqr·zod 6개다. source NOTICE/UI JSON/설치 LICENSE/lock/출하 NOTICE를 대조했으며 Android 71개 집합은 바꾸지 않았다. P0L 당시 생산 4개/Kit scratch 6개의 역사와 이번 실제 branch 6개를 구별한다.

| 검사 묶음 | 포함 관계·범위 |
|---|---|
| build Node 검사 21개 | graph 5 + OSS 2 + skin 4 + compact 1 + raw 4 + transfer probe 5. 아래 반례를 별도 테스트 수로 더하지 않음 |
| graph 검사 5개 내부 | HTML/template/version 거절 16건, manifest/edge/SSR 거절 **10건**(초기 중간 보고 9건 정정), 다른 정상 build graph와 원래 HTML 불일치 1건, 재실행 불일치 4건. 실제 출력 양성·정상 BUILD_ID/hash 변경 양성·no-op 포함 |
| 실제 솔로 4행 | Chromium/WebKit × root/prefix-only. 같은 최종 artifact·identity/no-store 응답·첫 합법 입력과 font ready 경계, 설정/native Back→홈/이어하기→reload→종료. 화면 왕복 중 worker 재생성 0 |
| 실제 LAN pair 1회 | prefix-only 원 StaticSite wire/hash 인수, Chromium host/WebKit guest. 보류 settings+native Back의 late commit 0, popstate, guest reload seq/round 보존, 구형 #g, HTTP/history/title/body/announcer 토큰 노출 0, focus Kit GET 21B/200/no-store·문서 reload 0 |
| 좁은 component 4개 | 기존 Home 2 cases × Chromium/WebKit, 실제 Kit/Vitest 구성에서 callback 이동과 UI 유지 |

첫 P1 build(`BUILD_ID=3445540`)의 솔로 관측 초기 body는 C 1,176,714 B/76응답, W 1,187,780 B/77응답으로 root와 prefix가 같았다. 요청 수·전송량은 속도/CPU/사용자 성능 PASS가 아니다. 명시 종료 후 3.2초+focus에서 WS 재시도 0·모든 socket 종료는 31초 RP07 검사가 아니다. 최초 source 타입 오류, CSP 기본값을 빈 객체로 가정한 adapter 실패, build script JSDoc 부족과 타입 수정, 이동된 초대 파싱의 lint 수정은 실패 시도와 최종 source를 구분해 보존한다.

전체 lint·check(0 errors/0 warnings, knip 포함)와 좁은 Home component 4개도 통과했다. OSS 추가로 이동한 clsx 원저작자 귀속 email의 기존 privacy 허용 지문은 그대로 두고 행 번호 88→99만 맞췄다. 새 allowlist 종류·값이나 gate 완화는 없다.

현재 checkpoint의 미완은 전체 필수 suite/31초 RP07·정산·Playback·focus/오류 상세 회귀/host·guest 최종 body/실기기 수용이다. controller/engine 일부는 root에 여전히 eager이므로 추가 경계 분리 이득은 다음 단위에서 측정한다. CI 기본 `min-release-age=3` 설정은 유지한다. 두 핀의 72시간 경과는 **2026-10-04 17:22:34.593Z**이나 그 전에 CI 설치가 불가능하다는 예측은 아래 실제 관측으로 정정한다. 독립 검토·main/배포 완료로 표시하지 않는다.

### P1-F1 검사 정합·CI 관측 정정

exact f700에서 root Node `npm test -- --maxWorkers=4`는 37파일/589 PASS, web 직접 workspace `npm exec -w packages/web -- vitest run --maxWorkers=4`는 118파일/1098 중1096 PASS·License C/W2 FAIL이었다. 별도 CI 36995301348도 C/W 각각548 PASS·License1 FAIL이다. 고지 실제 집합6은 맞지만 테스트의 옛4 기대값을 놓친 결함이며 기대값만 실제 client6에 맞춘다. Vitest browser 실행에서 실제 href는 `/oss/NOTICE.txt`였으므로 기존 기대값을 보존한다. 생산 빌드의 BASE_URL 치환 결과를 dev 테스트 환경으로 전용하지 않는다. 생산 `./oss/NOTICE.txt`와 혼동한 첫 좁은 실행은 href 2 FAIL이었으며 원인을 분리 보존했다. 생산 root/prefix 상대 링크는 실제 UI 경로 검사에서 검증한다. 이미지/임계값/누락 허용으로 완화하지 않는다. f700 실패와 수정 뒤 좁은 C/W 두 case PASS는 분리한다. 실행 source는 f700+이 기대집합 수정이며 `npm exec -w packages/web -- vitest run src/routes/License.test.ts --maxWorkers=4`만 실행했다.

CI 세 잡의 기본 `npm ci`는 모두 성공했고 Android 묶음도 성공했다. `.npmrc`와 workflow를 변경하거나 CI 예외를 추가한 결과가 아니다. 따라서 “72시간 이전 일반 CI 설치 불가” 예측을 철회한다. [공식 설정](https://docs.npmjs.com/cli/v11/using-npm/config/#min-release-age)의 연령 제한은 npm tree 해석 필터다. 설치된 npm 11.19.0의 `ci.js`는 잠긴 virtual tree를 읽어 검증하고, Arborist의 유효 기존 edge는 재해석 없이 재사용한다. `#fetchManifest`에서만 적용하는 `before`/release-age 선택 필터를 모든 frozen-lock 재설치의 차단 검사로 확대해서는 안 된다. 이번 CI 관측을 모든 npm/lock 상태의 미래 보장으로도 확대하지 않는다. 게시 시각/72시간 계산, 정확 lock 사전 감사와 새 버전 도입의 명령 단위 예외 절차는 계속 유지하며 정책을 해제하지 않는다.

## R1 · Kit 중심 경험 재설계

사용자는 2026-10-02 최소 port를 넘어 UI/UX·그래픽·구조의 대개편을 명시 위임했다. 성공은 기능 개수가 아니라 작은 화면의 카드/점수 인지, 합법 선택과 모션, 예측 가능한 이동·복구다. 기존 구현/픽셀은 대체 가능하고 권위·저장·보안·원 CardId·실제 착지와 사용자 합의 게임 경험은 보존한다.

| 채택 기능·구분 | 대체할 구조 | 사용자 효과 | 실행 근거·수용 경계 |
|---|---|---|---|
| Kit typed `resolve`/`page.route`·기존 Kit 표준 | 문자열 hash 조립·별도 committed hash 복제 | 잘못된 경로를 빌드에서 찾고 Back 기준을 통일 | 실제 prefix/legacy entry와 앱내 탐색을 각각 검사 |
| Kit3 `goto` shallow/state와 hook 의미 | singleton 설정 복귀 경로·일시 화면 상태 | 설정 복귀가 history 항목에 귀속, 안전한 탭/Back | 상태에는 토큰·session·원장 없음. late navigation/native Back 반례 |
| Kit `navigating`·code preload·`onNavigate` | 자체 pending flag·중첩 lazy 화면/무표시 대기 | 현재 화면을 보존하면서 다음 화면 준비·부드러운 전환 | feature detect/reduced motion, gameplay WAAPI와 분리. speculative 서버 요청 없음 |
| Kit 공통 `+error`·`handleError` (표준) | 비어 있거나 일반 오류로 끝나는 page | 같은 세션에서 재시도/게임 복귀 | 사용자에게 raw URL/token/stack 비표시·오류는 로컬 진단 |
| Board-owned layout + 화면 토큰 | root skin과 lazy component의 중복 구조 선언 | 잘림 없는 월/덱/손패 위계, 터치/선택/실제 이동 endpoint 일치 | 실제 Game 정상·혼잡/선택·작은 화면 및 landing/target/bonus 프레임 |

snapshot은 필요한 임시 입력 보존에 채택할 수 있으나 이미 저장되는 설정·Kit의 scroll 복원과 중복시키지 않는다. Svelte async 등 실험 기능도 일괄 배제하지 않고 얻는 UX·정적 배포 적합성을 유한 검증한다. 이번 세로 단면은 서버 작업이 없어 SSR/remote functions/forms 서버 추가의 제품 효과가 없으며, 기능 나열을 위한 런타임 서버는 추가하지 않는다. host/guest controller의 eager 분리는 후속 실제 body 계측으로 선택한다.

원 smoke/RP07 실패와 CSS 동률 반례는 새 설계의 문제 근거다. CSSOM 반례는 비활성 desktop 선언도 제거했고 7행 기하 회복만 증명했다. 실제 Game의 monthStacks42px pose와 gallery legacy48px를 혼동하지 않으며, 사건 레일·center·선택·모션의 수용을 별도로 측정한다. 최종 시각 제안·전후자료와 구현 결과는 이 절에 이어 기록한다.

### R1 첫 병합 경계와 실행 기록

최신 사용자 지시로 첫 큰 병합을 우선한다. 현재 Kit 전환·탐색/세션/오류·Board 단일 layout·구현한 시각 단면을 마감하며 추가 그래픽/메뉴 고도화는 다음 단위다. `page.route`가 화면 정본이고 `page.state`에는 whitelist 복귀 경로와 설정 분류만 저장한다. Home은 typed 실제 anchor와 tap code preload, 설정은 persistent shallow 상태, 게임/방은 View Transition에서 제외한다. pending 취소는 공식 shallow replacement와 `/versus`의 원격 소유 render gate로 보호한다.

Board의 중복 6행/7행 선언과 손패·획득 영역의 상충 선언을 삭제하고 portrait 7개/desktop 3개 named area를 한 파일에서 소유한다. 실제 floor pose·CardId·입력·Playback은 바꾸지 않았다. 점수/잔액 위계, 중립 선택 후보·종이빛 focus, 홈 hero 축소와 준비 다음 행동을 actual PNG 7개로 비교했다. 혼잡 화면은 constructed fixture이며 합법 진행 증명으로 쓰지 않는다. 이 PNG의 source는 A 탐색 통합 전 R1 build3이고, 후속 실행 근거와 구별한다.

- A 탐색 패키지는 23개 입력 SHA와 소유 6파일을 대조해 통합했다. A의 source 검사와 부모 실행은 별개다. B 캡처 CLI는 부모 검토 뒤 실행했으며 초기 module import/전환 중 캡처 가정 실패를 보존했다. 정정된 캡처는 7 PNG·2 영상·23개 상태 검사 통과이며 영상 전체/제품 전체 수용을 뜻하지 않는다.
- 원 탐색 18행은 12 PASS/6 FAIL이었다. 생성 manifest 경로 가정과 숨긴 메뉴의 중복 locator를 실제 빌드/보이는 메뉴에 맞춰 정정했다. 직접 URL/legacy 진입은 유지하고 앱내 raw hash만 실제 Kit anchor로 바꿨다. 기존 게임 권위·counter·document·31초 단언은 완화하지 않는다.
- 잘못된 200 JS와 일시 503을 분리한 실제 HTTP fault fixture를 사용한다. 잘못된 200에서 오류→client 재시도 실패→같은 문서/저장/게임으로 복귀→입력 수락은 C/W PASS다. 503 후 서버 복원·수동 reload는 Chromium에서 PASS, WebKit에서는 HTML을 다시 받아도 모듈 재요청이 없어 실패했다. 무조건적인 cache 복구를 약속하지 않으며 새로고침은 best effort다.
- [WebKit 270357](https://bugs.webkit.org/show_bug.cgi?id=270357)의 유사 증상을 참고했으나 원인을 동일시하지 않는다. [공식 Vite `build.modulePreload`](https://vite.dev/config/build-options.html#build-modulepreload)를 false로 한 유한 반례에서 해당 preload 링크는 없어졌지만 실패는 같았다. 효과 없는 설정은 원복했다. cache API/query buster/Kit 내부 patch는 추가하지 않았다.
- A 통합 후 기존 landing/입력/Playback 표적 35행 PASS: 두 짝 접촉·실제 획득 동시 출발, 뻑 보너스·target chain·home restore·skip/reduced 포함. hand-input은 해당 smoke 프로젝트 범위로 실행했다. 후속 RP07 실제 relay pair의 같은 문서 종료→솔로→31,000ms 재접속 0 단언도 34.8초 PASS다. 원 a77의 marker 실패·31초 미도달은 보존한다. 전체 smoke/필수 묶음·독립 검토는 별도로 남는다.

### R1 검증 checkpoint (첫 병합 전)

root가 실제 정상·선택 PNG를 보고 잔액16px/400·점수24px/600 위계를 인수했다. 해당 크기 기대만 바꾸고 점수 크기·두 굵기 검사를 추가했다. `UX-11`의 400/600 체계와 기하/입력 단언은 유지한다. 원 browser 1092 PASS/6 FAIL과 원 R1 smoke 490=297 PASS/191 FAIL/2 미실행을 보존한다. smoke 실패는 굵기123·PNG29·잔액 크기16·lazy 손패 생성 전 측정16·중복 reload2·나머지5(503/preview/Home link/화면 이동 후 reload)로 분류했다. 전체 실패를 한 원인이나 구식 검사로 폐기하지 않는다.

Kit preview는 adapter 이전의 client/prerendered를 제공하여 최종 dist에서 삭제한 평가 자산도 200으로 노출했다. 공식 Vite `isPreview` 분기에서 plugin 없이 최종 dist만 서빙하고 dev/build 설정은 보존한다. 기존 Vitest 설정은 config 함수를 받은 환경으로 평가한 뒤 병합한다. index·start chunk·worker·font 4개 HTTP body가 최종 파일 SHA와 일치하고 삭제 pro는404다. Vite preview를 실제 StaticSite/Ktor의 MIME/hash/security 수용으로 확대하지 않는다.

| 실행 | 결과·포함관계 | 경계 |
|---|---|---|
| Node 필수 | 37파일/589 PASS | R1 소스 snapshot. 후속 수정은 web source/test/config |
| browser 필수→표적 | 118파일/1098 중1092 PASS·6 FAIL → Board HUD2파일/18 PASS | 후속18에 원 실패6 포함. 1092+18을 새 전체 분모로 더하지 않음 |
| landing/input/Playback | 35 PASS | 기존 단언·CardId·접촉/획득/뻑/복원/skip/reduced 보존 |
| RP07 | 실제 relay pair1 PASS·34.8초, 종료 후31,000ms 외부 HTTP/WS0 | 같은 문서·실제 Home link. preview 수정 전 host 서빙과 guest 최종 dist를 구별; 원 rawhash 실패 보존 |
| 수정 표적 | 48행=탐색22+손패16+모바일기하2+desktop2+손상저장1+preview1+guest문서entry2+설정1+홈1. 47 PASS/1 하네스 FAIL 뒤 preview1 PASS | 404의 absent content-type을 빈 문자열로 정규화. 크기/timeout/threshold 완화 없음 |
| 탐색22 내부 | 503/잘못200 same-document 안전 복귀 C/W4 포함 | document marker·저장·worker1·입력 수락. W503 manual reload는 재요청0/오류를 명시 확인 후 저장 게임으로 복귀하며 자동 복구 성공이 아님 |
| 실제 화면 캡처 | 같은 fixture 7 PNG·2 video·23 상태 검사 PASS | a77+source digest `367e9255487e8b2b10de7bf82a6ba7e616ac3748346f49d972f790f22a9c273a`. 정지 PNG와 표본 영상 프레임 검토, 전체 시각/실기기 수용과 구분 |
| PNG 후속 | 원29 테스트만 실행,29 이미지 차이 보존·baseline 변경0 | 앞선 기능 단언은 유지; 실패 뒤 같은 테스트의 추가 동작은 미실행. 후속 검토 뒤 의도 변화만 갱신 |

캡처 artifact hash는 `9a534fa1fc9a4ade6d88a237e4180f16a7ce1919a09d2094a5ff194a4cf2cf00`(앱 허용 자산 hash)이며149개 파일 raw1,693,193 B/2,097,152 B다. 캡처 하네스의 전체 파일 목록 digest `0f7993c5dc3c07e0c00fdc9b70343542c167fddcbdc560386f263941427c8bc5`와 분모가 다르다. 이번 raw 수치는 initial body1,500,000 B나 사용자 속도 개선 증거가 아니다. normal-turn 영상2.80초는 합법 seed1 history의 손패13/덱7/획득13·14 경로이고 두짝 landing10/30 fixture와 다르다. navigation 영상2.28초는 메뉴→설정 분류→Back이다. 혼잡 PNG는 constructed fixture다. HTML/OSS/hash/budget 순서·컴파일러/lock 핀은 유지하며 게임 Playback/FLIP·wire·엔진 규칙 변경은 없다.

남은 merge gate:29 PNG의 의도 변화 검토·필요 좁은 기준 갱신, 새 immutable 독립 review, 이후 최종 필수 smoke/직렬 timing·Android/full 영향 검사 및 초기 body 확인. 사람 실기기와 운영 배포는 별도다. 새 디자인 기능을 추가하지 않고 이 단위를 먼저 고정한다.

## 이행·되돌리기

SK3-P0 설계/유한 proof → P1 build shell·entry/token/path/오류·도구 → P2 route·coordinator 분리 → P3 필수 검증·독립 review·root 통합 순서다. proof 실패로 조정한 선택은 코드와 같은 commit에 문서화한다. v0.4.1 배포는 계속 유지한다. 저장/wire 형식을 바꾸지 않아 검증 실패 시 branch 또는 미출하 변경을 revert하고 원 artifact를 사용할 수 있다. 운영 포인터·main 병합·tag/release·서명은 root만 소유한다. Galaxy/iPhone 사람 수용은 별도 절차/사람 결과가 필요하며 자동 테스트로 PASS 처리하지 않는다.
