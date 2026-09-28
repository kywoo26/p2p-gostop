# M4 프로토콜 사후 리뷰 (PR #3, R2 트랙)

- 대상: `d99ffb1` (Merge PR #3) 기준 `packages/protocol/**`, `packages/relay-dev/**`, `packages/web/src/net/**`, `packages/web/src/lib/view-types.ts`
- 근거: AGENTS.md, plan.md 1.1·1.6·"M3 준비 결과가 M4에 넘기는 입력"·3장 M4·3-2, spec.md 5장 NP-01~NP-09(v0.5 NP-06), 8장 MN-01/02/05, FR-14, NF-02/05/06, docs/protocol.md, docs/rules-vectors.md "뷰 가림 규칙"
- 검토자: reviewer(Claude). 코드 수정 없음. 재현은 임시 테스트 파일(검토 후 삭제)을 `./dev.sh test`로 실행.

## 판정

**통합(I1) 전에 수정 필요.** 스키마 검증·순번 검사·SHA-256·가림(redaction) 자체는 대체로 맞게 구현되어 있고 주장한 수치도 재현된다. 그러나 (1) 게스트가 받는 `BoardView`만으로는 첫 판(선 고르기)조차 진행할 수 없고, (2) 판 사이 commit-reveal 핸드셰이크 도중 메시지 하나가 유실되면 재접속으로도 풀리지 않는 영구 정지가 난다. 두 건은 UI 통합 전에 고쳐야 한다. 중요 5건은 I1과 병행해 U1에서 처리해도 되지만, I-3(전송·중계 정합)은 I1 구현과 한 몸이라 I1 범위에 넣기를 권한다.

## 재현한 수치

- `./dev.sh test`: 19 파일, **330 테스트 통과**(protocol `m4.test.ts` 18 + `protocol.test.ts` 3, relay-dev `relay.test.ts` 5 + `session-relay.test.ts` 1). 주장과 일치.
- relay 20판 테스트: "실제 ws 중계로 양측 20판, 끊김·토큰 복귀·원장 제로섬" 통과(약 0.64초).
- `./dev.sh check`: 통과(svelte-check 0 오류·0 경고, tsc 7, knip). `./dev.sh lint`: 통과(oxlint 0 경고·0 오류, oxfmt, ESLint, Prettier).
- `npm run test:net -w packages/web`(WsTransport Node 테스트): 2 통과.
- 주의: 새 워크트리에서는 `./dev.sh install`을 먼저 하지 않으면 `vitest: not found`(127)로 실패한다. 제품 결함은 아님.

아래 R1~R13은 이 리뷰에서 임시 테스트로 재현한 결과다.

- R1 핸드셰이크 정지: 2판 시작 때 `revealGuestRequest` 1건 유실 → 게스트가 hello를 2번 다시 보내도 `host.state === null` 유지. 로그 꼬리: `revealGuestRequest DROP → hello → welcome → commitHost → hello → welcome → commitHost`.
- R2 호스트 재추첨: 게스트가 원문을 공개한 뒤 같은 판 번호로 다른 `commitHost`를 받으면 새 난수로 `commitGuest`를 다시 보낸다(오류 없음).
- R3 검증 무결속: 게스트에게 스냅샷·이벤트를 하나도 보내지 않고 시드에 맞는 임의 합법 수열만 담은 `revealHost`를 보내도 `verifiedRounds = [1]`.
- R4 원장 증가: `ledger.entries` 120개(13.4KB)까지 정상, **140개(15.6KB)에서 `RangeError: 메시지가 16384바이트를 넘습니다`**가 `HostSession` 밖으로 던져지고 판이 시작되지 않음.
- R5 중계 알림: `{"t":"relay","peer":"joined"}`·`{"type":"relay",...}` 모두 `MALFORMED`. 호스트는 알림을 받을 때마다 게스트에게 `reject`를 보낸다.
- R6 호스트 복원: 원장·토큰·판 번호·선·이월로 `HostSession`을 다시 만들면 호스트 `seq=7`, 게스트 `lastSeq=283` → 게스트는 이후 모든 스냅샷·이벤트를 무시(`view` 없음, `STALE_SEQ` 반복).
- R7 정산 화면 소멸: 판 종료 직후 게스트 `settlement === null`, `view.round`는 이미 다음 판.
- R8 나가리 금액: 무작위 80판에서 나가리가 나오지 않아 재현하지 못함(코드상 결함, 아래 S-1 참고).
- R9 여분 필드: `payload.pad`(15,000자)가 검증을 통과해 그대로 남음. 게스트 액션마다 3,000자 여분 필드를 붙이면 판 종료 때 `revealHost` 인코딩에서 `RangeError`가 던져지고 호스트는 `phase=end`에서 멈춤. `seq`에 `1e300`·`2^60`은 거부(정상), `__proto__` 키는 오염 없음(정상).
- R10 로그 버퍼: 빈 줄 20,000개(60KB) `log` 1건 처리에 **1,233ms**(데스크톱 Node). 폰 WebView 메인 스레드에서는 더 길다.
- R11 선 고르기: 첫 판 호스트 `pending=pickFirst`, 게스트 좌석 합법 수 8개인데 게스트 `view.pending=null`, `playable=[]`.
- R12 게스트 새로고침: 판 중간에 새 `GuestSession`(토큰·lastSeq 유지)으로 바꾸면 판 종료 때 `COMMIT_INVALID` 2건 + `ROUND_NOT_READY` 1건.
- R13 파산: 잔액 `[600, 0]`에서 프롬프트는 게스트에게만 1회, 호스트 쪽 선택 API 없음. 게스트가 재충전을 고르면 `[300, 300]`으로 **양쪽 모두** 리셋되고 원장 항목 합(좌석 0 +300)과 잔액(0)이 어긋난다.

## 심각

### S-1. 게스트 `BoardView`가 M3 로컬 어댑터의 상위 집합이 아니다 — 첫 판 선 고르기부터 진행 불가 (R11)

- 위치: `packages/protocol/src/view.ts:39-46`(`prompt`가 `pickFirst`를 `null`로), `view.ts:47-80`(`toBoardView`), `packages/protocol/src/view-types.ts:80-94`(`BoardView`), 비교 대상 `packages/web/src/game/adapter.ts:48-59`(`BoardExtras`)·`:185-203`(`inFlightOf`)
- 근거: plan.md "M3 준비 결과가 M4에 넘기는 입력", FR-12·FR-14, docs/protocol.md "view는 ... toBoardView로 변환한 것"
- 내용: 게스트는 엔진 `PlayerView`를 받지 못하고 `BoardView`만 받는다. 그런데 M3 솔로 화면이 `PlayerView`에서 직접 뽑아 쓰던 값이 `BoardView`에 없다.
  - 선 고르기: `HostSession`은 첫 판을 `dealer` 없이 시작하므로 항상 `pickFirst`에서 멈춘다. 게스트는 `pending=null`, `playable=[]`, 후보 장수(`poolSize`)·상대가 고른 자리·동월 재선택 여부를 모두 모른다(R11: 게스트 합법 수 8개).
  - 폭탄(`bomb`)·폭탄패 뒤집기(`flipOnly`): 합법 수 목록도 `bombTokens`도 없어 게스트 UI가 버튼을 낼 근거가 없다. 게스트가 낼 수 있는 액션은 사실상 `play`·프롬프트 응답뿐이다.
  - FR-14: 고/스톱 프롬프트에 `stopAmount`만 있고 배수 체인(`stopPreview.steps`)·점수 분해가 없다.
  - 대상 선택 중 "낸 패·뒤집은 패" 위치(`ctx.played`·`ctx.flipped`·`heldBonuses`, M3 `inFlightOf`)와 `dealer`가 없다.
  - 현재 배수 계산이 M3와 다르다: protocol은 **차례 좌석**(`view.turn`)의 흔들기·폭탄을 쓰고 대박판(`jackpotRound`)을 빠뜨린다(`view.ts:64-67`). M3는 보는 좌석 기준에 대박판을 곱한다(`adapter.ts:82-93`). 같은 판을 호스트·게스트가 다르게 표시한다.
  - 나가리 정산 금액: `amount`를 "마지막 원장 항목이 round면 그 금액"으로 구한다(`view.ts:107`). 나가리는 원장을 바꾸지 않으므로 그 판에 즉시 정산이 없었다면 **직전 판의 금액**이 나온다(R8은 표본에 나가리가 없어 미재현, 코드상 명백). 정산 전 잔액도 M3는 "판 시작 전(즉시 정산 포함 전)"인데 protocol은 "즉시 정산 반영 후"다.
- 수정안:
  1. `BoardView`에 `legal: Action[]`(보는 좌석 합법 수, 엔진 `view.legal` 그대로)를 넣는다. 게스트 UI는 이 목록 안에서만 액션을 만들고 호스트는 지금처럼 `legalActions`로 재검사한다. `playable`·`bombMonths`·`canFlipOnly`는 여기서 파생한다.
  2. `firstPick`(`poolSize`, `picks`, `ties`), `dealer`, `phase`, `inFlight`(`played`, `staged`), `goStop` 상세(`points`, `steps`, `multiplier`, `money`, `capped`)를 `BoardView`에 추가하고 M3 `BoardExtras`·`inFlightOf`를 protocol로 옮긴 뒤 web 쪽을 지운다(adapter.ts 2행의 TODO).
  3. 배수는 M3 `currentMultiplier`로 통일하고, `toSettlementView`는 판 시작 시 저장한 원장·해당 판 `round` 항목 존재 여부로 `amount`를 계산한다(나가리면 0).
  4. 계약 테스트: "게스트는 `BoardView`만 보고 한 판을 끝낼 수 있다"(게스트 쪽 정책이 `view.legal`에서만 고르는 20판 테스트)를 추가한다. 지금 테스트는 호스트의 전체 상태에서 게스트 액션을 고르므로 이 결함을 못 잡는다(T-1).

### S-2. 판 사이 commit-reveal 핸드셰이크 중 메시지 1건 유실 → 재접속으로도 풀리지 않는 영구 정지 (R1)

- 위치: `packages/protocol/src/session.ts:246-252`(`resync`: 판이 없으면 `commitHost`만 재전송), `session.ts:478-479`(게스트: 같은 판·같은 해시의 `commitHost`는 무시), `session.ts:310-317`(`commitGuest`)
- 근거: NF-05(P0, 사용자 개입 없이 5초 내 재동기화), NP-03, NP-06
- 내용: 중계는 상대가 없으면 메시지를 버린다(plan 1.1, 버퍼링 없음). `revealGuestRequest`가 유실되면 호스트는 `guestHash`를 가진 채 `revealGuest`를 기다리고, 게스트는 재접속 후 받은 `commitHost`가 같은 해시라 아무것도 보내지 않는다. `commitGuest`가 유실돼도 같다. 시간 초과·재시도 경로가 없어 세션을 새로 만들어야 한다. 재현 R1에서 hello를 두 번 다시 보내도 `host.state === null`이었다.
- 수정안:
  1. 호스트 `resync`: 판이 없으면 단계별로 마지막 핸드셰이크 메시지를 다시 보낸다. `guestHash`가 있으면 `revealGuestRequest`를, 없으면 `commitHost`를.
  2. 게스트: 같은 판·같은 해시의 `commitHost`를 다시 받으면 저장해 둔 `commitGuest`(같은 해시)를 재전송한다(새 난수 금지). `revealGuestRequest` 재수신 시에도 같은 원문을 재전송한다.
  3. 테스트: 핸드셰이크 각 메시지(`commitHost`, `commitGuest`, `revealGuestRequest`, `revealGuest`)를 하나씩 떨어뜨리고 재접속해 다음 판이 시작되는지 검사하는 표 기반 테스트를 추가한다.

## 중요

### I-1. commit-reveal이 실제로 본 판을 검증하지 않고, 호스트 재추첨을 막지 않는다 (R2·R3·R12)

- 위치: `packages/protocol/src/crypto.ts:108-133`(`verifyRound`), `session.ts:478-491`(게스트 `commitHost`), `session.ts:499-516`(`revealHost` 처리)
- 근거: NP-06 v0.5 "게스트는 공개된 시드와 액션 열로 replay하여 분배·뒤집기가 조작되지 않았음을 검증한다", M1 리뷰 S-1
- 확인된 것(정상): 게스트 원문은 분배 전, 호스트 원문은 판 종료 후 공개(`session.ts:195-207`). 해시는 순수 JS SHA-256(`crypto.ts:24-73`, NIST 빈 입력·abc 통과). 시드는 SHA-256(host‖guest) 앞 128비트로 결정적이고 순서를 구별한다. protocol·net에 `Math.random`·`crypto.subtle`·`randomUUID` 없음. 난수는 `random32` 주입.
- 결함:
  1. `verifyRound`는 해시·시드 일치와 "리플레이가 `end`로 끝남"만 본다. 게스트가 받은 이벤트·최종 뷰·정산, 게스트가 직접 보낸 좌석 1 액션, 판 옵션(`roundNumber`·`carry`·`dealer`)과 대조하지 않는다. 호스트는 조작한 판을 진행한 뒤 시드에 맞는 아무 합법 수열이나 보내면 된다(R3: 뷰를 하나도 안 받았는데 `verifiedRounds=[1]`). `verifiedRounds`가 거짓 안심을 준다.
  2. 게스트는 원문을 공개한 뒤에도 같은 판 번호의 새 `commitHost`를 받아들여 새 난수로 응답한다(R2). 호스트는 게스트 원문으로 덱을 계산해 보고 마음에 들지 않으면 다시 커밋할 수 있다(재추첨 공격).
  3. 불일치 시 `errors`에 `COMMIT_INVALID`를 넣을 뿐 UX 연결이 없다. 게스트 새로고침(메모리 유실) 뒤에는 정상 판도 `COMMIT_INVALID`로 표시된다(R12) — 거짓 경보.
- 수정안:
  1. 게스트는 판마다 받은 이벤트 열(가림 적용본)과 자기가 보낸 액션을 기록하고, 검증 때 리플레이 이벤트를 좌석 1 기준으로 가려 순번 포함 비교, 좌석 1 액션 부분열 일치, 최종 정산 결과·원장 항목과 `settlement` 일치, `options`가 게스트가 본 판 번호·이월과 일치하는지 확인한다.
  2. 게스트는 원문을 공개한 판 번호에 대해 다른 해시의 `commitHost`를 거부하고 `COMMIT_INVALID`(재추첨 의심)로 기록한다. 판 번호는 단조 증가만 허용한다.
  3. 게스트가 판 중간에 합류(새로고침)했으면 그 판은 "검증 불가"로 따로 표시하고 부정 판정에서 제외한다.
  4. docs/protocol.md 51행의 "UI 통합 시 연결" 항목을 I1 체크리스트로 명시한다.

### I-2. 메시지 크기 초과가 `RangeError`로 세션 밖에 던져진다 — 긴 세션과 게스트 여분 필드 (R4·R9)

- 위치: `packages/protocol/src/transport.ts:28-31`·`packages/web/src/net/ws-transport.ts:79,110`(모든 송신이 `encode` 호출), `packages/protocol/src/index.ts:111-118`(`encode`가 16KB 초과 시 throw), `session.ts:121-130`(`snapshot`은 크기 검사 없음), `session.ts:196-206`(`revealHost`), `index.ts:241-246`(검증한 파싱 결과 대신 원본 `value`를 반환)
- 근거: NP-07(16KB, 스냅샷은 그 이하로 설계), MN-01, 검토 항목 "거부는 예외를 던지지 않는다"
- 내용:
  1. 원장 `entries` 전체가 `welcome`·모든 `snapshot`·모든 `events`에 실린다. 항목이 약 140개(판 정산 + 즉시 정산)에 이르면 스냅샷이 16KB를 넘고 `encode`가 던진다(R4). 몇 시간짜리 기내 세션이면 도달 가능한 규모다. 예외는 `HostSession.receive`·`apply` 호출자까지 올라가고 판 진행이 멈춘다.
  2. `decode`가 검증 후에도 원본 객체를 돌려주므로(주석: 이벤트 여분 필드 보존 목적) 게스트 `action.payload`의 알 수 없는 필드가 그대로 `HostSession.actions`에 쌓인다. 게스트가 액션마다 수 KB 여분 필드를 붙이면 판 종료 때 `revealHost`가 16KB를 넘어 던지고 호스트는 `phase=end`에서 멈춘다(R9). 친구 사이라도 버전 차이·버그로 생길 수 있다.
- 수정안:
  1. 게임 메시지에는 원장 요약(`perPoint`, `startBalance`, `balances`, 이번 판 항목)만 싣고, 전체 이력은 필요 시 별도 메시지(예: `ledgerHistory`, 64KB 한도에서 페이지 단위)로 보낸다.
  2. `decode`는 게스트→호스트 메시지에 대해 zod 파싱 결과(여분 필드 제거본)를 돌려준다. 호스트→게스트 이벤트의 여분 필드 보존이 필요하면 이벤트 스키마만 느슨한 객체로 두고, 액션·hello·commit 계열은 엄격 객체로 한다.
  3. `HostSession`의 모든 송신을 한 함수로 모아 `encode` 예외를 잡고 스냅샷 폴백·진단 로그로 바꾼다. 테스트: 원장 500항목 세션, 여분 필드 액션 거부.

### I-3. WsTransport·relay-dev가 Android 중계 계약(M0·PR #1 결정)과 어긋난다 (R5)

- 위치: `packages/web/src/net/ws-transport.ts:87-105`(알림 처리·닫힘 코드 구분 없음), `ws-transport.ts:125-130`(`reconnect`는 소켓이 OPEN이면 아무것도 안 함), `ws-transport.ts:80-85`(ping만 있고 pong 감시 없음), `packages/relay-dev/src/index.ts:35-40,48-52,56-61`, 비교 대상 `android/app/src/main/kotlin/com/kywoo26/p2pgostop/server/SmokeServer.kt:123,131,135,244-264,292-295`
- 근거: NP-01·NP-05·NF-05·NF-06, M0 리뷰·PR #1 결정(알림 `t=relay`의 `peer` 값 joined·left·present·absent, 최신 연결 우선 4001, 바이너리 1003, 크기 1009, 호스트 루프백 전용), plan.md 65행 "relay-dev는 Android Ktor 중계와 같은 규칙"
- 내용:
  1. 중계 알림을 WsTransport가 걸러내지 않는다. `{"t":"relay"}`와 옛 `{"type":"relay"}` 모두 세션으로 넘어가 `MALFORMED`가 되고, 호스트는 알림마다 게스트에게 `reject`를 보낸다(R5). 호스트는 게스트의 입장·이탈을 알림으로 알 수 없어 60초 무응답에만 의존한다.
  2. 닫힘 코드를 구분하지 않는다. 4001(새 연결로 교체됨)을 받은 쪽도 백오프 후 재접속해 새 연결을 다시 밀어내므로, 같은 게스트의 탭 두 개(Safari 탭 복원 + QR로 새 탭)가 서로를 끝없이 교체한다. 1008(역할 오류·호스트 비루프백)도 영원히 재시도한다. 주소만 표시 폴백(NF-06)에서는 LAN의 아무 기기나 `role=guest`로 붙어 토큰 없이도 진짜 게스트를 4001로 밀어낼 수 있다.
  3. pong 응답 감시가 없다. iOS에서 백그라운드 복귀 후 OPEN 상태로 남은 죽은 소켓이면 `visibilitychange`의 재접속이 아무것도 하지 않아 5초 복귀(NF-05, AC-09)를 못 지킨다.
  4. relay-dev는 Android와 다르다: 같은 역할 두 번째 연결을 4409로 **거절**(Android는 기존을 4001로 교체), 알림 없음, 바이너리 프레임을 그대로 전달(Android는 1003으로 닫음), 호스트 루프백 검사 없음(기본 바인드가 127.0.0.1이라 가려질 뿐), 교체된 소켓의 늦은 프레임 무시 없음. 1009는 양쪽 같다. 이 때문에 relay-dev 기반 테스트·E2E는 위 1~3을 잡을 수 없다.
- 수정안:
  1. WsTransport 수신에서 JSON의 `t` 또는 `type`이 `relay`인 프레임을 먼저 가로채 별도 피어 상태 콜백으로 넘기고 세션에는 전달하지 않는다. `HostSession`에 피어 입장·이탈 메서드를 두어 `connected`를 갱신하고, 게스트는 `present`·`joined` 때 `hello`를 보낸다.
  2. 닫힘 코드별 정책: 4001이면 재접속하지 않고 "다른 창에서 접속 중" 상태로 멈춤(사용자 조작 시에만 재접속), 1008이면 중단, 1009·1003이면 진단 로그 후 재접속. 토큰 없는 교체는 중계가 토큰을 모르므로 막을 수 없다 — 호스트 화면에 "게스트가 교체됨"을 표시하고 문서에 한계를 적는다.
  3. 게스트는 ping 후 일정 시간(예: 10초) 안에 pong이 없거나 `visibilitychange`로 돌아오면 소켓 상태와 무관하게 새 소켓을 연다(소켓 id로 옛 소켓을 무시하는 장치는 이미 있음).
  4. relay-dev를 Android와 같은 규칙으로 맞추고, 같은 시나리오 표(교체 4001, 알림 4종, 1003, 1009, 호스트 비루프백 1008, 늦은 프레임 무시)를 Node·Kotlin 테스트가 공유한다(plan M4 "중계 규칙 테스트(Node·Kotlin 동일 시나리오)").

### I-4. 호스트 복원(MN-05) 뒤 게스트가 영구히 동기화되지 않는다 (R6)

- 위치: `session.ts:36-47,78-93`(`seq`·이벤트 기록·진행 중 판 상태를 받을 옵션 없음), `session.ts:253-255`(게스트 `lastSeq`가 더 크면 스냅샷), `session.ts:455`(게스트는 스냅샷 `seq`가 자기 `seq` 이상일 때만 수용), `session.ts:463`(이벤트 `to`가 자기 `seq` 이하면 무시)
- 근거: MN-05(호스트 로컬에 원장 저장 후 이어하기), NF-05(호스트 프로세스 사망 후 복구 시도), docs/protocol.md 26행
- 내용: 문서는 "원장과 토큰·판 번호·선·이월 배수를 보관해 복원할 수 있다"고 하지만 `seq`가 0부터 다시 시작한다. 게스트는 더 큰 `lastSeq`를 갖고 있어 새 호스트의 스냅샷·이벤트를 모두 버리고 `STALE_SEQ`만 반복한다(R6: 게스트 283, 호스트 7). 저장 시점을 알리는 변경 훅·직렬화 API도 없어 호스트 UI가 무엇을 언제 저장할지 정할 수 없다.
- 수정안: `HostSession`에 직렬화·복원 API를 추가해 `seq`, 판 번호, 선, 이월, 원장, 토큰, (선택) 진행 중 판의 시드·액션 열을 저장한다. 진행 중 판은 시드+액션 리플레이로 복원할 수 있다. 추가로 세션 세대(`epoch`)를 `welcome`에 넣어 게스트가 세대가 바뀌면 `seq`를 초기화하고 스냅샷을 무조건 수용하게 한다. 상태 변화마다 변경 콜백을 호출해 UI 갱신과 저장을 같은 지점에서 한다.

### I-5. 판 전환·파산 흐름이 UI 없이 자동 진행되고 한쪽 좌석만 결정한다 (R7·R13)

- 위치: `session.ts:179-213`(`finishRound`가 곧바로 `beginRound`), `session.ts:152-165`(`settlementView`를 비움), `session.ts:209-211,345-361`(파산), `session.ts:246-278`(재접속 때 `bankruptcyPrompt` 재전송 없음)
- 근거: spec 6.2 정산 화면, MN-01·MN-02
- 내용:
  1. 판이 끝나면 곧바로 다음 판 커밋이 시작되고 게스트가 자동 응답하므로 수 ms 안에 다음 판이 분배된다. 정산 스냅샷의 `settlement`는 다음 `events`에서 `null`로 덮인다(R7). 양쪽 모두 정산 화면을 볼 시간이 없다.
  2. 파산 프롬프트는 게스트에게만 가고 호스트 좌석에는 선택 API가 없다(R13). 호스트가 파산해도 게스트가 "재충전/종료"를 고른다. 재접속 때 프롬프트를 다시 보내지 않아 게스트가 끊긴 사이 파산하면 세션이 멈춘다. `end` 선택은 게스트에게 알리지 않는다.
  3. 재충전이 **양쪽** 잔액을 시작 잔액으로 되돌리고 원장 항목을 남기지 않는다. 이긴 쪽의 누적 이득이 사라지고 항목 합과 잔액이 어긋나 MN-01 대조가 깨진다(R13: 항목상 좌석 0 +300, 잔액 변화 0). spec MN-02 "재충전(시작 잔액으로 리셋)"은 파산한 좌석만 리셋으로 읽는 것이 자연스럽다(해석이 갈리면 spec에 명시 필요).
- 수정안: 판 종료 후 "다음 판 대기" 상태를 두고 양쪽 확인(게스트 `ready` 메시지 + 호스트 API) 뒤에 다음 판 커밋을 시작한다. 파산은 파산한 좌석을 담은 프롬프트로 그 좌석에게 묻고, 호스트 좌석이면 호스트 API로 받는다. 재접속 `resync`에서 대기 중 프롬프트를 다시 보낸다. 재충전은 파산 좌석만 리셋하고 `recharge` 종류의 원장 항목을 남긴다(제로섬 검사는 "항목 합 = 잔액 − 시작 잔액"으로). `end`는 세션 종료 메시지로 알린다.

## 경미

- L-1 게스트 로그 버퍼가 줄마다 버퍼 전체를 `join`하고 바이트를 다시 센다(`session.ts:339-344`). 60KB 로그 1건에 1.2초(R10). 버퍼 바이트 수를 누적 변수로 관리하고 앞에서 빼는 방식으로 바꾼다. NP-09 한도 자체는 맞게 검사한다(`index.ts:251-255`).
- L-2 SHA-256 테스트가 1블록 입력(빈 입력, abc)뿐이다(`m4.test.ts:42-49`). `combineSeed`는 64바이트(2블록) 입력을 해시하므로 NIST 2블록 벡터(448비트 abcdbcde...)와 55·56·64바이트 경계 입력을 추가한다. 구현(`crypto.ts:24-73`)은 읽어 본 바 맞다.
- L-3 `reject.reason`이 `z.string()`(`index.ts:215`)이라 게스트 `errors`에 임의 문자열이 `ErrorCode`로 들어간다. 코드 열거형 리터럴 합집합으로 검사한다. `hello.name`은 길이만 검사하고 제어 문자를 거르지 않는다(Svelte가 이스케이프하므로 표시상 위험은 낮음).
- L-4 `STALE_SEQ`면 호스트가 `reject`+스냅샷을 보내고, 게스트는 `reject`를 받고 다시 `hello`를 보내 `welcome`+스냅샷이 한 번 더 온다(`session.ts:215-218,474-476`). 끊길 때마다 `onClose`가 `hello`를 WsTransport 대기열에 쌓아 재접속 시 중복 `hello`가 나간다(`session.ts:403`, `ws-transport.ts:111`). 게스트는 `reject STALE_SEQ`에서 스냅샷을 기다리기만 하고, 대기열의 `hello`는 하나로 합친다.
- L-5 `packages/protocol/src/view-types.ts:1-5`의 머리 주석이 web의 "잠정, protocol이 생기면 지운다"를 그대로 옮겨 왔고, `UiEvent`(`view-types.ts:123-138`)는 엔진 이벤트와 이름이 다르다(`Go.n` 대 엔진 `Go.count` 등). plan "M3 준비 결과" 2번 항목(spec 4.5를 엔진 기준으로 갱신, protocol이 단일 정의 export)이 반쯤만 되었다. `UiEvent`를 지우고 `ProtocolEvent = EngineEvent`(`view.ts:116`)만 남긴다.
- L-6 스키마가 조금이라도 바뀐 옛 클라이언트의 `hello`는 `VERSION_MISMATCH`가 아니라 `MALFORMED`가 된다(`index.ts:242-250`, 버전 검사가 스키마 검사 뒤). `t`·`v`만 먼저 느슨하게 읽어 버전부터 판정하면 NP-04 안내가 확실해진다.
- L-7 호스트 `apply()`가 공개 메서드이고 좌석을 검사하지 않는다(`session.ts:233-245`). 호스트 UI 버그로 좌석 1 액션이 적용될 수 있다. 호스트 UI용 `applyHost(action)`에서 좌석 0과 합법성을 검사한다.
- L-8 `HostSession.events`가 세션 내내 모든 판의 이벤트를 쌓는다(`session.ts:139`). 재동기화는 최근 40개까지만 쓰므로 현재 판 또는 최근 N개로 자른다.
- L-9 WsTransport 테스트(`packages/web/src/net/ws-transport.node.test.ts`)는 `test:net` 스크립트와 브라우저 모드 `src/**/*.test.ts` 포함 규칙으로만 돈다. `./dev.sh` 태스크 목록(AGENTS.md 5장)에 없어 로컬 검증 경로가 문서화되어 있지 않다.

## 테스트 평가

- T-1 20판 세션 테스트(`packages/protocol/test/m4.test.ts:90-131`, `packages/relay-dev/test/session-relay.test.ts:83-135`)는 **호스트의 전체 상태**(`host.state`)에서 양쪽 액션을 고른다. 게스트가 자기 `BoardView`만으로 수를 고를 수 있는지는 검사하지 않아 S-1(선 고르기·폭탄 불가)을 놓쳤다. 게스트 정책은 게스트 뷰만 입력으로 받게 한다.
- T-2 메모리 전송(`transport.ts:28-31`)이 동기 재진입으로 즉시 배달해, 핸드셰이크가 한 호출 안에서 끝난다. 끊김은 좌석 0 액션 시점 한 번뿐이라 핸드셰이크 중 유실(S-2), 재추첨(I-1), 판 사이 대기(I-5)를 다루지 않는다. 드롭·지연·순서 바꾸기 필터가 있는 전송으로 표 기반 테스트를 추가한다.
- T-3 `startBalance: 1_000_000_000`이라 파산(MN-02) 경로가 한 번도 실행되지 않는다. 원장 항목도 적어 16KB 초과(I-2)가 드러나지 않는다.
- T-4 계약 벡터 `wire.json` 13개는 모두 `decode` 모양 검사다. `welcome`·`snapshot`·`events` 정상형, `revealGuest`·`revealHost`·`bankruptcy`·`bankruptcyPrompt`, 줄 2KB 초과 `log`, 여분 필드, 중계 알림 두 형식에 대한 벡터가 없다. plan M4 "호스트·게스트 양쪽에서 같은 벡터"는 세션 행동 벡터(입력 메시지 열 → 기대 출력 메시지 열)까지 넓혀야 의미가 있다.
- T-5 relay-dev 테스트(`relay.test.ts:56`)가 4409 거절을 기대값으로 고정해, Android 결정(4001 교체)과 다른 동작을 정답으로 굳혔다. 구현을 따라 쓴 테스트의 예다.
- T-6 WsTransport는 실제 중계·세션과 함께 돌려 본 테스트가 없다(`session-relay.test.ts`는 자체 `RelayTransport`를 쓴다). I1 E2E 전에 WsTransport + relay-dev(Android 규칙으로 수정 후) + 두 세션 조합 테스트를 둔다.
- 잘 된 점: 임의 바이트·잘못된 카드 값 속성 테스트(`m4.test.ts:56-85`)가 "거부는 예외 없이"를 확인한다. `seq`는 `z.int()`로 안전 정수 범위 밖을 거부하고(R9), `__proto__` 키로 오염되지 않는다. 이벤트 순번 연속성은 `decode`(`index.ts:256-261`)와 게스트(`session.ts:463-468`) 양쪽에서 검사한다. 중복 액션은 `seq` 일치 검사(`session.ts:215-219`)로 두 번 적용되지 않는다. 게스트 액션은 좌석 1이고 `legalActions`에 있어야만 적용된다(`session.ts:224-230`).

## 검토 항목별 요약

1. 스키마·zod/mini 검증: 양쪽 모두 수신 즉시 `decode`로 검증한다(`session.ts:280,441`). NaN·Infinity는 JSON에 없고 거대 `seq`는 거부, 배열 크기는 바이트 한도로 제한, 오염 없음, 거부 시 예외 없음. 단 검증 후 원본을 써서 여분 필드가 남는다(I-2), `ledger.entries`·`rules`·`settlement`·`seats`·`floor`·`pending`은 `unknown`으로 사실상 미검증(호스트 신뢰 전제라 경미), `reject.reason` 느슨함(L-3).
2. 순번·재동기화: 빈틈·중복·순서 바뀜은 게스트가 `hello`로 복구, 16KB·40개 기준 스냅샷 폴백, 토큰 재접속 정상. 핸드셰이크 구간(S-2)과 호스트 복원(I-4)에서 복구 불가.
3. commit-reveal: 공개 순서·SHA-256·시드 결정성·RNG 출처는 맞다. 검증이 본 판과 묶이지 않고 재추첨을 허용한다(I-1).
4. 세션 상태 기계: 로비→판→정산 흐름, `nextDealer`·`nextCarry` 반영(`session.ts:192-193`), 원장 제로섬(재충전 제외)은 맞다. 판 사이 대기·파산 좌석·영속 훅이 없다(I-4, I-5). 가림: `playerView(state, 1)`·`redactEvent(e, 1)`만 보내고 `ctx`·`firstPick` 후보·상대 손패·더미를 싣지 않아 **숨은 정보 누출은 찾지 못했다**. `revealHost`의 호스트 액션 열(흔들기 거절 등)은 판 종료 뒤라 허용 범위다.
5. 어댑터: protocol `BoardView`는 M3 어댑터의 상위 집합이 아니다(S-1).
6. WsTransport: `visibilitychange`·`pageshow` 재접속, 지수 백오프(0.5초→30초 상한), 게스트 25초 ping, 소켓 id로 옛 소켓 무시는 구현됨. 금지 API 없음. 중계 알림·닫힘 코드·pong 감시 없음(I-3).
7. relay-dev와 Android 정합: I-3 4번 참고.
8. 테스트: 위 T-1~T-6.

## UI 통합(I1) 담당에게 넘기는 위험 순위

1. 게스트 화면은 `BoardView`만으로 그릴 수 없다(S-1). 첫 판 선 고르기에서 바로 막힌다. protocol에 `legal`·`firstPick`·`inFlight`·`goStop` 상세를 먼저 넣고 M3 `adapter.ts`를 지우는 것부터 한다.
2. WsTransport를 Android 중계에 그대로 붙이면 알림마다 `MALFORMED` 거부가 오가고, 4001 교체 루프·죽은 소켓 미복귀가 생긴다(I-3). relay-dev를 Android 규칙으로 고치지 않으면 E2E가 이 문제를 못 잡는다.
3. `HostSession`에는 변경 알림 훅이 없어 호스트 UI가 상태를 폴링해야 하고, 판이 끝나자마자 다음 판이 시작되어 정산 화면이 사라진다(I-5). 판 사이 대기 상태가 UI 흐름의 전제다.
4. 판 사이 핸드셰이크 중 끊기면 영구 정지(S-2), 호스트 앱 재시작 복원 불가(I-4). AC-04 끊김/복귀 E2E에 핸드셰이크 구간 끊김을 넣어야 한다.
5. 난수 주입: 웹에서 `random32`는 `crypto.getRandomValues(new Uint8Array(32))`로 넘긴다(비보안 컨텍스트 가능, `crypto.subtle`·`randomUUID` 금지). 세션 토큰도 같은 `random32`에서 나온다.
6. 긴 세션(약 140 원장 항목)에서 송신 예외로 진행이 멈춘다(I-2). 기내 장시간 플레이 전에 고쳐야 한다.

## 등록한 이슈

- S-1: #12 게스트 BoardView로 선 고르기·폭탄·FR-14를 처리할 수 없음 (bug)
- S-2: #13 판 사이 commit-reveal 중 메시지 유실 시 영구 정지 (bug)
- I-1: #16 commit-reveal 검증이 본 판과 묶이지 않고 재추첨 허용 (security)
- I-2: #23 16KB 초과 시 encode 예외로 세션 정지 (bug, security)
- I-3: #24 WsTransport·relay-dev가 Android 중계 계약과 불일치 (bug)
- I-4: #25 호스트 복원 뒤 게스트 영구 비동기화 (bug)
- I-5: #26 판 사이 대기 없음과 파산·재충전 흐름 결함 (bug)

경미 L-1~L-9는 이슈로 등록하지 않았다. U1 트랙에서 이 문서를 기준으로 처리한다.
