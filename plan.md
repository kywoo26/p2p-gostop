# p2p-gostop — 구현 계획 (plan.md)

작성일: 2026-09-28 · 상태: v0.3 승인됨 (2026-09-28, 구현 진행 중)
상위 문서: `intend.md`(왜) → `spec.md` v0.3(무엇을) → **이 문서**(어떻게)
근거: `docs/research/tech-stack.md`(버전·제약), `docs/research/code-refs.md`(설계 차용), `docs/research/rules-commercial.md`(규칙), `docs/research/agent-era-stack.md`(에이전트 시대 스택 판단)

---

## 0. 구현 원칙 (사용자 지시 반영)

1. **최신 공식 문서 우선.** 라이브러리·API를 쓰기 전에 Context7 또는 공식 문서를 조회하고, 버전은 `tech-stack.md` 권장 스택 표의 정확한 값을 쓴다. 학습 데이터 기억으로 코드를 쓰지 않는다.
2. **저명한 패키지만.** 다운로드·유지보수·라이선스가 검증된 패키지만 의존성에 넣는다. 작은 기능을 위해 정체된 패키지를 쓰지 않고 직접 구현한다(예: SHA-256, QR은 `uqr`).
3. **표준 프로젝트 구조.** npm workspaces 모노레포, Vite/Svelte 공식 템플릿 구조, Android Studio 표준 프로젝트 레이아웃(Gradle Kotlin DSL, version catalog). 새로 익힐 관례를 만들지 않는다.
4. **테스트 동반.** 엔진과 AI는 테스트 먼저(규칙 벡터 → 구현). 모든 마일스톤에 자동 검증 기준이 있고, CI가 PR마다 실행한다. 실기기 검증만 사람이 한다.
5. **네이티브 설치 지양.** 모든 빌드·테스트는 Docker 컨테이너에서 실행. WSL에는 git, gh, docker CLI만 쓴다.
6. **결정론.** 엔진·AI·셔플은 시드 주입 가능한 순수 함수. 버그 리포트는 시드+액션 열로 재현한다.
7. **규칙의 단일 근거.** 규칙 기대값은 `rules-commercial.md` 12장에서만 도출한다. 다른 오픈소스 구현의 출력을 기대값으로 쓰지 않는다.
8. **작게 자주 커밋.** Conventional Commits(`feat:`, `fix:`, `test:`, `docs:`, `build:`, `ci:`). 마일스톤 완료 시 태그(`v0.<M>.x`).
9. **에이전트 실수는 기계가 잡는다.** 규범은 `AGENTS.md` 한 곳(버전 표, 금지 목록, 관례)에 두고 `CLAUDE.md`는 `@AGENTS.md`로 참조한다. 지켜야 할 규칙은 문서가 아니라 린트·타입 검사·테스트·훅으로 강제한다. 프레임워크를 "LLM이 더 잘 아는 것"으로 바꾸는 대신 즉각적인 실패 신호와 단일 최신 근거(Context7, Svelte MCP, llms.txt)를 갖춘다. (agent-era-stack.md 8(c))

---

## 1. 아키텍처

### 1.1 핵심 결정: 엔진은 TypeScript 한 벌, Android는 중계만
```
┌─ Android 호스트 폰 ──────────────────────────────────────┐   ┌─ iPhone ─────────────┐
│  Kotlin 앱                                                │   │  Safari              │
│   ├ LocalOnlyHotspot + 포그라운드 서비스                    │   │   웹 앱 (게스트 모드)  │
│   ├ Ktor 서버 (0.0.0.0:17777)                              │   │    ├ 뷰 렌더링          │
│   │   ├ GET /            → assets/web (정적 파일)            │◄──┤    ├ 액션 요청 전송     │
│   │   └ WS  /ws?role=    → 호스트↔게스트 메시지 중계          │   │    └ 이벤트 재생·애니   │
│   └ WebView (http://127.0.0.1:17777/?role=host)            │   └──────────────────────┘
│        웹 앱 (호스트 모드)                                   │
│         ├ 권위 엔진(reduce) + AI(Worker) + 원장              │
│         ├ 게스트 뷰(playerView) 생성·전송                     │
│         └ 자기 화면 렌더링                                    │
└──────────────────────────────────────────────────────────┘
```
- **왜**: 규칙·AI·정산을 Kotlin으로 다시 쓰지 않는다. Android 앱은 약 수백 줄의 껍데기로 유지되고, 엔진 테스트는 Node에서 한 번만 한다. 호스트 WebView origin은 `127.0.0.1:17777`로 고정되어 localStorage가 세션 간 유지된다(원장 저장, MN-05).
- **대가**: 호스트 앱이 포그라운드를 벗어나면 게임이 멈춘다. 대면 게임이므로 허용. 포그라운드 서비스와 `FLAG_KEEP_SCREEN_ON`으로 완화.
- **중계 규칙**: 서버는 `role=host` 소켓 1개, `role=guest` 소켓 1개만 받는다. 호스트 소켓의 메시지는 게스트로, 게스트의 메시지는 호스트로 그대로 전달한다. 서버는 메시지 내용을 해석하지 않는다(단, 크기 상한 64KB와 역할 중복 거절만).
- **BLE 전환 대비**: 웹 앱의 `Transport` 인터페이스(`send`, `onMessage`, `onClose`, `reconnect`)만 갈아끼우면 된다.

### 1.2 패키지 구조 (npm workspaces 모노레포)
```
p2p-gostop/
├─ package.json                 # workspaces, 공용 스크립트
├─ packages/
│  ├─ engine/                   # 순수 TS. 카드 카탈로그, 상태, reduce, legalActions, 점수, 정산, 규칙 옵션
│  │  ├─ src/
│  │  ├─ test/                  # Vitest + JSON 규칙 벡터(test/vectors/*.json)
│  │  └─ package.json
│  ├─ ai/                       # 순수 TS. 평가 함수, 그리디, ISMCTS, 난이도. engine에만 의존
│  ├─ protocol/                 # 메시지 타입, 버전, 직렬화, playerView 계약. engine 타입 재사용
│  ├─ web/                      # Vite + Svelte 5 앱. 호스트/게스트/솔로 모드, 애니메이션, 설정, 진단
│  │  ├─ src/
│  │  │  ├─ anim/               # WAAPI + FLIP 헬퍼(카드 이동·플립·획득 시퀀서)
│  │  │  ├─ styles/tokens.css   # 디자인 토큰(CSS 변수, OKLCH, --dur-* = spec 6.4 예산)
│  │  │  ├─ bridge/bridge.ts    # Android 브리지. Capacitor 플러그인 모양의 인터페이스(향후 전환 대비)
│  │  │  └─ routes/dev/gallery  # 고정 픽스처로 모든 화면·상태를 나열(dev 전용, 스냅샷·axe 대상)
│  │  ├─ fixtures/              # 갤러리·테스트용 상태 JSON
│  │  ├─ e2e/                   # Playwright (Chromium + WebKit) + axe + 스냅샷(도커 안에서만)
│  │  └─ public/cards/          # 화투 SVG (CC BY-SA 4.0, svgo 최적화) + 자체 제작 보너스·뒷면
│  └─ relay-dev/                # Node용 개발 중계 서버(Android Ktor 중계와 같은 규칙). 로컬 개발·E2E 전용
├─ tools/
│  └─ sim/                      # CLI: 셀프플레이 시뮬레이션, AI 강도 벤치마크, 머니 모델 산정
├─ android/                     # Android Studio 표준 레이아웃 (Gradle KTS, version catalog)
│  ├─ app/src/main/{kotlin,res,assets/web}
│  ├─ gradle/libs.versions.toml
│  └─ settings.gradle.kts
├─ docker/                      # Dockerfile·compose, 실행 스크립트
├─ .github/workflows/           # ci.yml, release.yml
├─ docs/                        # research/, ai-tuning.md, money-model.md, device-test-log/
├─ intend.md · spec.md · plan.md
```

### 1.3 모듈 경계와 의존 방향
`engine` ← `ai` ← `web`, `engine` ← `protocol` ← `web`, `relay-dev`는 `protocol`만. `android`는 어느 TS 패키지에도 의존하지 않고 빌드 산출물(`packages/web/dist`)만 `assets/web`으로 복사한다.

### 1.4 엔진 설계 (code-refs 6.2 채택)
- 카드: 불변 ID(0~50 정수) + 정적 카탈로그 `{month, kind, piValue, ribbon, isGodori, isBiGwang, isGukjin, bonus?}`. 상태에는 ID 배열만.
- 상태: `{phase, seats[2]{hand, captured{gwang,yeol,tti,pi}, goCount, shakes, score}, floor[], deck[], ppeokPiles[], pending?, rules, rng, history}`. 좌석 인덱스 0/1.
- `reduce(state, action) → {state, events[]}`, `legalActions(state, seat)`, `playerView(state, seat)`, `settle(state, rules) → {winner, steps[], amount}`. 모두 순수 함수. `pending`은 spec 4.3의 PROMPT_* 를 표현.
- 규칙 옵션 `RuleOptions`: spec 4장 및 rules 12.7의 24개 토글. 프리셋 3종은 옵션 객체 상수.
- 난수: 상태에 포함된 시드 기반 PRNG(xoshiro128** 직접 구현, 수십 줄). commit-reveal은 `protocol`에서 두 난수를 합쳐 시드로 만든다.

### 1.5 AI 설계
- `Evaluator(state, seat) → number`: 족보 진행도·기대 점수·상대 견제·박 위험·고 기대값의 가중합. 가중치는 JSON 파일.
- `GreedyPolicy`: 각 합법 수를 1수 적용 후 평가. 뒤집기 결과는 남은 카드 분포로 기대값 계산.
- `IsmctsPolicy`: 공개 정보와 일관되게 상대 손패·더미를 N회 샘플링(determinization), 각 샘플에서 UCT 탐색 + 그리디 롤아웃, 시간 제한(기본 1.0s) 후 방문수 최다 수 선택. Web Worker에서 실행.
- 벤치마크는 `tools/sim`이 수행하고 결과를 `docs/ai-tuning.md`에 기록. spec AI-04 기준 미달이면 마일스톤 미완.

### 1.6 웹 앱 설계
- 모드: `host`(권위 엔진 보유, 게스트에게 뷰 전송), `guest`(뷰 수신, 액션 요청), `solo`(엔진+AI 로컬, 네트워크 없음).
- 상태 관리: Svelte 5 runes. 외부 상태 라이브러리 없음. 엔진 이벤트 열을 애니메이션 큐가 소비하고, 큐가 비면 최신 뷰로 보정.
- 애니메이션: **Web Animations API + 자체 FLIP 헬퍼**(`src/anim/`, 수십 줄). 컨테이너를 넘나드는 카드 이동(손패→바닥→획득패)은 이 헬퍼가, 모달·배너·토스트는 Svelte transition이 담당한다. `transform`·`opacity`만 애니메이션하고 `will-change`는 움직이는 카드에만 건다(iOS 메모리). `anim.finished`로 턴 시퀀스를 async 체인으로 구성. 속도 설정과 E2E 즉시 모드는 배율 하나(`--dur-scale`)로 처리. 라이브러리(GSAP, Motion, Pixi 등)는 도입하지 않음. FLIP 헬퍼가 복잡해지면 `motion` 미니 `animate()`만 TRIAL.
- 스타일: Svelte scoped CSS + `tokens.css`. Tailwind·컴포넌트 라이브러리 없음. 네이티브 `<dialog>`로 부족하면 Bits UI 단일 컴포넌트만 검토.
- 카드 자산: SVG를 svgo로 최적화해 `<img>`로 렌더(인라인 SVG·filter 금지, Safari 래스터 성능).
- 비보안 컨텍스트 제약(spec NF-02)은 ESLint 코어 규칙 `no-restricted-properties`/`no-restricted-syntax`로 강제(커스텀 규칙 없음, .svelte에도 적용).
- 프로토콜 입력 검증: `zod/mini`(Zod 4) TRIAL. 신뢰할 수 없는 WS 입력을 스키마로 검증하고 타입을 스키마에서 도출.

### 1.8 스택 확정 (v0.2, 웹·도구 계층. Android·CI 계층은 tech-stack.md 권장 스택 그대로)
| 계층 | 선택 (2026-09-28 npm latest) | 비고 |
|---|---|---|
| Node / 패키지 | 24.21.0 LTS, npm workspaces, `.npmrc` `min-release-age=3` | 공급망 방어. pnpm·Turborepo 도입 안 함 |
| 웹 UI | Vite 8.3.1 + Svelte 5.57.1 + `@sveltejs/vite-plugin-svelte` 7.3.1 | React·Solid·Vue 전환 안 함 |
| **언어 (하이브리드, 2026-09-28 결정)** | 순수 TS 패키지(engine/ai/protocol/relay-dev/sim): **TypeScript 7.0.2(tsgo)**. `packages/web`: **TypeScript 6.0.3** + `svelte-check` 4.7.6 | TS 7은 typescript-eslint·svelte-check와 비호환이라 web만 TS 6. 파이썬 ty에 해당하는 네이티브 검사기를 코드 양이 가장 많은 패키지에 적용 |
| **린트·포맷 (하이브리드)** | 순수 TS 패키지: **oxlint + oxfmt**(Oxc, Rust). web: ESLint 10.11.0 + `eslint-plugin-svelte` 3.23.0 + `typescript-eslint` 8.70.1, Prettier 3.9.9 + `prettier-plugin-svelte` 4.1.1 | ruff에 해당. .svelte 템플릿 린트는 Oxc 미지원이라 web만 ESLint. Svelte 정식 지원 시 Vite+(`vp`, 2026-07 베타)로 일원화 재평가 |
| 단위 테스트 | Vitest 5.0.2 + **fast-check 4.10.2**(engine/ai 속성 테스트) | JSON 벡터와 이중망 |
| 컴포넌트 테스트 | **`@vitest/browser-playwright` 5.0.2 + `vitest-browser-svelte` 3.1.0** (Chromium+WebKit) | FLIP 측정 등 실제 레이아웃 필요 |
| E2E | `@playwright/test` 1.63.0 + **`@axe-core/playwright` 4.13.0** + `toHaveScreenshot`(도커 안에서만 결정적) | Chromatic 등 유료 서비스 없음 |
| 애니메이션 | WAAPI + 자체 FLIP 헬퍼, Svelte transition | 0KB |
| 스타일 | scoped CSS + `tokens.css`(OKLCH) | 0KB |
| 자산 | svgo 4.1.0 | 번들 예산 |
| 프로토콜 검증 | `zod` 4.6.5 (`zod/mini`) TRIAL | |
| QR | `uqr` 0.1.3 | |
| 위생 | **knip 6.38.0**, 번들 ≤1.5MB·외부 URL 0건 검사 스크립트(의존성 0) | CI 게이트 |
| 의존성 갱신 | Dependabot(npm·gradle·github-actions, devDeps 그룹, 기본 쿨다운) | |
| 에이전트 도구(로컬) | `AGENTS.md` + `CLAUDE.md`(`@AGENTS.md`), Context7, **Svelte 공식 MCP(`@sveltejs/mcp`, 프로젝트 `.mcp.json`에 로컬 stdio로 등록, 무료·오픈소스, 원격 엔드포인트 미사용)**, 프로젝트 `.claude/`(서브에이전트 3종·스킬 3종·권한 규칙, 편집 훅 없음: 포맷은 `lint:fix`·CI `lint`로 강제, 근거 `docs/reviews/harness-audit.md`). `chrome-devtools-mcp`·`@playwright/mcp`는 필요 시 | 저장소 범위 설정만. 사용자 전역 설정은 건드리지 않음 |
| Android 셸 | 직접 작성 Kotlin + WebView + Ktor (변경 없음). `bridge.ts`는 Capacitor 플러그인 모양 | Capacitor 8은 iOS 단계에서 재평가. Tauri·RN·Flutter·CMP 도입 안 함 |
| Android 테스트 의존성 | `ktor-server-test-host` 3.6.0, `kotlin-test-junit` 2.4.20, `junit` 4.13.2 (테스트 전용) | Ktor `testApplication`과 JVM 단위 테스트에 필요. M0에서 추가 |
| Android 중계 벡터 JSON | `org.json:json` 20260719 (테스트 전용) | Android JVM 단위 테스트의 `android.jar` JSON 스텁은 메서드를 실행하지 않으므로, 저장소 공유 시나리오 파일을 실행 시 읽는 데 실제 구현이 필요하다 (#36). APK 런타임에는 포함하지 않는다 |
| Android 런타임 의존성 | `kotlinx-coroutines-android` (Ktor 3.6.0이 요구하는 코루틴 버전과 일치하도록 명시 선언) | 전이 의존에 기대지 않는다 (M0 리뷰) |

### 1.7 Android 앱 설계
- M4 중간 구조는 `MainActivity`(네이티브 핫스팟·진단)와 `GameActivity`(WebView, androidx.webkit 1.17.1) 두 화면이다. WebView는 서버만 켜진 상태에서도 `/`로 열어 솔로 화면에 진입한다.
- `HotspotService`(포그라운드, `connectedDevice`): LOHS 시작·유지, IP 탐색(`NetworkInterface` 순회), Ktor 서버 기동. 서버는 `0.0.0.0:17777`에서 계속 듣지만, LAN 모드가 꺼져 있으면 비루프백 HTTP 요청은 403, WebSocket 업그레이드는 1008 `lan-disabled`로 거절한다. 앱 자동 진입은 서버 전용·LAN 꺼짐 상태다. 사용자가 핫스팟 또는 `주소만 표시`를 명시적으로 선택하면 LAN 모드를 켠다. LOHS 실패·시스템 종료 때는 다시 끈다. `주소만 표시`는 같은 LAN의 모든 기기에 열리므로 경고를 표시한다(NF-06).
- **HostBridge 단일 계약**: Android WebView의 `addWebMessageListener` 객체 이름은 `HostBridge`, 허용 origin은 `http://127.0.0.1:17777`의 메인 프레임뿐이다. JSON 요청은 `{type,id?,...}`이고 응답은 요청에 `id`가 있으면 같은 값을 돌려준다. 핫스팟 상태는 첫 브리지 접촉과 변경 때 `id` 없는 이벤트로도 전송한다. `null` 가능 필드는 JSON `null`로 보내며, 입력의 JSON `null`은 문자열 `"null"`로 변환하지 않는다. 입력 64KB 초과는 `error{message:"tooLarge"}`로 응답한다.
  - `getHotspot`·`startHotspot` → `hotspot{state,ssid,password,ip,port,error,lanEnabled,warning}`. 상태는 `off|starting|on|addressOnly|failed`. `startHotspot`은 서버를 재시작하지 않고 서버 전용/주소 모드에서 LOHS로 올린다. 권한이 없으면 `error{message:"permissionRequired"}`와 Android 권한 안내를 보낸다. 허용·거절·설정 복귀 결과는 원래 `id`를 붙인 `hotspot` 또는 `error`로 다시 전송한다.
  - `stopHotspot` → `stopHotspot{stopped:true}`. LOHS만 해제하고 `addressOnly`로 내려가며 서버와 호스트 WebSocket은 유지한다. `enableLan{bool}` → `lan{enabled}`; 서버 재시작 없이 LAN 게이트를 바꾼다.
  - `share{text,filename?,title?}` → `share{shared}`(Android 공유 시트); `log{role?,message?,level?,entries?}` → `log{accepted}`. 게스트 로그는 256KB 별도 버퍼(줄당 2KB), 호스트 웹 로그도 네이티브 진단과 별도 버퍼에 보관한다. `entries` 항목의 `role`은 최상위 `role`보다 우선한다.
  - `keepScreenOn{bool}` → `keepScreenOn{enabled}`; `gameActive{bool}` → `gameActive{active}`. 웹 게임 페이지가 열린 동안 뒤로 가기 확인은 기본 켜짐이며 웹은 `gameActive`로 진행 상태를 명시한다. `vibrate{pattern:number[]}` → `vibrate{accepted}`(진동/쉼 교대, 최대 16구간·구간당 500ms·총 2초).
  - `openDiagnostics` → `openDiagnostics`(진단 화면에서 돌아오면 같은 게임 WebView); `getDeviceInfo` → `deviceInfo{device,version,gitSha,buildTime}`.
- `feat/m4-integration` 웹 구현은 `addressOnly`·`lanEnabled`·NF-06 경고, `gameActive`, `vibrate`, `enableLan`, `id` 에코와 `permissionRequired` 결과를 이 계약에 맞춘다.
- 서버 포트 17777 고정. Network Security Config로 `127.0.0.1`만 cleartext.
- 폴백: LOHS 실패 시 "시스템 핫스팟 켜기" 안내 + 이미 있는 Wi-Fi 인터페이스 IP 표시(FR-02).

---

## 2. 개발 환경 (Docker)

| 서비스 | 이미지 | 용도 |
|---|---|---|
| `node` | `node:24-bookworm-slim` | 엔진·AI·프로토콜 단위 테스트, 웹 빌드, sim CLI |
| `e2e` | `mcr.microsoft.com/playwright:v1.63.0-noble` | Playwright Chromium+WebKit E2E |
| `android` | `cimg/android:2026.08.1-node` | Gradle 빌드(APK), Android 단위 테스트 |

- `docker/compose.yml`에 세 서비스와 명명된 볼륨(`node_modules`, `gradle-cache`, `pw-browsers`)을 둔다. 소스는 바인드 마운트.
- 실행 진입점 `./dev.sh <task>`: `install`, `test`, `test:watch`, `build:web`, `e2e`, `sim`, `apk:debug`, `apk:release`, `lint`. 내부적으로 `docker compose run --rm <svc> …`.
- Docker Desktop이 꺼져 있으면 `dev.sh`가 즉시 안내하고 종료한다.
- 에뮬레이터는 선택 사항(핫스팟 검증 불가, tech-stack 6장). 필요 시 `--device /dev/kvm`으로 `cimg/android`에 `emulator` 패키지를 추가한 별도 이미지를 만든다. M4 이후 WebView 셸 스모크에만 사용.

---

## 3. 마일스톤

각 마일스톤은 **산출물 · 자동 검증 · 사람 검증 · 완료 기준**을 가진다. 순서는 리스크 순이다. M0가 실패하면 M1~M3(엔진·AI·웹)은 그대로 유효하고 M4 이후만 재설계한다.

### M0 — 핫스팟 스모크 APK (최우선, 리스크 R1 검증)
- **산출물**: `android/` 최소 앱. 버튼 하나로 LOHS 시작 → SSID/비밀번호/IP 표시 → Wi-Fi QR(`T:WPA`) + URL QR 표시 → Ktor가 `/`에 "연결 성공" 페이지와 `/ws` 에코를 서빙. 진단 화면(권한, Wi-Fi, 핫스팟 상태, 오류)과 로그 공유 버튼. 빌드 해시 표시. QR은 이 단계에서만 ZXing core로 그린다(M4에서 웹으로 이전).
- **CI**: `release.yml` — 태그 푸시 시 서명된 APK를 GitHub Releases에 업로드. 서명 키는 Docker에서 1회 생성해 `gh secret set`으로 저장하고 원본은 사용자에게 별도 백업 요청.
- **자동 검증**: Kotlin 단위 테스트(IP 탐색 파서, QR 문자열 생성), Ktor `testApplication`으로 라우트·WS 에코, `assembleRelease` 성공.
- **사람 검증 (사용자, 실기기)**: 절차서 `docs/device-test/M0.md` 따라 (1) 비행기 모드 ON (2) Wi-Fi ON (3) 앱에서 핫스팟 시작 (4) iPhone 카메라로 Wi-Fi QR (5) "인터넷 없이 사용" (6) URL QR → Safari에 "연결 성공" 표시 (7) 페이지의 WS 에코 버튼 동작 (8) 화면 끄고 켜기 후 재접속 (9) 로그 공유로 전달. 추가로 비행기 모드 OFF 상태에서도 같은 절차.
- **완료 기준**: AC-00 통과. 실패 시 로그를 근거로 원인 분류(삼성 OEM 차단 / 권한 / 캡티브 / HTTPS 우선) 후 대응 결정. 삼성 차단이면 "이륙 전 연결 유지" 운용 또는 BLE 재검토를 사용자와 결정.

### M1 — 규칙 엔진
- **산출물**: `packages/engine`. 카탈로그, 상태, `reduce`, `legalActions`, `playerView`, 점수, `settle(steps[])`, `RuleOptions` + 프리셋 3종, PRNG, 리플레이(시드+액션 열 → 상태).
- **자동 검증**: (a) JSON 규칙 벡터 — rules 12장 항목당 최소 1개, 13장 불일치 항목은 토글별 1개, 각 특수 이벤트는 정상·경계·반례 3종(따닥 반례 필수). (b) 불변식 속성 테스트 — 무작위 정책으로 10,000판: 카드 51장 보존, 더미 부족 없음, 정산 제로섬, 배수 곱 = steps 곱, 같은 시드 같은 결과, 좌석 대칭. (c) 커버리지 ≥ 90%(engine).
- **완료 기준**: AC-01, AC-02 통과. `docs/rules-vectors.md`에 벡터 ↔ 규칙 ID 대응표.

### M2 — CPU AI와 시뮬레이션
- **산출물**: `packages/ai`(Evaluator, Greedy, ISMCTS, 난이도 3종, 시드 주입), `tools/sim`(셀프플레이 CLI: 판수, 좌석 교대, 프리셋, 결과 통계 JSON/마크다운), `docs/ai-tuning.md`, `docs/money-model.md`(MN-03 산정표와 기본값).
- **자동 검증**: 정보 은닉 테스트(AI가 더미·상대 손패에 접근하면 실패), 결정론 테스트, 강도 벤치마크(상용급 vs 보통 ≥ 65%, vs 쉬움 ≥ 80%, 각 2,000판), 응답 시간 벤치마크(Node에서 ≤ 0.7s를 기준으로 삼아 모바일 여유 확보).
- **완료 기준**: AC-03, AC-10 통과.

#### M2 결과 (2026-09-28, 조건부 완료)
- 상용급(결정화 몬테카를로 + 루트 순차 반감) vs 보통 61.4%, vs 쉬움 79.1%(목표 65%/80% 미달, 쉬움 목표는 신뢰구간 안). 휴리스틱이 무작위를 78%만 이기는 운 상한을 감안해 사용자 우선순위(P2P 우선)에 따라 **M6에서 재도전**. 결정 시간 p95 246ms(단일 워커) → AI-05 충족. 결정론·정보 은닉 테스트 통과. 상세 `docs/ai-tuning.md`.
- 머니 모델은 표준 프리셋 3,000판만 산정: 점당 100 기준 시작 잔액 **150,000냥**(30판 파산 확률 4.5%). 정통·아케이드는 표준값 준용, 10,000판 재산정은 M6. `docs/money-model.md`, `packages/ai/src/money-defaults.ts`.
- 엔진 개선 후보(M6): `SeatView.revealed`(흔들기 공개 카드), 검증 생략 apply 경로(롤아웃 1.5~2배), 밀기 구현.

### M3 — 웹 UI (솔로 모드 우선)
- **산출물**: `packages/web`. 홈, 게임판, 정산, 설정, 기록, 진단·로그 화면. 솔로 모드로 전 규칙 플레이 가능. 카드 SVG 통합과 저작자 표기, 보너스 카드·뒷면 자체 제작. 애니메이션 큐와 속도 설정. Worker에서 AI 실행.
- **자동 검증**: 컴포넌트 테스트(Vitest + Testing Library), Playwright Chromium·WebKit로 솔로 20판 자동 플레이(AC-04의 솔로 절반), 스크린샷 회귀 7화면(AC-05), 애니메이션 계측(AC-06), 번들 크기 게이트(AC-07), 금지 API ESLint.
- **완료 기준**: 위 통과 + WebKit에서 사용자가 시각적으로 확인 가능한 프리뷰 링크(로컬 빌드 산출물을 GitHub Actions 아티팩트로 제공, 폰 브라우저에서 zip 열기는 번거로우므로 M4 APK로 확인하는 것을 기본으로 함).

### M3 준비 결과가 M4에 넘기는 입력 (2026-09-28)
- `packages/protocol`이 제공해야 할 것: `PlayerView → BoardView` 어댑터(좌석 이름, 잔액, 족보 진행도 {광, 고도리, 단, 피}, 현재 배수), `playable`(legal에서 추출한 손패 id), 고/스톱 프롬프트의 스톱 금액(엔진 `stopPreview` × 점당), 대상 선택 중 "낸 카드" 위치(`pending.card`), `SettlementView`(이름, 점수 분해 행, 정산 전후 잔액).
- 이벤트 이름 정합: 엔진 `Go.count`↔spec `Go(n)`, `PiStolen`에 `card` 없음, `InstantPayout`이 `from` 사용, 엔진 추가 이벤트 `Redealt`/`FirstPicked`/`CardDrawn`/`Hudang`/`GukjinPlaced`는 spec 4.5에 추가. → M4에서 spec 4.5를 엔진 기준으로 갱신하고 protocol이 단일 정의를 export.
- 보너스 카드 디자인은 시안 1종만 제작됨(plan §9 "시안 2종" 미충족). M6 전에 두 번째 시안을 만들어 사용자 선택.

### M4 — 호스트/게스트 모드와 중계
- **산출물**: `packages/protocol`(메시지, 버전, commit-reveal, playerView 계약), `packages/relay-dev`(Node 중계), Android 앱 확장(Ktor 정적 서빙 + 중계, WebView 브리지, 포그라운드 서비스 완성, 로그 수집·공유), 웹 앱 host/guest 모드, 재접속·재동기화, 로비, QR을 웹에서 렌더링(`uqr`).
- **자동 검증**: 프로토콜 계약 테스트(호스트·게스트 양쪽에서 같은 벡터), 중계 규칙 테스트(Node·Kotlin 동일 시나리오), Playwright 2브라우저 E2E(Chromium=host, WebKit=guest) 20판 + 게스트 끊김/복귀 시나리오(AC-04 전체), Ktor `testApplication`.
- **완료 기준**: E2E 통과, `assembleRelease` 성공, 태그 → Releases APK 자동 업로드.

### M5 — 실기기 회차
- **산출물**: `docs/device-test/M5.md` 절차서, 회차별 로그와 수정 기록.
- **사람 검증**: AC-08(Android 전 과정), AC-09(iPhone 전 과정, 화면 끄고 켜기 복귀). 배터리 관찰(1시간 플레이 후 양쪽 잔량 기록).
- **완료 기준**: 사용자가 실제 두 기기로 5판 이상 연속 플레이 성공. 발견된 결함은 이슈로 등록하고 수정 후 재배포.

### M6 — 완성도
- 24개 토글 UI(FR-21), 기록 화면(FR-19), 리플레이 내보내기(FR-33), 효과음(자체 제작/CC0), 접근성(NF-08), 오픈소스 고지 화면, 아케이드 프리셋(대박판, 밀기), 머니 모델 재산정(최종 AI 기준).
- **완료 기준**: spec P1 항목 전부 구현, AC 전부 통과, `v1.0.0` 태그.

### 후속 (범위 밖, 문서화만)
- BLE 전송 계층 + iOS 네이티브 앱(intend 3.2). `Transport` 인터페이스와 `protocol` 패키지를 그대로 재사용.

---

## 3-1. 병렬 개발 라이프사이클 (2026-09-28부터)
사용자 지시: 속도와 품질을 함께. Claude 서브에이전트와 Codex(Paseo) 에이전트를 작업 성격별로 배분하고, 워크트리·브랜치·PR로 격리한다.

| 작업 성격 | 담당 | 근거 |
|---|---|---|
| 판단형(규칙·설계·리뷰), Svelte 5 UI·애니메이션 | Claude(Opus 5.5 서브에이전트, 리뷰는 별도 에이전트) | svelte-check·Svelte MCP가 Claude Code에 연결. 구식 문법 혼입 위험 큰 영역 |
| 계약형(명세 확정 + 자동 테스트 촘촘): 프로토콜 패키지, Android 릴레이·정적 서빙 | Codex GPT-6 Sol xhigh (Paseo 워크트리, full-access) | 독립 지표(Terminal-Bench 4.0: Sol 43.9 vs Astra 58.2 vs Fable 57.9)상 한 단계 아래라 계약형에 한정. 벤더 자기보고 벤치는 근거로 쓰지 않음 |
| Sol이 막히는 어려운 문제 | Codex GPT-6 Astra(max) 예비 | 비용·한도 큼 |
| 저위험 잡무(문서 동기화, 정리) | Codex GPT-6 Luna | 저렴 |

규칙: 각 작업은 `feat/*` 브랜치 워크트리에서 진행하고 PR로 제출한다(에이전트는 병합하지 않음). `dev.sh`가 체크아웃별 compose 프로젝트명을 부여해 `node_modules` 볼륨이 분리된다. PR은 CI(lint/check/test/e2e/android) + Claude 리뷰어 검토 후 오케스트레이터가 병합한다. 미커밋 의존 패키지가 필요하면 `wip/*-snapshot` 브랜치를 플럼빙으로 찍어 겹쳐 쓰되 커밋에서 제외한다(예: `wip/m2-ai-snapshot`).

2026-09-28 결과: PR #1(Android 셸)·#2(M3 솔로)·#3(프로토콜) 모두 main 병합. MVP 릴리스 `v0.1.0-alpha`→`v0.1.2-alpha`(P2P 최소 페이지 `tools/p2p-mini` + 솔로 모드 + Android 수정). 남은 통합(M4 마무리): 게스트/호스트 화면을 `tools/p2p-mini` 대신 정식 UI(M3 Board + protocol HostSession/GuestSession + `src/net` WsTransport + `bridge.ts`↔HostBridge)로 교체, 로비 화면, 2브라우저 E2E, 호스트 원장 저장·복원, 60초 연결 상태 시계. 그 뒤 M5 실기기 회차·M6.

## 3-2. 재개 계획 (2026-09-28, MVP 이후)
사용자 피드백(알파 기내 플레이): 규칙 적용 의심, 잔버그, UI/UX 부족. 지시: 원래 계획대로 재개, 분산, 충분한 검증, 적정 effort, 플랜 이행 빠짐없이.

| 트랙 | 내용 | 담당 / effort | 산출 |
|---|---|---|---|
| R1 | 리뷰 없이 병합된 PR #2(M3 솔로) 사후 리뷰: 규칙 표시·프롬프트 누락·UX(spec §6)·표시 버그 | reviewer(Opus, medium) | `docs/reviews/M3-review.md` + GitHub 이슈 |
| R2 | PR #3(프로토콜) 사후 리뷰: spec §5, 검증·commit-reveal·재동기화·보안 | reviewer(Opus, medium) | `docs/reviews/M4-protocol-review.md` + 이슈 |
| I1 | M4 통합: `tools/p2p-mini` 제거, 정식 UI로 호스트/게스트 모드(HostSession/GuestSession + WsTransport + bridge↔HostBridge), 로비, 재접속·재동기화, 2브라우저 E2E | implementer(Opus, high), 워크트리 PR | PR → 리뷰 → 병합 → `v0.2.0` |
| A1 | Android 후속: PR #1 리뷰 이연 항목(I-11 문서, N-1~N-10, Gradle 10 deprecation, copyWebDist), 진동 브리지 | Codex Sol high, 워크트리 PR | PR → 리뷰 → 병합 |
| E1 | 엔진 M6 선행: `SeatView.revealed`, 검증 생략 apply 경로(+속성 테스트), 밀기 구현(+벡터), M1 리뷰 잔여 | implementer(Opus, high) | PR → 리뷰 → 병합 |
| U1 | M3 표시 수정: #4 국진 배치·피 가치, #5 WebKit 카드 앞면, #7 손패 정렬, #8 건너뛰기 탭, #9 상시 정보, #11 테스트, #20 AC-06 강제 | implementer(Opus, high) `fix/m3-display` | PR → 리뷰 → 병합 |
| P1 | 프로토콜 수정: #12 게스트 BoardView 상위집합, #13 핸드셰이크 복구, #16 verifyRound, #23 크기 상한·decode, #24 전송 정책·relay-dev 정합(#15), #25 호스트 복원, #26 판 사이 대기·파산 프롬프트 | implementer(Opus, high) `fix/protocol-review` | I1 선행 조건 |
| H1 | 릴리스 게이트(#22 CI 성공 조건·prerelease), MVP.md 정정(#21), spec 부분 충족 표시 | hygiene(Sonnet, low) | PR |
| A2 | #17 앱 실행 시 LAN 서버 자동 기동(NF-06) 재설계, PR #14 리뷰 반영 | Codex Sol (high) | PR #14 후속 |
| M5 | `v0.2.0` 실기기 회차(호스트/게스트 정식 UI) | 사용자 | 로그 → 이슈 |
| D1 | 카드 이미지: 시안 A/B(모던 리디자인)는 **기각**(2026-09-29 사용자: "우리가 알던 카드를 이상하게 보이게 하지 않는다"). 방향 = **정석 화투 도안을 충실히 유지한 고해상도 리마스터**(자체 벡터, CC0), 보너스·뺏기패와 뒷면만 구별되게. 1단계 샘플 8~10장 → 확인 → 2단계 52장 | implementer(Opus, high) | PR #37 갱신 → PR |
| D2 | **UI/UX 설계 명세** `docs/design/ui-spec.md`(UX-xx ID): 기기별 뷰포트·안전 영역, 게임 화면 존 그리드와 극단 상태, z-order·겹침 규칙(프롬프트·토스트·배너 vs 손패·버튼), 테이블 배경·토큰 의미·타이포, 모션·이펙트 명세, 상태 설계(대기·재접속·교체·파산), 컴포넌트 상태 표, 접근성, 현재 UI 격차 분석 + 이슈 | implementer(Opus, high) | PR → spec §6 개정 → 구현 이슈 |
| M6 | 토글 UI, 기록, 리플레이 내보내기, 효과음, 접근성, 아케이드, 머니 모델 재산정, AI 강도 재도전, 밀기 후속(#29~#32), Dev Container 도입 검토(`dev.sh`는 런처, 정본은 package.json·Gradle·ci.yml; `./dev.sh ci`로 드리프트 방지) | 분할 배분 | `v1.0.0` |

규칙: 모든 PR은 CI 녹색 + reviewer 검토(판정 '병합 가능')를 받은 뒤 병합한다. 리뷰 결함은 GitHub 이슈로 등록해 트랙 U1이 소화한다.

## 4. 테스트 전략

| 층 | 대상 | 도구 | 실행 |
|---|---|---|---|
| 규칙 벡터 | engine | Vitest + JSON 벡터 | 매 커밋 |
| 속성·불변식 | engine, ai | Vitest(시드 고정, 10,000판) | 매 커밋(축약 1,000판), 야간/태그(전체) |
| 강도 벤치마크 | ai | tools/sim | M2 완료 시, 가중치 변경 시 |
| 속성(fast-check) | engine, ai | 카드 보존·결정론·합법 수만 적용·제로섬 | 매 커밋 |
| 컴포넌트 | web | Vitest 브라우저 모드(Chromium+WebKit) + vitest-browser-svelte | 매 커밋 |
| UI 회귀·접근성 | web `/dev/gallery` | Playwright 스냅샷(도커 안) + axe | 매 PR |
| E2E | web + relay-dev | Playwright Chromium + WebKit, 턴 ≤700ms 계측 | 매 PR |
| 위생·예산 | 전체 | knip, 번들 크기·외부 URL 검사, svelte-check, ESLint 금지 API | 매 커밋 |
| 계약 | protocol | Vitest(양쪽 역할) | 매 커밋 |
| Android | android | JUnit + Ktor testApplication, Android Lint | 매 PR |
| 실기기 | 전체 | 사용자 + 절차서 + 로그 공유 | M0, M5, 릴리스 |

---

## 5. CI/CD (GitHub Actions, `ubuntu-24.04` 고정)

- `ci.yml` (push/PR): Node 24 설정 → `npm ci` → lint + svelte-check + knip → 단위·속성·계약 테스트 → 웹 빌드 + 번들 예산·외부 URL 검사 → Playwright(공식 컨테이너 잡: E2E, 갤러리 스냅샷, axe) → JDK 21 + Gradle 캐시 → `assembleDebug` + Android 테스트·Lint → APK 아티팩트.
- `dependabot.yml`: npm(devDeps 그룹), gradle, github-actions. 쿨다운 3일을 명시 설정.
- 버전 규칙: `versionName`은 태그(`v0.M.n`), `versionCode`는 커밋 수(단조 증가). 태그 없이 배포하지 않는다.
- `release.yml`: 웹 빌드는 서명 잡 안에서 키스토어 복원 **전에**, 읽기 전용 마운트 + 비밀 없는 `docker run` 컨테이너에서 `npm ci --ignore-scripts`로 수행한다(계정 아티팩트 용량 초과로 잡 분리 대신 컨테이너 격리 채택). 빌드 후 추적 파일 변경이 있으면 실패. 서명 잡은 `persist-credentials: false`, 서명자 인증서 지문 고정, alias는 Variables, 태그 커밋이 main에 있어야 함(M0 리뷰 R-1/R-4~R-7).
- `release.yml` (태그 `v*`): 웹 빌드 → `assets/web` 복사 → 키스토어 복원 → `assembleRelease` → `softprops/action-gh-release@v3`로 APK와 체크섬 첨부, 릴리스 노트에 설치·테스트 절차 링크.
- 비공개 저장소 월 2,000분 예산: E2E는 PR에서만, 전체 10,000판 속성 테스트는 태그에서만 실행해 분량을 아낀다.
- 사용자 설치 경로: 폰 브라우저에서 GitHub 로그인 → Releases → APK 다운로드 → 설치(출처 불명 앱 허용). 같은 서명 키로 덮어쓰기 업데이트.

---

## 6. 원격 피드백 루프

1. 마일스톤 APK가 Releases에 올라가면 사용자에게 절차서 링크와 확인 항목을 전달한다.
2. 사용자는 절차대로 수행하고 앱의 "로그 공유"로 텍스트를 보낸다(카톡·메일 등 아무 경로). 로그에는 빌드 해시, 기기 모델, OS 버전, 상태 전이, 오류가 자동 포함된다.
3. 재현이 필요한 게임 버그는 리플레이 JSON(시드+액션)으로 받아 테스트 벡터로 추가한다.
4. 수정 → 태그 → 재배포. 회차 기록은 `docs/device-test/`에 남긴다.

---

## 7. 리스크와 대응 (요약, 상세는 tech-stack.md 리스크 표)

| 리스크 | 심각도 | 대응 |
|---|---|---|
| 삼성 One UI에서 비행기 모드 LOHS 차단 | **블로커 후보** | M0로 가장 먼저 검증. 차단 시 (a) 이륙 전 연결 유지 운용 (b) 시스템 핫스팟 폴백 (c) BLE 경로 재검토를 사용자와 결정 |
| LOHS 자격 증명·IP 무작위 | 중 | 매 세션 QR. 서버 0.0.0.0 바인딩, 인터페이스 순회 |
| iOS 캡티브 시트/HTTPS 우선 | 중 | 안내 문구, M0에서 확인 |
| 비보안 컨텍스트 API 부재 | 중 | 금지 API ESLint, 로그 호스트 업로드, 자동 잠금 안내 |
| Ktor on Android R8 이슈 | 낮 | minify 끔, CIO 엔진, 서버 기동 계측 테스트 |
| ~~TS 7 ↔ Svelte 도구 호환~~ | 해소 | 비호환 확인됨 → TS 6.0.3 기본으로 확정(1.8) |
| 에이전트의 구식 문법 혼입(Svelte 4, Tailwind v3, React 패턴) | 중 | AGENTS.md 금지 목록, Svelte MCP autofixer, svelte-check, ESLint가 기계적으로 차단 |
| Playwright WebKit ≠ iOS Safari | 낮 | 1차 필터로만, 최종은 실기기 |
| CI 분량(비공개 2,000분/월) | 낮 | E2E는 PR만, 대규모 시뮬레이션은 태그만 |

---

## 8. 작업 순서 (착수 후 첫 2단계 상세)

### 8.1 저장소 골격 + Docker (M0 전 준비)
1. `package.json`(workspaces), `.npmrc`(`min-release-age=3`), `.editorconfig`, `.nvmrc`(24), ESLint 10 flat config + Prettier, `tsconfig.base.json`(strict, TS 6.0.3), knip 설정, `AGENTS.md`(버전 표·금지 목록·관례) + `CLAUDE.md`(`@AGENTS.md`), `.github/dependabot.yml`. 프로젝트 `.claude/settings.json`의 포맷·린트 훅과 Svelte MCP 등록은 사용자 승인 후 추가.
2. `docker/compose.yml`, `docker/Dockerfile.android`(cimg 기반, 필요 시 최소 추가), `dev.sh`.
3. `android/` 표준 골격: AGP 9.4.1, Gradle 9.8.0 wrapper, Kotlin 2.4.20(내장 Kotlin 방식), version catalog, compileSdk/targetSdk 36, minSdk 33, `namespace com.kywoo26.p2pgostop`.
4. `ci.yml` 최소 버전(빌드만). 첫 Docker 빌드로 이미지 캐시 확보.

### 8.2 M0 구현
1. 매니페스트 권한(tech-stack 1.1 목록), `HotspotService`(FGS `connectedDevice`), `LocalOnlyHotspotCallback` 처리, IP 탐색.
2. Ktor 3.6.0 CIO 서버: `/` 정적 페이지, `/ws` 에코, `/health`.
3. QR 렌더링(ZXing core 3.5.4, `T:WPA` 형식), 상태·진단 화면, 로그 버퍼와 공유 인텐트, 빌드 해시(`BuildConfig`).
4. 단위 테스트, `release.yml`, 서명 키 생성·Secrets 등록, `v0.0.1` 태그 → APK.
5. `docs/device-test/M0.md` 절차서 작성 후 사용자에게 전달.

---

## 9. 결정 사항과 미결

### 확정
- 엔진 단일 구현(TS), Android는 중계 전용(1.1).
- 스택 v0.2(1.8): Svelte 5 유지, TS 6.0.3 기본, WAAPI+FLIP 자체 헬퍼, scoped CSS+토큰, fast-check·Vitest 브라우저 모드·axe·스냅샷·knip 추가, 직접 작성 Kotlin 셸 유지. React/Tailwind/Storybook/Capacitor/Biome/pnpm/Turborepo/Canvas 엔진은 도입하지 않음(근거: agent-era-stack.md 8).
- 서버 포트 17777, 호스트 WebView origin `http://127.0.0.1:17777`.
- 패키지명 `com.kywoo26.p2pgostop`, 앱 이름 "맞고 P2P"(가칭, M6에서 확정).
- 버전 태그 `v0.<마일스톤>.<증분>`, `v1.0.0`은 M6.

### 미결 (착수 후 결정, 사용자 확인 불필요)
- ISMCTS 샘플 수와 시간 제한의 기본값 → M2 벤치마크로.
- 보너스 카드·뒷면 디자인 → M3에서 시안 2종 만들어 사용자 선택.
- 효과음 제작 방식(합성 vs CC0 샘플) → M6.

---

## 10. 변경 이력
- v0.6 (2026-09-28): 3-2 재개 계획(사후 리뷰·통합·후속 트랙, 리뷰 필수 규칙).
- v0.5 (2026-09-28): 3-1 병렬 라이프사이클(모델 배분 원칙, 워크트리·PR 격리) 추가.
- v0.4 (2026-09-28): M0 리뷰 반영 — 코루틴 명시 의존, Dependabot 쿨다운, 버전 규칙, release.yml 분리 원칙. M0 조건부 완료(docs/reviews/M0-review.md).
- v0.3 (2026-09-28): 하이브리드 Rust 툴체인 결정(순수 TS 패키지는 oxlint/oxfmt/TS 7, web은 ESLint/Prettier/TS 6). Svelte MCP를 로컬 stdio로 재채택.
- v0.2 (2026-09-28): agent-era-stack.md 반영. 원칙 9 추가, 1.6 애니메이션·스타일·검증 구체화, 1.8 스택 확정 표, 테스트·CI 게이트 추가, TS 6.0.3 확정, 리스크 표 갱신.
- v0.1 (2026-09-28): 초안.
