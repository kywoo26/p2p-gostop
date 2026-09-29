# M4 호스트·게스트 프로토콜

근거: `spec.md` NP-01~NP-09, FR-07·FR-14, MN-01/02/05, NF-05/06 및 `plan.md` 1.1·M4. 이 문서는 `packages/protocol`(v2)과 `packages/relay-dev`, `packages/web/src/net`의 동작을 적는다. M4 리뷰(`docs/reviews/M4-protocol-review.md`)와 MVP 감사 A-1의 수정 라운드(#12·#13·#15·#16·#23~#26)를 반영했다.

전송은 로컬 `ws://<호스트>:17777/ws?role=host|guest`이고 JSON 텍스트 프레임만 쓴다. 모든 수신은 `decode`(zod/mini)로 검사하고, 검사를 통과한 **파싱 결과**(모르는 필드 제거)만 세션에 들어간다. 현재 `PROTOCOL_VERSION = 2`다(v1과 호환되지 않는다: 원장 요약, BoardView 상세 필드, 판 사이 대기).

## 1. 중계 계약 (Android `SmokeServer` RelayRoles = `relay-dev`)

| 규칙 | 동작 |
|---|---|
| 역할 | `role=host`·`role=guest` 소켓을 역할마다 하나. 역할이 없거나 잘못되면 1008 |
| 최신 우선 | 같은 역할이 다시 붙으면 **이전 소켓을 4001 `replaced`로 닫는다**. 교체된 소켓에서 늦게 도착한 프레임은 버린다. 좌석(진짜 게스트인지) 판단은 중계가 아니라 세션 토큰으로 한다 |
| 알림 | `{"t":"relay","peer":"present\|absent\|joined\|left"}`. 새로 붙은 쪽에 present(상대 있음)·absent(없음), 상대에게 joined, 끊기면 상대에게 left. 교체는 left를 보내지 않는다(joined만). 상대가 없을 때 보낸 프레임은 버리고 보낸 쪽에 absent를 한 번만 알린다 |
| 알림 위조 | 클라이언트가 보낸 relay 모양 프레임(`t` 또는 옛 `type`이 `relay`, 256자 이하 JSON)은 전달하지 않는다. `decode`도 relay 프레임을 메시지로 받지 않는다(MALFORMED). 세션은 메시지 경로로 들어온 relay 프레임을 거부 응답 없이 버린다 |
| 크기·형식 | 텍스트만(바이너리 1003). 프레임 64KB(65,536바이트) 초과 1009 |
| 호스트 | 호스트 역할은 루프백(127.0.0.1, ::1)에서만. 아니면 1008 |

닫힘 코드와 알림 형식은 `packages/protocol/src/relay.ts`에 한 번만 정의한다(`RELAY_CLOSE_REPLACED=4001`, `RELAY_CLOSE_POLICY=1008`, `RELAY_CLOSE_UNSUPPORTED=1003`, `RELAY_CLOSE_TOO_LARGE=1009`, `RelayNotice`, `parseRelayNotice`, `isRelayFrame`, `encodeRelayNotice`). 중계 규칙 시나리오 표는 `packages/relay-dev/test/relay-scenarios.json`이다(RELAY-01~09). Kotlin `M4ServerTest`가 같은 표를 읽도록 옮기는 일과 Android 중계의 relay 모양 프레임 차단은 Android 후속(A1)에 남는다.

## 2. 전송 정책 (`WsTransport`, `packages/web/src/net`)

- 중계 알림은 `onMessage`로 넘기지 않는다. `onRelay(notice)`와 `onConnection(event)`(`{type:'peer', socket, peer}`)으로 알린다.
- 연결 사건 `ConnectionEvent`: `connecting`·`open`·`peer`·`close{code, reason, retryInMs}`·`stopped{reason}`·`pongTimeout`·`dropped`. 모두 소켓 번호(`socket#n`)를 단다. 옛 소켓의 사건은 무시한다.
- 닫힘 코드:
  - **4001** → 자동 재접속하지 않고 `stopped('replaced')`. 화면 복귀도 되살리지 않는다(두 탭이 서로 밀어내는 진동 방지). 사용자 조작 `reconnect()`로만 다시 연다. UI는 "다른 창에서 접속 중"을 보인다.
  - **1008·1003·1009** → 대기열을 비워 같은 내용을 다시 보내지 않고 백오프 재접속. 1008이 3번 이어지면 `stopped('policy')`.
  - 그 밖 → 지수 백오프 재접속(0.5초 → 30초 상한).
- 하트비트: 게스트만 25초 ping(NP-05). 받은 프레임 없이 ping이 2번 지나면(pong 시간 초과) 소켓이 열려 보여도 새 소켓을 연다.
- 화면 복귀(`visibilitychange`·`pageshow`): 닫혀 있으면 곧바로 재접속. 열려 보이면 ping으로 확인하고 4초 안에 아무 프레임도 없으면 새 소켓(NF-05 5초 복귀).
- 송신은 `tryEncode`로 상한을 먼저 검사하고 예외를 던지지 않는다. 연결 대기 중에는 `hello`를 마지막 것 하나만, `ping`은 쌓지 않는다.

## 3. 메시지 (v2)

| 방향 | `t` | 필드 | 의미 |
|---|---|---|---|
| 게스트→호스트 | `hello` | `v,name,sessionToken?,lastSeq?,epoch?` | 최초 접속·토큰 재접속·마지막 수신 순번. 이름은 제어 문자 금지 |
| 호스트→게스트 | `welcome` | `v,seat,sessionToken,rules,ledger,names,epoch,seq,status` | 좌석 1, 원장 **요약**, 호스트 세대(epoch)·현재 순번, 단계 |
| 호스트→게스트 | `snapshot` | `seq,view,ledger,settlement?,status` | 완전한 게스트 화면(BoardView) |
| 호스트→게스트 | `events` | `from,to,list,view,ledger,settlement?,status` | 연속 이벤트(가림 적용)와 적용 뒤 화면 |
| 호스트→게스트 | `status` | `seq,status` | 화면은 그대로이고 단계·준비·파산 상태만 바뀜 |
| 게스트→호스트 | `action` | `seq,payload` | 보낸 시점의 마지막 수신 순번과 엔진 액션(여분 필드는 지워진다) |
| 게스트→호스트 | `push` | `seq` | settled에서 승자 게스트의 밀기 선택. 호스트는 `legalActions`로 재검사한다 |
| 호스트→게스트 | `reject` | `seq,reason,message` | 거부. `reason`은 아래 코드만 |
| 게스트→호스트 | `ping` / 호스트→게스트 `pong` | 없음 | 하트비트 |
| 게스트→호스트 | `log` | `entries[]` | 진단 로그(64KB, 줄당 2KB) |
| 호스트→게스트 | `commitHost` | `round,hash` | 호스트 32바이트 난수의 SHA-256 |
| 게스트→호스트 | `commitGuest` | `round,hash` | 게스트 32바이트 난수의 SHA-256 |
| 호스트→게스트 | `revealGuestRequest` | `round,guestHash` | 분배 직전 게스트 원문 요청 |
| 호스트→게스트 | `roundAborted` | `round,reason` | 3분 이상 게스트 부재 뒤 호스트가 진행 중인 판을 무효로 한 알림 |
| 게스트→호스트 | `revealGuest` | `round,secret` | 게스트 원문(64자리 소문자 hex) |
| 호스트→게스트 | `revealHost` | `round,secret,guestSecret,seed,actions,hostHash,guestHash,options,firstSeq` | 판 종료 후 호스트 원문과 재현 입력. `options`의 덱 고정(`deck`·`pickPools`)은 지운다 |
| 게스트→호스트 | `ready` | `round` | settled에서 다음 판 요청(시작은 호스트) |
| 호스트→게스트 | `bankruptcyPrompt` | `balances,round,seats` | 잔액 0인 좌석(`seats`)이 재충전·종료를 고른다 |
| 게스트→호스트 | `bankruptcy` | `choice` | 게스트 좌석(1)이 파산했을 때만 유효 |
| 호스트→게스트 | `sessionEnd` | `reason,seat` | 파산 종료 선택(`bankruptcy`) 또는 호스트 종료(`host`) |
| 게스트→호스트 | `ledgerGet` | `from` | 원장 전체 이력 요청(ledger.get) |
| 호스트→게스트 | `ledgerPage` | `from,total,entries` | 원장 이력 한 쪽(64KB 이하) |

`status`(`RoundStatus`)는 `{rev, stage, round, carry?, ready:[호스트, 게스트], bankrupt: Seat[], endReason}`이다. `carry`는 나가리 뒤 다음 판에 적용할 이월 배수다. `rev`는 단계·준비·파산이 바뀔 때마다 1씩 늘고, 게스트는 더 작은 `rev`를 무시한다(순서 바뀜 대비).

### BoardView (#12)

게스트는 엔진 `PlayerView`를 받지 않고 `BoardView`만 받는다. `BoardView = BoardViewCore + BoardViewDetail`이며 M3 솔로 어댑터(`BoardView` + `BoardExtras` + `InFlight`)의 상위 집합이다. 계산은 `packages/protocol/src/view.ts`의 `toBoardView`가 단일 근거다.

| 필드 | 뜻 |
|---|---|
| `legal: Action[]` | 보는 좌석의 합법 수(엔진 `playerView(state, 1).legal`). 게스트 UI는 이 안에서만 액션을 만들고 호스트가 다시 검사한다. 상대 합법 수·상대 비공개 프롬프트는 들어가지 않는다 |
| `firstPick: {poolSize, taken} \| null` | 선 고르기(R4)에서 내가 고를 차례면 후보 장수와 상대가 이미 고른 자리 |
| `inFlight: {played, staged}` | 대상 고르기 중 아직 바닥에 놓이지 않은 낸 패·뒤집은 패·들고 있는 보너스(모두 공개된 카드) |
| `goStop: {points, steps, multiplier, money, capped} \| null` | 내 고/스톱 프롬프트의 스톱 미리보기(FR-14, 엔진 `stopPreview`, 원장 상한 적용) |
| `bombMonths`, `canFlipOnly` | 폭탄 가능한 월, 폭탄패 뒤집기 가능 여부(`legal`에서 파생) |
| `dealer`, `phase` | 선, 엔진 판 단계(`chooseFirst`·`turn`·`end`) |
| `multiplier` | 스톱 미리보기가 있으면 그 배수, 아니면 **보는 좌석**의 흔들기·폭탄·3고부터의 고·나가리 이월·대박판의 곱(M3 `currentMultiplier`와 같다) |
| `pushes`, `seats[*].gukjinAsPi`, `bombs`, `revealed` | 연속 밀기 횟수, 국진 위치, 폭탄 횟수, 이미 공개되어 손에 남은 카드. 상대 손패는 계속 `null`; `revealed`만 양쪽에 보인다 |

정산 화면 `SettlementView`의 `balances[].before`는 판 시작 전(즉시 정산 전) 잔액, `amount`는 그 판 round 항목의 실제 이동 금액(나가리면 0)이다.
`SettlementView.gukjinAsPi`는 승자·패자 각각 정산에 사용한 국진 위치다. `pushed`, `forfeitedPoints`, `nextPushes`와 `steps[].origin: 'push'`도 전달한다. 밀기를 하면 `Pushed` 뒤 두 번째 `Settled`가 나오며 **마지막 `Settled`만 유효**하다.

## 4. 순서

```text
게스트                              호스트
  hello(v, token?, lastSeq?) →
                               ← welcome(token, rules, ledger 요약, epoch, seq, status)
                               [lobby: autoStart면 곧바로, 아니면 호스트 start()]
                               ← status(handshake) · commitHost(round, H(hostSecret))
  commitGuest(round, H(guestSecret)) →
                               ← revealGuestRequest(round, H(guestSecret))
  revealGuest(round, guestSecret) →
                               [seed = SHA-256(hostSecret || guestSecret) 앞 128비트]
                               [newRound → 좌석 1 가린 뷰]
                               ← events(playing)
  action(lastSeq, payload) →
                               [legalActions 검사 → reduce → 즉시 정산 원장 반영]
                               ← events/snapshot 또는 reject
                               [판 종료 → settle → 원장 반영 → settled(또는 bankrupt)]
                               ← snapshot(settlement, status=settled)
                               ← revealHost(..., firstSeq)
  [replay 대조 → verified/failed]
  ready(round) →               (요청만)
                               ← status(ready=[false,true])
                               [호스트 nextRound() → 다음 판 handshake]
```

- 판이 끝나면 **settled에서 멈춘다**(#26). 정산 화면(`settlement`)은 다음 판이 실제로 분배될 때까지 모든 snapshot·events에 실린다. 게스트 `requestNextRound()`는 요청일 뿐이고 다음 판은 호스트 `nextRound()`로 시작한다.
- `rules.push`가 켜지고 승자에게 합법 `push`가 있으면 settled에서 정산을 잠시 보류한다. 호스트 승자는 `host.push()`, 게스트 승자는 `guest.push()`로 민다. 호스트 승자가 받으면 `host.acceptRound()`(또는 `nextRound()`), 게스트 승자가 받으면 `ready`가 보류한 정산을 확정한다. 게스트 승자가 선택하기 전에는 호스트 `nextRound()`가 거부된다. 다만 게스트가 3분 이상 부재하면 호스트가 `acceptRound({forSeat: 1, reason: 'absent'})`로 대신 받을 수 있다. 밀면 포기한 점수만 기록하고 판돈 이동은 없으며 `nextPushes`를 다음 판 `RoundOptions.pushes`에 넘긴다. `revealHost`의 액션 열에는 push도 들어가고 게스트는 마지막 정산과 리플레이를 대조한다. 밀기 보류 중 저장·복원해도 정산은 계속 보류되며, 세션 종료 시에는 보류 판을 먼저 받아 원장과 `revealHost`를 확정한 뒤 `sessionEnd`를 보낸다.
- 게스트가 3분 이상 없고 현재 엔진 단계가 `turn`이면 호스트가 `abortRound(reason)`으로 판을 무효로 할 수 있다. 이미 지급된 즉시 정산은 유지하고 판 정산·나가리 이월·선은 그대로 둔다. 무효 판의 스냅샷은 `legal`·`playable`을 비워 입력을 막는다. `roundAborted`를 보내 양쪽을 settled 대기로 옮기며, 게스트 검증은 `aborted`로 기록한다. 재접속 때(세션이 이미 ended여도) 무효 알림을 `sessionEnd`보다 먼저 다시 보낸다.
- 파산: 판 정산 뒤 잔액이 0인 좌석이 있으면 bankrupt 단계. 그 좌석이 고른다(호스트 좌석은 `host.chooseBankruptcy(choice)`, 게스트 좌석은 `bankruptcy` 메시지. 남의 좌석 선택은 `BANKRUPT` 거부). **재충전은 파산한 좌석만** 시작 잔액으로 되돌리고 `recharge` 원장 항목을 남긴다(상대 잔액 유지). 제로섬 대조는 "잔액 합 = 시작 잔액 × 2 + 재충전 합"(`ledgerDelta`로 항목 합 = 잔액 − 시작 잔액). 종료를 고르면 ended와 `sessionEnd`. 프롬프트는 재접속 때 다시 보낸다.

## 5. 핸드셰이크 복구 (#13)

중계는 상대가 없으면 프레임을 버리므로 판 사이 핸드셰이크 도중 끊기면 메시지가 사라진다. 모든 처리를 멱등으로 두고, 재접속 `hello`에 호스트가 빠졌을 수 있는 것을 **모두 다시** 보낸다.

| 호스트 단계 | 재접속 hello에 다시 보내는 것 |
|---|---|
| lobby | welcome만(autoStart면 첫 판 시작) |
| handshake | 직전 판 snapshot(없으면 status), 직전 판 revealHost 또는 roundAborted, commitHost, (게스트 커밋을 받았으면) revealGuestRequest |
| playing | lastSeq 뒤 차분 events(현재 판 안, 40개·16KB 이하) 또는 snapshot |
| settled·bankrupt·ended | snapshot, 그 판 revealHost 또는 roundAborted, bankruptcyPrompt(bankrupt), sessionEnd(ended) |

- 게스트: 같은 판·같은 해시의 `commitHost`를 다시 받으면 **저장해 둔 같은 `commitGuest`**를 다시 보낸다(새 난수 금지). 같은 해시의 `revealGuestRequest`에는 같은 원문을 다시 보낸다. 지난 판 메시지는 무시한다.
- 호스트: 분배 전이면 게스트가 다른 해시로 다시 커밋해도 받아 준다(새로고침으로 원문을 잃은 경우. 호스트 원문은 아직 비밀이라 안전). 분배 뒤 들어온 지난 핸드셰이크 메시지는 무시한다.
- 토큰: 게스트가 토큰을 받았음이 확인되기 전(welcome 뒤에만 보낼 수 있는 메시지나 토큰 실은 hello를 받기 전)에는 토큰 없는 hello를 다시 받아 준다(welcome 유실 복구). 확인 뒤에는 토큰 없는 hello를 거절한다(NF-06). 게스트는 welcome 전에는 판 메시지에 응답하지 않는다.
- **소켓 인증(재검토 중요 2, #40)**: 호스트는 지금 게스트 소켓이 인증됐는지(`host.authenticated`)를 따로 든다. 중계 알림 joined·left와 전송 끊김에서 false로 되돌리고(absent는 되돌리지 않는다: Android 중계는 프레임 하나를 전달하지 못했을 때도 보낸 쪽에 absent를 보내는데 그때 게스트 소켓은 그대로다. absent는 `host.peer`·`connected`에만 기록한다), 그 소켓에서 hello를 받아들이면(토큰이 생긴 뒤에는 토큰 hello만) true가 된다. false인 동안에는 `hello`·`ping`만 처리하고 나머지(action·ready·bankruptcy·ledgerGet·log·잘못된 메시지)는 **응답 없이 버린다**(STALE_SEQ 거부나 스냅샷도 보내지 않는다. 버전 불일치 hello만 안내). 그래서 최신 우선 중계에서 LAN의 다른 기기가 진짜 게스트를 4001로 밀어내도 손패가 든 스냅샷을 받거나 게스트 좌석으로 둘 수 없다. 알림이 없는 전송(메모리)은 끊김 알림이 없으므로 첫 hello 뒤 계속 인증 상태다.
- **게스트 outbox**: 게스트는 지금 소켓에서 welcome을 받기 전(끊김·present·joined·left 뒤, absent는 제외)에 만든 요청(action·ready·bankruptcy·ledgerGet)을 보내지 않고 들고 있다가 welcome과 첫 재동기화 프레임을 받은 뒤에 보낸다(로비에서는 welcome 직후, 액션은 마지막 것 하나). 인증 전 소켓에서 말없이 버려지지 않게 하기 위해서다.
- **응답 감시(#40)**: 게스트는 보낸 요청마다 호스트 응답을 기다린다. action의 응답은 요청 순번 이상의 events·snapshot(이벤트가 없는 합법 수는 같은 순번의 snapshot) 또는 같은 순번의 reject, ready·bankruptcy는 요청 당시보다 새 상태 rev, ledgerGet은 같은 from의 ledgerPage로 확인한다. welcome 뒤에는 재동기화 프레임을 먼저 적용하고 outbox 요청을 보낸다. 따라서 재동기화로 먼저 받은 snapshot·status나 이전 순번의 STALE_SEQ는 새 요청의 감시를 지우지 않는다. `ackTimeoutMs`(기본 5초) 안에 응답이 없으면 ping에는 답하지만 요청을 버리는 호스트(인증을 잃은 소켓 등)로 보고 hello를 다시 보내 인증한 뒤 요청을 다시 보낸다. hello 또는 welcome이 유실되면 `advanceTime`이 hello를 5초부터 지수 백오프(최대 30초)로 재시도한다. 호스트가 이미 적용했다면 다시 보낸 액션은 STALE_SEQ로 무해하게 거부된다. 호스트는 무시하는 ready에도 status로 답한다. 시각은 외부 시계가 넣는다: 게스트 UI는 `guest.advanceTime(Date.now())`를 주기적으로(예: 1초) 부른다(호스트의 `advanceTime`과 같은 방식, 세션에는 타이머가 없다).
- 검증: `session.test.ts`가 판 1·2에서 commitHost·commitGuest·revealGuestRequest·revealGuest를 하나씩 떨어뜨리는 표 테스트와 fast-check 속성 테스트(120회, 로컬 1,500회 확인)를 돌린다. 전송 모형: 게스트→호스트 프레임은 아무렇게나 유실·중복·순서 바꿈, 호스트→게스트는 WebSocket처럼 한 소켓 안에서 순서가 지켜지고(유실은 재접속으로만) 중복은 나중에 한 번 더 도착한다.

## 6. commit-reveal 검증 (#16, NP-06 v0.5)

호스트 원문은 **판 종료 후** 공개한다(먼저 공개하면 게스트가 덱을 계산할 수 있다). 게스트는 판마다 다음을 기록하고(`ObservedRound`, 요약은 SHA-256 앞 64비트) `revealHost`가 오면 `checkRound`로 대조한다.

1. 양측 원문 해시가 커밋과 같고, 시드가 `combineSeed(host, guest)`와 같다.
2. `options.roundNumber`가 판 번호와 같다(덱 고정 옵션은 decode에서 지워진다).
3. 리플레이가 `end`로 끝난다.
4. 리플레이의 좌석 1 액션이 게스트가 **실제로 보낸 액션의 부분열**이다(호스트가 게스트 수를 지어낼 수 없다). 판을 하나도 보지 못했다면 "보낸 것 없음"으로 대조한다.
5. 게스트가 받은 이벤트(순번별)가 `firstSeq`부터 매긴 리플레이 이벤트(좌석 1 가림)와 같다.
6. 게스트가 받은 뷰의 카드 배치·점수·배수·선(순번별)이 그 순번의 리플레이 상태와 같다.
7. 받은 정산의 승패·사유·최종 점수·배수 단계가 리플레이 `settle`과 같다.

- 원문을 공개한 판에 다른 해시의 `commitHost`가 오면 응답하지 않고 `COMMIT_INVALID`(재추첨 방지).
- **revealHost 누락(재검토 중요 1)**: 원문을 공개한 판의 결과(검사)가 없는데 더 큰 판의 `commitHost`가 오거나 `sessionEnd`가 오면 그 판을 `failed{missingReveal}`로 기록하고 그 `commitHost`에 응답하지 않는다. 정상 호스트는 판 종료 때와 재접속 resync에서 늘 `revealHost`를 다음 `commitHost`보다 먼저 보낸다. 판 무효는 `roundAborted`를 먼저 보내며 이 판은 `aborted{reason}`으로 판정한다. 뒤늦은 `revealHost`로 판정을 되돌리지 않는다. 세션 도중 호스트가 판을 끝내지 않고 종료해도 같은 실패다.
- **판 번호**: 직전 커밋 판 + 1만 받는다. 더 크게 뛴 `commitHost`는 그 판 번호로 `failed{roundSkip}`을 기록하고 응답하지 않는다(위조 커밋의 기록이라, 그 번호의 판이 나중에 정상으로 진행되면 따로 검증한다).
- 결과는 `guest.checks`(`verified`·`aborted{reason}`·`unverifiable{noCommitment}`·`failed{reason}`)와 `verifiedRounds`. 실패면 `errors`에 `COMMIT_INVALID`.
- 게스트 새로고침: `guest.toJSON()`(토큰·순번·세대·최근 두 판의 커밋·관찰)을 탭 수명 저장소(`sessionStorage`, 비보안 컨텍스트에서도 동작)에 두고 `new GuestSession(..., { restore })`로 이어 가면 그 판도 검증된다. 저장본이 없으면 그 판은 `unverifiable`이고 거짓 `COMMIT_INVALID`를 내지 않는다. `sendAction`은 보내기 전에 `onChange`를 부르므로 저장본의 `sent`가 실제보다 적지 않다.
- UI 통합(I1) 체크리스트:
  - `checks`의 `failed`를 정산 화면에 "공정성 검증 실패"(이유 `missingReveal`·`roundSkip`·`events` 등)로, `unverifiable`을 "검증 불가(새로고침)"로 표시한다.
  - **게스트 UI는 `guest.onChange`에서 `toJSON()`을 동기로 저장해야 한다**(예: `sessionStorage.setItem(k, JSON.stringify(g.toJSON()))`를 콜백 안에서 바로). `sendAction`은 보내기 직전에 `onChange`를 부르므로 동기 저장이면 저장본의 `sent`가 실제로 보낸 액션보다 적을 수 없다. 비동기로 미루면 새로고침 타이밍에 따라 `sent`가 빠져 정상 판이 `actions`로 거짓 실패할 수 있다.

## 7. 순번·재동기화·호스트 복원 (#25)

- 순번은 세션 전체에서 1씩 늘며 판이 바뀌어도 이어진다. 게스트는 `events.from`이 `lastSeq+1`인지 검사하고, 어긋나면 토큰·`lastSeq`로 다시 hello한다. `reject STALE_SEQ`에는 다시 hello하지 않는다(호스트가 곧바로 스냅샷을 보낸다).
- 호스트 저장: `host.onChange(h => save(JSON.stringify(h.toJSON())))`. `toJSON()`은 순번·판 번호·선·이월·원장·토큰·단계·파산·게스트 확인·진행 중 판의 비밀(호스트·게스트 원문, 액션 열, `firstSeq`, 판 시작 잔액)·직전 `revealHost`를 담는다.
- 복원: `HostSession.fromJSON(transport, data, { random32 })`. 진행 중 판은 시드+액션 리플레이로 다시 만든다(이벤트 버퍼 포함). 저장본이 깨졌으면 `Error`를 던진다(호출자가 새 세션으로 시작).
- 세대(`epoch`)는 생성·복원마다 새로 뽑아 welcome에 싣는다. 게스트는 세대가 바뀌었고 welcome의 `seq`가 자기 순번보다 작으면 호스트가 되감긴 것으로 보고 그 순번을 따른다. 되감긴 구간의 관찰은 버리고 그 전 관찰은 유지하므로 그 판도 검증된다.
- 호스트가 저장 없이 새로 시작했으면 토큰이 달라 `TOKEN_INVALID`(`guest.connection = 'tokenRejected'`). UI는 `guest.joinFresh()`로 새 게스트로 들어간다.
- 60초 무응답: 호스트 UI가 `advanceTime(nowMs)`를 부르면 `connected=false`. 중계 알림 left·absent도 `connected=false`로 바꾼다.

## 8. 크기와 로그 (#23)

- 중계 프레임 상한 **64KB UTF-8**(초과 1009).
- 게임 메시지 **16KB UTF-8**(NP-07). `log`·`ledgerPage`만 64KB.
- 원장은 게임 메시지에 **요약**만 싣는다: `LedgerSummary{perPoint, startBalance, balances, recent(최근 8개), entryCount, recharged}`. 전체 이력은 `guest.requestLedgerHistory(from)` → `ledgerPage`(쪽당 56KB 이하) → `guest.ledgerHistory`. 원장 500항목 세션에서도 모든 게임 메시지가 16KB 이하임을 테스트한다.
- `encode`는 상한을 넘으면 `RangeError`(테스트·도구용). 세션과 전송은 `tryEncode`만 쓰고 예외를 던지지 않는다. 차분 events가 크면 snapshot, snapshot도 못 보내면 status로 물러나고 `host.diagnostics`에 남긴다. 전송 `send`가 던져도 세션 밖으로 나가지 않는다.
- `decode`는 파싱 결과를 돌려준다: 게스트 액션·hello의 여분 필드는 지워져 호스트 상태·`revealHost`에 들어가지 않는다. 엔진 이벤트만 느슨한 객체(종류별 필드 보존)다.
- 로그: 줄마다 2KB, 게스트가 코드포인트 경계에서 자르고 60KB 단위로 나누어 보낸다. 호스트의 게스트 로그는 별도 256KB 버퍼(누적 바이트로 관리)다.

## 9. 거부 코드

| 코드 | 의미 |
|---|---|
| `MALFORMED` | JSON·스키마·순번 구조가 잘못됨, relay 모양 프레임 |
| `TOO_LARGE` | 메시지 또는 로그 줄 바이트 상한 초과 |
| `VERSION_MISMATCH` | 버전 불일치(스키마보다 먼저 판정). 게스트는 새로고침, 호스트는 앱 업데이트 안내 |
| `TOKEN_INVALID` | 세션 토큰 불일치, 또는 확인된 게스트가 있는데 토큰 없는 hello |
| `STALE_SEQ` | 액션 기준 순번이 오래됨. 스냅샷으로 재동기화 |
| `ILLEGAL_ACTION` | `legalActions`에 없는 수 또는 게스트 아닌 좌석 |
| `COMMIT_INVALID` | 커밋·원문·시드가 맞지 않음, 게스트 쪽 검증 실패·재추첨 의심 |
| `ROUND_NOT_READY` | 판 분배·액션 시점이 아님 |
| `BANKRUPT` | 파산 선택을 기다리지 않거나 그 좌석의 선택이 아님 |

## 10. 테스트 위치

- `packages/protocol/test/m4.test.ts`: 계약 벡터(`vectors/wire.json` 36개), SHA-256 NIST·경계 벡터, 동기 메모리 전송 20판(게스트는 자기 `BoardView.legal`만으로 선 고르기부터 진행).
- `packages/protocol/test/view.test.ts`: BoardView 상세 필드 속성 테스트(합법 수·선 고르기·폭탄·고스톱·배수·inFlight·가림).
- `packages/protocol/test/session.test.ts`: 핸드셰이크 복구·fast-check 혼돈, 재추첨·조작 수열·새로고침, revealHost 누락·판 건너뛰기 fast-check, 소켓 인증, 원장 500항목·여분 필드·송신 예외, 호스트 저장·복원, 판 사이 대기·나가리·파산.
- `packages/relay-dev/test/relay.test.ts` + `relay-scenarios.json`: 중계 규칙 시나리오.
- `packages/relay-dev/test/session-relay.test.ts`: 실제 ws 중계 20판(판 중간 끊김, 핸드셰이크 중 끊김, 게스트 탭 교체 4001 + 저장본 복원, 호스트 재시작 복원), 낯선 소켓의 최신 우선 탈취 시도(응답·상태 변화 없음).
- `packages/web/src/net/ws-transport.node.test.ts`: `npm run test:net -w packages/web`(Node)와 브라우저 모드에서 WsTransport 정책 + 가짜 Android 중계 위 세션 한 판.

실기기 검증은 Android와 iPhone Safari 통합 단계(M5)에서 진행한다.
