# AGENTS.md — p2p-gostop 작업 규범

이 파일은 사람과 AI 에이전트 모두가 따르는 단일 규범이다. 문서 체계: `intend.md`(왜) → `spec.md`(무엇을) → `plan.md`(어떻게) → 코드. 규칙의 근거는 `docs/research/rules-commercial.md` 12장뿐이다.

## 1. 절대 규칙
- 요구사항 상태를 바꾸는 PR은 `plan.md` §3-2 진행 매트릭스를 갱신한다.
- 빌드·테스트는 호스트에서 네이티브로 실행하고, CI도 같은 명령을 러너에서 네이티브로 돈다(5장). 로컬과 CI의 동일성은 컨테이너가 아니라 **같은 버전 핀**으로 담보한다: `.nvmrc`(Node), `package-lock.json`(Playwright 1.63.0이 브라우저 빌드까지 결정), Gradle 설정(AGP·compileSdk 36·build-tools 36.0.0), JDK 21, 배포판 Ubuntu 24.04. 호스트 도구는 처음 한 번 `tools/setup-host.sh`로만 설치한다. sudo 암호가 필요한 단계(apt)는 사람이 터미널에서 실행하고, 에이전트는 막힌 단계와 오류 원문을 오케스트레이터에 보고한다. 에이전트 도구 Svelte MCP(`.mcp.json`)도 호스트 `npx`로 돈다.
- 라이브러리 API를 쓰기 전에 공식 문서(Context7)를 조회한다. 기억으로 쓰지 않는다.
- 버전은 아래 표를 따른다. 표에 없는 의존성을 추가하려면 `plan.md` 1.8에 근거를 적고 나서 추가한다.
- 게임 규칙의 기대값은 `rules-commercial.md` 12장에서만 도출한다. 다른 오픈소스 구현의 출력을 정답으로 쓰지 않는다. PolyForm NC·무라이선스 저장소의 코드는 복사하지 않는다.
- 커밋은 Conventional Commits이고, 커밋 메시지·PR 본문에 `spec.md`·`plan.md`의 요구사항 ID를 적는다. 에이전트는 지시받지 않으면 커밋·푸시하지 않고, PR을 병합하지 않는다. 병합은 CI 녹색과 reviewer 판정 뒤 사람 또는 사람이 지시한 오케스트레이터가 한다.
- 커밋 파일·PR 본문·검증 자료의 개인 계정·홈/WSL/worktree 경로·호스트/tailnet·실제 네트워크 식별자·자격 증명은 역할별 자리표시자로 익명화한다. 공개 프로젝트 URL·공식 링크·원저작자 라이선스 고지는 보존한다. 복붙 명령은 셸에 맞게 인용하고, 실행 전 치환할 자리표시자와 실행 가능한 환경변수를 구분해 명시한다. 리뷰는 추적 파일 diff에서 익명화와 명령 구문을 확인하며 비밀 원문을 로그·PR에 재출력하지 않는다.
- 외부 네트워크 요청(CDN, 웹폰트, 원격 API)을 코드에 넣지 않는다. 모든 자산은 번들한다.
- 실기기 검증(핫스팟, iPhone Safari)은 사람이 한다. 에이전트는 `docs/device-test/`의 절차서를 갱신하고, 사람이 준 결과만 그곳에 기록한다.

## 2. 버전 표 (2026-09-28 확인, `docs/research/tech-stack.md`·`docs/research/agent-era-stack.md`)
| 항목 | 버전 |
|---|---|
| Node / npm | **24.21.0** LTS / 11.19.0 (`.nvmrc`; 호스트는 nvm, CI·릴리스는 `actions/setup-node`의 `node-version-file`), npm workspaces (`engines >=24.20.0 <25`) |
| TypeScript (하이브리드) | `packages/web`: **6.0.3** (7.x 금지: svelte-check `^5‖^6`·typescript-eslint `<6.1` 비호환) / 순수 TS 패키지(engine·ai·protocol·relay-dev·sim): **7.0.2**(tsgo, 타입 검사 전용, 루트 npm 별칭 `typescript-7`) |
| Vite / Svelte / vite-plugin-svelte | 8.3.1 / 5.57.1 / 7.3.1 |
| svelte-check | 4.7.6 |
| Vitest / fast-check | 5.0.2 / 4.10.2 (vitest·@vitest/* 5.0.2는 2026-09-25 09:00Z 게시라 첫 lock 생성 때만 `--min-release-age-exclude`로 예외, 09-28 09:00Z 이후 정상 충족) |
| @vitest/browser-playwright / vitest-browser-svelte | 5.0.2 / 3.1.0 |
| @playwright/test · playwright / @axe-core/playwright | 1.63.0 (브라우저 빌드는 이 버전이 고정한다. 설치는 `npx playwright install --with-deps chromium webkit`, 호스트는 `tools/setup-host.sh`; `playwright`는 Vitest 브라우저 모드 provider용) / 4.13.0 |
| ws / @types/ws / @types/node | **8.22.0** (relay-dev, npm 게시 2026-09-26 15:00 UTC, 2026-09-29 19:15 UTC 확인; `min-release-age=3` 충족) / 8.18.1 / **24.19.0** (Node 24 라인, NF-09·plan §1.8). [npm 게시 메타데이터](https://registry.npmjs.org/@types%2Fnode): 2026-09-25 22:09:25.850 UTC 게시, 09-28 같은 시각부터 3일 충족; 09-29 검토로 보류 해제. 전이 타입 `undici-types` 7.24.6도 2026-03-25 게시. 배포 타입 차이와 검증은 [#95](https://github.com/kywoo26/p2p-gostop/pull/95) 참고. |
| Svelte MCP (에이전트 도구, 로컬 stdio) | `@sveltejs/mcp` 0.1.26 (`npx -y @sveltejs/mcp@0.1.26`, 무료·오픈소스, 원격 엔드포인트 미사용) |
| 순수 TS 린트·포맷 (Oxc) | oxlint 1.85.0 + oxlint-tsgolint 7.0.2003(type-aware, stable) / oxfmt 0.70.0 |
| web 린트·포맷 | ESLint 10.11.0 / @eslint/js 10.0.1 / eslint-plugin-svelte 3.23.0 / typescript-eslint 8.70.1 / globals 17.12.0, Prettier 3.9.9 / prettier-plugin-svelte 4.1.1 |
| knip / svgo / uqr / zod | 6.38.0 / 4.1.0 / 0.1.3 / 4.6.5 (`zod/mini`, TRIAL) |
| Kotlin / AGP / Gradle / JDK | 2.4.20 / 9.4.1(내장 Kotlin, `org.jetbrains.kotlin.android` 플러그인 적용 금지) / 9.8.0 / JDK 21 (CI·릴리스 `actions/setup-java` Temurin 21, 호스트 Ubuntu `openjdk-21-jdk-headless`; 패치 버전이 같으면(2026-09-30 둘 다 21.0.12) 배포판 차이를 허용한다) |
| compileSdk / targetSdk / minSdk | 36 / **36**(37 금지: LAN 인바운드 권한) / 33 |
| Ktor | 3.6.0 (`ktor-server-cio`, `ktor-server-websockets`) |
| androidx.webkit / ZXing core | 1.17.1 / 3.5.4 |
| androidx.activity | 1.13.0 (`OnBackPressedCallback`, plan.md 1.8) |
| Android JVM 테스트 JSON | `org.json:json` **20260814** (2026-09-29 검토, NP-02·NF-09·plan §1.8). [Maven Central 게시](https://repo.maven.apache.org/maven2/org/json/json/20260814/) 2026-08-14 16:19 UTC로 3일 경과. [릴리스](https://github.com/stleary/JSON-java/releases/tag/20260814)는 XML 공백 문자 처리 수정이며 테스트 전용 의존성이다. `.npmrc`의 자동 제한은 npm에만 적용되고 Maven은 게시일을 직접 확인한다. |
| 자산 변환(dev 전용, PA-03) | Python **3.14 이상**(사용자 지시, PEP 723 `requires-python = ">=3.14"`) / Pillow **12.3.0**(2026-07-01, cp314 휠) / Ubuntu 24.04 apt ffmpeg 7:6.1.1-3ubuntu5 / libavif-bin 1.0.4-1ubuntu3. 폰트 제작 fonttools 4.61.1 / brotli 1.2.0(둘 다 cp314 휠). 실행기 uv 0.11.6(`uv run <script>`). 2026-09-30 재생성: webp 57개는 새 libwebp로 바이트만 다르고 디코딩 픽셀 동일(차이 0/12,959,744, −7,506 B), 나머지 산출물·폰트는 바이트 동일. 앱 런타임 의존성 없음 |
| Android SDK | cmdline-tools 23.0(16111833, SHA-256 고정) + `platforms;android-36`·`build-tools;36.0.0`·`platform-tools`. 호스트는 `tools/setup-host.sh`가 `$ANDROID_HOME`(기본 `~/Android/Sdk`)에 설치, CI는 `ubuntu-24.04` 러너 내장 SDK(같은 두 패키지 포함) |
| GitHub Actions | `runs-on: ubuntu-24.04` 고정, checkout@v7, setup-node@v7, setup-java@v6, gradle/actions/setup-gradle@v6, upload-artifact@v7, download-artifact@v8, softprops/action-gh-release@v3. 빌드·테스트는 러너에서 네이티브로 실행 |

## 3. 금지 목록 (에이전트가 자주 틀리는 것)
- **Svelte 4 문법 금지**: `export let`, `$:`, `on:click`, `createEventDispatcher`, `<slot>`. Svelte 5 runes(`$state`, `$derived`, `$effect`, `$props`), `onclick`, `{@render children()}`, snippets를 쓴다.
- **SvelteKit 아님**: 순수 Vite + Svelte. `$app/*`, `+page.svelte`, `load` 함수 없음. 라우팅은 앱 내부 상태로 처리.
- **Tailwind·shadcn·Storybook·Capacitor·Biome·pnpm·Turborepo·Pixi·Phaser·GSAP 도입 금지** (plan.md 1.8).
- **툴체인 경계**: `packages/web`에 TS 7·oxlint·oxfmt를 쓰지 않는다(.svelte 미지원). 순수 TS 패키지에 ESLint·Prettier를 추가하지 않는다. 루트 `typescript`는 6.0.3이며 TS 7은 `node ../../node_modules/typescript-7/bin/tsc`로만 부른다.
- **TS 문법**: Node가 `.ts`를 직접 실행(type stripping)하므로 `erasableSyntaxOnly` — `enum`, `namespace`, 생성자 매개변수 프로퍼티 금지. 상대 import는 `.ts` 확장자를 붙인다.
- **비보안 컨텍스트 금지 API**(게스트는 `http://192.168.x.y`): `navigator.wakeLock`, `navigator.share`, `navigator.clipboard`, `navigator.serviceWorker`, `caches`, `crypto.subtle`, `crypto.randomUUID`, `navigator.vibrate`(iPhone 없음), `screen.orientation.lock`, 요소 전체 화면. 난수는 `crypto.getRandomValues`, 해시는 순수 JS SHA-256.
- **Android**: `usesCleartextTraffic` 대신 Network Security Config(127.0.0.1만). `kapt` 금지(KSP). Netty 금지(CIO). Compose 도입 금지(WebView 셸).
- **엔진**: 부수효과·타이머·I/O·`Math.random` 금지(oxlint `no-restricted-properties`·`no-restricted-globals`로 강제). 좌석은 인덱스 0/1, `human`/`computer` 같은 이름 금지. 상태에는 카드 ID(0~50)만.

## 4. 구조와 관례
- 모노레포: `packages/{engine,ai,protocol,web,relay-dev}`, `tools/{sim,setup-host.sh}`, `android/`, `docs/`. 의존 방향: engine ← ai ← web, engine ← protocol ← web. android는 TS 패키지에 의존하지 않고 `packages/web/dist`만 `android/app/src/main/assets/web`으로 복사.
- import 경계: [허용표·probe·갱신 규칙](docs/reviews/refactor-import-boundaries.md)을 따른다(공개 하위 경로는 `engine/testing`·`web/net`만). `import()`는 따옴표 문자열만 허용하며 템플릿·계산된 경로는 금지한다. workspace/exports 변경 시 허용표·린트·probe를 함께 갱신하고 `npm run lint`로 검사한다.
- 엔진 API: `reduce(state, action) → {ok:true, state, events} | {ok:false, reason, message}`, `legalActions(state, seat)`, `playerView(state, seat)`, `settle(state, rules?)`. 모두 순수 함수, 시드 PRNG는 상태 안.
- 웹: Svelte scoped CSS + `src/styles/tokens.css`(OKLCH, `--dur-*`). 카드 애니메이션은 `src/anim/`의 WAAPI FLIP 헬퍼, 모달·배너는 Svelte transition. 카드는 `<img>`로 svgo 최적화 SVG.
- 테스트: JSON 규칙 벡터(`packages/engine/test/vectors/*.json`, 각 항목에 규칙 ID R/B/S/E/G/M와 한국어 설명) + fast-check 속성 테스트. 특수 이벤트는 정상·경계·반례 3종. "서로 다른 월 두 쌍 먹기는 따닥이 아니다" 반례 필수.
- 툴체인(plan.md 1.8 하이브리드): 순수 TS 패키지는 루트 `.oxlintrc.json`(oxlint, `--type-aware`)·`.oxfmtrc.json`(oxfmt)·TS 7 `tsc --noEmit`. `packages/web`은 `packages/web/eslint.config.js`(ESLint, 금지 API 규칙)·`packages/web/.prettierrc`(Prettier)·`svelte-check`(TS 6). 루트 `npm run lint|check|format`이 둘 다 돌린다. 한국어 주석·문서, 영어 식별자.
- 패키지: 워크스페이스 패키지는 빌드 없이 `exports: ./src/index.ts`로 소스를 직접 내보낸다. 공용 컴파일 옵션은 `tsconfig.base.json`(strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, TS 6 기본값 변경으로 `types`를 패키지마다 명시).
- 테스트 위치: 루트 `npm test`(Vitest, Node)는 web을 제외한 모든 패키지. web 컴포넌트 테스트(`*.test.ts`, Vitest 브라우저 모드, 루트 `npm run test:browser`)와 E2E(`e2e/`, Playwright)는 Playwright Chromium·WebKit으로 돈다. 스크린샷 기준 이미지는 Ubuntu 24.04 + `playwright install --with-deps`(호스트·CI 공통)에서 만든다.
- 의존성 추가: `npm install -D <pkg>@<정확한 버전> -w <workspace>`. `.npmrc`의 `min-release-age=3`이 게시 3일 미만 버전을 거부한다(예외가 필요하면 `--min-release-age-exclude=<pkg>`를 그 명령에만 주고 근거를 이 표에 적는다).

## 5. 검증 명령
- 처음 한 번(그리고 `.nvmrc`·`@playwright/test`·Android 설정이 바뀐 뒤) 저장소 루트에서 `tools/setup-host.sh`. 여러 번 실행해도 되고, 설치하는 것을 단계별로 출력한다. 비대화형으로 실행하면 sudo 단계(와 설치에 실패한 SDK 패키지)를 보류로 남기고 실패하며, 스스로 재실행하지 않는다. 에이전트는 그 출력(보류 목록과 오류 원문)을 오케스트레이터에 보고하고 나머지 작업을 계속한다.
- 셸마다 `nvm use`(`.nvmrc`). 새 체크아웃·워크트리는 먼저 `npm ci`.
- PR 필수 명령(PR은 `npm run e2e:smoke -w packages/web`, main 푸시·릴리스 전은 `npm run e2e -w packages/web`(full)):
```sh
npm ci                                   # 처음, 그리고 package-lock.json이 바뀐 뒤
npm run lint
npm run check
npm test
npm run test:browser
npm run build -w packages/web
npm run e2e:smoke -w packages/web
android/gradlew -p android assembleDebug testDebugUnitTest lint
```
  `npm run verify`는 npm ci 제외, E2E는 full로 위 검증을 차례로 돈다.
- 그 밖: `npm run dev -w packages/web`(Vite, 5173), `npm run start -w packages/relay-dev`(중계, 17777), `npm run sim -- --workers 4 …`, 스크린샷 기준 갱신 `npm run e2e -w packages/web -- --update-snapshots`, 자산 변환 `uv run packages/web/scripts/build-pro-assets.py`(파이썬 스크립트는 모두 `uv run`, 의존성은 스크립트의 PEP 723 메타데이터).
- 공유 머신 부하: 여러 에이전트가 한 호스트를 쓴다. E2E는 설정 기본값(로컬 4 workers)을 넘기지 않고, `sim`은 `--workers 4` 이하(기본값은 CPU 수), Gradle은 `--max-workers=4` 이하, `@timing`(AC-06)은 설정대로 직렬로 둔다.
- 호스트와 CI 결과가 다르면 버전 핀(위 1장 목록)과 `tools/setup-host.sh` 출력부터 대조한다. 문서에 남은 옛 표기 `docker compose run --rm dev <명령>`은 호스트 `<명령>`과 같다(개발 이미지는 2026-09-30 삭제).
- 포맷은 편집할 때마다 돌리는 훅이 아니라 커밋 전 `npm run lint:fix`로 맞추고, `lint`(CI 포함)가 `oxfmt --check`·`prettier --check`로 검사한다.
