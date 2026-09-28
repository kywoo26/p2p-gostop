# AGENTS.md — p2p-gostop 작업 규범

이 파일은 사람과 AI 에이전트 모두가 따르는 단일 규범이다. 문서 체계: `intend.md`(왜) → `spec.md`(무엇을) → `plan.md`(어떻게) → 코드. 규칙의 근거는 `docs/research/rules-commercial.md` 12장뿐이다.

## 1. 절대 규칙
- 모든 빌드·테스트는 `./dev.sh <task>`(Docker)로 실행한다. WSL/호스트에 도구를 설치하지 않는다.
- 라이브러리 API를 쓰기 전에 공식 문서(Context7)를 조회한다. 기억으로 쓰지 않는다.
- 버전은 아래 표를 따른다. 표에 없는 의존성을 추가하려면 `plan.md` 1.8에 근거를 적고 나서 추가한다.
- 게임 규칙의 기대값은 `rules-commercial.md` 12장에서만 도출한다. 다른 오픈소스 구현의 출력을 정답으로 쓰지 않는다. PolyForm NC·무라이선스 저장소의 코드는 복사하지 않는다.
- 커밋은 Conventional Commits. 에이전트는 지시받지 않으면 커밋·푸시하지 않는다.
- 외부 네트워크 요청(CDN, 웹폰트, 원격 API)을 코드에 넣지 않는다. 모든 자산은 번들한다.

## 2. 버전 표 (2026-09-28 확인, `docs/research/tech-stack.md`·`agent-era-stack.md`)
| 항목 | 버전 |
|---|---|
| Node / npm | 24.21.0 LTS / 11.x, npm workspaces |
| TypeScript | **6.0.3** (7.x 금지: svelte-check·typescript-eslint 비호환) |
| Vite / Svelte / vite-plugin-svelte | 8.3.1 / 5.57.1 / 7.3.1 |
| svelte-check | 4.7.6 |
| Vitest / fast-check | 5.0.2 / 4.10.2 |
| @vitest/browser-playwright / vitest-browser-svelte | 5.0.2 / 3.1.0 |
| @playwright/test / @axe-core/playwright | 1.63.0 (Docker 이미지 `mcr.microsoft.com/playwright:v1.63.0-noble`) / 4.13.0 |
| ESLint / eslint-plugin-svelte / typescript-eslint | 10.11.0 / 3.23.0 / 8.70.1 |
| Prettier / prettier-plugin-svelte | 3.9.9 / 4.1.1 |
| knip / svgo / uqr / zod | 6.38.0 / 4.1.0 / 0.1.3 / 4.6.5 (`zod/mini`, TRIAL) |
| Kotlin / AGP / Gradle / JDK | 2.4.20 / 9.4.1(내장 Kotlin, `org.jetbrains.kotlin.android` 플러그인 적용 금지) / 9.8.0 / Temurin 21 |
| compileSdk / targetSdk / minSdk | 36 / **36**(37 금지: LAN 인바운드 권한) / 33 |
| Ktor | 3.6.0 (`ktor-server-cio`, `ktor-server-websockets`) |
| androidx.webkit / ZXing core | 1.17.1 / 3.5.4 |
| Docker 이미지 | `node:24-bookworm-slim`, `cimg/android:2026.08.1-node`, `mcr.microsoft.com/playwright:v1.63.0-noble` |
| GitHub Actions | `runs-on: ubuntu-24.04` 고정, checkout@v7, setup-java@v6, gradle/actions/setup-gradle@v6, setup-node@v7, upload-artifact@v7, softprops/action-gh-release@v3 |

## 3. 금지 목록 (에이전트가 자주 틀리는 것)
- **Svelte 4 문법 금지**: `export let`, `$:`, `on:click`, `createEventDispatcher`, `<slot>`. Svelte 5 runes(`$state`, `$derived`, `$effect`, `$props`), `onclick`, `{@render children()}`, snippets를 쓴다.
- **SvelteKit 아님**: 순수 Vite + Svelte. `$app/*`, `+page.svelte`, `load` 함수 없음. 라우팅은 앱 내부 상태로 처리.
- **Tailwind·shadcn·Storybook·Capacitor·Biome·pnpm·Turborepo·Pixi·Phaser·GSAP 도입 금지** (plan.md 1.8).
- **비보안 컨텍스트 금지 API**(게스트는 `http://192.168.x.y`): `navigator.wakeLock`, `navigator.share`, `navigator.clipboard`, `navigator.serviceWorker`, `caches`, `crypto.subtle`, `crypto.randomUUID`, `navigator.vibrate`(iPhone 없음), `screen.orientation.lock`, 요소 전체 화면. 난수는 `crypto.getRandomValues`, 해시는 순수 JS SHA-256.
- **Android**: `usesCleartextTraffic` 대신 Network Security Config(127.0.0.1만). `kapt` 금지(KSP). Netty 금지(CIO). Compose 도입 금지(WebView 셸).
- **엔진**: 부수효과·타이머·I/O·`Math.random` 금지. 좌석은 인덱스 0/1, `human`/`computer` 같은 이름 금지. 상태에는 카드 ID(0~50)만.

## 4. 구조와 관례
- 모노레포: `packages/{engine,ai,protocol,web,relay-dev}`, `tools/sim`, `android/`, `docker/`, `docs/`. 의존 방향: engine ← ai ← web, engine ← protocol ← web. android는 TS 패키지에 의존하지 않고 `packages/web/dist`만 `android/app/src/main/assets/web`으로 복사.
- 엔진 API: `reduce(state, action) → {state, events}`, `legalActions(state, seat)`, `playerView(state, seat)`, `settle(state, rules)`. 모두 순수 함수, 시드 PRNG는 상태 안.
- 웹: Svelte scoped CSS + `src/styles/tokens.css`(OKLCH, `--dur-*`). 카드 애니메이션은 `src/anim/`의 WAAPI FLIP 헬퍼, 모달·배너는 Svelte transition. 카드는 `<img>`로 svgo 최적화 SVG.
- 테스트: JSON 규칙 벡터(`packages/engine/test/vectors/*.json`, 각 항목에 규칙 ID R/B/S/E/G/M와 한국어 설명) + fast-check 속성 테스트. 특수 이벤트는 정상·경계·반례 3종. "서로 다른 월 두 쌍 먹기는 따닥이 아니다" 반례 필수.
- 스타일: ESLint + Prettier 설정을 따른다. 한국어 주석·문서, 영어 식별자.

## 5. 검증 명령
`./dev.sh lint` · `./dev.sh check` · `./dev.sh test` · `./dev.sh e2e` · `./dev.sh apk:debug` · `./dev.sh android:test`. PR은 이 전부가 통과해야 한다.
