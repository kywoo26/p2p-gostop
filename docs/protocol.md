# M4 호스트·게스트 프로토콜

근거: `spec.md` NP-01~NP-09, MN-01/02/05, FR-14 및 `plan.md` M4. 전송은 로컬 `ws://<호스트>:17777/ws?role=host|guest`이고 JSON 텍스트만 쓴다. 중계는 역할별 소켓 한 개씩만 받고 내용을 해석하지 않는다. 모든 입력은 `zod/mini`로 검사한 뒤 세션에 전달한다. 현재 `PROTOCOL_VERSION = 1`이다.

## 메시지

| 방향 | `t` | 필드 | 의미 |
|---|---|---|---|
| 게스트→호스트 | `hello` | `v,name,sessionToken?,lastSeq?` | 최초 접속·토큰 재접속·마지막 수신 순번 |
| 호스트→게스트 | `welcome` | `v,seat,sessionToken,rules,ledger,names` | 좌석 1과 권위 원장·규칙 |
| 호스트→게스트 | `snapshot` | `seq,view,ledger,settlement?` | 완전한 게스트용 화면 상태 |
| 호스트→게스트 | `events` | `from,to,list,view,ledger,settlement?` | 연속 이벤트와 적용 뒤의 최종 뷰 |
| 게스트→호스트 | `action` | `seq,payload` | 보낸 시점의 마지막 수신 순번과 엔진 액션 |
| 호스트→게스트 | `reject` | `seq,reason,message` | 형식·순번·규칙 위반 |
| 게스트→호스트 | `ping` | 없음 | 25초 하트비트 |
| 호스트→게스트 | `pong` | 없음 | 하트비트 응답 |
| 게스트→호스트 | `log` | `entries[]` | 진단 로그 전송 |
| 호스트→게스트 | `commitHost` | `round,hash` | 호스트 32바이트 난수의 SHA-256 |
| 게스트→호스트 | `commitGuest` | `round,hash` | 게스트 32바이트 난수의 SHA-256 |
| 호스트→게스트 | `revealGuestRequest` | `round,guestHash` | 분배 직전 게스트 원문 요청 |
| 게스트→호스트 | `revealGuest` | `round,secret` | 게스트 원문 32바이트(64자리 소문자 hex) |
| 호스트→게스트 | `revealHost` | `round,secret,guestSecret,seed,actions,hostHash,guestHash,options` | 판 종료 후 호스트 원문과 재현 입력 |
| 호스트→게스트 | `bankruptcyPrompt` | `balances` | 잔액 0 발생 시 재충전·종료 선택 |
| 게스트→호스트 | `bankruptcy` | `choice` | `recharge` 또는 `end` |

`view`는 상대 손패·더미 순서·PRNG·비공개 프롬프트를 제거한 엔진 `playerView(state,1,{ledger})`를 `toBoardView`로 변환한 것이다. 이벤트도 `redactEvent(event,1)`을 거친다. `settlement`는 점수 행, 정산 단계, 정산 전후 잔액을 담은 `SettlementView`다. 좌석 0 화면은 호스트가 `hostView()`로 직접 얻는다. `ledger.entries`가 판별·즉시 정산 이력을 유지한다. 호스트 앱은 이 원장과 토큰·판 번호·선·이월 배수를 로컬 저장소에 보관해 복원할 수 있다(MN-05). 게스트 영속 저장은 전제하지 않는다.

## 순서

```text
게스트                         호스트
  hello(v, token?, lastSeq?) →
                         ← welcome(token, rules, ledger)
                         ← snapshot(seq) 또는 events(from..to)
                         ← commitHost(round, H(hostSecret))
  commitGuest(round, H(guestSecret)) →
                         ← revealGuestRequest(round)
  revealGuest(round, guestSecret) →
                         [seed = SHA-256(hostSecret || guestSecret)의 앞 128비트]
                         [newRound → 양측 가린 뷰]
                         ← events/snapshot
  action(lastSeq, payload) →
                         [legalActions 검사 → reduce → 원장 반영]
                         ← events/snapshot 또는 reject
                         [판 종료 → settle/applySettlement]
                         ← snapshot(settlement)
                         ← revealHost(hostSecret, seed, actions, options)
  [커밋·시드 확인 → replay]      [다음 판 commitHost]
```

호스트 원문은 **판 종료 후** 공개한다. 먼저 공개하면 게스트가 시드로 호스트 손패와 더미 순서를 계산할 수 있다(NP-06 v0.5). `verifyRound`는 양측 원문 해시, 시드, 엔진 `replay`가 정상 종료함을 검사한다. 화면에 공개된 결과와 리플레이 이벤트의 일치 검사·부정 판정 UX는 UI 통합 시 연결해야 한다.

## 순번과 재접속

순번은 세션 전체에서 1씩 늘며 판이 바뀌어도 이어진다. 호스트는 엔진 이벤트의 판별 순번을 세션 순번으로 매핑하고 모든 이벤트를 같은 순서로 보관한다. 게스트는 수신한 `events.from`이 `lastSeq+1`이고 `to=from+list.length-1`인지 검사한다. 어긋나면 토큰과 `lastSeq`로 다시 `hello`를 보낸다. 호스트는 연속 기록이 있고 40개 이하이며 직렬화한 차분이 16KB 이하이면 `events`를 보낸다. 그 밖에는 3KB 안팎의 완전한 `snapshot`을 우선한다. 빈 이벤트 액션은 스냅샷으로 최종 상태를 맞춘다. 토큰이 맞지 않으면 거절한다. 게스트 소켓이 끊겨도 호스트 엔진은 남는다. 호스트는 외부 시계로 `advanceTime(nowMs)`를 호출해 60초 무응답을 연결 끊김으로 표시한다.

## 크기와 로그

- 중계의 절대 프레임 상한: **64KB UTF-8**. 초과하면 소켓을 코드 1009로 닫는다.
- 일반 게임 메시지: **16KB UTF-8** 목표·검증(NP-07). 차분이 크면 스냅샷을 보낸다.
- `log`만 64KB까지 허용. 줄마다 **2KB UTF-8**. 게스트가 코드포인트 경계에서 자르고 나누어 보낸다.
- 호스트의 게스트 로그는 별도 **256KB** 버퍼이며 호스트 진단 로그를 밀어내지 않는다.

## 거부 코드

| 코드 | 의미 |
|---|---|
| `MALFORMED` | JSON·스키마·순번 구조가 잘못됨 |
| `TOO_LARGE` | 메시지 또는 로그 줄 바이트 상한 초과 |
| `VERSION_MISMATCH` | 버전 불일치. 게스트는 페이지 새로고침, 호스트는 앱 업데이트 안내 |
| `TOKEN_INVALID` | 세션 토큰 불일치 |
| `STALE_SEQ` | 액션 기준 순번이 오래됨. 스냅샷으로 재동기화 |
| `ILLEGAL_ACTION` | `legalActions`에 없는 수 또는 게스트 아닌 좌석 |
| `COMMIT_INVALID` | 커밋·원문·시드가 맞지 않음 |
| `ROUND_NOT_READY` | 판 분배·액션 시점이 아님 |
| `BANKRUPT` | 파산 선택을 기다리지 않거나 잘못된 선택 |

실기기 검증은 Android와 iPhone Safari 통합 단계에서 진행한다. 현재 `packages/relay-dev`의 실제 `ws` 두 클라이언트 테스트가 20판·끊김·토큰 복귀를 검증한다.
