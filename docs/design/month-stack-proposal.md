# 같은 월 겹침·선택 제안 (#202)

상태: **개발 착수 승인, 구체 규범·제품 채택 승인 전**. 기준 `42c374d61bb2df6dafe608792044c4ae01355c1f`. Refs [#202](https://github.com/kywoo26/p2p-gostop/issues/202), [#200](https://github.com/kywoo26/p2p-gostop/issues/200). UX-05/06/H05/23~25·NF-03/08·AC-06/07 / plan §1.6·§3-2.

현재 제품 정본은 `intent/spec.md` §6, `ui-spec.md` UX-05/06/09 및 #201/#223의 독립 인접 셀·앞면100%다. 이 문서는 개정 제안과 격리 목업만 소유한다. 일반 월 겹침은 root의 인터뷰·구체안 검토와 정본 개정 후 제품에 적용한다. 제안의 합의·Draft PR·CI 성공은 사용자 규범 승인으로 세지 않는다.

## 1. 확정 의도와 미결

사용자는 짝 위에 살짝 어긋나게 놓아 두 그림을 보이고 함께 먹는 경험을 원한다. 후속 인터뷰에서 **다른 월 두 짝은 각각 짝을 유지한 두 묶음이 함께 출발해 획득 칸으로 이동**하기로 선택했다. 가운데 한 덩어리로 모으는 동작은 기본안이 아니다. 떨어질 때 살짝 빛/먹을 때 강한 빛과 겹쳐 놓기만/먹을 때만 빛의 비교는 미응답이며 색·강조를 확정하지 않는다. 손패 짝과 뒤집기 짝의 순서가 읽혀야 하며, 일반 약0.5초 간격은 비교 제안이지 고정 wait 승인이 아니다. 이미 있는 같은 월 여러 장은 붙어 겹쳐 보이고, 법적 선택이 필요하면 popup을 선호한다.

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

단일 셀에 offset만 덧대는 B 목업은 기각한다. **실제 footprint를 예약하는 B 후속 설계**를 최소 검토 후보로 제안한다. 기존5×3·덱7번과 월 anchor 수명을 시작점으로 삼고 **카드 실제 회전 경계를 포함하는 보수적 AABB**를 먼저 footprint로 예약하고, 정확 합집합 검사는 필요성·비용 확인 뒤 비교한다. 단순히 모든 월을 한 셀로 합치면 이웃 월/덱과 충돌한다. 가능한 strict 배치를 먼저 찾고 불가능할 때만 현행 최소 재배치 비용을 적용한다. 새 그룹 비용은0, 남아 있는 같은 월의 card offset 재압축은 무관 월 이동과 별도로 기록한다. anchor 카드가 사라져도 group anchor는 유지한다. 방향 반전·방사형 확산은 비교 없이 채택하지 않는다.

### 5×3·덱7과 footprint의 최소 도형 근거

5×3의14개 위치를 **anchor 후보 격자**로 유지할 수는 있지만, ‘14장까지 각 카드가 자기 독립 셀 안에 있고100% 보임’은 겹침과 동시에 보존할 수 없다. 개정 대상은 셀의 점유 의미와 바닥100% 규범이다. 덱7번은 후보에서 빼는 것에 더해 **실제 덱 rect와 group footprint의 교차0**을 검사해야 한다. 손패 두 행·48px·획득32px·부모 바닥 예산은 보존한다. 14개 월 anchor가 각각 독립적으로 항상 들어간다는 새 보장은 만들지 않는다.

회전0·오른쪽 아래 offset의 n장 경계는 `(48+(n−1)dx) × (78.171875+(n−1)dy)`다. 390×734의 실측366×241.4375 영역에서 열 피치60/행 피치80.47917, slot6의 원 카드 x=99, 덱7의 x=159다. dx=12의2장은 x=159에서 덱과 맞닿지만3장은 x=171까지 늘어 **뒤 카드 하나와 덱이12×62.171875px 교차**한다. 셀6만 점유했다는 검사는 이를 놓친다. 왼쪽으로 뒤집으면 덱은 피할 수 있어도 slot5의 카드와 교차할 수 있다. 방향 반전은 자동 해답·승인안이 아니다.

보수적 **축 정렬 bounding rect 전체 예약**을 최소 구현 후보로 잡으면 12월 각3장 스트레스의 예약 면적은 offset12/8→81,364.5px²,18/12→102,989.25px²,24/16→126,918px²다. 덱을 뺀 가용 면적은390×734에서84,613.875px²,360×650에서49,146.75px²다. 따라서 후자의3안과 전자의18/12·24/16은 면적만으로 이 예약 모형에서 불가능하다. 전자의12/8은 면적만으로 수용을 증명하지 못한다. 이 반례는 합성36장/rect 예약 한정이며 도달 가능한 정상 상태나 회전·실제 비직사각형 합집합까지 불가능하다는 증명이 아니다. 구체 과밀 fallback은 미승인이다.

후속 알고리즘 제안은 먼저 기존 anchor/개별 카드 pose를 고정하고 변경 월의 추가·제거 footprint만 검사하는 것이다. 회전은 실제 네 모서리로 경계를 만들고 덱·타월·영역 밖과 교차하면 후보를 거절한다. strict 해가 없을 때만 #223의 **무관 CardId 이동 수→월 anchor 이동 수→격자 거리→결정적 동률** 비용을 쓴다. group 수로 첫 비용을 대체하지 않는다. 그룹별/카드별 이동 수·최대 이동px를 함께 보고하며, same viewport에서 손패6↔7 변화가 만든 무관 카드 이동은0이어야 한다.

동월 증가시 남은 카드의 offset/z/angle을 보존하고 새 공개 카드 자리와 확대 footprint를 검사한다. 감소시 같은 snapshotSeq 재생 중에는 빈 offset과 제거 전 footprint를 예약해 즉시 압축하지 않는다. 최종seq/큐 종료 뒤 변경 월의 국소 압축도 별도 이동으로 기록한다. 동월 소멸→재등장·reset/복원은 기존 예약 수명과 원 CardId/round로 시작하며 추가 generation은 반례 전 도입하지 않는다. resize는 같은 논리 배치를 재투영해 카드별 경계를 다시 얻는다. 작은 새 viewport에서 경계가 맞지 않을 때 탐색0·교차0을 함께 만족하는지는 미증명이며, 승인 없이 무관 월 이동이나 축소로 해결하지 않는다. #200의 비행 경로/중간 pose 예약과 layout 점유 예약은 구별한다.

12월 고정 자리 C는 anchor 선택 탐색을 없애지만 빈 월의 자리도 다른 월에 빌려주지 못한다. 실제 같은 viewport의2장 fixture에서 타월1쌍 교차했고, 폭탄4장/덱 경계는 고정으로 해결되지 않았다. footprint 방향/충돌/fallback 탐색은 여전히 필요하므로 총 탐색비용 우위는 미측정이다. B의 anchor 탐색 비용·정상 합법 상태의 수용률도 미측정이며 제품 solver를 작성하지 않았다. root는 **도상 식별 offset, anchor 후보/점유 규범 개정, fit 실패 예외, resize 안정성, popup 소유**를 한 묶음으로 결정해야 한다.

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

제목 초점→Tab/Shift+Tab 후보 순환→Enter/Space 1회 선택→popup 종료→실제 원본 CardId 착지/획득 순서다. 필수 선택 Escape dismiss는 없다. 초점 복귀는 원 제어가 유효하면 원 제어, 제거/잠금이면 남은 손패 또는 판 정보, 연속 선택이면 새 제목이다. 200%에서는 제목·전체 후보 그림·필요한 카드 이름을 스크롤 없이 보이는 안을 먼저 비교하고 팝업 자체를 손패 위에 무작정 덮지 않는다. 팝업 위치·핵심 정보 가림 예외는 UX-08/09/24의 별도 승인 대상이다.

## 6. #200 공유 계약 제안

| 항목 | #202 제공·보존 | #200 소비·예약 |
|---|---|---|
| ID | 원 CardId·round·현재 월 anchor, group identity 추가는 반례 후 판단 | target CardId와 event source(play/flip); DOM slot key와 논리 identity를 구분 |
| 좌표 | group anchor, 각 카드 viewport rect/rotation/transform-origin/z-order/offset, footprint | 선택 **개별 카드**의 이동 전 실제 rect; group anchor나 popup rect로 대체 금지 |
| 순서 | 기존 카드 offset/z 고정, 새 공개 카드의 landing offset은 별도 | 잠정 손패 접촉→덱 공개/접촉→실제 Matched의 짝 연결→실제 Captured 때 짝별 두 묶음 동시 이동 또는 Ppeok 잔류; 빛 표현 미결; 시각 단계와 실제 사건 순서를 구분, 임의wait 없음 |
| 선택 | 공개 candidate CardId만, 비선택 자동 묶음, 원본과 popup 구분 | 확정 target의 원본 rect를 연결; 선택 전 후보 하나를 임의 확정하지 않음 |
| 수명 | same-seq 중간 commit 예약, 최종 seq교체/queue해제 release, round/remount reset | skip/reset 기존 재생 취소 토큰 무효화, snapshotSeq 점프·감소 reconcile, resize시 재측정 또는 현재 최종 투영 수렴 |
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

### 실제2후보 popup 비교와 최소 diff 후보

engine 합법 진행 seed2/action9의 play41 뒤 pending target은 **11월 광40/피42** 두 후보이며 legalActions도 이 둘이었다. 일반 바닥3장/자연뻑은 자동 묶음이다. 앞선3후보 fixture는 법적 선택 증거가 없는 강건성 스트레스이며 기본 UX를 복잡하게 만드는 근거로 쓰지 않는다.

실제2후보로 작은360×650과390×734, 짧은/긴 문구, Chromium/WebKit의 **8조건**만 비교했다. 200%는 CSS 글자 모형이다. 짧은안은 제목 ‘11월 먹을 패’·각 전체 그림48×78.171875·이름 ‘광/피’를 고정 표시하고 설명 문단을 생략한다. 작은 높이에서 popup336×141.4375, 후보 hitbox157×78.171875(그림과 별도), 제목40px·이름은 완전히 보였고 필수 정보 스크롤0·손패 교차0이었다.390×734에서는 popup366×225.4375·hitbox172×78.171875였다. 복제40/42는 dialog 아래, 원본 canonical ID 유일/inert·중앙hit·Tab40→Escape 유지→Enter40을 두 엔진에서 관측했다. 이는 픽셀/DOM 관측이며 도상 식별·OS 스크린리더 수용 PASS가 아니다.

같은 실제2후보의 긴 안내안은 작은 높이에서 client37px/scroll358px로 제목이 잘렸다. 이 안은 필수 정보를 그 영역에만 맡기므로 기각한다. 예비 무제한200% 긴3후보 popup462.171875px·손패180px 교차 실패도 보존한다. ‘겹침0’만으로 constrained 안을 채택하지 않는다. popup 동안 비활성 바닥을 가리는 문제와 평상시 같은 월 카드가 서로 가리는 문제는 별개의 미승인 수용 항목이다.

현재 PromptPanel의 고정 h2(14px/20px)·기존 actions snippet과 padding4px6px/gap2px를 짧은안 모형에 맞췄다. 200%의40px 제목+78.171875px 행동+2px gap+8px 세로 padding+2px border는130.171875px로141.4375px 안에 들어간다. 기본 두 후보에는 children/새 scrollTitle API가 필요 없다는 **정적 최소 diff 후보**다. 실제 컴포넌트 재사용 실행은 미검증이며 timer/메뉴/전체 배경 정보를 이 계산에서 해결했다고 주장하지 않는다.

| 범위 | 조건부 후속 diff 후보 | 현재 소유 |
|---|---|---|
| Floor target 표현 | 기존 options/onchoose를 PromptPanel title/actions로 전달; 원본 직접선택 focus/dialog 활성과 popup을 한 번만 열기; 후보 CardId 유지 | 아직 제품 작성 없음 |
| Floor 전용 wrapper/CSS | viewport별 floor 실가용 영역으로 popup bounds, 후보 그림48px·입력≥48px·8px 간격·필요 이름 | Floor 승인 뒤 후보 |
| PromptPanel/ChoicePrompt | 기본안은 기존 title/actions 재사용, scrollTitle 새 API·관련 카드32px 변경 없음 | 제품 예외 미승인 |
| Board/skin | 기존 promptlockchange/inert/회전/메뉴 연결을 재사용할 수 없는 구체 diff만 root에 소유 요청 | 직접 편집 금지 |

기존 promptFocus/helper의 intro/outro, reset 중 취소·연속선택/P2P 늦은 결과·restore, 실제 authority timeout, 메뉴/Android Back, 회전 후 초점 및 OS 스크린리더는 후속 제품 표적이다. 목업의 직접 reset/가로 잠금/timeout 호출을 이 통합 검증으로 승격하지 않는다. 별도 Floor focuslock은 제안하지 않는다.

### 실제 사건 열로 연결한 비교

현재 engine의 결정적 합법 진행에서 세 경로를 얻어 목업의 별도 storyboard에 넣었다. 공개된 event prefix만 적용하고 최종 바닥 카드ID 집합을 실제 reduce 결과와 대조했다. 각 경로 두 엔진에서 집합 동치였으며 제품 Playback/모션 검증은 아니다.

| 경로 | seed·action 순번(0기준) | 실제 event 순서·획득 관측 |
|---|---|---|
| 다른 월 두 짝 | 1·1 | Played→Flipped→Matched(play)→Matched(flip)→Captured→ScoreChanged; 실제 새획득45/44/31/30 |
| 뻑 잔류 | 2·2 | Played→Flipped→Ppeok→InstantPayout; Captured0, 새획득0 |
| 폭탄 | 9·8 | Bomb→Captured→PiStolen→Flipped→Placed→ScoreChanged×2; 실제 폭탄 새획득16/19/18/17 |

후속 인터뷰대로 두 짝은 [45,44]와[31,30]을 각각 유지한 채 **실제 Captured를 본 뒤 함께 출발**하는 작동 비교를 추가했다. 중앙 한 묶음으로 합치지 않으며 원 CardId/획득32px를 보존한다. 한 중간 프레임에서 두 묶음의 transform 동일, reset 뒤 이동 묶음 DOM0을 관측했으며 실제 Playback 취소 검증은 아니다. 목업의 이동시간은 시연값이고 AC-06/700ms 변경 승인이 아니다. 떨어질 때/먹을 때의 빛은 미응답이라 기본 시연에서 색 강조를 넣지 않았다. 팝업 선택 모형에는 가짜 Captured/권위 대상 필드를 추가하지 않았다. 손패를 짝 위에 놓기→덱 뒤집어 짝 위에 놓기의 시각 landmark와 실제 resolve 사건 순서는 별도로 보여 준다. 손패/덱 두 번 선택의 중간 공개ID 부재는 미결이다. #200 summary 목적지 DOM 부재·연속 Matched 강조 우려와 actual before pose 측정 계약은 root의 착지 후속 소유이며 이 문서에 중복 상세 규범을 만들지 않는다.

### root 검토 entry와 대표4장

격리 목업 entry는 승인 전 HTML, engine fixture 생성, 표적 probe와 공개 자산 복제다. 실행은 저장소에서 핀 Node를 선택하고 `node node_modules/vite/bin/vite.js '<SCRATCH_ENTRY_DIRECTORY>' --host '<LOOPBACK_HOST>' --port '<RESERVED_PREVIEW_PORT>' --strictPort`다. `<…>`는 실행 전 바꿀 자리표시자이며 네트워크/환경 원문은 공개 문서에 남기지 않는다. root에게 실제 로컬 entry와 실행값을 비공개 인계한다. scratch는 Git 추적/제품 배포에 포함하지 않으므로 PR 단독 checkout에서 실행 가능한 제품 산출물이라고 주장하지 않는다.

대표 PNG는 `review-1-pair.png`(두 짝/실제 Captured 뒤 분리 동시 이동·offset3안), `review-2-ppeok.png`(뻑3장 잔류·offset3안), `review-3-bomb.png`(폭탄4장 공개·획득 전·offset3안), `review-4-small-200-two.png`(실제2후보·작은 높이200%) 네 장이다. offset12/8·18/12·24/16 및 순서 반전은 같은 entry에서 비교한다. 계산 노출율/교차/DOM 관측은 기록했으며 사람이 뒤 카드 종류를 읽을 수 있는지는 미판정이다. 첫 세 장은 주변 배치의 공간 수용 증거가 아니며, 네 번째 바닥도 실제 Board가 아닌 실측 크기 donor를 쓰는 합성 모형이다.

AGENTS/RTK·관련 정본·ui-spec·규칙§12·이슈/#223 최종계약 읽기, Node24.21.0/npm11.19.0 npm ci·lint:fix·privacy 검사 및 whitespace 확인을 수행했다. Context7 callable 도구가 없어 목업 계측 API는 [Playwright 공식 Page](https://playwright.dev/docs/api/class-page)·[Browser](https://playwright.dev/docs/api/class-browser), [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement)·[rect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect) 원문을 직접 조회했다. 새 dependency0이다. 제품 suite·intro/outro 실제 통합·초기 serving 전송·기기·식별/성능 수용은 미완이며 PASS0, 제품 변경0·규범 승인0이다.
