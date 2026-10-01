# 같은 월 겹침·선택 제안 (#202)

상태: **구체 설계 독립 리뷰 대기; 제품 변경0·정본 개정 미시행**. Refs [#202](https://github.com/kywoo26/p2p-gostop/issues/202), [#200](https://github.com/kywoo26/p2p-gostop/issues/200), [Draft #233](https://github.com/kywoo26/p2p-gostop/pull/233). UX-05/06/H05/23~25·NF-03/08·AC-06/07 / plan §1.6·§3-2. 기준 `42c374d61bb2df6dafe608792044c4ae01355c1f`; 계획 SHA `e67b767fe1d1781240117381223d6ef18d1e8b90`; 이전 제안 SHA `b11d3b88cd43d26b4aab62ffd90681af7efed30d`.

## 1. 사용자 선택과 root 판단

사용자는 같은 월 카드를 살짝 어긋나게 겹치되 뒤의 중요한 카드도 읽히길 원하며 **구체 간격 판단을 담당자에게 위임**했다. 12/18/24px 중 하나 또는36/−24px를 사용자가 선택했다고 기록하지 않는다. root는 실제 앞뒤 반전·보너스·선택창 그림을 확인하고 **36px 오른쪽/24px 위 겹침을 권고 기준**으로 수락했다. 모든 상태의 식별·공간 수용 PASS 또는 제품 적용 승인으로 확대하지 않는다.

사용자가 선택한 흐름은 **짝 위에 떨어질 때 은은한 빛 → 실제 Captured 때 더 뚜렷한 강조 → 각각 짝을 유지한 두 묶음이 함께 획득 칸으로 출발**이다. 가운데 한 덩어리로 합치지 않는다. 뻑은 접촉 빛이 있어도 획득 강조·이동이 없다. 빛의 색·명도·duration·flash 수치와 성능은 미확정이다. 색만으로 구분하지 않고 reduced motion에서 반복 점멸·필수 이동 의존을 피하는 검토가 필요하다. 일반 약0.5초는 목업 비교 제안이며 고정 wait 승인이 아니다.

선택창은 **짧은 월 제목 + 두 카드 전체 그림, 바닥 일부만 잠시 덮고 손패·점수 유지** 방식으로 사용자 수락됐다. 법적 대상이 여러 개인 경우만 연다. 과밀 fallback·최소 지원 높이 제한·현재 정본 전체 변경까지 승인한 답은 아니다.

## 2. 현재 코드와 규범 경계

현재 정본 spec §6·ui-spec UX-05/06/09·#201/#223은14장까지 독립 셀·앞면100%·5×3·중앙7 덱이다. `Floor.svelte`의 assignFloor/projectFloor는 논리 슬롯과 viewport 투영을 분리한다. 현재 resize는 탐색0 재투영이며 #223은 strict 해가 있으면 무관 CardId 이동0, 없으면 무관 CardId 이동 수→월 anchor 이동 수→격자 거리→결정적 tie다. 손패6↔7에도 두 행을 예약하는 부모 예산과 같은 viewport 바닥0px 기준을 보존한다. 아래 겹침·점유·resize 예외는 **개정안**이다.

실제 일반 engine 순서는 Played→Flipped→Matched(play/flip)→Captured다. 합성 시험의 Played→Matched→Flipped를 실제 근거로 쓰지 않는다. 획득은 실제 Captured/PiStolen만 따른다. 폭탄은 실제 Captured가 덱 전에 일어나는 별도 경로다. 손패가 짝 위에 떨어진 모습을 덱 전 먹기 확정으로 표현하지 않는다.

#200 분석에서 Matched는 정확한 target/source를 가지지만 Played/Flipped는 target이 없었다. 손패 대상 선택 뒤 다른 월 뒤집기 대상 선택을 기다릴 때 앞선 playTarget은 engine ctx에만 있고 BoardView/inFlight에 없다. 로컬 클릭만으로 관찰자·복원에 정확한 착지를 보장하지 못한다. root의 별도 좁은 public-match-target 담당이 실제 합법 연쇄 선택 재현과 최소 공개 계약을 검토한다. #202는 engine/protocol/display/Playback/choreo를 편집하지 않는다. 연속 Matched 강조 교체와 획득 summary 최근4장 밖 목적 DOM 부재는 정적 우려이며 실행 해결로 기록하지 않는다.

## 3. 권고 정책과 실제 도상 근거

**원래 순서/z/CardId를 보존하고 회전0, 다음 카드를 오른쪽36px·위24px에 놓는다.** 중요한 카드를 임의로 앞에 옮기지 않는다. 뒤 카드의 왼쪽36px 전체 높이와 아래24px 전체 폭이 남는다. 두 칸 떨어진 카드의 x 간격72px가 폭48px보다 커서 인접 다음 카드만 가린다. 따라서2/3/4/보너스5장과 순서 반전에도 각 뒤 CardId의 같은 보호 띠가 남는다. 이것은 기하 성질이며 사람이 읽는다는 자동 보장은 아니다.

| 비교       | 뒤 카드 기하 노출 | 판단                                                               |
| ---------- | ----------------: | ------------------------------------------------------------------ |
| 이전24/+16 |             60.2% | 아래 광·11월 쌍피 영역이 가려져 기각                               |
| 권고36/−24 |             82.7% | 광 표시·띠 글자·동물 형상·보너스 숫자가 보호 띠에 남음             |
| 비교40/−20 |             87.6% | 일부 노출 증가에 비해 footprint 폭 증가; 기본 권고로 채택하지 않음 |

분모는48×78.171875px이며 회전0에서 `1−((48−|dx|)(78.171875−|dy|)/(48×78.171875))`다. 총면적만으로 식별 PASS를 주지 않는다. [대표 전후 그림](month-stack-evidence/motifs.png)과 [앞뒤 반전·도달 묶음](month-stack-evidence/order-and-boundaries.png)에서 **각 뒤 카드 종류**를 판단한다. 반전은 식별 스트레스이며 engine 순서 변경 제안이 아니다.

| 월·뒤 카드       | 남는 종류 식별 근거                                                    | 가림/판단 한계                                                                                        |
| ---------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1:0/1            | 아래 오른쪽 光·학, 왼쪽 홍단 글자/길쭉한 띠                            | 다른 피의 식물 패턴도 함께 보존                                                                       |
| 2:4/5            | 새 눈·부리·몸 윤곽, 홍단 글자/띠 형상                                  | 동물 전체 앞면은 아님                                                                                 |
| 3:8/9            | 아래 왼쪽 光·꽃광막, 띠 글자/형상                                      | 원본과 전후 비교 필요                                                                                 |
| 4:12/13          | 새 몸/날개, 글자 없는 띠의 길쭉한 외곽                                 | 새 꼬리 일부 가림; 띠를 색만으로 판단하지 않음                                                        |
| 5:16/17          | 아래 노란 다리 형상, 왼쪽 띠                                           | 다리 위 모서리 일부 가림                                                                              |
| 6:20/21          | 나비 날개/검은 윤곽, 청단 글자/띠                                      | 색만으로 구분하지 않음                                                                                |
| 7:24/25          | 멧돼지 얼굴·점·앞다리, 띠                                              | 몸 오른쪽 일부 가림                                                                                   |
| 8:28/29          | 달·아래 光; ID29의 왼쪽 기러기 부리/날개/몸                            | **29 뒤/31 앞**에서 세 새 전체는 안 보임. 광/피와 구분할 새 형상이 남지만 직접 식별 확인 필요         |
| 9:32/33          | 술잔·검은 寿 글자·아래 물결; 청단 글자/띠                              | **32 뒤/34 앞**에서 술잔 오른쪽 끝 일부 가림. 글자와 컵 아래 윤곽은 남으며 국진 인지 실기기 확인 필요 |
| 10:36/37         | 사슴 머리·목·앞다리, 띠 글자/형상                                      | 뒤 다리 가장자리 일부 가림                                                                            |
| 11:40/43 vs41/42 | 아래 오른쪽 光;43의 아래 채운 면 vs41/42의 빈 밝은 면                  | **43 뒤/41 앞**, 반전에서도 채운 아래 면 남음. 명도/채움 의존을 인정; 색각·실기기 수용 미검증         |
| 12:44/45/46/47   | 위 왼쪽 光·사람 옷/다리, 새 눈/부리/날개, 띠, 검은 둥근 형상/아래 격자 | 새 꼬리 일부 가림;47은 쌍피                                                                           |
| 보너스48/49/50   | 왼쪽2/3 숫자 완전 노출                                                 | 오른쪽 피/보너스 글자는 일부 가림; 새 힌트/자산 추가 없음                                             |

12월×기존51 SVG를 전체 원본과 앞뒤 순서로 읽었다. 이는 담당자의 도상 판단과 root의 대표 직접 검토이지 모든 사람이 식별한다는 시험이 아니다. 일반 피는 광/동물/띠가 없는 원본 식물/배경 부분이 남는지 함께 보았다. 새 badge·자산·점수 힌트·획득 전체보기 확장은 제안하지 않는다.

## 4. footprint·fit 실패·resize 개정안

단일 셀 overlay는 실제 교차 관측으로 기각한다. 12월 고정 자리도 빈 월의 공간을 빌리지 못하며2장 fixture에서 타월 교차가 발생했다. 고정 자리의 총 탐색 비용 우위는 미측정이다. **안정 월 anchor + 실제 footprint 예약**을 권고한다.5×3/덱7은 선호 anchor 후보로 남기되14개 독립 카드 셀 보장을 그대로 주장하지 않는다. 가장자리/장애물 옆 실제 origin 후보는 논리 anchor와 분리해 명시한다. 카드 실제 pose가 바뀌었으면 anchor가 그대로라는 이유로0px라 기록하지 않는다.

회전0 권고 n장 bbox는 `(48+(n−1)36) × (78.171875+(n−1)24)`다.2/3/4/5장은84×102.171875,120×126.171875,156×150.171875,192×174.171875px다. 초기 단계는 전체 보수적 AABB를 예약하고 덱 실rect·타월·영역 밖 교차0을 검사한다. 이미 transform된 AABB에 angle/offset을 다시 더하지 않는다. 덱 회피 방향만 뒤집으면 이웃과 교차할 수 있다.

선형 bbox가 덱 어느 쪽에도 들어가지 않는 경우에만 **전체 앞면2열 예외**를 조건부 후보로 둔다. 원 순서/z를 유지하고 열 간격0·행 간격2px로 위로 펼치면4장96×158.34375,5장96×238.515625px다. 모든 상태를 해결하는 fallback으로 채택하지 않는다. 모드 전환 때 같은 월 살아 있는 카드의 이동도 별도 기록한다. 카드 축소/잘림/손패 침범/새 최소 지원 높이 제한은 승인하지 않았다.

### 지원 임시 표본과 별도 스트레스

UX-01 지원 임시 표본은360×780/390×734/430×822이며 기기 최소 높이 실측은 미확정이다. 아래는 **같은 실제5장 뻑 하나**에 대한 scratch 새 배치 관측이다. 제품 solver·기존 pose 유지·최적성 증명이 아니다.

| viewport         | 실측 floor    | 5장 뻑 관측                                                   |
| ---------------- | ------------- | ------------------------------------------------------------- |
| 360×780          | 336×243.78125 | 선형 bbox 덱 회피 불가;2열 전체 앞면 예외로 새 배치 교차0     |
| 390×734          | 366×241.4375  | 선형 bbox 덱 회피 불가;2열 전체 앞면 예외로 새 배치 교차0     |
| 430×822          | 406×285.78125 | 선형 bbox 덱 회피 불가;2열 전체 앞면 예외로 새 배치 교차0     |
| 360×650 스트레스 | 336×157.4375  | 예외5장 높이238.515625조차 불가. 예외4장158.34375도 높이 초과 |

650 실패를 지원 임시3표본 전체 불가능 또는 실기기 문제 없음으로 일반화하지 않는다. 작은 높이2/3장의 탐색 미발견은 이 후보 탐색 실패이며 도형 불가능 증명이 아니다. 합성12월×3장 또한 도달 보장이 없는 과밀 스트레스다. [도형/실패 그림](month-stack-evidence/footprint-and-fit-failure.png), [익명 수치](month-stack-evidence/summary.json).

### 안정성·예약과 bounded 재배치

같은 viewport에서 먼저 무관 **CardId 실제 pose**를 고정한 strict 후보를 찾는다. 가능하면 이동0이며 손패6↔7이 탐색 trigger가 되어서는 안 된다. 불가능하면 #223 비용 순서를 보존한다: 무관 CardId 이동 수→월 anchor 이동 수→Manhattan 실제 origin 이동량→월/CardId·후보 y/x의 결정적 tie. 기존 격자 거리와 실제 origin 거리의 교체는 명시적인 개정 검토 대상이다. 변경 월 국소 이동/anchor 이동/카드 이동 수와 최대px를 별도 보고한다.

증가시 기존 offset/z/angle을 우선 보존하고 새 공개 카드와 확대 footprint를 검사한다. 감소시 같은 snapshotSeq FIFO 중간 commit은 빈 offset·제거 전 footprint를 예약한다. 최종seq 교체/queue 해제에서 풀고 압축한다. round/더미 증가/reset/remount/restore는 기존 수명으로 reconcile하며 추가 generation은 반례 전 도입하지 않는다. DOM slot 재사용과 월 identity는 구분한다.

**현재 문구: resize는 탐색 없이 재투영. 제안 문구: 실제 viewport bounds 변경 때 strict 재투영이 경계/덱/타월 교차 검사를 통과하면 탐색0; 실패한 때에만 제한 재탐색을 수행한다.** 동일 viewport options/손패 변화는 resize 예외 trigger가 아니다. 한 resize transaction은 최신 bounds 하나로 coalesce하고 실제 카드 pose·예약 footprint를 모두 같은 버전으로 계산한다. 탐색 상한은 **후보 검사30,000회/transaction 제안**, 결정적 순서로 종료하며 상한 도달은 fit 미증명으로 반환한다. wallclock timeout·임의 tie·상한 종료를 불가능 증명으로 쓰지 않는다. 이 상한의 실제 성능/최적성은 미검증이다.

선택 중에는 낡은 pose의 후보 버튼을 geometry commit까지 잠그고 원 CardId/후보 목록을 유지한다. 최신 유효 전체 레이아웃을 한 번에 commit한 뒤 다시 입력 가능하게 한다. focus/제출은 한 번만, 새 dialog/focuslock을 만들지 않는다. 안전한 fit이 없으면 선택을 자동 제출하거나 낡은 충돌 배치를 성공으로 표시하지 않는다. **fit-fail의 제품 표시/진행 정책은 차단 항목**이며 새 viewport 지원 제한을 이 문서에서 정하지 않는다. 비행 중 resize의 측정/안전 정착은 #200 owner와 계약 후 연결하며 #202가 playback/skip 상태를 새로 발명하지 않는다.

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

P2P 지연/restore 때 이전 재생이 새 후보·anchor를 되살리지 않아야 한다. #202는 레이아웃 정보만 제공한다. transform AABB/angle/추가 offset 중복 계산0, 기존 moved0.5px는 착지 허용오차 사용자 승인 아님. 두 파일 소유를 겹치지 않고 공통값은 root가 중재한다.

## 7. proposed spec/ui-spec delta

아래는 문구 전후를 독립 리뷰할 **제안**이며 현 정본을 수정하지 않았다.

| 정본·현재 문구/기준                                       | 추천 개정 문구                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| spec §6.2·UX-05/06:14장까지 개별 독립 셀·앞면100%,5×3 덱7 | 같은 월은 원 순서·CardId/z를 유지한 회전0 겹침을 허용한다. 권고 offset36/−24이며 각 뒤 카드의 종류 도상이 읽혀야 한다.5×3은 선호 월 anchor 후보, 실제 footprint와 가장자리 origin으로 점유를 검사한다. 덱/타월/영역 밖 교차0. 독립14장 셀 보장은 이 모드에서 대체된다. |
| UX-06 과밀 비후보5px 접기                                 | 권고 선형 bbox가 맞지 않을 때만 원 순서 전체 앞면2열 예외를 검사한다. fit 증명된 상태만 허용하며 fit-fail 제품 정책은 개정 채택 전 결정한다. 축소/절단/무단 지원 높이 제한0.                                                                                           |
| UX-08/09/24:바닥 직접 후보 선택·중요 영역 비가림          | 공개 법적 대상이 여러 개일 때 짧은 월 제목과 전체 그림 두 후보의 기존 PromptPanel을 연다. 바닥 일부의 일시 가림은 허용, 손패·점수는 계속 보인다. 실제 CardId·최소48px 입력·고유 ARIA·기존 초점/배경 잠금·dialog 측정 제외를 보존한다.                                  |
| #201/#223·UX-25:자기 셀 경계·strict0px·resize 탐색0       | 실제 footprint 예약으로 경계를 대체한다. 같은 viewport strict 가능시 무관 CardId 이동0·손패6↔7 바닥0px를 보존한다. viewport 변경 후 strict 재투영 불가할 때만 제한30,000후보 탐색 제안; 비용/tie·예약 version·입력 잠금·fit-fail은 §4를 따른다.                        |
| spec §6.4·UX-15~17:현 사건/시간표·700ms·skip/reduced      | 실제 사건 순서와 Captured만의 획득을 유지하며 접촉은 은은한 빛, 먹을 때 더 뚜렷한 강조와 짝별 동시 이동을 허용한다. 색/시간/예산 수치·700ms 변경은 별도 계측 전 확정하지 않는다.                                                                                       |

손패48px·전체 앞면·두 행, 획득32px, 중앙 덱, NF-03 raw2,097,152 B/초기 encoded1,500,000 B와 현 성능 목표는 보존한다. 승인 후 root가 정본/plan 정합을 함께 개정한다. Draft/CI 녹색을 규범 승인으로 치환하지 않는다.

## 8. 유한 실행 계획·차단 항목

이번 묶음으로 후보 연구를 종료하고 #233 독립 설계 리뷰로 넘긴다. 제품 전 최소 남은 확인은 다음뿐이다.

1. 대표29/32/43 앞뒤 쌍의 식별 약점을 root 직접 판단하고 §4의 footprint/origin·bounded resize·fit-fail 문구를 채택한다. 전체 자산/새 후보 행렬을 추가하지 않는다.
2. 같은 viewport 증감·same-seq 제거 예약·최종 release·resize trigger에서 실제 CardId pose 안정성/교차0을 확인할 전용 시험을 설계한다. scratch fresh packing은 이를 대신하지 못한다.
3. 실제 Board 안에서 기존 PromptPanel 한 번의 lock/inert·메뉴·coarse 회전·초점 복귀/intro-outro reset을 연결한다. public-match-target 담당의 연쇄선택 공개 CardId/beforepose 계약을 받아 같은 버전으로 검증한다. fit-fail 진행 정책과 이 계약이 미결이면 해당 제품 흐름은 차단한다.

정본 채택/제품 착수 연결 후 Floor/layout→기존 popup→전용 회귀 순서다. AGENTS §5의 lint/check/test/test:browser/build/e2e:smoke/Android3 작업은 **제품 단계에서** 수행한다. PLAYWRIGHT_PORT=4258, workers≤4·timing직렬·Gradle max-workers≤4, 기준샷 자동 갱신/threshold 완화0. raw/encoded 별도 측정, Android/iPhone/핫스팟·OS 스크린리더·성능은 미검증이며 사람 결과 전 PASS0이다.

## 9. 증거·재현·검증 범위

공개 독립 리뷰는 대표 PNG4개와 [익명 summary JSON](month-stack-evidence/summary.json)으로 가능하다. PNG는 IHDR/IDAT/IEND만 있고 text/EXIF 등 metadata0, 원본 SVG51장/HTML/대량 로그는 추적하지 않는다. 도안은 수정하지 않았으며 이 파생 비교 그림은 **CC BY-SA 4.0**이다. Hwatu art by Spenĉjo and Marcus Richert, based on Hanafuda graphics by Louie Mantia, Jr.; 보너스 원본 CC0. [카드 고지](../../packages/web/public/cards/ATTRIBUTION.md)·[라이선스](../../packages/web/public/cards/LICENSE)를 보존한다.

scratch 원본은 `.visual-source/month-stack/`에 보존한다. `index.html`은 사건 storyboard/짝별 이동, `patterns.html`은 전체 도상/반전, `prompt.html`은 실제 PromptPanel import, `evidence.html`은 게시 PNG source다. 핀 Node/npm 선택과 npm ci 뒤 `node node_modules/vite/bin/vite.js '<SCRATCH_ENTRY_DIRECTORY>' --host '<LOOPBACK_HOST>' --port '<RESERVED_PREVIEW_PORT>' --strictPort`로 실행한다. `<…>`는 실행 전 치환할 자리표시자다. 실제 경로/주소는 root 비공개 인계하며 PR 단독 checkout에서 scratch 전체를 실행할 수 있다고 주장하지 않는다.

| 공개 실제 사건 fixture | seed·action(0기준) | 사실                                                                       |
| ---------------------- | ------------------ | -------------------------------------------------------------------------- |
| 서로 다른 월 두 짝     | 1·1                | Played→Flipped→Matched play/flip→Captured,45/44와31/30 각짝 유지 동시 출발 |
| 뻑3                    | 2·2                | Played→Flipped→Ppeok,33/34/32 잔류·Captured0                               |
| 폭탄4                  | 9·8                | Bomb→Captured→PiStolen→Flipped→Placed,16/19/18/17 실제 덱 전 획득          |
| 보너스 뻑5             | 1827·9             | Played→Flipped→Flipped→Ppeok,13/15/12/48/50 잔류·Captured0                 |

실제 floor 실측(Chromium/WebKit 같음)은360×780→336×243.78125,390×734→366×241.4375,430×822→406×285.78125,390×844→366×307.78125,430×932→406×395.78125,650스트레스→336×157.4375다. actual direct target32/33의 button/art48×78.171875·decision-area0px였다.241.4375를 모든 viewport 상수로 쓰지 않는다.

초기208px 가정720조건은 예비 모형으로만 보존했다. 교정된132조건은 single-cell overlay/12월 고정 자리 기각 근거다. 후속은15개 fresh footprint 표적(10fit/5미발견)과 지원430×822의 동일5장뻑 **한 표적만** 추가했다. 미발견과 불가능을 구분하고 무관0px/성능 최적성을 주장하지 않는다. 선택창은 원본 컴포넌트8조건+reset4경계로 좁혔다. CSS200% 글자 모형은 실제 Safari zoom 아님. 빛의 후속 mock 수정은 시각 방향 시연이며 실제 Playback/reduced/취소 시험이 아니다.

AGENTS/RTK·정본/ui-spec/규칙§12·관련 이슈/#223 계약 읽기와 Node24.21.0/npm11.19.0 npm ci를 수행했다. Context7 callable이 없어 [Playwright Page](https://playwright.dev/docs/api/class-page), [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement), [Svelte snippet](https://svelte.dev/docs/svelte/snippet)·[imperative API](https://svelte.dev/docs/svelte/imperative-component-api), [Vite config](https://vite.dev/config/)·[plugin config](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/config.md)를 공식 원문으로 확인했다. 새 dependency0·외부 mock 요청0. 커밋 전 lint:fix/개인정보/whitespace 검사를 수행하며 제품 full suite는 이번 문서 단계에 반복하지 않는다.
