# #200 실제 착지 제품 checkpoint

2026-10-02 · FR-14~17·UX-15~17·NF-03/08/09·AC-06/07 · Refs #200, #202, #236

기준 main `e8ab9ffdd3f185934a12b1c62b61ed17fb70e5f7`, 계획 최종 SHA `b1fb35879c4fc170fb0445b5d0ddfb79fc090902`.
첫 구현·실패를 함께 게시한다. 전체 요구사항 완료, 사용자 시각 수용, 0.5초 고정 시간, 실기기·전체 성능 통과를 뜻하지 않는다. #235의 고정 checkpoint와 격리 합성한 실제 42px 비교는 원본 카드 소실로 실패했다. 기본 Game 통합·출하 판정은 하지 않는다.

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
