# #200 실제 착지 제품 checkpoint

2026-10-02 · FR-14~17·UX-15~17·NF-03/08/09·AC-06/07 · Refs #200, #202, #236

기준 main `e8ab9ffdd3f185934a12b1c62b61ed17fb70e5f7`, 계획 최종 SHA `b1fb35879c4fc170fb0445b5d0ddfb79fc090902`.
첫 구현·실패를 함께 게시한다. 전체 요구사항 완료, 사용자 시각 수용, 0.5초 고정 시간, 실기기·전체 성능 통과를 뜻하지 않는다. #235의 실제 42px 통합은 미실행이다.

## 제품 계약

Playback 인스턴스가 원본 CardId의 commit 전 실제 DOM pose와 일시 clone을 보관한다. native dialog는 제외하고 clone은 canonical CardId·입력·ARIA에서 제외한다. getBoundingClientRect의 회전 AABB는 center/충돌에 쓰고 CSS 크기와 부모 회전은 clone 표현에 한 번만 적용한다. target의 before pose를 월 anchor나 최종 top으로 덮지 않는다. 기존 Playback generation/reset/detach/dispose가 수명을 취소한다. engine/protocol/wire/store/session producer, Floor/Board/Game/Hand/자산/기준샷 변경은 없다.

접촉은 실제 target에서 유한 방향·감소 후보를 만든 뒤 다른 월 원본/예약 카드, 더미·손패·HUD와 table 경계의 paint 영역을 검사한다. 실제 DOM 폭을 사용한다. 카드 AABB에 회전을 다시 적용하지 않고 outline 투영만 확장한다. 강조 빛은 내부 inset shadow로 그린다. staging 부모에서만 적용되는 shadow를 clone 새 부모의 paint에 더하지 않는다. 안전 후보가 없으면 incoming clone을 해제하고 기존 공개 표현에 제한한다. target 이동·보호 여백 완화·침범 offset 강제는 하지 않는다. 이 제한은 현재 WebKit 정상 접촉 UX 실패를 해결했다는 뜻이 아니다.

수락 target metadata로 손패 접촉을 먼저 보이고 실제 엔진 이벤트 순서는 보존한다. 연속 Matched는 표시 관계를 누적한다. actual Captured/PiStolen의 onEvent 이전에 획득을 만들지 않는다. strong 강조 동안 기존 counter를 유지하고 이후 실제 획득 snapshot commit에서 갱신한다. 서로 다른 월 두 짝은 중앙으로 합치지 않고 각짝의 상대 위치를 유지하며 함께 출발한다. 목적 종류가 다르면 출발 뒤 갈라진다. 뻑/Placed는 실제 최종 DOM pose로 수렴한다.

## 실제 연속 관측

fixture는 `newRound`의 seeded 분배에서 합법 `sessionAct` history를 거친 SoloSession 저장이다. 최초 세션 선 결정부터의 도달 증명과 구별한다. 실제 앱의 이어하기 → 손패 입력 → controller → Playback 경로다. 테스트 frame sampler만 DOM pose·빛·counter를 읽는다. 권위 상태/이벤트를 조작하지 않는다.

정상: seed1/dealer1, 이전 합법 seat1 play1 뒤 seat0 play10. 이벤트는 seq7 CardPlayed10 → 8 CardFlipped30 → 9 Matched[10,8] → 10 Matched[30,31] → 11 Captured[8,10,31,30] → 12 ScoreChanged. 합성 play-match-flip 순서가 아니다.

Chromium source run 관측(단위 px/ms, 시연 후보의 관측값):

| 단계 | 입력 이후 t | CardId / 실제 x,y | counter |
|---|---:|---|---|
| 손패 접촉·약한 빛 | 282.5 | target8 (184.3215,225.8215), incoming10 (179.0611,205.4019) | 0 |
| 덱 접촉·약한 빛 | 698.7 | target31 (241,225.2344), incoming30 (259.24,211.8670) | 0 |
| 실제 Captured 강조 | 1264.9 | 두 target before pose와 두 접촉 pose 유지 | 0 |
| 각짝 동시 출발 시작 | 1367.2 | 짝별 상대 위치 유지, 중앙 합체 없음 | 광1·피3 |

기존 실패는 incoming10의 오른쪽252.15가 다른 월31의 왼쪽241을 **11.15px** 침범했다. 이는 착지 offset 검사 누락이라는 anim 소유 결함이었다. 영상/연속 좌표와 첫 unit failure(6FAIL/2PASS)를 보존했고 수정 후 접촉·hold·strong 강조의 incoming paint 타월 침범 검사를 통과했다. 비행 중 상공 통과에는 정적 disjoint를 강제하지 않는다. clone 새 부모에 존재하지 않는 staging shadow를 검사에 더하던 별도 anim 결함도 고쳤다.

뻑: seed1827/dealer0 합법 history 뒤 play15, seq45 Played15 → 46 Flip48 → 47 Flip50 → 48 Flip12 → 49 Ppeok[13,15,12,48,50]. strong 획득 강조0, 기존 counter10 불변, 최종 5장 바닥 잔류를 C/W에서 확인했다. 회수·회수 중 새 bonus는 아직 표적 미실행이다. 저장 배열과 #235 visual top 배열의 차이를 이 결과만으로 검증했다고 주장하지 않는다.

## WebKit 잔여 최소 반례

같은 seed/action의 실제 48px scene, viewport393×659. 접촉 전에 target31=(232.5,172.765625,48,78.171875), 다른 월 card4=(232.5,228.234375,48,78.171875)다. 본래 원본 두 카드의 AABB부터 y 방향 **22.703125px** 교차한다. incoming이 새로 만든 교차와 구별한다. table=(12,184.109375,369,166.4375)이므로 원 target의 top이 table top보다11.34375px 위다. 더미=(172.5,228.16145,48,78.17186), hand top478.65625, mine HUD top356.546875를 동일 before 관측에서 확보했다.

유한 후보는 이 before target을 이동하지 않고 검사한다. 위 방향은 table 상단, 아래 방향은 card4 paint, 왼쪽 방향은 월8/예약 손패 및 더미, 오른쪽 대각은 상단 또는 card4 때문에 거절된다. 축 방향·감소 후보도 이 조건에서 접촉을 만들지 못했다. 장애물별 정확 paint와 후보별 기각 기록은 후속 최소 자료로 보강한다. 현재 실제 W 정상은 약한 접촉 부재로 FAIL을 유지한다. 안전 후보 부재를 사용자 UX 수용으로 처리하지 않는다.

## 세 안의 비교 범위

| 안 | 이 반례에서 확인/가정 | 남은 비교 |
|---|---|---|
| 바닥·더미 48→42 | 단위 테스트는 두 실제 DOM 폭에서 같은 알고리즘을 검사했다. 폭 감소12.5%는 계산이며 실제 월 배치·clearance 해소 증거가 아니다. #235 opt-in42가 진행 중이고 기본 활성화는 아직 아니다. | 같은 seed의 실제 before/접촉/강조에서 인접월·더미 paint와 두 그림 식별 |
| 월·행 여백 조정 | W 원본 row 교차가 있으므로 incoming 방향만으로 원본 배치 문제를 해소할 수 없다. #235 소유이며 이 branch는 수정하지 않는다. | 공유 checkpoint의 실제 footprint/경계·paint와 동일 장면 비교 |
| 유한 방향·offset 감소 | C48에서 own11.15px 침범 수정, W48은 실패 유지. 작은 offset은 두 그림 식별을 약하게 할 수 있다. | 실제42 연결 뒤 target before 보존 및 이미지 식별의 사용자 검토 |

새 대형 행렬·임의 baseline 갱신은 하지 않는다. root가 연결할 실제42 공유 checkpoint에 동일 알고리즘과 같은 반례를 적용한다.

## 실행 범위와 미완

- web check: 0오류·0경고. 폰트 gate 기존703문자 누락0, 자산 변경0.
- 기존 choreo/flip/display/recovery/skip/public target 소비 표적: 160PASS(C/W), 후속 choreo/recovery/skip/landing 표적72PASS, 추가 landing shadow 포함10PASS. 변경 단계마다 실행한 범위를 구별하며 최종 head 전체 검증으로 쓰지 않는다.
- 실제 landing E2E(port4262, workers2): Chromium 정상·뻑 및 WebKit 뻑 **3PASS**, WebKit 정상 **1FAIL**. 후속 W 최소 관측 workers1: 뻑1PASS/정상1FAIL. 영상과 C/W frames.json을 root에게 우선 공유·보존했다. root는 자료 존재를 확인했고 영상 직접 재생 검토는 아직이다.
- lint:fix 완료, 필수 전체 lint/check/Node/browser/build/smoke/Android는 최종 의미 있는 제품 head에서 한 회로 모을 예정. E2E 준비 build gate는 통과했지만 전체 suite/CI 통과로 대체하지 않는다.
- 미완: 실제42 동일 장면, W 안전 후보 부재, 선택 두 연쇄/즉시 resolve·따닥, 뻑 회수/별도 bonus, summary 최근4 밖, resize/reduced/skip/reset/dispose/홈 이탈의 ghost 수명 직접 회귀, 최종 필수 suite/동일 head CI/독립 리뷰. 기기·0.5초 시각 인지·전체 성능/NF/AC·병합·출하는 미완이다.
