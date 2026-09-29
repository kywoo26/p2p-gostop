# AGENTS.md — p2p-gostop 작업 규범

이 파일은 사람과 AI 에이전트 모두가 따르는 단일 규범이다. 문서 체계: `intend.md`(왜) → `spec.md`(무엇을) → `plan.md`(어떻게) → 코드. 규칙의 근거는 `docs/research/rules-commercial.md` 12장뿐이다.

## 1. 절대 규칙
- 모든 빌드·테스트는 개발 이미지 안에서 실행한다: 저장소 루트에서 `docker compose run --rm dev <명령>`, 또는 Dev Container(`.devcontainer/`) 안에서 `<명령>` 그대로(5장). WSL/호스트에 도구를 설치하지 않는다(호스트에는 git·gh·docker만). 예외는 에이전트 도구인 Svelte MCP(`.mcp.json`, 호스트 `npx`) 하나다.
- 라이브러리 API를 쓰기 전에 공식 문서(Context7)를 조회한다. 기억으로 쓰지 않는다.
- 버전은 아래 표를 따른다. 표에 없는 의존성을 추가하려면 `plan.md` 1.8에 근거를 적고 나서 추가한다.
- 게임 규칙의 기대값은 `rules-commercial.md` 12장에서만 도출한다. 다른 오픈소스 구현의 출력을 정답으로 쓰지 않는다. PolyForm NC·무라이선스 저장소의 코드는 복사하지 않는다.
- 커밋은 Conventional Commits이고, 커밋 메시지·PR 본문에 `spec.md`·`plan.md`의 요구사항 ID를 적는다. 에이전트는 지시받지 않으면 커밋·푸시하지 않고, PR을 병합하지 않는다. 병합은 CI 녹색과 reviewer 판정 뒤 사람 또는 사람이 지시한 오케스트레이터가 한다.
- 외부 네트워크 요청(CDN, 웹폰트, 원격 API)을 코드에 넣지 않는다. 모든 자산은 번들한다.
- 실기기 검증(핫스팟, iPhone Safari)은 사람이 한다. 에이전트는 `docs/device-test/`의 절차서를 갱신하고, 사람이 준 결과만 그곳에 기록한다.

## 2. 버전 표 (2026-09-28 확인, `docs/research/tech-stack.md`·`docs/research/agent-era-stack.md`)
| 항목 | 버전 |
|---|---|
| Node / npm | 24.20.0 LTS / 11.19.0 (개발 이미지의 베이스 `mcr.microsoft.com/playwright:v1.63.0-noble`에 내장된 것을 로컬·CI·릴리스가 모두 쓴다), npm workspaces (`engines >=24.20.0 <25`) |
| TypeScript (하이브리드) | `packages/web`: **6.0.3** (7.x 금지: svelte-check `^5‖^6`·typescript-eslint `<6.1` 비호환) / 순수 TS 패키지(engine·ai·protocol·relay-dev·sim): **7.0.2**(tsgo, 타입 검사 전용, 루트 npm 별칭 `typescript-7`) |
| Vite / Svelte / vite-plugin-svelte | 8.3.1 / 5.57.1 / 7.3.1 |
| svelte-check | 4.7.6 |
| Vitest / fast-check | 5.0.2 / 4.10.2 (vitest·@vitest/* 5.0.2는 2026-09-25 09:00Z 게시라 첫 lock 생성 때만 `--min-release-age-exclude`로 예외, 09-28 09:00Z 이후 정상 충족) |
| @vitest/browser-playwright / vitest-browser-svelte | 5.0.2 / 3.1.0 |
| @playwright/test · playwright / @axe-core/playwright | 1.63.0 (Docker 이미지 `mcr.microsoft.com/playwright:v1.63.0-noble`, `playwright`는 Vitest 브라우저 모드 provider용) / 4.13.0 |
| ws / @types/ws / @types/node | 8.21.3 (relay-dev. 2026-09-28 선정 때 최신 8.22.0은 2026-09-26 게시라 `min-release-age=3` 미충족) / 8.18.1 / **24.19.0** (Node 24 라인, NF-09·plan §1.8). [npm 게시 메타데이터](https://registry.npmjs.org/@types%2Fnode): 2026-09-25 22:09:25.850 UTC 게시, 09-28 같은 시각부터 3일 충족; 09-29 검토로 보류 해제. 전이 타입 `undici-types` 7.24.6도 2026-03-25 게시. 배포 타입 차이와 검증은 [#95](https://github.com/kywoo26/p2p-gostop/pull/95) 참고. |
| Svelte MCP (에이전트 도구, 로컬 stdio) | `@sveltejs/mcp` 0.1.26 (`npx -y @sveltejs/mcp@0.1.26`, 무료·오픈소스, 원격 엔드포인트 미사용) |
| 순수 TS 린트·포맷 (Oxc) | oxlint 1.85.0 + oxlint-tsgolint 7.0.2003(type-aware, stable) / oxfmt 0.70.0 |
| web 린트·포맷 | ESLint 10.11.0 / @eslint/js 10.0.1 / eslint-plugin-svelte 3.23.0 / typescript-eslint 8.70.1 / globals 17.12.0, Prettier 3.9.9 / prettier-plugin-svelte 4.1.1 |
| knip / svgo / uqr / zod | 6.38.0 / 4.1.0 / 0.1.3 / 4.6.5 (`zod/mini`, TRIAL) |
| Kotlin / AGP / Gradle / JDK | 2.4.20 / 9.4.1(내장 Kotlin, `org.jetbrains.kotlin.android` 플러그인 적용 금지) / 9.8.0 / Temurin 21 |
| compileSdk / targetSdk / minSdk | 36 / **36**(37 금지: LAN 인바운드 권한) / 33 |
| Ktor | 3.6.0 (`ktor-server-cio`, `ktor-server-websockets`) |
| androidx.webkit / ZXing core | 1.17.1 / 3.5.4 |
| androidx.activity | 1.13.0 (`OnBackPressedCallback`, plan.md 1.8) |
| 자산 변환(dev 전용, PA-03) | Ubuntu python3-pil 10.2.0-1ubuntu1.3 / ffmpeg 7:6.1.1-3ubuntu5 / libavif-bin 1.0.4-1ubuntu3. 앱 런타임 의존성 없음 |
| Docker 이미지 | 단일 개발 이미지 `p2p-gostop-dev`(`docker/Dockerfile`, 태그는 `compose.yaml`): 베이스 `mcr.microsoft.com/playwright:v1.63.0-noble` + JDK `eclipse-temurin:21.0.12.1_1-jdk-noble` + Android cmdline-tools 23.0(16111833, SHA-256 고정)로 설치한 `platforms;android-36`·`build-tools;36.0.0`·`platform-tools` |
| GitHub Actions | `runs-on: ubuntu-24.04` 고정, checkout@v7, upload-artifact@v7, cache@v6(npm), gradle/actions/setup-gradle@v6, docker/setup-docker-action@v5, docker/setup-buildx-action@v4, docker/build-push-action@v7, softprops/action-gh-release@v3. 빌드·테스트는 개발 이미지 안에서 실행 |

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
- 모노레포: `packages/{engine,ai,protocol,web,relay-dev}`, `tools/sim`, `android/`, `docker/`, `docs/`. 의존 방향: engine ← ai ← web, engine ← protocol ← web. android는 TS 패키지에 의존하지 않고 `packages/web/dist`만 `android/app/src/main/assets/web`으로 복사.
- import 경계: [허용표·probe·갱신 규칙](docs/reviews/refactor-import-boundaries.md)을 따른다(공개 하위 경로는 `engine/testing`·`web/net`만). `import()`는 따옴표 문자열만 허용하며 템플릿·계산된 경로는 금지한다. workspace/exports 변경 시 허용표·린트·probe를 함께 갱신하고 `docker compose run --rm dev npm run lint`로 검사한다.
- 엔진 API: `reduce(state, action) → {ok:true, state, events} | {ok:false, reason, message}`, `legalActions(state, seat)`, `playerView(state, seat)`, `settle(state, rules?)`. 모두 순수 함수, 시드 PRNG는 상태 안.
- 웹: Svelte scoped CSS + `src/styles/tokens.css`(OKLCH, `--dur-*`). 카드 애니메이션은 `src/anim/`의 WAAPI FLIP 헬퍼, 모달·배너는 Svelte transition. 카드는 `<img>`로 svgo 최적화 SVG.
- 테스트: JSON 규칙 벡터(`packages/engine/test/vectors/*.json`, 각 항목에 규칙 ID R/B/S/E/G/M와 한국어 설명) + fast-check 속성 테스트. 특수 이벤트는 정상·경계·반례 3종. "서로 다른 월 두 쌍 먹기는 따닥이 아니다" 반례 필수.
- 툴체인(plan.md 1.8 하이브리드): 순수 TS 패키지는 루트 `.oxlintrc.json`(oxlint, `--type-aware`)·`.oxfmtrc.json`(oxfmt)·TS 7 `tsc --noEmit`. `packages/web`은 `packages/web/eslint.config.js`(ESLint, 금지 API 규칙)·`packages/web/.prettierrc`(Prettier)·`svelte-check`(TS 6). 루트 `npm run lint|check|format`이 둘 다 돌린다. 한국어 주석·문서, 영어 식별자.
- 패키지: 워크스페이스 패키지는 빌드 없이 `exports: ./src/index.ts`로 소스를 직접 내보낸다. 공용 컴파일 옵션은 `tsconfig.base.json`(strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, TS 6 기본값 변경으로 `types`를 패키지마다 명시).
- 테스트 위치: 루트 `npm test`(Vitest, Node)는 web을 제외한 모든 패키지. web 컴포넌트 테스트(`*.test.ts`, Vitest 브라우저 모드, 루트 `npm run test:browser`)와 E2E(`e2e/`, Playwright)는 같은 개발 이미지의 Chromium·WebKit으로 돈다.
- 의존성 추가: `docker compose run --rm dev npm install -D <pkg>@<정확한 버전> -w <workspace>`. `.npmrc`의 `min-release-age=3`이 게시 3일 미만 버전을 거부한다(예외가 필요하면 `--min-release-age-exclude=<pkg>`를 그 명령에만 주고 근거를 이 표에 적는다).

## 5. 검증 명령
- 진입점: 저장소 루트에서 `docker compose run --rm dev <명령>`(루트 `compose.yaml`의 `dev` 서비스, 이미지는 `docker/Dockerfile`). Dev Container 안이면 앞의 `docker compose run --rm dev`를 뺀다. CI(`ci.yml`)도 같은 이미지·같은 명령을 쓴다. 루트의 옛 셸 래퍼는 폐기되어 안내만 출력하고 실패한다(M6에서 삭제).
- 새 체크아웃·워크트리에는 `node_modules`가 없다(소스와 함께 바인드 마운트). 처음 한 번 `npm ci`를 돌린다. 기존 체크아웃의 `node_modules`가 root 소유라면 `ls -ld node_modules`로 확인한다. 빈 디렉터리는 호스트에서 `rmdir node_modules`로 제거하고, 내용이 있으면 `docker compose run --rm --user root dev chown -R 1000:1000 /work/node_modules`로 해당 디렉터리만 복구한 뒤 `npm ci`를 다시 실행한다. 옛 `*_node_modules`·`*_android-home` 명명 볼륨은 별도이므로, 필요 없으면 `docker volume ls --format '{{.Name}}'`로 확인한 정확한 이름만 `docker volume rm <옛_볼륨명>`으로 삭제한다(README 전환 절차).
- PR 필수 명령:
```sh
docker compose run --rm dev npm ci                          # 처음, 그리고 package-lock.json이 바뀐 뒤
docker compose run --rm dev npm run lint
docker compose run --rm dev npm run check
docker compose run --rm dev npm test
docker compose run --rm dev npm run test:browser
docker compose run --rm dev npm run build -w packages/web
docker compose run --rm dev npm run e2e -w packages/web
docker compose run --rm dev android/gradlew -p android assembleDebug testDebugUnitTest lint
```
- 그 밖: `docker compose run --rm -p 5173:5173 dev npm run dev -w packages/web`(Vite, 5173), `docker compose run --rm -p 17777:17777 dev npm run start -w packages/relay-dev`(중계, 17777), `docker compose run --rm dev npm run sim -- …`, `docker compose run --rm dev bash`(셸).
- `docker/Dockerfile`을 바꾸면 `compose.yaml`의 `image:` 태그를 올린다(없는 태그면 `run`이 자동으로 빌드한다).
- 포맷은 편집할 때마다 돌리는 훅이 아니라 커밋 전 `docker compose run --rm dev npm run lint:fix`로 맞추고, `lint`(CI 포함)가 `oxfmt --check`·`prettier --check`로 검사한다.
