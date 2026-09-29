# p2p-gostop — 구현 계획 (plan.md)

작성일: 2026-09-28 · 상태: v0.8 현황 정리 (2026-09-29)
상위 문서: `intend.md`(왜) → `spec.md`(무엇을) → **이 문서**(어떻게)
근거: `docs/research/tech-stack.md`(플랫폼 제약), `docs/research/code-refs.md`(설계 차용), `docs/research/rules-commercial.md`(규칙), `docs/research/agent-era-stack.md`(에이전트 시대 스택 판단)

---

## 0. 구현 원칙 (사용자 지시 반영)

1. **최신 공식 문서 우선.** 라이브러리·API를 쓰기 전에 Context7 또는 공식 문서를 조회하고, 버전은 `AGENTS.md` §2 버전 표의 정확한 값을 쓴다. 학습 데이터 기억으로 코드를 쓰지 않는다.
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
│   └ WebView (http://127.0.0.1:17777/, 루프백 = 호스트 앱)  │   └──────────────────────┘
│        웹 앱 (호스트 모드)                                   │
│         ├ 권위 엔진(reduce) + AI(Worker) + 원장              │
│         ├ 게스트 뷰(playerView) 생성·전송                     │
│         └ 자기 화면 렌더링                                    │
└──────────────────────────────────────────────────────────┘
```
- **왜**: 규칙·AI·정산을 Kotlin으로 다시 쓰지 않는다. Android 앱은 네이티브 셸·중계에 집중하고, 엔진 테스트는 Node에서 한 번만 한다. 호스트 WebView origin은 `127.0.0.1:17777`로 고정되어 localStorage가 세션 간 유지된다(원장 저장, MN-05).
- **대가**: 호스트 앱이 포그라운드를 벗어나면 게임이 멈춘다. 대면 게임이므로 허용. 포그라운드 서비스와 `FLAG_KEEP_SCREEN_ON`으로 완화.
- **중계 규칙**: 서버는 역할(`role=host`·`role=guest`)마다 소켓 1개를 둔다. 같은 역할이 다시 붙으면 **최신 연결 우선**으로 이전 소켓을 4001(`replaced`)로 닫고, 교체된 소켓의 늦은 프레임은 버린다. 호스트 소켓의 메시지는 게스트로, 게스트의 메시지는 호스트로 그대로 전달하고 내용은 해석하지 않는다. 예외: 중계 알림 `{"t":"relay","peer":"present|absent|joined|left"}`을 보내고, 클라이언트가 보낸 relay 모양 프레임은 전달하지 않으며(위조 방지), 텍스트만(바이너리 1003)·64KB 초과 1009·호스트 역할은 루프백만(1008). 누가 게스트 좌석인지는 세션 토큰으로 판단한다. 4001을 받은 클라이언트는 자동 재접속하지 않는다. Android `SmokeServer`와 `packages/relay-dev`가 같은 규칙이고 시나리오 표는 `packages/relay-dev/test/relay-scenarios.json`(docs/protocol.md 1장).
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
├─ docker/                      # 단일 개발 이미지 Dockerfile·진입점·태그 검사
├─ compose.yaml                  # 개발 이미지의 dev 서비스
├─ .devcontainer/               # 같은 dev 서비스의 VS Code 설정
├─ .github/workflows/           # ci.yml, release.yml
├─ docs/                        # research/, ai-tuning.md, money-model.md, device-test-log/
├─ intend.md · spec.md · plan.md
```

### 1.3 모듈 경계와 의존 방향
`engine` ← `ai` ← `web`, `engine` ← `protocol` ← `web`, `relay-dev`는 `protocol`만. `android`는 어느 TS 패키지에도 의존하지 않고 빌드 산출물(`packages/web/dist`)만 `assets/web`으로 복사한다.

### 1.4 엔진 설계 (code-refs 6.2 채택)
- 카드: 불변 ID(0~50 정수) + 정적 카탈로그 `{month, kind, piValue, ribbon, isGodori, isBiGwang, isGukjin, bonus?}`. 상태에는 ID 배열만.
- 상태: `{phase, seats[2]{hand, captured{gwang,yeol,tti,pi}, goCount, shakes, score}, floor[], deck[], ppeokPiles[], pending?, rules, rng, history}`. 좌석 인덱스 0/1.
- `reduce(state, action) → {ok:true, state, events} | {ok:false, reason, message}`, `legalActions(state, seat)`, `playerView(state, seat)`, `settle(state, rules?) → Settlement`(점수·배수, 금액은 원장 적용 시 계산). 모두 순수 함수. `pending`은 spec 4.3의 PROMPT_* 를 표현.
- 규칙 옵션 `RuleOptions`: spec 4장 및 rules 12.7의 24개 토글. 프리셋 3종은 옵션 객체 상수.
- 난수: 상태에 포함된 시드 기반 PRNG(xoshiro128** 직접 구현, 수십 줄). commit-reveal은 `protocol`에서 두 난수를 합쳐 시드로 만든다.

### 1.5 AI 설계
- `packages/ai`는 공개 `PlayerView`만 받고 시드 주입으로 결정론을 유지한다. 쉬움·보통·상용급 3단계이며 상용급은 결정화 몬테카를로와 루트 순차 반감을 사용한다(UCT 모드는 옵션으로 유지).
- Web Worker에서 실행하며 가중치·벤치마크 근거는 [AI 튜닝](docs/ai-tuning.md)에 둔다. AI-04·AC-03은 미달이며 PR #56과 #66이 후속이다. Node 응답 시간은 AI-05 모바일 실측을 대체하지 않는다.

### 1.6 웹 앱 설계
- 모드: `host`(권위 엔진 보유, 게스트에게 뷰 전송), `guest`(뷰 수신, 액션 요청), `solo`(엔진+AI 로컬, 네트워크 없음).
- 상태 관리: Svelte 5 runes. 외부 상태 라이브러리 없음. 엔진 이벤트 열을 애니메이션 큐가 소비하고, 큐가 비면 최신 뷰로 보정.
- 애니메이션: **Web Animations API + 자체 FLIP 헬퍼**(`src/anim/`, 수십 줄). 컨테이너를 넘나드는 카드 이동(손패→바닥→획득패)은 이 헬퍼가, 모달·배너·토스트는 Svelte transition이 담당한다. `transform`·`opacity`만 애니메이션하고 `will-change`는 움직이는 카드에만 건다(iOS 메모리). `anim.finished`로 턴 시퀀스를 async 체인으로 구성. 기본 보통은 UX-15의 단계별 이동·정지 토큰을 쓰고, 빠름은 AC-06 표, 매우 빠름은 빠름 ×0.6을 쓴다. `--dur-scale: 0`은 스킵·동작 줄이기·E2E 즉시 모드에 적용한다. 라이브러리(GSAP, Motion, Pixi 등)는 도입하지 않음. FLIP 헬퍼가 복잡해지면 `motion` 미니 `animate()`만 TRIAL.
- 스타일: Svelte scoped CSS + `tokens.css`. Tailwind·컴포넌트 라이브러리 없음. 네이티브 `<dialog>`로 부족하면 Bits UI 단일 컴포넌트만 검토.
- 카드 자산: SVG를 svgo로 최적화해 `<img>`로 렌더(인라인 SVG·filter 금지, Safari 래스터 성능).
- 비보안 컨텍스트 제약(spec NF-02)은 ESLint 코어 규칙 `no-restricted-properties`/`no-restricted-syntax`로 강제(커스텀 규칙 없음, .svelte에도 적용).
- 프로토콜 입력 검증: `zod/mini`(Zod 4) TRIAL. 신뢰할 수 없는 WS 입력을 스키마로 검증하고 타입을 스키마에서 도출.

### 1.8 스택·의존성 도입 근거

**PA-01~04 전문 자산 평가(2026-09-29, 예산 개정 승인 전):** NF-03의 전체1.5MiB·게스트 첫 로딩≤2초와 기존 카테고리 예산은 현행 유지한다. `design/pro-assets`의 명시적 `PRO_ASSET_REVIEW=1` 평가 빌드만 초과 자산을 포함한다. 기본/릴리스 빌드에는 평가 팩을 제외하고 기존 용량 gate를 적용한다. `docs/research/pro-assets.md`의 NF-03 개정안은 리뷰·사용자 승인 전 규범이 아니다. 원본은 `assets-src/`, 평가 변환물은 `public/pro/`에 둔다. Pillow 10.2.0-1ubuntu1.3(HPND), FFmpeg 7:6.1.1-3ubuntu5(Ubuntu GPL dev 도구), libavif-bin 1.0.4-1ubuntu3(BSD-2-Clause)을 개발 이미지4에 고정 추가해 WebP/AVIF·해상도 단계·atlas·ogg/m4a·고지를 생성한다. 앱 런타임 npm 의존성0, Pixi/GSAP 등 금지 유지. 아트 디렉션은 `docs/design/art-direction.md`로 통일하고 RPG UI/Animal 팩은 제외한다. Met CC0 원화·기존 Hwatu의 CC BY-SA 4.0 파생 초상을 구분 고지하며 Commons48 원본은 유지한다. Ogg는 bitexact/serial=0과 두 번 인코딩 해시 검사를 고정한다. FPS·메모리·배터리 NF 후보는 연구 문서에만 두고 리뷰 전 spec를 바꾸지 않는다.
정확한 버전은 [AGENTS.md §2](AGENTS.md)의 단일 표를 따른다. 비교 근거는 [스택 조사](docs/research/agent-era-stack.md)다.

**A 시각 방향 확정(2026-09-29, VD-01~05):** 사용자 채택에 따라 먹빛/한지색과 Pretendard Variable v1.3.9 로컬 OFL-1.1 WOFF2 서브셋 1종(≤160KiB)을 구현한다. 규범은 `docs/design/ui-spec.md` UX-11/13·§4.1, 비교/기각 기록은 `docs/design/art-direction.md#결정-이력`다. 신규 npm 의존성0, Tailwind·shadcn·Storybook·GSAP 금지 유지. 폰트160+효과/아이콘12+소리48+UI24=추가≤244KiB, 전체≤1.5MiB·외부 요청0. 공통 파이프라인 `docs/design/fonts/`는 Docker `python:3.12-slim`의 FontTools 4.61.1(MIT)·Brotli 1.2.0(MIT)로 최신 UI 코퍼스·해시·tnum/가변 축·용량·고지 원문을 검증한다. 호스트 설치·npm lock 변경 없음. 문서 규범→토큰/폰트→화면/HUD·#46/#47→사건/음향→통합 순서로 별도 PR, 각각 최신 main에서 분기한다.

| 선택 | 이유·범위 |
|---|---|
| Vite + Svelte, scoped CSS·토큰, WAAPI FLIP | 작은 UI·번들 예산; React/Tailwind/shadcn/Storybook/Pixi/Phaser/GSAP 도입 안 함 |
| TS·린트 하이브리드 | 순수 TS는 TS 7·oxlint·oxfmt, web은 TS 6·ESLint·Prettier·svelte-check; .svelte와 TS 7 도구 비호환 |
| npm workspaces·공급망 쿨다운 | 비배포 모노레포에 pnpm·Turborepo·Biome 추가 안 함 |
| Vitest·fast-check·브라우저 모드·Playwright·axe·knip·svgo | 규칙·실제 레이아웃·회귀·번들·죽은 코드 검증 |
| 개발 이미지·CI 레이어 캐시 (B1) | Compose 이미지에 Docker 공식 setup-docker·setup-buildx·build-push 액션의 GHA 캐시 적용; containerd 저장소·docker driver로 중복 export/load 제거, npm 다운로드 캐시 사용 |
| Gradle CI 캐시 (B1) | setup-gradle로 build/configuration cache 보존; main만 쓰기, PR·태그 읽기 전용, 구성 캐시 암호화 Secret 사용. 컨테이너의 Gradle 홈·작업 경로를 러너와 일치시킴(조사: docs/research/build-performance.md) |
| zod/mini·uqr | 프로토콜 입력 검증(TRIAL), 로컬 QR 생성. web 저장 경계도 동일 zod 4.6.5의 mini를 직접 의존해 사용한다(R5, MN-05·NF-05): v0→v1 보완과 #88의 중첩 검증을 스키마로 분리하며 저장 키·형식·수용 범위는 보존한다. |
| `androidx.activity:activity` 1.13.0 | `GameActivity`의 Back을 `OnBackPressedCallback`으로 받고 HostBridge에 전달(v0.2.1-B, #10); Compose 미도입 |
| Kotlin + WebView + Ktor | 네이티브 셸 유지; Capacitor·Tauri·RN·Flutter·Compose 도입 안 함 |
| Context7·로컬 Svelte MCP·저장소 .claude 설정 | 공식 문서·구문 검증; 편집 훅 없음, 포맷은 lint:fix·CI lint(하네스 감사 참조) |
| Android 테스트 의존성: `ktor-server-test-host` 3.6.0, `kotlin-test-junit` 2.4.20, `junit` 4.13.2 | Ktor `testApplication`과 JVM 단위 테스트에 필요. M0에서 추가 |
| Android 중계 벡터 JSON: `org.json:json` 20260814(테스트 전용) | Android JVM 단위 테스트의 `android.jar` JSON 스텁은 메서드를 실행하지 않으므로, 저장소 공유 시나리오 파일을 실행 시 읽는 데 실제 구현이 필요하다 (#36). APK 런타임에는 포함하지 않는다. #94 검토: 2026-08-14 게시·3일 경과, XML 공백 처리 수정이며 검증 근거는 AGENTS §2 |
| Android 런타임 의존성: `kotlinx-coroutines-android`(Ktor 요구 버전으로 명시) | 전이 의존에 기대지 않는다 (M0 리뷰) |

### 1.7 Android 앱 설계
- M4 중간 구조는 `MainActivity`(네이티브 핫스팟·진단)와 `GameActivity`(WebView, androidx.webkit 1.17.1) 두 화면이다. WebView는 서버만 켜진 상태에서도 `/`로 열어 솔로 화면에 진입한다.
- `HotspotService`(포그라운드, `connectedDevice`): LOHS 시작·유지, IP 탐색(`NetworkInterface` 순회), Ktor 서버 기동. 서버는 `0.0.0.0:17777`에서 계속 듣지만, LAN 모드가 꺼져 있으면 비루프백 HTTP 요청은 403, WebSocket 업그레이드는 1008 `lan-disabled`로 거절한다. 앱 자동 진입은 서버 전용·LAN 꺼짐 상태다. 사용자가 핫스팟 또는 `주소만 표시`를 명시적으로 선택하면 LAN 모드를 켠다. LOHS 실패·시스템 종료 때는 다시 끈다. `주소만 표시`는 같은 LAN의 모든 기기에 열리므로 경고를 표시한다(NF-06).
- **HostBridge 단일 계약**: Android WebView의 `addWebMessageListener` 객체 이름은 `HostBridge`, 허용 origin은 `http://127.0.0.1:17777`의 메인 프레임뿐이다. JSON 요청은 `{type,id?,...}`이고 응답은 요청에 `id`가 있으면 같은 값을 돌려준다. 핫스팟 상태는 첫 브리지 접촉과 변경 때 `id` 없는 이벤트로도 전송한다. `null` 가능 필드는 JSON `null`로 보내며, 입력의 JSON `null`은 문자열 `"null"`로 변환하지 않는다. 입력 64KB 초과는 `error{message:"tooLarge"}`로 응답한다.
  - `getHotspot`·`startHotspot` → `hotspot{state,ssid,password,ip,port,error,lanEnabled,warning}`. 상태는 `off|starting|on|addressOnly|failed`. `startHotspot`은 서버를 재시작하지 않고 서버 전용/주소 모드에서 LOHS로 올린다. 권한이 없으면 `error{message:"permissionRequired"}`와 Android 권한 안내를 보낸다. 허용·거절·설정 복귀 결과는 원래 `id`를 붙인 `hotspot` 또는 `error`로 다시 전송한다.
  - `stopHotspot` → `stopHotspot{stopped:true}`. LOHS만 해제하고 `addressOnly`로 내려가며 서버와 호스트 WebSocket은 유지한다. `enableLan{bool}` → `lan{enabled}`; 서버 재시작 없이 LAN 게이트를 바꾼다.
  - `share{text,filename?,title?}` → `share{shared}`(Android 공유 시트); `log{role?,message?,level?,entries?}` → `log{accepted}`. 게스트 로그는 256KB 별도 버퍼(줄당 2KB), 호스트 웹 로그도 네이티브 진단과 별도 버퍼에 보관한다. `entries` 항목의 `role`은 최상위 `role`보다 우선한다.
  - `keepScreenOn{bool}` → `keepScreenOn{enabled}`; `gameActive{bool}` → `gameActive{active}`. `gameActive`가 켜지고 페이지·브리지가 준비됐으면 Android Back은 `back`(id 없음) 이벤트로 웹에 전달한다. 웹은 열린 메뉴를 닫거나 게임 메뉴를 열고, 설정이면 원래 화면으로 돌아간다. 홈·브리지 미준비에서는 기존 네이티브 종료 확인을 유지한다(v0.2.1-B, #10). `vibrate{pattern:number[]}` → `vibrate{accepted}`(진동/쉼 교대, 최대 16구간·구간당 500ms·총 2초).
  - `openDiagnostics` → `openDiagnostics`(진단 화면에서 돌아오면 같은 게임 WebView); `getDeviceInfo` → `deviceInfo{device,version,gitSha,buildTime}`.
- PR #42로 병합된 웹 구현은 `addressOnly`·`lanEnabled`·NF-06 경고, `gameActive`, `vibrate`, `enableLan`, `id` 에코와 `permissionRequired` 결과를 이 계약에 맞춘다.
- 서버 포트 17777 고정. Network Security Config로 `127.0.0.1`만 cleartext.
- 폴백: LOHS 실패 시 "시스템 핫스팟 켜기" 안내 + 이미 있는 Wi-Fi 인터페이스 IP 표시(FR-02).

---

## 2. 개발 환경 (Docker)

- `docker/Dockerfile`은 Playwright 공식 이미지(Node 24.20.0, Chromium·WebKit)에 Temurin 21과 Android SDK 36을 더한 단일 개발 이미지다. 루트 `compose.yaml`의 `dev` 서비스가 소스를 바인드 마운트한다. CI도 이 이미지를 빌드해 같은 명령을 실행한다(NF-06).
- 저장소 루트에서 `docker compose run --rm dev <명령>`으로 실행한다. 새 체크아웃은 먼저 `npm ci`; lint·check·test·test:browser·웹 빌드·E2E·Android 명령은 [AGENTS.md §5](AGENTS.md)를 따른다. Dev Container는 같은 서비스를 쓰며, Claude Code 공식 feature와 dev(uid 1000) 소유 `/home/dev/.claude` 볼륨을 사용한다.
- `node_modules`는 체크아웃마다 소스와 함께 바인드 마운트된다. 이전 환경의 root 소유 디렉터리가 남으면 진입점이 안내하고 종료한다. 비어 있으면 호스트에서 `rmdir node_modules`, 내용이 있으면 `docker compose run --rm --user root dev chown -R 1000:1000 /work/node_modules`로 복구한다. 옛 명명 볼륨은 이름을 확인한 뒤 개별 제거한다(README 전환 절차).
- `docker/Dockerfile`을 바꾸면 `compose.yaml`의 `image: p2p-gostop-dev:<n>` 태그를 올린다. `docker/check-dev-image-tag.sh`가 커밋·스테이지·작업 트리의 Dockerfile 변경을 검사한다. 없는 태그는 첫 `run`에서 빌드한다.
- 에뮬레이터는 선택 사항(핫스팟 검증 불가, tech-stack 6장). 필요하면 Android SDK 에뮬레이터를 별도 이미지에 추가해 WebView 셸 스모크에만 쓴다.

---

## 3. 마일스톤 상태

코드 기준 main `9651364`(v0.2.0 + PR #54·#55·#59). 과거 검토의 결함·측정값은 Git 이력과 리뷰 인덱스에 보존하며, 병합 자체를 수용 기준 통과로 간주하지 않는다.

| 단계 | 현재 상태·남은 기준 | 근거 |
|---|---|---|
| M0 핫스팟 스모크 | AC-00 통과; B/C·장시간 복귀 등 미확인 항목은 통합 절차로 이월 | [리뷰 인덱스](docs/reviews/README.md), [실기기 원문](docs/device-test/results.md) |
| M1 엔진 | 구현·규칙 벡터·불변식 검사, 밀기·revealed·applyUnchecked 후속 병합(PR #28) | [M1 리뷰](docs/reviews/README.md), [규칙 벡터](docs/rules-vectors.md) |
| M2 AI·머니 | 조건부 진행: AC-03 미달(61.4%/79.1%), MN-03·AC-10 부분(표준 3,000판) | [AI 튜닝](docs/ai-tuning.md), [머니 산정](docs/money-model.md), #66·#67 |
| M3 솔로 UI | 구현·표시 수정 병합(#34); UX 규범 격차는 후속 | [M3 리뷰](docs/reviews/README.md), [UI 규범](docs/design/ui-spec.md) |
| M4 정식 P2P | 통합·프로토콜 후속 병합(#42·#54·#59); 웹 밀기·로비 준비·판 무효 UI 및 E2E 단언 보강 남음 | [프로토콜 리뷰](docs/reviews/README.md), #30·#44·#58·#60 |
| M5 실기기 | 현재 UI AC-08·AC-09 미검증, iPhone 확보 후 재개(#75) | [통합 절차](docs/device-test/procedure.md), [결과 로그](docs/device-test/results.md) |
| M6 완성도 | Galaxy 호스트·솔로 우선, P1·AC 전부 충족해야 v1.0.0 | [현재 트랙](#현재-트랙) |

### 현재 트랙

<a id="releases"></a><a id="ownership"></a><a id="verification"></a><a id="gaps"></a> 옛 Galaxy 계획의 경로·절 앵커는 [이관표](docs/plan-galaxy-solo.md)에서 이 절과 해당 정본으로 연결한다.

Safari는 WebKit 자동 검사로 계속 확인하고 실기기 판정은 iPhone 확보 후 #75에서 재개한다. 아래는 완료 항목을 제외한 v0.2.2/v0.2.3 PR 단위와 파일 소유권이다. 각 선행 작업의 병합본을 인계받아 충돌 파일을 직렬로 수정한다.

| 트랙·PR 단위 | 남은 범위 / 이슈 | 파일 소유권·인계 |
|---|---|---|
| v0.2.2 .2-A | 솔로·호스트·게스트 밀기/받기·배수·AI 연결 #30 | Sol: `game/session.ts`, `solo.svelte.ts`, `controller.ts`, `p2p/{host,guest}.svelte.ts`, `Settlement.svelte`, AI worker, `e2e/push.spec.ts`; 메뉴/guest 계약 인계 뒤 |
| v0.2.2 .2-B | FR-21 설정 24항목·규칙/금액 UI #62 | Sol: `settings/**`, `Settings.svelte`, `RuleSettings.svelte`, `current.svelte.ts`, `p2p/common.ts` preset 판별, `HostRoom.svelte`; .2-A 뒤 |
| v0.2.2 .2-C | 원장 기록·재충전·실지급·판 무효 #44/#63 | Sol: `records.ts`, `Records.svelte`, 기록 타입·E2E; .2-A의 session/solo/host/Settlement와 `App.svelte`·`routes/Game.svelte` 라우팅 소유권 인계 |
| v0.2.2 .2-D | 정산·은닉·설정·P2P 시간 통합 E2E #58 | Sol: `e2e/p2p.spec.ts`, `solo.spec.ts`, `settings.spec.ts`; .2-A~C 뒤 |
| v0.2.3 .3-A | 효과음·진동·효과 강도·중복 억제 #117/#128 | Sol: `sound.ts`, `playback.svelte.ts`, `banner.ts`, `p2p/common.ts` 진동, 피드백 설정/테스트; anim 계약 인계 |
| v0.2.3 .3-B | AI 기본값·생각 시간·오류 대체 UX #65/#66 | Sol: `ai-client.ts`, `ai-core.ts`, `solo.svelte.ts`, worker, SoloSetup/E2E; .2-A/C 뒤 |
| v0.2.3 .3-C | Galaxy 안내·화면 유지·저장 실패·복구 #64/#68/#69 | Sol: Android Activity/Service/Diagnostics와 웹 session/solo/current/local/Diagnostics; .2-B·.3-B 저장 소유권 인계 |
| v0.2.3 .3-D | 카드·Galaxy 예산·강도 보고 #66/#70 | Sol 통합: 갤러리/E2E 기준샷, device-test 절차, `ai-tuning.md`; 카드·AI 담당 산출물 인계 |

`settings/**`는 .2-B→.3-A→.3-B, `solo.svelte.ts`는 .2-A→.2-C→.3-B→.3-C, `session.ts`는 .2-A→.2-C→.3-C 순으로 소유한다. 공용 갤러리 기준샷은 각 기능 병합 뒤 .3-D가 갱신한다. 규칙 항목의 정본은 [rules-commercial §12.7](docs/research/rules-commercial.md#127-사용자-설정으로-노출할-토글)과 [spec FR-21](spec.md)이다.

#### 공유 파일 인계

| 공유 경계 | 남은 소유권·순서 |
|---|---|
| `p2p/common.ts` | .2-B가 preset 판별을 완료해 .3-A 진동 담당에게 인계한다. #44 로비 준비는 별도 protocol 계약 뒤 반영한다. |
| `App.svelte`·`routes/Game.svelte`·`SoloSetup.svelte` | 메뉴/Back 작업→.2-A Game 밀기→.2-C App/Game 라우팅→.3-B SoloSetup AI UX. 같은 파일을 동시에 수정하지 않는다. |
| `bridge/bridge.ts`·Android Back/셸 | 메뉴/Back 계약을 .3-C가 이어받아 저장 오류·복귀를 처리한다. 릴레이 서버/벡터는 별도 #61 담당 이력에 따른다. |
| `styles/tokens.css`·`anim/*`·카드 | HUD 층위 토큰과 anim `--dur-*` 예약을 .1-A가 소비한 뒤 .3-D가 의미 색을 맡는다. 카드 토큰·비율/props는 카드 담당 산출물과 먼저 맞추고 전체 파일 포맷을 겹치지 않는다. |
| `p2p/{guest,link}`·`GuestApp`·`protocol/src/guest.ts` | 재접속/시계 계약 뒤 .2-A guest 밀기→.2-C 정산. #44 ready는 별도 protocol 계약을 선행한다. |
| `settings/**`·`Settings.svelte`·저장소 | anim 속도 기본값→.2-B 규칙→.3-A 피드백→.3-B AI 기본값. `current.svelte.ts`는 .2-B→.3-C, `storage/local.ts`는 .3-C 전용이다. |
| `packages/ai/**`·`tools/sim/**`·관련 문서 | 확정된 #56 기준→#66 강도→#67 머니. `ai-tuning.md`·`money-model.md`와 결과 표를 함께 인계하고 공개 API만 사용한다. |
| 공용 E2E·갤러리 | 기능 담당이 전용 테스트를 소유하고 .2-D/.3-D가 선행 병합 뒤 공용 기준샷·통합 검증을 맡는다. |
- 진행 중: AI #56, 병합된 응답 유실 복구 #59의 웹 연결 #60, 개발 진입점 #38, 빌드·릴리스 성능 #73. 각 PR 소유 파일·계약을 침범하지 않는다. 새 진입점은 체크아웃별 Compose 프로젝트로 컨테이너를 분리한다.
- 카드·UI 결정은 §9 D1·D2, 규범은 spec §6과 UI 규범이다. 끝난 리뷰·통합·수정 트랙은 위 상태 표와 리뷰 이력으로 대체한다.
- 작업은 워크트리·브랜치·PR로 격리한다. 위임 시 Codex(Paseo)를 기본으로 판단·리뷰는 Astra, 구현은 Sol, 저위험 정리는 Luna를 배분하며 Claude 서브에이전트는 사용자 명시 때만 쓴다. 병합은 CI 녹색 + reviewer 판정 뒤 사람 또는 사람이 지시한 오케스트레이터만 수행한다.

---

## 3-3. 우선순위 변경 (2026-09-29)
- iPhone 실기기 사용 불가 → M5의 Safari 실기기 회차 보류. Safari 호환은 Playwright WebKit(E2E·브라우저 모드)로만 검증하고, iPhone 확보 시 재개.
- 우선순위: **Galaxy 호스트 + 혼자 연습(AI) 완성도**(UX-spec 격차 #46~#53, #44, 밀기 UI #30/#31, 토글 UI FR-21, 기록·효과음·진동·접근성, 카드 렌더링 개선) → `v0.2.x`로 자주 릴리스.
- **빌드·릴리스 성능**(B1): Astra가 현재 CI/릴리스 소요를 계측하고 정석·모던 수단만으로 단축안을 조사·도입(Gradle 빌드 캐시·구성 캐시, Docker 레이어 캐시, Playwright 샤딩, 릴리스 잡 구조, 자체 러너 검토). 우회·억지 방법 금지.

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

- `ci.yml` (B1): 같은 개발 이미지·Compose 명령으로 두 잡을 병렬 실행한다. ① npm ci → lint/check/단위 테스트 → 웹 빌드·예산·외부 URL 검사 → 웹 번들 포함 `assembleDebug testDebugUnitTest lint` 한 호출, ② 컴포넌트 테스트 → 전체 Playwright(기존 PR·수동 범위, timing 프로젝트 직렬 의존성 유지). BuildKit GHA 레이어 캐시·npm 다운로드 캐시를 쓰며 Gradle 캐시는 setup-gradle로 main만 갱신한다. 잡 분리의 분 예산 증가와 벽시계 이득은 `docs/research/build-performance.md`에서 비교한다.
- `dependabot.yml`: npm(devDeps 그룹), gradle, github-actions. 쿨다운 3일을 명시 설정.
- 버전 규칙: `versionName`은 태그(`v0.M.n`), `versionCode`는 커밋 수(단조 증가). 태그 없이 배포하지 않는다.
- `release.yml` (B1): 정확한 SHA의 성공한 main push CI 웹 번들을 재사용한다. 없거나 만료·용량 초과이면 키스토어 복원 **전에** 읽기 전용 마운트 + 비밀 없는 개발 이미지 컨테이너에서 `npm ci --ignore-scripts`로 빌드한다. Gradle·서명 검증도 개발 이미지에서 실행하고 Gradle 캐시는 읽기 전용이다. 빌드 후 추적 파일 변경이 있으면 실패. `persist-credentials: false`, 서명자 인증서 지문 고정, alias는 Variables, main 이력·CI 성공 게이트를 유지한다(M0 리뷰 R-1/R-4~R-7).
- `release.yml` (태그 `v*`): 웹 빌드 → `assets/web` 복사 → 키스토어 복원 → `assembleRelease` → `softprops/action-gh-release@v3`로 APK와 체크섬 첨부, 릴리스 노트에 설치·테스트 절차 링크.
- 비공개 저장소 월 2,000분 예산: E2E는 PR에서만, 전체 10,000판 속성 테스트는 태그에서만 실행해 분량을 아낀다.
- 사용자 설치 경로: 폰 브라우저에서 GitHub 로그인 → Releases → APK 다운로드 → 설치(출처 불명 앱 허용). 같은 서명 키로 덮어쓰기 업데이트.

---

## 6. 원격 피드백 루프

1. 마일스톤 APK가 Releases에 올라가면 사용자에게 절차서 링크와 확인 항목을 전달한다.
2. 사용자는 절차대로 수행하고 앱의 "로그 공유"로 텍스트를 보낸다(카톡·메일 등 아무 경로). 로그에는 빌드 해시, 기기 모델, OS 버전, 상태 전이, 오류가 자동 포함된다.
3. 재현이 필요한 게임 버그는 리플레이 JSON(시드+액션) 내보내기 구현(#71) 후 받아 테스트 벡터로 추가한다. 현재는 로그·재현 단계를 받는다.
4. 수정 → 태그 → 재배포. 회차 기록은 `docs/device-test/`에 남긴다.

---

## 7. 리스크와 대응 (요약, 상세는 tech-stack.md 리스크 표)

| 리스크 | 심각도 | 대응 |
|---|---|---|
| 삼성 One UI 비행기 모드 LOHS | 해당 기기 확인 | M0 S25 Ultra에서 성공. 다른 기기·현재 UI·장시간 복귀는 별도 실측 |
| LOHS 자격 증명·IP 무작위 | 중 | 매 세션 QR. 서버 0.0.0.0 바인딩, 인터페이스 순회 |
| iOS 캡티브 시트/HTTPS 우선 | 중 | 안내 문구, M0에서 확인 |
| 비보안 컨텍스트 API 부재 | 중 | 금지 API ESLint, 로그 호스트 업로드, 자동 잠금 안내 |
| Ktor on Android R8 이슈 | 낮 | minify 끔, CIO 엔진, 서버 기동 계측 테스트 |
| ~~TS 7 ↔ Svelte 도구 호환~~ | 해소 | 비호환 확인됨 → TS 6.0.3 기본으로 확정(1.8) |
| 에이전트의 구식 문법 혼입(Svelte 4, Tailwind v3, React 패턴) | 중 | AGENTS.md 금지 목록, Svelte MCP autofixer, svelte-check, ESLint가 기계적으로 차단 |
| Playwright WebKit ≠ iOS Safari | 낮 | 1차 필터로만, 최종은 실기기 |
| CI 분량(비공개 2,000분/월) | 낮 | E2E는 PR만, 대규모 시뮬레이션은 태그만 |

---

## 8. 초기 구축 이력

M0 골격·스모크 작업은 완료되어 §3과 [리뷰 인덱스](docs/reviews/README.md)로 대체한다. 당시에는 `docker/compose.yml`의 분리된 서비스·셸 래퍼를 썼으며, §2의 단일 이미지·루트 Compose로 교체했다.

---

## 9. 결정 사항

D1·D2는 기존 트랙 ID를 유지하고, 나머지 확정 결정을 D3~D6으로 묶는다.

| ID | 결정 | 근거·남은 일 |
|---|---|---|
| D1 | Commons 48장 유지·앱 렌더링 개선, 보너스 3장·뒷면만 같은 화풍으로 신규 제작 | 사용자 2026-09-29 결정. 시안 A/B·클래식 리마스터 기각, PR #37 닫힘. [구현 수치·검증 절차](docs/design/cards-polish.md) |
| D2 | [UI 규범](docs/design/ui-spec.md) UX-01~25를 spec §6에 반영 | PR #55 설계 완료, 구현 격차 #46~#53 유지 |
| D3 | 순수 TS 엔진 한 벌, Android는 셸·중계 전용 | §1.1·§1.4, spec FR-11·NF-09 |
| D4 | 하이브리드 도구·Svelte·WAAPI·npm workspaces 유지 | §1.8, 버전 정본 AGENTS.md §2 |
| D5 | 포트 17777, WebView origin 127.0.0.1, 패키지 com.kywoo26.p2pgostop | §1.7, 앱 이름 “맞고 P2P”(가칭) |
| D6 | 태그 배포·고정 서명, v0.2.x 완성도 증분 뒤 P1·AC 전부 통과 시 v1.0.0 | §3·§5, 상세 배포 순서는 Galaxy·솔로 계획 |

AI 강도·모바일 시간 예산과 머니 재산정은 미완이다. 효과음은 현재 Web Audio 합성 최소판이며 음색·설정 완성은 후속이다.

---

## 10. 변경 이력
- v0.9 (2026-09-29): §2를 단일 개발 이미지·루트 Compose·Dev Container로 교체하고, CI 명령과 기존 볼륨 전환 절차를 동기화(PR #38, NF-06).
- v0.8 (2026-09-29): 마일스톤 이력을 상태 표로, 진행 계획을 현재 트랙으로 통합. 버전 표는 AGENTS.md로, 세부 증분은 Galaxy·솔로 계획으로 일원화.
- v0.7 (2026-09-29): 1.1 중계 규칙을 최신 연결 우선(4001)·알림·위조 차단·1003/1009/1008로 확정(M4 프로토콜 리뷰 #15·#24).
- v0.6 (2026-09-28): 3-2 재개 계획(사후 리뷰·통합·후속 트랙, 리뷰 필수 규칙).
- v0.5 (2026-09-28): 3-1 병렬 라이프사이클(모델 배분 원칙, 워크트리·PR 격리) 추가.
- v0.4 (2026-09-28): M0 리뷰 반영 — 코루틴 명시 의존, Dependabot 쿨다운, 버전 규칙, release.yml 분리 원칙. M0 조건부 완료(docs/reviews/README.md).
- v0.3 (2026-09-28): 하이브리드 Rust 툴체인 결정(순수 TS 패키지는 oxlint/oxfmt/TS 7, web은 ESLint/Prettier/TS 6). Svelte MCP를 로컬 stdio로 재채택.
- v0.2 (2026-09-28): agent-era-stack.md 반영. 원칙 9 추가, 1.6 애니메이션·스타일·검증 구체화, 1.8 스택 확정 표, 테스트·CI 게이트 추가, TS 6.0.3 확정, 리스크 표 갱신.
- v0.1 (2026-09-28): 초안.
