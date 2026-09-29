# #96 재접속 계측 후속 — spec NP-03·NF-05, plan §1.3/1.4

## 재현과 원인 범위

2026-09-29, PR #97에 main `1f26469`를 병합한 뒤 기존 reconnect 테스트에 임시 계측만 추가했다. 게스트 `setInterval(1000)` 콜백 직전, `WebSocket.send()`의 action/hello, Node의 route 수신에서 `Date.now()`와 `performance.now()`를 함께 기록했다. 페이로드·토큰은 아래 기록에서 제외했다. 순차 실행이며 Playwright 재시도는 0이다.

```sh
docker compose run --rm dev npm run e2e -w packages/web -- e2e/reconnect.spec.ts --project=timing-chromium --no-deps --repeat-each=10 --workers=1 --retries=0
```

10회 중 2회 실패(감지 8,198ms / 7,212ms), 8회 성공. 첫 실패의 시각은 다음과 같다. 서로 다른 프로세스의 `performance.now()` 원점은 비교하지 않고 각 프로세스 안에서 차이를 계산한다.

| 관측 지점 | 게스트 Date.now (ms) | 게스트 performance.now (ms) | Node 수신 Date.now (ms) | Node 수신 performance.now (ms) |
|---|---:|---:|---:|---:|
| action 전송 / console 수신 | 1790663396132 | 273 | 1790663396134 | 926.179 |
| clock tick | 1790663398987 | 3128 | 1790663398988 | 3780.515 |
| clock tick | 1790663397524 | 4128 | 1790663397524 | 4780.486 |
| 감지하는 clock tick | 1790663404330 | 5128 | 1790663404331 | 5780.537 |
| hello 전송 / console 수신 | 1790663404331 | 5129 | 1790663404332 | 5781.003 |

route 수신은 action `1790663396134`, hello `1790663404332`였다. 원래 단언은 차이 **8,198ms**로 실패했다. 게스트 단조 시각으로는 **4,856ms**, Node console 수신 간격으로는 **4,854.824ms**다. 마지막 세 tick은 단조 시각으로 1초 간격인데 벽시계는 한 번 뒤로, 다음에는 앞으로 뛰었다. hello 전송→route 수신 차이는 벽시계 기준 1ms다. 따라서 이 재현은 실제 8초 타이머 정체나 route 수신 지연이 아닌 **벽시계 변화에 취약한 측정 및 응답 기한 입력** 문제다. 두 번째 실패에서는 벽시계 전진이 hello를 실제 4초보다 일찍 발생시켰다. Node의 측정만 바꾸면 충분하지 않다.

이는 원인이 기록되지 않은 과거 CI의 8,181ms와 같은 종류의 실패를 재현한 근거다. 과거 실행까지 같은 원인이었다고 확정하지 않는다. 시스템 시각이 바뀐 환경 차원의 원인도 이번 계측만으로 알 수 없다.

## 변경과 한계

- 게스트 페이지 로드 전에 자동 진행하는 Playwright clock을 설치한다. 시스템 벽시계 변화와 독립된 시계로 실제 응답 감시를 실행한다. `pauseAt`·`fastForward`·기한 증가를 쓰지 않는다.
- Node의 요청·hello·snapshot·화면 복구 경과 시간은 `performance.now()`로 측정한다. **감지 4초 이상·6초 미만, 복구 10초 미만** 단언을 유지한다.
- 조작 전에 만든 Promise를 route의 **응답 유실 후 hello**, **그 뒤 snapshot** 이벤트가 해결한다. 초기 hello나 이전 snapshot으로 성공하지 않는다. 전체 테스트의 60초 제한은 그대로이며, UI 복구와 다음 action 전송도 검증한다.
- 제품 파일, 특히 push-settle 소유 guest/host 컨트롤러는 변경하지 않는다. 실제 앱이 시스템 시각 변경에 얼마나 강한지는 별도 제품 검증이다. 이 테스트는 Docker 브라우저 대역 검증이며 실기기 NF-05 충족의 근거가 아니다.

API 근거: [Playwright Clock](https://playwright.dev/docs/api/class-clock#clock-install), [WebSocketRoute 메시지 가로채기](https://playwright.dev/docs/api/class-websocketroute#web-socket-route-on-message). Context7 도구가 제공되지 않아 공식 문서를 조회했다(plan §0.1).

## 검증

동일 명령의 `--repeat-each=20`은 **20 통과·실패 0·재시도 0**이었다. 감지 4,719~4,850ms, snapshot 4,729~4,861ms, 화면 복구 4,752~4,883ms. 전체 게이트 결과는 PR #97 본문에 기록한다. 임시 계측 코드는 제거했으며 이후 실패 진단은 위 네 지점을 같은 방식으로 계측하면 된다. wiring의 두 분배 사례·상태 메시지 대기와 Chromium/WebKit 각 20회 수용 기준은 기존 PR 본문에 별도로 기록한다.

최종 main `f9c38f5`(#86 포함) 병합 후 전체 게이트 재실행: lint·check, Node 491(26파일, 규칙 벡터 227·fast-check 포함), net 9, 브라우저 280(46파일), 웹 빌드 1,036.2 KiB/외부 URL 0, E2E 84 passed/4 skipped, Android assembleDebug·testDebugUnitTest·lint 전부 통과. reconnect 213→229줄, 후속 자체의 테스트 수 변화 0.
