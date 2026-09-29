# 웹 UI 구조 (M3 혼자 연습 + M4 친구와 대전)

작성: 2026-09-28 · 갱신: 2026-09-29(I1 M4 통합) · 대상: `packages/web` · 근거: spec 2.1~2.5·6장·FR-01~07·FR-10~24·FR-30~33·MN-01~06·NP-01~09·AI-05, plan.md 1.6·1.7·M3·M4

## 1. 화면 지도

역할은 주소로 정한다(`src/p2p/role.ts`): **루프백 origin**(Android WebView `http://127.0.0.1:17777/`, 개발 브라우저)은 호스트 앱(아래 해시 라우팅), **루프백이 아닌 origin**(iPhone이 QR로 연 `http://<핫스팟 IP>:17777/`)은 조작 없이 게스트 화면. `?role=host|guest`는 E2E·개발용 덮어쓰기, `?relay=host:port`는 개발 중계 주소(`docker compose run --rm -p 17777:17777 dev npm run start -w packages/relay-dev`)다.

### 1.1 호스트 앱 (해시 라우팅, `src/App.svelte`)

| 경로 | 화면 | 파일 | 비고 |
|---|---|---|---|
| `#/` | 홈 | `routes/Home.svelte` | 친구와 대전 / 혼자 연습 / 기록 / 설정 / 진단, 저장된 세션이 있으면 "이어하기" |
| `#/solo` | 난이도 선택 | `routes/SoloSetup.svelte` | 쉬움·보통·상용급, 규칙·금액 요약 |
| `#/game` | 게임판 + 정산 | `routes/Game.svelte` → `ui/Board.svelte`, `routes/Settlement.svelte` | 정산은 게임판 위 전체 화면 덮개(게임판은 계속 마운트) |
| `#/records` | 기록 | `routes/Records.svelte` | 현재(또는 마지막) 세션의 판별 결과·합계 |
| `#/settings` | 설정 | `routes/Settings.svelte` | 프리셋, 점당 금액(시작 잔액 자동 제안), 속도, 효과음 |
| `#/diagnostics` | 진단·로그 | `routes/Diagnostics.svelte` | 인앱 로그, 전체 선택 텍스트 영역(Clipboard API 없음) |
| `#/license` | 라이선스 | `routes/License.svelte` | |
| `#/versus` | 방 열기 | `routes/Versus.svelte` → `routes/HostRoom.svelte` | 핫스팟(브리지)·Wi-Fi QR(`T:WPA`)·주소 QR(`uqr`)·3단계 안내·접속자·규칙·점당·시작 잔액·시작/이어하기. LAN 노출 경고(NF-06) |
| `#/match` | 친구와 대전 게임판 + 정산 | `routes/Game.svelte`(HostGame) | 게스트 끊김 안내, 3분 대기 선택지(spec 2.4) |
| `#/dev/gallery/*` | 개발 갤러리 | `routes/dev/gallery/Gallery.svelte` | 스크린샷·axe 대상 |

쿼리 `?speed=instant`는 저장하지 않는 즉시 모드(`--dur-scale: 0`)다. E2E 자동 플레이가 쓴다.

### 1.2 게스트 화면 (`routes/GuestApp.svelte`, 해시 라우팅 없음)

이름 입력 → 대기실(양쪽 이름·규칙·점당·시작 잔액, FR-05) → 게임판(`routes/Game.svelte`, GuestGame) → 정산(셔플 검증 결과 표시) → 다음 판 요청. URL 프래그먼트 `#g=<토큰>&n=<이름>`이 세션 토큰 자리라서 게스트는 해시 라우팅을 쓰지 않는다. 진단·로그는 화면 안의 상태로 연다(호스트로 로그 보내기, NP-09). 연결 안내: "인터넷 없이 사용", 자동 잠금 끄기(홈 화면 추가는 권하지 않는다, spec 2.2).

### 1.3 게임 화면 공통 (`routes/Game.svelte`)

솔로·호스트·게스트가 같은 게임판(`ui/Board.svelte`)과 정산(`routes/Settlement.svelte`)을 쓴다. 오른쪽 위 ☰ 메뉴(이슈 #10): 계속하기 / 설정 / 홈으로 / (진단·로그) / 세션 종료(한 번 더 눌러 확인). Android에서는 게임 중 브리지 `gameActive{true}`·`keepScreenOn{true}`를 보내 뒤로 가기가 확인 창이 되고 화면이 켜진 채 유지된다. 게임 루트의 `data-*`(testid `solo`/`match`, `data-round`·`data-rounds-played`·`data-balances`·`data-refilled`·`data-seq`·`data-can-act`·`data-play-timings`)는 E2E가 읽는다.

## 2. 상태와 애니메이션

```
사람 탭 ─▶ Board.onaction(action) ─▶ SoloSession.submit ─▶ session.ts sessionAct (engine reduce + 원장)
                                                           │ 저장(localStorage, MN-05)
                                                           ▼
                                        큐: { events, 목표 BoardView } ─▶ anim/choreo.ts replay
                                                           │   단계마다: 측정 → display.ts applyEvent 커밋(tick) → FLIP
                                                           ▼
                                        최신 뷰로 스냅(spec 6.4) ─▶ 큐가 비면 CPU 차례? ─▶ Web Worker(ai.worker.ts)
```

- **순수 층**: `game/session.ts`(솔로 세션 = GameState + Ledger + 기록, 다음 판 선·나가리 이월·재충전, 밀기로 두 번 나오는 Settled는 마지막 것을 쓴다), `game/display.ts`(이벤트 재생 리듀서), `game/adapter.ts`(protocol `toBoardView`/`toSettlementView` 위에 M3 표시값만 더함: 좌석 국진 위치·폭탄 횟수, 정산 국진 위치).
- **재생 큐**: `game/playback.svelte.ts`의 `Playback`(runes 클래스). 가린 이벤트 묶음 + 그 뒤의 권위 `BoardView`를 받아 `choreo.ts`로 재생하고 스냅한다. 판이 끝난 묶음(정산 포함)을 재생하면 정산 화면을 띄우고 `release()`까지 다음 묶음(다음 판 분배)을 멈춘다. 배너·토스트(1.6초 × 속도 배율 뒤 사라짐, 새 판에 지움 — 이슈 #6)·효과음·진동(브리지)·AC-06 시간(판 끝 대기 전에 잰다)도 여기서.
- **컨트롤러**: `game/controller.ts`의 `GameController`(playback·canAct·thinking·bankrupt·notice·settlementNote·stats, submit·nextRound·refill·end·attach·skipAnimations)를 세 모드가 구현한다.
  - `game/solo.svelte.ts` `SoloSession`: 엔진 + CPU(Worker) + localStorage 저장.
  - `p2p/host.svelte.ts` `HostGame`: protocol `HostSession`(v2). 로비에서는 게스트 hello가 오면 그 이름으로 세션(autoStart:false)을 만들고, 규칙·금액을 바꾸면 같은 토큰으로 다시 만들어 welcome을 새로 보낸다. 게스트로 나가는 `events`를 전송 층에서 지켜보며 같은 액션을 엔진 `reduce`로 다시 계산해 좌석 0으로 가린 묶음을 재생한다(분배는 보낸 목록). `settled`/`bankrupt`가 되면 정산 화면, "다음 판"은 `HostSession.nextRound()`. `toJSON()`을 매번 localStorage(`gostop.host.v2`)에 두고 이어하기는 `fromJSON`(진행 중인 판까지, MN-05).
  - `p2p/guest.svelte.ts` `GuestGame`: protocol `GuestSession`(v2). 받은 `events`/`snapshot`을 그대로 재생 큐에 넣고, 액션은 `view.legal` 안에서만 만든다. 토큰·이름은 URL 프래그먼트, `toJSON()`은 sessionStorage(새로고침 뒤에도 셔플 검증). "다음 판"은 `requestNextRound()`(시작은 호스트), 토큰 거절이면 `joinFresh()`.
- **전송**: `src/net` `WsTransport`(v2: 중계 알림 `onRelay`, 연결 사건 `onConnection`, 4001 교체면 자동 재접속 멈춤, 25초 ping·pong 시간 초과, 화면 복귀 확인). `p2p/link.ts`가 연결 사건을 화면 상태(connecting·open·closed·replaced·stopped)로 줄인다. 호스트는 5초 시계로 `advanceTime`(60초 무응답, NP-05)을 부르고 3분 넘게 끊기면 계속 기다릴지 묻는다(spec 2.4).
- **브리지**: `bridge/bridge.ts`(plan.md 1.7 HostBridge 계약). `p2p/hotspot.svelte.ts`가 핫스팟 상태·NF-06 경고를 앱 전체에 보인다.
- **애니메이션**: `anim/choreo.ts`가 이벤트 묶음을 단계(낸 패 120 → 뒤집기 140 → 매칭 80 → 획득 160+30 스태거, 뺏기 200 병렬)로 나누고, 카드가 어디서 어디로 갔는지로 시간을 고른다. 계획 합이 500ms를 넘으면 비율로 줄인다(느린 기기의 프레임 지연 여유를 둔 700ms 예산). 판을 탭하면 `--dur-scale: 0` + `finishAll`로 건너뛴다.
- **검증**: `game/display.test.ts`가 무작위 합법 수 80여 판에서 매 액션 "이전 뷰 + 가려진 이벤트 재생 = 새 뷰"(카드 배치)를 확인한다. 그래서 스냅은 누락 대비 안전망이고 평소에는 튀지 않는다.
- **CPU**: `game/ai-client.ts`가 Worker를 만들고, 실패·무응답(시간 제한 + 5초)이면 메인 스레드 인라인(시간 제한 300ms 상한)으로 넘어간다. CPU 뷰는 `playerView(state, 1)`만 넘긴다(AI-01).

## 3. 계측 (AC-06)

탭(click `timeStamp`) → 그 액션의 이벤트 재생·스냅 완료까지를 `SoloSession.timings`에 남기고 진단 로그에 쓴다. 게임 루트 `data-play-timings`로 E2E가 읽는다. 2026-09-28 도커 e2e 이미지(빠름): Chromium p50 568~571ms·최대 596ms, WebKit p50 578~635ms·최대 599~737ms(12개 병렬 실행 부하에서 1회 초과). E2E는 지금 기록만 한다(2코어 CI 러너의 WebKit은 p50 660ms·최대 849ms까지 흔들렸다). 계획 상한을 540 → 500ms로 낮춰 여유를 늘렸다.

## 4. M4 통합 메모 (I1)

- 게임판 뷰의 단일 근거는 protocol `toBoardView`다(BoardView 상세 필드 `legal`·`firstPick`·`inFlight`·`goStop`·`bombMonths`·`canFlipOnly`·`dealer`·`phase`). 전환기 별칭 `BoardViewCore & Partial<BoardViewDetail>`은 지웠다. 게임판(`Board.svelte`)은 아직 `extras` 입력을 따로 받으므로 `Game.svelte`가 BoardView 필드로 모아 넘긴다.
- 게스트 좌석에는 국진 위치·폭탄 횟수(M3 S-2 표시값)와 정산 국진 위치가 아직 없다(protocol SeatView·SettlementView에 없음). 게스트 화면은 없는 값으로 그린다: protocol 후속에서 더하면 곧바로 쓰인다.
- 판 무효(spec 2.4 "대기 계속 / 판 무효 / 세션 종료" 중 가운데)는 protocol에 API가 없어 미룬다. 3분 선택지는 계속 기다리기·세션 종료 둘이다.
- 게스트 "준비" 토글(FR-06)은 판 사이 `ready`(다음 판 요청)로만 있고 로비 준비 토글은 없다.

## 5. 알려진 빈틈 (미룬 것)

- 진동: Android 브리지 `vibrate`로 뻑·쪽·따닥·쓸·고·스톱·폭탄·흔들기에 짧은 패턴(설정 `vibration`). iPhone은 없음(`navigator.vibrate` 금지). 설정 화면 스위치는 M6.
- 24개 개별 규칙 토글(FR-21), 화폐 단위 선택, CPU 생각 시간 설정 UI: M6. (저장 값과 기본값은 있다)
- 효과음은 Web Audio 합성 최소판(자체 제작). 음색 다듬기는 M6.
- 리플레이 내보내기(FR-33): 세션에 액션 열은 저장하지만 내보내기 UI는 M6.
- 보너스 카드 두 번째 시안(plan §9): 미제작.
- 친구와 대전 기록 화면: 호스트가 판별 기록을 저장하지만 기록 화면(`#/records`)은 아직 솔로 세션만 보인다.
