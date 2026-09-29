# 방향 독립 구현 계약 (VD-01~04)

상태: **A 채택 / 앱 적용 진행**. [상위 제안](../art-direction.md#결정-이력), `spec.md` §6·NF-04/07/08, `plan.md` §1.6/1.8·D2. 아래 이름은 기존 `tokens.css`에 단계적으로 매핑할 역할이다. 새 CSS 프레임워크나 중복 테마 엔진을 만들지 않는다. 외관은 디자인 리드 단독 소유, 타이밍은 #86 소유다.

## 디자인 적용 PR 보존 계약

이 목록은 시각 변경 때 확인할 기존 기능과 미완료 요구사항이다. 통과 여부는 각 구현 PR의 테스트·화면으로 판정한다.

| ID | 유지할 기능·계약 |
|---|---|
| KEEP-01 | 솔로·친구 대전·QR/로비·기록·설정·진단 경로 |
| KEEP-02 | 360×780·390×734·430×822·412×915, safe-area·dvh·판 스크롤 0 |
| KEEP-03 | 예약 행, 손패 10장 2행·바닥 12월+뻑, 카드·월 가림 0 |
| KEEP-04 | 양쪽 점수·고·배수·잔액·상대 손패 수와 고정 수치 열 |
| KEEP-05 | 광/열끗/띠/피 순서·진행도·문턱 칩·현황판 |
| KEEP-06 | 입력 48×48 이상, 메뉴 예약, 선택·손패 간격·초점 가림 0 |
| KEEP-07 | 대상 선택의 실제 카드 SVG·월/종류·card ID 대응 |
| KEEP-08 | 고/스톱 예상액·위험, 국진/흔들기/총통 필수 선택과 초점 복귀 |
| KEEP-09 | 카드·사건·선택·알림 층위, 배너/알림 수와 입력 가림 0 |
| KEEP-10 | #86 시간축·skip·reduced motion·복귀·AC-06. UX-10·#52: 빈 바닥/전용 버튼 pointerup만 스킵, HUD·손패·선택·정보 버튼 스킵0, 같은 포인터 연쇄 게임 액션0 |
| KEEP-11 | 정산 점수·배수·금액·잔액·밀기/나가리/파산·기록 |
| KEEP-12 | 힌트 끔/기본/상세 기본 끔, 저장 실패/복원, 필수 HUD 유지 |
| KEEP-13 | 솔로 조언 별도 선택, P2P 계산·전송 금지, 공개 playerView만 사용 |
| KEEP-14 | 힌트/AI 사용 이력 단조 보존, 옛 기록 unknown |
| KEEP-15 | 대비·초점·키보드·200% 확대 정보·스크린리더 중복 0 |
| KEEP-16 | Commons 카드 48장 SVG·비율·라이선스 고지 보존 |
| KEEP-17 | 번들 ≤1.5 MiB·외부 요청 0·로컬 OFL 한 종 ≤160 KiB |
| KEEP-18 | 기존 gallery 픽셀·axe·E2E·컴포넌트 회귀 통과 |

## 의미 토큰

| 그룹 | 이름 (CSS `--` 접두) | 값/결정 방식 | 기존 연결·불변 조건 |
|---|---|---|---|
| 면 | `color-bg`, `color-surface`, `color-surface-raised`, `color-felt` | 방향 선택 후 OKLCH | 앱/패널/확장/판. 선택 상태를 면 색만으로 표시하지 않음 |
| 읽기 | `color-text`, `color-text-muted`, `color-on-accent` | 면과 **쌍으로** 검증 후 선택 | 본문 ≥4.5:1, 큰 글자 ≥3:1. 필수 숫자에 muted 남용 금지 |
| 행동 | `color-accent`, `color-accent-pressed`, `color-control-border`, `color-selected` | 기본/눌림/선택 값을 별도 결정 | hover 없는 터치에서도 상태 식별. `color-border`는 장식용으로 분리 |
| 의미 | `color-error`, `color-warning`, `color-success`, `color-event-*`, `color-on-event-*` | 사건 종류별 전경/배경 쌍 | 브랜드 색으로 사건 의미를 덮지 않음. 종류·주체 텍스트 필수 |
| 초점 | `color-focus`, `focus-width`, `focus-offset` | 색 미정, 폭 2px·offset 2px 후보 | 인접 면 대비 ≥3:1, 잘림 0. 기존 focus-visible를 없애지 않음 |
| 글꼴 | `font-body`, `font-display`, `font-numeric` | 같은 OFL 1종 + 기존 시스템 fallback | 두 번째 폰트 다운로드 없음, 숫자 `tabular-nums`·고정 열 |
| 타입 | `type-caption`, `type-label`, `type-body`, `type-section`, `type-title`, `type-score`, `type-amount`, `type-event` | 각 역할에 size/line-height/weight 세 값, 방향 선택 시 확정 | 후보 px: 12/14/16/18/32/24/48/58. 필수 상태·값 14px 미만 금지, scale 축소로 긴 금액 처리 금지 |
| 간격 | `space-1/2/3/4/6`, `space-control-gap`, `space-hand-prompt` | 기존 4/8/12/16/24px 재사용; 행동 간격 ≥8px, 손패와 ≥16px | 높이 부족 시 장식 간격부터 줄이고 예약 행 구조는 유지 |
| 모서리 | `radius-control`, `radius-panel`, `radius-sheet` | A/B/C 값 미정 | 기존 s/m→역할 alias. 카드 radius는 #89 소유 |
| 입력 | `touch-min` | **48px 고정** | transparent hit area 포함 실제 노출 영역 검사 |
| 레이어 | `z-board/moving/banner/toast/prompt/modal/menu` | **0/20/30/40/50/60/70** | 6행에 별도 stacking context 생성 금지 |
| 시간 | 기존 `--dur-*` / #86 hold 계약 | #86의 보통/빠름/매우빠름/즉시 값만 소비 | 로컬 상수·추가 timeout·임의 배속 계산 금지 |
| 구조 | HUD·바닥·선택·손패 높이 | #83/.1-A 확정 규칙 소비 | 외관 theme 값과 구조 높이를 묶지 않음 |

값 채우는 순서: ①선택한 방향의 면/텍스트 쌍 ②font/type ③control/focus ④사건 쌍 ⑤간격/반경. 각 단계에서 기존 gallery 기준과 차이를 대조한다. A/B/C 선택 전 위 값은 앱 `tokens.css`에 쓰지 않는다.

## 컴포넌트·상태표

| 역할 | 상태 축 | 표시/입력 불변 조건 | 검증 fixture |
|---|---|---|---|
| Home/Lobby | 솔로·친구·초대·연결 중·실패 | 앱 이름·기능 라벨만, QR/규칙/금액 유지, 오류 원인·다음 행동 명시 | 좁은 폭, 키보드, 실패/재시도 |
| SeatBar/Scoreboard | 내/상대 차례·thinking·단절·긴 이름/금액 | 동일 열: 점수/고/배수/잔액, 메뉴 48×48+8 예약; 상대 손패 수는 현황판 보조 줄 | HUD 56/60px, 긴 금액84px, 최소390×734 |
| Captured/Progress | 0·다량·국진 전환·문턱 직전/달성 | 광/열끗/띠/피 순서, 양쪽 진행도/문턱 칩·공개 정보 유지 | 길이 최악 칩·선택창 동시 |
| Floor/Hand | 1/5/6/10손패·12월·뻑·비활성·대상 선택 | 월/그림 가림0, 손패 비활성 opacity≥.7, actual card ID 유지 | #89 카드는 변경 없이 구조 fixture 재사용 |
| PromptPanel | 대상·고스톱·국진·흔들기·총통 | 먹을 패 **실제 SVG+월/종류**; 고스톱 점수/예상액/위험; 모두 ≥48px, 배경 탭 닫힘 금지 | 이미지 ID·행동 ID 일치, 키보드/초점 복귀, 긴 설명 |
| EventRail | idle·presenting·text-only·cleared | 주체/사건명, 최대 1배너, 손패/후보 겹침0, pointer-events:none | 동시·skip·cancel·reduced·복귀 |
| Settlement/Session | 승·패·나가리·밀기·파산·종료 | 원인/점수/배수/금액/잔액, 가능한 행동만. 카운트업으로 결과 지연 금지 | 긴 금액·재정산·기록 보존 |
| Settings/Assist | OFF/BASIC/DETAILED·저장 성공/실패·복원 | 기본 OFF, 필수 HUD/선택 유지, solo 조언 별도 opt-in+요청 | P2P 계산/전송/UI 금지, 힌트 최고 노출 수준·AI사용 기록 단조 보존 |
| ExpandedInfo/Menu | 열림·닫힘·200%·SR·키보드 | 이름/상태/행동 동등 접근, focus-visible, 메뉴 Escape/뒤로/닫기 | 배경 inert, 초점 이동/복귀, 중복 낭독0 |

FR-40~50, UX-H01~04/UX-A01~03은 #83의 최신 제안 기준이다. 인계 코드 f566f46은 수령·검토했다([인계 매핑](hud-handoff.md)). 아직 #92 앱에 통합하지 않은 기능과 #83의 후속 기능을 현행 앱 완료로 표시하지 않는다.

## EventRail 구조

기존 `bannerForEngineEvent`/`bannerActor`(ui/banner.ts)의 종류·좌석 매핑을 재사용한다. 엔진 이벤트를 새 규칙으로 해석하지 않는다. Board의 기존 banner-layer를 .1-A 예약 선택·동작 행으로 연결하고, 시각 도형만 내부에 둔다. #86의 재생 컨트롤러가 사건의 시작·진행·완료를 소유한다.

| 경계 | 계약 |
|---|---|
| 입력 모델 | `id`(기존 턴/이벤트 순서), `kind`(기존 BannerKind), `seat`(0/1/null), `text`, `viewerSeat`, `phase`, `progress`(0..1), `motionAllowed`. 카드/숨은 상태를 받지 않음 |
| view adapter | 주체를 나/상대로 매핑, 기능 문구만, direction의 도형 variant 선택. 장식 최대6개, aria-hidden |
| 라이프사이클 | idle → presenting → cleared는 **컨트롤러 신호**로만 변경. reduced/효과끔/skip는 장식 없이 text-only를 거쳐 같은 완료 신호로 정리. 별도 타이머/Promise 체인 없음 |
| 순간 완료 | 순간 실행도 해당 사건의 접근 가능한 상태 문구/현재 HUD를 제공. 마지막 문구의 보존·해제는 다음 상태 커밋이 담당, 무한 배너 없음 |
| 완료/취소 | 완료는 final state, cancel/라운드 전환은 장식·오래된 이벤트 제거. 같은 id 중복 수신은 재생·낭독·소리 반복 안 함. UI cleanup이 엔진 진행을 기다리게 하지 않음 |
| 동시 사건 | 엔진 순서 유지. #86 한 표시 창 안에서 UX-19에 따라 주체+사건명을 병합, 최대1배너+1알림. 시간이 없으면 도형을 생략하고 문구/HUD 보존. 별도 대기열로 턴 예산을 늘리지 않음 |
| 필수 선택과 충돌 | PromptPanel 우선. 배너로 후보를 덮지 않음. 이미 종료한 사건의 장식을 선택 후 재생하지 않음; 필요한 설명은 비차단 상태/알림으로 전달 |
| 낭독 | 부모 live region 하나(`status`, polite, atomic)에서 id별 1회. EventBanner 내부 중복 role 제거는 구현 PR에서 함께 시험. 선택 발생 때 초점/질문 낭독과 중복 안 함 |
| 포커스 | 레일은 비입력·pointer-events:none. 임의 focus 이동 없음. 스킵은 빈 바닥/별도 버튼 pointerup, 같은 포인터로 카드 내기 금지 |
| 모션 | 방향별 곡선은 #86 event window 안에서만 정규화. transform/opacity만, 새 RAF/무한 루프/카드 플레이어 없음 |
| 복귀 | hidden→visible 때 컨트롤러의 현재 상태만 투영. 지나간 사건 몰아 재생/중복 소리 금지 |

### 구현 PR의 EventRail 수용 사례

| 입력 | 기대 결과 |
|---|---|
| 상대 뻑 → 쪽(같은 턴) | 엔진 순서/주체가 남은 문구, 배너≤1, 새 대기 추가0 |
| 배너 중 먹을 패 선택 | 실제 후보 이미지/48px 버튼·손패 보임, 필수 질문 우선 |
| 진입 도중 skip / reduced-motion 변경 | 현재 상태 즉시 커밋, 장식 완료/정리, 취소 rejection 없음 |
| 동일 이벤트 재수신·재접속 | idempotent 표시, 이중 알림/소리0 |
| 라운드 종료·컴포넌트 제거 | 이전 장식/리스너 정리, 정산 초점/데이터 유지 |
| 4종 최소 viewport·200% | 예약 구조·확대 정보 계약 유지, 배너/후보/손패 교차0 |

실제 props 이름은 #86·HUD 인계 코드 확인 후 기존 타입에 맞춘다. 이 문서의 모델은 새로운 프로토콜/엔진 API 도입이 아니다.
