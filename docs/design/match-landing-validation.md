# #200 실제 착지 제품 checkpoint

2026-10-02 · FR-14~17·UX-15~17·NF-03/08/09·AC-06/07 · Refs #200, #202, #236

최신 실제 main 통합 검사는 마지막 절에 기록한다. 아래 48px 실패·각 수정 단계·미커밋 합성은 당시의 실행 근거로 보존하며 새 head 결과로 전용하지 않는다.

기준 main `e8ab9ffdd3f185934a12b1c62b61ed17fb70e5f7`, 계획 최종 SHA `b1fb35879c4fc170fb0445b5d0ddfb79fc090902`.
첫 구현·실패와 후속 수정을 함께 게시한다. 전체 요구사항 완료, 사용자 시각 수용, 0.5초 고정 시간, 실기기·전체 성능 통과를 뜻하지 않는다. 아래 첫 42px 합성은 원본 소실로 실패했고, 후속 고정 staging 합성은 같은 정상 장면의 원본·접촉·출발을 보존했다. 누적 수정의 효과를 크기만의 효과로 해석하거나 전체 기본 Game 통합·출하 판정을 하지 않는다.

## 제품 계약

Playback 인스턴스가 원본 CardId의 commit 전 실제 DOM pose와 일시 clone을 보관한다. native dialog는 제외하고 clone은 canonical CardId·입력·ARIA에서 제외한다. getBoundingClientRect의 회전 AABB는 center/충돌에 쓰고 CSS 크기와 부모 회전은 clone 표현에 한 번만 적용한다. target의 before pose를 월 anchor나 최종 top으로 덮지 않는다. 기존 Playback generation/reset/detach/dispose가 수명을 취소한다. engine/protocol/wire/store/session producer, Floor/Board/Game/Hand/자산/기준샷 변경은 없다.

접촉은 실제 target에서 유한 방향·감소 후보를 만든 뒤 다른 월 원본/예약 카드, 더미·손패·HUD와 table 경계의 paint 영역을 검사한다. 실제 DOM 폭을 사용한다. 카드 AABB에 회전을 다시 적용하지 않고 outline 투영만 확장한다. 강조 빛은 내부 inset shadow로 그린다. staging 부모에서만 적용되는 shadow를 clone 새 부모의 paint에 더하지 않는다. 안전 후보가 없으면 incoming clone을 해제하고 기존 공개 표현에 제한한다. target 이동·보호 여백 완화·침범 offset 강제는 하지 않는다. 이 제한은 현재 WebKit 정상 접촉 UX 실패를 해결했다는 뜻이 아니다.

수락 target metadata로 손패 접촉을 먼저 보이고 실제 엔진 이벤트 순서는 보존한다. 연속 Matched는 표시 관계를 누적한다. actual Captured/PiStolen의 onEvent 이전에 획득을 만들지 않는다. strong 강조 동안 기존 counter를 유지하고 이후 실제 획득 snapshot commit에서 갱신한다. 서로 다른 월 두 짝은 중앙으로 합치지 않고 각짝의 상대 위치를 유지하며 함께 출발한다. 목적 종류가 다르면 출발 뒤 갈라진다. 뻑/Placed는 실제 최종 DOM pose로 수렴한다.

## 실제 연속 관측

fixture는 `newRound`의 seeded 분배에서 합법 `sessionAct` history를 거친 SoloSession 저장이다. 최초 세션 선 결정부터의 도달 증명과 구별한다. 실제 앱의 이어하기 → 손패 입력 → controller → Playback 경로다. 테스트 frame sampler만 DOM pose·빛·counter를 읽는다. 권위 상태/이벤트를 조작하지 않는다.

정상: seed1/dealer1, 이전 합법 seat1 play1 뒤 seat0 play10. 이벤트는 seq7 CardPlayed10 → 8 CardFlipped30 → 9 Matched[10,8] → 10 Matched[30,31] → 11 Captured[8,10,31,30] → 12 ScoreChanged. 합성 play-match-flip 순서가 아니다.

Chromium(Pixel7, 실제 CSS viewport412×839) source run 관측(단위 px/ms, 시연 후보의 관측값). WebKit(iPhone15,393×659)과 기하 조건이 다르므로 동일 viewport 비교가 아니다:

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

유한 후보는 이 before target을 이동하지 않고 검사한다. 위 방향은 table 상단, 아래 방향은 card4 paint, 왼쪽 방향은 월8/예약 손패 및 더미, 오른쪽 대각은 상단 또는 card4 때문에 거절된다. 축 방향·감소 후보도 이 조건에서 접촉을 만들지 못했다. 장애물별 정확 paint와 후보별 기각 기록은 후속 최소 자료로 보강한다. 현재 실제 W 정상은 약한 접촉 부재로 FAIL을 유지한다. 원head strong frame에서는 incoming30과 다른 월8의 pose가 완전히 같았고, 실제 획득 강조가 타월 관계로 읽힐 수 있는 미해결 영향도 있다. 후보 부재/부분 예약이 이후 강조·획득 출발을 오염하는지는 별도 후속 대조 대상이다. 약한 빛 부재만의 실패로 축소하지 않는다. 안전 후보 부재를 사용자 UX 수용으로 처리하지 않는다.

## 세 안의 비교 범위

| 안 | 이 반례에서 확인/가정 | 남은 비교 |
|---|---|---|
| 바닥·더미 48→42 | 단위 테스트는 두 실제 DOM 폭에서 같은 알고리즘을 검사했다. 폭 감소12.5%는 계산이며 실제 월 배치·clearance 해소 증거가 아니다. 최초 비교는 opt-in42, 아래 후속은 기본42 Game의 누적 수정 합성이다. | 같은 seed의 실제 before/접촉/강조에서 인접월·더미 paint와 두 그림 식별 |
| 월·행 여백 조정 | W 원본 row 교차가 있으므로 incoming 방향만으로 원본 배치 문제를 해소할 수 없다. #235 소유이며 이 branch는 수정하지 않는다. | 공유 checkpoint의 실제 footprint/경계·paint와 동일 장면 비교 |
| 유한 방향·offset 감소 | C48에서 own11.15px 침범 수정, W48은 실패 유지. 작은 offset은 두 그림 식별을 약하게 할 수 있다. | 실제42 연결 뒤 target before 보존 및 이미지 식별의 사용자 검토 |

새 대형 행렬·임의 baseline 갱신은 하지 않는다. root가 연결할 실제42 공유 checkpoint에 동일 알고리즘과 같은 반례를 적용한다.

## 실행 범위와 미완

- web check: 0오류·0경고. 폰트 gate 기존703문자 누락0, 자산 변경0.
- 기존 choreo/flip/display/recovery/skip/public target 소비 표적: 160PASS(C/W), 후속 choreo/recovery/skip/landing 표적72PASS, 추가 landing shadow 포함10PASS. 변경 단계마다 실행한 범위를 구별하며 최종 head 전체 검증으로 쓰지 않는다.
- 실제 landing E2E(port4262, workers2): Chromium 정상·뻑 및 WebKit 뻑 **3PASS**, WebKit 정상 **1FAIL**. 후속 W 최소 관측 workers1: 뻑1PASS/정상1FAIL. 영상과 C/W frames.json을 root에게 우선 공유·보존했다. root는 자료 존재를 확인했고 영상 직접 재생 검토는 아직이다.
- lint:fix 완료, 필수 전체 lint/check/Node/browser/build/smoke/Android는 최종 의미 있는 제품 head에서 한 회로 모을 예정. E2E 준비 build gate는 통과했지만 전체 suite/CI 통과로 대체하지 않는다.
- 미완: 실제42 동일 장면, W 안전 후보 부재, 선택 두 연쇄/즉시 resolve·따닥, 뻑 회수/별도 bonus, summary 최근4 밖, resize/reduced/skip/reset/dispose/홈 이탈의 ghost 수명 직접 회귀, 최종 필수 suite/동일 head CI/독립 리뷰. 기기·0.5초 시각 인지·전체 성능/NF/AC·병합·출하는 미완이다.

## 독립 P1: 복원 직후 부분 예약/원본 숨김 (후속 수정)

[원212cf5af 독립 COMMENT](https://github.com/kywoo26/p2p-gostop/pull/237#pullrequestreview-5387221822)의 P1은 위 W 공간 제약/strong 타월 pose와 별도다. 합법 tuple `[3839809690,1129524092,3832060461,2933933213]`, dealer0 → play7 → choose6 → flip29의 후보[28,30] 대기를 실제 SoloSession 저장으로 이어했다. 첫 attach의 빈 pump finally가 Floor 초기 commit 전에 정적 관계를 예약했다. 이후 canonical6는 정상 위치로 바뀌었지만 예약 pose가 그대로여서 원본hidden/ghostx=-12/incoming7없음이 지속됐다. 리뷰어의 초기 비계측 화면·reserve 호출 stack·후속 explicit tick3회 유지·홈 이탈 정리0 자료를 root와 공유·보존했다. 8rAF는 관측 대기이며 DOM 안정화의 증명이 아니다.

수정은 복원/빈 pump의 정적 관계 수렴을 기존 Svelte commit 이후로 옮긴다. root/기존 Playback generation/current/busy로 취소를 검사한다. 임의 sleep/rAF retry·새 generation·Floor/Board 편집은 없다. 안전 후보 또는 incoming DOM이 없어 새 관계를 만들지 못하면 새 target 예약도 해제해 원본 visibility를 복원한다. 이미 예약한 유효 active before pose를 매번 canonical 재측정으로 덮지 않는다.

직접 회귀 `landing-recovery.spec.ts`는 실제 이어하기 → 원본/ghost/후보 관측 → 실제 메뉴·홈 → 다시 이어하기 → choose28 확정 → 모션 마감이다. 수정 전 C412×839/W393×659 모두 target만 남아2FAIL. 수정 후 C는 canonical6와 ghost6가 모두 `(179.33197,225.65543,53.33606,81.32977)`, incoming7 존재/과거 빛 재생0이다. W는 canonical6 `(172.5,172.765625,48,78.171875)` 원본visible, target/incoming ghost없음으로 안전 제한한다. 기존 공간 제약으로 offset 관계를 만들었다는 뜻이 아니다. 홈 → 복원 → 실제 선택 확정/scene 정리까지 C/W2PASS. 첫 후속 실행에서 복원 검사는 통과했으나 홈 버튼의 테스트 selector가 달라 timeout2였고 selector를 실제 `game-menu`로 고쳤다. 제품 기준이나 좌표 기대값을 완화하지 않았다.

landing 원본 복원/실패 예약 unit와 기존 reset/skip 표적 browser62PASS, web check0오류0경고다. 이 P1 수용만으로 W strong 동일 pose·42 통합·다른 특수 경로·전체 suite 완료를 주장하지 않는다. 원head CI36947040919 실패와 단계별 browser 통과를 구별한다. 수정 full SHA/새 CI 및 독립 delta 재검토는 PR/root 인계에서 기록한다.


## 42px 고정 합성 비교: 원본 존재 검증 실패

root가 제공한 불변 합성은 #235 `3fc4d18263636f02f3db13d7b5f35c6e07aa6338` + #237 P1 `84030f7406d9db9957a5836db05a49a5d3f2f2c6`, tree `d744ad263840219253bd3518e761661b63b5dd13`, source.tar SHA-256 `58f1b5ce27c8b276f9b6a27454bc7241d7b4dc4933961f17aa73ceb11d408e39`다. 원본 1,174개 파일 hash를 대조하고 수정하지 않았다. 별도 scratch의 actual Game flag harness만 true42/false48을 전달했고 harness diff/hash·관측 자료를 분리 보존했다. .git 없는 합성 dev 실행이며 commit/CI/릴리스 증거가 아니다.

같은 seed1/dealer1/play10, C/W 모두 실제 393×659에서 비교했다. 두 엔진 48px는 안전 접촉 후보가 없고 strong에서 card30=다른 월8 pose가 일치했다. 이전 C 정상 성공은 412×839여서 엔진만 다른 비교로 쓰지 않는다. true42에서는 손패·덱 접촉 후보가 생겼지만, 이후 원본 바닥 DOM이 모두 사라졌다. 다른 월 교차0은 공집합 결과여서 실패를 성공으로 해석하지 않는다. flag는 크기·배치·여백을 함께 바꾸며 크기 축소만의 인과 효과를 주장하지 않는다.

최초 fit=false 같은 frame은 C407.9ms/W418ms, 표시 snapshotSeq7이다. SoloSession 권위 최종 floor IDs는 `[1,4,20,27,35,45]`, Playback 중간 표시 floor IDs는 `[1,4,8,10,20,27,31,35,45]`, 실제 원본 floor CardId DOM은 `[]`, ghost는 `[8,10,30,31]`이었다. 이미 수락된 권위 최종 상태와 재생 중간 상태를 혼동하지 않는다. table bounds는 양수 `369×168.5`, typed failure는 후보 미발견/위 9개 미배치 ID다. staging paint 장애물은 local x197.5/y32.4547(C),32.4833(W), `74×100.3906`이다. root와 #235 담당에게 same-frame 권위/표시 IDs·원본/ghost·typed failure·모델 장애물과 원본 PNG/frames/video를 인계했다.

이 고정 합성의 native staging 큰 shadow/고정 transform 장애물과 #235 067 단독에서 관측한 움직이는 native WAAPI AABB를 같은 원인으로 단정하지 않는다. staging 고정 표시 영역·solver 초기 예약은 Floor 소유이며 움직이는 ghost paint 검사는 anim 소유다. 새 API/registry 없이 기존 원 CardId 실제 DOM 측정·target beforepose·active held 수명을 유지한다. 최종 Floor 수정 후 비교는 새 불변 합성에서 별도로 진행한다.

## strong 타월 pose 오염: 출발 제한 후 실제 획득 영역 강조

원212/840의 안전 접촉 실패는 incoming clone을 해제했지만, Captured 단계가 canonical 원본에서 다시 clone을 만들어 같은 잘못된 위치를 강하게 강조하고 출발시켰다. 같은 393×659의 실제 이어하기/controller/Playback 표적은 수정 전 C/W2FAIL: strong8/30 교차를 직접 단언하고 영상·연속 frame을 보존했다. 이는 원본 row 교차와 별개로 anim이 잘못된 관계를 재생성한 결함이다.

획득 출발 직전에 원본/유효 예약 floor ID의 존재와 다른 월·staging·덱/HUD/손패의 실제 paint를 확인한다. 출발 카드 하나가 안전하지 않으면 해당 월 묶음 전체의 출발 예약을 같은 frame에서 해제하고 원본 visibility를 복원한다. 유효 held beforepose를 새 settled 좌표로 덮지 않는다. 제한 카드에 과거 source를 재생성하지 않고, actual Captured commit 이후 실제 획득 영역에 있는 원본 CardId만 clone/강조한다. 최근4 밖 등 해당 원본이 없으면 강조를 만들지 않고 권위 뷰로 마감한다. event/onEvent·권위 배열·카운터를 수정하지 않는다. 안전한 두 짝은 이전대로 pre-capture strong 동안 counter0, 각짝의 상대 위치를 유지하며 동시에 출발한다. 제한 경로는 해당 출발 시연이 생략되는 안전 제한이며 접촉/획득 UX 전체 성공이 아니다.

최종 좁은 회귀의 C/W393×659 strong 관측은 C1134.7ms/W1135ms, 실제 counter 광1·피3, card8 `(12,420.546875)`, card10 `(297.75,420.546875)`, card31 `(303.75,420.546875)`, card30 `(309.75,420.546875)`, 모두 실제 획득 원본과 같은 32×52.109375 rect다. 제한 경로의 첫 strong 이전 원본 floor 존재도 검사한다. 정상 C412×839는 pre-capture strong1266.2ms/counter0와 짝별 동시 출발을 유지했다. 시각 수용·고정 시간·전체 성능 판정으로 승격하지 않는다.

검증은 browser84PASS(landing/choreo/Playback recovery/skip, C/W), web check0오류0경고, 실제 E2E7PASS/기존 W 접촉1FAIL(정상 두 짝·보너스 뻑·복원/홈/선택 마감·393×659 출발 제한)이다. dev port4262/workers2이며 새 build/full suite/baseline 실행0. 기존 접촉 시험의 기대를 완화하지 않고 원본 존재 전제만 추가했다. 원본 floor 소실은 교차0으로 통과하지 않는다.

P1 exact840의 [독립 delta COMMENT](https://github.com/kywoo26/p2p-gostop/pull/237#pullrequestreview-5387295996)는 최소 P1 해소·신규 차단0을 확인했고 PR 전체 수용은 아니다. [CI36948583842](https://github.com/kywoo26/p2p-gostop/actions/runs/36948583842)는 완료: core/Android 및 Chromium 성공, WebKit 기존 정상 접촉 실패다. 위 strong 후속의 새 SHA/CI·독립 검토는 별도로 인계한다. 다음 단계는 승인된 no-target/bonus flip·hand bonus→stage 모션을 ghost로 처리하는 최소 후속이며 별도 commit이다. 실제42 새 합성 비교·나머지 특수 경로·최종 전체 검사·기기 수용·병합/출하는 미완이다.


## strong 독립 검토·주석 폰트 gate 복구

strong 제품 `fb5004ee0fe011eefa3ea407400e4ba335c8390f`의 [CI36951573461](https://github.com/kywoo26/p2p-gostop/actions/runs/36951573461)는 3 jobs 실패였다. 두 새 한국어 주석의 글자가 폰트 검사 대상 TS 코퍼스에 포함돼 build에서 누락 글자 `덱물`로 차단됐다. core Android는 미실행, 두 browser component는 성공했지만 E2E는 같은 build/webServer 차단으로 미시작이다. 기존 W 접촉 제품 실패와 구별한다.

`7fa37a9a41de4013715d2de223af3e08a213b167`는 해당 두 주석만 기존 코퍼스 표현으로 바꿨다. 실행문·다른 제품 blob·UI·폰트 자산·코퍼스 수집·gate·임계값 변경0이다. 직접 폰트703문자/hash 검사는 통과했다. [동일 head CI36952139277](https://github.com/kywoo26/p2p-gostop/actions/runs/36952139277)는 최종 core/Android 및 Chromium component/E2E/timing 성공, WebKit component 성공·기존 접촉 E2E 실패·timing 미실행이다. 전체는 실패이며 재실행으로 덮지 않았다.

[exact7fa 독립 COMMENT](https://github.com/kywoo26/p2p-gostop/pull/237#pullrequestreview-5387512460)는 strong 타월 pose 최소 반례 해소·정상 두짝 출발 보존·P1 복원 회귀를 확인했다. 독립 browser20PASS, 실제 E2E5PASS/기존 W 접촉1FAIL, API 경계 C/W2PASS다. 안전 제한 카드의 실제 획득 영역 강조만 확인한 것으로 접촉 UX·PR 전체 병합 수용이 아니다. 아래 새 staging 제품은 이 검토에 포함되지 않는다.

## 고정 staging 후속 합성: 같은 정상 장면의 원본·관계·출발

root의 불변 합성은 #235 `ddf6c36109467cc5cab0886dc396d5aeab92b4cb` + #237 `7fa37a9a41de4013715d2de223af3e08a213b167`, tree `90abd3c2ea29ef422720c4a7f7109b327e3ffd2b`, source.tar SHA-256 `14b3726a7f493634fd37bba68e77df4c53a64c0fab4519c31bd68deb9623cdc2`다. manifest1,181개 원본 파일 hash 재검증 변경0이다. 별도 복제에 actual Game/controller와 sampler의 네 harness 파일만 추가했다. Game의 옛 optional flag API를 복원하거나 제품 Game/Floor/Board를 고치지 않았다. 기본 Game42/포트4262/seed1/dealer1/play10/normal/C와W 모두393×659다. .git 없는 dev 실험이며 shipping CI·최종 통합 증거가 아니다. 아래 staging ghost 후속은 미포함이다.

양 엔진 table은 `(12,183.078125,369,168.5)`다. C112/W101 RAF 모두 Playback 표시 floor IDs와 원본 floor CardId DOM 일치, 중복·양수 rect 실패0, 숨긴 원본의 ghost 부재0이었다. 접촉·strong 중 incoming10/30의 타월 paint 침범0, typed 배치 실패0이다. 원본 존재를 검사한 뒤 교차를 판정해 공집합 교차0을 성공으로 처리하지 않는다. 권위 최종 floor6IDs와 Playback 중간9→10IDs는 frame에서 분리 기록했다.

| 관측 | C | W |
|---|---:|---:|
| 손패 접촉·약한 빛(ms) | 288.1 | 301 |
| 덱 접촉·약한 빛(ms) | 704.3 | 718 |
| strong / counter0(ms) | 1270.7 | 1280 |
| 두 짝 첫 실제 이동, 동일 RAF(ms) | 1387.4 | 1463 |

before target8 `(79.1875,280.171875,42,68.390625)`, target31 `(271.796875,186.078125,42,68.390625)`에서 incoming10 `(95.1475,268.47708)`, incoming30 `(287.75687,197.77292)`로 접촉했다. target의 before→strong held 오차는 C최대0.0000153px/W0으로, 성장한 월 묶음의 다른 settled 좌표를 덮어쓰지 않았다. Captured commit 뒤 counter광1·피3가 됐고 두 월 짝은 같은 관측 frame에서 각각 출발했다. 초기 공통 이동 구간의 짝 상대 좌표 오차는 C최대0.00000763px/W0이다. 중앙 합체가 아니다.

canonical stage30과 고정 reserve는 C `(175.5,233.1328,42,68.3906)`, W y233.16145로 같은 위치다. stage native rect와 덱 counter의 교차0을 기록했고 flip 앞면/뒤면 변화도 원본과 ghost를 나눠 기록했다. C strong/W flip PNG를 직접 확인해 두 짝 그림·덱 잔량의 분리를 관측했다. 전체 영상 재생·사용자 인지 수용·고정0.5초·전체 성능 판정은 아니다. 원본 PNG/영상/frames·후보 기각·출발 대조·harness diff/hash는 root와 #235에 전달했다.

이 결과는 원래 3fc+840 소실 실패와 구별한다. 크기·배치·rotation·staging 예약/paint 수정이 누적됐으므로 48→42 단독 인과 효과가 아니다. #235 mixed16/18 원본 소실 실패, 최종 source 통합·전체 suite·shipping CI·기기 수용은 남아 있다.

## 새 no-target/bonus staging: canonical 원본과 ghost의 수명 분리

기존 no-target 공개 flip과 손패 bonus는 canonical staging Card DOM에 native FLIP을 걸었다. 이제 새 staging ID의 실제 DOM이 commit된 뒤 clone을 성립시키고, 이동/뒤집기는 ghost에만 적용한다. 손패 bonus는 삭제 전 손패 beforepose를 확보하고 새 덱 공개는 실제 deck anchor에서 시작한다. clone 새 부모의 shadow를 다시 측정하며 원본 CardId/앞뒷면·권위 배열·active held beforepose를 보존한다. known-target flip 경로는 유지한다. 새 staging ghost가 있다는 사실과 정확 target 접촉이 성립했다는 사실을 구분해, 이후 실제 Matched에서는 접촉하지 않은 staging ghost도 선택 target으로 착지한다. 새 공통 API/registry/wire/Floor/Board/Game 편집0이다.

합법 실제 이어하기에서 수정 전 손패49·뻑 bonus48/50·두 선택 연쇄 stage29 C/W6FAIL을 보존했다. 수정 후 손패49 실제 획득/보충38, 뻑48/50 원본 고정·가짜획득0, play7→choose6→choose28 실제 수락/획득4, 두 선택 연쇄의 홈 이탈→복원 현재 stage29(옛 flip 재연0)→choose28 마감, skip/reduced를 포함한 실제 앱 E2E12PASS다. 각 stage ID가 존재하는 frame의 양수 원본1개/ghost1개/원본 outer WAAPI0·위치 변동0.05px 미만을 검사한다. 손패49 skip 전 counter0, 실제 Captured 뒤1장 반영·보충38·숨김/모션 정리0을 확인한다. reduced는 ghost를 만들지 않고 실제 최종 상태로 수렴한다.

첫 home 종료 검사는 Home commit 전에 detached root를 읽어 실패했고, 실제 Home 표시/scene 제거를 기다리는 완료 경계로 고쳤다. skip의 첫 0-animation 기대는 기존 손패17/18/19의 무한 CSS 폭탄 힌트3개를 포함했다. 직접 effect/type/target을 기록해 구별했고, 손패의 무한 CSS 효과만 제외해 모든 다른 남은 모션0을 검사했다. 기존 제품 기준/좌표 기대/기준샷은 완화하지 않았다. 관련 기존 browser84PASS/check0오류0경고는 staging 후속 수정 시점의 표적이며 이전7fa 검증으로 전용하지 않는다. 추가 실제 Game/SoloSession의 bonus ghost 재생 중 수락 snapshot reset C/W2PASS는 원본 가림 복원·ghost/light/원본 모션0·최종 표시/권위 일치를 확인했다. 새 check0오류0경고·web lint:fix·폰트703문자/hash·privacy findings0을 확인했다. 후속 코드의 실제 landing/recovery/capture/staging 전체 유한 표적은19PASS/기존 W 접촉1FAIL이며, 이 실패의 기대값을 그대로 유지했다. 별도 게시 exactSHA/CI는 인계에서 기록한다. 실제 뻑 회수 중 새 bonus·따닥/즉시 resolve·나머지 경계·최종 필수 suite와 새 독립 검토는 아직 남는다.

## 실제 main 통합: 최종 제품 검사·독립 COMMENT·CI 시도 구분

실제 검사 head는 `eebe4c1e95e93d3efcabee5c34b85c573f809db0`, tree `f721fecdf359d719b49f4948639d3706818d7812`다. clean staging 제품 `1c52a96910086209abcb0458854643974f715039`에 root가 병합한 main `f9e8f7522f9b9e626709e290dbc5a458ceb58a19`를 정상 merge/FF push했다. 충돌0·rebase/force/stash0이며 두 plan 기록을 보존했다. main 대비 Floor/layout/Board/Game/skin/자산/승인42PNG·engine/protocol/wire/store/일반 producer 차이0, own 제품·시험 blob은1c와 같다. 기본 Game42·fixed staging 예약·부모 간격·합법18·폭탄 cue·audit가 실제 제품에 포함된다. 기존192+1c의642 RAF와 이번 실행은 별개다.

현재 head의 호스트 필수 검사 결과:

| 단계 | 실제 결과·범위 |
|---|---|
| 핀·설치 | Node24.21.0/npm11.19.0, `npm ci` 완료 |
| lint/check | 통과, privacy16·findings0, Svelte0오류/0경고; knip의 기존 설정 안내1건과 실패를 구분 |
| Node | `npm test -- --maxWorkers=4`, 37파일/587PASS |
| browser | workspace 직접 명령·`--maxWorkers=4 --api.port=4262 --api.strictPort`, 1098PASS/실패0/미실행0 |
| build·smoke | 표준 smoke webServer가 `npm run build`를 한 번 수행한 뒤 preview 실행. smoke466PASS/재시도0/미실행0, 착지20건과 직렬 timing2건은466에 포함 |
| Android | `assembleDebug testDebugUnitTest lint --max-workers=4` 통과 |

browser 첫 호출은 루트의 중첩 npm script가 추가 옵션을 전달하지 않아 기본 API63315/worker 미지정으로 실행됐다. 기능1098PASS지만 지정 포트·worker 준수 결과로 합산하지 않는다. 원로그를 보존하고 browser 단계만 올바른 workspace 명령으로 다시 실행해 위 결과를 얻었다. 제품/시험/timeout/threshold/기준샷 변경0, build·smoke·전체 필수 묶음 재실행0이다.

실제 SoloSession 이어하기/controller/Playback 정상 표적의 source별 RAF·CardId 측정은 다음과 같다. C는412×839, W는393×659로 기하 조건을 구분한다.

| 관측 | C412×839 | W393×659 |
|---|---:|---:|
| 관측 RAF | 113 | 109 |
| 손패10 접촉·약한 빛(ms) | 286.9 | 300 |
| 덱30 접촉·약한 빛(ms) | 703.3 | 702 |
| strong / 획득 counter0(ms) | 1269.2 | 1264 |
| target8·31 첫 실제 이동, 같은 RAF(ms) | 1386 | 1388 |
| before→held target8/31 최대 오차(px) | 0.000153 / 0.000061 | 0 / 0 |

W의 실제 before target8 `(79.1875,281.15625,42,68.390625)`, target31 `(271.796875,185.09375,42,68.390625)`를 예약했다. 두 짝은 actual Captured 반영 뒤 상대 위치를 유지한 채 같은 관측 frame에 출발했다. 강한 강조까지 타월 paint 교차0·획득 전 원본 바닥 존재를 검사했고 원본30=다른월8 오염은 재현되지 않았다. C의 회전 AABB에 부모 회전/outline을 다시 적용하지 않는다. 접촉 간격402/416.4ms는 source 관측값이며 고정0.5초·시각 인지 수용이 아니다.

같은 smoke 안의 staging12표적은 총1506 RAF를 관측했다. 관측한 원본 staging의 양수 rect·숨김 시 같은ID ghost1개·native outer WAAPI0·위치 고정, hand49의 실제 Captured/보충38·counter0→1장, 뻑48/50/12의 실제 획득·strong0/기존10장 불변, 선택29→28·홈/복원·skip/reduced를 검사했다. 정상·복원·capture safety를 합친 own20표적 모두 통과다. 내부 displayed 배열 전체·backface 전체를 이 App sampler가 노출한 것으로 주장하지 않는다. 전체 ID·예약 관련 기본 Game browser 회귀는 별도 포함됐으며 이전 합성의642 RAF 데이터를 이1506에 합산하지 않는다.

[동일 head 독립 COMMENT](https://github.com/kywoo26/p2p-gostop/pull/237#pullrequestreview-5388538901)는 자동 merge-tree와 실제 tree 일치·보호 영역 diff0·두 plan 보존·새 제품 차단0을 확인했다. 독립 source-dev actualdefault42 C/W8PASS는 정상/P1복원/뻑 staging/선택 연쇄 홈 복원이다. 독립 W393×659110RAF는 hand293/deck694/strong1256 counter0·target8/31 첫이동1375ms 같은RAF/before오차0이다. 독립 C412×839113RAF는 strong1265.6/첫이동1382.5ms 같은RAF다. 작성자 결과와 합산하지 않는다. 승인/merge 판정·전체 영상 재생·실기기·인지/성능 수용은 아니다.

[CI36966732215](https://github.com/kywoo26/p2p-gostop/actions/runs/36966732215)는 exacteebe의 최종3jobs SUCCESS다. 실제 CI synthetic commit `38297580738d74ca9536ccb42d51d6a20b2e65bd`의 parents는 mainf9+eebe, tree는 위 head와 같다. core/Android·C component549/E2E246/timing2·W component549가 성공했다. W E2E는177PASS와**1flaky**다. hand49의 첫 시도에서 `stageIntact:89`의 active RAF `>2`에 Received1로 실패한 뒤 설정된 retry1이 통과했다. 첫 시도의 뒤 위치/가림 assertion은 미도달이며 원인·제품 결함/무해 지연을 확정하지 않는다. job 성공으로 failure용 브라우저 artifact가 업로드되지 않아 첫 frames/trace를 읽을 수 없고 원로그만 보존했다. 첫 CI 시도 모두PASS로 쓰지 않는다. PR 정책상 W timing은 미실행이다.

로컬 실제 build와 CI의 기존 web-dist artifact 모두75파일·raw **1,616,921B / 2,097,152B**, 여유480,231B·외부URL0이다. CI artifact ID11210112618을 한 번 읽어 파일별 hash·크기를 보존했으며 재빌드하지 않았다. 70파일은 로컬과 바이트 같고 build 식별자/시간과 이를 참조하는5파일 hash가 다르다. 초기 encoded body는 미측정이며 archive 압축 크기와 혼동하지 않는다.

필수 검사·기존 W 정상 최소 반례는 이 실제 통합 head에서 확인했다. 실제 뻑 회수 중 별도 bonus·즉시 resolve/따닥의 추가 실제 경로, 나머지 수명·전수 기하/전체 성능·사용자 시각/실기기 수용은 이 한정 검사로 완료 처리하지 않는다. 이후 문서 checkpoint는 이 제품·시험·기준샷 blob을 보존하고 새 SHA/CI를 따로 인계한다. Draft/Refs 유지·Closes/자체 merge/tag/release/archive0이다.
