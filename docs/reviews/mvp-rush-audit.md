# MVP 급조 작업 사후 감사 (7c28153 ~ e3d891e)

- 검토일: 2026-09-28 · 검토자: reviewer(코드 수정 없음)
- 범위: PR #1 병합(0ca519b) 뒤 재검토 없이 들어간 수정(5d8095d, 5bd7107, c0aca94), MVP P2P 최소 페이지(`tools/p2p-mini/**`, `packages/web/public/p2p/**`, `packages/web/index.html` 리다이렉트), 급히 넣은 린트 예외, PR #2·#3 병합 위생, M2 범위 축소, 생략된 검증, 릴리스 `v0.1.0-alpha`~`v0.1.2-alpha`
- 근거: AGENTS.md, plan.md §1.1·§1.7·M2~M4·§3-2, spec.md FR-07·FR-18·NF-05·NF-06·MN-03·AC-03·AC-06·AC-09·AC-10, docs/reviews/M0-review.md, PR #1 리뷰 코멘트(S-1, I-1~I-11)
- 등급: **심각** = 출시·데이터·보안을 바로 깨뜨림 / **중요** = 다음 릴리스(v0.2.0, M4 통합) 전에 고쳐야 함 / **경미** = 여유 있을 때

## 1. 판정

**심각 결함 없음. 중요 8건.** PR #1 리뷰 수정은 대부분 맞게 들어갔고 Android 테스트·Lint도 깨끗하다. 문제는 수정 자체보다 **수정이 만든 새 계약이 나머지 코드와 문서에 퍼지지 않은 것**이다.
- Kotlin 중계는 "최신 연결 우선(4001) + `t:relay` 알림"으로 바뀌었다. 그런데 Node 중계, protocol, WsTransport, plan §1.1, spec FR-07은 여전히 "선착순 거절(4409)" 기준이다.
- `GameActivity`가 앱을 열 때마다 "주소만 표시" 서버를 자동으로 띄운다. 그런데 루트 리다이렉트 때문에 APK에서는 솔로 모드에 들어갈 수 없다.
- p2p-mini는 호스트 권위와 입력 검증은 튼튼하다(엔진 `reduce`가 모르는 JSON을 거부한다). 대신 표시·정산 버그와 은닉 정보 유출이 있어서, 사용자가 말한 "규칙 의심"을 일부 설명한다.
- 릴리스는 서명·체크섬·versionCode가 모두 정상이다. 다만 **CI가 실패하거나 취소된 커밋에서 두 번 출시했다**.

## 2. 직접 재현한 수치

| 항목 | 결과 |
|---|---|
| `./dev.sh android:test` (main e3d891e 기준 워크트리) | BUILD SUCCESSFUL, **66 테스트 / 12 스위트, 실패 0**(M4ServerTest 7), Android Lint **No issues found** — PR 코멘트 주장(66개, Lint 0)과 같음 |
| `./dev.sh install` → `lint` → `check` → `test` | oxlint 0/0, oxfmt 통과, svelte-check 0/0, knip 통과, **Vitest 330 통과 / 19 파일** |
| 릴리스 APK 3종 (GitHub CLI로 내려받은 뒤 android 컨테이너의 `aapt2`·`apksigner`로 확인) | v0.1.0-alpha versionCode **31** / v0.1.1-alpha **35** / v0.1.2-alpha **47**(v0.0.2 = 20) → 단조 증가. 세 APK 모두 서명 SHA-256 `c83292d0…5944` = release.yml `EXPECTED_CERT_SHA256`. `.sha256` 자산 3개 모두 `sha256sum -c` OK, 릴리스 로그의 해시와 같음 |
| 릴리스 워크플로 서명 검사 | 세 실행(36406283584, 36406469983, 36407633407) 모두 `V2 Signer: certificate SHA-256 digest: c83292d0…` 출력. 고정 서명자 검사가 **실제로 돌았음** |
| v0.1.1-alpha 태그 재생성 | 첫 실행 36406424853(태그가 837b762를 가리킴)은 업로드 전에 **취소**됨. 재태그 후 c0aca94에서 실행 36406469983이 성공. 노트의 빌드 커밋·자산·체크섬이 서로 일치하고, 이전 태그의 잔여 자산은 없음 |
| main CI(태그 커밋) | 7c28153(v0.1.0) **cancelled**, c0aca94(v0.1.1) **failure**(node 잡 lint, e2e skipped), cc74874(v0.1.2) success |
| v0.1.2 APK 내부 | `assets/web/index.html`에 리다이렉트 스크립트가 있고 `assets/web/p2p/`에 `app.js`·`index.html` 포함. WebView는 `/?role=host`를 열므로 항상 `/p2p`로 간다 |

## 3. 발견 표

| # | 항목 | 발견 (근거) | 등급 | 권고 |
|---|---|---|---|---|
| A-1 | PR #1 수정: 중계 최신 우선(4001) | `SmokeServer.kt:244-265`: 옛 소켓에 `Frame.Close(4001,"replaced")`를 보내고, 교체된 소켓의 늦은 프레임은 `forward`에서 버린다(현재 소켓 ≠ 보낸 소켓). join·leave·forward가 모두 `@Synchronized`이고 알림은 `trySend`라서 I-3 ②(원자성)가 해결됐다. 새로 들어온 쪽에 `present`/`absent`를 보내 I-3 ①도 해결. 테스트: 게스트 교체·present/joined·left·absent는 있다(`M4ServerTest`). **하지만** ① Node `packages/relay-dev/src/index.ts:11,50-53`는 여전히 선착순 4409이고 알림이 없다(plan M4 "Node·Kotlin 동일 시나리오" 미충족). ② protocol `decode`는 `t:'relay'`를 모른다. `HostSession.receive`(`packages/protocol/src/session.ts:280-283`)가 이를 `reject`로 처리한다. ③ `WsTransport`(`packages/web/src/net/ws-transport.ts:91-104`)와 p2p-mini(`main.ts:65-70`)는 **닫기 코드와 상관없이 재접속**한다. 그래서 같은 역할 탭이 둘이면(iPhone에서 QR을 두 번 스캔하면 새 탭이 생긴다) 약 0.5~1초 간격으로 서로를 교체하며 계속 진동한다. ④ 게스트가 보낸 `t:'relay'` 메시지를 중계가 그대로 전달하므로 알림을 위조할 수 있다. ⑤ plan §1.1(42행 "역할 중복 거절")·spec FR-07("추가 접속은 거절")과 어긋난다. 정책이 코드 주석에만 있다. ⑥ 호스트 역할 교체, 64KB 경계, 호스트 이탈 시 게스트 `left` 테스트가 없다(리뷰 §5 미이행) | **중요** | 정책을 plan §1.1·spec FR-07/NF-05/NF-06에 확정한다(최신 우선 + 좌석 판단은 세션 토큰). 닫기 코드와 알림 형식을 `packages/protocol`에 한 번만 정의한다(`RELAY_CLOSE_REPLACED = 4001`, `RelayNotice`). relay-dev도 같게 구현하고, JSON 시나리오 벡터를 Vitest·Kotlin이 함께 돌린다. 4001을 받은 클라이언트는 재접속하지 않고 "다른 탭에서 열림"을 안내한다. 중계는 클라이언트가 보낸 `t:'relay'` 프레임을 버리거나 1008로 닫는다. protocol decode는 relay 알림을 연결 상태로 따로 처리한다 |
| A-2 | PR #1 수정: 호스트 루프백 한정 | `SmokeServer.kt:123`에서 원격 주소가 `127.0.0.1`이 아니면 1008. 테스트는 주입된 주소로 확인(`M4ServerTest` "원격 호스트 역할은 1008"). WebView가 `127.0.0.1`로 접속하므로 IPv6 루프백 누락은 실제 영향이 없다. Origin 검사(같은 폰의 다른 브라우저 탭 차단)는 넣지 않았다 | 경미 | 유지. Origin이 `http://127.0.0.1:17777`인지 검사하고 `::1`을 허용하는 작업을 후속(A1)에 넣는다 |
| A-3 | PR #1 수정: configChanges | `AndroidManifest.xml:40`에 orientation·screenSize·screenLayout·smallestScreenSize·uiMode·fontScale·density·keyboardHidden과 portrait 고정이 들어갔다. S-1(회전·다크 모드) 해소. 리뷰 제안 가운데 keyboard·navigation·locale·layoutDirection은 빠졌다(DeX·물리 키보드 연결·언어 변경 시 재생성 → 판 소실). 이를 확인하는 계측 테스트나 실기기 항목이 없다 | 경미 | 빠진 플래그를 추가한다. M4.md에 "회전·다크 모드·키보드 연결 후 판 유지" 실기기 항목을 둔다 |
| A-4 | PR #1 수정: onRenderProcessGone | `GameActivity.kt:100-105`에서 로그를 남기고 WebView를 파괴·재생성한 뒤 `true`를 돌려준다. 앱 프로세스·FGS·서버는 살아남는다(I-5 해소). 판 상태는 새 WebView에서 사라진다(예상된 동작). 연속으로 죽을 때의 재생성 루프 상한이 없다 | 경미 | 1분 안에 2회를 넘으면 폴백 화면으로 보내는 상한을 둔다. 판 복구는 M4 통합의 원장 저장·복원(plan §3-2 I1)으로 해결한다 |
| A-5 | PR #1 수정: 알림 복귀·singleTask | `HotspotService.kt:122`의 PendingIntent 대상이 `GameActivity`로 바뀌었고 `launchMode="singleTask"`. 게임 화면이 중복으로 뜨던 I-6 경로는 사라졌다. 다만 알림을 눌러도 **QR 화면(MainActivity)으로는 돌아갈 수 없는데**, MVP.md 1-4는 "알림을 눌러 원래 화면으로 돌아가면 QR이 보인다"고 안내한다. `MainActivity.gameLaunched`는 여전히 저장되지 않는다(`MainActivity.kt:224`) | 경미(문서는 A-17) | 유지. `gameLaunched`를 `onSaveInstanceState`에 저장한다 |
| A-6 | PR #1 수정: 브리지 state/null·공유 상한 | `hotspotMessage`에 `addressOnly`와 `JSONObject.NULL`이 들어갔다. 공유는 48KB를 넘으면 파일로 첨부하고 본문은 `clipTail` 48KB로 자른다(I-9 해소). 그러나 web `bridge.ts:9`의 `HotspotState`에 `'addressOnly'`가 없다(I-8의 "web 타입도 같이" 미이행). `keepScreenOn`이 여전히 뒤로 가기 확인(`gameActive`)을 겸한다(I-7 후반 미이행). 공유 경로의 단위 테스트가 없다 | 경미 | M4 통합 때 `bridge.ts` 타입과 `gameActive` 메시지를 분리하고, 공유 크기 결정을 순수 함수로 떼어 테스트한다 |
| A-7 | PR #1 수정: 앱 시작 시 "주소만 표시" 자동 기동 | `MainActivity.render()`는 번들만 있으면 GameActivity를 자동으로 연다. `GameActivity.kt:72-75`는 서비스가 없으면 `ACTION_ADDRESS_ONLY`로 FGS와 **0.0.0.0:17777 서버**를 띄운다. 그 결과 (1) 앱을 열기만 해도 집·카페 Wi-Fi 전체에 서버가 열린다. NF-06이 요구한 "LAN 전체에 열림" 표시가 WebView(p2p 페이지)에는 없다. (2) p2p-mini에는 세션 토큰이 없고 중계는 최신 우선이므로, 같은 LAN의 누구나 `/`로 들어오면 게스트 자리를 빼앗는다. (3) 이 변경의 명분인 "솔로 모드 진입(I-10)"은 루트 리다이렉트(`index.html`, `role=host` → `/p2p`) 때문에 **APK에서 도달할 수 없다**. v0.1.2 태그·릴리스 노트의 "solo mode (M3)"는 APK 사용자에게 사실이 아니다 | **중요** | 솔로는 루프백 전용 바인딩(`127.0.0.1`)으로 서버만 띄우거나, 서비스에 "server-only loopback" 모드를 둔다. LAN 바인딩은 사용자가 핫스팟·주소만 표시를 고를 때만 한다. v0.2.0에서 WebView 진입 URL을 `/`(솔로·로비 선택)로 바꾸고, 호스트 모드에 들어갈 때만 `role=host`를 붙인다. 주소만 표시 상태에서는 웹에 NF-06 경고를 띄운다 |
| A-8 | p2p-mini: 호스트 판 소실 경로 | p2p-mini는 HostBridge를 쓰지 않으므로 `gameActive`가 늘 false다. 그래서 `GameActivity.kt:53-58`의 뒤로 가기는 확인 없이 `finish()`하고, WebView가 파괴되면서 호스트 JS 메모리의 판·잔액이 사라진다. 다시 들어가면 `new Game()`으로 150,000냥부터 새로 시작하고, 게스트에게도 조용히 새 판이 간다. **MVP.md 1-4는 QR을 다시 보려면 뒤로 가기를 누르라고 안내한다** | **중요** | v0.1.x를 v0.2.0 전에 더 쓸 계획이면 p2p 호스트 페이지가 로드될 때 HostBridge로 `keepScreenOn(bool: true)`을 보내게 한다(한 줄). 아니면 MVP.md에서 뒤로 가기 안내를 빼고 "게임 중 뒤로 가기 금지"를 적는다. v0.2.0에서는 게스트가 접속해 있는 동안 네이티브에서도 확인 대화를 띄운다 |
| A-9 | p2p-mini: 규칙 표시·정산 버그(사용자 "규칙 의심"과 관련) | ① `game.ts:59,119`: `PiStolen` 이벤트의 `seat`는 **가져간 쪽**(`capture.ts:73` `seat: to`)인데, 로그는 "호스트 피 뺏김"으로 **반대 의미**를 보여준다. ② `game.ts:120`: 엔진 이벤트는 `cards[]`인데 `card`를 읽으므로 로그에 카드 이름이 한 번도 나오지 않는다(무엇을 먹고 뺏겼는지 알 수 없음). ③ `GoStopPrompt`·`Settled`·`FirstPickTie`가 KO 표에 없어 영어 그대로 보인다. ④ `game.ts:143-152`: 즉시 정산(첫뻑 등)을 **판 종료 때 판 정산 다음에** 반영한다. FR-18("발생 즉시 원장 기록")을 어기며, 판 중 잔액 표시가 바뀌지 않고, 올인 상한도 틀린 순서의 잔액으로 계산한다. ⑤ `game.ts:229`: `pending: st.pending`을 원본 그대로 게스트에게 보낸다. 엔진 `playerView`(`view.ts:130-139`)가 가리는 **상대의 흔들기 후보 카드·월과 총통 월이 유출된다**(화면에는 안 보이지만 wire JSON에 있음). ⑥ 잔액 0(MN-02) 처리가 없다. ⑦ 스톱 예상 금액에 패자 잔액 상한이 없다 | **중요** | v0.1.x를 계속 쓰면 ①②⑤를 먼저 고친다(`seat` 대신 `from`/`to`로 문구 작성, `cards` 사용, `proj`의 `pending`은 `playerView(st, seat).pending`). 즉시 정산은 이벤트를 처리할 때 원장에 반영한다. v0.2.0 통합 PR의 2브라우저 E2E에 "피 뺏기 주체 문구", "즉시 정산 직후 잔액 변화", "상대 흔들기 후보 비노출" 단언을 넣어 정식 UI가 같은 실수를 반복하지 않게 한다 |
| A-10 | p2p-mini: 호스트 권위·입력 처리·재접속 | 좋은 점: 게스트 액션은 `act(1, …)`로 좌석을 강제하고, 엔진 `reduce(state, unknown)`가 모양·합법성을 검사한다(`reduce.ts:71-84`). 렌더는 `textContent`와 숫자 id만 쓰므로 XSS 경로가 없다. 약점: 메시지가 `null`이거나 `action`이 없으면 핸들러에서 TypeError가 난다(상태는 불변이라 무해). 거절 사유를 `log`에 넣을 때 40줄 상한을 거치지 않는다(`game.ts:107`). 그래서 악의적 게스트가 무효 액션을 약 1,000번 보내면 view가 64KB를 넘고, 호스트 소켓이 1009로 끊겨 재접속 루프에 빠질 수 있다. 게스트에는 앱 수준 ping이 없고 소켓이 OPEN으로 보이면 재접속하지 않는다(`main.ts:25`). 그래서 iOS에서 반쯤 죽은 소켓이 남으면 새로고침에 의존한다. 시드는 `Date.now()`이고 commit-reveal이 없다(커밋이 NP-02를 인용했지만 공정성 증명 없음) | 경미 | 은퇴 예정이므로 v0.2.0에 옮길 교훈만 남긴다: 거절 로그 상한, 게스트 25초 ping + 무응답 시 강제 재접속(WsTransport에는 이미 있음), 공정성은 protocol commit-reveal로 |
| A-11 | p2p-mini: 재현·검증 불가 | `public/p2p/app.js`는 esbuild 번들(35,360B, 1줄)인데 esbuild가 lockfile에 없다(vite의 optional peer뿐). 빌드 스크립트도 없어 소스에서 다시 만들 수 없다(AGENTS §1 "표에 없는 의존성" 취지 위반). 대표 문자열로 소스와의 동기는 확인했다. `selftest.ts`는 CI에서 돌지 않는다(`.test.ts`가 아니고 package.json도 없음). `tools/p2p-mini`는 TS 7 `check`와 oxlint 대상에서도 빠진다. 루트 리다이렉트(`index.html` 스크립트)를 확인하는 E2E가 없다 | **중요**(은퇴 계획과 묶음) | 아래 4장 은퇴 체크리스트대로 I1 PR에서 제거한다. 은퇴 전에 p2p-mini를 다시 고쳐야 하면 번들 명령을 `tools/p2p-mini/README`에 한 줄로 남기고, esbuild 대신 저장소의 Vite(rolldown) lib 빌드를 쓴다 |
| A-12 | 급조 린트·포맷 예외 | `.oxlintrc.json:17` `.claude/**`(93a8494, 에이전트 워크트리 복제본 제외. 정당하므로 **유지**), `.oxlintrc.json:18` `tools/p2p-mini/**`(f027828), `knip.json:15` `tools/p2p-mini/**`·`packages/web/public/p2p/**`(71933c3), `packages/web/eslint.config.js:65` `public/p2p/`, `packages/web/.prettierignore` `public/p2p/`(7c28153). ESLint 예외 때문에 **iPhone에 실제로 나가는 유일한 게스트 페이지가 NF-02 금지 API 검사를 받지 않는다**(지금 코드는 금지 API를 쓰지 않음) | 중요(A-11과 같은 이슈) | p2p-mini를 제거하는 PR에서 `.claude/**`만 남기고 나머지 4곳을 되돌린다. 되돌린 뒤 `./dev.sh lint`·`./dev.sh check`가 녹색인지 확인한다 |
| A-13 | PR #2·#3 병합 위생 | lockfile: `npm ci` 성공. 추가 의존성 `zod 4.6.5`(protocol)·`fast-check`(protocol dev)·`@p2p-gostop/engine`(relay-dev dev)·`@p2p-gostop/ai`·`@p2p-gostop/protocol`(web)은 모두 버전 표 안에 있다. 잔여 임시 파일 없음(추가된 파일 40개 모두 산출물). 문서: `docs/ui.md`·`docs/protocol.md` 추가, plan §3-1·§3-2 갱신. 흠: ① `packages/web`의 `test:net` 스크립트와 `src/net/vitest.config.ts`를 `dev.sh`·CI가 호출하지 않는다(단, 브라우저 모드 include `src/**/*.test.ts`에 `ws-transport.node.test.ts`가 걸려 돈다). 중복 설정이다. ② M3 임시 `src/game/adapter.ts`와 protocol `view.ts`(`toBoardView`)가 같은 일을 이중으로 한다(I1에서 정리 예정, docs/ui.md 4장). ③ PR #2 병합 커밋 bdc8192와 PR #3 병합 d99ffb1의 main CI가 **취소**되어 병합 직후 녹색 기록이 없다(뒤 커밋 cc74874·e3d891e는 성공) | 경미 | `test:net`을 지우거나 `dev.sh`에 연결한다. I1에서 어댑터를 하나로 합친다. main push에서는 CI concurrency의 `cancel-in-progress`를 끈다 |
| A-14 | M2 범위 축소 정직성 | `docs/ai-tuning.md:8`은 "AI-04(P0) 미완"을 명시한다. plan M2는 "조건부 완료, 61.4%/79.1%, M6 재도전"이라고 적는다. `docs/money-model.md`는 "표준만 산정, 3,000판(요구 ≥10,000), 정통·아케이드 준용"을 머리말과 6절에 정직하게 적었다. 그러나 ① spec §9 AC-03·AC-10과 §8 MN-03에는 상태 표시가 없고, plan M2 "완료 기준: AC-03, AC-10 통과"(168행)가 그대로 남아 있어, 문서만 보면 M2가 통과한 것처럼 읽힌다. ② `money-defaults.ts`의 정통·아케이드 항목이 표준의 `bankruptcyRisk: 0.0451`을 그대로 복사한다. `Settings.svelte:83` 도움말은 프리셋과 상관없이 "파산 확률 5% 이하가 되도록 산정"이라고 말한다. 그런데 정통 실측은 80,000이 적정이고(money-model 5절), 아케이드는 더 위험할 것으로 문서가 스스로 추정한다 | 경미 | spec AC-03·AC-10·MN-03 행 끝에 "(2026-09-28 부분 충족: 61.4%/79.1%, 표준 3,000판 — M6 재도전)"를 적는다. plan M2 완료 기준 옆에 "미충족 → M6 이월"을 적는다. 준용 프리셋은 `bankruptcyRisk: null`로 두고, 도움말은 `basis`가 `standardFallback`이면 "표준값 준용(재산정 예정)"을 보여준다 |
| A-15 | 생략된 검증: AC-06 | `solo.spec.ts:110-129`는 턴 시간을 **기록만** 한다(단언 없음). PR #2 본문에 따르면 GitHub CI WebKit이 p50 693ms·최대 836ms로 700ms를 넘는다. 계획 상한 `TURN_PLAN_MS = 500`(`choreo.ts:32`)을 확인하는 단위 테스트도 없다(`display.test.ts`는 이벤트 보존만 확인). 결국 AC-06을 강제하는 자동 검사가 하나도 없다. 그런데 커밋 f0f0df0 제목에는 "(AC-05, AC-06)"이 붙어 있다 | **중요** | 결정적인 단위 테스트를 추가한다: 무작위 합법 수 N판의 모든 턴에서 `planSteps` 합계 ≤ 500ms(빠름)이고 압축 후에도 ≤ 700ms. E2E에는 느슨한 상한(p50 ≤ 900ms)을 둔다. spec AC-06 행에 "CI WebKit 벽시계 미충족, 계획 상한으로 대체"를 적는다 |
| A-16 | 생략된 검증: 실기기·진동 | M0.md 회차 2(B·C회차, 캡티브 시트 여부, 잠금 복귀)는 미실시다(회차 기록 142행 "회차 2로", 156행 "사용자 회신 대기"). 기내 MVP 플레이(AC-09 성격)는 결과 로그가 `docs/device-test/`에 없다. 진동은 NF-02 린트 때문에 생략했고 브리지 메서드가 없다(plan §3-2 A1에 있음, 적절) | 중요(A-17과 같은 이슈) | 기내 플레이 결과(빌드, 판 수, 끊김, 발견 버그)를 `docs/device-test/MVP.md` 회차 기록으로 남긴다. M0 회차 2의 캡티브 시트·잠금 복귀는 v0.2.0 M5 회차에 합쳐 확인한다 |
| A-17 | MVP.md 정확성 | `docs/device-test/MVP.md`는 v0.1.0-alpha 기준인데 최신은 v0.1.2다. v0.1.1부터 동작이 달라졌다: ① 1-1 "앱을 열면 네이티브 첫 화면이 보인다" → 실제로는 GameActivity가 바로 열리고 주소만 표시 서버가 뜬다(A-7). ② 1-4 "잠시 후 게임 화면으로 자동으로 넘어간다" → `gameLaunched`가 이미 true라서 넘어가지 않고 "게임" 버튼을 눌러야 한다. ③ "알림을 누르면 QR 화면" → GameActivity로 간다(A-5). ④ "뒤로 가기로 QR 보기" → 판이 사라진다(A-8). ⑤ 5절 "두 번째 게스트는 거절" → 최신 우선이라 **기존 게스트가 밀려난다**. ⑥ 문제 해결의 `192.168.x.x` → 핫스팟 IP 실측값은 `10.252.x.x`(M0 회차 1). ⑦ 솔로 모드가 APK에서 불가하다는 사실이 빠져 있다. 릴리스 노트 3개 모두 절차서로 **M0.md를 링크**한다(M0.md의 "연결 성공" 페이지는 이제 `/smoke`) | **중요** | MVP.md를 v0.1.2 실제 동작으로 고친다(앱 열기 → 뒤로 가기로 QR 화면 → 핫스팟 시작 → "게임" 버튼. 게임 중에는 뒤로 가기·알림 대신 최근 앱 전환으로 QR을 본다. 두 번째 접속은 기존 게스트를 밀어낸다). release.yml 노트 템플릿이 태그별 절차서(MVP.md, 이후 M4/M5.md)를 링크하게 한다 |
| A-18 | 릴리스 위생 | versionCode·서명·체크섬은 정상(2장). 그러나 ① release.yml은 Android 단위 테스트만 돌리고, JS lint/test/e2e도 "해당 커밋 CI 녹색" 조건도 확인하지 않는다. 그래서 **v0.1.0은 CI 취소 커밋(7c28153), v0.1.1은 CI 실패 커밋(c0aca94)**에서 출시됐다. ② 알파인데 `prerelease: false`라서 v0.1.2가 "Latest"로 표시된다. ③ v0.1.0은 PR #1 수정 전(회전 시 판 소실 S-1 포함) 빌드인데 노트에 경고가 없다. ④ versionCode는 커밋 수(`rev-list --count HEAD`)라서, main 밖이나 이력을 재작성한 커밋에서 태그하면 역행하거나 충돌할 수 있다(지금은 "main 이력 위" 검사가 막음) | **중요** | release 잡 앞에 CI 성공 확인 단계를 둔다(GitHub API로 이 커밋 SHA의 ci.yml 실행 결론을 조회해 success가 아니면 실패). 또는 `workflow_call`로 ci.yml을 `needs`로 연결한다. `-alpha`/`-beta` 태그는 `prerelease: true`로 한다. v0.1.0 노트에 "PR #1 수정 전, v0.1.2 사용 권장"을 덧붙인다 |

## 4. p2p-mini 은퇴 계획 (plan §3-2 I1 PR의 체크리스트)

**보존할 동작** (I1 PR이 E2E로 증명할 것)
1. iPhone이 URL QR(`http://<IP>:17777/`)로 들어오면 **추가 조작 없이 게스트 화면**이 뜬다(지금은 루프백이 아니면 `/p2p/index.html?role=guest`로 보낸다). 정식 UI에서는 앱 내부 라우팅으로 대체한다: `location.hostname`이 루프백이 아니면 게스트 모드로 들어간다. Playwright에서 LAN을 흉내 낸 호스트명으로 접속해 게스트 진입을 단언한다.
2. 호스트 WebView(`/?role=host`)는 호스트 모드로 진입한다. 동시에 솔로·로비 선택이 가능해야 한다(A-7).
3. 게스트 화면 잠금 복귀 시 자동 재접속과 전체 스냅샷 재동기화. p2p-mini는 매 액션마다 전체 view를 보내므로 사실상 항상 재동기화된다. 정식 UI에서는 protocol `snapshot`으로 대체한다.
4. 한 판 종료 후 양쪽 어디서나 "다음 판" 가능.
5. 이전 설치 위에 덮어쓰기 설치(같은 서명, versionCode 증가)가 가능해야 한다. 북마크된 `/p2p/index.html` 경로는 `/`로 보내는 한 줄 리다이렉트를 한 릴리스 동안 남긴다.

**제거할 것**: `tools/p2p-mini/`, `packages/web/public/p2p/`, `packages/web/index.html`의 MVP 리다이렉트 스크립트, `.oxlintrc.json`의 `tools/p2p-mini/**`, `knip.json`의 `ignore` 두 항목, `packages/web/eslint.config.js`의 `public/p2p/`, `packages/web/.prettierignore`의 `public/p2p/`. **유지할 것**: `.oxlintrc.json`의 `.claude/**`.

**정식 UI가 p2p-mini의 버그를 반복하지 않도록 넣을 단언**: A-9 ①②④⑤, A-1 ③(4001이면 재접속하지 않음), A-10(게스트 25초 ping).

## 5. 권장 정리 순서

1. **릴리스 게이트와 문서부터**(A-18, A-17): 사용자가 지금 v0.1.2를 쓰고 있다. CI 녹색 확인 단계와 prerelease 설정을 넣고, MVP.md를 정정한다(특히 "뒤로 가기" 안내 삭제).
2. **v0.2.0 전까지 v0.1.x를 더 쓸 경우에만** p2p-mini 긴급 수정 3건: `gameActive` 브리지 한 줄(A-8), `PiStolen`·카드 이름 문구(A-9 ①②), `playerView` pending(A-9 ⑤). 더 쓰지 않으면 건너뛰고 3으로 간다.
3. **중계 계약 확정**(A-1): plan §1.1·spec FR-07 문구 → protocol에 닫기 코드·알림 정의 → relay-dev 동일화 + 공통 시나리오 벡터 → WsTransport 4001 처리. I1(M4 통합)의 선행 조건이다.
4. **서버 수명·진입 설계**(A-7): 솔로는 루프백 전용으로 두고, LAN 바인딩은 사용자가 명시적으로 고를 때만 NF-06 경고와 함께 연다. WebView 진입 URL도 다시 설계한다.
5. **I1 통합 PR**에서 4장 체크리스트대로 p2p-mini와 린트 예외를 제거한다(A-11, A-12).
6. **검증 보강**: AC-06 결정적 테스트(A-15), spec/plan 상태 표시(A-14), MVP 기내 회차 기록, M0 회차 2 항목을 M5 회차에 합치기(A-16).
7. 경미: A-2~A-6, A-10, A-13은 Android 후속(A1)과 I1에 나눠 싣는다.

## 6. 등록한 이슈

중요 항목을 `[rush]` 접두어로 GitHub 이슈에 등록했다. 번호는 아래에 적는다.

| 이슈 | 감사 항목 |
|---|---|
| #15 중계 계약 불일치 | A-1 |
| #17 주소만 표시 자동 기동·솔로 도달 불가 | A-7 |
| #18 p2p-mini 판 소실·규칙 표시·정산·은닉 유출 | A-8, A-9 |
| #19 p2p-mini 은퇴 체크리스트·린트 예외 제거 | A-11, A-12 |
| #20 AC-06 강제 테스트 부재 | A-15 |
| #21 MVP.md 부정확·실기기 기록 누락 | A-16, A-17 |
| #22 릴리스 게이트 | A-18 |
