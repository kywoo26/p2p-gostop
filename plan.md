# p2p-gostop — 구현 계획 (plan.md)

작성일: 2026-09-28 · 상태: v0.11 진행 매트릭스 리뷰 반영 (2026-09-29)
상위 문서: `intend.md`(왜) → `spec.md`(무엇을) → **이 문서**(어떻게)
근거: `docs/research/tech-stack.md`(플랫폼 제약), `docs/research/code-refs.md`(설계 차용), `docs/research/rules-commercial.md`(규칙), `docs/research/agent-era-stack.md`(에이전트 시대 스택 판단)

---

## 0. 구현 원칙 (사용자 지시 반영)

1. **최신 공식 문서 우선.** 라이브러리·API를 쓰기 전에 Context7 또는 공식 문서를 조회하고, 버전은 `AGENTS.md` §2 버전 표의 정확한 값을 쓴다. 학습 데이터 기억으로 코드를 쓰지 않는다.
2. **저명한 패키지만.** 다운로드·유지보수·라이선스가 검증된 패키지만 의존성에 넣는다. 작은 기능을 위해 정체된 패키지를 쓰지 않고 직접 구현한다(예: SHA-256, QR은 `uqr`).
3. **표준 프로젝트 구조.** npm workspaces 모노레포, Vite/Svelte 공식 템플릿 구조, Android Studio 표준 프로젝트 레이아웃(Gradle Kotlin DSL, version catalog). 새로 익힐 관례를 만들지 않는다.
4. **테스트 동반.** 엔진과 AI는 테스트 먼저(규칙 벡터 → 구현). 모든 마일스톤에 자동 검증 기준이 있고, CI가 PR마다 실행한다. 실기기 검증만 사람이 한다.
5. **표준 설치, 같은 버전 핀.** 빌드·테스트는 호스트와 CI 러너(Ubuntu 24.04)에서 네이티브로 실행한다. 도구는 공식 절차로 `tools/setup-host.sh` 한 번에 설치하고, 동일성은 `.nvmrc`·package-lock·Gradle 설정으로 담보한다(2026-09-30 사용자 지시로 개발 컨테이너 삭제).
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
- Web Worker에서 실행하며 가중치·벤치마크 근거는 [AI 튜닝](docs/ai-tuning.md)에 둔다. #66 재도전(PR #167)은 보통 65.01%가 95% 구간 62.91–67.10%로 미확정, 쉬움 76.87%가 미달이므로 AI-04·AC-03(P0)은 미완이다. Node 응답 시간은 AI-05 모바일 실측을 대체하지 않는다.

### 1.6 웹 앱 설계

- 모드: `host`(권위 엔진 보유, 게스트에게 뷰 전송), `guest`(뷰 수신, 액션 요청), `solo`(엔진+AI 로컬, 네트워크 없음).
- 상태 관리: Svelte 5 runes. 외부 상태 라이브러리 없음. 엔진 이벤트 열을 애니메이션 큐가 소비하고, 큐가 비면 최신 뷰로 보정.
- 애니메이션: **Web Animations API + 자체 FLIP 헬퍼**(`src/anim/`, 수십 줄). 컨테이너를 넘나드는 카드 이동(손패→바닥→획득패)은 이 헬퍼가, 모달·배너·토스트는 Svelte transition이 담당한다. `transform`·`opacity`만 애니메이션하고 `will-change`는 움직이는 카드에만 건다(iOS 메모리). `anim.finished`로 턴 시퀀스를 async 체인으로 구성. 기본 보통은 UX-15의 단계별 이동·정지 토큰을 쓰고, 빠름은 AC-06 표, 매우 빠름은 빠름 ×0.6을 쓴다. `--dur-scale: 0`은 스킵·동작 줄이기·E2E 즉시 모드에 적용한다. 라이브러리(GSAP, Motion, Pixi 등)는 도입하지 않음. FLIP 헬퍼가 복잡해지면 `motion` 미니 `animate()`만 TRIAL.
- 스타일: Svelte scoped CSS + `tokens.css`. Tailwind·컴포넌트 라이브러리 없음. 네이티브 `<dialog>`로 부족하면 Bits UI 단일 컴포넌트만 검토.
- 카드 자산: SVG를 svgo로 최적화해 `<img>`로 렌더(인라인 SVG·filter 금지, Safari 래스터 성능).
- 비보안 컨텍스트 제약(spec NF-02)은 ESLint 코어 규칙 `no-restricted-properties`/`no-restricted-syntax`로 강제(커스텀 규칙 없음, .svelte에도 적용).
- 프로토콜 입력 검증: `zod/mini`(Zod 4) TRIAL. 신뢰할 수 없는 WS 입력을 스키마로 검증하고 타입을 스키마에서 도출.

### 1.8 스택·의존성 도입 근거

**RP-01~07 원격 확장(사용자 답변 반영, 최종 승인 대기):** §1.9·spec §13만 제안이며 이번 PR은 의존성/코드를 추가하지 않는다. 1순위는 기존 Node `ws`로 `relay-dev`의 방 인증/정적 서빙을 강화한 PC Docker 배포+기존 Tailscale Funnel. 로컬 개발 기본 모드는 보존하고 공개 모드는 명시적으로 켠다. DO 전환 시에만 `packages/relay-cloud`와 Wrangler/Workers 타입·테스트 도구 도입을 검토하며, Context7 공식 API 확인·정확한 버전·라이선스·3일 게시 조건을 이 절과 AGENTS 표에 기록한 뒤 추가한다. Android는 기존 WebView의 아웃바운드 WS를 우선 사용하여 Ktor client 의존성을 추가하지 않는다.

**RP-04A 테스트 의존성(2026-09-29; ws 갱신 2026-09-29):** `packages/web`의 Node 전용 `test:net`에서 공개 중계 WebSocket과 실제로 통신하기 위해 `ws` 8.22.0 및 `@types/ws` 8.18.1을 개발 의존성으로 사용한다. `ws` 8.22.0은 npm에 2026-09-26 15:00 UTC 게시, 2026-09-29 19:15 UTC 확인으로 `min-release-age=3`(72시간)을 충족한다. AGENTS.md §2 버전 표에도 같은 근거를 기록한다. 두 패키지는 브라우저 번들 런타임에 포함되지 않으며 `web/src/net`의 생산 코드는 브라우저 내장 WebSocket을 사용한다.

**RP-05A 공개 중계 E2E 도구(2026-09-30):** `packages/web/e2e/remote-host-real.spec.ts`는 호스트의 OpenSSL로 실행 중 임시 자체 서명 인증서를 만들고 Node HTTPS 프록시를 통해 실제 `RELAY_PUBLIC=1` relay-dev를 검사한다. 앱 런타임·npm 의존성은 추가하지 않는다. `knip.json`의 web 한정 `ignoreBinaries`는 이 호스트 시스템 명령만 허용한다.

**PA-01~04 전문 자산 평가(2026-09-29, 예산 개정 승인 전):** NF-03의 전체1.5MiB·게스트 첫 로딩≤2초와 기존 카테고리 예산은 현행 유지한다. `design/pro-assets`의 명시적 `PRO_ASSET_REVIEW=1` 평가 빌드만 초과 자산을 포함한다. 기본/릴리스 빌드에는 평가 팩을 제외하고 기존 용량 gate를 적용한다. `docs/research/pro-assets.md`의 NF-03 개정안은 리뷰·사용자 승인 전 규범이 아니다. 원본은 `assets-src/`, 평가 변환물은 `public/pro/`에 둔다. Pillow 10.2.0(HPND, PEP 723 `uv run`), FFmpeg 7:6.1.1-3ubuntu5(Ubuntu GPL dev 도구), libavif-bin 1.0.4-1ubuntu3(BSD-2-Clause, 둘은 Ubuntu 24.04 apt)으로 고정해(`tools/setup-host.sh`) WebP/AVIF·해상도 단계·atlas·ogg/m4a·고지를 생성한다. 앱 런타임 npm 의존성0, Pixi/GSAP 등 금지 유지. 아트 디렉션은 `docs/design/art-direction.md`로 통일하고 RPG UI/Animal 팩은 제외한다. Met CC0 원화·기존 Hwatu의 CC BY-SA 4.0 파생 초상을 구분 고지하며 Commons48 원본은 유지한다. Ogg는 bitexact/serial=0과 두 번 인코딩 해시 검사를 고정한다. FPS·메모리·배터리 NF 후보는 연구 문서에만 두고 리뷰 전 spec를 바꾸지 않는다.
정확한 버전은 [AGENTS.md §2](AGENTS.md)의 단일 표를 따른다. 비교 근거는 [스택 조사](docs/research/agent-era-stack.md)다.

**A 시각 방향 확정(2026-09-29, VD-01~05):** 사용자 채택에 따라 먹빛/한지색과 Pretendard Variable v1.3.9 로컬 OFL-1.1 WOFF2 서브셋 1종(≤160KiB)을 구현한다. 규범은 `docs/design/ui-spec.md` UX-11/13·§4.1, 비교/기각 기록은 `docs/design/art-direction.md#결정-이력`다. 신규 npm 의존성0, Tailwind·shadcn·Storybook·GSAP 금지 유지. 폰트160+효과/아이콘12+소리48+UI24=추가≤244KiB, 전체≤1.5MiB·외부 요청0. 공통 파이프라인 `docs/design/fonts/`는 Docker `python:3.12-slim`의 FontTools 4.61.1(MIT)·Brotli 1.2.0(MIT)로 최신 UI 코퍼스·해시·tnum/가변 축·용량·고지 원문을 검증한다. 호스트 설치·npm lock 변경 없음. 문서 규범→토큰/폰트→화면/HUD·#46/#47→사건/음향→통합 순서로 별도 PR, 각각 최신 main에서 분기한다.

PA-05 / §1.8 손패 행동 그림 결정: 사용자 제공 폭탄·종 참고 그림을 일관된 먹선·황금/주홍 팔레트로 편집한 투명 PNG 원본2개를 고정한다. 개발 이미지의 기존 Pillow로 같은 여백의96px WebP 두 종(합계4,326 bytes)을 결정적으로 변환하고 카드 모서리22px 받침 안20px로 표시한다. npm/런타임 의존성0, 원본 SHA/결과 바이트 검증 및 출처·가공 내역은 assets-src/skin-icons와 skin/NOTICE. Phosphor SVG 검토안은 최종 화면에서 제외. NF-03 전체1.5MiB gate 유지.

| 선택 | 이유·범위 |
|---|---|
| Vite + Svelte, scoped CSS·토큰, WAAPI FLIP | 작은 UI·번들 예산; React/Tailwind/shadcn/Storybook/Pixi/Phaser/GSAP 도입 안 함 |
| TS·린트 하이브리드 | 순수 TS는 TS 7·oxlint·oxfmt, web은 TS 6·ESLint·Prettier·svelte-check; .svelte와 TS 7 도구 비호환 |
| npm workspaces·공급망 쿨다운 | 비배포 모노레포에 pnpm·Turborepo·Biome 추가 안 함 |
| Vitest·fast-check·브라우저 모드·Playwright·axe·knip·svgo | 규칙·실제 레이아웃·회귀·번들·죽은 코드 검증 |
| CI 네이티브 설치 (plan §2) | `actions/setup-node`(.nvmrc, npm 캐시)·`actions/setup-java`(Temurin 21)·`npx playwright install --with-deps`(Playwright 공식 CI 절차)·러너 내장 Android SDK. 개발 이미지와 BuildKit 레이어 캐시는 2026-09-30 삭제 |
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

### 1.9 원격 중계 모드 개정안 (사용자 답변 반영, 최종 승인 대기)

근거: [spec §13 FR/NP/NF-RP·AC-RP](spec.md#13-원격-대전-개정안-사용자-답변-반영-최종-승인-대기), [후보·공식 한도](docs/research/remote-play.md). **1순위 PC+Funnel(2026-09-29 사용자 기본 WS 통과 확인), 2순위 Cloudflare DO(PC 없이 상시 필요 시), 선택적 RP-A 테일넷 직접 연결(상대 설치 필요·우선 구현 안 함)**. [실측 결과](docs/device-test/remote-play.md#결과-기록--2026-09-29-사용자-제공)에서 프록시 host의 1008 거절도 확인했으므로 RP-02는 루프백 제한을 토큰 기반 인증으로 대체한다. 구현·배포는 리뷰와 사용자 승인 뒤 별도 PR로 진행한다.

| 경로             | 구조·책임                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 현행 LAN         | LOHS → Ktor 정적 웹/WS → Safari, Galaxy WebView 루프백 origin. 현행 LAN gate·host 루프백 검증 유지                                                                                |
| 원격 1순위       | Galaxy WebView(권위 엔진) → **아웃바운드 WSS** → Funnel TCP 중계 → PC TLS 종단 → Docker 방 중계 ← iPhone/Mac WSS. 게스트 웹은 같은 PC의 HTTPS 번들. Galaxy용 웹은 APK의 로컬 번들 |
| 원격 2순위       | 양단 아웃바운드 WSS → Worker 인증/라우팅 → 방당 SQLite-backed DO. HTTPS 정적 웹은 Pages. 클라우드도 규칙·원장·시드 보관/계산 없음                                                 |
| 선택적 A안(RP-A) | 상대 Tailscale 앱/계정·Galaxy 노드 공유 → Galaxy 테일넷 HTTP/WS 직접 접속. PC·별도 게임 중계 불필요, 비보안 컨텍스트 유지. B안 선행 아님                                          |

| 설계 지점          | 구현 제안                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 같은 웹·프로토콜   | 한 release에서 만든 동일 dist를 APK와 PC/Pages에 복사. 모드 선택은 세션 생성 전에, endpoint와 인증 어댑터만 교체. 원격 주소를 임의 링크 query로 주입받지 않고 사용자 등록/배포 허용 목록과 비교. 기존 WsTransport send/onMessage/onClose/reconnect·세션 hello/snapshot 재사용                                                                                              |
| Android 아웃바운드 | Ktor는 APK 웹을 루프백에 서빙, WebView가 지정 공개 WSS에 직접 접속. 원격 진입 전에 LOHS 종료·LAN gate 명시적 false, 기존 `stopHotspot`의 addressOnly 전환만으로 끝내지 않음. HostBridge 허용 origin/메인 프레임·Network Security Config 127.0.0.1 예외 유지, remote 웹에 HostBridge 제공 금지                                                                              |
| 호스트 실행 수명   | 엔진은 계속 WebView에 있으므로 백그라운드 실행 보장 없음. 화면 유지·복귀 재인증, 호스트 실행 정지 동안 입력/타이머 중단. LOHS 없는 원격 모드에서 connectedDevice FGS 사용 적합성은 Android 공식 문서 확인 후 결정; 서버 연결만으로 게임 실행을 보장한다고 쓰지 않음                                                                                                        |
| PC 서버            | `packages/relay-dev`에 명시적 public 설정·방 API·정적 dist 서빙 추가, default loopback 개발 동작 유지. role별 소켓을 방별 map으로 분리, **공개 모드는 loopback 우회 없이 항상 토큰 검증**. 공용 자격 증명을 번들에 넣지 않고 운영자 생성 키를 Galaxy에 1회 등록. 게임 프레임은 내용 해석 없이 제한/중계, 방/인증 제어만 파싱                                               |
| PC 인프라          | 같은 모노레포의 `docker/relay/`와 전용 Compose 파일·운영 README. production artifact만 넣는 비root 컨테이너, 루프백 publish·read-only 파일 시스템·메모리/CPU 제한·수동 세션 기동/종료(부팅 자동 시작 없음). 빌드·테스트는 호스트 네이티브 도구를 사용한다. Docker socket/관리 API/진단 경로 공개 금지                                                                      |
| Funnel 설정        | 기존 PC Tailscale의 MagicDNS·HTTPS·funnel 노드 속성 확인 후 `tailscale funnel --bg --https=443 <target>`(예: `http://127.0.0.1:17778`). 정책은 해당 PC만 허용. WSL2이면 Tailscale 실행 위치와 Docker 루프백 가시성·Windows 재부팅 뒤 자동 공개되지 않는지·수동 시작 후 가동을 확인. 별도 cloud 계정·배포 파이프라인 없이 기존 CI artifact를 PC에 설치/이전 artifact로 롤백 |
| 인증 순서          | HTTPS 방 생성(운영자 키)→host 토큰→호스트 발급 초대 해시 등록→양쪽 WSS 첫 프레임 인증→역할 원자적 점유→기존 relay 알림/hello. 초대 claim 중에는 이전 socket 교체 금지, 호스트 승인/복귀 토큰 발급 완료 후만 좌석 확정. 모든 게임 메시지는 기존 decode·sessionToken 검증을 거침                                                                                             |
| 서버 상태 경계     | PC 방 메타데이터는 메모리 TTL·재시작 시 소실, 양쪽에 새 방/초대 안내. 폰의 원장 복구와 서버 방 복구를 구분. cloud DO는 소켓 attachment+최소 TTL 메타데이터/만료 alarm로 휴면 복원, 프레임/게임 로그는 저장 안 함                                                                                                                                                           |
| 서버 신뢰          | Funnel 사업자는 암호문 TCP 전달, PC가 TLS 종단·평문 중계. cloud 대안은 Cloudflare가 TLS 종단. 둘 다 악성 중계/웹 배포자를 배제하는 게임 양단 E2EE가 아니며 commit-reveal 한계 표시                                                                                                                                                                                         |
| 보안 컨텍스트      | 원격 Safari는 HTTPS이므로 AGENTS §3의 Clipboard/Share/Wake Lock 등 일부 제약 완화 **가능성**이 있음. 초기 범위는 기존 폴백·순수 JS 해시 유지. 나중에 mode+secureContext+지원 여부 검사를 갖춘 별도 어댑터/린트 예외를 승인받아 추가; LAN·서비스 워커·가로 잠금 등 전역 금지 일괄 해제 없음                                                                                 |
| 외부 요청 검사     | `packages/web/scripts/check-bundle.mjs`·`NoExternalUrlTest.kt`를 없애지 않고 지정 원격 HTTPS/WSS만 허용하는 검사로 개정. WSS·동적 URL·오프라인 런타임 외부 요청까지 negative test. 로컬/원격 모드 종료 뒤 예약 재연결/건강 확인 요청 0                                                                                                                                     |
| cloud 패키지 대안  | `packages/relay-cloud`는 DO를 선택할 때만 추가. protocol의 공개 relay 계약만 공유하고 engine 실행 의존은 금지. imports/exports 변경 시 `docs/reviews/refactor-import-boundaries.md`·린트·probe 함께 수정. Node ws를 DO에서 그대로 실행할 수 있다고 가정하지 않음                                                                                                           |

#### 배포·비밀·가용성

| 대상            | 제안                                                                                                                                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PC 기본 운영    | 고정 release artifact+SHA 식별자, 한 번 설치 후 명시적 업데이트, 게임할 때만 start/stop 스크립트 실행. 상시·로그인/부팅 자동 기동 없음. 서버 생성 키는 PC secret 파일(제한된 권한)과 Galaxy 개인 설정에만, Tailscale state는 운영 PC의 보호된 상태로 보관. git/로그/공용 웹에 키 없음. 키 폐기·PC 이전·Funnel 중지/복구 절차 포함 |
| 정적 웹         | release별 경로·content hash, 앱과 동일 artifact. 초기 지원은 현재 release와 직전 호환 release, 불일치 시 명시적 업데이트 안내; 게임 wire가 다르면 연결 거부. PC 정적 경로도 traversal/소스맵/설정 파일 노출 금지                                                                                                                  |
| cloud 선택 시만 | Workers Free·SQLite DO·Pages 기본 도메인, 유료 플랜/자동 과금 금지. GitHub Actions 기존 ubuntu-24.04에서 검사·빌드→분리된 staging→검증된 artifact를 production으로 승격. DO/웹/APK 호환 행렬 확인 후 배포, 방 연결은 배포 중 끊길 수 있어 재접속 검증                                                                             |
| cloud 비밀      | 최소 권한 Cloudflare API token은 GitHub environment secret, 서비스 생성 키는 Worker secret. PR/fork에 운영 secret 미제공. 운영/검증 DO namespace·생성 키 분리. 신규 CLI/Action 버전·권한은 RP-03C3에서 확정, 이 문서에 임의 최신 버전 추가 안 함                                                                                  |
| 비용·장애       | PC 전기·회선/관리 시간을 인정하고 추가 서비스 요금 0 유지. Funnel 수치 미공개 한도/PC 장애 또는 Cloudflare quota 초과 시 새 방 차단·진행 입력 잠금·재시도 안내, 유료 이전 없음. 오류 로그는 내용/토큰 없이 집계만. 관리자에게 임의 진단 업로드 없음                                                                               |

#### PC 수동 기동·3단계 안내·현재 시작 경로 감사 (Q-RP-05/10 확정)

| 항목                  | 구현 계약·확인 근거                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 한 번 클릭 시작       | 저장소 `tools/relay/start.cmd` 후보: 설치된 Docker Desktop/WSL 배포판·Windows Tailscale 상태 확인 → 전용 Compose 프로젝트 중계 시작 → 로컬 health 확인 → 해당 Funnel 443 활성화 → 공개 ts.net 주소·health/호환 웹 경로 출력. 중복 실행 안전, 오류 시 원인/조치와 비정상 종료 코드, 비밀 출력 금지. 최초 funnel 노드 속성 승인은 관리 콘솔에서 1회 사람이 수행; 우회하지 않음 |
| 한 번 클릭 종료       | `tools/relay/stop.cmd` 후보: 해당 Funnel 엔드포인트 끄기 → 해당 중계 프로젝트 정지. 실패 시 남은 상태/조치를 출력. 다른 컨테이너·Funnel 설정·Tailscale 자체를 정지/초기화하지 않음. Windows 로그인/부팅·Docker daemon 재시작 뒤 중계 자동 시작 금지; **게임할 때만 실행**                                                                                                    |
| 앱 단계               | ① PC에서 시작 스크립트 실행(PC 전원·Docker 안내) → ② 설정된 HTTPS 중계 URL의 health 확인(확인 중/녹색 정상/빨강 실패+텍스트) → ③ 방 만들기·링크/QR/코드 공유. 저장된 ts.net은 방마다 바꾸지 않고 초대 QR만 갱신. 정상 health는 host/guest 인증·게임 준비 완료와 구별                                                                                                         |
| 원인별 조치           | 공개 URL timeout/DNS/TLS 실패만으로 PC 꺼짐·Docker 미실행·Funnel 미허용을 구별할 수 없음. 앱은 ‘중계 불통·원인 미확인’과 PC 켜기→Docker 실행→Funnel 승인/시작 확인 순서를 제공. start.cmd의 로컬 Docker 검사/로컬 health/Funnel 상태로 확인된 오류만 구체적 원인으로 표시. 중계가 응답하지만 peer 부재이면 ‘호스트 대기’. 진단 결과를 원격 게임 서버로 수집하지 않음         |
| health 경계           | NP-RP-08. 원격 화면 진입/수동 재시도에서만 유한 요청, 상시 폴링 없음. redirect로 임의 origin을 따라가지 않음. PC 로컬 진단 정보는 공개 health에 포함하지 않음. 정적 서빙 02C가 응답 계약, net 04A가 확인·취소, UI 05C가 표시를 소유                                                                                                                                          |
| 현재 앱 실행 감사     | 문서 작업 기준 `6b63bed`: Manifest의 launcher는 `MainActivity`. `MainActivity.render()`가 웹 번들이 있으면 GameActivity로 자동 이동. `GameActivity.onCreate()`는 serviceRunning=false일 때 **ACTION_SERVER_ONLY로 FGS 시작**. `HotspotService` 해당 분기는 goForeground→LOHS 예약 취소·LAN false→로컬 서버 시작. 따라서 웹 진입은 FGS를 시작하지만 **LOHS 자동 시작은 아님** |
| 현재 친구와 대전 감사 | `web/src/routes/Home.svelte`의 #/versus→`Versus.svelte`는 openRoom·hotspot.watch만 호출. `p2p/hotspot.svelte.ts`의 watch는 구독/getHotspot이고 start가 아님. LOHS 시작은 명시적 onhotspot→hotspot.start→브리지 startHotspot→ACTION_START 경로. 코드 열람 결과이며 실기기 재검증 결과가 아님                                                                                  |
| RP-04A 회귀 gate      | 위 경로를 선행 병합본에서 다시 대조하고 `MainActivity/GameActivity/HotspotService` 및 `Versus`·p2p 소유자와 인계. 원격 선택/복귀/health 재시도에서 ACTION_START·LOHS 권한 요청0·LAN 열림0. 로컬 웹 서버용 FGS 수명/유형의 적합성은 공식 문서 검토와 JVM/기기 검사로 확정하며, 핫스팟과 FGS를 같은 것으로 취급하지 않음                                                       |

#### 두 안의 공통 전송 경계

[refactor-plan §4 전송 추상화](docs/refactor-plan.md#4-장기-계획-접점-있는-것-보존-필요한-것만-준비)의 기존 `Transport` 계약을 사용한다. **B안은 설정 가능한 중계 HTTPS/WSS URL + 공개 중계 인증 어댑터**, A안은 선택 시 Galaxy 테일넷 HTTP/WS URL + 현행 직접 연결 어댑터를 주입한다. 엔진·세션·hello/snapshot은 endpoint를 알지 않는다. B안 중계 URL은 호스트 설정에서 명시적으로 등록/변경하고 프로토콜·정규화된 origin을 검증하며, 공개 초대 링크의 임의 endpoint를 신뢰하지 않는다. 허용 origin은 배포 설정/사용자 확인으로 확정하고 검사 gate에 반영한다. A안이 미구현일 때 해당 선택 UI/접속 경로는 활성화하지 않는다. 방 토큰·저장·재접속은 모드+origin+room별로 격리, URL/모드 변경은 세션 종료 후 적용한다. RP-A의 HTTP 허용이 B안의 WSS 필수를 완화하지 않는다.

#### RP-A 테일넷 직접 연결 — 선택적 확장, 기본 경로의 선행 아님

사용자 최종 결정은 **B안 PC Docker 중계+Funnel·파트너 무설치/링크만을 1순위 구현**하는 것이다. A안은 파트너 설치를 받아들이는 경우의 선택적 확장으로만 남기며 우선 구현하지 않는다. Galaxy도 기존 테일넷 노드이므로 상대가 Tailscale 앱·계정을 준비하고 Galaxy 노드 공유를 수락하면 브라우저에서 `http://100.x.y.z:17777/` 또는 확인된 MagicDNS 이름으로 Galaxy Ktor에 접속한다. PC·별도 게임 중계·Funnel·클라우드 배포는 없다. 게임 호스트는 그대로 Galaxy WebView이며 WS host 역할은 루프백 전용이다. WireGuard 사설망의 기기 간 게임 연결이지만 Tailscale direct 실패 시 DERP 등 전송 중계를 쓸 수 있으므로 ‘항상 물리적 직접 연결’은 보장하지 않는다([공식 연결 유형](https://tailscale.com/docs/reference/connection-types)).

| 변경 경계   | 최소 구현·수용 조건                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 선택 옵션   | `tailnetEnabled`(제안 이름) 기본 끔. 일반 `lanEnabled`와 분리해 설정에서 명시적으로 켠다. LOHS·주소만 표시를 자동으로 켜지 않으며, 테일넷 모드 동안 일반 LAN gate는 닫힘                                                                                                                                                                                             |
| IP 선택     | `IpSelector`에 별도 테일넷 선택 경로: 활성 VPN 인터페이스의 `100.64.0.0/10` 주소, Galaxy의 `tun0`는 우선 후보. 핫스팟의 VPN/CGNAT 감점은 그대로. 인터페이스 이름·100.x만으로 Tailscale이라고 단정하지 않으며 셀룰러 CGNAT·다른 VPN은 제외, 식별 불확실 시 닫힘. MagicDNS는 공유 상대의 실제 이름 해석 확인 후 표시, 실패 시 100.x 사용                               |
| 서버 gate   | `SmokeServer`의 HTTP/guest WS에 테일넷 전용 허용 분기를 추가. 대상 로컬 주소/수신 인터페이스와 실제 peer 주소를 검증해 선택한 테일넷 경로만 허용, `100.64/10` 출발지 검사만으로 전체 LAN을 열지 않음. VPN 해제/주소 변경/옵션 끔이면 기존 해당 guest도 닫고 URL 제거. Android의 실제 VPN 전달 주소/인터페이스 확인이 불가능하면 허용 범위를 넓히지 않고 후속 설계    |
| 홈·로비     | ‘테일넷 직접 연결(Tailscale 설치 필요)’ 표시, 테일넷 URL·QR과 핫스팟 SSID/IP를 명확히 구별. RP-A은 방 코드/공개 토큰/정적 서버 신규 배포 없음. 기존 1 guest·sessionToken·hello/snapshot 사용                                                                                                                                                                         |
| 보안·플랫폼 | tailnet 정책으로 공유 상대→Galaxy TCP 17777만 허용, 공유 노드 격리(수신 연결만; 응답은 가능). 앱 gate로 테일넷 밖 요청 차단·공개 포트 포워딩 없음. HTTP는 WireGuard 터널 안이어도 **브라우저 비보안 컨텍스트**: 금지 API 유지. Android 앱 Funnel 서빙은 공식 지원 경로가 없어 사용하지 않음([Funnel 요구사항](https://tailscale.com/docs/features/tailscale-funnel)) |

#### 마일스톤·PR 분해 (사용자 답변 반영, 최종 승인 대기)

시간은 **담당 1인의 구현·해당 자동 검증 합계 추정**, 각 행은 1일 이내(최대8시간) PR 범위다. 달력상 연속 일정/완료 보장이 아니며 리뷰·선행 병합 대기와 사람의 2시간 연결 시험은 별도다. 신규 경로는 후보 이름이며 RP-01에서 확정한다. `web/`는 `packages/web/`, `android/…/`는 `android/app/src/main/kotlin/com/kywoo26/p2pgostop/`를 뜻한다. 각 행 소유자는 해당 PR 담당이며 인계 전 같은 파일을 병렬 수정하지 않는다. **기본 실행 순서는 RP-01→02A→02B→02C→03A→03B→04A→04B→05A→05B→05C→06→07**이다. 아래 RP-A1/A2는 별도 선택 시만 실행하며 기본 경로를 막지 않는다.

공통 인계: 선행 PR 번호·병합 SHA·API/props/상태 계약·통과 테스트·남은 실패를 후속 PR 본문에 기록한다. [리팩터 소유권](docs/refactor-plan.md#5-에이전트용-변경-위치-지도와-소유권)·[스킨 시작 조건](docs/design/pro-skin-plan.md#1-시작-조건과-이식-경계)·§3이 정본이다. **RP-05/06 및 RP-A의 홈/로비 변경은 #104→후속 스킨 PR 병합 뒤** 디자인 담당이 경로/기준샷을 인계한다. 스킨 PR 번호가 정해지면 인계 기록에 연결하며 미병합 동안 UI 착수 금지. `p2p/*`·App/Game·bridge 접점은 **v0.2.2 UX 담당(#151 후속·§3 .2-A~C)과 상태/재접속 계약 조율 후 담당 변경 병합본으로 직렬 인계**한다. 합의가 없으면 net/Android 독립 부분까지만 진행한다.

| PR / 일별 범위·예상 시간                         | 단독 소유 파일·담당 영역                                                                                                                                                                                         | 선행 병합 → 인계 조건·완료 기준                                                                                                                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RP-01 · 공개 중계 규범/인증 계약, 4~6h           | 문서 담당: `intend.md`, `AGENTS.md`, `spec.md`, `plan.md`, `docs/protocol.md`                                                                                                                                    | 확정 인터뷰 반영본의 최종 명세 승인(RP-A 불필요) → #123 문서 담당과 wire 버전/전송 제어 경계 합의, 공식 API·신규 파일/의존성 계획 확정. 게임 wire 변경은 별도 승인                                                                 |
| RP-02A · 생성/역할 인증, 6~8h                    | 서버 담당: `packages/relay-dev/src/{index,cli}.ts`, 신규 `src/auth.ts`·대응 `test/`                                                                                                                              | RP-01 → 공개 모드 기본 비활성, loopback 우회 없는 토큰 인증·교체 전 인증 테스트. 인증 결과 타입/토큰 권한을 02B에 인계(NP-RP-01/02/05)                                                                                             |
| RP-02B · 방·초대·TTL·제한, 6~8h                  | 서버 담당: relay-dev 신규 `src/rooms.ts`·`src/limits.ts`, `src/index.ts`·대응 `test/`                                                                                                                            | 02A 병합 → 코드/claim/만료·방 격리·큐 제한·재시작 소실 테스트, 방 API/오류·설정 계약을 02C/04에 인계(NP-RP-03~07)                                                                                                                  |
| RP-02C · 정적 서빙, 4~6h                         | 서버 담당: relay-dev 신규 `src/static.ts`, `src/{index,cli}.ts`·대응 `test/`                                                                                                                                     | 02B 병합 → dist만 제공·traversal/설정 노출 차단·버전 경로 검사. 최소 health 응답·실행 인자/포트/dist 경로를 RP-03A/04A에 인계; Docker/웹 UI 제외                                                                                   |
| RP-03A · PC artifact·배포/호환 경로, 4~6h        | 운영 담당: 신규 `docker/relay/**`·`compose.relay.yaml`, 운영 README·`docs/device-test/remote-play.md`                                                                                                            | 02C 병합 → 비root/루프백 publish·비밀/롤백·1회 노드 승인 절차 검사. Docker/CI 담당과 기존 artifact 경계 인계, 공개 운영 전 사람 확인. RP-03B에 실행/설정 계약 인계. **2시간 실측은 이 시간 밖**, 기본 WS PASS는 재사용             |
| RP-03B · 한 번 클릭 수동 start/stop, 4~6h        | 운영 담당: 신규 `tools/relay/{start,stop}.cmd`·진단 helper/README·스크립트 검증 자료                                                                                                                             | 03A 병합 → Docker 중계/Funnel 기동·종료·주소 출력·중복 실행·오류·기존 설정 보존 검사. 다른 서비스·로그인/부팅 설정 변경0. PC Windows 실행 확인은 사람 일정으로 분리, 확인 결과/오류 코드를 05C에 인계                              |
| RP-04A · 공개 transport·Android 아웃바운드, 6~8h | 연결 담당: `web/src/net/**`, `web/scripts/check-bundle.mjs`, `android/…/{MainActivity,GameActivity,HotspotService}.kt`·대응 JVM 테스트, `android/app/src/test/kotlin/com/kywoo26/p2pgostop/NoExternalUrlTest.kt` | 02B·03B 및 Android 셸 담당 인계 → 앱 실행/친구와 대전의 LOHS/FGS 감사·원격 LOHS 시작0, host 인증/health/endpoint 허용 목록·LAN gate 닫힘·transport 계약 테스트. net 공개 API를 UX 담당에게 인계; p2p/UI 수정 없음                  |
| RP-04B · 세션 재인증 연결, 4~6h                  | UX 인계받은 연결 담당: `web/src/p2p/{link,host.svelte,guest.svelte,common}.ts`·대응 테스트                                                                                                                       | 04A + v0.2.2 UX 해당 PR 병합 → onConnection/hello/복귀 토큰 수명·4001·host 부재 계약 합의/테스트. 게임/정산 로직 변경 금지, RP-05 상태 모델 인계                                                                                   |
| RP-05A · 홈/호스트 로비·URL 설정·링크/QR, 6~8h   | UI 담당: `web/src/routes/{Home,HostRoom,Settings}.svelte`, `p2p/{qr.ts,QrCode.svelte}`·전용 테스트. endpoint 저장은 04A의 net 계약 소비                                                                          | 04B + **#104→스킨 병합** + UX·§3 설정 담당 인계 → 중계 URL 등록/변경·공개 중계/핫스팟 주소 구별·초대 표시(RP-A 선택 UI는 미활성)·기존 폴백 검증. props/화면 상태/기준샷 인계                                                       |
| RP-05B · guest 코드/만료/복귀 UI, 4~6h           | UI 담당: `web/src/routes/{GuestJoin,GuestApp}.svelte`, 필요 `App.svelte` 라우팅·전용 테스트                                                                                                                      | 05A + §3 App 라우팅/UX 담당 병합·인계 → 코드 승인/토큰 탭 저장·만료/부재·다른 창 상태 검증. p2p 수정 필요 시 04B 담당 후속 PR로 먼저 인계                                                                                          |
| RP-05C · PC→health→초대 3단계 안내, 4~6h         | UI 담당: `web/src/routes/{Versus,HostRoom}.svelte`·전용 browser/E2E, 필요 신규 원격 안내 컴포넌트                                                                                                                | 05B·03B·04A + UX/디자인 인계 → 녹색/빨강+텍스트·PC/Docker/Funnel 조치·원인 미확인·host 부재 구분. 원격 진입에서 핫스팟 시작0, health 취소/중복 억제·시작 버튼 상태 검사(FR-RP-07/08)                                               |
| RP-06 · Mac 가로·접근성, 6~8h                    | 디자인 인계받은 UI 담당: `web/src/ui/{Board,Screen}.svelte`, `styles/tokens.css`, Mac 전용 browser/E2E·기준샷                                                                                                    | 05C + **#104→스킨 병합** + 디자인의 Board/토큰 인계 → 단일 반응형 앱의 BoardView/액션과 배치 영역/폭 계약 분리(향후 넓은 화면 확장), 키보드/200%·모바일4화면 회귀, `--dur-*`/anim·p2p 변경 없음. 공용 기준샷 담당과 변경 목록 합의 |
| RP-07 · 통합 자동 검증, 6~8h                     | 통합 담당: 신규 `web/e2e/remote-play.spec.ts`, `docs/device-test/remote-play.md`                                                                                                                                 | AC-RP-01~04/06 브라우저 통합 E2E; 스킨 #171 뒤 remote-play 8 통과(8 skip), smoke 314 통과. requestId 경합 중 수/정산 중복·앱 background·진행 중 TTL/quota 결과·LAN 첫 실행/기내 동일 APK와 Funnel 2시간·PC 복구·실기기는 미검증. AC-RP-05 사람 절차만 작성; 수용 완료 판정 금지 |

선택적 RP-A도 아래 범위를 별도 승인한 경우에만 직렬 실행한다. 사람의 direct/DERP·VPN 해제 시험 시간은 별도다.

| 확장 PR / 시간                           | 소유 파일·경계                                                                                                                                                      | 선행 병합·인계/완료 조건                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| RP-A1 · 테일넷 주소/gate·설정 계약, 6~8h | Android 담당: `android/…/{net/IpSelector,server/SmokeServer,HotspotModel,HotspotService,GameActivity}.kt`·대응 JVM 테스트; 선택 시 spec A안 개정·프로토콜 모드 설명 | B안과 별개로 A안 선택·명세 승인·Android 셸 담당(§3 .3-C) 인계 → 기본 끔/경계 IP/다른 VPN/옵션 해제·LAN 회귀 검증, 브리지 응답 형태를 RP-A2에 전달 |
| RP-A2 · 홈/로비 옵션·주소/QR, 4~6h       | 웹 담당: `web/src/routes/{Home,HostRoom}.svelte`, `bridge/bridge.ts`, `p2p/{hotspot.svelte,qr}.ts`·전용 테스트, `docs/device-test/remote-play.md`                   | RP-A1 + #104 + 스킨 + UX의 해당 p2p/bridge 병합·인계 → 주소 종류·옵션/해제 UI 테스트, RP-A 사람 검증 요청. 공용 토큰/Board 수정 없음              |

**RP-03C는 PC/Funnel 운영 제약 때문에 사용자가 Cloudflare 대안을 선택할 때만** 착수한다. 서버 구현 교체이며 UI/Android/게임 wire를 소유하지 않는다. 아래 각 PR도 하루 규모로 직렬 진행하고 기존 PC 경로와 동시에 신규 구축하지 않는다.

| 대안 PR / 시간                             | 소유 파일·경계                                                                                                                                     | 선행 병합·인계/완료 조건                                                                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RP-03C1 · DO 인증/방 어댑터, 6~8h          | cloud 담당: 신규 `packages/relay-cloud/{src,test,package.json,tsconfig.json}`; 필요 protocol 공개 relay 계약·루트 lock/import 경계 문서/린트/probe | RP-01·02A/B와 대안 선택 승인 → §1.8 버전/API 검토, Node 의존 없는 프레임·역할·방 인증 동등 벡터. protocol/도구 담당과 exports 인계                                                  |
| RP-03C2 · 휴면·TTL·quota 복구, 6~8h        | cloud 담당: relay-cloud `src/`·`test/`만                                                                                                           | C1 병합 → attachment·만료 삭제·재시작/무료 한도 실패·게임 내용 무저장 테스트. deployment binding/compatibility 설정 계약을 C3에 인계                                                |
| RP-03C3 · Pages/Worker 배포·rollback, 4~6h | 운영 담당: 신규 relay-cloud 배포 설정·`.github/workflows/remote-cloud.yml`, 운영/기기 절차                                                         | C2·02C·03A artifact 계약 + CI 담당 인계 → Free·비밀/namespace 분리·동일 dist·버전/rollback 검사. 기존 release workflow 변경 필요 시 소유자 PR 선행; 공개 배포/사람 실측 대기는 별도 |

빌드·테스트 진입점은 §2·AGENTS.md §5를 따른다. 문서 PR에서 에이전트는 실제 Funnel 공개·클라우드 생성·실기기 검증을 수행하지 않는다. 사용자가 제공한 2026-09-29 시험 결과만 `docs/device-test/remote-play.md`에 기록했다.

## 2. 개발 환경 (네이티브, 버전 핀)

- 호스트(WSL2 Ubuntu 24.04)와 CI(`ubuntu-24.04`)가 같은 명령을 네이티브로 실행한다. 명령·부하 규칙은 [AGENTS.md §5](AGENTS.md)가 정본이다(NF-09, 전환 근거 [process-local-first](docs/reviews/process-local-first.md)).
- 동일성은 버전 핀으로 맞춘다: Node `.nvmrc`, npm `package-lock.json`(Playwright 1.63.0 → 브라우저 빌드), JDK 21, Android `platforms;android-36`·`build-tools;36.0.0`(Gradle 설정), 자산 변환 apt 버전(AGENTS §2).
- 호스트는 `tools/setup-host.sh`가 한 번에 준비한다(nvm, sudo apt: Playwright 의존성·`openjdk-21-jdk-headless`·FFmpeg·libavif, uv 확인, `~/Android/Sdk`). 파이썬 스크립트(자산 변환·폰트)는 PEP 723 메타데이터로 `uv run`한다. CI는 `setup-node`(.nvmrc)·`setup-java`(Temurin 21)·`playwright install --with-deps`·러너 내장 Android SDK를 쓴다.
- 릴리스 웹 빌드는 비밀 없는 읽기 전용 잡에서 돌고 산출물만 서명 잡으로 넘긴다(§5, M0 R-1).
- 에뮬레이터는 선택 사항(핫스팟 검증 불가, tech-stack 6장). 필요하면 Android SDK 에뮬레이터를 별도 이미지에 추가해 WebView 셸 스모크에만 쓴다.

---

## 3. 마일스톤 상태

최신 요구사항 판정은 §3-2(main `daa5e7d`)를 따른다. 아래는 마일스톤 요약이다. 과거 검토의 결함·측정값은 Git 이력과 리뷰 인덱스에 보존하며, 병합 자체를 수용 기준 통과로 간주하지 않는다.

| 단계             | 현재 상태·남은 기준                                                                                                                    | 근거                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| M0 핫스팟 스모크 | AC-00 통과; B/C·장시간 복귀 등 미확인 항목은 통합 절차로 이월                                                                          | [M0 리뷰](docs/reviews/README.md), [실기기 원문](docs/device-test/results.md)        |
| M1 엔진          | 구현·규칙 벡터·불변식 검사, 밀기·revealed·applyUnchecked 후속 병합(PR #28)                                                             | [M1 리뷰](docs/reviews/README.md), [규칙 벡터](docs/rules-vectors.md)                |
| M2 AI·머니       | 조건부 진행: AC-03 기준선 63.35%/77.02%, #167 후보 보통 미확정(65.01%)·쉬움 미달(76.87%), P0 미완; MN-03·AC-10 부분(각 프리셋 3,000판) | [AI 튜닝](docs/ai-tuning.md), [머니 산정](docs/money-model.md), #66·#67              |
| M3 솔로 UI       | 구현·표시 수정 병합(#34); UX 규범 격차는 후속                                                                                          | [M3 리뷰](docs/reviews/README.md), [UI 규범](docs/design/ui-spec.md)                 |
| M4 정식 P2P      | 통합·프로토콜 후속 병합(#42·#54·#59); 밀기 웹 PR #100 병합; 로비 준비·기록/연결 상태 및 E2E 단언 보강 남음                             | [프로토콜 리뷰](docs/reviews/README.md), #44·#75, §3-2                               |
| M5 실기기        | 현재 UI AC-08·AC-09 미검증, iPhone 확보 후 재개(#75)                                                                                   | [통합 절차](docs/device-test/procedure.md), [결과 로그](docs/device-test/results.md) |
| M6 완성도        | Galaxy 호스트·솔로 우선, P1·AC 전부 충족해야 v1.0.0                                                                                    | [현재 트랙](#현재-트랙)                                                              |

### 현재 트랙

- 최신 상태·릴리스 우선순위는 §3-2를 정본으로 삼고, PR별 계획·공유 파일 소유권은 아래 #152 이관 내용을 따른다.
- 병합된 #56·#60·#38·#73은 진행 중으로 세지 않는다. PR #151(선택 자동화·국진 설정)과 #94/#95(의존성)는 병합됐고, PR #104(화면)는 미완이며, §3-2의 릴리스 분류·코드 기준을 따른다.

<a id="releases"></a><a id="ownership"></a><a id="verification"></a><a id="gaps"></a> 옛 Galaxy 계획의 경로·절 앵커는 [이관표](docs/plan-galaxy-solo.md)에서 이 절과 해당 정본으로 연결한다.

Safari는 WebKit 자동 검사로 계속 확인하고 실기기 판정은 iPhone 확보 후 #75에서 재개한다. 아래는 #152에서 이관한 PR 단위 ID와 파일 소유권이다. 단위 ID의 버전 접두사는 기존 인계 순서를 보존한 이름이며, 현재 릴리스 배정·완료 상태는 §3-2가 우선한다. 각 선행 작업의 병합본을 인계받아 충돌 파일을 직렬로 수정한다.

| 트랙·PR 단위 | 남은 범위 / 이슈                                                       | 파일 소유권·인계                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.2.2 .2-A  | 밀기/받기·배수·AI 연결은 #100 완료; #30의 이탈 환급 정책만 v0.2.3 검토 | Sol: `game/session.ts`, `solo.svelte.ts`, `controller.ts`, `p2p/{host,guest}.svelte.ts`, `Settlement.svelte`, AI worker, `e2e/push.spec.ts`; 메뉴/guest 계약 인계 뒤 |
| v0.2.2 .2-B  | FR-21 설정 24항목·규칙/금액 UI #62                                     | Sol: `settings/**`, `Settings.svelte`, `RuleSettings.svelte`, `current.svelte.ts`, `p2p/common.ts` preset 판별, `HostRoom.svelte`; .2-A 뒤                           |
| v0.2.2 .2-C  | 원장 기록·재충전·실지급·판 무효 #44(옛 #63 이관)                       | Sol: `records.ts`, `Records.svelte`, 기록 타입·E2E; .2-A의 session/solo/host/Settlement와 `App.svelte`·`routes/Game.svelte` 라우팅 소유권 인계                       |
| v0.2.2 .2-D  | 정산·은닉·설정·P2P 시간 통합 E2E #75(옛 #58 이관)                      | Sol: `e2e/p2p.spec.ts`, `solo.spec.ts`, `settings.spec.ts`; .2-A~C 뒤                                                                                                |
| v0.2.3 .3-A  | 효과음·진동·효과 강도·중복 억제 #117/#49(옛 #128 이관, 현재 v0.2.2)    | Sol: `sound.ts`, `playback.svelte.ts`, `banner.ts`, `p2p/common.ts` 진동, 피드백 설정/테스트; anim 계약 인계                                                         |
| v0.2.3 .3-B  | AI 기본값·생각 시간·오류 대체 UX #66(옛 #65 이관, 현재 v0.2.2)         | Sol: `ai-client.ts`, `ai-core.ts`, `solo.svelte.ts`, worker, SoloSetup/E2E; .2-A/C 뒤                                                                                |
| v0.2.3 .3-C  | Galaxy 안내·화면 유지·복구 #75(옛 #68/#69 이관; #64는 #88/#150 완료)   | Sol: Android Activity/Service/Diagnostics와 웹 session/solo/current/local/Diagnostics; .2-B·.3-B 저장 소유권 인계                                                    |
| v0.2.3 .3-D  | 카드·Galaxy 예산·강도 보고 #66/#75(옛 #70 이관)                        | Sol 통합: 갤러리/E2E 기준샷, device-test 절차, `ai-tuning.md`; 카드·AI 담당 산출물 인계                                                                              |

`settings/**`는 .2-B→.3-A→.3-B, `solo.svelte.ts`는 .2-A→.2-C→.3-B→.3-C, `session.ts`는 .2-A→.2-C→.3-C 순으로 소유한다. 공용 갤러리 기준샷은 각 기능 병합 뒤 .3-D가 갱신한다. 규칙 항목의 정본은 [rules-commercial §12.7](docs/research/rules-commercial.md#127-사용자-설정으로-노출할-토글)과 [spec FR-21](spec.md)이다.

#### 공유 파일 인계

| 공유 경계                                             | 남은 소유권·순서                                                                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p2p/common.ts`                                       | .2-B가 preset 판별을 완료해 .3-A 진동 담당에게 인계한다. #44 로비 준비는 별도 protocol 계약 뒤 반영한다.                                                              |
| `App.svelte`·`routes/Game.svelte`·`SoloSetup.svelte`  | 메뉴/Back 작업→.2-A Game 밀기→.2-C App/Game 라우팅→.3-B SoloSetup AI UX. 같은 파일을 동시에 수정하지 않는다.                                                          |
| `bridge/bridge.ts`·Android Back/셸                    | 메뉴/Back 계약을 .3-C가 이어받아 저장 오류·복귀를 처리한다. 릴레이 서버/벡터는 #75로 이관된 #61 담당 이력에 따른다.                                                   |
| `styles/tokens.css`·`anim/*`·카드                     | HUD 층위 토큰과 anim `--dur-*` 예약을 .1-A가 소비한 뒤 .3-D가 의미 색을 맡는다. 카드 토큰·비율/props는 카드 담당 산출물과 먼저 맞추고 전체 파일 포맷을 겹치지 않는다. |
| `p2p/{guest,link}`·`GuestApp`·`protocol/src/guest.ts` | 재접속/시계 계약 뒤 .2-A guest 밀기→.2-C 정산. #44 ready는 별도 protocol 계약을 선행한다.                                                                             |
| `settings/**`·`Settings.svelte`·저장소                | anim 속도 기본값→.2-B 규칙→.3-A 피드백→.3-B AI 기본값. `current.svelte.ts`는 .2-B→.3-C, `storage/local.ts`는 .3-C 전용이다.                                           |
| `packages/ai/**`·`tools/sim/**`·관련 문서             | 확정된 #56 기준→#66 강도→#67 머니. `ai-tuning.md`·`money-model.md`와 결과 표를 함께 인계하고 공개 API만 사용한다.                                                     |
| 공용 E2E·갤러리                                       | 기능 담당이 전용 테스트를 소유하고 .2-D/.3-D가 선행 병합 뒤 공용 기준샷·통합 검증을 맡는다.                                                                           |

- 카드·UI 결정은 §9 D1·D2, 규범은 spec §6과 UI 규범이다. 끝난 리뷰·통합·수정 트랙은 위 상태 표와 리뷰 이력으로 대체한다.
- 작업은 워크트리·브랜치·PR로 격리한다. 위임 시 Codex(Paseo)를 기본으로 판단·리뷰는 Astra, 구현은 Sol, 저위험 정리는 Luna를 배분하며 Claude 서브에이전트는 사용자 명시 때만 쓴다. 병합은 CI 녹색 + reviewer 판정 뒤 사람 또는 사람이 지시한 오케스트레이터만 수행한다.

---

## 3-2. 진행 매트릭스 (기본 2026-09-29 main `daa5e7d`; RP-07 2026-09-30 `e33f044` 기반 갱신)

### 재생 지연 복구 근거 (NF-03·AC-06·NP-03, 기준 main `fc02b1c`)

- 사용자 실측 v0.3.1 `4e536e1` 빠름 6표본은 [PDR-01](docs/device-test/results.md#pdr-01--사용자-제공-v031-부분-관측)에 최소 익명 증거만 기록했다. full play618/619/683/702ms 네 경로와 prompt223/choose462를 섞어 수용 통과로 판정하지 않는다. NF-03 미검증·AC-06 부분 상태 유지.
- `game/playback.recovery.test.ts`: 합성 도착50/150/300ms에서 reset 뒤 stale snapshot/선택창·효과, dispose 뒤 읽기 대기, reset→burst를 수정 전 Chromium/WebKit10실패로 재현했다. generation 소유권으로 커밋·이벤트·계측·정산을 보호하고 대기를 스킵해 회수한다. 정상 FIFO와 #185 milestone 큐는 보존한다. 복구 없는 빈 이벤트 snapshot/정산 표식은 기존 FIFO 순서를 유지한다. #191~195의 저장/호스트 metadata·timer audit와 다른 renderer 재생 수명 결함이다.
- 기존 100개 TurnTiming·400줄/줄2000자 진단 버퍼를 재사용한다. enqueue/queue/replay/snap/첫 DOM commit과 단계12개 이하를 묶음당 한 줄로 기록한다. 상대 턴은 수신 이후로 표시하며 내 AC-06 표본에 넣지 않는다. 프레임별 수집·상시 폴링·외부 분석·wire 확장 없음. 취소 묶음은 기록하지 않는다.
- `e2e/playback-delay.spec.ts`: 고정 match-capture에서 합성 main-thread100ms 정지·메뉴·홈 복귀 뒤 카드 중복 없음/권위 바닥과 일치/입력 unlock을 Chromium/WebKit에서 검증한다. 합성 지연은 Singapore RTT가 아니며 자동 결과는 실기기 성공이 아니다.
- 사용자 착지/바닥 이동의 읽기·계산 재현: CardPlayed는 독립 바닥 셀을 커밋하고 tick 뒤 새 셀로 FLIP한다. Matched는 강조이며 대상 위 겹침을 만들지 않는다. 현행 동일 월 인접 독립 셀·48px·5×3 규범과 관련된 설계 경계다. 순수 floorLayout 합성 월4=[14],월8=[28,29],월10=[37]에13 추가(360×300,48px)에서 기존28:5→8,29:6→9,14:8→6 이동을 재현했다. 고정 match-capture 초기 바닥에서는 기존 이동0,낸13의 셀5/대상14의 셀6이다. 실제 사용자 장면 동일 원인 판정은 보류. 안정 슬롯/겹침 설계는 Floor 소유자·연구 담당 조율 후이며 이 PR은 Floor/Board를 수정하지 않는다.
- 밀기 읽기 근거: Game의 settlement 또는 controller.pushDecision 표시와 solo/host/guest getter는 playback 완료를 조건으로 삼지 않는다. 정산은 playback 큐로 늦추지만 밀기 pending은 권위 상태에서 즉시 노출될 수 있다. 고/스톱과 다른 경계이며 UI 소유자에게 넘긴다. 이 PR은 임의 delay·deadline/타이머 정책을 바꾸지 않는다. main #188 `75b4df1`의 Board inert는 통합 시 보존해야 한다.
동일 fixture 자동 비교(실기기 아님): Chromium 빠름3경로, 경로마다 워밍업1+7표본, 직렬/포트4227. 기준 `fc02b1c`의 playback/choreo만 임시 복원한 실행 p50 no-match379/match-capture530/banner387ms, 수정본380/530/380ms. 계획340/500/340ms 동일. 21표본 전체 p50 387→380ms, 두 번째 최대533→530ms. 순서는 수정본→기준본이며 미세 차이는 스케줄링 잡음과 분리하지 못한다. 유의미한 성능 향상·계측 overhead0을 주장하지 않는다. 추가 계측의 두 clock 읽기/단계·bounded 배열과 로그 한 줄만 추가했으며 프레임/longtask 감시·read/write 최적화는 도입하지 않았다. 기준에서 새 회귀10실패→수정 뒤14통과, 기존 playback/anim 포함96통과. 필수 검사 lint/check·Node563·browser742·web build·smoke378·Android3작업 통과(통합 전 기준). browser 첫 실행은 공유63315포트 점유로 시작 실패했고 다음 실행 정상 완료했다. 통합 main 검사는 별도 최종 결과로 갱신한다.

main `e2fdb99` 통합 후 #188 inert·초점 복원 코드를 그대로 보존했다. lint/check·Node563·browser754·Android 통과. 로컬 smoke는380통과/2실패/의존 timing2미실행이며, 실패2건(기존 auto-choices의 autoSeen0, p2p의 timeoutFrames0)은 파일 수정 없이 표적 재실행2통과했다. 남은 timing2검사도 통과했다(p50=393ms/두 번째 최대627ms). 초반 browser 검사 부하가 겹쳤으므로 이 실행은 앞의 A/B 통계에 합치지 않는다. 통합 head `9bf51d8`의 CI3작업은 모두 통과했으며 이후 테스트 보강 head의 CI는 별도로 확인한다. 진단 append 전용 합성 시험(문자열 준비·DOM·실기기 제외, 워밍업1+7)은 Chromium p50=시계해상도 아래/max약0.1ms, WebKit 모두 시계해상도 아래였다. 0ms는 비용0 증명이 아니다. 이 시험은 로그 버퍼 append만 측정하며 전체 계측 비용과 실제 UI 소비 부하는 별개다.

### 선택창 회전 잠금 (#155, UX-07·UX-24)

| ID | 상태 | 코드·자동 검증 근거 | 남은 항목 |
|---|---|---|---|
| UX-07 / UX-24 | 회전 중 배경 잠금 수정·자동 검증 | `Board.svelte`가 모바일 가로 잠금과 선택창 잠금을 한 곳에서 합성하고, `prompt-focus.ts`는 선택창 상태와 초점만 관리한다. `Board.input.test.ts`와 `e2e/layout.spec.ts`에서 Chromium·WebKit 회전·배경 hit-test·초점·입력을 검사한다. #188 독립 리뷰 P1은 퇴장 중 재활성 창의 복원값을 false로 정정하여 수정하며, 고/스톱·흔들기 300→30→350ms 반전의 동일 노드·초점·실제 클릭·Enter 입력 회귀 검증을 추가한다. | 같은 리뷰어의 재등장 경계 재검토 대기. Galaxy/iPhone 실기기 회전 및 VoiceOver/TalkBack은 `docs/device-test/procedure.md`에 따라 사람이 검증한다. |

### 원격 대전 RP-03A/B 상태 (2026-09-29, FR-RP-07·NF-RP-06)

| ID                | 상태 | 코드·검증 근거                                                                                                                                                                                                                                                                                                              | 남은 항목                                                                                 |
| ----------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| RP-03A / NF-RP-06 | 부분 | `docker/relay/Dockerfile`, `compose.relay.yaml`, `tools/relay/create-credentials.ts`·README. Docker 컨텍스트 허용 목록과 `docker/relay/check-context.sh` canary export를 CI에 추가. `feat/relay-public` 임시 병합 이미지에서 비root/읽기 전용/루프백 기동, 로컬 `/health`·`/version`·정적 release 경로·Compose healthy 확인 | RP-02가 main에 병합된 뒤 재검사. Galaxy APK 동시 release·사람 PC 검증 대기                |
| RP-03B / FR-RP-07 | 부분 | `tools/relay/start.cmd`, `stop.cmd`, `relay.ps1`, `write-qr.ts`; Compose config·QR 생성·문서 점검. 시작 프로세스 독립 추적·실패 정리와 marker 없는 종료 탐지를 추가                                                                                                                                                         | Windows 수동 시작·종료·Funnel·재부팅과 공개 health 검증 대기. 앱의 3단계 UI는 RP-05C 범위 |

위 상태는 PC 운영 도구만 다룬다. FR-RP-07 전체 수용과 NF-RP-06 wire 호환 판정은 아직 하지 않는다. [사람 검증 칸](docs/device-test/remote-play.md#rp-03ab-pc-운영-검증-기록-칸-사람-실행)에 결과 제공 후 기록한다.

후속 main `8d2911b`(#152 문서/계획 이관, #154 sim 통계/보고 분리)을 병합했다. 아래 코드 대조·실행 수치는 `daa5e7d` 기준으로 보존하고, 삭제 문서 링크와 계획 소유권은 #152 정본으로 연결한다. AI-04·AC-03 행의 #167 판정은 별도로 `9f778f3` 소스에서 측정했으며 상태는 부분·P0 미완이다. 이번 병합에서는 링크 검사·lint를 수행하며 요구사항 완료율은 바꾸지 않는다.

**집계 단위:** spec의 FR/NF/NP/AI/MN/AC 표는 93행이지만 고유 ID는 **86개**다. FR-16·NP-02·NP-03·NP-05·NF-05·FR-46(49·50 병기)의 개정안 재등장 6행과 NP-10 경계 표제 1행은 중복이다. 타이머 신규 ID FR-51~53·NP-10을 포함한 86개를 아래에서 빠짐없이 평가하고, 중복 7행은 뒤의 개정안 대응표로 추적한다. 보조 분모는 타이머 신규 ID를 제외한 기존 82개다. FR-51의 기본10초·호스트 끄기/조정·솔로 제외는 이미 사용자 확정이며, 이를 미확정으로 분류하는 뜻이 아니다. RL/UX의 별도 하위 규칙은 이번 ID 집계 밖이며 FR-10·NF-08 등에서 검증 근거로 연결한다.

**판정:** 완료=해당 범위의 구현·검증 근거 확인, 부분=일부 구현 또는 정량 기준 미달, 미구현=사용 가능한 기능 경로 없음, 미검증=구현은 있으나 필수 측정/실기기 증거 없음. 테스트 파일의 존재만으로 수치 기준이나 실기기 통과를 인정하지 않는다. 진행 중 PR #104의 코드는 기준 SHA에 없으므로 완료에 넣지 않는다. #151의 자동 선택·자동 진행·국진 설정은 코드와 회귀 테스트를 대조해 반영했다. 부분에 임의의 50% 가중치를 주지 않는다.

경로 약어: E=`packages/engine`, A=`packages/ai`, P=`packages/protocol`, W=`packages/web`, S=`tools/sim`, K=`android/app/src/main/kotlin/com/kywoo26/p2pgostop`, KT=`android/app/src/test/kotlin/com/kywoo26/p2pgostop`. `src/`·`test/`·`e2e/` 경로는 각 접두사의 실제 파일이다. 실기기 열의 `—`는 순수 로직/자동 검증 범위, `미`는 현재 정식 UI·기기의 사람 검증 없음, `M0`는 [사람 제공 스모크 기록](docs/device-test/results.md)만 확인됨을 뜻한다. `M0`도 현재 게임 전체 통과는 아니다.

### 기능 (FR)

| ID    | 상태   | 코드·검증 근거                                                                                                                                                                                                            | 남은 항목·추적                                                                                                                   | 실기기 |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-01 | 완료   | K/HotspotService.kt·net/IpSelector.kt; KT/HotspotSessionTest.kt·net/IpSelectorTest.kt                                                                                                                                     | 현재 UI 통합은 AC-08에서 별도 판정                                                                                               | M0     |
| FR-02 | 완료   | K/MainActivity.kt, W/src/routes/HostRoom.svelte의 실패·주소 모드; KT/HotspotModelTest.kt, W/src/bridge/bridge.test.ts                                                                                                     | 현장 권한/폴백 재검증 #75                                                                                                        | 미     |
| FR-03 | 완료   | K/qr/WifiQr.kt, W/src/p2p/qr.ts·routes/HostRoom.svelte; KT/qr/WifiQrTest.kt, W/src/p2p/p2p.test.ts의 T:WPA                                                                                                                | 새 UI QR 스캔은 AC-08/09                                                                                                         | M0     |
| FR-04 | 완료   | W/src/p2p/role.ts·routes/GuestJoin.svelte, K/server/SmokeServer.kt; W/e2e/p2p-screens.spec.ts의 비루프백 진입                                                                                                             | 현재 1판·복귀는 AC-09                                                                                                            | M0     |
| FR-05 | 완료   | W/src/routes/HostRoom.svelte·GuestApp.svelte; W/e2e/p2p-screens.spec.ts 대기실, p2p.spec.ts 20판                                                                                                                          | 준비 토글은 FR-06 별도                                                                                                           | 미     |
| FR-06 | 미구현 | HostRoom.svelte는 접속 여부로 시작, 로비 준비 토글 없음(판 사이 ready만 P/src/host.ts에 존재)                                                                                                                             | 준비·미준비 시작 경고 #44                                                                                                        | 미     |
| FR-07 | 완료   | P/src/host.ts, K/server/SmokeServer.kt; KT/server/RelayScenarioTest.kt, W/e2e/reconnect.spec.ts 4001 교체                                                                                                                 | 릴레이 경미 경계 추가 검증 #75                                                                                                   | —      |
| FR-10 | 완료   | E/src/reduce.ts·turn.ts·capture.ts·score.ts·settle.ts; E/test/vectors.test.ts 및 vectors/*.json                                                                                                                           | §4의 확정 규칙 기준. 미션·가위바위보 P2 옵션은 FR-21의 미지원으로 분리                                                           | —      |
| FR-11 | 완료   | P/src/host.ts의 apply/수신 검증; P/test/m4.test.ts의 좌석0·합법 수, session.test.ts                                                                                                                                       | —                                                                                                                                | —      |
| FR-12 | 부분   | E/src/preview.ts, W/src/ui/Board.svelte·Hand.svelte; W/src/ui/Board.test.ts                                                                                                                                               | 합법/매칭/선택 시각 구별·초점 동등 #80·#115                                                                                      | 미     |
| FR-13 | 완료   | E/src/turn.ts·legal.ts, W/src/ui/TargetModal.svelte·game/controller.ts; W/src/ui/Board.prompts.test.ts·game/controller.test.ts, W/e2e/auto-choices.spec.ts 동등 대상 최소 ID 1회 선택, PR #151                            | 비동등 대상은 수동, 동등 대상만 자동; #110 닫힘                                                                                  | —      |
| FR-14 | 부분   | W/src/ui/GoStopModal.svelte의 steps·상한·상대 점수/피, P/src/view.ts; W/src/ui/Board.prompts.test.ts                                                                                                                      | 족보별 현재 점수 분해와 위험/상세 표시 보강 #79·#82 (기존 #116은 #79 통합)                                                       | 미     |
| FR-15 | 완료   | E/src/score.ts·rules.ts, W/src/routes/Settings.svelte 국진 선택·세션 중 잠금, W/src/p2p/common.ts; W/src/routes/Settings.test.ts, W/e2e/auto-choices.spec.ts “국진 매번 묻기 설정은 새로고침 뒤에도 복원된다”, PR #151    | #113 구현 완료로 닫힘; 현재 실기기 확인은 #75                                                                                    | 미     |
| FR-16 | 완료   | W/src/game/session.ts·ui/Board.svelte, P/src/host.ts; W/e2e/push.spec.ts의 사람/CPU·호스트/게스트 밀기·받기, PR #100                                                                                                      | 기존 필수 결정은 수동 유지(#151 자동 진행 제외). 밀기 뒤 상대 이탈 환급 정책은 #30 재개(v0.2.3), 타이머는 #123                   | —      |
| FR-17 | 부분   | W/src/settings/settings.svelte.ts `confirmDelay`·routes/Settings.svelte 토글, ui/Hand.svelte·Board.svelte·routes/Game.svelte; W/src/ui/Board.input.test.ts. 한 번 탭 즉시, 옵션 켬일 때 120ms 재탭 취소·busy/뷰 교체 취소 | 실기기 검증 #75                                                                                                                  | 미     |
| FR-18 | 완료   | W/src/routes/Settlement.svelte·game/session.ts, E/src/ledger.ts; W/src/game/display.test.ts·session-push.test.ts, W/e2e/push.spec.ts                                                                                      | P2P 표시 세부 추가 단언은 #75에 유지                                                                                             | —      |
| FR-19 | 부분   | W/src/routes/Records.svelte·game/records.ts; W/src/game/display.test.ts                                                                                                                                                   | P2P 기록 연결·순액/즉시정산 대조 #44 (기존 #63·#134 통합)                                                                        | 미     |
| FR-20 | 완료   | E/src/rules.ts PRESETS, W/src/routes/Settings.svelte; E/test/rules.test.ts, W/src/game/display.test.ts                                                                                                                    | 미션 P2 제외                                                                                                                     | —      |
| FR-21 | 부분   | E/src/rules.ts의 RuleOptions·UNIMPLEMENTED_RULES, W/src/settings/rule-options.ts·ui/RuleSettings.svelte·routes/Settings.svelte; W/src/routes/Settings.test.ts·e2e/settings-rules.spec.ts                                  | §12.7 22개 세션 규칙+2개 로컬 행 매핑, 프리셋/사용자 지정/복원·welcome 전파. 미션·가위바위보 엔진 미구현 및 자동치기 실행은 후속 | 미     |
| FR-22 | 부분   | W/src/routes/Settings.svelte·HostRoom.svelte, A/src/money-defaults.ts; A/test/money-defaults.test.ts, W/e2e/settings-rules.spec.ts                                                                                        | 수동 잔액·단위 UI 구현; 기본값 재산정 #67                                                                                        | 미     |
| FR-23 | 부분   | W/src/settings/settings.svelte.ts `effectIntensity`·`sound`·`vibrate`·`confirmDelay`, routes/Settings.svelte·game/sound.ts; W/src/settings/rule-options.test.ts·e2e/settings-rules.spec.ts                                | 기기별 UI·기존 진동 저장값 이행; 취소 지연 입력은 #159, 실제 효과 강도·음색은 #49·#117                                           | 미     |
| FR-24 | 완료   | W/src/game/session.ts·p2p/host.svelte.ts, P/src/host.ts welcome, Settings.svelte의 새 세션 안내; W/e2e/navigation.spec.ts·solo.spec.ts                                                                                    | 개별 미노출 설정은 FR-21/23                                                                                                      | —      |
| FR-30 | 완료   | W/src/game/diagnostics.ts·log.svelte.ts·routes/Diagnostics.svelte, K/BridgeLogs.kt·log/LogReport.kt; P/test/m4.test.ts, KT/BridgeLogsTest.kt·log/LogReportTest.kt                                                         | 현재 공유 시트 체감 재확인 #75                                                                                                   | M0     |
| FR-31 | 완료   | W/src/lib/build-info.ts, K/DeviceInfo.kt; W/e2e/smoke.spec.ts의 홈 빌드 식별자                                                                                                                                            | —                                                                                                                                | —      |
| FR-32 | 미검증 | K/Diagnostics.kt에 권한·Wi-Fi·포트·클라이언트·배터리, MainActivity.kt 진단 UI; W/src/routes/Diagnostics.svelte                                                                                                            | 실제 권한/배터리 상태와 표시 대조 #75, 직접 전 항목 자동 테스트 없음                                                             | 미     |
| FR-33 | 미구현 | E/src/replay.ts와 W/src/game/session.ts 액션 보존은 존재하나 JSON 내보내기 UI 없음                                                                                                                                        | 후순위 보류(종료 #71); 재개 시 새 추적 필요, 요구사항 삭제 아님                                                                  | —      |
| FR-40 | 부분   | W/src/ui/SeatBar.svelte·Board.svelte·seat-stats.ts; W/src/ui/Board.test.ts 상시 정보                                                                                                                                      | 양 좌석 같은 열·메뉴 예약·배수 미확인 표시 #79, PR #104 진행                                                                     | 미     |
| FR-41 | 부분   | W/src/ui/Hand.svelte·Floor.svelte·Board.svelte, E/src/preview.ts; W/src/ui/Board.test.ts                                                                                                                                  | 초점/터치·세 종류 표식 구별 #80·#115                                                                                             | 미     |
| FR-42 | 부분   | W/src/ui/seat-stats.ts는 광/고도리/최대 단/피 진행만; W/src/game/display.test.ts                                                                                                                                          | 광 문턱·개별 단·부족 카드/가치 API→전달→표시 #81·#87·#82                                                                         | 미     |
| FR-43 | 미구현 | E/src/settle.ts 박 정산만 존재, W/src/ui/Board.svelte에 양방향 조건 설명 없음                                                                                                                                             | 현재 박 조건 설명 #81·#87·#82                                                                                                    | 미     |
| FR-44 | 부분   | W/src/ui/Board.svelte 합법 폭탄/흔들기, E/src/interaction-assist.ts; E/test/interaction-assist.test.ts                                                                                                                    | 조건부 사건 설명·표식 연결 #80·#81·#82·#115                                                                                      | 미     |
| FR-45 | 부분   | W/src/ui/GoStopModal.svelte·Board.svelte, P/src/view.ts; W/src/ui/Board.prompts.test.ts                                                                                                                                   | 정적 대기/위험 설명·뷰 변경 수명 통합 #82                                                                                        | 미     |
| FR-46 | 부분   | W/src/settings/settings.svelte.ts `hintLevel`(기본 basic)·routes/Settings.svelte·e2e/settings-rules.spec.ts 선택·복원, W/src/game/assist.ts·ui/Board.svelte 로컬 설정 소비·기본 표식 데이터 반영 #80·#115                 | 카드 상태 CSS는 디자인 리드 소유; 상세 설명·늦은 결과 폐기 #81/#82                                                               | 미     |
| FR-47 | 부분   | E/src/view.ts·interaction-assist.ts 공개 카드 최소 입력, P/src/view.ts; W/src/game/assist.ts 솔로 PlayerView 직접 계산·P2P BoardView wire 필드 투영·test/assist.test.ts 은닉                                              | 추가 힌트의 DOM/ARIA/로그 동일성 #87·#143·#90                                                                                    | —      |
| FR-48 | 부분   | E/src/preview.ts·interaction-assist.ts, P/src/view.ts; W/src/game/assist.ts·ui/Board.svelte 기본 매칭/확정/행동 상태 데이터                                                                                               | 카드 상태 CSS·상세 순수 API·200%·초점 통합 #81·#51                                                                               | 미     |
| FR-49 | 미구현 | A/src/policies/ismcts.ts는 CPU 전용, W/src/settings/settings.svelte.ts에 조언 opt-in/요청 경로 없음                                                                                                                       | 솔로 전용 조언·P2P 계산 차단 회귀 #90                                                                                            | —      |
| FR-50 | 부분   | W/src/game/session.ts·solo.svelte.ts·storage/session-schema.ts에 실제 손패 표식 표시 기반 단조 hintUsage 훅·판 기록, session-save.test.ts의 v0/v1 복원→정산 미확인 보존 #80·#115                                          | 옛 기록 미확인 UI·AI 조언 사용 #90·#44                                                                                           | —      |
| FR-51 | 완료   | W/src/routes/HostRoom.svelte·p2p/host-save.ts의 로비 끄기/5~60초·별도 저장, P/src/messages.ts welcome; W/e2e/p2p.spec.ts 사전 표시; W/src/p2p/wiring.test.ts·e2e/settings-rules.spec.ts 로비 welcome 단일 전파 #178 | 실기기 로비·저장 확인 #75                                                                                                        | 미     |
| FR-52 | 완료   | W/src/ui/Board.svelte·SeatBar.svelte, routes/Game.svelte의 HUD·프롬프트·메뉴·판 정보 시계; W/e2e/p2p.spec.ts                                                                                                              | 최소 높이·Safari 음성 안내 실기기 확인 #75                                                                                       | 미     |
| FR-53 | 완료   | P/src/timer-policy.ts·host.ts·verify.ts 초과 행동/결과 기록·검증; P/test/timer.test.ts, relay-dev/test/session-relay.test.ts, W/e2e/p2p.spec.ts                                                                           | 실기기 결과 확인 #75                                                                                                             | —      |

### 프로토콜 (NP)

| ID    | 상태 | 코드·검증 근거                                                                                                                                                 | 남은 항목·추적                                                    | 실기기 |
| ----- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| NP-01 | 완료 | P/src/transport.ts·codec.ts, W/src/p2p/link.ts; P/test/protocol.test.ts, W/src/p2p/wiring.test.ts                                                              | —                                                                 | —      |
| NP-02 | 완료 | P/src/messages.ts·host.ts·guest.ts, W/src/p2p/guest.svelte.ts; P/test/schema-contracts.test.ts·session.test.ts, W/e2e/reconnect.spec.ts 응답 유실; W/src/p2p/wiring.test.ts·e2e/settings-rules.spec.ts 단일 welcome #178 | v3 결정 계약은 NP-10                                              | —      |
| NP-03 | 완료 | P/src/host.ts·guest.ts; P/test/session.test.ts·timer.test.ts, W/e2e/p2p.spec.ts 토큰 복귀·순번·시계                                                            | —                                                                 | —      |
| NP-04 | 완료 | P/src/messages.ts·guest.ts 버전 거부; P/test/m4.test.ts·session.test.ts                                                                                        | —                                                                 | —      |
| NP-05 | 완료 | P/src/guest.ts ping·host.ts 60초 감시·2초 마감 확인; P/test/session.test.ts·timer.test.ts                                                                      | —                                                                 | —      |
| NP-06 | 완료 | P/src/crypto.ts·verify.ts·host.ts·guest.ts; P/test/m4.test.ts SHA 벡터·20판, session.test.ts 검증                                                              | —                                                                 | —      |
| NP-07 | 완료 | P/src/codec.ts·schema.ts; P/test/protocol.test.ts 16KB/64KB 구별, E/test/properties.test.ts 뷰 크기                                                            | 로그/원장 페이지 64KB 예외는 현행 계약                            | —      |
| NP-08 | 완료 | K/server/SmokeServer.kt, android/app/build.gradle.kts SDK36, W/scripts/check-bundle.mjs; KT/NoExternalUrlTest.kt                                               | —                                                                 | —      |
| NP-09 | 완료 | P/src/codec.ts·host.ts, W/src/game/diagnostics.ts, K/log/LogBuffer.kt·BridgeLogs.kt; KT/log/Utf8Test.kt·BridgeLogsTest.kt, P/test/m4.test.ts                   | —                                                                 | M0     |
| NP-10 | 완료 | P/src/host.ts·guest.ts·messages.ts·schema.ts의 단일 시계/결정 ID/확인/중단·복귀; P/test/timer.test.ts, relay-dev/test/session-relay.test.ts, W/e2e/p2p.spec.ts | 렌더러 재시작의 clockUnknown은 수동 대기·판 무효·종료, 실기기 #75 | —      |

### 원격 대전 RP-07 자동 검증 상태 (별도 분모)

§13의 RP 접미 ID는 기존 86개 집계와 분리한다. `packages/web/e2e/remote-play.spec.ts`는 공개 relay-dev를 실제 `dist` 정적 경로와 HTTPS 앞단으로 실행해 호스트·게스트를 별도 브라우저 컨텍스트로 검사한다. 인증·제한·TTL의 세부 반례는 `packages/relay-dev/test/public-*.test.ts`, 연결 복귀는 `packages/web/src/p2p/`의 `test:net`, UI 단위 경계는 기존 `remote-host*`·`remote-guest*` E2E를 함께 근거로 삼는다. **자동 검증 완료는 이 환경의 범위만 뜻한다.** Windows Funnel·Galaxy·iPhone Safari·Mac 실기기, 2시간 유지·PC 재부팅 결과는 제공되지 않아 수용 완료로 판정하지 않는다.

| ID | 상태 | 자동 검증 근거와 남은 사람 검증 |
|---|---|---|
| FR-RP-01 | 자동 검증 완료·실기기 미검증 | 원격 선택·설정·health·방 생성, AC-RP-01 E2E. Galaxy LOHS 경계는 사람 절차 |
| FR-RP-02 | 자동 검증 완료·실기기 미검증 | 정적 초대·fragment 제거·코드 승인/거절, AC-RP-01/02 E2E. Android 공유 시트·QR 스캔은 사람 절차 |
| FR-RP-03 | 자동 검증 완료·실기기 미검증 | 양쪽 로비·좌석과 새 방, AC-RP-01/03 E2E. 상대 신원 확인은 사람 절차 |
| FR-RP-04 | 자동 검증 완료·실기기 미검증 | reload/resume·snapshot·4001·재시작 뒤 새 방, AC-RP-01/02/03 E2E. 실제 망 이동은 사람 절차 |
| FR-RP-05 | 자동 검증 완료·실기기 미검증 | 호스트 부재·방 소실·만료 안내, AC-RP-02/03 E2E와 relay TTL 테스트. 10분 실시간 대기는 사람 절차 |
| FR-RP-06 | 구현·자동 검증 완료(실기기 미검증) | RP-06 단일 BoardView/액션, 넓은 화면·키보드·200% Mac Chromium/WebKit E2E와 모바일 레이아웃 회귀; RP-07 동일 정적 웹·게임·정산 AC-RP-01 E2E. Mac Safari/Chrome·iPhone 실기기 조작은 사람 절차 |
| FR-RP-07 | 자동 검증 완료·실기기 미검증 | health→방→공유, AC-RP-01 E2E와 기존 안내 테스트. Windows start/stop·Funnel은 사람 절차 |
| FR-RP-08 | 자동 검증 범위 완료·실기기 미검증 | RP-04A/B Android JVM gate와 AC-RP-04 웹 회귀. Galaxy LOHS/FGS/LAN 수신은 사람 절차 |
| NP-RP-01/02 | 자동 검증 완료·실기기 미검증 | 공개 역할 인증·실제 브라우저 방 생성/접속, AC-RP-01/02 E2E와 `public-auth.test.ts`; 실제 Funnel TLS는 사람 절차 |
| NP-RP-03/04 | 자동 검증 완료·실기기 미검증 | 링크 claim/재사용·코드 승인/거절·위조 토큰, AC-RP-02 E2E와 `public-net.test.ts`; 실제 QR 전달은 사람 절차 |
| NP-RP-05/06 | 자동 검증 완료·실기기 미검증 | 4001·프레임 폭주·짧은 TTL, AC-RP-02 E2E와 `public-limits.test.ts`; 장시간 유지·단절은 사람 절차 |
| NP-RP-07 | 자동 검증 완료·실기기 미검증 | relay 프로세스 재시작 뒤 옛 방 거부·새 방, AC-RP-03 E2E와 `public-process.test.ts`; 운영 PC 재시작·로그 점검은 사람 절차 |
| NP-RP-08 | 자동 검증 완료·실기기 미검증 | 공개 health/정적 release·원격 밖 요청 경계, AC-RP-01/04 E2E와 `static.test.ts`; Funnel health는 사람 절차 |
| NF-RP-01~06 | 자동 검증 범위 완료·실기기 미검증 | 인증·상한·무로그·오프라인 웹·hello 버전은 기존 서버/웹 테스트와 AC-RP-01~04/06 E2E. 비용·지연·동일 APK artifact·실기기 품질은 사람 절차 |
| AC-RP-01 | 자동 검증 완료·실기기 미검증 | 호스트/게스트 두 브라우저 한 판·정산·다음 판, 링크·정적 경로와 resume. 별도 망/Funnel/2시간은 사람 절차 |
| AC-RP-02 | 부분 자동 검증·실기기 미검증 | 승인/거절·위조/만료/재사용·4001·폭주와 좌석 보존 E2E/relay 단위 검사. requestId 경합 중 수·정산 중복 미검증 |
| AC-RP-03 | 부분 자동 검증·실기기 미검증 | 진행 중 호스트 부재 시 입력·원장 보존과 복귀, 중계 재시작·새 방 E2E. 앱 background·진행 중 방/host TTL 만료·quota 실패의 게임 결과 및 PC/실기기 복귀 미검증 |
| AC-RP-04 | 부분 자동 검증·실기기 미검증 | 같은 문서에서 종료 후 외부 HTTP·WS 재시도 0, 솔로 첫 판 E2E. LAN 첫 실행·Galaxy 기내 동일 APK/LOHS 미검증 |
| AC-RP-05 | 사람 절차 작성·실기기 미검증 | `docs/device-test/remote-play.md` 결과 칸 공란. 자동 테스트로 대체 불가 |
| AC-RP-06 | 자동 검증 범위 완료·실기기 미검증 | health→방 안내·wire 불일치 hello 차단, E2E와 기존 UI/Android 테스트. start/stop 반복·PC 불통·Mac 조작은 사람 절차 |

### AI·머니 (AI/MN)

| ID    | 상태   | 코드·검증 근거                                                                                                                                                                                                  | 남은 항목·추적                                                                                                   | 실기기 |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ |
| AI-01 | 완료   | A/src/knowledge.ts·types.ts는 PlayerView 입력; A/test/info-hiding.test.ts                                                                                                                                       | —                                                                                                                | —      |
| AI-02 | 완료   | A/src/push.ts·match.ts·policies/, W/src/game/ai-core.ts; A/test/push.test.ts·policies.test.ts, W/e2e/push.spec.ts CPU Worker, PR #56·#100                                                                       | —                                                                                                                | —      |
| AI-03 | 완료   | A/src/factory.ts·policies/easy.ts·greedy.ts·ismcts.ts; A/test/policies.test.ts·ismcts.test.ts                                                                                                                   | 구조 3단 구현. 실력/시간 합격은 AI-04/05 별도                                                                    | —      |
| AI-04 | 부분   | A/src/policies/ismcts.ts, S/results/gostop/after-normal.json·after-easy.json, S/results/ac03-retry/candidate-normal.json·candidate-easy.json(각2,000판), [PR #167](https://github.com/kywoo26/p2p-gostop/pull/167) | #66 재도전: 보통 **65.01% 미확정**(95% 구간 62.91–67.10%가 65% 포함), 쉬움 **76.87% 미달**(목표 80%); P0 미완 | — |
| AI-05 | 미검증 | W/src/workers/ai.worker.ts·game/ai-client.ts, A/test/ismcts.test.ts 기한 제한, S/results/gostop/timing-after.json                                                                                               | Galaxy≤1초·iPhone≤1.5초 실측, Worker 실패 UX #66·#75                                                             | 미     |
| AI-06 | 완료   | A/src/policies/ismcts.ts·rollout.ts, A/src/weights/default.json; A/test/ismcts.test.ts 고/스톱 EV·과감성, PR #106 결과 JSON                                                                                     | 체감/독립 시드 후속은 #66 유지                                                                                   | —      |
| AI-07 | 완료   | A/src/weights/default.json·src/weights.ts, S/src/gostop.ts; A/test/weights.test.ts, S/results/gostop/*.json·docs/ai-tuning.md §8                                                                                | 강도 합격과 구별                                                                                                 | —      |
| AI-08 | 완료   | A/src/rng.ts·policies/ismcts.ts; A/test/policies.test.ts·ismcts.test.ts 반복 상한 결정성                                                                                                                        | 동일 시드·고정 반복 예산 기준(실시간 마감은 실행 속도에 영향받음)                                                | —      |
| AI-09 | 미구현 | A/src/weights.ts의 내부 조정값은 있으나 사용자 성향·실수 확률 옵션 없음                                                                                                                                         | P2 보류; 재개 시 #66에서 별도 범위 결정                                                                          | —      |
| MN-01 | 완료   | E/src/ledger.ts, P/src/ledger.ts·host.ts; P/test/m4.test.ts 20판 제로섬, W/src/game/session.test.ts                                                                                                             | —                                                                                                                | —      |
| MN-02 | 완료   | E/src/ledger.ts, P/src/host.ts·guest.ts; P/test/session.test.ts 좌석별 파산/종료·재충전, W/src/game/display.test.ts                                                                                             | 상태 화면 추가 회귀는 #44                                                                                        | —      |
| MN-03 | 부분   | A/src/money-defaults.ts, S/src/runner.ts·stats.ts; A/test/money-defaults.test.ts, S/test/money-doc.test.ts                                                                                                      | 프리셋별≥10,000판·최신 AI 재산정·도움말 #67 (기존 각 프리셋3,000판 및 프리셋 기본값 구현을 완료로 확대하지 않음) | —      |
| MN-04 | 완료   | A/src/money-defaults.ts, W/src/routes/Settings.svelte; A/test/money-defaults.test.ts, W/e2e/settings-rules.spec.ts                                                                                              | 수동 시작 잔액·자동 복원; 재산정 품질은 MN-03/#67                                                                | —      |
| MN-05 | 완료   | W/src/storage/session-save.ts·session-schema.ts·p2p/host-save.ts·p2p/ticket.ts; W/src/storage/session-save.test.ts의 활성 규칙 저장 왕복·p2p/host-save.test.ts, W/e2e/navigation.spec.ts·settings-rules.spec.ts | OS 프로세스 종료 실측은 NF-05/#75                                                                                | 미     |
| MN-06 | 완료   | W/src/lib/format.ts·settings/settings.svelte.ts·routes/Settings.svelte; W/src/game/display.test.ts·e2e/settings-rules.spec.ts                                                                                   | 냥·원·점 로컬 단위 선택                                                                                          | —      |

### 비기능·수용 (NF/AC)

| ID | 상태 | 코드·검증 근거 | 남은 항목·추적 | 실기기 |
|---|---|---|---|---|
| NF-01 | 완료 | W/scripts/check-bundle.mjs, 로컬 public/cards·src/styles/fonts, K/server/SmokeServer.kt; KT/NoExternalUrlTest.kt, W/e2e/fonts.spec.ts 로컬 요청 | — | M0 |
| NF-02 | 부분 | android/app/build.gradle.kts min33/target36, W/eslint.config.js 금지 API; W/e2e/p2p-screens.spec.ts HTTP·WebKit | 현재 iOS26.5 Safari·Android16 실제 UI 확인 #75 | 미 |
| NF-03 | 미검증 | W/scripts/check-bundle.mjs·src/anim/flip.ts·ui/EventRail.svelte, W/e2e/solo.spec.ts timing·fonts.spec.ts; PA-06 콜아웃은 예약 행만 사용하며 1.2초 토큰과 연속 완료 큐를 대조 | 첫 로딩2초/응답100ms/60fps 실제 핫스팟·기기 측정 #75; 평가 자산 빌드는 릴리스 근거 제외 | 미 |
| NF-04 | 부분 | P/src/guest.ts·host.ts, K/HotspotService.kt, W/src/p2p/link.ts·styles/tokens.css; P/test/session.test.ts, W/src/p2p/wiring.test.ts | 실제 서비스 알림1개·유휴/복귀·배터리 회차 #75 | 미 |
| NF-05 | 부분 | W/src/p2p/link.ts·host-save.ts·storage/session-save.ts; W/e2e/reconnect.spec.ts·navigation.spec.ts, P/test/session.test.ts | 정상 복귀와 응답 유실 경로의 5초 목표 구별·OS 종료 복구 실측 #75, 타이머 복귀 제안 #123 | 미 |
| NF-06 | 부분 | K/server/SmokeServer.kt LAN gate, P/src/host.ts 토큰, W/src/routes/HostRoom.svelte 경고; KT/server/M4ServerTest.kt, P/test/session.test.ts | 토큰은 random32 전체 hex로 **256비트**, 명세128비트와 불일치(보안 약화 아님). #44에서 명세 정합 결정 | — |
| NF-07 | 완료 | W/scripts/generate-oss-notices.mjs 수동 `oss:refresh`·oss-notices.test.mjs의 Vite 번들/lockfile 검사·vite.config.ts 배포 모듈 목록·public/oss/NOTICE.txt·routes/License.svelte·fonts/attribution.ts; Android `verifyOssNotices`의 런타임 그래프 검사, W/src/routes/License.test.ts·scripts/check-bundle.mjs, APK 자산 포함 검사 | 커밋된 웹·Android 고지를 각 빌드 단계에서 대조; 카드·폰트·자산 파일별 출처 유지 | — |
| NF-08 | 부분 | W/src/ui/Card.svelte·Hand.svelte·Screen.svelte·SeatBar.svelte·EventBanner.svelte·styles/tokens.css; W/e2e/gallery.spec.ts axe·cards.spec.ts·hand-feedback.spec.ts. 손패·바닥은 별도 월 숫자·종류 배지 없이 카드 도상과 월·종류 aria-label을 사용(2026-09-30 개정); PA-06 사건 문구와 `ScoreChanged.breakdown` 기반 족보 완료·연속 표시, 뻑·흔들 카운터 숫자+도상은 #171 구현 확인 | 200% 확대·초점·진동 개별 끄기 #51·#49·#115; UX-06 전체 앞면 손패·주 버튼 같은 카드 놓기·5×3 기본 격자·손패/바닥48px·획득32px, 콜아웃 제외 5크기×2엔진130화면 배치 감사 및 별도 콜아웃 표시 중 5크기×2엔진 검사 통과(기록: pro-skin-validation.md) | 미 |
| NF-09 | 완료 | E/src/reduce.ts·rng.ts·replay.ts, A/src/rng.ts; E/test/api.test.ts·properties.test.ts, A/test/info-hiding.test.ts | AI 고정 반복 예산 기준 | — |
| NF-10 | 미검증 | android/app/build.gradle.kts min33, AndroidManifest.xml NEARBY_WIFI_DEVICES·위치권한 없음, MainActivity.kt 이유 안내 | 서명 릴리스 APK≤15MB 실측·권한 UX #75; debug 크기를 릴리스 증거로 쓰지 않음 | 미 |
| AC-00 | 완료 | K/HotspotService.kt·qr/WifiQr.kt·server/SmokePage.kt; KT/HotspotSessionTest.kt, docs/device-test/results.md v0.0.1·v0.0.2 사용자 로그 | 잠금 장시간·현재 게임은 AC-08/09 | M0 |
| AC-01 | 완료 | E/test/vectors.test.ts·vector-harness.ts·vectors/{deal,score,bonus,events,gostop,pi,push,settle,view}.json, E/src/reduce.ts | 규칙 기대값 정본은 rules-commercial §12 | — |
| AC-02 | 완료 | E/test/properties.test.ts·step-checks.ts; 이번 대조에서 ENGINE_FULL=1 실행: 10,000판+선 고르기 첫 판1,000판, 2개 테스트 통과(42.35초) | 기본 npm test의1,000판 축약과 구별 | — |
| AC-03 | 부분 | S/results/ac03-retry/candidate-normal.json·candidate-easy.json, A/src/policies/ismcts.ts, [PR #167](https://github.com/kywoo26/p2p-gostop/pull/167) | AI-04와 동일: 보통 65.01% 미확정·쉬움 76.87% 미달, P0 미완 #66 | — |
| AC-04 | 완료 | W/e2e/p2p.spec.ts “호스트(Chromium)·게스트(WebKit) 20판 · 원장 제로섬 · 순번 연속 · 게스트 끊김 후 토큰 복귀”, P/src/host.ts·guest.ts | 실제 핫스팟은 AC-08/09 | — |
| AC-05 | 완료 | W/e2e/gallery.spec.ts 및 __screenshots__/gallery.spec.ts/*-webkit.png, p2p-screens.spec.ts | 현재 기준샷 회귀만 의미; 새 디자인 규범 완료는 아님 | — |
| AC-06 | 부분 | W/src/anim/choreo.ts·durations.ts, W/e2e/solo.spec.ts timing·timing-fixtures.ts, PR #145 | P2P 단언·Galaxy 실측 #75(기존 #58·#70 통합); hosted WebKit 벽시계는 기록만 | 미 |
| AC-07 | 완료 | W/scripts/check-bundle.mjs, W/package.json build 게이트 | 기본 릴리스 빌드≤1.5MB, PRO_ASSET_REVIEW 평가 팩 제외 | — |
| AC-08 | 미검증 | K/HotspotService.kt, W/e2e/p2p.spec.ts는 대체 자동 검사; docs/device-test/results.md 현재 회차 없음 | Android 정식 UI 핫스팟→QR→1판 사람 검증 #75 | 미 |
| AC-09 | 미검증 | W/src/p2p/link.ts·guest.svelte.ts, W/e2e/reconnect.spec.ts는 대체 자동 검사 | iPhone Safari 정식 UI1판·잠금복귀 #75 | 미 |
| AC-10 | 부분 | A/src/money-defaults.ts, S/test/money-doc.test.ts·docs/money-model.md | 프리셋별 표본 수·최신 AI 기본값/도움말 정합 #67 | — |

### 중복 7행·개정안 대응 (93행 전수 대조)

| spec 재등장 행       | 현행 상태      | 개정안 상태·근거/추적                                                                                |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| §3.6 FR-16           | 완료(본표)     | 부분: 수동 선택 구현, 예약 구역/흔들기 바텀 시트 #46·#112, P2P 제한 켬 초과는 #123 구현              |
| §5.1 NP-02           | 완료(v3)       | 완료: P/src/messages.ts·schema.ts의 결정 메시지와 버전 검사 #123                                     |
| §5.1 NP-03           | 완료(v3)       | 완료: P/src/host.ts·guest.ts의 timerRev·복귀 계약 #123                                               |
| §5.1 NP-05           | 완료(하트비트) | 완료: 만료 확인 교환·25/60초 감시 분리 #123                                                          |
| §5.1 NF-05           | 부분           | 시계 연속성·복귀 보정 구현 #123; 실기기 연결 확인 #75                                                |
| §5.1 NP-10 경계 표제 | 완료           | NP-10 세부 표의 제목이며 별도 요구사항 아님, #123                                                    |
| §6.8 FR-46·49·50     | 미구현         | 카운트다운은 핵심 정보로 표시하며 힌트 이력에 합산하지 않음 #123; 힌트·조언·사용 이력 자체는 #80·#90 |

타이머 개정안의 자동 검증은 #123에서 추가했다. 실기기 결과는 아직 없다.

### 요약·의도별 달성도

고유 ID **86개 중 완료 49·부분 26·미구현 5·미검증 6**. 완료율은 **49/86 = 57.0%**(타이머 신규4개 포함), 타이머 신규 ID 제외한 기존82개는 **45/82 = 54.9%**. 이는 기능·검증 항목의 단순 비율이며 제품 품질 점수가 아니다. P0 AI 강도·성능과 현재 실기기 수용이 남아 v1.0 완료로 볼 수 없다.

- **기내 오프라인 1:1:** 아키텍처·M0 기내 모드 연결·자동20판 경로 확보, 현재 정식 UI 실기기 AC-08/09 미검증(#75).
- **iPhone 무설치:** Safari HTTP 진입·QR 스모크 달성, 현재 게임/잠금복귀를 실기기로 다시 확인해야 함(#75).
- **상용 규칙:** 확정 엔진 규칙·밀기/정산 회귀와 24행 설정 UI·미지원 옵션 안내 확보. 미션·가위바위보 엔진 및 자동치기 실행은 후속(#62).
- **상용급 AI:** 탐색·공정성·과감성 구현, #167 후보 승률은 보통 65.01% 미확정(95% 구간 62.91–67.10%)·쉬움 76.87% 미달로 P0 미완이며 모바일 시간도 미검증(#66·#75).
- **가상 머니·UI:** 원장/올인/저장·기본 플레이 가능, 프리셋별머니10,000판·스코어보드/손패 가림/힌트/음향 마무리 필요(#67·#79·#114·#115·#117).

현재 정식 UI의 **실기기 미검증 연결 목록**: FR-01~05·FR-12·FR-14·FR-15·FR-17·FR-19·FR-21~23·FR-30·FR-32·FR-40~46·FR-48·FR-51~52, AI-05, MN-04·MN-05, NF-02~05·NF-08·NF-10, AC-06·AC-08·AC-09. M0/구버전 결과를 이 목록의 통과로 전용하지 않는다. 미구현 기능은 구현 후 사람 회차에 포함한다. 순수 엔진·머니 산술·프로토콜 단위 검증은 실기기 요구와 분리한다.

초기 head `e0a0bd8`의 실행 근거(아래 수치는 #151 병합 후 결과가 아님; 모두 `"$HOME/.local/bin/docker" compose run --rm dev …`): `npm ci`, `npm run check`, `npm test`(27파일·519테스트), `npm run test:browser`(52파일·350테스트), `npm run build -w packages/web`(1242.8KiB/1536KiB·외부 요청0), `npm run e2e -w packages/web`(108통과·평가용 등18건 skip), `android/gradlew -p android assembleDebug testDebugUnitTest lint` 통과. 별도 `env ENGINE_FULL=1 npm test -- packages/engine/test/properties.test.ts`의10,000판+첫 판1,000판도 통과했다. 포맷·린트 및 ID 누락/중복 검사는 PR 검증 기록으로 남긴다. 이 실행에 실기기·AI 강도 재측정·머니10,000판 재산정은 포함하지 않았다.

리뷰 반영 병합 트리(`daa5e7d` 포함)에서도 같은 Docker 진입점으로 `npm ci`, lint/check, Node519개, 브라우저56파일·366개, E2E117통과·19 skip, 웹 빌드1247.5/1536KiB·외부 요청0, Android assembleDebug/testDebugUnitTest/lint를 다시 통과했다. ENGINE_FULL의10,000판+첫 판1,000판도2/2 통과(44.96초). 매트릭스86 ID·닫힘33개·§3-3 진단5줄을 별도 검사했다. 실기기 판정은 바꾸지 않는다.

### 이슈 정리 결과 (초기 정리와 리뷰 반영 시점 구분)

초기 head `e0a0bd8`에서 58→25개(17/8/33)로 정리했다. 리뷰 반영 시점 main `daa5e7d`에서는 #151 구현으로 #113이 닫히고 #30이 환급 정책 범위로 재개되어 원래 정리 대상58개 중 열린25개를 유지하되 구성은 **v0.2.2 16개 / v0.2.3 9개 / 닫힘33개**다. #110·#140은 기존 통합 종료 뒤 #151 구현까지 확인됐으며 닫힘을 유지한다. 아래 목록은 원래58개 범위의 현재 구성이다. 2026-09-29 21:55 KST 추가 조회에서 신규 #155(회전 후 선택창 inert 충돌)가 별도로 열려 저장소 전체 OPEN은26개다. 신규 이슈는 이 정리의 종료/재개 수에 섞지 않는다.

- **(a) v0.2.2 필수 16개:** [#46](https://github.com/kywoo26/p2p-gostop/issues/46)·[#47](https://github.com/kywoo26/p2p-gostop/issues/47)·[#49](https://github.com/kywoo26/p2p-gostop/issues/49)·[#51](https://github.com/kywoo26/p2p-gostop/issues/51)·[#62](https://github.com/kywoo26/p2p-gostop/issues/62)·[#66](https://github.com/kywoo26/p2p-gostop/issues/66)·[#74](https://github.com/kywoo26/p2p-gostop/issues/74)·[#79](https://github.com/kywoo26/p2p-gostop/issues/79)·[#80](https://github.com/kywoo26/p2p-gostop/issues/80)·[#111](https://github.com/kywoo26/p2p-gostop/issues/111)·[#112](https://github.com/kywoo26/p2p-gostop/issues/112)·[#114](https://github.com/kywoo26/p2p-gostop/issues/114)·[#115](https://github.com/kywoo26/p2p-gostop/issues/115)·[#117](https://github.com/kywoo26/p2p-gostop/issues/117)·[#123](https://github.com/kywoo26/p2p-gostop/issues/123)·[#136](https://github.com/kywoo26/p2p-gostop/issues/136). 직접 지적과 기본 플레이/고지 우선.
- **(b) v0.2.3 9개:** [#30](https://github.com/kywoo26/p2p-gostop/issues/30)· [#44](https://github.com/kywoo26/p2p-gostop/issues/44)·[#67](https://github.com/kywoo26/p2p-gostop/issues/67)·[#75](https://github.com/kywoo26/p2p-gostop/issues/75)·[#81](https://github.com/kywoo26/p2p-gostop/issues/81)·[#82](https://github.com/kywoo26/p2p-gostop/issues/82)·[#87](https://github.com/kywoo26/p2p-gostop/issues/87)·[#90](https://github.com/kywoo26/p2p-gostop/issues/90)·[#143](https://github.com/kywoo26/p2p-gostop/issues/143). 상세 힌트·머니 재산정·연결/기록·실기기 통합. #75의 iPhone 회차는 기기 확보 조건부이며 Galaxy 회차는 먼저 진행.
- **(c) 원래58개 중 닫힘 33개:** 아래 표. 원문 수용 기준 통합25건은 보존하며, #113 구현 완료를 추가하고 재개된 #30은 제외했다.

| 종료 이슈 | 대표 이슈 또는 사유                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #10       | PR #88의 게임 메뉴·Android Back 구현과 e2e/navigation.spec.ts, BackRouteTest.kt로 원래 결함이 해소됨. 실제 기기 후속 회차는 #75에서 유지.                                                 |
| #18       | #75로 원문 수용 기준 통합                                                                                                                                                                 |
| #19       | PR #42로 p2p-mini 은퇴. e2e/p2p-screens.spec.ts가 비루프백 루트·레거시 북마크·호스트 진입을 검증하며 현행 lint/check 대상은 정식 웹임.                                                    |
| #48       | #46로 원문 수용 기준 통합                                                                                                                                                                 |
| #50       | #44로 원문 수용 기준 통합                                                                                                                                                                 |
| #52       | #111로 원문 수용 기준 통합                                                                                                                                                                |
| #53       | 기각된 리마스터·녹색 방향을 전제로 한 중복 시각 정리. 현재 A 방향은 PR #101·#102, 화면 수렴은 #104와 보호 이슈 #46/#47/#79에서 추적. 별도 재디자인을 계획하지 않음.                       |
| #58       | #75로 원문 수용 기준 통합                                                                                                                                                                 |
| #61       | #75로 원문 수용 기준 통합                                                                                                                                                                 |
| #63       | #44로 원문 수용 기준 통합                                                                                                                                                                 |
| #64       | PR #88·#150의 새 게임 확인·손상/저장 실패 안내·버전 스키마와 navigation.spec.ts·session-save.test.ts·push.spec.ts로 해소. OS 장애 실측은 #75 유지.                                        |
| #65       | #66로 원문 수용 기준 통합                                                                                                                                                                 |
| #68       | #75로 원문 수용 기준 통합                                                                                                                                                                 |
| #69       | #75로 원문 수용 기준 통합                                                                                                                                                                 |
| #70       | #75로 원문 수용 기준 통합                                                                                                                                                                 |
| #71       | FR-33 리플레이 내보내기는 플레이 가치·직접 지적 우선의 v0.2.2/3 범위에서 보류. 요구사항은 plan 진행 매트릭스에 미구현으로 보존하며 재개 시 별도 추적. 현재 진단 로그/재현 단계 경로 사용. |
| #72       | #111로 원문 수용 기준 통합                                                                                                                                                                |
| #77       | release.yml의 testDebugUnitTest assembleRelease와 apksigner 모두 동일 dev 이미지 및 SDK36 경로 사용. 원래의 러너 SDK 불일치가 해소되어 추가 작업 계획 없음.                               |
| #110      | #111로 원문 수용 기준 통합 후 PR #151 동등 대상 자동 선택 구현 확인; 닫힘 유지                                                                                                            |
| #113      | PR #151 국진 자동 최적 기본·매번 묻기 설정·저장/복원 회귀 완료로 닫힘                                                                                                                     |
| #116      | #79로 원문 수용 기준 통합                                                                                                                                                                 |
| #120      | #115로 원문 수용 기준 통합                                                                                                                                                                |
| #121      | #79로 원문 수용 기준 통합                                                                                                                                                                 |
| #124      | 최근 3턴 요약은 후순위 편의 기능으로 보류. 현재 공개 로그는 유지. v0.2.2/3에서는 스코어보드·손패 가림·필수 선택·힌트·음향·타이머에 집중하며 재개 시 범위 재평가.                          |
| #125      | #47로 원문 수용 기준 통합                                                                                                                                                                 |
| #127      | #51로 원문 수용 기준 통합                                                                                                                                                                 |
| #128      | #49로 원문 수용 기준 통합                                                                                                                                                                 |
| #131      | #44로 원문 수용 기준 통합                                                                                                                                                                 |
| #132      | #62로 원문 수용 기준 통합                                                                                                                                                                 |
| #133      | #44로 원문 수용 기준 통합                                                                                                                                                                 |
| #134      | #44로 원문 수용 기준 통합                                                                                                                                                                 |
| #135      | #62로 원문 수용 기준 통합                                                                                                                                                                 |
| #140      | #111로 원문 수용 기준 통합 후 PR #151 유일 합법 수 자동 진행·메뉴/판 정보 보류 구현 확인; 닫힘 유지                                                                                       |

닫기는 요구사항 완료/삭제가 아니다. 중복의 원문 수용 기준·파일 소유권은 대표 이슈 통합 코멘트로 이관하고, 의도적으로 보류한 FR-33·AI-09는 위 표에 남긴다. 사용자 직접 지적(스코어보드·손패 가림·폭탄 탭·흔들기·국진·확정 표식·힌트·효과음·AI 과감성·타이머)을 단순 이슈 축소 대상으로 닫지 않는다. 국진 #113은 #151 구현 완료에 따른 종료다. #81→#87/#143→#82 및 #80/#115는 같은 기능군으로 조율하되 보호 항목이므로 개별 이슈를 유지한다.

## 3-3. 우선순위 변경·의도 이탈 진단 (2026-09-29)

- 핵심 구조는 intend의 기내 오프라인1:1·iPhone 무설치와 일치하나 현재 실기기1판/복귀·상용급 AI 수용은 미완이다. 관측량 자체를 낭비로 단정하지 않고, 아래 반복·확장이 검증보다 앞서는 점을 과투자 위험으로 판단한다.
- 문서 관측: PR #84 직전(`bb389e5^1`)→직후(`bb389e5`)→#152 이전 main(`daa5e7d`)의 추적 `docs/**/*.md`는 **4,548→4,071→7,002줄**(당시46파일), 루트 intend/spec/plan 합은 **841→759→854줄**(이 PR 매트릭스 추가분 제외). 재현: 각 ref에 `git ls-tree -r --name-only <ref> -- docs`로 .md를 골라 `git show <ref>:<path>`를 연결한 뒤 `wc -l`; 루트3파일도 동일. 이미 병합된 [문서 정리 #84](https://github.com/kywoo26/p2p-gostop/pull/84)를 이어 상태 정본을 §3-2로 모은다.
- PNG 관측: `git ls-tree -rl daa5e7d`의 .png blob 크기 합 **82개·16,520,127바이트**(15.76MiB), 그중 docs/design **31개·3,890,113바이트**, E2E **screenshots** **32개·5,241,545바이트**. #84 전후는36개·4,281,640바이트로 동일했다. 회귀 기준샷은 필요한 검증 자산이며 낭비로 일괄 취급하지 않는다.
- 디자인 반복은 개별 A/B 후보 수가 아닌 방향 검토 회차로 **4회**: [#37](https://github.com/kywoo26/p2p-gostop/pull/37)의 모던 A/B→클래식 리마스터(2회, [기각 기록](docs/design/cards-polish.md)), [#92/#101의 A/B/C 검토·A 채택](docs/design/art-direction.md#결정-이력)(1회), [#146→#147 전문 자산 평가](https://github.com/kywoo26/p2p-gostop/pull/147)(1회). **#104 화면/손패 무가림 수렴→스킨** 순서로 고정하고 평가 자산을 출시 완료로 세지 않는다.
- 이슈는 초기58→25, 원래58개는 #113 종료/#30 재개 후에도25(16/9)다(신규 #155 포함 전체26). v0.2.2 직접 지적·필수 플레이→v0.2.3 상세 보조·머니·환급 정책 검토로 제한하고 새 편의/빌드 미세 최적화는 후순위로 둔다. Galaxy 검증을 계속하고 iPhone은 #75에서 확보 후 재개하며, 다음 판단 근거는 AI 강도·사용자 플레이 결과다.

## 4. 테스트 전략

| 층               | 대상               | 도구                                                          | 실행                                   |
| ---------------- | ------------------ | ------------------------------------------------------------- | -------------------------------------- |
| 규칙 벡터        | engine             | Vitest + JSON 벡터                                            | 매 커밋                                |
| 속성·불변식      | engine, ai         | Vitest(시드 고정, 10,000판)                                   | 매 커밋(축약 1,000판), 야간/태그(전체) |
| 강도 벤치마크    | ai                 | tools/sim                                                     | M2 완료 시, 가중치 변경 시             |
| 속성(fast-check) | engine, ai         | 카드 보존·결정론·합법 수만 적용·제로섬                        | 매 커밋                                |
| 컴포넌트         | web                | Vitest 브라우저 모드(Chromium+WebKit) + vitest-browser-svelte | 매 커밋                                |
| UI 회귀·접근성   | web `/dev/gallery` | Playwright 스냅샷(도커 안) + axe                              | 매 PR                                  |
| E2E              | web + relay-dev    | Playwright Chromium + WebKit, 턴 ≤700ms 계측                  | 매 PR                                  |
| 위생·예산        | 전체               | knip, 번들 크기·외부 URL 검사, svelte-check, ESLint 금지 API  | 매 커밋                                |
| 계약             | protocol           | Vitest(양쪽 역할)                                             | 매 커밋                                |
| Android          | android            | JUnit + Ktor testApplication, Android Lint                    | 매 PR                                  |
| 실기기           | 전체               | 사용자 + 절차서 + 로그 공유                                   | M0, M5, 릴리스                         |

---

## 5. CI/CD (GitHub Actions, `ubuntu-24.04` 고정)

- `ci.yml` (B1·plan §2): 러너에서 네이티브로 두 잡을 병렬 실행한다. ① npm ci → lint/check/단위 테스트 → 웹 빌드·예산·외부 URL 검사 → 웹 번들 포함 `assembleDebug testDebugUnitTest lint` 한 호출, ② 컴포넌트 테스트 → 전체 Playwright(기존 PR·수동 범위, timing 프로젝트 직렬 의존성 유지). npm 다운로드 캐시를 쓰며 Gradle 캐시는 setup-gradle로 main만 갱신한다. 잡 분리의 분 예산 증가와 벽시계 이득은 `docs/research/build-performance.md`에서 비교한다.
- `dependabot.yml`: npm(devDeps 그룹), gradle, github-actions. 쿨다운 3일을 명시 설정.
- 버전 규칙: `versionName`은 태그(`v0.M.n`), `versionCode`는 커밋 수(단조 증가). 태그 없이 배포하지 않는다.
- `release.yml` (B1): 정확한 SHA의 성공한 main push CI 웹 번들을 재사용한다. 재사용과 빌드는 비밀 없는 읽기 권한 전용 `web` 잡(새 VM, `npm ci --ignore-scripts`, npm 캐시 미사용)이 하고, 산출물만 아티팩트로 서명 잡 `apk`에 넘긴다. Gradle·`apksigner`는 러너 네이티브(내장 SDK)이고 Gradle 캐시는 읽기 전용이다. 빌드 후 추적 파일 변경이 있으면 실패. `persist-credentials: false`, 서명자 인증서 지문 고정, alias는 Variables, main 이력·CI 성공 게이트를 유지한다(M0 리뷰 R-1/R-4~R-7).
- `release.yml` (태그 `v*`): 웹 빌드 → `assets/web` 복사 → 키스토어 복원 → `assembleRelease` → `softprops/action-gh-release@v3`로 APK와 체크섬 첨부, 릴리스 노트에 설치·테스트 절차 링크.
- 비공개 저장소 월 2,000분 예산: E2E는 PR에서만, 전체 10,000판 속성 테스트는 태그에서만 실행해 분량을 아낀다.
- 사용자 설치 경로: 폰 브라우저에서 GitHub 로그인 → Releases → APK 다운로드 → 설치(출처 불명 앱 허용). 같은 서명 키로 덮어쓰기 업데이트.

---

## 6. 원격 피드백 루프

1. 마일스톤 APK가 Releases에 올라가면 사용자에게 절차서 링크와 확인 항목을 전달한다.
2. 사용자는 절차대로 수행하고 앱의 "로그 공유"로 텍스트를 보낸다(카톡·메일 등 아무 경로). 로그에는 빌드 해시, 기기 모델, OS 버전, 상태 전이, 오류가 자동 포함된다.
3. 재현이 필요한 게임 버그는 현재 로그·재현 단계를 받아 테스트 벡터로 추가한다. 리플레이 JSON(시드+액션) 내보내기 FR-33은 후순위 보류(#71 종료, §3-2)이며 구현 완료로 간주하지 않는다.
4. 수정 → 태그 → 재배포. 회차 기록은 `docs/device-test/`에 남긴다.

---

## 7. 리스크와 대응 (요약, 상세는 tech-stack.md 리스크 표)

| 리스크                                                       | 심각도         | 대응                                                                              |
| ------------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------- |
| 삼성 One UI 비행기 모드 LOHS                                 | 해당 기기 확인 | M0 S25 Ultra에서 성공. 다른 기기·현재 UI·장시간 복귀는 별도 실측                  |
| LOHS 자격 증명·IP 무작위                                     | 중             | 매 세션 QR. 서버 0.0.0.0 바인딩, 인터페이스 순회                                  |
| iOS 캡티브 시트/HTTPS 우선                                   | 중             | 안내 문구, M0에서 확인                                                            |
| 비보안 컨텍스트 API 부재                                     | 중             | 금지 API ESLint, 로그 호스트 업로드, 자동 잠금 안내                               |
| Ktor on Android R8 이슈                                      | 낮             | minify 끔, CIO 엔진, 서버 기동 계측 테스트                                        |
| ~~TS 7 ↔ Svelte 도구 호환~~                                  | 해소           | 비호환 확인됨 → TS 6.0.3 기본으로 확정(1.8)                                       |
| 에이전트의 구식 문법 혼입(Svelte 4, Tailwind v3, React 패턴) | 중             | AGENTS.md 금지 목록, Svelte MCP autofixer, svelte-check, ESLint가 기계적으로 차단 |
| Playwright WebKit ≠ iOS Safari                               | 낮             | 1차 필터로만, 최종은 실기기                                                       |
| CI 분량(비공개 2,000분/월)                                   | 낮             | E2E는 PR만, 대규모 시뮬레이션은 태그만                                            |

---

## 8. 초기 구축 이력

M0 골격·스모크 작업은 완료되어 §3과 [리뷰 인덱스](docs/reviews/README.md)로 대체한다. 당시에는 `docker/compose.yml`의 분리된 서비스·셸 래퍼를 썼으며, §2의 단일 이미지·루트 Compose로 교체했다.

---

## 9. 결정 사항

D1·D2는 기존 트랙 ID를 유지하고, 나머지 확정 결정을 D3~D6으로 묶는다.

| ID  | 결정                                                                        | 근거·남은 일                                                                                                           |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| D1  | Commons 48장 유지·앱 렌더링 개선, 보너스 3장·뒷면만 같은 화풍으로 신규 제작 | 사용자 2026-09-29 결정. 시안 A/B·클래식 리마스터 기각, PR #37 닫힘. [구현 수치·검증 절차](docs/design/cards-polish.md) |
| D2  | [UI 규범](docs/design/ui-spec.md) UX-01~25를 spec §6에 반영                 | PR #55 설계 완료, 구현 격차 #46~#53 유지                                                                               |
| D3  | 순수 TS 엔진 한 벌, Android는 셸·중계 전용                                  | §1.1·§1.4, spec FR-11·NF-09                                                                                            |
| D4  | 하이브리드 도구·Svelte·WAAPI·npm workspaces 유지                            | §1.8, 버전 정본 AGENTS.md §2                                                                                           |
| D5  | 포트 17777, WebView origin 127.0.0.1, 패키지 com.kywoo26.p2pgostop          | §1.7, 앱 이름 “맞고 P2P”(가칭)                                                                                         |
| D6  | 태그 배포·고정 서명, v0.2.x 완성도 증분 뒤 P1·AC 전부 통과 시 v1.0.0        | §3·§5, 상세 배포 순서는 Galaxy·솔로 계획                                                                               |

AI 강도·모바일 시간 예산과 머니 재산정은 미완이다. 효과음은 현재 Web Audio 합성 최소판이며 음색·설정 완성은 후속이다.

---

## 10. 변경 이력

- v0.12 (2026-09-30): 원칙 5·§2를 네이티브·버전 핀으로 개정하고 개발 이미지·Compose·Dev Container를 삭제(NF-09). CI·릴리스도 러너 네이티브.
- v0.11 (2026-09-29): PR #153 리뷰 반영. main `daa5e7d`(#151·#94/#95) 병합, FR-15 완료 및 #30 환급 정책 재개 반영, 기존82개 분모 명칭 정정, §3-3 문서/PNG/디자인 반복 계측 추가.
- v0.10 (2026-09-29): §3-2에 spec FR/NF/NP/AI/MN/AC 93행(고유86개)의 코드·테스트 대조 매트릭스, 릴리스 이슈 분류를 추가. §3-3 의도 이탈 진단, AGENTS §1 상태 변경 PR의 매트릭스 갱신 의무.
- v0.9 (2026-09-29): §2를 단일 개발 이미지·루트 Compose·Dev Container로 교체하고, CI 명령과 기존 볼륨 전환 절차를 동기화(PR #38, NF-06).
- v0.8 (2026-09-29): 마일스톤 이력을 상태 표로, 진행 계획을 현재 트랙으로 통합. 버전 표는 AGENTS.md로, 세부 증분은 Galaxy·솔로 계획으로 일원화.
- v0.7 (2026-09-29): 1.1 중계 규칙을 최신 연결 우선(4001)·알림·위조 차단·1003/1009/1008로 확정(M4 프로토콜 리뷰 #15·#24).
- v0.6 (2026-09-28): 3-2 재개 계획(사후 리뷰·통합·후속 트랙, 리뷰 필수 규칙).
- v0.5 (2026-09-28): 3-1 병렬 라이프사이클(모델 배분 원칙, 워크트리·PR 격리) 추가.
- v0.4 (2026-09-28): M0 리뷰 반영 — 코루틴 명시 의존, Dependabot 쿨다운, 버전 규칙, release.yml 분리 원칙. M0 조건부 완료(docs/reviews/README.md).
- v0.3 (2026-09-28): 하이브리드 Rust 툴체인 결정(순수 TS 패키지는 oxlint/oxfmt/TS 7, web은 ESLint/Prettier/TS 6). Svelte MCP를 로컬 stdio로 재채택.
- v0.2 (2026-09-28): agent-era-stack.md 반영. 원칙 9 추가, 1.6 애니메이션·스타일·검증 구체화, 1.8 스택 확정 표, 테스트·CI 게이트 추가, TS 6.0.3 확정, 리스크 표 갱신.
- v0.1 (2026-09-28): 초안.

### PA-05~07 전문 스킨 구현 분할 (#104 이후)

- **PA-05 / design/pro-skin**: #104 구조와 #166 제한시간 계약을 보존하고 Board·HUD·Home에 아트 디렉션을 적용한다. 사용자 확정 C/A/b안에 따라 SeatBar 마크업을 진영별로 재배치하고 공개 뷰의 스톱 예상액을 표시한다. PromptPanel의 WebKit 초점 순환 시점도 보완한다. 규칙·행동·`data-hand-*` 판정·`anim/*`·`--dur-*`는 변경하지 않는다. `public/skin`은 승인된 `public/pro`의 1x WebP 17개(재질4·홈1·초상12)와 행동 그림2개·manifest를 고른 ≤128KiB 하위 예산이다. 새 런타임 의존성0, uv Pillow12.3.0 파이프라인 재사용. 빌드는 Node `check-skin.mjs`로 manifest의 SHA-256·크기·추가/누락0·총128KiB를 검사한다. 원본·카드 해시 및 재생성 동일성은 개발 시 수동 `uv run packages/web/scripts/build-skin-assets.py --check`로 검증한다. 전체 dist 1.5MiB gate는 그대로이며 큰 atlas·2x/3x·AVIF/오디오 이중 포맷은 평가 팩에 둔다.
- **PA-06 / 사건 효과·음향**: 시각 분할 `design/event-effects`에서 사건·고·족보 1.2초 콜아웃을 구현하고, #171 내 HUD 뻑·흔들 숫자+도상을 검증한다(UX-09, NF-03/NF-08). 족보 완료는 재생된 `ScoreChanged.breakdown`만 사용하고 연속 완료를 예약 레일 큐에 보존한다. 중간 판 복원에서 초기 점수 분해가 없으면 첫 점수 사건을 기준선으로 삼는다(필요 필드·검증은 pro-skin-validation.md). 피박/광박 상시 스탬프는 진행 중 양쪽 위험·확정 필드가 공개 뷰에 없어 보류한다. 음향·진동은 PA-06b에서 다루고 설정 값은 읽기만 한다. EventRail 예약 공간·#86 시간표와 기존 진동 브리지·설정 스키마를 유지한다.
- **PA-07 / 정산·설정·기록**: #100 정산 상태·고정 행동 및 Sol 설정 UI 결과에 같은 화조도/먹색 프레임을 적용. 각 분할은 KEEP-01~18·최소4화면·axe·픽셀 갱신 사유·접근성 전후·필수 검사로 검증한다. NF-03 개정 승인 대기 유지, 실기기·청취 결과는 사람이 제공한 것만 기록한다.
