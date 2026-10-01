# 같은 월 겹침·선택 제안 (#202)

상태: **개발 착수 승인, 구체 규범·제품 채택 승인 전**. 기준 `42c374d61bb2df6dafe608792044c4ae01355c1f`. Refs [#202](https://github.com/kywoo26/p2p-gostop/issues/202), [#200](https://github.com/kywoo26/p2p-gostop/issues/200). UX-05/06/H05/23~25·NF-03/08·AC-06/07 / plan §1.6·§3-2.

현재 제품 정본은 `intent/spec.md` §6, `ui-spec.md` UX-05/06/09 및 #201/#223의 독립 인접 셀·앞면100%다. 이 문서는 개정 제안과 격리 목업만 소유한다. 일반 월 겹침은 root의 인터뷰·구체안 검토와 정본 개정 후 제품에 적용한다. 제안의 합의·Draft PR·CI 성공은 사용자 규범 승인으로 세지 않는다.

## 1. 확정 의도와 미결

사용자는 짝 위에 살짝 어긋나게 놓아 두 그림을 보이고, 짧게 강조한 뒤 함께 획득하는 경험을 원한다. 손패 짝과 뒤집기 짝의 순서가 읽혀야 하며, 일반 약0.5초 간격은 비교 제안이지 고정 wait 승인이 아니다. 이미 있는 같은 월 여러 장은 붙어 겹쳐 보이고, 법적 선택이 필요하면 popup을 선호한다.

미결은 실제 도상 식별에 충분한 offset·노출율, 팝업 위치·원본과 후보의 연결, #200 착지 허용 오차·회전·수명, 과밀시 예외다. 손패는48px·전체 앞면을 그대로 유지한다. 화면이 작다는 이유로 카드 축소·그림 절단·손패 가림·획득패 숨김을 채택하지 않는다.

## 2. 코드에서 확인한 경계

`Floor.svelte`는 공개 `groups/options/staging/highlight`를 받고 `assignFloor`로 슬롯을 배정한 뒤 `projectFloor`로 viewport를 투영한다. 현재14장까지 개별 카드 독립 셀, 과밀시 비후보만5px 접기다. 5×3의 가운데7번은 덱이고 회전된 경계도 셀 내부로 제한한다. 기존 `anchor`는 월의 슬롯 식별자이며 카드 실제 rect가 아니다.

`display.ts`의 CardPlayed는 손패를 빼고 바닥에 넣는다. CardFlipped는 staging에 넣고 Matched가 바닥으로 옮겨 강조한다. `choreo.ts`는 이벤트 적용→변경 전 DOM measure→commit/tick→변경 후 measure→FLIP이다. 실제 일반 engine 순서는 CardPlayed→CardFlipped→Matched(play/flip)이며 합성 테스트의 Played→Matched→Flipped를 실제 증거로 전용하지 않는다. 손패 접촉은 **잠정 관계**이고 획득은 실제 Captured/PiStolen만 따른다. 뻑이면 접촉한 카드가 바닥에 남으며 덱 전 가짜 획득을 만들지 않는다. 폭탄은 실제 Captured가 덱 전에 발생하는 별도 경로다.

#200 읽기 분석의 좁은 인계: Matched는 정확한 target/source를 가지지만 Played/Flipped는 target이 없다. play 대상 선택→다른 월 flip 대상 선택 대기의 앞선 playTarget은 engine ctx에만 있고 현재 BoardView/inFlight에 없다. 따라서 로컬 클릭 ID만으로 상대 관찰자·복원의 동일한 착지를 보장할 수 없다. 중간 공개 ID 전달 또는 확정 강조 유보는 root의 별도 계약 결정이며 #202의 engine/protocol 소유 확대가 아니다. 연속 Matched의 같은 step 합침·highlight 교체와 summary 최근4장 밖 획득 목적 DOM 부재는 정적 우려이며 실행 재현/해결로 기록하지 않는다. 현재 #200 분석은 사전 분석 완료이며 독립 제품 구현은 아니다.

#223의 현재 기준은 strict 해가 있으면 무관 이동0, 없으면 무관 이동 수→월 앵커 이동 수→격자 거리→결정적 동률이다. 같은 snapshotSeq의 FIFO 중간 commit 동안 제거 슬롯을 예약하고 최종 snapshot 교체 또는 큐 해제에서 푼다. round/더미 증가 reset, remount 초기화, 복원 reconcile을 유지한다. resize는 탐색 없이 재투영한다. Board는 손패6↔7에도 플레이 두 행 공간을 예약해 같은 viewport의 바닥 이동0px를 확보했다. 이 부모 예산을 줄이지 않는다.

## 3. 비교안과 최소 범위

| 안 | 배치 | 장점 | 비용·위험 |
|---|---|---|---|
| A 현행 | 독립 카드 셀 + 안정 월 앵커 | 모든 앞면·직접 후보 입력, #223 검증 재사용 | 같은 월이 하나의 무더기로 읽히지 않음; 사용자 의도 미충족 |
| B 제안 | 안정 월 앵커 + 개별 offset·공개 후보 팝업 | 기존 슬롯 수명/투영 분리를 재사용, 짝 연결 명확 | 그룹 footprint 예약이 필요; 노출로 도상 식별 불충분 가능; 선택UX 정본 개정 필요 |
| C 비교 | 12월 고정 자리(덱 중앙 제외 14칸 중12칸) | 월 생성/소멸에도 다른 월 anchor 이동0, 단순 탐색 | 빈 월을 위해 공간 소비, 같은 월 폭이 한 셀보다 큼; 12칸 고정만으로4장/뻑/보너스/착지 공간 해결 안 됨 |

B를 최소 후속 후보로 제안한다. 기존5×3·덱7번과 월 anchor 수명을 시작점으로 삼고 **카드 실제 회전 경계의 합집합**을 footprint로 예약한다. 단순히 모든 월을 한 셀로 합치면 이웃 월/덱과 충돌한다. 가능한 strict 배치를 먼저 찾고 불가능할 때만 현행 최소 재배치 비용을 적용한다. 새 그룹 비용은0, 남아 있는 같은 월의 card offset 재압축은 무관 월 이동과 별도로 기록한다. anchor 카드가 사라져도 group anchor는 유지한다. 방향 반전·방사형 확산은 비교 없이 채택하지 않는다.

최소 제품 변경은 승인 뒤 Floor/floor-layout/인접 전용 테스트다. Board/Game은 수정하지 않고 공개 options와 onchoose를 재사용한다. 팝업의 기존 메뉴·Android Back·확대 패널 연동에 새 접점이 필요하면 root에 근거를 제출하고 소유권을 먼저 조정한다. #200은 display/choreo/Playback의 착지 흐름을 소유하며 같은 파일 동시 수정은 하지 않는다. engine/protocol/schema/public asset 변경은 없다.

## 4. 노출 비교의 정의

회전0, 폭 W=48, 높이 H=48/0.614인 카드가 (dx,dy)씩 오른쪽 아래로 쌓이면 뒤 카드의 기하 노출은 `1−((W−dx)(H−dy))/(WH)`다. 이는 픽셀 면적 비율이지 도상·종류 식별 성공률이 아니다. 맨 앞 카드는100%이며 중간·뒤 카드는 각각 측정한다. 실제 회전시에는 겹침 다각형과 페인트를 추가 확인한다.

| 비교 offset (CSS px) | 2장 footprint | 4장 footprint | 뒤 카드 노출(계산, 반올림) |
|---|---|---|---|
| 12 / 8 | 60 × 86.18 | 84 × 102.18 | 32.7% |
| 18 / 12 | 66 × 90.18 | 102 × 114.18 | 47.1% |
| 24 / 16 | 72 × 94.18 | 120 × 126.18 | 60.2% |

48px의 기본 셀 피치는60px, 행 피치는90.18px다. 첫 안도4장은 가로24px·세로12px 초과하며, 높이 축소시2장조차 세로 경계가 위험하다. 같은 월4장은 초기 바닥 총통 R6이면 재분배지만 폭탄/착지/획득 중간 표시로 필요하다. R7 자연뻑은3장+낸 패를 함께 획득한다. B2의 보너스가 뻑에 묻히는 경계 때문에 그룹 크기를 무조건4장으로 제한하면 안 된다. 12월 각3장/36장은 **합성 과밀 스트레스**이며 도달 가능한 엔진 상태라고 주장하지 않는다.

그림은 기존 공개 SVG를 쓰며 앞뒤 순서를 바꿔 광/열끗/띠/피가 가려지는 반례를 비교한다. 총 노출율이 높아도 광 원·띠 글자·국진·쌍피 도상만 가리면 후보를 기각한다. popup은 오선택을 막는 수단이며 평상시 바닥 식별 부족을 자동 해결하지 않는다.

## 5. 선택·접근성 제안

팝업은 공개 `options`에 서로 다른 법적 CardId가 여러 개인 경우에만 연다. 같은 월2장이 있다는 사실만으로 선택을 재판정하지 않는다. 1대상·자연뻑/뻑 통째 획득·폭탄의 자동 묶음은 추가 선택 없이 공개 이벤트 순서대로 진행한다. 상대 비공개 선택/손패·더미 다음 카드는 후보를 만들거나 예약 좌표를 예측하는 데 쓰지 않는다.

후보는 최소48px 폭·78.18px 전체 앞면과 후보 간8px 간격, 월·종류·먹기 이름, 실제 카드 ID를 유지한다. 바닥 원본은 비입력 상태로 남기고 popup 복제는 native `dialog` 아래에 둔다. 현재 choreo.measure가 `closest('dialog')`만 제외하므로 role=dialog만 쓰면 동일 ID의 복제 rect가 바닥 원본을 덮어쓸 위험이 있다. 새 선택ID/schema를 만들지 않는다.

제목 초점→Tab/Shift+Tab 후보 순환→Enter/Space 1회 선택→popup 종료→실제 원본 CardId 착지/획득 순서다. 필수 선택 Escape dismiss는 없다. 초점 복귀는 원 제어가 유효하면 원 제어, 제거/잠금이면 남은 손패 또는 판 정보, 연속 선택이면 새 제목이다. 200%에서는 텍스트/후보 내부 스크롤과 동등 행동을 보장하고 팝업 자체를 손패 위에 무작정 덮지 않는다. 팝업 위치·핵심 정보 가림 예외는 UX-08/09/24의 별도 승인 대상이다.

## 6. #200 공유 계약 제안

| 항목 | #202 제공·보존 | #200 소비·예약 |
|---|---|---|
| ID | 원 CardId·round·현재 월 anchor, group identity 추가는 반례 후 판단 | target CardId와 event source(play/flip); DOM slot key와 논리 identity를 구분 |
| 좌표 | group anchor, 각 카드 viewport rect/rotation/transform-origin/z-order/offset, footprint | 선택 **개별 카드**의 이동 전 실제 rect; group anchor나 popup rect로 대체 금지 |
| 순서 | 기존 카드 offset/z 고정, 새 공개 카드의 landing offset은 별도 | 잠정 손패 접촉→덱 공개/접촉→실제 Matched 관계 강조→실제 Captured 획득 또는 Ppeok 잔류; 시각 단계와 실제 사건 순서를 구분, 임의wait 없음 |
| 선택 | 공개 candidate CardId만, 비선택 자동 묶음, 원본과 popup 구분 | 확정 target의 원본 rect를 연결; 선택 전 후보 하나를 임의 확정하지 않음 |
| 수명 | same-seq 중간 commit 예약, 최종 seq교체/queue해제 release, round/remount reset | skip/reset generation 무효화, snapshotSeq 점프·감소 reconcile, resize시 재측정 또는 현재 최종 투영 수렴 |
| DOM | 원본 data-card-id 유일, popup 복제는 measure 제외, 제거 전 footprint 예약 | before measure→commit/tick→after measure; 제거 전 target 예약, 종료/취소 뒤 ghost·예약 회수 |

월 소멸→재등장/round reset·복원/snapshot 중간 경계에서 CardId+round만으로 부족한 구체 반례는 아직 없다. group generation·새 stableID는 확정하지 않으며 반례가 있을 때 최소 상태로 정당화한다. DOM slot key 재사용으로 카드 instance가 교체되는 현상과 월 identity를 혼동하지 않는다. 착지 픽셀 허용·회전 유지/상쇄·DOM 레지스트리 도입 여부는 #200 측정 계약과 root 중재 후 정한다. 실제 transform이 적용된 AABB에 angle/노출offset을 다시 더해 중복 계산하지 않는다. #202는 레이아웃 정보만 제공한다. 기존 moved()의0.5px 판정값을 사용자 착지 오차 승인으로 전용하지 않는다. renderer 로컬 정보는 wire/저장 schema에 넣지 않는다. P2P 지연 중 같은 공개 스냅을 유지하고 늦게 온 이전 재생이 새 anchor·선택을 되살리지 않아야 한다.

### 기존 선택창의 최소 접점 (읽기 근거)

- [PromptPanel.svelte:38](../../packages/web/src/ui/PromptPanel.svelte#L38)는 이미 native `dialog open`·고유 제목 ID·`promptFocus`·속도 토큰의 fly transition을 제공한다. 이는 현재 choreo selector와 일치하는 재사용 근거이며 미래 모든 modal을 native로 제한하는 새 규범이 아니다. [choreo.ts:173](../../packages/web/src/anim/choreo.ts#L173)의 measure와 runStep/deal 카드 탐색은 dialog 안 복제를 제외하지만 data-anchor는 별도 수집하므로 popup에 애니메이션 anchor를 복제하면 안 된다.
- [prompt-focus.ts:19](../../packages/web/src/ui/prompt-focus.ts#L19)는 이전 초점·제목 초점·후보/메뉴 Tab 순환·Escape 차단을 관리하고, native 메뉴가 modal이면 잠금을 중단한다. 69~103행은 outrostart에서 release·퇴장 잠금 통지, 다른 창이 남으면 복귀 보류, 이전 제어가 제거/잠금이면 손패/메뉴/Board로 복귀, DOM 제거 후 보관 목록 회수를 수행한다. 이 helper를 한 번 재사용하고 Floor 별도 focuslock은 추가하지 않는다.
- [Board.svelte:129](../../packages/web/src/ui/Board.svelte#L129)는 열린 panel 바깥 siblings와 퇴장 panel을 inert로 합성한다. 161~184행은 intro/outro 교체·destroy 때 이전 inert를 복원한다. 187~205행은 coarse 회전 잠금/세로 복귀 제목 초점이다. popup을 이 Board 밖 임의 overlay로 옮기면 현재 계약을 재사용했다고 할 수 없다.
- [ChoicePrompt.svelte:28](../../packages/web/src/ui/ChoicePrompt.svelte#L28)는 **장식 관련 카드**를 size=s로 그리고, 선택 행동은 별도 텍스트 button이다. 32px 그림과48px hitbox는 서로 다른 기준이다. 이 관련 카드의 크기를 기존 바닥 target 크기라고 부르거나 획득32px 규범을 바꾸지 않는다. 직접 target은 [Floor.svelte:164](../../packages/web/src/ui/Floor.svelte#L164)의 m 카드/choice button이다. 실제 gallery target32/33의 그림과 button은 아래 표적에서 각각48×78.171875px였다. 현재 DIV role=dialog 안의 원본은 정상 측정 대상이다. 복제 popup을 만들 때만 selector의 중복 ID 문제가 생긴다.
- [Board.svelte:492](../../packages/web/src/ui/Board.svelte#L492)는 현재 target options/onchoose를 Floor로 전달한다. 507~564행은 기존 decision-area의 timer 설명·EventRail·다른 선택창 소비다. 기본132px/넓은144px은 최종 target 높이가 아니다. [skin-fan.css:374](../../packages/web/src/styles/skin-fan.css#L374)의 absolute·idle-slot 규칙과 562행 이후 실제 중앙 투영이 우선하며 실측 decision 높이는0px다. 따라서 기존132row 재사용으로 해결된다는 제안은 기각한다. Board/ChoicePrompt/PromptPanel 제품편집 예외는 아직 없다.
- timeout은 목업 임의시계로 자동 선택하지 않는다. 권위 pending/options가 바뀌면 이전 후보 입력·퇴장창을 즉시 무효화하고 확정 CardId의 재생으로 넘겨야 한다. intro/outro 중 reset·P2P 최신뷰 교체·연속 선택에서는 중복 제출/초점/ARIA/measure를 실제 후속 제품 표적으로 검사한다. 원본 aria-label과 popup 후보 이름의 중복은 background inert·버튼 단일 이름/장식img alt 공백을 함께 확인한다. data-card-id 중복 허용은 measure 제외 범위만이며 HTML id는 복제하지 않는다.

## 7. proposed spec delta (미적용)

| 정본 위치 | 현행 | 검토할 개정 |
|---|---|---|
| spec §6.2·ui UX-05/06 | 독립 인접 셀·바닥 전체 앞면100% | **손패 규범 보존**, 바닥 같은 월만 승인 offset의 부분 겹침; 후보는 팝업 전체 앞면. 과밀 예외/footprint/안정 anchor를 수치 명세 |
| ui UX-H05·spec NF-08 주석 | 손패·바닥 앞면100%가 도상 식별 전제 | 손패 전제 보존, 바닥은 사용자 식별 실험으로 승인한 도상 보호·개별 aria-label; 배지 추가 없음 |
| spec §6.2/6.3·ui UX-08/09/24 | 바닥 후보 직접 탭, 별도 시트 없음 | 법적 복수 대상만 popup, 후보 CardId·전체 앞면·48px/8px·inert·키보드/초점 복귀·메뉴/Back 명세 |
| ui #201 계약·UX-25 | 카드 독립 셀·자기 셀 경계·0px | 그룹 footprint 내 월 겹침만 허용, 무관 group/CardId 0px strict 기준 및 예외 최소 이동 보존; 덱/손패/타월 교차0 |
| spec §6.4·UX-15~17 | 현 시간표/700ms/skip/reduced | 유지. 손패짝→덱짝 인지 비교가 예산을 바꿔야 한다면 별도 제안과 계측 필요 |

승인 후 root가 spec/ui-spec 정본과 plan 추적을 함께 개정한다. 제품 구현자가 문서의 제안을 승인 완료로 치환하지 않는다. NF-03 raw2,097,152 B·초기 encoded1,500,000 B 및 성능 목표는 그대로다.

## 8. 실행·검증 계획

1. 이 문서와 plan 자기 실행 단위를 계획 commit→FF push→Refs #202 #200 Draft PR로 공개한다. 실제 계획 SHA는 PR 본문에 기록한다. 이슈에는 PR 역링크 댓글만 남긴다.
2. 격리 scratch에서 A/B/C, offset3종, 월1/2/3/4장·뒤집힌 앞뒤 도상·12월 과밀·뻑/폭탄/보너스·선택후획득을 비교한다. 기존 카드 자산·고지/라이선스를 함께 사용한다. 앱 import·배포·외부 요청 없음.
3. 합성 표적만 Chromium/WebKit으로 카드 rect/노출/교차·48px 후보·ARIA/키보드·coarse 회전 잠금·200%·줄어드는 패/새 round·skip/reduced·늦은 결과 무효화를 측정한다. 실제 솔버 입력·출력과 정적 목업 추정값을 구별한다. scratch 검증은 제품 통합·AC PASS가 아니다.
4. root에 목업·수치·실패 반례·최소 제품 범위·공유 계약을 제출한다. 구체 노출율·팝업/오차·정본 승인 후에만 제품 후속을 구현한다.
5. 최종 제품 단계는 AGENTS §5 lint/check/test/test:browser/build/e2e:smoke/Android3작업, `PLAYWRIGHT_PORT=4258`, workers≤4·timing직렬을 수행한다. 기준샷 자동 갱신·threshold 완화 없음. raw와 초기 serving encoded를 별도 계측한다. Safari 실제 최소높이/핫스팟·성능은 사람 결과만 기록한다.

## 9. 작동 목업과 관측 (2026-10-01)

목업은 `.visual-source/month-stack/`의 격리 HTML/Node/기존 공개 SVG 복제이며 추적·배포 산출물이 아니다. 공개 PR에 작업 환경 경로·주소를 쓰지 않는다. 단일 제안 문서만 제품 밖 검토 근거로 게시한다. root가 같은 workspace의 목업·PNG·JSON을 직접 검토할 수 있다. 현재 목업의 주변 HUD/손패는 합성이고 실제 Board와 동일하다는 주장은 하지 않는다. A의 솔버 입력과 실제 viewport별 바닥 투영값, B/C의 단순 좌표, 실제 engine 사건 열을 구별한다.

### 실제 현재 target 크기·가용 영역

고정 main 소스를 바꾸지 않은 dev gallery `board-target`, Chromium/WebKit 각각6viewport에서 측정했다. target32/33의 button·그림은 모두48×78.171875px, 중앙 hit=true였다(각12후보, 두 엔진 합24후보 관측). 선택 role은 DIV/dialog이며 native modal이 아니다. 그림32px는 ChoicePrompt 관련 카드/획득 요약의 별도 규범이다. 작은650높이는 수용 최소 높이 확정이 아닌 스트레스다.

| viewport | 바닥 실측 width × height (두 엔진 같음) | target decision-area 높이 |
|---|---|---|
| 360×780 | 336 × 243.78125 | 0 |
| 390×734 | 366 × 241.4375 | 0 |
| 430×822 | 406 × 285.78125 | 0 |
| 390×844 | 366 × 307.78125 | 0 |
| 360×650 스트레스 | 336 × 157.4375 | 0 |
| 430×932 | 406 × 395.78125 | 0 |

390×734에208px를 가정한 최초720조건(10fixture×6viewport×3offset×앞뒤2×2엔진)은 **예비 모형**으로 보존하며 현 제품 결함/수용 증거로 쓰지 않는다. 위 viewport별 값을 적용한 뒤 기각에 필요한132조건(11결정적fixture/viewport 조합×3offset×앞뒤2×2엔진)만 다시 관측했다. 무조건 전체 행렬 재실행은 하지 않았다. 기존 솔버 A의 과밀5px 접기와 B/C의 새로운 offset 노출을 혼동하지 않는다.

### 단순 배치안의 실패

390×734, 원 카드 순서에서 B의2장 fixture는 offset3종 모두 타월/덱/바닥경계 교차0이었다. 그러나3장 fixture는 덱1/2/2장 교차,4장 fixture는 타월5/4/2쌍 교차였다. C의2장 fixture는 타월1쌍 교차였다. 12월 각1장은 A/B/C 모두 교차0이지만 각3장 과밀 스트레스에서 B는 타월23/45/41쌍·덱3/4/3장·경계10/10/11장 초과, C는33/57/50쌍·4/6/5장·6/6/8장 초과였다. 이는 **해당 단순안** 기각 근거이며 모든 group solver 불가능 증명이 아니다. A의 정상 범위는 독립 앞면·과밀 예외를 유지한다. B의 실제 footprint 예약·방향·최소 재배치는 아직 구현하지 않았다.

도상 노출32.7/47.1/60.2%는 앞뒤 반전·1/2/3/4장 PNG로 비교 가능하다. 광/열끗/띠/피·보너스의 보호 도상을 사람이 읽었는지 확인한 결과는 없다. 4장/보너스 무더기에서 하나의 수평 offset만 키우는 해법은 덱/이웃과 충돌하며 ‘노출율이 높으니 식별 성공’으로 판정하지 않는다.

### 팝업 후보의 축소

예비 무제한 중앙 popup의200%·긴 문구·3후보는 두 엔진에서462.171875px 높이, 손패180px 교차·board 초과였다. 이 실패 PNG를 보존하고 기각했다. 기존132row 해결 주장은 없다.

후속 **바닥 실가용 영역 안 높이 제한 + 제목/설명 스크롤 + 후보 행동 고정** 목업은390×734에서366×225.4375px, 작은360×650에서336×141.4375px였다. 두 엔진 모두 손패 교차0/board 내부,3후보78.171875px 높이였다. 작은 높이의 설명 region은 client37px/scroll358px로 정보에 접근하려면 내부 스크롤이 필요하다. 글자200% CSS 모형이며 실제 Safari aA/Android textZoom 검증이 아니다. 제한된 제목 가시성·팝업이 가리는 비활성 원본·메뉴/필수 숫자·실기기 스크롤 사용성은 사용자/제품 수용 미완이다.

2후보 popup은 각48×78.171875px 그림/button·중앙hit·원본 inert·dialog 제외 후 canonical ID 유일을 관측했다. Tab→후보13, Escape 후 필수 선택 유지, Enter 선택ID13·창0, reset 새round/선택 해제·창0, 권위 결과를 흉내 낸 직접 timeout 입력 후 창0을 확인했다. 실제 호스트 timeout 경합·intro/outro·기존 promptFocus 재사용을 검증한 것은 아니다. synthetic coarse 잠금도 실제 기기 회전 수용이 아니다. 설명 region Tab/스크롤·제거 카드 후 초점·동일 포인터 연쇄·연속 선택/P2P 대기·restore·배경 전체 ARIA의 실제 통합은 후속 표적이다. 원본 prefix 외 숨은 손패/덱을 가져오지 않으며 목업 외부 요청 관측0, pageerror0이다.

조건부 최소 접점 제안: 기존 PromptPanel의 단일 native dialog/promptFocus를 재사용하고, 제목도 기존 설명 region 안에서 스크롤하는 **target 전용 선택 옵션**과 고정 카드 행동 snippet을 비교한다. ChoicePrompt 전체 size 변경·획득32px 변경·새 focuslock·일괄 modal 교체는 하지 않는다. Floor는 기존 직접 target dialog/focus와 새로운 후보창을 동시에 열지 않아야 한다. 필요한 구체 diff 후보는 Floor의 target 표현 분기/현재 focus 활성 범위, PromptPanel의 target 한정 제목/설명 배치 옵션, 전용 wrapper CSS다. Board/skin에서 메뉴·회전/inert 연결이 불충분하면 그 근거를 root에 제출하며 현재 소유 예외는 없다. 바닥 비활성 원본을 popup이 가리는 예외는 UX-08/09 개정과 함께 검토한다.

### 실제 사건 열로 연결한 비교

현재 engine의 결정적 합법 진행에서 세 경로를 얻어 목업의 별도 storyboard에 넣었다. 공개된 event prefix만 적용하고 최종 바닥 카드ID 집합을 실제 reduce 결과와 대조했다. 각 경로 두 엔진에서 집합 동치였으며 제품 Playback/모션 검증은 아니다.

| 경로 | seed·action 순번(0기준) | 실제 event 순서·획득 관측 |
|---|---|---|
| 다른 월 두 짝 | 1·1 | Played→Flipped→Matched(play)→Matched(flip)→Captured→ScoreChanged; 실제 새획득45/44/31/30 |
| 뻑 잔류 | 2·2 | Played→Flipped→Ppeok→InstantPayout; Captured0, 새획득0 |
| 폭탄 | 9·8 | Bomb→Captured→PiStolen→Flipped→Placed→ScoreChanged×2; 실제 폭탄 새획득16/19/18/17 |

팝업 선택 모형에는 가짜 Captured/권위 대상 필드를 추가하지 않았다. 일반 손패 접촉→덱 공개/접촉의 시각 landmark와 실제 resolve 사건 순서는 별도로 보여 준다. 손패/덱 두 번 선택의 중간 공개ID 부재는 미결이다. #200 summary 목적지 DOM 부재·연속 Matched 강조 우려와 actual before pose 측정 계약은 root의 착지 후속 소유이며 이 문서에 중복 상세 규범을 만들지 않는다.

AGENTS/RTK·관련 정본·ui-spec·규칙§12·이슈/#223 최종계약 읽기, Node24.21.0/npm11.19.0 npm ci·lint:fix·privacy 검사 및 whitespace 확인을 수행했다. Context7 callable 도구가 없어 목업 계측 API는 [Playwright 공식 Page](https://playwright.dev/docs/api/class-page)·[Browser](https://playwright.dev/docs/api/class-browser), [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement)·[rect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect) 원문을 직접 조회했다. 새 dependency0이다. 제품 suite·intro/outro 실제 통합·초기 serving 전송·기기·식별/성능 수용은 미완이며 PASS0, 제품 변경0·규범 승인0이다.
