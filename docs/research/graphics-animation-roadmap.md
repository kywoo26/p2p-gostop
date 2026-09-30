# 그래픽·애니메이션 현대화 로드맵

> 연구 제안, 2026-09-30 UTC(한국 시간10-01) 확인. **규범 개정 승인이나 구현 완료 문서가 아니다.** 기준: `intend.md` → `spec.md` → `plan.md`, 최신 `docs/design/ui-spec.md`. 제품·자산·의존성 변경 없음.

## 먼저 읽을 결론

**추천: 시각 설계 과정을 교체하고, 게임 렌더링은 우선 Svelte 5 + DOM/img + WAAPI로 개선한다.** 현재 비주얼이 충분하다는 결론은 아니다. 현행 화면은 카드 외 영역의 정보 위계와 사건의 시각적 개성이 약하고, 홈의 재질 표현과 게임판의 평면 표현도 일관되지 않다(연구자 시각 평가). 먹빛·한지·황동의 정체성은 보존하되, 현대 카드 게임처럼 **카드 중심의 정밀한 표면, 목적이 있는 운동, 획득 결과를 알아볼 수 있는 피드백, 대표 사건의 한 가지 기억할 표현**을 만들어야 한다. 전면 렌더러 재작성은 이 과제를 대신 해결하지 않는다.

| 결정 근거 | 이번에 새로 확인한 것 | 의미 |
|---|---|---|
| 용량 회계 | `efb0702` 기본 dist 1,562,550 B / 1,572,864 B, 여유 10,314 B. 전체 파일 gzip 모형 701,123 B, Brotli 모형 635,034 B | 디스크·전송·초기 요청을 섞으면 예산 판단이 달라진다. 새 엔진이나 큰 효과 팩은 현재 gate에서 바로 채택할 수 없음 |
| 운동 품질 | 두 표적 경로에서 Chromium 완료 537/374ms, WebKit 549/379ms. WebKit rAF 간격 p95 60/54ms | AC-06 완료 시간 통과와 매끄러운 프레임은 별도. 모바일 성능 판정은 아님 |
| 정합·전력 | active replay의 reset/dispose 세대 무효화 부재, FLIP 중 스타일 읽기/애니메이션 쓰기 혼합, strong 행동표식의 무한 box-shadow 애니메이션 | 새 효과보다 취소·최신 snapshot·idle 계약을 먼저 명확히 해야 함. 실제 장애·배터리 소모량은 미재현 |
| 현대화 도구 | Penpot 토큰/프로토타입/MCP, frontend-design 스킬, Bits UI, Motion, Pixi/Phaser/Threlte/Rive 공식 자료 비교 | 디자인 도구·에이전트 지침·렌더러·UI 부품은 서로 다른 역할. 이 앱에는 디자인 반복 과정 개선이 가장 직접적 |

**기준 분리:** 직접 빌드·계측한 main은 `efb070238c9562e89ada87341c6620d6104ed679`(#187 포함). #185 PA06은 연구 중 `41f603cedbe10c4cf128854c8775e0d4a61b1311`에 병합됨을 GitHub에서 확인했다. 사용자 전달 검증은 CI 3/3, CLEAN, 20화면, 해당 PR head bundle **1528.0/1536KiB**다. ScoreChanged 콜아웃 큐·읽기 시간 보완을 현재 변경으로 반영한다. 새 runtime/asset 아키텍처를 도입한 변경은 아니다. 초기 scoreBreakdown 없는 복원의 첫 변화 콜아웃 생략은 수용 제한이다. 최신 main을 본 연구에서 재빌드·재계측하지 않았고 아래 수치를 최신 main 실측으로 전용하지 않는다. #188 inert 수정은 별도, #169 axe 지연 조사는 대기 상태다.

**미검증:** Galaxy/WebView·iPhone Safari 실제 fps/열/전력/첫 로딩, cold 카드 decode, GPU layer/메모리, P2P 취소 경쟁의 재현, Canvas 및 엔진 대안의 A/B 성능, 새 시각안의 사용자 인지 개선. 기존 스크린샷·자동 접근성 통과는 이 항목들을 증명하지 않는다.

사용자에게 필요한 큰 결정은 다음 **3개**다. 지금의 연구 문서는 승인 요청을 받은 규범으로 해석하지 않는다.

1. **시각 목표:** A 먹빛·한지의 현대 카드 테이블(추천) / B 새로운 팔레트·브랜드까지 포함한 재설계. A도 현재 화면의 위계·타이포·연출을 적극 재설계하며, B는 기존 화면 방향 재승인이 필요하다.
2. **예산:** A 전체 dist 1.5MiB 유지하며 절감 후 재투자(추천) / B 초기 필수·세션 전체의 압축 전송을 별도 회계하고 디스크 상한은 baseline 후 재승인. B의 새 숫자는 이번 연구로 확정하지 않는다.
3. **렌더링:** A DOM/WAAPI 개선 및 디자인 프로토타입 우선(추천) / B 이후 제한된 효과 레이어 A/B까지 승인. 전면 게임 엔진 전환은 A/B 이득 확인 전 채택안이 아니다.

## 1. 현행 기준과 병목 증거

읽은 기준은 AGENTS 전체, intend/spec/plan, `art-direction.md`, `ui-spec.md`, `pro-skin-validation.md`, `pro-assets.md`, `commercial-reference-review.md`, 성능/애니메이션 관련 리뷰·검증 기록과 실제 anim/playback/UI/pro-assets/build/static serving 코드다. 오래된 전문 스킨 방향보다 최신 UI 규범이 우선한다. 기존 `pro-assets.md`의 4.5MiB/3MiB/48MiB/64MiB·배터리 후보는 승인된 상한이나 본선 실측으로 승격하지 않는다. CI 빌드 소요 시간도 게임 fps가 아니다.

### 1.1 세 종류의 바이트를 분리한다

Node 24.21.0/npm 11.19.0에서 새 checkout `npm ci`를 먼저 실행하고 기본 `npm run build -w packages/web` 성공. 아래는 파일별 raw 길이, Node zlib gzip level9·Brotli quality11 길이의 합이다. 파일마다 별도로 압축했으며 HTTP header·TLS·TCP 비용은 포함하지 않는다. 미압축 바이너리까지 기계적으로 압축한 **비교 모형**으로, 실제 서버 전송량은 아니다. B는 바이트, KiB=1024 B, MiB=1024² B다.

| 중복 없는 카테고리 | 파일 | dist B | gzip 모형 B | Brotli 모형 B |
|---|---:|---:|---:|---:|
| JS(main·Gallery·AI worker·AI core) | 4 | 569,445 | 183,835 | 153,923 |
| CSS(main·Gallery) | 2 | 90,185 | 19,318 | 15,648 |
| WOFF2 | 1 | 144,248 | 144,297 | 144,253 |
| 카드 SVG(51앞면+뒷면) | 52 | 620,988 | 253,950 | 224,629 |
| skin WebP | 6 | 84,804 | 84,957 | 84,828 |
| HTML·고지·manifest 등 | 10 | 52,880 | 14,766 | 11,753 |
| **전체** | **75** | **1,562,550** | **701,123** | **635,034** |

카드/skin의 라이선스·manifest는 마지막 행 카테고리에 넣어 이중 계산하지 않았다. skin 디렉터리 자체는 고지 포함 87,893 B다. `check-bundle.mjs`는 전체 dist를 세므로 지연 import도 현행 전체 한도를 줄이지 않는다. 가장 큰 main JS 498,865 B, main CSS 88,396 B, 폰트 144,248 B, key-art 54,482 B, AI worker 49,658 B, 가장 큰 카드 SVG 28,235 B다. font 160KiB 하위 한도에는 19,592 B가 남지만 **전체 여유는 10,314 B**이므로 동시에 쓸 수 있는 별도 예산이 아니다.

| 측정 이름 | 이번 결과/정의 | 해석 제한 |
|---|---|---|
| 전체 배포 디스크 | 위 dist 파일 합, 1525.93KiB | APK 압축 크기나 첫 화면 전송량 아님 |
| cold guest 진입 응답 body | fresh browser context → `?role=guest` → 이름 입력란과 fonts.ready. Chromium 322,899 B, WebKit 323,065 B | Vite preview의 실제 압축 응답. HTML/main JS/CSS/font까지의 진입점만; 카드 전체·나중 경로·세션 전체가 아님 |
| cold guest Chromium transferSize | 위 4응답 합 324,099 B | Resource Timing의 응답 header 포함 계수이며 무선 전체 패킷 바이트 아님 |
| local load event | Chromium 약65ms | 무제한 loopback·desktop, 핫스팟 2초 통과 주장 불가 |
| 외부 요청 | build literal gate 0, synthetic 두 경로의 외부 시도 0 | 전체 모든 사용자 경로에 대한 네트워크 증명 아님 |

Android `SmokeServer.kt`의 serveAsset는 파일 bytes를 읽어 respondBytes, `relay-dev/src/static.ts`도 raw Content-Length 응답이며 현재 읽은 경로에 Content-Encoding 구현이 없다. preview gzip을 Android/LAN의 값으로 쓰면 안 된다. Android는 hashed assets immutable, cards/skin은 no-store인 경로와 relay의 versioned immutable 전략도 다르다. **현행 내 절감 순서:** 불필요한 릴리스 CSS/평가 경로 잔류 분석 → SVG 손실 없는 최적화 비교 → 홈 전용 JS의 guest 초기 경로 분할 → 텍스트 사전 압축 serving 검토. 마지막은 전송만 절감하고 `.gz/.br` 중복 배포는 dist 회계가 오히려 증가할 수 있다. WebP/WOFF2 재압축은 위 수치상 이득 없음. 카드 WebP 전환은 도상 확대 품질·decoded memory 비교 없이 권고하지 않는다.

### 1.2 두 표적 경로: 끝나는 시간과 프레임 간격

기존 `e2e/timing-fixtures.ts`의 match-capture와 banner synthetic save를 production preview에서 각각 한 번씩 재생했다. desktop headless Chromium153.0.8010.12/WebKit26.6, viewport412×840 DPR3.5, CPU/network throttle 없음. 카드 이미지를 먼저 decode한 **warm animation**이다. Chromium trace는 경로별 1개, 총2개. rAF 관찰은 클릭 준비부터 완료 감지까지이며 화면에 실제 표시된 GPU 프레임을 센 것이 아니다. 계측 wrapper/trace 오버헤드가 있고, 소표본 p99는 거의 최댓값이다.

| 엔진·경로 | 계획/완료 ms | rAF 간격 p95/p99 ms | 관찰 간격 수 / >25ms | rect/style 읽기 / WAAPI 시작 |
|---|---:|---:|---:|---:|
| Chromium 매칭·획득 | 500 / 537 | 16.8 / 16.8 | 33 / 0 | 231 / 109 / 33 |
| Chromium 뻑 배너 | 340 / 374 | 16.8 / 16.8 | 23 / 0 | 197 / 67 / 21 |
| WebKit 매칭·획득 | 500 / 549 | 60 / 86 | 23 / 8 | 231 / 109 / 33 |
| WebKit 뻑 배너 | 340 / 379 | 54 / 54 | 19 / 4 | 197 / 67 / 21 |

Chromium 매칭 trace의 Layout 50회/4.095ms, UpdateLayoutTree 75회/6.683ms, Paint 70회/5.759ms; 배너는 각각30회/2.619ms,51회/4.633ms,65회/4.696ms. 이벤트 영역은 서로 중첩될 수 있어 합산 CPU 점유율로 쓰지 않는다. decode/composite 항목 미포착은 비용 0의 증거가 아니다. 현재 Chromium에서 layout이 주 병목이라는 증거는 없고, WebKit 긴 간격 원인은 이번 trace로 특정하지 못했다. 데스크톱 WebKit 결과를 iPhone fps·열·배터리로 표기하지 않는다.

### 1.3 실제 코드의 순서·수명 계약

| 코드 근거(기준 efb0702) | 직접 확인 | 필요한 판단/후속 검증 |
|---|---|---|
| `src/anim/choreo.ts` runStep/measure; `game/playback.svelte.ts` attach | applyEvent/onEvent → before rect → board commit → Svelte tick → after rect → 각 카드의 CSS 시간/transform 읽기와 animate 호출 | [Svelte tick](https://svelte.dev/docs/svelte/lifecycle-hooks#tick)은 DOM 갱신 대기이며 paint 완료 보장이 아니다. before/tick/after는 보존하되 style/duration 읽기를 모은 뒤 animation 쓰기. affected-card 축소는 좌석/정렬 이동 누락 반례 검증 후 |
| `anim/choreo.ts` deal; `anim/flip.ts` baseTransform/flipCard | 분배의 카드별 rect→animate 혼합, flip 내부 style 읽기 | 일괄 읽기/쓰기 후보. 이번 rect 시간 Chromium3.2/1.8ms만으로 큰 개선률을 주장하지 않음 |
| `anim/flip.ts` hold/release/sequence/finishAll | temporary will-change 복원, finished resolve/reject 정리, cancel AbortError 수용, skip 후 duration0 | [WAAPI finished](https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished) 재생별 Promise 수명과 앱 snapshot 수명은 별도. cancel을 성공처럼 종료해도 오래된 commit을 막지는 않음 |
| `game/playback.svelte.ts` enqueue/reset/dispose/play/pump | FIFO, reset은 queue만 비움; play는 await 뒤 batch.board를 무조건 씀. dispose/attach(null) 전 캡처 host가 살아 있음. catch는 대기 queue 마지막만 snap | active batch 뒤 reset/new snapshot의 stale write 가능성은 **정적 코드 추론**, 실제 P2P 실패 재현 전. generation/round/accepted snapshot identity로 commit·onEvent·onIdle 무효화, 실패한 active의 권위 뷰도 고려 |
| `p2p/guest.svelte.ts` snapshot 처리 + Playback | snapshot도 빈 events batch로 enqueue하는 경로 | 정상 연속 events는 FIFO 보존, 복구 snapshot은 과거 재생을 수렴시키는 계약을 분리. 모두 최신으로 덮어 사건을 잃거나 이전 뷰 숫자를 선행 표시하면 안 됨 |
| `ui/Card.svelte`; `pro-assets/runtime.ts`·Scene/Sprite | 현행 card img는 decode 명시 장벽 없음. 평가 runtime은 URL별 decode promise cache/finite RAF; release 평가 모드와 구분 | upcoming bounded set decode와 오류 fallback 실험. 모든 tier predecode 금지. 평가 atlas/메모리를 현재 본선 사용량으로 주장하지 않음 |
| `styles/skin-marks.css` skin-action-breath | strong+no-preference에서 box-shadow 1.6s infinite | NF-04/UX-17의 idle·transform/opacity 원칙과 UX-H05의 strong pulse 허용 간 충돌. JS RAF가 없어도 반복 paint 가능. 유한 입력 피드백 또는 idle 중 정적으로 명확화; 실제 전력 차이 미측정 |

#185는 ScoreChanged→milestones→EventRail 콜아웃 큐, 사건 읽기시간1200ms와 선택/판 전환 처리를 보완했다. efb0702의 단일 deferred 문구 한계를 그대로 최신 main의 미구현으로 쓰지 않는다. 그러나 별개의 Playback active replay 무효화 문제는 읽은 #185 diff에서 해소되지 않았다. 신규 연구는 이 수명 계약과 동시 특수 사건/복원/스킵 경계를 확인하며 PA06을 다시 구현하지 않는다.

## 2. 구식 화면을 바꾸는 시각·연출 목표

현대화의 판단 기준은 새 프레임워크 이름보다 **플레이 중 다음 행동과 결과가 읽히는가**다. 승인된 전체 앞면/48px 손패·바닥, 획득32px, 5×3 floor, 황동 차례선, 최소 표면을 보존한다. 단순 예쁜 홈 스크린샷만으로 게임판 연출을 승인하지 않는다.

| 우선순위 | 유지/바꿀 표현 | 제안 검증 |
|---|---|---|
| 1 도상·입력 | 카드 선/흰 면/붉은 띠가 중심. 48px 클릭영역, 앞면100%, 동일 월 인접. 확대 시 SVG 선명도 비교, 매칭선과 행동 그림의 stroke/여백 통일 | 360폭·200% 확대 패널·터치 놓기/cancel/키보드. 폭탄/종22px 받침이 도상을 덮는 범위 감사. 개인 비공개 패 유출0 |
| 2 진영 위계 | 내 점수→고/배수/잔액→획득 진행의 강약; 상대에도 같은 문법. 숫자 tnum·단위 정렬, 반복 문구 축소. 여백/선/정렬로 깊이를 만들기 | 숫자만 보기/긴 이름/최대 금액/선택+재연결에서 레이아웃 안정. 초점 순서와 단일 status 발화 확인 |
| 3 카드 운동·획득 | 낸 카드→매칭→더미 공개→획득의 인과를 이어 보이기. 착지/획득 행의 유한 opacity/transform 강조를 동기화. 모든 카드를 spring으로 흔들지 않기 | 기존 UX-15 시간 유지. 취소/연속 도착/rotation/skip에서 마지막 authoritative view 일치; 결과 위치를 사용자가 설명할 수 있는지 소규모 비교 |
| 4 고·특수 사건 | 하나의 시그니처: 레일 안 먹선 도형+짧은 한지 콜아웃. 고/스톱은 선택과 결과를 구분. #185 큐 이용, 다른 팩 입자/금속 프레임 섞지 않기 | PA06 20화면에 동시 사건·긴 문구·복원 제한을 연결. reduced-motion은 움직임0, 읽을 문구는 유지. 입력/700ms 턴을 막지 않음 |
| 5 정산·홈 | 정산 숫자와 배수의 단계적 등장, 고정 다음 행동. 홈과 게임판의 표면·타이포 연결 | 승/패/밀기/나가리/파산, 즉시 skip, 200% 초점. 큰 원화/질감은 홈 한 곳만. 박스탬프·PA06b 음향은 기존 별도 gate 유지 |

**모던한 대안의 탐색 범위:** A는 정밀한 인쇄물처럼 구성한 현대 화투 테이블(현행 팔레트·단선·명료한 숫자). B는 더 대담한 일러스트/전시형 카드 앱(홈·정산의 강한 그래픽, 게임판은 고밀도 기능 유지). B의 팔레트/서체 추가/표면 장식은 UX-11/13 재승인 전 구현안이 아니다. 재질·조명은 필요 시 upper-left 한 방향으로 작은 자산에 bake하고 런타임 blur/filter/전면 조명은 피한다. 배경 한지가 실제 한지처럼 보이는 것과 카드가 알아보기 쉬운 것은 별도로 평가한다.

### 2.1 현재 게임에서 참고할 부분과 복사하지 않을 부분

아래는 공식 공개 설명/자료의 방향 참고이며 앱 설치·입력 지연·전력 측정은 하지 않았다. 상용 아트·코드·사운드는 가져오지 않는다. 기존 Marvel Snap/Balatro 연구를 반복하지 않는다.

| 공식 사례 | 직접 증거 | 우리 앱에 옮길 원리(추론) / 제외 |
|---|---|---|
| [Pokémon TCG Pocket](https://tcgpocket.pokemon.com/en-us/) | iOS/Android 카드 수집, 카드 일러스트 속으로 들어가는 immersive card 소개 | 카드 자체를 시각 중심으로 두고 드문 성취에 집중된 연출. 수집/팩 개봉·3D immersive scene은 고스톱의 빠른 턴 및 예산에 부적합. 공식 사이트 reduced-motion 토글은 게임 자체 지원 증거로 쓰지 않음 |
| [Slay the Spire 2 공식 gameplay trailer 페이지](https://www.megacrit.com/news/2024-12-12-gameplay-trailer/), [최신 개발 뉴스](https://www.megacrit.com/news/) | 카드 게임 gameplay 공개, 2026-09 개발 소식까지 유지 | 결과를 공간의 대상에 연결하는 모션·명확한 카드/대상 구분을 다음 동영상 분석 과제로 삼음. 이번 연구가 실제 trailer frame-by-frame 분석이나 모바일 비교를 수행한 것은 아님 |

사례의 인기·판매량·프로모션 영상은 특정 framework 채택 근거나 장치60fps의 증거가 아니다. **다음 디자인 검토물은 정지 contact sheet와 synthetic 턴 재생 클립 한 쌍**이어야 한다. 현행/A/B를 같은 상태·동일 속도·동일 공개 뷰로 비교하고, 카드가 어디로 갔는지·누가 획득했는지·다음 행동이 무엇인지 설명 가능성을 먼저 묻는다. 학습된 화투 도상을 현대적으로 재해석할 때도 월/종류 식별성을 떨어뜨리는 장식은 중단한다.

## 3. framework·OSS·skill을 넓게 검토한 결과

공식 유지보수/가격/호환 자료를 2026-09-30 조회했다. 도구를 이 연구에 설치하거나 외부 skill을 실행하지 않았다. 다음은 유행 순위가 아닌 목적별 비교다. runtime 라이브러리는 plan §1.8 승인과 실제 빌드 차이 측정 없이 추가할 수 없다.

| 도구·직접 근거 | 실제 도움 | 이 앱의 비용/판정 |
|---|---|---|
| [Penpot](https://penpot.app/), [MPL-2.0 저장소](https://github.com/penpot/penpot), [2.18.0 릴리스](https://github.com/penpot/penpot/releases/tag/2.18.0)(09-23) | 토큰·컴포넌트·flex/grid 프로토타입, SVG/CSS inspect, MCP로 design↔agent 작업 | **디자인 작업 후보 추천.** 무료 self-host 가능; 앱 bundle 추가0. 서버 운영/계정/자산 동기화 비용은 별도. MPL은 Penpot 소스 변경 파일 배포에 적용, 우리 출력 디자인 전부를 MPL로 만드는 뜻 아님. MCP 읽기/쓰기 권한 및 로컬 export pin 필요 |
| [Anthropic frontend-design SKILL](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md), [개별 Apache-2.0](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/LICENSE.txt) | generic UI 회피, 의도 있는 방향·차별점·두 번의 critique. 확인한 공식 저장소 최근 commit은09-29 | **프로젝트용 짧은 디자인 brief에 적용할 원리 추천.** 기존 tokens/48px/한글폰트/금지 목록이 우선. 복사·변형 배포 시 license/notice/변경 고지; runtime0. root skills 저장소의 다른 라이선스를 전체에 가정하지 않음 |
| [Vercel web-design-guidelines](https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md), [공식 README의 MIT 선언](https://github.com/vercel-labs/agent-skills) | focus/touch/reduced-motion/compositor/타이포 audit, React/Next skill과 역할 분리 | audit 참고 후보. 이 앱을 React/Next로 이전할 이유는 없음. 개별 고지/소스 pin 확인 뒤 재사용, 최신 guideline 자동 fetch의 변경을 검토 없이 신뢰하지 않기. deployment skill은 LAN 앱 목적과 무관 |
| [Bits UI](https://www.bits-ui.com/docs/introduction), [2.19.3 manifest](https://raw.githubusercontent.com/huntabyte/bits-ui/main/packages/bits-ui/package.json)(MIT, Svelte ^5.33) | 스타일 없는 dialog/popover/focus/키보드 부품; Tailwind 필수 아님 | 접근성 부품의 반복 결함이 입증될 때 **국소 의존성 제안**. 자체 게임판 아트를 만들어주지는 않음. Floating UI/runed/tabbable 등 전이 비용과 기존 dialog 테스트 이전을 측정; #188/#169를 라이브러리 교체로 우회하지 않음 |
| [Motion animate](https://motion.dev/docs/animate), [MIT 소스](https://github.com/motiondivision/motion), [npm 공식 metadata](https://registry.npmjs.org/motion/latest)(13.4.6) | JS/SVG용 mini와 hybrid, spring/sequence·스타일 batch | mini2.3KB/hybrid18KB는 제공자 표기(압축 정의 미명시), 우리 dist 증가량 아님. 현재 WAAPI 순서를 대체할 이득 미증명. 필요 시 단일 효과 prototype만 비교; 프레임/취소 문제를 자동 해결한다고 주장하지 않음 |
| [GSAP 현행 무료 라이선스](https://gsap.com/community/standard-license/) | 정교한 timeline·SVG authoring | 상업 사용도 no-charge지만 경쟁 visual animation builder 제한이 있는 별도 라이선스. 무료와 OSI OSS를 혼동하지 않음. 현행 **금지 유지**, 재검토도 plan 개정 제안으로만. 자체 FLIP·상태 큐와 중복, vendor benchmark 성능 수치를 채택 근거로 쓰지 않음 |
| [Pixi8.21.0](https://github.com/pixijs/pixijs/releases/tag/v8.21.0)(09-17), [Phaser4.2.1](https://github.com/phaserjs/phaser/releases/tag/v4.2.1)(07-09) | 2D sprite/배치 렌더링 vs scene/input/tween을 포함한 게임 framework | **현행 둘 다 금지.** 원 제공자 [Pixi MIT](https://github.com/pixijs/pixijs/blob/dev/LICENSE)·[Phaser MIT](https://github.com/phaserjs/phaser/blob/master/LICENSE.md) 고지 확인, 유료/NC 때문에 기각하는 것은 아님. Phaser를 과거3.x 정보만으로 평가하지 않음. 전면안 C의 대표만 비교, physics/scene loop가 필요 없는 턴제에 과잉일 가능성. 패키지 정확한 추가바이트·모바일 성능 미측정 |
| [Threlte](https://threlte.xyz/), [MIT 고지](https://github.com/threlte/threlte/blob/main/LICENSE.md) | Svelte의 Three.js 3D scene 작성 | SSR/React 도입 없이도3D는 가능하지만 현재 카드/table의3D 필요가 입증되지 않음. geometry/light/material·텍스처·GPU·접근성 유지 비용이 큼. 신규 의존성 제안 승인 전 제외 |
| [Rive pricing](https://www.rive.app/pricing) | 디자이너 state machine·vector motion, agent 기능 | 무료 editor 학습과 앱용 `.riv` export를 분리: 현재 export는 유료 Cadet부터. **무료 채택안 제외.** OSS runtime이 있다고 authoring/export까지 무료라고 쓰지 않음 |

AI frontend 생성 서비스도 별도로 비교했다. [v0 공식 FAQ](https://v0.app/docs/faqs)는 Next.js/React/Tailwind/shadcn 중심의 전문성과 디자인 반복·코드 export를 설명하고, [현재 changelog](https://v0.app/changelog)에는 Svelte 관련 수정도 있다. Svelte가 전혀 불가능하다고 단정하지 않는다. [Lovable 공식 디자인 소개](https://lovable.dev/designers)는 시각 편집·React/Tailwind 작업을, [FAQ](https://docs.lovable.dev/introduction/faq)는 full-stack 생성·cloud/backend 연계를 설명한다. 이런 도구의 **시각 편집→즉시 preview→부분 수정** 과정은 참고할 가치가 있지만, 생성 결과를 이 앱에 붙이는 것은 금지 스택·cloud 경계·게임 상태/ARIA를 다시 감사하는 비용이 든다. 무료 한도 내 반복 가능성과 이 게임의 품질 개선은 미검증이므로 무료 채택안으로 추천하지 않는다. 외부 프로젝트/계정 연결이나 실제 앱 자료 업로드도 하지 않았다. 같은 반복 과정을 로컬 gallery·Penpot·짧은 디자인 brief로 먼저 구축하는 쪽을 추천한다.

“스킬을 많이 넣으면 화면이 좋아진다”도 검증 대상이다. [WebDev-Skills-Bench 원 논문](https://arxiv.org/abs/2608.23067)(2026-08-24 preprint)은 31스킬/50프로젝트/4모델에서 주입 시 평균 완수율 저하·토큰 증가를 보고한다. 이 결과를 우리 Sol/Svelte의 효과 수치로 전용하지 않는다. 따라서 한 개의 짧은 프로젝트 brief와 스킬 없음 비교를 같은 fixture로 시행하고, 디자인 판정·수정횟수·접근성 실패·토큰/시간을 기록한다. stack에 맞지 않는 예제 묶음을 상시 주입하지 않는다.

**에이전트에게 줄 brief 초안:** 목적(두 사람이 결과를 즉시 이해) → 고정 constraints(현재 UX/공개 뷰/예산) → 시각 차별점 한 가지 → 같은 상태의 두 방향 → 정지/운동/200%/reduced 네 가지 검토 → 사용자가 고른 방향만 구현. Penpot MCP·스킬이 없어도 현행 `/dev/gallery`의 상태 fixture와 토큰으로 가능하다. 디자인 원본과 구현물의 기준점·출처를 남기는 과정이 필요한 것이며, 이 문서가 새 skill 파일을 승인하거나 설치하는 것은 아니다.

### 3.1 렌더링 구조는 최대 세 안

아래 시간은 **연구자 계획 추정**, 개인 작업시간 기준이며 실측 생산성이나 견적 확정이 아니다. A의 시각 재설계 자체에도 별도 반복 비용이 든다.

| 항목 | A DOM/img/SVG + WAAPI 유지(추천) | B 제한된 Canvas2D/WebGL 효과 레이어 | C 전면 게임 렌더러(Pixi/Phaser 등) |
|---|---|---|---|
| 범위/효과 | DOM 진영·카드·입력, 읽기 batching·취소·유한 연출 | 카드/정보/초점은 DOM. 레일 또는 획득 주변 비입력 효과만 | 카드·배치·이벤트·좌표·입력·zoom을 scene graph로 이전 |
| 성능 가설 | 현행 소수 카드에는 충분; 효과 추가와 정합을 별도 개선 | 많은 입자/먹선 변형이 DOM보다 유리할 때만 | 대량 sprite batching에는 유리, 현재 수십 카드의 우세 미증명 |
| bundle | 라이브러리 추가0; CSS/JS 증분도10KiB 여유 내 절감 필요 | 자체2D 코드도 실측 필요, WebGL shader·asset 증가 | 새 engine 비용 미측정; 현행 gate 및 금지 조항 변경 필요 |
| ARIA/48px/200% | 기존 의미 구조·초점·확대 패널 재사용 | aria-hidden·pointer-events:none, 같은 내용은 DOM에서 제공 | 별도 DOM overlay/확대 패널 필요. [Pixi 접근성](https://pixijs.com/8.x/guides/components/accessibility)은 opt-in DOM overlay이며 전체 UI 보장 아님 |
| 전력/복귀 | 무한 CSS 제거, hidden 시 snapshot 수렴 | 유한 RAF, hidden 중0, resume redraw/texture 폐기 | [Pixi 기본 loop](https://pixijs.com/8.x/guides/concepts/render-loop)는 반복. 별도 on-demand/stop 계약·context-loss 복구 |
| 지원/디버깅 | 현재 Chromium/WebKit 기반. 기존 replay tests 활용 | 캔버스 fallback, 장치별shader/손실 테스트 추가 | Safari/WebView GPU backend별 검증 + hit-test/scene 수명/DOM 동기화 이중 구현 |
| 실험/개발 추정 | 정합·batch 표적8–16h, 시각prototype8–16h | 효과1종 prototype16–32h, 복귀/측정8–16h | 보드 prototype40–80h, 동등 접근성·P2P·회귀까지80–160h 추가 |
| 채택/중단 | 회귀·가림·100ms 입력/700ms 턴 악화면 되돌림 | 같은 연출에서 A보다 이득이 반복 관측되고 전력/메모리·접근성 악화 없어야 승격 | A/B 실기기에서 개선이 검증되고 이중 UI 비용을 수용하기 전 **추천하지 않음** |

메모리 계산도 바이트와 구별한다. RGBA8 bitmap 512²=1MiB,1024²=4MiB,2048²=16MiB. 412×840 CSS px/DPR3.5 전면 canvas의 한 buffer는 1442×2940×4≈16.17MiB(여러 buffer·texture·드라이버 비용 별도). 반면 160×160 CSS px/DPR2의 국소 buffer는0.391MiB다. **이는 계산값**, 실제 GPU resident memory가 아니다. SVG도 표시 시 raster 비용이 있고 transform/will-change가 layer를 유발할 수 있다. 전면 DPR 무제한·모든 카드 영구 will-change·큰 atlas를 압축 전송량만 보고 채택하지 않는다.

### 3.2 최신 API를 LAN에 적용할 수 있는가

| API·공식 근거 | HTTP LAN / 호환 확인 | 판정 |
|---|---|---|
| Canvas/OffscreenCanvas/Worker: [WHATWG canvas](https://html.spec.whatwg.org/multipage/canvas.html), [Worker 문서](https://developer.mozilla.org/en-US/docs/Web/API/Worker) | 기본 canvas/OffscreenCanvas는 secure-context 전용 선언이 아님; classic/module worker는 same-origin 로컬 파일·지원 확인. shared memory는 별도 isolation 조건 | Worker는 DOM rect·초점을 다룰 수 없음. message/copy·수명 비용이 있어 현재layout 병목 해결 수단으로 바로 채택하지 않음 |
| Offscreen WebGL: [WebKit 담당자 확인](https://www2.webkit.org/show_bug.cgi?id=254071) | iOS/iPadOS17+, macOS Sonoma 필요. API 존재와 해당 context 생성 성공을 따로 확인 | B에서 main-thread2D fallback이 있을 때 조건부. Android minSdk33만으로 WebView engine 버전 확정 불가 |
| WebGPU: [MDN API 제약](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API), [Safari26 공식 발표](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) | Safari26에서 지원 추가됐으나 WebGPU는 secure context 필요. LAN `http://192.168.x.y`는 해당하지 않음 | 기본 guest renderer **불가**. host loopback에서만 되는 API로 공통 UI를 분기할 가치 미증명. WebView 실제 지원도 별도 확인 |
| WebGL context loss: [Khronos 규격](https://registry.khronos.org/webgl/specs/latest/1.0/), [WebKit 복귀 이슈](https://bugs.webkit.org/show_bug.cgi?id=286707) | context loss/restored 처리 필요; 공개 이슈의 Mac 재현을 iPhone 현재 버그로 단정하지 않음 | CPU authoritative view 보존→hidden stop→restore 재생성/redraw→실패 시 DOM 정적 fallback. 복귀 때 과거 폭죽 재생 금지 |

새 서비스워커/Cache API/PWA install/원격 CDN을 offline 보장의 우회로로 제안하지 않는다(비보안 guest 규범). host의 번들 정적 자산으로 모든 경로가 작동해야 한다. native 앱/Flutter/React Native/Godot web export로 전환하는 것은 Android host+iPhone 무설치·같은 UI 목적부터 다시 설계해야 하므로 이번 C안보다도 범위가 크고 추천 대상이 아니다.

## 4. 무료 외부 자산: 필요별 다섯 후보만

확인일 모두2026-09-30. 표의 라이선스는 **원 제공자의 해당 항목 직접 표기**, 적합성은 연구자 추론이다. 새 샘플 구매·다운로드·제품 반영은 하지 않았다. 배포 전 선택한 파일 해시·개별 고지·변환 결과를 확정해야 한다. 상용 이미지 참고는 자산 후보가 아니다.

| 필요/후보 | 상업·재배포·변형·표기/SA | 해상도·메모리·압축/한글 | 적합성·선택 |
|---|---|---|---|
| 카드: 기존 [Hwatu January Hikari 개별 원본](https://commons.wikimedia.org/wiki/File:Hwatu_January_Hikari.svg), 기존48원본 대응표 | CC BY-SA4.0: 상업·재배포·변형 허용, 저작자/원본/변경/라이선스 고지. [법문](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)의 Adapted Material 조건 적용. 파생 카드 아트의 SA를 앱 전체 코드 의무라고 단정하지 않음 | 원본103.2×168.2 SVG, 현재52SVG620,988 B. 표시 raster 크기는 DPR에 비례; 한글 UI 폰트와 무관 | 카드 교체보다 stroke/정렬/상태표식 개선 우선. 이번에는1개 원본을 재확인, 나머지47개는 기존 ATTRIBUTION/map 근거이며 새 전수 원본 조회라고 쓰지 않음 |
| 먹선: [Kenney Splat Pack](https://kenney.nl/assets/splat-pack) | 원 제공자가30파일·CC0·2022v1.0 명시, 상업/변형/재배포 가능·법적 attribution/SA 없음. 프로젝트 provenance는 유지 | 페이지에서 개별 파일 pixel크기·코덱은 **미확인**. 만약256²RGBA 출력이면0.25MiB(계산). 글자 없음 | 잉크 실루엣 후보 한 개만 색/외곽 재가공. 30개 통째/입자atlas 반영 금지. 도형이 동양 먹선에 맞는지 시각 승인이 먼저 |
| 한지 후보: [ambientCG Paper001](https://ambientcg.com/view?id=Paper001), [제공자 라이선스](https://docs.ambientcg.com/license/) | 개별 page 및 downloadable files/preview CC0 확인. 상업·raw재배포·변형 가능, attribution/SA 없음 | 1K JPG pack5MB/PNG10MB,1024²이미지1장은RGBA4MiB. zip는 전송/런타임 단일texture 크기가 아님. 실제 WebP 결과 미측정 | generic paper이지 한국 한지의 실물근거 아님. 홈/레일 작은bake 실험만, visible texture 금지 UX-11 개정 전 게임판 채택 불가 |
| display font 후보: [Noto Serif CJK 공식](https://github.com/notofonts/noto-cjk/tree/main/Serif), [개별 OFL](https://github.com/notofonts/noto-cjk/blob/main/Serif/LICENSE), [Serif2.003 릴리스](https://github.com/notofonts/noto-cjk/releases/tag/Serif2.003)(2024-07-30) | OFL1.1 상업앱 embed/변형/재배포 허용, font 단독 판매 금지, font/파생은OFL·고지 유지·reserved name 조건 확인. 앱 코드에OFL 확장 아님 | 한국어 region/variable 배포 확인. 전체CJK 금지, subset 실제B·coverage 미측정, image처럼RGBA 공식으로 font memory 계산 불가 | 현재 Pretendard1종 우선. 제목만 serif 추가는 전통 장식을 강화할 수 있으므로 현대화의 자동 해답 아님. UX-13 재승인/글리프 fallback/예산 확보 후 비교 |
| 향후 음향: [Kenney Casino Audio](https://kenney.nl/assets/casino-audio) | 원 제공자50파일·CC0·v1.1 small fixes 명시. 상업/변형/재배포 허용·attribution/SA 없음 | 압축 선택file 크기·duration 이번에 미측정. decoded PCM=초×sampleRate×channels×4(float32), stereo44.1kHz 1초≈0.336MiB(계산). 한글 발화 없음 | 기존 후보 재조사 대신 PA06b에 짧은 card contact의 slot만 연결. 선택/획득/승리 semantic 구별·Safari user activation·mute·중복음 gate 유지; 이번 채택/청취 완료 아님 |

추가 권리 발견: 현행 `public/skin/manifest.json`의 폭탄·종 그림은 **사용자 제공 참고자료 권리 확인 대기**로 명시되어 있다. 그림2종의4,326 B와 CC0 재질을 하나의 “무료 검증 완료팩”으로 묶지 않는다. 권리 확인 또는 독자적 대체 제작 결정은 소유자 gate이며 본 연구는 원본 참조 이미지를 읽거나 배포하지 않았다.

## 5. spec 개정 조항 초안과 측정 계약

다음 표는 모두 **미승인 초안**이다. 기존 NF/AC 수치를 임의로 완화하지 않는다. measured baseline이 없는 새 p95/p99·전력·메모리 숫자는 확정 권고하지 않는다. `plan.md` 상태·완료율도 이 연구로 변경하지 않는다.

| 현행 ID/취지 | 실제 문제 | 제안 문구 초안 / 필요 이유 | 측정·통과 기준 | 비용·보안·접근성 / 승인 전제 |
|---|---|---|---|---|
| NF-03 / AC-07 전체1.5MB·첫 로드2초 | spec은 전송, gate는 raw1.5MiB. 초기 guest와 전체 dist가 다름 | “1.5MiB=1,572,864 B. raw dist, 초기 필수 encoded body, 세션 전체 unique encoded body를 별도 보고한다.” strict안은 현행 raw 상한도 유지, 완화안은 전송 회계와 별도 raw 상한 승인 | strict raw≤1,572,864 B, 외부 요청0 유지. cold session 자산 누락0. 실핫스팟 진입→font/필수도상 준비·최초입력 가능≤2초 | 압축·버전 cache 검증. lazy 자산도 전체 회계에 포함. 확대/정산/재연결 offline inventory 필요. 완화 숫자는 baseline 후 사용자 승인 |
| NF-03 응답≤100ms | 턴 완료와 시각 반응 혼합 | “입력 수신→최초 pressed/accepted 피드백≤100ms. 요청/권위 응답/재생 완료는 분리한다.” | pointer/키보드별 시작점 표기, 다음 presentation의 근사/영상 측정 구분. 기존100ms 유지; p95/p99 수용 분위수는 기기 baseline 후 확정 | 계측 비용, synthetic action ID만 기록. 사용자 식별자·초대 URL 제외 |
| NF-03 60fps / AC-06≤700ms | 완료 시간만으로 긴 frame을 놓침 | “완료와 cadence를 각각 수용한다. refresh period, active 구간 frame interval p95/p99, missed-vsync 추정, trace long frame을 보고한다.” | 기존 Chromium7회 p50≤700·두 번째 최대≤900, normal1.4–2.4초 보존. 16.67ms는60Hz 주기 설명이며 새 합격 상한 아님. dropped 추정=Σmax(0,round(Δt/refreshPeriod)−1), 실제 presentation과 구분 | hosted WebKit 기록 정책 유지. [LoAF](https://developer.chrome.com/docs/web-platform/long-animation-frames)는>50ms 진단이지60fps gate가 아님. 미지원은 결측. 새 허용 비율은 baseline 후 승인 |
| NF-04 idle/전력 | JS loop 정지와 CSS 무한 pulse 충돌 | “판 대기/hidden의 장식 RAF·CSS infinite animation은 정지한다. 유한 input feedback 후 static. heartbeat/IP 감시는 기존 예외다.” | 행동 가능한 idle/상대 대기/hidden의 앱 장식 loop0; protocol timer 별도. battery/thermal은 아래 회차로 기록, 새% 상한 미정 | strong 기본값 변경 불필요. UX-H05 pulse의 유한/idle 정의 승인. loop 관찰만으로 전력 절감% 주장 금지 |
| NF-08 / UX-13 접근성 | renderer 전환 시 색·초점·200% 손실 | “효과는 공개 뷰 DOM과 동등 정보·행동을 보존한다. Canvas 장식은 aria-hidden. reduced-motion은 운동0, 문구 유지.” | 48px/앞면100%/도상/aria-label/키보드/200% equivalent panel. 가림0·중복 발화0, axe와 사람 SR/zoom 검증 분리 | 효과 overlay 입력 없음, font/CC 조건 유지. 기존 규범 명확화 우선, 새 장식은 UX 승인 |
| AC-06 / §6.4 / UX-16 정합·취소 | FIFO와 새 사건 수렴 표현, active reset 경쟁 | “정상 events는 순서 보존. 복구 snapshot/reset/dispose는 generation 무효화와 최신 accepted view snap. stale callback은 board/배너/idle을 변경하지 않는다.” | active replay 중 reset→추가 event, detach/dispose, skip+cancel, 늦은 snapshot/다음 round에서 최신 뷰와 cardIDs/점수/pending 일치. 불법 입력·숨은 정보0. 대기 없는 active 실패도 수렴 | seq/round 프로토콜 의미 유지. snapshot 접수 후 입력 unlock 시점도 정의. 정책 승인 뒤 표적 경쟁 반례 테스트 |
| FR-23 / UX-15~19 설정·읽기 | 효과 길이와 입력 잠금/콜아웃 수명 혼합 | “off/subtle/strong 저장값과 normal 기본 유지. reduced/skip은 운동을 제거하되 #185 읽기 콜아웃은 턴 진행과 독립. 동시 효과는 레일/요약으로 정보 보존.” | #1851200ms 읽기·queue/판 경계, 복원 첫 score 변화 제한 명시. 기존 시간표/fast700 유지. PA06b 음향·박스탬프 각각 gate 유지 | 읽기 연장으로 턴 대기 추가 금지. UX 중복·충돌을 별도 개정 PR로 승인 |

### 5.1 후속 baseline의 재현 단위

| 분리할 조건 | 필요한 정의/기록 |
|---|---|
| cold / warm / cache | cold: 새 profile·HTTP cache 없음·첫 요청, OS/DNS/socket warm 여부도 표기. warm: 동일 asset version의 두 번째 navigation. decode-warm: image.decode/fonts.ready 이후 턴. cold network와 warm decode를 섞지 않음 |
| 초기 필수 / 후속 / offline | route별 font/card/skin·worker·license 자산 inventory, session union 추가 합산. host가 offline으로 각 파일을 제공하는지 확인. guest cache 영속성은 보장하지 않음. lazy 최초 진입 요청도 offline LAN 요청 |
| 장치·네트워크 | 사람이 Galaxy 모델/Android/WebView, iPhone 모델/iOS/Safari,60/120Hz, 밝기·전원·핫스팟 신호·냉각 상태를 기록. 자동 viewport/DPR는 장치 실측이 아님 |
| active frame / latency | 동일 seed·카드·경로의 fast/normal/skip/reduced. input ack/권위 뷰 접수/replay 끝/tick 후 snap을 분리. 정식 frame 표본은 gesture→animation 끝 구간만. 계측 off control과 비교 |
| decode / GPU / JS memory | decode wall/error, 자산별 RGBA 계산과 동시 decoded set. heap은 JS만. GPU layer/texture는 Inspector/OS 도구의 측정 범위를 명시. 측정 불가를0으로 대체하지 않음 |
| 장시간 열·배터리 | idle10분/active20분을 후보 A/B로 교차 반복. 잔량%·OS 열 상태·frame 변화·host/guest 역할·충전 여부 기록. 이 시간은 실험 설계 후보이며 새 수용 상한 아님. OS% 해상도·환경 오차 때문에1회1% 차이로 채택하지 않음. 반복 편차 후 threshold 결정 |

일회성 재현은 저장소 루트에서 `nvm use`, `npm ci`, `npm run build -w packages/web`, `npm run preview -w packages/web -- --port 4220`. lock의 Playwright1.63.0으로 다음 순서를 사용했다.

1. 외부 origin 요청을 차단한 새 context, viewport412×840/DPR3.5. guest 이름 입력란과 fonts.ready에서 navigation/resource timing 수집.
2. [timing-fixtures.ts](../../packages/web/e2e/timing-fixtures.ts)의 `TIMING_FIXTURES[1]`, `[2]` 및 `timingSave`로 synthetic local save 설정. `?speed=fast#/`의 이어하기, `data-can-act=true`, 모든 img의 decode 완료 대기.
3. getBoundingClientRect/getComputedStyle/animate wrapper의 횟수·시간, 독립 rAF를 관찰. Chromium만 `devtools.timeline,blink.user_timing` trace. `[aria-label="내 손패"] [data-slot="<fixture.card>"]`의 좌상단+20px를 클릭.
4. solo의 숫자 `data-play-timings`가 생기면 완료/계획값 수집, 관찰 종료. rAF 분위수는 정렬 후 ceil(N×p)번째 값. Layout/UpdateLayoutTree/Paint는 이름이 같은 `ph=X` 이벤트의 dur 합계. wrapper·click 준비 시간이 섞이는 한계는 §1.2에 명시.

압축 집계는 dist 재귀 탐색→각 파일의 byteLength·`gzipSync(buffer,{level:9})`·`brotliCompressSync` quality11의 byteLength 합이다. 확장자 `.svg`이면서 cards 경로인 것만 카드 카테고리, skin의 `.webp`만 이미지 카테고리로 분류한다. 고지·manifest는 별도다. 스크립트·trace는 `/tmp`에 두고 제품 파일은 수정하지 않았다. 원문 로그/실제 초대 URL/사용자 저장은 읽지 않았다. 공개 재현물에는 개인 경로·호스트 식별자를 넣지 않는다. 관찰 wrapper를 그대로 제품 gate에 넣지 말고 후속 계측 PR에서 설계를 리뷰한다.

## 6. 후속 작업은 다섯 실행 단위

각 단위는 별도 PR. 파일은 **향후 경계 제안**이며 이 연구의 편집 권한이 아니다. 모델은 모두 gpt-6.1-sol, 추가 에이전트/Astra를 요구하지 않는다. 단위3은 #185 병합본 기준이다.

| 단위/분류 | 파일 경계·효과·의존성 | 검증·중단/rollback | 계획 추정 / effort |
|---|---|---|---|
| 1 선행 계측 | check-bundle·timing fixture/표적 perf 도구·device-test 절차. raw/encoded/session·frame/latency baseline. 기존 gate 완화 없음 | synthetic만 사용, 계측 on/off 비교. 민감 정보 노출·큰 관찰 오버헤드 시 제거. 사람 실측만 device 결과 기록 | 8–16h / high |
| 2 현행 내 정합 개선 | Playback·choreo·flip, guest 전달 접점. generation 취소/reset/snap·읽기 batch. 단위1과 취소 정책 합의에 의존 | 표적 browser 경쟁 반례·skip/cancel/hidden/final view·기존 timing. event 손실/입력 deadlock/숨은 정보/시간 악화면 변경별 원복 | 8–16h / high |
| 3 현행 내 시각 prototype→선택 후 구현 | tokens, Board/SeatBar/Hand/EventRail/Settlement/Home scoped CSS, gallery·디자인 문서. 고정 palette/48px/앞면/시간표 아래 두 방향 정지+운동 비교 | #185 큐/20화면 재사용,200%/reduced/가림/입력 latency 확인. 규범 밖 색·폰트·질감은 사용자 선택·재승인 전 본선 반영 금지. 기준샷 갱신은 선택 후 | prototype8–16h, 통합16–32h / high |
| 4 개정 승인 후 회계·idle 규범 | spec NF-03/04/08·AC-06/07·FR-23, plan 매트릭스, UX-15~19/H05, static serving/build gate. 단위1 baseline으로 숫자 선정 | compression 협상/MIME/cache version·offline 전 경로. stale asset/전송 증가/idle loop 발생 시 serving 원복. 완화안 거절 시 현행 cap 내 절감만 | 8–16h / high |
| 5 조건부B A/B | 국소 anim/effects·gallery·선택 asset manifest. 단위1/2/3과 승인 후 먹선1종 DOM vs Canvas2D. WebGL은2D 한계 증거 후 | 같은 시각/시간/fixture의 실기기 frame·전력·메모리·context loss/복귀 비교. 반복 편차를 넘는 이득과 동등 접근성이 없으면 레이어 삭제, A 유지. C 전환은 별도 증거 전 착수 권고 없음 | prototype16–32h+검증8–16h / high |

후속 표적 E2E는 `PLAYWRIGHT_PORT=4220`, workers≤4(타이밍 직렬), 필요한 Gradle은 `--max-workers=4`. 이 docs-only 연구는 full E2E·Android 제품 테스트를 추가 반복하지 않는다. PR의 현행 hosted CI 결과와 실기기 수용을 분리한다.

### 근거 파일 연결

규범: [intend](../../intend.md), [spec](../../spec.md), [plan](../../plan.md), [UI](../design/ui-spec.md), [아트 방향](../design/art-direction.md), [최신 디자인 검증](../design/pro-skin-validation.md), [기존 자산 연구](pro-assets.md). 코드 참조는 efb0702 기준이고 #185 변경은 별도 구분했다.

| 경계 | 직접 읽은 코드 |
|---|---|
| 재생·FLIP | [choreo](../../packages/web/src/anim/choreo.ts), [flip](../../packages/web/src/anim/flip.ts), [Playback](../../packages/web/src/game/playback.svelte.ts) |
| 공개 뷰·표현 | [guest](../../packages/web/src/p2p/guest.svelte.ts), [Card](../../packages/web/src/ui/Card.svelte), [EventRail](../../packages/web/src/ui/EventRail.svelte), [표식 CSS](../../packages/web/src/styles/skin-marks.css) |
| decode·빌드 | [평가 runtime](../../packages/web/src/pro-assets/runtime.ts), [Vite](../../packages/web/vite.config.ts), [bundle gate](../../packages/web/scripts/check-bundle.mjs) |
| serving·출처 | [relay static](../../packages/relay-dev/src/static.ts), [Android serving](../../android/app/src/main/kotlin/com/kywoo26/p2pgostop/server/SmokeServer.kt), [skin manifest](../../packages/web/public/skin/manifest.json), [카드 고지](../../packages/web/public/cards/ATTRIBUTION.md) |

## 검증·결정 이력

- 2026-09-30: 기준 efb0702의 native npm ci/build와 바이트 집계, 두 표적 경로/2 Chromium trace 완료; 제품 추적 파일 변경0.
- 같은 날: #185의41f603c 병합·콜아웃큐 차이를 반영; 사용자 제공 최신 검증 수치를 본 연구 baseline과 분리.
- 이번 추천은 A+디자인 과정 개선, 조건부B. spec/UI/자산/의존성 개정은 별도 승인 전제이며 연구만으로 상태를 바꾸지 않음.
