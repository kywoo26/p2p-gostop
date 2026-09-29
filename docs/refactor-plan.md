# 리팩토링 감사와 실행 계획

작성 2026-09-29 · 기준 `bb389e5` · 브랜치 `refactor/audit-plan`.
상위: [intend](../intend.md) → [spec](../spec.md) → [plan §1·§1.8·§3·§9](../plan.md).
규칙 정답은 [rules-commercial §12](research/rules-commercial.md), 파일 소유권은 [Galaxy 계획 §5](../plan.md#ownership)와 사용자 최신 지정이 우선이다. 이 문서는 기능 완료·병합·배포 승인이 아니다.

조회 시 #56·#85는 이미 병합됐고 #38·#73·#83·#86·#88·#89는 열려 있다. 그렇더라도 사용자 지정대로 웹 UI와 session 파싱/p2p는 이번 구현에서 제외한다. Galaxy 문서의 과거 상태 표를 현재 상태로 오인하지 않는다.

## 1. 감사: 재현 방법과 기준선

### 1.1 명령과 분모

```sh
./dev.sh install
# 호스트 git은 추적 파일 목록만 제공. 계측은 Docker의 기존 TypeScript 6 AST로 실행.
git ls-files packages tools android | ./dev.sh npm exec -- node --input-type=module --eval "$(cat docs/research/codebase-audit.mjs.txt)" > /tmp/codebase-audit.json
./dev.sh npm exec -- knip
./dev.sh lint
./dev.sh check
./dev.sh test
./dev.sh npm run test:net -w packages/web
./dev.sh test:browser
./dev.sh build:web
./dev.sh e2e
./dev.sh apk:debug
./dev.sh android:test
# 수동 교차 확인
wc -l packages/web/src/ui/Board.svelte packages/web/src/game/session.ts android/app/src/main/kotlin/com/kywoo26/p2pgostop/HotspotService.kt
rg -n 'export (type|interface)|ERROR_CODES|errorCode|rules: z.record' packages/protocol/src/{view-types,messages,schema}.ts
rg -n 'LABEL|stepLabel|INSTANT_LABEL' packages/web/src/{game,p2p,ui}
```

[계측 코드](research/codebase-audit.mjs.txt)·[원본 JSON](research/codebase-audit-baseline.json)을 함께 보존한다. `.txt`는 문서 부록을 제품/knip 진입점으로 등록하지 않기 위한 형식이다. 새 의존성 없음. 명령 치환은 따옴표로 감싸 한 인자로 넘긴다.

- 추적 파일 390개 중 코드 확장자 `.ts/.js/.mjs/.svelte/.kt/.kts` 241개, **35,322 물리 줄**. 빈 줄·주석 포함. JSON 벡터·SVG·PNG·Gradle wrapper·Markdown은 코드 LOC에서 제외하되 추적 파일 수에는 포함한다. 생성물·node_modules 제외.
- p50/p90은 파일별 물리 줄 수의 nearest-rank 분위수. 테스트 파일 수는 헬퍼와 E2E config도 포함하므로 Vitest 실행 파일 수와 다르다.
- 함수는 TS AST의 선언·화살표·메서드·생성자·접근자, 중첩 콜백 포함. 본문 없는 시그니처 제외. Svelte는 script만, 템플릿 표현식 제외. Kotlin은 파일 계측만 자동화했고 함수 범위는 아래 별도 표본이다. 함수 길이는 복잡도나 책임 수의 증명이 아니다.
- import 그래프는 정적 import/re-export와 문자열 리터럴 `import()`를 수집하고 package exports를 해석한다. 타입 간선 포함; 계산된 동적 import·require·Kotlin 의존은 제외. “순환 0”은 이 범위에서만 성립한다.

### 1.2 패키지별 분포

| 영역 | 추적 파일 | 코드 파일 | LOC | p50 / p90 / 최대 | 테스트·헬퍼 파일 / LOC |
|---|---:|---:|---:|---:|---:|
| engine | 47 | 36 | 6,146 | 119 / 417 / 593 | 11 / 2,525 |
| ai | 31 | 28 | 3,202 | 88 / 240 / 419 | 9 / 876 |
| protocol | 24 | 20 | 5,762 | 181 / 693 / 1,171 | 6 / 2,030 |
| web | 214 | 105 | 14,303 | 88 / 331 / 712 | 24 / 3,661 |
| relay-dev | 7 | 4 | 650 | 139 / 335 / 335 | 2 / 474 |
| sim | 11 | 9 | 1,217 | 58 / 401 / 401 | 2 / 223 |
| android | 56 | 39 | 4,042 | 60 / 394 / 431 | 16 / 1,176 |

### 1.3 큰 파일 상위 15개 (테스트 포함)

| 순위 | 파일 | 줄 | 판단 |
|---|---|---:|---|
| 1 | `packages/protocol/test/session.test.ts` | 1,171 | 복구·인증·머니·공정성 테스트가 한 파일; 기능별 분할 후보 |
| 2 | `packages/protocol/src/host.ts` | 1,009 | 권위 상태·복원·전송·판 수명; 위험 높아 단계별 추출 |
| 3 | `packages/web/src/p2p/host.svelte.ts` | 712 | UI 상태·저장·네트워크 연결, #88 이후 대기 |
| 4 | `packages/protocol/src/guest.ts` | 693 | 응답 추적·공정성·outbox, #85 결과와 인계 뒤 |
| 5 | `packages/engine/src/turn.ts` | 593 | 규칙 전이 응집 유지하며 순수 연산만 추출 검토 |
| 6 | `packages/engine/test/step-checks.ts` | 554 | 벡터 단언 허브, 규칙별 검색 지도 우선 |
| 7 | `packages/web/src/p2p/wiring.test.ts` | 503 | UI 연결 담당 소유 |
| 8 | `packages/web/src/p2p/guest.svelte.ts` | 469 | #88·#85 인계 전 수정 금지 |
| 9 | `android/.../GameActivity.kt` | 431 | Back·브리지·복구; #88 소유 우선 |
| 10 | `android/.../server/SmokeServer.kt` | 427 | #61 중계 정책 담당과 인계 |
| 11 | `packages/engine/test/api.test.ts` | 425 | API 시나리오, 무조건 쪼개지 않음 |
| 12 | `packages/ai/src/policies/ismcts.ts` | 419 | 정책·예산·탐색, #66 튜닝과 직렬 |
| 13 | `packages/engine/test/vector-harness.ts` | 417 | 입력 자료 해석; 벡터 형식 보존 |
| 14 | `android/.../MainActivity.kt` | 416 | 네이티브 셸 트랙과 직렬 |
| 15 | `tools/sim/src/stats.ts` | 401 | 통계 계산과 Markdown 출력 분리 후보 |

예시 파일은 `Board.svelte` **360줄**, `game/session.ts` **258줄**, `HotspotService.kt` **394줄**이다. Board는 상위 15에 들지 않는다. 전체 운영 파일 순위도 원본 JSON에 있다.

### 1.4 함수 길이

TS/JS/Svelte script 함수 2,404개(테스트 포함), p50 **4줄**, p90 **24줄**. 아래는 비테스트 상위 10개이며 선언 첫 줄부터 끝 줄까지 센다.

| 파일·함수 | 시작 줄 | 길이 |
|---|---:|---:|
| `web/src/game/display.ts` · applyEvent | 117 | 124 |
| `web/src/bridge/bridge.ts` · createNativeBridge | 154 | 119 |
| `sim/src/config.ts` · parseArgs | 114 | 114 |
| `protocol/src/guest.ts` · receive | 596 | 97 |
| `relay-dev/src/index.ts` · startRelay | 61 | 91 |
| `protocol/src/host.ts` · receive | 786 | 87 |
| `engine/src/turn.ts` · resolve | 426 | 80 |
| `protocol/src/transport.ts` · createQueuedTransportPair | 120 | 78 |
| `web/src/game/playback.svelte.ts` · onEvent | 291 | 73 |
| `ai/src/match.ts` · playRound | 79 | 70 |

Kotlin 표본은 `HotspotService.kt`의 `startLegacy`(199~209, 11줄)·`startHotspot`(166~197, 32줄)을 `nl -ba .../HotspotService.kt`로 확인했다. 이를 Kotlin 전체 함수 분포라고 부르지 않는다. 네이티브 추출 착수 때 Kotlin AST 도구를 컨테이너에서 검토하고 전수 기준선을 먼저 추가한다.

### 1.5 패키지 간 import 그래프

숫자는 import/export 문장 수(전체 / 비테스트). 함수 호출 횟수나 고유 심볼 수가 아니다.

| 소비자 → 공급자 | 전체 / 비테스트 | 판정 |
|---|---:|---|
| ai → engine | 23 / 16 | 허용 |
| protocol → engine | 12 / 7 | 허용 |
| relay-dev → protocol | 4 / 2 | 허용 |
| relay-dev → engine | 1 / 0 | 세션 통합 테스트에서만 허용 |
| web → engine | 33 / 24 | 허용 |
| web → ai | 8 / 8 | 허용 |
| web → protocol | 13 / 11 | 허용 |
| sim → engine | 3 / 3 | 허용 |
| sim → ai | 4 / 2 | 허용 |

패키지 순환 **0**, 파일 강연결 성분(2개 이상) **0**, 패키지 간 상대경로 import **0**. 기존 구조의 장점이다. lint에는 순수성 금지 API만 있고 import 경계 제한은 없어 향후 역방향 참조 예방은 문서에 의존한다. engine의 `./testing`과 web의 `./net` 공개 하위 경로는 이미 있다. 무분별한 `export *` 축소는 소비자 조사 뒤 별도 변경한다.

### 1.6 중복·죽은 코드·테스트·드리프트

| ID | 실물 근거 | 판정·조치 |
|---|---|---|
| RF-01 | `protocol/view-types.ts`의 CardId·Seat·Month·SettleStepKind; CapturedView·SettleStepView·RoundPhase | engine과 동일 의미의 7개 도메인 모양을 재기술. 기존 공개 이름 유지하며 type import/re-export·alias로 연결 가능 |
| RF-02 | `protocol/messages.ts` ErrorCode union + ERROR_CODES 배열 + `schema.ts` errorCode enum | 9개 오류 문자열의 목록 3개. 배열 하나에서 타입·검증을 도출하면 변경 지점 3→1 |
| RF-03 | `protocol/{messages,view-types,schema}.ts`; codec의 `as Message` | Zod가 전체 타입의 단일 근거라는 plan §1.6 설명과 다름. 특히 welcome.rules는 `record(string, unknown)`이고 이후 RuleOptions로 단언. 전체 스키마 도출은 optional/readonly·이벤트 느슨함·호환성 별도 설계 필요 |
| RF-04 | `engine/rules.ts` 25 RuleOptions 필드, Galaxy §3 24행, settings 저장·UI | 24행=22게임규칙+2로컬, 추가 고급규칙 3개. 레지스트리는 도메인 키/지원 상태와 UI 라벨을 분리해야 함. “24 boolean” 생성 금지 |
| RF-05 | `web/lib/view-types.ts` 2줄 | 이미 protocol 재수출. 중복 제거 대상으로 잡지 않음 |
| RF-06 | `web/ui/settle-labels.ts` + game/records·p2p/host 소비 | 정산 라벨은 이미 한 곳. engine/protocol로 한국어 UI 라벨을 옮기지 않음 |
| RF-07 | SeatView·RoundRecord·SettlementInput 동명 선언 | engine 공개 관찰/표시용 뷰, 시뮬레이션/저장 기록 등 의미가 다름. 이름 일치만으로 합치지 않음. UiEvent는 deprecated 픽스처 호환 계약 |
| RF-08 | `host.ts` 1,009줄·session 테스트 1,171줄 | 인증·수열·원장·복원 책임 결합. 복원 직렬화 → 순번/전송 → 판 수명 순으로 하루 단위 분리 |
| RF-09 | `knip.json`·기준선 `./dev.sh check` | 기준 코드의 knip 미사용 항목 **0**, exit 0. entry/export와 `ignoreExportsUsedInFile` 범위 내 결과이며 죽은 코드 부재 증명 아님. 신규 감사 `.mjs`가 unused file 1로 검출되어 문서 `.txt` 부록으로 변경; 제품 예외 추가 없음 |
| RF-10 | `protocol/test/m4.test.ts`, engine `e1-api.test.ts`, 나머지 기능명 테스트 | 마일스톤명과 기능명이 혼재. engine/ai/protocol은 `test/`, web은 src 동거+e2e, Android는 src/test. 위치는 유지하고 소유 기능 수정 시 명칭/지도 개선 |
| RF-11 | plan §1.6 FLIP “수십 줄”, §2 gradle-cache/pw-browsers | 실제 flip.ts와 관련 모듈, compose는 node_modules/android-home. 계획/현황 혼동. #38·#73 인계 후 원문 담당이 정정 |
| RF-12 | docs/protocol §1 Kotlin 벡터 후속, `RelayScenarioTest.kt:33`; §10 wire 벡터 수 | 공유 relay-scenarios.json을 이미 읽음. wire.json도 문서 36개와 달리 실제 41개. 원문 담당 인계 때 정정 |
| RF-13 | `web/game/adapter.ts` SettlementDisplay 주석 | protocol에 국진 위치가 없다는 주석이 `SettlementView.gukjinAsPi`와 어긋남. 추가 표시 모양은 다르므로 주석 정정과 실제 어댑터 중복 축소를 분리 |
| RF-14 | `protocol/transport.ts`, `ai/types.ts`, protocol 저장 version, `game/session.ts` | Transport·Policy·저장 버전 접점은 이미 있음. BLE/AI 공통 프레임워크를 새로 만드는 작업은 불필요 |

## 2. 가치·위험·규모 우선순위

가치 높음=후속 작업 여러 곳의 오류/변경 지점 감소, 위험 높음=머니·인증·규칙·복원 영향. 시간은 구현·로컬 검증 추정이고 리뷰/CI 대기는 별도다. 큰 위험 항목은 가치가 높아도 먼저 실행하지 않는다.

| 순위·PR | 내용·근거 ID | 가치 / 위험 / 규모 | 선행 조건·완료 수치 |
|---|---|---|---|
| 1 · R1 `refactor/protocol-domain-types` | RF-01/02 동일 도메인 타입·오류 목록 단일화; NP-02, FR-18, plan §1.3/1.4/1.6·D3 | 높음 / 낮음 / 2~4h | 지금 가능. 7개 모양 재정의→0, 오류 목록 3→1, wire v2·공개 이름·벡터 227 유지 |
| 2 · R2 `refactor/import-boundaries` | RF-09/10 공개 API와 의존 방향 lint; NF-09, plan §0.9/1.3·D4 | 높음 / 낮음~중간 / 3~5h | 기존 lint 설정 소유권 확인. 금지 샘플 실패·허용 하위 경로 통과, 순환 0 유지 |
| 3 · R3a/b `refactor/protocol-contracts` | RF-03/04 규칙·메시지 스키마와 TS 계약 정합; NP-02/04, FR-21/24 | 높음 / 중간~높음 / 각 4~6h | #85·#88·.2-B 인계. a: 동작 같은 스키마/타입 분리, b: 오류 입력 정책은 별도 기능 수정 PR |
| 4 · R4a/b/c `refactor/host-*` | RF-08 호스트 복원·순번/전송·판 수명 분리; NP-03/06, MN-01/05 | 높음 / 높음 / 각 4~6h | protocol 계약 안정화. 각 PR 최대 함수/책임·파일 LOC 비교, 공정성/500원장/복원 시나리오 유지 |
| 5 · R5 `refactor/session-storage` | RF-13/14 저장 envelope·마이그레이션 경계; MN-05, NF-05 | 높음 / 높음 / 4~6h | #88→.2-A→.2-C→.3-C 소유권 인계 뒤 사용자 재지시. 기존 저장본 fixture 동일 복원 |
| 6 · R6 `refactor/sim-reporting` | stats.ts 계산/표 출력 분리; AI-07, MN-03 | 중간 / 낮음 / 2~4h | #56→#66→#67 충돌 재확인. CLI 출력 golden·시드별 결과 동일 |
| 7 · R7 `refactor/engine-turn` | turn.ts 순수 부분 연산 추출; FR-10/11, NF-09 | 중간 / 높음 / 각 4~6h | 227 벡터 + fast-check + 1,000판 불변식. 긴 switch를 쪼개기 위한 추출 금지 |
| 8 · R8 `refactor/android-lifecycle` | 네이티브 서버/핫스팟 정책 분리; FR-01/02, NF-05 | 중간 / 높음 / 각 4~6h | #88·#61·.3-C 인계, Kotlin 전수 함수 기준선 추가. JVM + 사람 절차, 실기기 성공 추정 금지 |

문서 PR 직후 **R1 한 개를 먼저 실행**한다. R2는 자동 경계의 정확성(상대경로·동적 import·testing 예외)을 설계/검증한 뒤 다음 후보로 둔다. 큰 파일 1위를 즉시 재작성하는 것보다 충돌 없이 계약 변경 지점을 줄이는 데 우선순위를 둔다.

## 3. 목표 구조와 강제 수단

| 영역 | 정본·공개 접점 | 허용 의존·검증 |
|---|---|---|
| engine | 카드/좌석/규칙/액션/정산, index.ts; 시나리오는 engine/testing | 제품 workspace 의존 0, 타이머·I/O 금지 규칙 유지 |
| ai | Policy·DecisionContext·createPolicy, index.ts | engine만. 공개 PlayerView만 소비, 고정 반복 시드 결정론 |
| protocol | wire 스키마/codec, 화면 변환, HostSession/GuestSession, Transport | engine만. 도메인 타입 재사용, UI/framework import 금지 |
| relay-dev | 중계 서버, CLI | 운영은 protocol만; 테스트에서 engine 허용, 내용 해석 금지 |
| sim | runner / stats / report / CLI | engine·ai만. Node I/O는 CLI·pool·worker에 유지 |
| web | game(세션/표시), p2p(연결), net(WS), storage, ui/routes | engine·ai·protocol 공개 API. 프레임워크 상태는 web에, engine 쪽 역참조 금지 |
| Android | 네이티브 셸·브리지·중계 | TS 소스 의존 0. 웹 dist와 공유 중계 테스트 벡터만 소비 |

| 기존 도구로 제안할 규칙 | 구체 정책 | 경계/검증 |
|---|---|---|
| Oxlint `eslint/no-restricted-imports` overrides | engine에서 `@p2p-gostop/{ai,protocol,web,relay-dev,sim}` 및 하위 경로 금지. ai/protocol은 engine 외 workspace 금지. sim은 web/protocol/relay 금지. relay 운영 src는 engine/ai/web/sim 금지 | 타입 전용도 동일 적용. tests override로 relay→engine과 engine/testing 허용 |
| 동일 규칙 patterns | 모든 영역에서 `@p2p-gostop/*/src/**` 금지, 다른 workspace로 넘어가는 상대경로 패턴 금지 | 패키지별 depth/정규화 우회 샘플 필요. `exports`는 상대경로 우회를 막지 않음 |
| web ESLint `no-restricted-imports` | 공개 engine·ai·protocol·web/net만 허용, deep import와 relay/sim 금지 | .svelte에도 적용. 기존 금지 API 규칙 덮어쓰지 않기 |
| exports + 현재 audit | 루트 index.ts, 명시된 testing/net subpath 유지; 강연결 성분 변화 점검 | 정적 규칙은 계산된 동적 import를 완전 보장하지 않음. 새 동적 경로는 리뷰 대상으로 명시 |

공식 API 근거는 [조사 O3/O4](research/agent-friendly-code.md). 설치된 버전에서 임시 금지/허용 fixture를 실제 lint로 확인한 뒤만 “강제됨”으로 기록한다. 새 플러그인·커스텀 린트 프레임워크·의존성 추가 없음.

## 4. 장기 계획 접점: 있는 것 보존, 필요한 것만 준비

| 접점 | 현재 | 다음 최소 변경·보류 |
|---|---|---|
| BLE/다른 transport | protocol Transport(send/onMessage/onClose/reconnect, 선택 onRelay), 메모리/큐/WS 구현 | 이미 분리됨. 미래 adapter가 같은 계약 테스트 통과하게 문서화. BLE framing·보안·재접속 제품 정책은 미정, 구현 안 함 |
| FR-21 24행 | engine 25 규칙 필드+LocalPlayOptions, Galaxy §3 매핑 | 도메인 키/지원 상태 레지스트리 후보. 라벨/속도는 web에 유지, 미지원 missions/가위바위보 활성화 금지 |
| AI 정책 | Policy/DecisionContext·시드·now·timeBudgetMs 주입 | 새 전략도 동일 인터페이스. 시드 반복과 시간 제한 결과를 구별. 강도·예산 변경은 #66 영역 |
| 프로토콜 버전 | v2, 버전 오류 우선 판정·wire 41벡터 | 직렬화 모양 변경 없으면 버전 유지. 변경 시 vN 고정 fixture + 호환/거절 표부터, 무조건 자동 마이그레이션 금지 |
| 저장 스키마 | 호스트/게스트·솔로 각각 version·복원 경로 | namespace별 envelope와 순수 migrate/validate 경계. 이전 저장본·손상·quota 실패·원장 중복 지급 테스트 먼저. #88/.3-C 인계 뒤 |
| 정산/라벨 | 엔진 SettleStep, protocol 화면 변환, web settle-labels | 도메인 모양만 공유. 한국어 라벨을 엔진 의존으로 만들지 않기 |

## 5. 에이전트용 변경 위치 지도와 소유권

2026-09-29 사용자 인계: v0.2.2-A `feat/push-settle`이 `web/src/game/{session.ts,solo.svelte.ts,controller.ts,adapter.ts,ai-core.ts}`, `p2p/{host,guest}.svelte.ts`, `routes/Settlement.svelte`, `ui/settle-labels.ts`, `workers/ai.worker.ts`를 소유한다. 해당 PR 병합 전에는 **web/src/game·web/src/p2p 리팩토링을 보류**한다. 예외는 #96의 `p2p/wiring.test.ts` 결정적 대기 수정(PR #97)이다.

현재 자유 영역은 engine/protocol/ai/sim/relay-dev와 `web/src/{net,lib,cards,storage}`다. #91·#93 병합 완료(main `ae1df57` 기준); 아래 표의 과거 선행 조건보다 이 인계가 우선한다. 진행한 후속 작업은 R2(PR #98)와 R3a(PR #99)이며 새 소유 영역과 겹치지 않는다.

| 바꾸려는 것 | 읽을 정본 → 구현 → 검사 | 착수 조건 |
|---|---|---|
| 규칙·점수·정산 | rules §12 → engine/{rules,score,settle,turn} → test/vectors·properties | 자유 영역; 기능 변경은 리팩토링 PR에서 제외 |
| wire 필드·거부 코드 | docs/protocol → protocol/{messages,schema,codec} → test/m4·session·view | R1 작은 공통 타입 가능; guest 상태 변경은 #85 인계 |
| AI/시뮬레이션 | spec AI·ai-tuning → ai/types·policies, sim → info-hiding·sim 테스트 | 사용자 자유 영역 지정이 최신이나 #56/#66/#67 진행 상태 재확인 |
| 웹 저장·세션 | MN-05 → game/session·storage/local → session·p2p 브라우저 테스트 | #88 파싱, #85 p2p, 이후 Galaxy 직렬 인계와 사용자 재지시 |
| UI/페이싱/Back/카드 | Galaxy §5·UI 규범 → 해당 소유 파일 → browser/E2E | #86 anim, #88 메뉴/Back, #83→HUD→.1-A, #89 카드 병합 뒤 사용자 재지시 |
| 도구·CI | AGENTS §5·plan §1.8 → dev.sh/docker/CI | #38→#73. 이 감사에서 수정 금지 |
| Android | plan §1.7 → HotspotService·GameActivity·SmokeServer → JVM/사람 절차 | Back #88, relay #61, 셸 .3-C 담당 인계 |
| 디자인 문서 | docs/design/* | 디자인 리드 전용, 변경 없음 |

## 6. PR 완료·동작 보존 기준

| 항목 | 각 구현 PR에 첨부할 증거 |
|---|---|
| 기준점 | base SHA·head SHA·Conventional Commit·spec 요구사항 ID·plan §1 근거·RF/R 번호 |
| 전후 계측 | 동일 계측 스크립트·분모의 파일/함수/import/중복 수. 타입 alias로 줄인 것과 책임을 분리한 것을 구별 |
| 회귀 | lint·check(knip 포함)·test, 규칙 벡터 **227** 유지·fast-check·test:net. 영향 검사뿐 아니라 AGENTS §5의 browser·build:web·e2e·apk:debug·android:test 전체 게이트 |
| 계약 | 공개 import·wire v2·저장 포맷·판/머니/공정성 결과 보존. 수용 범위를 바꾸는 검증 강화는 별도 기능 PR |
| 통계 | 전/후 실행 파일·test 수·skipped·실패/재시도 원인. 숫자만 같다고 의미 보존 증명으로 삼지 않음 |
| 충돌 | 금지 영역 diff 0. 머지/강제 푸시 금지. PR별 독립 브랜치, 하루 이내 범위 |
| 종료 | 이 워크트리 compose 프로젝트만 down, 다른 담당 컨테이너·볼륨 유지 |

## 7. 하지 않을 것

| 제외 | 이유 |
|---|---|
| 파일 길이 상한에 맞춘 대규모 이동·폴더/식별자 일괄 변경 | LOC와 응집도를 혼동하고 동시 PR 충돌을 늘림 |
| 모든 엔진 타입을 Zod로 옮기기, 상태 기계 재작성 | 순수 엔진의 의존·런타임 비용과 계약 변경 위험 |
| 이미 있는 Transport/Policy를 대체하는 새 프레임워크 | 미래 BLE/AI 요구가 확정되지 않음 |
| knip 0을 근거로 호환 export 삭제 | 공개·외부/동적 소비를 놓칠 수 있음 |
| 리팩토링과 규칙/AI 강도/저장 정책/정산 금액 수정 혼합 | 동작 보존 검증 불가 |
| 실기기 결과·에이전트 생산성 향상 추정 | 별도 관측이 없음. [조사](research/agent-friendly-code.md)의 효과 주장은 가설 |

## 8. 기준선 검증 기록

제품 코드 무변경. Docker 초기 설치 258패키지. 첫 test+check 동시 실행에서 AI info-hiding 테스트 한 개가 5초 timeout(486/487 통과), 다른 검사를 겹치지 않은 동일 `./dev.sh test` 재실행은 **25파일·487개 전부 통과**했다. timeout을 규칙 결함으로 단정하거나 한도를 늘리지 않았다. 문서용 감사 스크립트가 knip unused에 걸린 건 `.txt` 부록으로 수정했다. 최종 결과는 아래 표에 기록한다.

| 검사 | 결과 |
|---|---|
| lint | 통과 |
| check / knip | 부록 형식 수정 후 전체 재실행 통과, 미사용 항목 0 |
| test | 25파일·487개 통과, 규칙 벡터 227 포함·fast-check 포함 |
| test:browser | Chromium+WebKit 32파일·226개 통과 |
| build:web | 1016.3 KiB / 1536 KiB, 외부 URL 0건 |
| e2e | 56 통과·4 skipped. timing WebKit 표본 max 827ms이므로 전체 턴 ≤700ms 충족으로 확대하지 않음 |
| apk:debug / android:test | 웹 빌드 뒤 APK·JVM·Lint 통과. 기존 Gradle 10 deprecation 경고 유지 |
| test:net | 1파일·9개 통과 |

실기기 검증과 에이전트 비교 실험은 미실시다. 이 기준선은 미래 계획 기능의 합격 증거가 아니다.

문서 로컬 링크 11개·계측 JSON 파싱·벡터 합계/순환 수 교차 검사 및 `git diff --check` 통과.

## 9. 첫 실행 인계

R1은 별도 브랜치 `refactor/protocol-domain-types`의 [PR #93](https://github.com/kywoo26/p2p-gostop/pull/93)으로 제출했다(head `611074f`, base `bb389e5`). 이 문서 PR의 병합을 기다리지 않았다. 7개 도메인 모양 재정의→0, 오류 목록 3→1, protocol LOC 5,762→5,726. 공개 타입 30개 모양 비교와 wire 41벡터+14추가 입력 결과 해시가 일치했다. 전체 Docker 회귀의 전후 테스트 수가 같으며 상세 재현은 [R1 검증 기록](https://github.com/kywoo26/p2p-gostop/blob/611074f/docs/reviews/refactor-protocol-domain-types.md)에 있다. R2 이후는 미착수이고 웹 UI·빌드 영역은 사용자 재지시를 기다린다.
