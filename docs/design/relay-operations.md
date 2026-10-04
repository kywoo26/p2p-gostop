# 중계 운영 재사용과 원격 측정 경계

기준: main `f34528927139ef7477f33becd25993569567909e` / v0.5.1. FR-RP-07·NP-RP-07/08·NF-RP-02/05/06·AC-RP-01/06, [plan RP-OPS01](../../intent/plan.md). 명령은 [tools/relay runbook](../../tools/relay/README.md)에만 정본으로 둔다. 여기서는 새 기능/성능 수용을 선언하지 않는다.

## 1. 운영 개선의 범위와 종료 조건

목표는 다음 버전 준비와 같은 버전 기동에 필요한 수작업을 줄이고, 오류·복구 경계를 반복 가능한 명령으로 만드는 것이다. 기존 운영은 켜둔 채 별도 branch와 mock native fixture에서 구현·검증한다. 기존 주소·생성 자격을 재사용하며 실제 URL·token·환경 전체·개인 경로를 결과/공유 로그에 출력하지 않는다. 신규 framework·dependency·전역 skill·protocol·persistence를 도입하지 않는다.

| 단계 | 유지할 계약 | 격리 검증의 핵심 |
| --- | --- | --- |
| preflight/status | 변경 없이 도구/핀·소유권·실제 상태·기대 release/wire/hash를 선별 요약. 연결 수와 방 수를 구별 | 비소유/불완전 marker, 잘못된 runtime/인코딩, 다른 version, 일부 조회 실패. 원 native exit와 오류 종류 유지 |
| prepare | 정확 tag→commit과 승인된 로컬 ZIP SHA를 확인하고 staging에서 안전하게 해제·번들 전체를 검증한다. 이미지/설치/다운로드는 필요한 경우만. 현재 서비스는 변경하지 않음 | PowerShell/.NET ZipArchive 지원 API 사용. 경로·중복·symlink·형식·entry/해제 용량 제한, 전체 SHA·해제 후 manifest/served hash/초기 참조 불일치 거절. .NET CRC 보장으로 표현하지 않음 |
| 같은 버전 start | 이미 소유하고 정상인 동일 identity는 그대로 성공; status/start는 세션 손실 확인을 요구하지 않음 | 반복 호출의 프로세스/자원 유지, 동시 호출 잠금, 다른 release를 같은 버전으로 오판하지 않음 |
| restart/apply | 준비 완료 뒤에만 중단. 소유권 일치·활성 연결 거절·명시적 세션 손실 인수. 외부 자원/주소/secret 회전 금지 | 실패 단계별 적용 전 무변경, 적용 후 소유 자원만 복구, lock/marker/foreground 수명. 불명확한 소유권은 실패로 닫힘 |
| legacy 전환·rollback | legacy marker 자동 승계0. 원 wrapper로만 종료·marker 처리→새 절차 초기화. 실패 시 보존한 원 wrapper·release/image로 복귀 | 명령 순서와 부분 실패를 fixture로 검증. 기존 서비스의 실제 종료/교체는 이번 작업에 포함하지 않음 |
| 완료 판정 | health는 가용성, version/hash/초기 자산은 artifact 정합의 증거다. 실제 host/guest 게임 수용과 구별 | 지원 환경별 isolated 결과·원실패·실행 source를 기록하고 reviewer가 확인. 새 운영 절차의 live 적용은 root 별도 단계 |

[Rooms](../../packages/relay-dev/src/rooms.ts)의 states/codes/auth는 메모리다. 방 생성 cap4·방6시간·초대15분·host 부재10분은 현행 계약이며 [재시작 시험](../../packages/relay-dev/test/public-limits.test.ts)은 기존 방·자격 소실을 기대한다. 따라서 TCP 연결0만으로 안전한 방 종료를 증명할 수 없다. rollback은 서비스를 이전 버전으로 돌리는 것이며 방·토큰 복원이나 무중단을 보장하지 않는다. 실제 운영 전 이용자에게 방 종료/재생성이 필요함을 알리는 경계와 세션 보존 필요성은 사람 판단으로 남긴다. 이번에는 임의 drain API나 영속 저장을 추가하지 않는다.

### 격리 검증 인수와 복구 실패 경계

review01은 lifecycle 35개 동일 사례를 Core 7.6.6·Desktop 5.1에서 각각 통과했다. Node 자산 검사 3건과 기존 ownership43/native8/runtime9도 해당 소스에서 통과했다. 승인 ZIP의 전체149 경로·크기·SHA와 초기 JS/CSS32, 기존 StaticSite served hash를 대조했다. build-only4개 파일도 전체 manifest·이미지 대조에는 포함한다. .NET reader의 CRC 보장이나 LIVE 전환 성공을 주장하지 않는다.

review02는 복구 프로세스가 running이 된 뒤 자산 검증에 실패하면 명시적 rollback도 검증 실패 분기에서 막히는 반례를 원 소스로 재현했다. 최소 수정 후 같은 사례 1건을 두 runtime에서 각각 통과했다. 정상 복구의 재진입은 mutation0으로 완료하고, 검증 실패는 명시적 세션 손실 수용·정확한 소유권·활성/미확인 TCP 거절을 모두 통과한 경우에만 같은 복구 nonce로 한 번 교체한다. 새 검증도 실패하면 실패와 restoring intent를 유지한다. 자동 반복·오류의 성공 전환은 없다. 이전35건 PASS는 이전 소스 귀속이며 최신 delta의 전체 재실행으로 합산하지 않는다.

최종 규범 검사·immutable/PR·CI와 새 절차의 실제 운영 적용은 별도로 남는다. 기존 중계기·운영 wrapper·호출 세션은 이 검증에서 접근하거나 변경하지 않았다.

## 2. 확인한 원격 흐름과 측정 공백

준비 확인→방/초대→중계 인증/host 수락→게임 hello/welcome→snapshot 동기화→합법 입력→host 권위 처리→events/snapshot→guest 검증/Playback→표시·입력 가능 순서다. [relay](../../packages/relay-dev/src/index.ts)는 게임 프레임을 해석하지 않으며 큐64frames/1MiB 또는 bufferedAmount 한도 초과는1009, 인증 송신 burst40·20frames/s·128KiB/s, ping25초/pong60초/5초 tick을 이미 적용한다. 공개 WS 압축은 꺼져 있다. 서버 WS 생존 확인과 guest→게임 host의 protocol ping은 다른 경계다.

[GuestSession](../../packages/protocol/src/guest.ts)은 welcome/resync 이후 outbox를 전송하고 [HostSession](../../packages/protocol/src/host.ts)은 events 크기 상한 실패 때 snapshot으로 수렴한다. 기본 [WsTransport](../../packages/web/src/net/ws-transport.ts)의0.5→30초와 [remote](../../packages/web/src/p2p/remote.ts)의1→2→4…30초+지터 재연결 정책을 혼합하지 않는다. 이 계약의 실제 Android 절전/망 전환 지연은 미측정이다.

[Playback](../../packages/web/src/game/playback.svelte.ts)은 input→enqueue/queue/replay/snap/commit을 분리하지만 input→enqueue에 망·host 처리·클라이언트 처리가 섞인다. 기존 `data-play-timings`는 카드계열 총 ms만 보여주고 requestId·분해값·완료 시각을 제공하지 않는다. DOM seq는 최신 상태이며 화면의 최종 paint/스캔아웃 시각이 아니다. 기존 솔로/로컬 timing 및 WebKit record 정책은 WAN 성능 증명이 아니다.

## 3. 우선순위와 다음 실험 선택

아래 가설은 결함 판정이 아니다. 이번 실행은 P1의 baseline 1개뿐이다. 결과에서 관측되지 않은 부분을 남기고, 나머지는 다음 한 조건을 고르는 계획으로만 유지한다. 수용 수치는 기존 spec에 한정하며 새로운 WAN 목표나 공급자 가용성 보장을 만들지 않는다.

| 순위 / 가설·기존 근거 | 최소 실험·관측 | 수용·중단·사람·소유 |
| --- | --- | --- |
| P1 입력/표시 지연: 원격 응답·Playback 대기의 비중 미측정. 기존 paired E2E·Playback 재사용 | 아래 한 조건에서 action 송신→응답 간격 N, 타입별 bytes·실패/재송신/미응답, DOM 총ms M을 별도 수집 | 기존 seq·잔액 일치/정산·다음 판 hardassert 유지. 임의 ms 합격선0. 운영 요청·권위 불일치·출처 혼합이면 중단. 물리 탭→화면은 사람. 구현자 계측/총괄 해석 |
| P2 재접속·host 수명: snapshot/outbox·잠금은 구현, Android background/Wi-Fi↔cell의 상호작용 미측정 | 후속 guest 단절→복귀 한 조건. auth→welcome→resync→action 순서·중복 수락·seq/머니·잠금·연결 가능 시점 기록 | NP-03 멱등/권위와 NF-RP-05 조건부5초 목표. host 종료·relay 교체를 섞지 않음. 상태 손상/재접속 폭주 중단. Android/iPhone 복귀는 사람, 구현자 fixture/root 조율 |
| P3 queue/크기/공정성: 상한과 snapshot fallback은 구현, slow peer·공유 loop 비용 미측정 | 후속 로컬2방에서 한 방 send 완료 지연. frames/bytes/bufferedAmount·encode/decode·다른 방 응답/1009/1013 기록. 지연 훅과 실제 TCP 압력 구분 | 기존64frames/1MiB·frame16KiB/예외64KiB 계약 유지, 방 간 혼합0·최종 뷰 수렴. 임의 fairness ms 기준0. 한도 우회/타 방 손상 중단. 실제 느린 망은 사람; 구현자/총괄 |
| P4 version·초대 cache: release/hash·no-store·immutable·hello 차단 존재, 오래된 초대/다른 APK 조합 안내 미측정 | 후속 현재/이전 fixture 한 쌍의 version·초대 경로·캐시 header·hello 거절/좌석 보존 | NF-RP-06 artifact/호환 경로 유지. 임의 구버전 허용/세션 초기화0. 자산 누락/비밀 저장/기존 좌석 교체 중단. 실제 WebView/Safari 업데이트 cache는 사람; 구현자/root |
| P5 heartbeat·Tailscale 경로/비용: 기존 이중 생존 확인·압축off, 구간 지연/가동 부담 미측정 | 이후 별도 승인된 사람 측정에서 구간·시간·bytes/재접속/PC 가동량을 기록. 공급자 한도는 그 시점 공식 출처 확인 | NF-RP-03/04 게임 내용 원격 저장0·유료 fallback0·E2EE 주장0. 압축·heartbeat 선수정0. live/요금/식별자 노출 필요 시 중단·root 조율 |

## 4. 승인된 첫 baseline의 정확한 분모

- `packages/web/e2e/remote-play.spec.ts`의 `AC-RP-01 @smoke @paired 설정→방→정적 경로 링크→두 브라우저 로비·1판 정산`만 exact list1로 확인한다. Chromium project1·내부 WebKit guest1, worker1/retry0/instant, 방1·판1·다음 판1, 원 hardassert/180초 시험·120초 진행 경계 불변이다.
- 핀/실행 cwd와 보존 same-source dist 전파일 SHA를 고정한다. private config는 불필요한 npx/build/다른 project/timing dependency를 실행하지 않는다. fresh context/빈 저장소이며 운영 env·설정·주소·secret을 상속하지 않는다. loopback 공개 relay/TLS와 브라우저 준비 서버만 허용하고 실제 운영 자원·포트는 참조하지 않는다.
- 송수신 이벤트를 관측만 하며 허용 메타만 읽는다. request/epoch/응답 종류는 메모리에서만 연관하고 저장 시 run-local 순번으로 바꾼다. raw frame·payload·token/id·이름·카드·시드·머니·URL·환경은 보존하지 않는다. trace/video/screenshot0, 잔액 일치는 boolean만 남긴다.
- 한 Node 단조 시계의 관측 송수신 차이를 사용한다. N은 모든 action 송신으로 성공/거절/재송신/미응답/상관 불명을 빠짐없이 구분한다. DOM 총시간 M은 별도이며 증가분·일대일 대응을 증명할 수 없으면 미측정/상관 미확정으로 둔다. 다른 페이지 performance.now 원시값을 빼거나 RTT/최종 paint로 부르지 않는다.
- 처음 하네스 오류는 원문을 보존하고 원인 범위만 바로잡는다. 자동 반복으로 성공 표본을 고르지 않는다. 운영 요청·출처 혼합·환경 차단 실패 시 실행을 멈추고 미도달을 기록한다. 끝나면 임시 child/소켓/browser/인증서만 정리한다.
- 이 baseline은 격리된 첫 통신·기능·계측 가능성 자료다. WAN RTT/손실·Funnel 경로·Android WebView·절전·2시간 유지·다중 방 공정성·성능 수용은 증명하지 않는다. 첫 실행 결과는 아래에 source·원 분모와 함께 기록한다.

## 5. 첫 baseline 결과와 후속 선택

exact `f345289` source와 실제 v0.5.1 release149파일의 private 복제에서 위 C1(내부 WebKit guest)을 1회 실행했다. 1 PASS/3.803초/retry0이며 방1·정산1·다음 판1, 양쪽 잔액 일치의 원 hardassert를 유지했다. 원 test/config/lock 전후 SHA는 같고 임시 preview/relay/browser 정리를 확인했다. 운영 자원에 접근하지 않았다.

| 관측 | 실제 분모·결과 | 해석 한계 |
| --- | --- | --- |
| guest action 응답 | N13=events12+reject1(sameSeq), 미응답0·재송신0·snapshot0. events12 관측 간격 min1.952/median2.929/max5.672ms, reject1은11.513ms | 송신/응답을 관측한 한 Node 시계의 차이이며 host/client 처리 포함. loopback·instant·단1회·관측 overhead 조건. WAN RTT·p95 안정성·개선폭·제품 거절 원인은 증명하지 않음 |
| DOM 총시간 | M18(host9/guest9), prefix 관측 ambiguity0. host5~12ms·guest9~21ms | N과 일대일 대응·분해값·최종 paint 미측정. instant 경로의 값이며 정상 모션/실기기 성능 수용 아님 |
| 안전·기능 | origin 위반/page error/request 실패/socket error0, 정산·잔액 일치·다음 판 도달 | 실제 공개망/Funnel/Android WebView·망 전환·장시간 게임의 성공 주장 없음 |
| 보존 | 허용 메타97항목과 run-local action/DOM 표본만. raw frame/payload·실제 request/room/token/id·URL·trace/video/screenshot 미보존 | raw 프레임을 저장하지 않았다는 뜻이며 프레임 관측 메타가 없다는 뜻은 아님 |

다음 원격 조사 단위는 **측정 공백 설계**를 우선한다. 현재 reject reason은 수집 허용 목록 밖이어서 미관측이다. 알려진 enum reason category만 보존하는 방법과 request→DOM의 비밀 없는 run-local 상관·완료 경계를 먼저 검토한다. 기존 프레임 payload/토큰/카드/머니를 저장하거나 DOM 총시간을 강제로 action에 대응시키지 않는다. 이 설계의 수용은 성공·거절·상관 미확정 표본이 분모에서 유실되지 않고 privacy/기존 권위 계약을 유지하는 것이다. 아직 제품 계측 변경이나 재실행은 승인·실행하지 않았으며, 거절1을 제품 bug로 판정하지 않는다. 총괄이 설계, 같은 구현자가 필요 최소 접점 검토, reviewer가 privacy/관측 의미를 확인하고 root가 다음 실행 여부를 결정한다.

P2~P5는 그 뒤 선택할 후속 가설로 유지한다. 이번 finite 성능 조사는 위 baseline+계획으로 마감하고, 현재 구현은 RP-OPS01-A의 운영 스크립트·격리 시험·reviewable 결과에 집중한다.
