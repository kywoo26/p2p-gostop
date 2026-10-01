# 같은 월 겹침·선택 제안 (#202)

상태: **#233 제안 인수·A 기각·상용 조사 뒤 첫 opt-in 제품 prototype도 사용자 시각 검토에서 거절. 현재 #235 실제 자동 배치 opt-in checkpoint. 기존 실패 근거 보존·기본 활성화0·정본 개정 미시행**. Refs [#202](https://github.com/kywoo26/p2p-gostop/issues/202), [#200](https://github.com/kywoo26/p2p-gostop/issues/200), [선행 #233](https://github.com/kywoo26/p2p-gostop/pull/233). UX-02/05/06/H05/23~25·NF-03/08·AC-06/07 / plan §1.6·§3-2. 기준 `42c374d61bb2df6dafe608792044c4ae01355c1f`; 계획 SHA `e67b767fe1d1781240117381223d6ef18d1e8b90`; 이전 제안 SHA `b11d3b88cd43d26b4aab62ffd90681af7efed30d`.

## 1. 사용자 선택과 root 판단

사용자는 같은 월 카드를 살짝 어긋나게 겹치되 뒤의 중요한 카드도 읽히길 원하며 **구체 간격 판단을 담당자에게 위임**했다. 12/18/24px 중 하나 또는36/−24px를 사용자가 선택했다고 기록하지 않는다. 이전 `2764e76409ab931401c979e58018d25d5bd32cc1`에서는 root가36/−24를 비교 권고 기준으로 수락했지만, **최신 사용자 정정이 우선**한다. 두 장은 서로 구별하고,3장부터는 같은 월의 나머지 카드로 구성 유추가 가능하므로 개별 뒷장 전체 식별을 목표로 하지 않는다. 충분한 구분·중앙 공간·일관된 pair/group가 목적이다. 고정36/−24 전장 선형 확장·전체 앞면2열·30,000후보를 최종안으로 취급하지 않는다. 역사 증거는 해당 SHA에 보존한다.

사용자가 선택한 흐름은 **짝 위에 떨어질 때 은은한 빛 → 실제 Captured 때 더 뚜렷한 강조 → 각각 짝을 유지한 두 묶음이 함께 획득 칸으로 출발**이다. 가운데 한 덩어리로 합치지 않는다. 뻑은 접촉 빛이 있어도 획득 강조·이동이 없다. 빛의 색·명도·duration·flash 수치와 성능은 미확정이다. 색만으로 구분하지 않고 reduced motion에서 반복 점멸·필수 이동 의존을 피하는 검토가 필요하다. 일반 약0.5초는 목업 비교 제안이며 고정 wait 승인이 아니다.

선택창은 **짧은 월 제목 + 두 카드 전체 그림, 바닥 일부만 잠시 덮고 손패·점수 유지** 방식으로 사용자 수락됐다. 법적 대상이 여러 개인 경우만 연다. 과밀 fallback·최소 지원 높이 제한·현재 정본 전체 변경까지 승인한 답은 아니다.

## 2. 현재 코드와 규범 경계

현재 정본 spec §6·ui-spec UX-05/06/09·#201/#223은14장까지 독립 셀·앞면100%·5×3·중앙7 덱이다. `Floor.svelte`의 assignFloor/projectFloor는 논리 슬롯과 viewport 투영을 분리한다. 현재 resize는 탐색0 재투영이며 #223은 strict 해가 있으면 무관 CardId 이동0, 없으면 무관 CardId 이동 수→월 anchor 이동 수→격자 거리→결정적 tie다. 손패6↔7에도 두 행을 예약하는 부모 예산과 같은 viewport 바닥0px 기준을 보존한다. 아래 겹침·점유·resize 예외는 **개정안**이다.

실제 일반 engine 순서는 Played→Flipped→Matched(play/flip)→Captured다. 합성 시험의 Played→Matched→Flipped를 실제 근거로 쓰지 않는다. 획득은 실제 Captured/PiStolen만 따른다. 폭탄은 실제 Captured가 덱 전에 일어나는 별도 경로다. 손패가 짝 위에 떨어진 모습을 덱 전 먹기 확정으로 표현하지 않는다.

#200 분석에서 Matched는 정확한 target/source를 가지지만 Played/Flipped는 target이 없었다. 손패 대상 선택 뒤 다른 월 뒤집기 대상 선택을 기다릴 때 앞선 playTarget은 engine ctx에만 있고 BoardView/inFlight에 없다. 로컬 클릭만으로 관찰자·복원에 정확한 착지를 보장하지 못한다. root의 별도 좁은 public-match-target 담당이 실제 합법 연쇄 선택 재현과 최소 공개 계약을 검토한다.[#234](https://github.com/kywoo26/p2p-gostop/pull/234)의 설계/repro는 main `4a62c95fd1633371e2bf4ee5b4296eeaaa1ae440`으로 인수됐다. 별도 제품 [#236](https://github.com/kywoo26/p2p-gostop/pull/236)은 root가 리뷰/연결하며 이 #202는 미승인 wire 소비를 선취하지 않는다. 복구는 과거 모션 재연보다 현재 관계 수렴을 우선한다. #202는 engine/protocol/display/Playback/choreo를 편집하지 않는다. 연속 Matched 강조 교체와 획득 summary 최근4장 밖 목적 DOM 부재는 정적 우려이며 실행 해결로 기록하지 않는다.

## 3. 두 장 식별과3+ 묶음 인지의 분리 (42a779f 역사·현재 A 기각)

**당시 추천 A(현재 기각): 첫 두 카드의 구별 공간을 유지하고3·4장은 얇은 층,5장부터4번째 카드 위치를 공유하는 묶음.** 회전0·원 순서/z/CardId 유지, 중요한 카드를 임의로 앞에 옮기지 않는다. 두 장의36/−24는 역사 도상 비교를 출발점으로 쓰는 잠정치이며 모든 뒷장에 반복할 최종 규칙이 아니다.3+에서는 원 월 카드의 부분 그림·층·장수와 뻑/보너스 최소 단서로 묶음을 읽는다. 자동 묶음의 숨은 각각을 평시에 모두 식별시키려 하지 않는다.

첫 카드의 **실제 원점**을(0,0)으로 잡은 append 예시는 다음이다. i는 원 순서0기준이며 새 규범 수치는 아직 미승인이다.

| 카드 index | 추천 A local pose | 대안 B local pose |
| ---------- | ----------------- | ----------------- |
| 0          | (0,0)             | (0,0)             |
| 1          | (36,−24)          | (36,−24)          |
| 2          | (40,−28)          | (36,−24)          |
| 3 이상     | (44,−32)          | (36,−24)          |

A의 카드 bbox 상한은 **92×110.171875px**로4장 이후 멈춘다.3→6→획득직전7도 더 길어지지 않는다. B는3장부터 앞쪽 한 pose를 공유해84×102.171875px로 더 작지만 층 표현이 줄고 보너스 단서의200% 글자가 좁은 폭을 넘었다. 따라서 B를 기본안으로 추천하지 않는다. 두 안 모두 새 카드 추가로 기존 CardId의 pose를 다시 계산하거나 group top-left를 n에 따라 정규화하지 않는다.예약 bbox원점은첫카드실제원점의위32px(A)/24px(B)에고정해DOMlocal좌표와실제착지원점을분리한다.

최소 단서는 공개 `kind/cards`에서 얻는 **총장수, 뻑 여부, 묻힌 보너스 개수**뿐이다. 예: 자연3장 ‘3장’, 뻑6장 ‘뻑6장 / 보너스3’. 보너스의2피/3피 값을 합친 점수·권위 밖 힌트·새 자산을 추가하지 않는다. 보너스가0이면 두 번째 줄은 비운다.정지뻑6은‘뻑6장’,새월패1이붙은획득직전은‘6+1장’으로구분하며Captured전‘먹음’으로표시하지않는다. 종류는 기존 card catalog로 판정하며 보너스에 가짜 월을 붙이지 않는다. ARIA는 월·종류·월패/보너스 장수를 설명하고 개별 원 CardId도 보존한다. **단서 문구/위치는 개정 제안**이며 현 월/종류 badge 금지 규범의 좁은 예외를 승인 없이 시행하지 않는다.

단서를 포함한 A 예약 상한은100% 글자92×144.171875px,200% CSS 글자 모형92×176.171875px다(카드 높이78.171875+윗 여유32+2px 간격+두 줄32/64px).2장으로 들어갈 때부터 해당 글자 크기의3+ 상한을 예약하면2→3/보너스 추가시 같은 월 원점·기존 pose를 유지할 여지가 생긴다.1장→2장은 확대 예약의 strict fit 검사가 필요하다. 단서 공간을 면적 계산에서 빼거나 글자를 몰래 축소하지 않는다. 작은Chromium도판8예시에서A단서100/200%줄넘침0,B는200%보너스줄4예시넘침을관측했다.이것은도판의metric관측이며전체Board/OSzoom수용아니다.실제 label metric이 바뀌면 재검사하며 같은 viewport 글자변화를 resize 예외로 무단 간주하지 않는다.

### 두 장의 식별 근거와 한계

[역사 도상 비교](https://github.com/kywoo26/p2p-gostop/blob/2764e76409ab931401c979e58018d25d5bd32cc1/docs/design/month-stack-evidence/motifs.png)는 **두 장 식별 출발점**으로 유지한다. 왼쪽36px/아래24px에서 광 표시·띠 글자/형상·동물 윤곽을 본 근거이지3+ 각 CardId를 같은 정도로 드러내라는 규정이 아니다. 총 노출82.7%는 식별 PASS가 아니다.

- 29 뒤/31 앞: 왼쪽 기러기 부리·날개·몸은 남지만 세 새 전체가 안 보인다.
- 32 뒤/34 앞: 검은 寿 글자·술잔 아래 윤곽/물결은 남고 술잔 오른쪽 끝은 가려진다.
- 43 뒤/41 앞: 채운 아래 면이 일반 피의 빈 밝은 면과 구별되지만 명도/채움 의존을 인정한다.

위 구체 쌍의 판단은 역사 증거이며 실기기/색각 수용은 미검증이다. popup은 숨은 카드가 실제 후보일 때 전체 그림을 보여주지만 평시 두 장 식별의 약점을 자동 해결하지 않는다. [이번 작은 대표 목업](month-stack-evidence/order-and-boundaries.png)은 A/B·실제3/5·구성6·transient7·정지7 stress를 구분한다.

### 5/6/7의 규칙·실행 근거

[rules §12 R1/R7/B2/E1](../research/rules-commercial.md#12-권장-기본-규칙-세트): 월 카드4장, 보너스 최대3장, 뻑은 월패3장+연속 뒤집힌 보너스다. [flipStep](../../packages/engine/src/turn.ts#L257)은 heldBonuses를 쌓고 [resolve](../../packages/engine/src/turn.ts#L393)는 기본3장에 이를 묻는다. [groupSize](../../packages/engine/src/floor.ts#L22)는 뻑을3으로 취급하며 [matchSingle](../../packages/engine/src/turn.ts#L313)은 전체 무더기+남은 같은 월1을 획득한다.

| 상태         | 최대/관측                                                                                    | 근거 구분                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| loose 정지   | 1~2 월패                                                                                     | 코드/규칙상 대상 선택2장                                                                                        |
| natural 정지 | 3 월패                                                                                       | R7 한 묶음,남은1과 자동 획득                                                                                    |
| ppeok 정지   | 3 월패+0~3보너스=최대6                                                                       | 규칙/코드 정적 도출;사용자6~7 언급만으로 입증하지 않음                                                          |
| 실제5장 뻑   | 13/15/12/48/50                                                                               | 기존 seed1827/action9 합법 진행 실행 증거                                                                       |
| 구성6장 뻑   | 0/1/2/48/49/50                                                                               | 기존 createScenario로10/10/8/23 분배·총51/중복0,보너스3연속 뒤 play1→Ppeok6 실행. seeded newRound 도달증거 아님 |
| 획득직전7    | 위6+남은 월패3                                                                               | 다음 합법 play3→Matched7/Captured7 실행. engine 최종 floor7은 아님                                              |
| 공개 재생의7 | [display CardPlayed/addToFloor](../../packages/web/src/game/display.ts#L120)가기존6에낸1추가 | 코드 정적 도출,실제 Playback 실행 미검증                                                                        |
| 정지7 가정   | 월4+보너스3                                                                                  | 기본 규칙의정지상태로 입증하지 않은 stress;새 규칙을 만들지 않음                                                |

구성 fixture는 two-action engine 실행만이며 실제 seeded 진행/제품 모션 PASS로 승격하지 않는다. 뻑6은 획득 강조/이동0,7표시는 실제 Captured 뒤 전체 묶음을 획득 칸으로 보낸다. 서로 다른 월 두 짝의 ‘각짝 유지 동시출발’ 계약과 혼동하지 않는다.

## 4. bounded footprint·원 pose 예약·선택 resize

### 공간과 증감

안정 월 anchor와 실제 origin/CardId pose를 분리하고 **실제 카드+단서 bbox**를 덱/타월/영역 안에 예약한다.5×3/덱7은 선호 anchor 후보이며 독립14카드 셀 규범의 대체는 명시적 개정 대상이다. 단일 셀 overlay와12월 고정 자리의 역사 교차 기각은 유지하되 이번 bounded 모형의 충돌 결과로 전용하지 않는다. 선택 popup의 일시 바닥 가림만 수락됐고 덱/타월/손패/HUD의 지속 가림은 허용하지 않는다.

같은 viewport에서 무관 CardId 실제 pose 고정 strict 가능시0px,손패6↔7/두 행 예산과 snapshotSeq 예약은 #223대로 유지한다. 추가카드는 기존 원점/살아 있는 카드의 pose/z를 그대로 두고 비어 있는 정해진 local slot에 붙인다.작은도판의2→3→6→7에서survivor0/1의localpose(0,32)/(36,8)는그대로였다.DOM재생성/초점/제품stableinstance검증은아니다.2→3에서 앞 두 카드가 튀지 않고,4→5/6/7은 마지막 pose 공유로 envelope가 커지지 않는다. 숨은 원본들도 CardId별 DOM/pose를 유지한다.#200의선택원본beforepose와새카드의최종공유slot은서로다른정보이며,새slot을선택targetrect로전용하지않는다.정확접촉→공유slot정착의연결/추가이동은#200공통계약후제품검증이필요하다. 같은 rect를 공유하는 것이 같은 instance/ID라는 뜻은 아니다.

중간 제거는 동일seq동안 빈 slot·이전 envelope·원 target pose를 예약하며 살아 있는 카드를 index에 따라 재번호/압축하지 않는다. 최종seq 교체/queue 해제에서 예약을 풀고 변경 월의 국소 압축 여부를 별도 기록한다. round/더미 증가/reset/remount/restore는 기존 수명으로 reconcile한다. 추가 generation을 CardId+round 부족 반례 없이 도입하지 않는다.1→2 cap 예약 확장/예약 release의 제품 기하·최적성은 미검증이다.

추천 A의2장부터 최대 envelope 예약과 가장자리 origin이 실제 모든 법적 입력에서 들어가는지는 아직 미증명이다. 임시지원360×780/390×734/430×822와360×650 stress를 구분한다.650에서 A100% envelope 높이144.171875는 단일 묶음 높이157.4375보다 작지만 **다른 월/덱 포함 fit 증명이 아니다**.200%높이176.171875는157.4375보다 커 실패다. 역사 fullfront5의238.515625 실패도 보존하며 새 압축이 이를 해결했다고 기록하지 않는다. 새 최소 지원 높이 제한/축소/잘림/임의 이동으로 숨기지 않는다. fullfront2열은 이번 기본 fallback에서 제외하고 역사 후보로만 남긴다.

### UX-02의 선택 위치 고정 우선

현재 [UX-02](ui-spec.md#1-화면-크기와-안전-영역)는 **선택 중 선택 버튼 위치 고정**, #223은 resize 탐색0 재투영이다. 우선 열린 popup의 후보 버튼 rect·후보 순서/CardId·초점을 고정한다. viewport가 바뀌어도 필수 그림/이름·손패/점수가 안전하면 그 위치에서 선택을 끝내고 이후 레이아웃을 갱신한다. 원본 바닥 pose와 popup button rect를 섞지 않는다. 권위 timeout/원격 수락은 기다리게 하거나 연장하지 않는다.

바닥 재투영이 교차를 만들 때의 제한 재탐색은 **실제 viewport bounds 변경→strict 재투영 실패**에만 제안한다. 최신 bounds로 coalesce, same-seq예약/전체 실제 pose를 같은 transaction으로 검사한다. 동일 viewport 손패/options/보너스 증가 또는 글자 확대는 이 resize 예외 trigger가 아니다. 상한30,000후보·거리비용 교체는 역사 제안/재검토 가능이며 확정하지 않는다. strict 우선→#223 무관 CardId 이동 수/anchor 이동 수/기존 거리·결정적 tie 보존을 출발점으로 실제 후보 상한을 제품 전용 계측으로 정한다.

**고정한 선택 버튼이 더 이상 안전하지 않을 경우 아래 재배치 예외는 미승인 delta다.** 단순 geometry commit 잠금만으로 해결됐다고 쓰지 않는다. 정본 채택 전에는 이 예외를 제품에 활성화하지 않는다.

| 경계                   | 필수 취소/보존/재활성화 계약 제안                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 식별              | 현재 round·pending seat/source/card·공개 options로 선택 scope를 구분,원 CardId 유지. 로컬 geometry revision은 gesture 무효화용이며 권위/월generation/wire필드 아님                                       |
| pointerdown/up         | 눌린 CardId와 선택 scope/geometry를 보관. 필수 재배치 전에 그 눌림을 취소하고 capture가 있으면 release;뒤따른 up/click은 제출하지 않음. 새 위치에서는 새 down/up만 허용                                  |
| pointercancel          | 기존 눌림을 폐기하고 제출0. 재배치가 없어도 cancel된 press를 click으로 복구하지 않음                                                                                                                     |
| Enter/Space            | 눌림 scope를 보관,repeat은제출0. 재배치 취소 후 held key의repeat/keyup은제출0,키를 놓은 뒤 새 non-repeat 입력에서만 재활성화. Enter/Space의 native click과 중복제출 방지                                 |
| focus                  | 같은 pending/후보가 남으면 동일CardId 제어로 복귀,제거/권위변경이면 기존 제목/손패 복귀 helper. focus 자체가 선택이나 자동제출이 되지 않음                                                               |
| 원격수락/timeout/reset | 최신 권위 pending이 바뀌면 이전 gesture/후보/예약된 local 제출을즉시무효화하고닫음. old timeout연장/로컬 자동선택/늦은 입력 재실행0.권위가이미수락했으면재배치후중복제출0                                |
| beforepose             | 재배치 전 원본 CardId별 beforepose/예약version을 #200측정 owner가소비/취소할 경계를 먼저 확정.진행비행은 oldversion,안전정착후newversion 재측정.숨은카드 rect/sharedpose도 원CardId 유지;popup복제 측정0 |
| 안전 commit            | gesture취소와 #200예약처리가 끝난 뒤 최신 전체fit을 원자적으로commit.같은권위선택유효·pointer/key 모두release·새측정완료 때만 입력재활성화.조건하나라도불충족이면대기,fit불가를성공으로표시하지않음      |

취소 대상은 미제출 UI gesture뿐이며 이미 권위가 수락한 게임 선택을 취소하거나 rollback하지 않는다.새round/복원/reset·권위스냅교체 경계는 CardId/목록이같아도 로컬gesture를무효화하며 새wire/epoch필드를선취하지않는다.

구체 event wiring/버튼 handling은 Floor 및 필요 Board 최소 접점 설계 범위다. 실제 pointer/키 반복·권위 race·focus/회전/Playback 검증은 미실행이다. #200의 read-before-write 소비/취소 접점과 fit-fail UI/진행은 root 중재 차단 항목이며 이 문서가 새 engine/protocol 상태를 발명하지 않는다.

## 5. 기존 선택창 최소 재사용과 소유

실제 합법 선택 seed2/action9의 후보는11월 광40/피42 두 장이다. 바닥3장은 뻑 자동 묶음이며 긴3후보는 강건성 스트레스일 뿐 기본 UX 복잡화 근거가 아니다. 공개 options의 서로 다른 법적 CardId가 여러 개일 때만 popup을 연다.1대상·뻑·폭탄은 자동 묶음을 유지한다. hidden 손패/덱 다음 카드를 배치 예측에 쓰지 않는다.

[PromptPanel](../../packages/web/src/ui/PromptPanel.svelte#L38)의 native dialog·title/actions snippet·기존 [promptFocus](../../packages/web/src/ui/prompt-focus.ts#L19)를 **원본 그대로 import**한 격리 실행을 마쳤다. 짧은 제목 ‘11월 먹을 패’와 전체48px 그림 두 장·‘광/피’ 라벨이면 children/scrollTitle 새 API·ChoicePrompt32px 변경 없이 표시 가능했다. Chromium/WebKit×2높이×100/200% 글자 모형 **8조건** 모두 제목/라벨 보임·필수 scroll0·손패 교차0·손패 전체 보임. 작은 popup336×141.4375, 후보 hitbox157×78.171875, **그림48×78.171875**다. 일반 popup366×225.4375, hitbox172×78.171875다. OS zoom/실기기 수용으로 승격하지 않는다.

Tab 후보40→Escape 필수선택 유지→Enter40→원 손패 제어 초점 복귀를 관측했다. intro/outro reset 각각 두 엔진 **4경계**에서 dialog 잔류0·실행오류0였다. scratch는 실측7row/두 손패 행 예산과 inert bridge를 모형화한 것이며 실제 Board 통합 증거가 아니다. [작은 높이200% 대표](month-stack-evidence/prompt-reuse-small-200.png).

기존 긴 안내안의 client37/scroll358px와 예비 긴3후보 popup462.171875px·손패180px 침범은 기각 근거로 보존한다. popup의 잠시 바닥 가림은 사용자 수락됐지만 지속 같은 월 식별 문제까지 해결하지 않는다. 기존132px decision row는 skin 최종 투영에서 높이0이므로 해결 근거로 쓰지 않는다. 현재 직접 바닥 선택 버튼/그림48px와 ChoicePrompt의 장식 카드32px·획득32px 규범은 별개다.

- [choreo measure](../../packages/web/src/anim/choreo.ts#L173)는 `closest('dialog')` 복제를 제외한다. 현재 DIV role=dialog 안 원본 Card는 오류가 아니다. 복제 CardId는 native dialog 안에만, aria ID는 별도 고유 값·원본 data-anchor 복제0으로 둔다. 이는 이 연결의 근거이며 모든 미래 modal 규범이 아니다.
- [promptFocus](../../packages/web/src/ui/prompt-focus.ts#L69)는 intro/outro release·이전 초점·native 메뉴 잠금 중단을 관리한다. popup 하나에 한 번만 적용한다. 원 제어가 제거/잠기면 남은 손패/판 정보, 연속 선택이면 새 제목으로 돌아가는 기존 경로를 사용한다.
- [Board의 promptlockchange](../../packages/web/src/ui/Board.svelte#L129)는 active/퇴장창 siblings inert와 destroy 복원을 합성하고 [회전 복귀](../../packages/web/src/ui/Board.svelte#L187)에서 제목에 초점을 준다. nested Floor popup이 이 경로를 받는지 제품 통합 표적으로 확인해야 한다. 배경은 보이는 것과 입력 가능함을 구분한다.

root가 승인한 **후속 diff 범위 설계**는 Floor/layout/전용 시험과 필요할 경우 Board 최소 event/props/focus 접점이다. 구현 시작 승인과 정본 채택은 별도다. 우선 Floor options/onchoose를 기존 PromptPanel title/actions로 연결하고 원본 직접선택 role/focus effect를 제거·대체해 이중 focuslock을 막는다. wrapper는 floor 실측 bounds 안에만 둔다. Board는 실제 필요한 옵션·geometry readiness·기존 promptlockchange 전달/초점 연계에 한정하며 기존 동작으로 충족하면 diff0이다. **skin 전역 높이/Hand/HUD 재설계, PromptPanel 새 API, engine/protocol/display/Playback/choreo 편집은 범위 밖**이다. 권위 options 교체/timeout/reset은 오래된 선택 입력만 무효화하며 목업 임의시계로 선택하지 않는다.

## 6. #200 공통 접점

| 제공/보존                                                             | 계약 경계                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 원 CardId·round·월 anchor                                             | 새 generation은 부족한 실제 반례가 있을 때만; DOM slot key와 논리 identity 분리                 |
| 실제 card pose·rotation·z·offset·footprint·layout reservation version | #200은 선택된 원본 CardId의 before pose를 측정; group anchor/popup rect로 대체 금지             |
| source order·공개 options/onchoose                                    | 중간 공개 target 계약은 public-match-target 담당/root 소유; popup click만으로 권위 target 발명0 |
| snapshotSeq 예약·최신 bounds transaction                              | #200 취소/skip/reset/resize 측정 수명과 같은 버전으로 맞춤; 새 wire/schema 필드 확정0           |
| 원본 data-card-id·dialog 복제 제외                                    | before measure→commit/tick→after measure, 제거 전 pose 확보; ghost/예약 회수는 #200 owner       |

originalCardId→현재pose매핑은숨은원본의공유대표pose까지포함하고round/snapshotSeq예약과맞춘다.특정wire필드선취0.공개관계가미확정이면target을추측하지않으며restore는현재pose/관계수렴을우선한다.P2P 지연/restore 때 이전 재생이 새 후보·anchor를 되살리지 않아야 한다. #202는 레이아웃 정보만 제공한다. transform AABB/angle/추가 offset 중복 계산0, 기존 moved0.5px는 착지 허용오차 사용자 승인 아님. 두 파일 소유를 겹치지 않고 공통값은 root가 중재한다.

## 7. proposed spec/ui-spec delta (42a779f 역사·A 재검토 필요)

| 정본·현재 기준                                              | 추천 개정 문구·승인 상태                                                                                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| spec §6.2·UX-05/06/H05:14장독립셀·전면100%·월/종류badge없음 | 두 장은 두 패를 구별할 노출,3+는원순서/CardId·월묶음·장수/뻑/묻힌보너스의최소단서를허용.추천A는4층뒤pose공유로bounded footprint,값은잠정.개별3+전면식별규정을추가하지않음.단서의좁은예외미승인 |
| UX-06과밀5px접기/5×3중앙7                                   | 실제카드+단서footprint를예약,5×3은선호월anchor·실제origin분리.덱/타월/손패/HUD교차0.무한선형/큰fullfrontfallback을기본으로하지않음.fit-fail정책미결                                            |
| UX-08/09/24:바닥직접선택                                    | 공개법적options여러개일때짧은월제목+전체후보48px의기존PromptPanel.숨은원CardId도그대로후보에연결,평시압축에서대상선택규칙을추론하지않음.사용자popup방향수락·정본문구채택전                     |
| #223·UX-25:strict0px·same-seq예약·resize탐색0               | strict무관실제CardId0px/손패6↔7보존.원pose·holes·cap예약,실제viewport변경strict재투영실패때만제한탐색예외제안.상한/비용변경미확정                                                              |
| UX-02:선택중버튼위치고정                                    | **기본그대로유지**.안전하지않은viewport축소에서만,gesture/키held취소·최신권위확인·beforepose예약조율·안전commit후재활성화가완료된재배치예외를별도제안.미승인·실행미검증                        |
| spec §6.4·UX-15~17:실제사건/700ms/skip/reduced              | 실제Captured만획득,접촉은은한빛/먹을때강조·각짝유지동시출발.정지뻑6과획득직전7구분.색/시간/예산변경은별도계측전미확정                                                                          |

손패48px·전체앞면·두행,획득32px,중앙덱,NF-03 raw2,097,152 B/초기encoded1,500,000 B와성능목표보존.정본채택전시행0.역사36/−24전장선형/fullfront2열/30,000후보를승인규범으로치환하지않는다.

## 8. 유한 실행 계획·차단 항목

이번 compact revision으로 추천A/대안B 비교를 종료하고 #233 독립 설계 리뷰로 넘긴다.역사2764e 검토와 이번 정정을 구분한다. 제품 전 최소 남은 확인은 다음뿐이다.

1. 대표 두 장29/32/43 약점과3+ 최소단서/bounded footprint를 판단하고 §4의 UX-02 위치고정 우선/예외·예약·fit-fail 문구를 채택한다. 전체 자산/새 후보 행렬을 추가하지 않는다.
2. 같은 viewport 증감·same-seq 제거 예약·최종 release·resize trigger에서 실제 CardId pose 안정성/교차0을 확인할 전용 시험을 설계한다. scratch fresh packing은 이를 대신하지 못한다.
3. 실제 Board 안에서 기존 PromptPanel 한 번의 lock/inert·메뉴·coarse 회전·초점 복귀/intro-outro reset을 연결하고 §4의 pointerdown/up/cancel·Enter/Space repeat·원격timeout race·beforepose 버전 경계를 전용 검증한다. public-match-target 담당의 연쇄선택 공개 CardId/beforepose 계약을 받아 같은 버전으로 검증한다. fit-fail 진행 정책과 이 계약이 미결이면 해당 제품 흐름은 차단한다.

정본 채택/제품 착수 연결 후 Floor/layout→기존 popup→전용 회귀 순서다. AGENTS §5의 lint/check/test/test:browser/build/e2e:smoke/Android3 작업은 **제품 단계에서** 수행한다. PLAYWRIGHT_PORT=4258, workers≤4·timing직렬·Gradle max-workers≤4, 기준샷 자동 갱신/threshold 완화0. raw/encoded 별도 측정, Android/iPhone/핫스팟·OS 스크린리더·성능은 미검증이며 사람 결과 전 PASS0이다.

## 9. 증거·재현·검증 범위

공개 독립 리뷰는 현재 대표 PNG4개와 [익명 summary JSON](month-stack-evidence/summary.json)으로 가능하다. 기존3PNG는역사2764e그림이고 order-and-boundaries.png만 compact revision으로교체했다.과거원본은고정SHA로재현가능하다.PNG는 IHDR/IDAT/IEND만 있고 text/EXIF 등 metadata0, 원본 SVG51장/HTML/대량 로그는 추적하지 않는다. 도안은 수정하지 않았으며 이 파생 비교 그림은 **CC BY-SA 4.0**이다. Hwatu art by Spenĉjo and Marcus Richert, based on Hanafuda graphics by Louie Mantia, Jr.; 보너스 원본 CC0. [카드 고지](../../packages/web/public/cards/ATTRIBUTION.md)·[라이선스](../../packages/web/public/cards/LICENSE)를 보존한다.

scratch 원본은 `.visual-source/month-stack/`에 보존한다. `index.html`은 사건 storyboard/짝별 이동, `patterns.html`은 전체 도상/반전, `prompt.html`은 실제 PromptPanel import, `evidence.html`은 역사2764e PNG source,`compact-revision.html`은 이번 order-and-boundaries.png source다. 핀 Node/npm 선택과 npm ci 뒤 `node node_modules/vite/bin/vite.js '<SCRATCH_ENTRY_DIRECTORY>' --host '<LOOPBACK_HOST>' --port '<RESERVED_PREVIEW_PORT>' --strictPort`로 실행한다. `<…>`는 실행 전 치환할 자리표시자다. 실제 경로/주소는 root 비공개 인계하며 PR 단독 checkout에서 scratch 전체를 실행할 수 있다고 주장하지 않는다.

| 공개 실제 사건 fixture | seed·action(0기준) | 사실                                                                       |
| ---------------------- | ------------------ | -------------------------------------------------------------------------- |
| 서로 다른 월 두 짝     | 1·1                | Played→Flipped→Matched play/flip→Captured,45/44와31/30 각짝 유지 동시 출발 |
| 뻑3                    | 2·2                | Played→Flipped→Ppeok,33/34/32 잔류·Captured0                               |
| 폭탄4                  | 9·8                | Bomb→Captured→PiStolen→Flipped→Placed,16/19/18/17 실제 덱 전 획득          |
| 보너스 뻑5             | 1827·9             | Played→Flipped→Flipped→Ppeok,13/15/12/48/50 잔류·Captured0                 |

실제 floor 실측(Chromium/WebKit 같음)은360×780→336×243.78125,390×734→366×241.4375,430×822→406×285.78125,390×844→366×307.78125,430×932→406×395.78125,650스트레스→336×157.4375다. actual direct target32/33의 button/art48×78.171875·decision-area0px였다.241.4375를 모든 viewport 상수로 쓰지 않는다.

초기208px 가정720조건은 예비 모형으로만 보존했다. 교정된132조건은 single-cell overlay/12월 고정 자리 기각 근거다. 역사2764e의 후속은15개 fresh footprint 표적(10fit/5미발견)과 지원430×822의 동일5장뻑 **한 표적만** 추가했다.이11fit/5미발견 및650fullfront실패는 새compact정책의제품기하증거가아니다. 미발견과 불가능을 구분하고 무관0px/성능 최적성을 주장하지 않는다. 선택창 원본컴포넌트8조건+reset4경계역사관측은보존한다.이번추가는구성engine2action·작은A/B그림·동일2→3→6→7의survivorpose·단서100/200%뿐이며새seed탐색/큰행렬/제품suite없다. CSS200% 글자 모형은 실제 Safari zoom 아님. 빛의 후속 mock 수정은 시각 방향 시연이며 실제 Playback/reduced/취소 시험이 아니다.

AGENTS/RTK·정본/ui-spec/규칙§12·관련 이슈/#223 계약 읽기와 Node24.21.0/npm11.19.0 npm ci를 수행했다. Context7 callable이 없어 [Playwright Page](https://playwright.dev/docs/api/class-page), [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement), [Svelte snippet](https://svelte.dev/docs/svelte/snippet)·[imperative API](https://svelte.dev/docs/svelte/imperative-component-api), [Vite config](https://vite.dev/config/)·[plugin config](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/config.md)를 공식 원문으로 확인했다. 새 dependency0·외부 mock 요청0. 커밋 전 lint:fix/개인정보/whitespace 검사를 수행하며 제품 full suite는 이번 문서 단계에 반복하지 않는다.

## 10. 상용 화면 관측·사용자 시각 검토 묶음 (A 기각 뒤, 미채택)

### 현재 상태와 A 기각 원인

#233의 `42a779f7faec5f2dfec94ff38ed60dab8e7c8fce`는 제안 문서로 인수됐다. 그 뒤 실행계획 `aaa36ec3bc025a666a37e2611d9e7779c2d24893`의 변경5파일은 `intent/{plan,spec}.md`, `docs/design/{ui-spec,month-stack-proposal}.md`, `docs/design/month-stack-evidence/summary.json`이다. 제품 변경0이며 정본 안의 Draft delta도 미채택이다. 사용자에게 장수별 모형을 보여준 뒤 **여러 장이 한 장처럼 보인다**는 피드백을 받았다. A의 index3 이상은 모두 `(44,−32)`를 공유하므로5→6에 새 모서리/층이 생기지 않는다. 장수 문구는 이 형태 손실을 해결하지 못했다. §§3/4/7의 A는 역사로 보존하고 제품 작업을 중단했다. 단순 offset 미세 조정으로 방어하지 않는다.

### 공식 출처와 직접 관측

조사 범위는 맞고3곳이다. 공식 스토어 이미지21개와 한게임 가이드1개를 먼저 보았으나 대부분 광고 문구·캐릭터·합성 배경이 있었다. 홍보 화면을 실제 연속 동작 증거로 쓰지 않고 아래 공식 게임사 가이드의 플레이 화면을 직접 열었다. 아래는 **정적 가이드 화면**이며 영상 시각은 해당 없음이다. 현재 앱의 모든 상태/전환을 실행 확인한 것이 아니다. 상용 코드·규칙을 우리 엔진의 정답으로 채택하지 않는다.

| 출처·관측 화면 | 직접 보이는 것 | 확인하지 못한 것 |
| --- | --- | --- |
| [한게임 신맞고 모바일 게임방 가이드](https://mgostop.hangame.com/guide/combine/03_02_contents.html), [원본 화면](https://hangame-images.toastoven.net/hangame/mgostop/gameguide/page/08_image_01.png) | 중앙덱 왼쪽의2월3장은 오른쪽·아래로 조금씩 어긋나 뒤의 두 카드 상단/왼쪽 테두리가 각각 남는다. 앞 패 매화, 중간 띠 일부, 뒤 모서리가 보인다. 획득 영역 장수 표시는 바닥 표시와 구분된다. | 이3장 묶음의 내부 상태가 뻑인지 초기 자연3인지, 늘어나는 과정,4+·묻힌 보너스 |
| [피망 뉴맞고 기본 게임방법](https://dl.gostop.pmang.cloud/gamerule/basicRule.md), [뻑 화면](https://dl.gostop.pmang.cloud/upload/guide_mob_matgo_ppeok_250527.png), [따닥 화면](https://dl.gostop.pmang.cloud/upload/guide_mob_matgo_ddadak_250527.png) | 따닥 화면 왼쪽3월 두 장은 가로로 벌려 각 그림 일부를 남긴다. 뻑 화면 위쪽11월은 세 카드의 세로 가장자리와 그림 조각이 따로 보이며 큰 뻑 글자는 별도 효과다. 덱·타월·손패는 분리돼 있다. | 따닥4장 정확 좌표는 큰 효과가 가려 입증하지 못함. 뻑6/획득직전7·보너스 묻힘·선택창·과밀 재배치 |
| [윈조이 대박맞고 공식 가이드](https://static.winjoygame.com/v1/gostop_guide/dbmatgo.html), [게임방 화면](https://static.winjoygame.com/v1/gostop_guide/dbmatgo/8.html), [선택 설명](https://static.winjoygame.com/v1/gostop_guide/dbmatgo/9.html), [선택 이미지](https://static.winjoygame.com/v1/gostop_guide/img/dbmatgo/rule_02.jpg) | 바닥3월 두 장은 대각선으로 어긋나 앞 광과 뒤 모서리가 보인다. 선택 이미지는 두 후보를 별도 창에서 나란히 전체 그림으로 보여준다. 설명은 바닥 동일월2장일 때 두 후보 중 선택한다고 명시한다. | popup 열림/닫힘 시간·focus/gesture/timeout 동작의 실행,3+·6/7·보너스·과밀 동작 |

따라서 **4장 정확 겹침·상용6/7장·묻힌 보너스·도달 과밀의 배치 알고리즘은 이번 조사에서 미관측**이다. 관련 공식 영상의 실제 프레임을 확보하지 못했으며 영상 시간을 만들어 쓰지 않는다. 가이드 자산의 제작 시점/모바일·PC 세대 차이도 있으므로 현재 버전 모두가 같은 표현이라고 일반화하지 않는다. 공식 원본은 비교 인용용 로컬 scratch에만 보존하고 브랜드/그림을 제품이나 추적 자산에 편입하지 않는다. 원저작권은 NHN/NEOWIZ/ZEMPOT에 있다.

### 관측에서 얻은 원칙과 우리 자산 비교 두 안

관측으로부터의 **설계 추론**은 각 카드의 다른 가장자리·모서리와 앞 패 그림을 함께 남겨 묶음이 여러 장임을 읽게 한다는 것이다. 이것이 상용의 숨은 알고리즘을 알아냈다는 뜻은 아니다. 공간 상한은 우리 규칙§12의 정지6·획득직전7을 기준으로 설계할 수 있으나 같은 pose로 카드를 지우거나 숫자 문구만으로 층을 대체하지 않는다. 선택시에는 원 CardId의 전체 후보를 보여주는 기존 사용자 수락 방향을 유지한다.

- **비교1, 대각 겹침:** 첫 두 카드 다음에도 각 카드를 다른 위치에 놓아 늘어난 층을 남긴다. 하나의 묶음으로 읽히고 세로 예산이 작아 root가 현재 검토 기준으로 추천했다. 임시 예시는 first `(0,0)`, second `(24,−12)`, 이후 append마다 `(10,−4)`이며7장 카드 bbox는122×110.171875px다. 수치/방향/도상 식별의 최종 사용자 수락은 아니다. 뒤 보너스의 숫자나 원 월 도상이 부분 가려질 수 있고 단서/200%·앞뒤 반전의 수용은 미검증이다.
- **비교2, 월패+보너스 붙인 줄:** 월패와 보너스를 각각 눈에 보이는 카드 줄로 유지해 보너스 숫자를 더 보여준다. 세로 예약은6장162.171875px·획득직전7장168.171875px이고 두 묶음처럼 오인할 위험이 있다. 총 pose는 모두 다르고 원 순서/z/CardId를 유지한다. 초기 월패는 그대로 두며 보너스 추가/남은 월패 접촉은 append다. 새 보너스 종류/규칙/권위 필드를 만들지 않는다. 현재 대안이며 최종 추천/수락이 아니다.

![비교1 대각 겹침과 정상/과밀 합성판](month-stack-evidence/commercial-diagonal-review.png)

![비교2 월패/보너스 줄과 정상/과밀 합성판](month-stack-evidence/commercial-bonus-row-review.png)

두 도판의2장 일반·3장 뻑 예시와4~6장 뻑3+보너스 구성은 구분한다.7은 정지 floor7이 아니라6에 남은 월패가 붙은 획득직전 transient다. 상용 화면에서 이를 확인했다는 뜻은 아니다. 우리 합법 경계의 기존 정적/구성 실행 근거는 §3에 보존한다. 두 안의 첫 두 패와 늘어난 층은 보이지만 모든 종류를 충분히 읽는다는 사람 수용 판정은 아직 없다.

### 모형 관측과 안전 경계

부모 예산은 역사 실제 실측360×780의 floor336×243.78125px를 참고했다. **실제 Board 제품 screenshot이 아닌 합성 모형**이며 손패/HUD도 합성이다. 정상 모형 floor의10개 CardId/6월group는 기존seed1827/action9 공개 fixture 그대로이고, 임시 anchor의 한 배치에서 두 안 모두 rectangle상 floor 초과0·덱 교차0·타group pair 교차0이었다. 이는 한 모형 배치 관측이며 실제 Board/solver fit·안정성·실기기 PASS가 아니다.

오른쪽17패는12월 전부+뻑6을 정해진 위치에 강제로 놓은 **미도달 합성 stress**다. 대각 안은 floor 초과5·덱 교차1·타group pair 교차1, 별도 줄 안은2/1/3이었다. 현재 위치가 충돌한다는 관측이며 모든 배치 불가능·solver 미발견·상용도 불가능이라는 증거가 아니다. 강제 배치·축소·가림을 안전 fallback으로 채택하지 않는다. 이 두 안 외 변형/대형 행렬/새seed 탐색 없이 사용자에게 현재 검토 묶음을 보여준다.

원본 scratch의 `research/review.html?mode=diagonal|bonusrow`와 `research/sources-review.html`은 기존 격리 Vite4258에서 재현한다. 실행은 저장소 루트에서 `source "$HOME/.nvm/nvm.sh"`, `nvm use` 후 `node node_modules/vite/bin/vite.js .visual-source/month-stack --host 127.0.0.1 --port 4258 --strictPort`다. `$HOME`은 호스트 환경변수이며 치환 자리표시자가 아니다. 이미 해당 포트가 실행 중이면 서버를 중복 실행하지 않는다. 원본 html/51개 카드/광고 이미지/log는 추적하지 않고 자체 자산 도판2개와 익명 [관측 JSON](month-stack-evidence/commercial-observations.json)만 추가했다.

제품 진입 전 미결은 사용자 시각 검토, 실제 Floor/Board footprint/FIFO·same-seq 예약,1→2/2→3 기존 pose·resize/UX-02 gesture 수명,도달 과밀 최소 반례,200%/작은 높이 실패 대응과 #200 beforepose/settled 분리 통합이다. 현재 원 CardId→pose 관계는 유지할 요구이며 특정 wire 필드를 선취하지 않는다. 실기기/OSSR/모션 성능 PASS0·제품 suite 미실행·baseline 변경0이다. privacy의 앞선1finding은 기존 취소선 표현의 홈 경로 오탐이었다. 원문 재출력 없이 해당1줄을동일의미 HTML취소선으로 바꾼 뒤 finding0을 별도로 확인했다. 앞선 실패와 이후 성공을 혼동하지 않는다.


## 11. 첫 실제 Board 배치 거절 뒤 재설계 (working·미채택)

### 배치 단위와 다음 구현 순서

첫 checkpoint는 `SLOT_ORDER`의5×3 슬롯 선호와 장애물 가장자리 후보를 그대로 사용했다. 둘 이상의 카드가 있는 모든 월에7장 cap을 예약해 실제 카드보다 공간을 크게 차지했고, 처음 두 장 `(24,−12)`와 이후 `(10,−4)` 간격도 달랐다. 원본을 서로 다른 pose로 그렸다는 사실은 일렬 배치·어색한 층 간격을 해결하지 못한다. 사용자 거절 이후 이 dirty prototype의 완성/기본 전환을 멈추고 실패 시험과 원본을 보존한다.

추천하는 다음 구조는 **현재 월 묶음의 실제 footprint가 소유한 영역 안에서 일정한 간격으로 포개기**, **그 월의 영역을 덱 주변 빈 공간에 서로 다른 높이로 배치**다. 고정 월 위치/hand 좌표나5×3 슬롯 순서를 시각 목표로 쓰지 않는다. 매번 무작위 흩뿌림도 쓰지 않으며 기존 월의 anchor·남은 CardId의 pose·방향은 유지한다. 묶음 전체의 작은 기울기는 회전 AABB가 검증되는 범위의 시안일 뿐 수락 규범이 아니다.

후속 solver는 실측 bounds에서 덱/뒤집기 자리·기존 월 영역·same-seq 제거 예약을 뺀 빈 영역을 먼저 다루고, 원래 영역 유지 가능한 해를 우선한다. 변경 월은 실제 크기와 들어오는 공개 카드의 증가분으로 공간을 계산하며 일반2장에 무조건7장 공간을 점유시키지 않는다. 증가 공간이 충돌하면 무관 월을 고정한 해부터 찾고, 불가능이 확인된 경우에만 기존 #223의 이동 개수/anchor 보존 우선을 반영한 최소 재배치를 검토한다. 시안 좌표를 fixture별 solver 하드코드로 옮기지 않는다. 현재 격자 Manhattan 비용을 연속 공간 거리로 바꾸는 문구·resize 재탐색 예외는 별도 proposed delta이며 이번 그림으로 자동 채택하지 않는다.

그 다음 최소 검증은 같은 두 실제 fixture의 최초 배치와1→2/2→3/보너스 뻑6·회수7 성장, 제거 전후 원 CardId pose/무관 월 이동, same-seq 예약 유지/큐 해제, resize와 활성 선택 버튼 gesture 수명이다. 덱/손패/점수 비가림, 자동 solver fit 실패 안전 경로가 없으면 제품 gate를 통과했다고 쓰지 않는다. 수동 배치2건을 성장 예약·선택 UX·모든 화면/실기기 성공으로 확대하지 않는다.

### 뻑 저장 순서와 눈에 보이는 층 순서

규칙§12 B2/E1은 연속 뒤집힌 보너스가 뻑에 묻히는 조건을 정한다. 마지막 월패가 맨 위에 보여야 한다는 사용자 피드백을 따른다. [flipStep/resolve](../../packages/engine/src/turn.ts)는 `heldBonuses`에 먼저 뒤집힌 보너스를 모으지만 최종 저장 `pile`을 `[...floorCards, played, flipped, ...heldBonuses]`로 만든다. 이 저장 배열은 시간순 z-order 계약이 아니다. [display](../../packages/web/src/game/display.ts)의 CardPlayed는 월패를 floor에 추가하고 CardFlipped는 staging에 쌓으며 Ppeok은 이벤트 `cards` 그대로 floor group에 복사한다. 그러므로 `원순서/z 보존`이라는 이전 표현을 저장 배열 그대로 그리는 근거로 쓰지 않는다.

| 좁은 근거 | 저장/실제 display | 추천 시각 층, 뒤→앞 |
| --- | --- | --- |
| 실제 seed1827/action9 저장 history 재실행 | 원 floor13, Played15, Flipped48→50→12, Ppeok 저장 `[13,15,12,48,50]`; 뒤집기 동안 staging `[48]→[48,50]→[48,50,12]` | `[13,15,48,50,12]`. 보너스는 중간, 마지막4월12가 맨 위 |
| 기존 표준분배 구성의 합법 뻑6 실행 | Played1, Flipped48→49→50→2; 저장 `[0,1,2,48,49,50]`, Captured 없음 | `[0,1,48,49,50,2]`.1/2번째 원 pose 유지, 마지막1월2가 맨 위 |
| 위 뻑6을 다른 좌석이 회수하는 합법 구성 | CardPlayed3가 display의 기존6에 append되어7 transient; Matched/PpeokTaken 뒤 actual Captured7에서 floor 제거 | 기존6의 층 그대로 위에3 append: `[0,1,48,49,50,2,3]`. 정지 floor7 아님 |
| 기존 뻑3 회수에 새 보너스가 뒤집힌 합법 구성 | 기존 `[0,1,2]`+Played3은 floor4, Flipped48→35는 staging; Captured `[0,1,2,3]`와 별도 Captured `[48]` | 기존 뻑의 위에 회수월패3. 새48을 기존 뻑 중간에 넣지 않고 별도 staging/실제 획득을 따른다 |

seed1827은 기존 고정 history만 재실행했고 새 seed 탐색을 하지 않았다. 구성6/7·추가 보너스는 합법 engine reduce와 실제 display.applyEvent 확인이며 자연 진행 seed reachability/WAAPI Playback/기기 실행 PASS가 아니다. 이미3보너스를 가진 뻑6에는 덱에 네 번째 보너스가 남는 상황이 없다(R1). 초기 자연뻑의 원 도상 순서는 이 뻑 생성 시간순 증거와 구분하며 출처가 없는 최초 배치 순서를 만들어 쓰지 않는다.

후속 presentation은 `originalCardId→{local position,angle,z}`를 권위 group 배열과 분리한다. Ppeok 생성 이벤트가 있는 재생에서는 공개 시간순을 사용하고, 이 저장 계약의 뻑 snapshot에서는 먼저 저장된 월패3장의 마지막 패가 뻑 생성 최종 월패이고 보너스가 뒤에 묶인 구조임을 근거로 복원한다. 뒤에 실제로 append된 회수 월패는 맨 위로 더한다. 전역 bonus 정렬·ID 숫자 정렬·권위 배열/선택 target 변경을 하지 않는다. 이벤트/저장 계약으로 확인하지 못하는 복원 순서는 추정으로 표시하며 새로운 wire 필드를 선취하지 않는다.

#200 접점: 선택 원 CardId의 실제 beforepose, 월 anchor와 이후 settled-top은 서로 다르다. 첫 바닥13/낸15의 local pose는 유지하고 보너스48/50과 마지막12의 층만 공개 동작 순서에 맞춘다. staging에서 들어오는 카드의 beforepose와 floor 삭제 전 pose는 측정 owner 계약에 따른다. 최종 snapshot의 저장 순서가 다시 들어와도 층이 뒤집히거나 숨은 원 CardId가 다른 카드로 대체되면 안 된다. 두 쌍 획득은 실제 Captured에서 각 짝을 유지한 두 묶음이 함께 출발한다는 기존 사용자 방향을 보존한다.

### 같은 두 fixture의 수동 시각 검토

scratch `natural-replan.mjs`가 기존 실제 Board DOM/동일 공개 fixture 위에서 위치·기울기·시각 index/z만 override한다. 카드 SVG48px/기존 Hand·HUD·더미·권위 배열/DOM CardId는 유지한다. **새 solver 출력/제품 기본 화면/수용 완료가 아니다.** 현 시안의 append `(12,+6)`는 첫2장/3+ 동일하며 수치 수락을 받았다는 뜻이 아니다. 실제 부모336×243.78125px/viewport360×780px 한 상태에서 다음 변환 AABB를 측정했다.

- 보통10패/6월group: 월간 최소 거리15.632237px, 덱 최소3.6328125px. 뻑5는 마지막4월12가 맨 위다. 이전 최소1.301px 하단 경계를 같은 시안의 한 위치 조정으로 벌렸다.
- 혼잡12패/8월group: 월간 최소12.825800px, 덱 최소3.0234375px. 왼쪽 아래11월 묶음 높이를 달리해 아래12월/10월과 한 줄처럼 붙어 보이는 경계를 분리했다. 이전 최소5.825802px와 구분한다.
- 두 시안의 영역 밖/타월 AABB 교차/덱 AABB 교차는 각각0이다. 교차0은 지각상 충분한 월 구분·도상 식별·물리 기기에서 읽힘을 보장하지 않는다. 덱3px대는 아직 좁으며 최종 clearance 규범이나 모든 상태 결과가 아니다.

수정 그림은 scratch `replan-normal-ppeok.png`/`replan-crowded-ppeok.png`, 익명 관측은 `natural-replan-observations.json`/`ppeok-order-observations.json`이다. 맨 위 보너스였던 기존 normal과 첫 경계 배치는 scratch에 기각 근거로 보존한다. root 직접 시각 검토 뒤 사용자에게 제시하며 이번 단계는 working 자료로 새 게시 SHA가 없다. dirty 제품 표적 시험12통과·4실패·미처리 오류4는 미통과 상태 그대로다. 기본값 전환/정본 채택/전체suite 반복/baseline 갱신0이다.


### 사용자 크기 정정 후 같은 두 판 비교 (working·최종 수치 미채택)

사용자가 바닥/덱 또는 획득패 크기를 줄여 타월과 덱 사이 빈 공간을 넓히라고 명시했다. 이전48px 고정은 이번 개정 검토의 제약이 아니다. Floor.table의 로컬 opt-in `--table-card`/높이44px와 Board root의 opt-in `--capture-card`28px만 편집했다. Card/Hand/CapturedPile/skin/global tokens에는 손대지 않았다. 기존 CSS의 `capture-card-height→fan-capture→grid row`가 부모 예약까지 줄이므로 단순 이미지 축소와 다르다. 실제 Board 크기/행 변경 위에 수동 영역 배치를 유지한 시안이며 새 solver 성공이 아니다.

| 비교 | 실제 바닥/덱·획득 폭 | 실제 중앙336px 폭의 높이 | 정상 최소 월/덱 거리 | 혼잡 최소 월/덱 거리 |
| --- | --- | --- | --- | --- |
| 이전 수정48 시안 | 48·32px | 243.78125px | 15.632/3.633px | 12.826/3.023px |
| 후보1 | 44·32px | 243.78125px | 20.526/13.406px | 17.155/12.281px |
| 후보2 | 44·28px | 256.8125px | 20.526/18.929px | 17.155/14.844px |

획득32→28은 양쪽 capture 행70.109375→63.59375px로 각각6.515625px 감소해 중앙에13.03125px를 돌려줬다. 손패 폭48px·선택 후보 전체 이미지48px×2·버튼157×80.171875px는 유지됐다. popup 측정용 data-card-id 중복0이다. floor/덱은44px와44/0.614 높이로 같은 비율이다. 시안의 포개기 간격도44/48 비율로 함께 줄였으며 저장 CardId/뻑5의 마지막 월패 top은 그대로다. 혼잡 최하단10월은 같은 시안에서 y164→170px로 한 번 조정했으므로 전후 간격 차이를 전부 순수 축소 효과로 설명하지 않는다.

직접 그림에서44px 바닥의 큰 도상과 늘어나는 층은 보이지만 모든 뒤 카드 종류 식별/실기기 읽힘은 별도다.28px 획득에서도 큰 도상은 구별되나 작은光 표기·띠 글자는32px보다 불리하다. 현재 후보1을 먼저 추천하는 이유는 두 시안에서 덱 AABB 여백12px 이상을 얻으면서 획득패의 추가 식별 손실을 줄이기 때문이다. 숫자를 사용자가 선택했다거나 모든 상태/기기에서 수용했다고 쓰지 않는다.

표의 거리는 변환된 group/deck AABB 사이 Euclidean 간격이며 카드 외곽1px·기존덱 우/아래4px 장식 shadow까지 포함한 최소 무음영 간격과 같지 않다. 특히 후보1 혼잡 하단의 실질 빈 공간은12.281px보다 작다. 하이라이트/접촉 광과 이동 경로까지 가림0을 보증하는 수치로 쓰지 않는다. 두 후보의 정적 영역밖/타월 교차/덱 교차 각각0은 이 수동 배치 관측으로만 남긴다.

그림 `spacing-capture32.png`/`spacing-capture28.png`는 각720×900px 비교판이며 안쪽 실제 Board fixture360×780 두 장을 나란히 놓았다. 채팅 축소 표시를 실기기 CSS48/44px 검증으로 오인하지 않는다. 익명 scratch `spacing-observations.json`은 실제 card CSS 폭·capture 행·부모bounds·AABB 거리·popup 크기를 별도로 보존한다. root에게 먼저 전달했고 최종 사용자 시각 판단/자동 배치·성장·회수/snapshot/FIFO·실제 모션과 실패 안전 경로는 미완이다. 기존 표적 실패12pass/4fail/미처리4와 이번 sizing 측정을 구별하며 전체suite/baseline 갱신0이다.


### 자동 배치 구현 checkpoint (opt-in·제품 수용 아님)

현재 Floor/layout은 uniform append `(12,+6)×44/48`, CardId별 distinct pose, 작은 결정적 묶음 angle과 실제 outline footprint를 사용한다. slot은 내부 표식일 뿐 격자/identity/DOM key가 아니다. 첫 두 카드만 간격을 벌리거나 모든2장에7장 크기를 예약하지 않는다. 전역 skin/Hand/HUD/Card/CapturedPile/PromptPanel API는 편집하지 않았다. Board 최소 popup은 기존 native PromptPanel title/actions를 사용하고 전체48px 그림·최소48px 버튼·원 candidate ID를 보존한다. opt-in 기본값은 false이며 Game 경로는 아직 연결하지 않았다.

**실패 정정:** 앞선 auto-normal/crowded PNG는 solver 미발견 뒤 unsafe 좌상단 fallback의 실제 DOM였다. model→DOM 오차 약0.012px로 transform 문제 증거는 없었다. 먼저 성공했던 실행 수치와 같은 파일명에 덮어쓴 실패 그림을 혼합한 보고를 정정했다. 실패 PNG/immutable audit `20261001T164548556Z`는 scratch에 보존한다. 새 타입은 placed/fits:true와 failed/fits:false/cells:[]를 분리하며 실패 좌표를 다음 anchor로 재사용하지 않는다. cells[]는 개발 진단이며 카드 없는 사용자 정상판을 허용한 fallback이 아니다. 필요한 모든 ID의 안전 표시/입력 실패 UX는 여전히 제품 차단 항목이다.

deck 측정에서 computed outline-width3px이더라도 outline-style:none은 실제 paint0이다. 이 phantom padding을 제거하고 실제 solid outline1px·덱 우/하4px shadow를 유지했다. 방문 예산8192·간격 후보12.125는 증액/완화하지 않았다. finite 원인은 큰 묶음을 놓은 뒤 남은 영역의 수용량이 부족한 가지에서 작은 월 후보를 계속 탐색한 것이었다. maximal empty rectangle cover의 보수적 capacity 상한으로 그 가지를 기각했다. 각 남은 AABB는 어떤 cover 안에 완전히 들어가며, 최소 폭/높이+gap의 origin 구획마다 최대 한 개만 들어갈 수 있다. cover가 겹쳐도 합산하므로 상한을 작게 만들지 않는다. 남은 group 소유 예약은 이 상한의 장애물에서 제외한다. 작은2/3/4개 유효 구성·덱 양쪽 분리 구성의 기각 여부를 전용 회귀로 대조했다. 후보 집합의 완전성/모든 가능한 배치 증명은 아니다.

고정 run `20261001T165412510Z`는 font ready+모든 이미지 decode+5회 연속 같은 table DOM/높이 RAF를 기다려 전후 DOM이 동일한 프레임을 캡처했다. 파일 hash·시각·카드 ID·model/DOM 측정은 scratch immutable manifest에 함께 보존하고 최소 익명 [checkpoint JSON](month-stack-evidence/automatic-checkpoint.json)만 게시한다. 캡처 뒤 좌표 override/fixture별 solver 좌표/카드 누락은 없다.

| 실제 fixture | 최초 탐색/상한 pruning | 안정 후 탐색 | ID/DOM 타월교차/범위초과 | 최대 model→DOM 오차 | 월간 / 덱간 paint 여백 |
| --- | --- | --- | --- | --- | --- |
| normal, seed1827/action9 뻑5·10패/6월 | 9 / 2 | 0 | 10일치 / 0 / 0 | 0.01260px | 12.121 / 12.116px |
| crowded, seed2 합법 경계·12패/8월 | 23 / 14 | 0 | 12일치 / 0 / 0 | 0.01513px | 12.121 / 12.130px |

최초 탐색은 같은 input을 previous 없이 순수 layout에 재입력한 방문 수다. DOM의 searches0은 안정 후 유효 배치 재사용값으로 최초 비용0/성능 PASS를 뜻하지 않는다. paint 여백은 실제 카드 변환 DOM AABB에 회전된1px outline을 보수적으로 확장한 월 union과 측정 덱 outline/shadow 장애물 사이 거리다. model footprint 간격12.125와 구분하며 highlight 광/WAAPI 경로/실기기 읽힘은 미측정이다.

![실제 Board normal 자동 solver fixture](month-stack-evidence/automatic-normal.png)

![실제 Board crowded 자동 solver fixture](month-stack-evidence/automatic-crowded.png)

두 그림은 실제 Board/Floor DOM fixture의 자동 출력이다. 전체 Game 녹화/실기기 screenshot은 아니다. normal 오른쪽 네 단패가2×2로 모이는 시각 약점은 남는다. 사용자 격자 거절을 해소했다고 쓰지 않고 이번 후보 탐색은 여기서 멈췄다. 뻑5 최종 월패12가 bonus48/50 위에 보이며 저장 배열/원본 선택 ID는 불변이다.

전용 회귀는 이전12pass/4fitfail/미처리 pointer4와 구분한다. 새1차 표적은20pass/2fail/미처리0이었다. 실패2건은2→6 성장에서 기존 world pose를 무조건 고정한 기대였으며 실제 증가 footprint가 덱 paint 여백과 충돌했다. 해당 월 origin 재배치와 원 CardId local 위치/angle/index·무관 월 고정을 분리한 검증으로 고쳤다. 같은 viewport/작은1→2 strict 가능시 원위치를 보존한다. 같은 seq 삭제 예약은 카드 제거와 별개이고 release/seq/round에서 해제한다. 예약의 독립 bounds를 유지해 연속 resize에서 마지막 성공 배치 기준 이중 투영을 피한다. 구성6/재생7 presentation·snapshot은 전용 model/DOM 조건이며 실제 Playback/WAAPI 통과가 아니다.

최종 전용 실행은 Chromium/WebKit22표적 통과·미처리0이며 web check는 오류0/경고0이다. 이전4fitfail과 pointer 미처리4가 현재44/32의 해당 표적에서 재발하지 않았음을 구분하며 과거48px/cap7/격자 구현이 통과했다고 기록하지 않는다. 커밋 전 lint:fix의 reactive dependency bare-expression4건은 명시적 void read로 정리했고 재실행은 성공했다.

입력 NotFoundError만 active gesture/release를 취소한다. 늦은 pointerup/click은 선택을 제출하지 않고 새 실제 pointer 입력은 정상 선택하며 이미 제출된 선택은 rollback하지 않는다. 합성 dispatchEvent는 browser active pointer를 만들지 않는 시험 한계가 있고, provider 실제 click 경로를 별도로 검증했다. 무관 예외는 rethrow한다. pointercancel·resize·old candidate·held Enter repeat·native dialog 후보48px/원 data-card-id 중복0도 전용 표적이다.

잔여 gate: 정상 시각 자연스러움 수용, 비strict #223 전역 최소 이동 비용, 실패 UX/최소 뻑·bonus 단서, 좁은 높이/200%에서 전체 필요한 정보 fit, UX-02 원격수락/timeout/focus/pose 수명, #200 정확 beforepose→settled·Game 기본 적용/기존 분기 정리·P2P·모션·실기기/OSSR·성능·NF-03 예산. 필수 전체suite는 제품 최종 checkpoint에 한 번 수행하며 이번 단계에서 미실행이다. baseline/threshold 변경0·새seed/큰 행렬0·기본 적용0·정본 최종 채택0이다.
