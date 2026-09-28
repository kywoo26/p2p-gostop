# M3 사후 리뷰 — 혼자 연습(웹 UI) · PR #2

- 검토일: 2026-09-28 · 대상: `main` @ `59de1d9` (PR #2 `feat(web): M3 solo mode`는 리뷰 없이 병합됨)
- 근거: AGENTS.md, spec.md §2.3·§2.5·§3.2(FR-10~19)·§3.3·§4.3~4.5·§6 전체·§7 AI-05·§8·§10 AC-04~07, plan.md M3·3-2(R1), docs/rules-vectors.md(뷰 가림 규칙·해석), docs/ui.md
- 범위: `packages/web/src/{game,anim,ui,routes,workers,settings,storage}/**`, `packages/web/e2e/**`, `packages/web/fixtures/**`. 엔진 자체는 M1 리뷰 범위라 여기서는 UI가 엔진을 어떻게 쓰는지만 봤다.
- 계기(사용자, 기내 알파 플레이): "규칙이 다 잘 적용됐는지 의심스럽고, 잔버그가 있고, UI/UX가 많이 부족하다"

심각도: **심각** = 플레이 불가·되돌릴 수 없는 오조작·잘못된 기준 확정 / **중요** = M4 통합(I1)·U1 수정 라운드 전에 고칠 것 / **경미** = 여유 있을 때

## 0. 직접 재현한 수치 (`./dev.sh`, 도커)

| 항목 | PR #2 주장 | 재현 (main @ 59de1d9) | 판단 |
|---|---|---|---|
| `./dev.sh test:browser` | 114 통과 | **118 통과** (20파일, Chromium+WebKit, 2.23s) | 일치. 늘어난 4개는 PR #3의 `ws-transport.node.test.ts` 2×2 |
| `./dev.sh e2e` | 44 통과 | **44 통과** (19.9s) | 일치 |
| `./dev.sh build:web` | 865 KiB / 1.5 MiB, 외부 URL 0 | **902.3 KiB / 1536 KiB**(63파일), 외부 URL 0 | 일치. 늘어난 34.5 KiB는 main의 `p2p/app.js`(tools/p2p-mini) |
| AC-06 탭→턴 종료(빠름) | Chromium p50 568~571·최대 596, WebKit p50 578~635·최대 599 | **Chromium n=7 p50 380·최대 547, WebKit n=5 p50 440·최대 562** | 700ms 예산 안. 단 E2E는 기록만 하고 단언하지 않으며 표본이 한 판(n=5~7)뿐 |

`display.test.ts`는 8시드 × 10판(+세션 모델 12판) 동안 매 액션마다 "이전 뷰 + 가려진 이벤트 재생 = 새 뷰"(손패·획득패·바닥·더미·뒤집기 자리)를 비교하고, 아케이드·국진 묻기·2장 폭탄 규칙도 돈다. **이벤트→화면 리듀서가 엔진 뷰와 어긋나는 경우는 이 범위에서 찾지 못했다**(3장).

## 1. 판정

**M3 완료 인정 보류(조건부).** 엔진 연결·원장·이어하기·Worker는 탄탄하고, UI가 엔진의 규칙 판단을 대신하지 않는다(모든 입력은 `legalActions`에서 나온 액션이고 거부는 엔진이 한다). **"규칙이 틀리게 적용된다"는 증거는 찾지 못했다.** 사용자가 느낀 의심은 규칙 오류보다 **표시 부족**(누가 뻑·뺏기를 했는지 안 보임, 사라지지 않는 토스트, 국진이 쌍피로 옮겨 가도 획득패 칸 숫자가 그대로인 문제, 정렬 안 된 손패, 뻑 횟수·상대 족보 미표시)에서 오는 것으로 본다.

고쳐야 할 것: 심각 2건(S-1, S-2), 중요 6건(I-1~I-6). S-1·S-2와 I-3은 M4 게스트(iPhone Safari)가 같은 `Board`를 쓰기 전에 반드시 고친다.

## 2. 규칙 표시 완전성 (차원 1)

| 엔진 pending / 액션 | UI | 한국어 라벨 | 막힘(버튼 없는 프롬프트) 가능성 | 비고 |
|---|---|---|---|---|
| `pickFirst` / `pickFirst{index}` | `PickFirstPrompt` (Board.svelte:218-223) | "선 고르기 · 한 장을 고르세요" | 없음: `extras.pickFirst`는 내 legal에 pickFirst가 있을 때만(adapter.ts:154-163) | 동월 재선택은 토스트 "같은 월: 다시 고릅니다" |
| `chongtong` / end·continue | `ChoicePrompt` "총통!" 끝내기·계속하기 (Board.svelte:271-281) | 적절 | 없음 | 끝내기 점수(10점)를 문구에 안 씀(경미) |
| `play` / `play` | 손패 탭 (Hand.svelte) | aria "N월 X 내기 (먹을 수 있음)" | 없음 | 손패 미정렬(I-2) |
| `play` / `bomb` | 폭탄 월 카드를 탭하면 "폭탄? 폭탄/한 장만/취소" (Board.svelte:92-99, 224-241) | 적절 | 없음 | E9·E10 모두 `extras.bombMonths`(legal 기반) |
| `play` / `flipOnly` | "폭탄패로 뒤집기" 버튼 (Board.svelte:209-216) | 적절 | 없음 | 버튼이 격자 7번째 행으로 들어가 바닥이 위로 밀림(경미) |
| `shake` / accept·decline | "흔들까요? 흔들기/그냥 내기" (Board.svelte:260-270) | 적절 | 없음 | 엔진이 E11 조건일 때만 pending shake를 만든다 → UI는 조건을 다시 판단하지 않음(올바름) |
| `target` / `chooseTarget` | `TargetModal` 2장 (Board.svelte:242-248) | "어느 패를 먹을까요? 낸 패/뒤집은 패" | 없음 | 대기 중 낸 패는 그 월 무더기 위, 뒤집은 패는 뒤집기 자리(adapter.ts:185-203) — 재생과 같은 자리 |
| `gukjin` / asPi | `ChoicePrompt` 열끗·쌍피 (Board.svelte:282-291) | 적절 | 없음 | **설정 UI가 없어 실제로는 도달 불가**(L-1, FR-15) |
| `goStop` / go·stop | `GoStopModal` (Board.svelte:249-259) | "N고 / 스톱" | 없음 | 스톱 금액 = `stopPreview.money`(원장 상한, adapter.ts:109, solo.svelte.ts:183) 확인, 배수 체인·상대 점수·피·"(상대 잔액까지)" 확인 |

- 모든 pending 종류에 버튼이 있고, 각 버튼은 legal 액션 하나로 대응한다. 다만 **이를 보장하는 테스트는 target·goStop·play 3종뿐**이다(I-6).
- 국진: 기본 자동(`gukjin: 'auto'`, current.svelte.ts:18) — spec RL-S5 기본값과 일치. 묻기 모드는 저장 필드(`settings.gukjinAsk`)만 있고 화면이 없다(L-1).
- 총통(분배 직후): 분배 애니메이션 뒤 프롬프트. 상대 좌석 총통은 뷰 가림 규칙대로 `pending.seat`가 상대라 내 화면에 프롬프트가 없다(올바름).
- 마지막 턴 예외: 엔진이 이벤트를 내지 않으므로 배너도 없다(올바름).
- 나가리·이월: 정산 머리말 "나가리 · 다음 판 ×2"(Settlement.svelte:32-36), 다음 판 게임판의 "배수 ×2"(adapter.ts:87).
- 즉시 정산: 토스트 "나 첫뻑 즉시 정산 +7점"(solo.svelte.ts:464-469) + 정산 화면 "즉시 정산" 절. 단 토스트가 사라지지 않는다(I-1).
- 고 횟수·배수: 좌석 막대 "고 N"·"배수 ×N"(Board.svelte:182-189), 고 배너 "N고".

## 3. 표시 정확성 (차원 2)

- `display.ts`의 이벤트별 처리는 엔진 이벤트 계약(rules-vectors.md "뷰 가림 규칙")과 맞다: 상대 `CardDrawn`은 `cards: []` → 장수만 +1(display.ts:102-111), 흔들기 거절·총통 계속은 이벤트가 없으므로 화면 변화도 없다.
- 뻑 무더기: `Ppeok`에서 그 월 무더기를 통째로 `kind: 'ppeok', owner`로 바꾼다(display.ts:126-138). 뒤집기 자리의 보너스도 같이 묻힌다.
- 보너스: 손패 보너스는 뒤집기 자리 → `Captured`로 획득패, 보충 카드는 내 손패 끝에 붙음(엔진 `hand.push`와 같은 순서).
- 어긋날 수 있는 지점(스냅이 덮으므로 최종 화면은 맞고, 재생 중에만 잠깐 다름): 점수·진행도는 `ScoreChanged` 시점의 획득패로 계산되어 같은 묶음 뒤쪽 `PiStolen` 반영 전 값이 잠깐 보인다. 배수는 스냅 때만 갱신된다. 실제 해는 없다.
- 획득패 그룹: 국진을 쌍피로 세는 경우에도 `CapturedPile`은 국진을 열끗 칸에 두고 피 칸 숫자에서 뺀다(CapturedPile.svelte:24) — 좌석 막대 "피 n/10"(adapter.ts:77, +2 포함)·엔진 `score.piCount`와 숫자가 다르다(**S-2**, 5.1장).
- 정산 점수 분해: `scoreCaptured(captured, settlement.gukjinAsPi[winner])` 행 합 = `base` 단계 값(engine settle.ts:56)과 같다.

## 4. 애니메이션 (차원 3)

- 시간 값은 spec 6.4와 같다(tokens.css:55-65 ↔ durations.ts). 배너 350ms, 모달 150ms, 분배 ≤1.2s(choreo.ts:235-236: 스태거 ≤40ms × 약 18장 + 180ms ≈ 0.9s).
- 500ms 압축(choreo.ts:32, 105-108): 계획 합이 500ms를 넘으면 모든 단계를 같은 비율로 줄인다. 재현한 최대 547~562ms는 "계획 500 + 단계 사이 프레임·tick 약 50~60ms"와 맞다. 선택 자체는 합리적이나 (a) 여러 장 획득 턴에서는 spec의 개별 시간(획득 160ms 등)보다 짧아지고 (b) E2E가 700ms를 단언하지 않아 회귀를 못 잡는다(L-9).
- 건너뛰기: 보드 루트 `--dur-scale: 0` + `finishAll`(choreo.ts:247-250). 그러나 `sleep(scaledMs(...))`는 문서 루트 배율을 읽어 건너뛰기가 **선 고르기 결과 대기 700ms·판 종료 대기 700ms·CPU 최소 250ms에는 안 먹는다**(solo.svelte.ts:343, 354, 396 → L-2).
- 버벅임 위험: 단계마다 `[data-card-id]` 전체를 두 번 `getBoundingClientRect`(choreo.ts:112-123)하고 `run()`마다 `getComputedStyle`·`matchMedia`(durations.ts:28-33)를 부른다. 카드 51장 규모라 문제될 정도는 아니다. `will-change`는 참조 계수로 끝나면 지운다(flip.ts:35-56). 레이아웃 속성은 애니메이션하지 않는다.
- **WebKit 카드 면 문제(S-1)**: 5장.

## 5. 결함

### 심각

**S-1. WebKit에서 바닥·손패 카드가 뒷면으로 그려지고, 그 모습이 AC-05 기준 이미지로 확정되어 있다** — `ui/Card.svelte:40-47, 74-96`, `e2e/__screenshots__/gallery.spec.ts/board-*-webkit.png`
- 증거: `board-390x844-webkit.png`·`board-430x932-webkit.png`·`board-target-webkit.png`·`board-gostop-webkit.png`에서 `flippable`로 그리는 카드(바닥 전부, 손패 전부)가 **모두 빨간 뒷면**이고 모서리 표식("6피", "12광")만 보인다. 같은 파일의 Chromium 판은 앞면이다. `flippable`이 아닌 카드(획득패, 대상 선택 창)는 WebKit에서도 앞면이다.
- 원인: 앞·뒷면을 한 `.inner(preserve-3d)`에 겹치고 `backface-visibility: hidden`에만 의존한다. 3D 합성이 평탄화되면(Linux WebKit 등) 뒷면 `<img>`가 DOM 순서상 위에 그려진다. iOS Safari에서도 재현되는지는 확인하지 못했다(실기기 필요). 그러나 (a) M4 게스트는 WebKit이고 같은 `Board`를 쓰며, (b) 회귀 기준 이미지가 **틀린 모습을 정답으로 고정**해 AC-05(WebKit UI 회귀)가 이 결함을 절대 못 잡는다.
- 수정안: ① 뒷면 `<img>`는 `hidden`인 카드와 **뒤집기 애니메이션 중에만** 렌더하거나, 최소한 앞면을 DOM 마지막에 두고 `.front { transform: rotateY(0deg) translateZ(0.1px) }`를 준다. ② 앞면 표시를 단언하는 WebKit 브라우저 테스트(카드 중심의 `document.elementFromPoint`가 `.front`인지) 추가. ③ WebKit 기준 이미지 재생성 후 사람이 눈으로 확인. ④ `docs/device-test/`에 iPhone에서 손패·바닥 앞면 확인 항목 추가.

### 중요

**I-1. 토스트가 사라지지 않는다** — `game/solo.svelte.ts:121, 433-435`, `ui/Board.svelte:167-171, 387-401`
- `showToast`는 값을 바꾸기만 하고 지우는 타이머가 없다. CSS에도 사라지는 애니메이션이 없다. 그래서 "선 고르기: 나 3월 광 · 컴퓨터 …" 같은 문구가 **다음 토스트가 나올 때까지(판을 넘어서도) 바닥 위쪽에 계속 떠 있다**. 위치가 `.center` 맨 위 가운데(translate -50%)라 상대 획득패와 바닥 첫 줄에 걸친다. 오래된 "컴퓨터 흔들기: …"·"뻑 먹기"가 남아 있으면 지금 일어난 일로 오해하기 쉽다(사용자의 "규칙 의심"과 직결).
- 수정안: 배너처럼 타이머로 지운다(최소 1.2s), 새 판·스냅 때 비운다, 여러 개는 큐로 짧게 잇는다. Board에 `out:fade` 전이.

**I-2. 손패가 정렬되지 않아 짝을 찾기 어렵다** — `ui/Hand.svelte:22-30`(엔진 손패 순서 그대로), engine `deal.ts:187-188`
- 재현: `newRound(PRESETS.standard, 12345, {dealer: 0})`의 좌석 0 손패 = `1피b | 6청 | 2홍 | 5열 | 10피a | 5피b | 3광 | 7열 | 5피a | 1홍` — 같은 월(1월 2장, 5월 3장)이 흩어져 있다. 보충 카드는 끝에 붙는다. 상용 맞고는 모두 월 순 정렬이다.
- 수정안: 표시에서만 정렬(Hand 안에서 `cards.toSorted(월, 종류, id)`). 엔진 상태·`display.test`의 손패 배열 비교는 그대로 둔다. FLIP은 id 키라 자리 이동이 자연스럽게 애니메이션된다.

**I-3. 상대 애니메이션을 건너뛰려고 손패를 탭하면 그 카드가 나갈 수 있다(되돌릴 수 없는 오조작)** — `ui/Board.svelte:109-111, 123`, `ui/Hand.svelte:42-57, 71-79`, `game/solo.svelte.ts:310-331`
- 경로(코드 분석, 브라우저 재현 테스트 필요): 재생 중 손패 버튼은 `disabled`지만 현재 HTML 명세·Chromium·WebKit은 비활성 폼 컨트롤에도 pointer 이벤트를 보낸다(막는 것은 click). ① pointerdown → 보드의 capture 핸들러가 `skipAnimations()` ② `finishAll` 이후 남은 단계는 배율 0이라 **setTimeout 없이 마이크로태스크만으로** 재생이 끝나고(`RoundEnded`가 없는 묶음), `busy=false` → 내 차례면 손패 `disabled` 해제 ③ 손가락을 떼면 click이 이제 활성인 같은 버튼에 전달 → `pressed`가 null이라 길게 누르기 판정도 없이 `onplay`. 한 손 조작에서 엄지가 놓이는 곳이 손패라 흔히 일어날 수 있다("잔버그" 후보). 재현되면 심각으로 올린다.
- 수정안: 건너뛰기에 쓰인 pointerdown의 `pointerId`를 기억해 뒤이은 click을 무시하거나, Hand의 `activate`에서 "pointerdown 때 이미 playable이었던 카드"만 내게 한다(키보드 click은 `event.detail === 0`으로 허용). 재현 테스트: vitest 브라우저 모드에서 busy→false 전환 사이에 pointerdown/up을 보내 `onaction` 미호출을 단언.

**I-4. 판단에 필요한 상시 정보가 빠져 있고, 이벤트가 누구 것인지 안 보인다** — `ui/Board.svelte:125-201`, `ui/banner.ts:66-93`, `ui/CapturedPile.svelte:76-83`, `styles/tokens.css:44-46`
- spec 6.1 "정보는 상시 노출"과 비교해 빠진 것: **뻑 횟수**(`SeatView.ppeokCount`는 있는데 안 그림 — 3뻑 즉시 승리 위험을 모름), 흔들기·폭탄 횟수(양측), **상대 족보 진행도**(광·고도리·단은 없고 피만), 상대 배수. 획득패는 26px 폭에 7~10px만 보여 어떤 카드인지 읽기 어렵다.
- 배너 "뻑!"·"쪽!"·"쓸!"에 주체가 없다. 한 묶음에 따닥→쓸처럼 배너가 이어지면 앞 배너는 약 80ms 만에 덮인다. 피 뺏기는 배너·토스트 없이 26px 카드의 200ms 이동뿐이라 거의 알아채지 못한다. 상대가 무엇을 냈는지 턴이 끝난 뒤 남는 표시도 없다.
- 수정안: 좌석 막대에 "뻑 n · 흔들 n · 폭탄 n" 칩, 상대 막대에도 진행도 칩(광·고도리·단·피). 배너 문구에 주체("컴퓨터 뻑!")와 좌석별 위치, 같은 묶음 배너는 큐로 최소 350ms씩. `PiStolen`에 "피 1장 뺏김/뺏음" 토스트. 직전 상대 수(낸 패·뒤집은 패)를 다음 입력 전까지 얇은 테두리로 유지. 카드 폭은 `clamp()`로 화면에 비례(중앙의 빈 공간 활용).

**I-5. 게임 중 나갈 방법이 없다(메뉴·뒤로 가기 없음)** — `routes/Game.svelte:74-115`, `ui/Board.svelte`(헤더에 버튼 없음), `android/app/src/main`(뒤로 가기 처리 없음)
- 판이 진행되는 동안 홈·설정·효과음 끄기로 갈 UI가 없다. Android WebView에서는 뒤로 가기 처리(`OnBackPressedCallback`/`canGoBack`)가 없어 뒤로 가기 = 앱 종료다(세션은 저장되므로 복구는 됨). 정산 화면의 "종료"만이 유일한 출구다.
- 수정안: 게임판 상단에 작은 메뉴 버튼(48px) → 계속/설정/홈/세션 종료(확인). A1(Android 후속)에서 뒤로 가기를 `history.back()` 또는 메뉴 열기로 연결.

**I-6. 프롬프트·규칙 경로를 보장하는 테스트가 얕다** — `ui/Board.test.ts`(4개), `e2e/solo.spec.ts:27-35`
- 컴포넌트 테스트는 play·target·goStop만 있다. 선 고르기·총통·흔들기·국진·폭탄·폭탄패 뒤집기 6종은 렌더·버튼→액션 매핑 테스트가 없다.
- 20판 E2E는 `prefer = ['stop','bomb','shake']`와 `choices[0]`만 누르므로 **고(go)·총통 계속하기·흔들기 거절·국진 선택은 한 번도 UI로 지나가지 않는다**(국진 묻기는 설정 UI가 없어 불가능). 또 `?speed=instant`라 안무(choreo)는 20판 동안 전혀 실행되지 않는다.
- 표시 숫자 = 엔진 숫자를 단언하는 테스트도 없다(5.1장의 일회용 검사가 처음). 이 공백 때문에 S-2가 통과했다.
- 수정안: (a) 속성 테스트: 무작위 판에서 사람 좌석 pending마다 `Board`를 렌더해 **legal 액션 각각에 대응하는 활성 버튼이 존재**하고 누르면 그 액션이 `onaction`으로 나오는지(막힘 방지 불변식). (b) 5.1장 검사를 `display.test.ts`에 넣어 매 액션 "획득패 칸 숫자·진행도·점수 = 엔진 `ScoreBreakdown`", 매 판 "정산 화면 행 = `settle().steps`". (c) E2E 선택 정책을 시드 기반 무작위(고 포함)로 바꾸고 `gukjin: 'ask'` 세션 1개 추가. (d) 빠름 속도 판 수를 늘려 AC-06 표본 확보.

### 5.1 사용자 피드백 검증: 피 점수·국진·점수 계산

일회용 Node 검사(저장소에 파일 추가 없음, `./dev.sh npm exec -- node -e`로 web의 `session.ts`·`adapter.ts`를 직접 불러 실행): 표준 규칙 국진 자동 1,500판 + 국진 묻기 1,500판(총 2,988판 완료, 좌석·액션 상태 117,596개)을 무작위 합법 수로 두면서 매 액션 뒤 화면 값(`toBoardView`·`CapturedPile` 라벨 계산식)과 엔진 값(`seats[i].score`)을, 매 판 끝에 정산 화면 값(`toSettlementView`)과 `settle()` 결과를 비교했다.

| 비교 | 결과 |
|---|---|
| 좌석 막대 "점수" = 엔진 `score.total` | 불일치 **0** / 117,596 |
| 진행도 "피 n/10"(`progressOf`) = 엔진 `score.piCount` | 불일치 1,085 — 전부 **턴 도중**(대상·국진 프롬프트 대기) 엔진 `score`가 아직 재계산 전이라 화면 쪽이 더 최신인 경우. 턴 끝 상태에서는 0(경미 L-15) |
| **획득패 칸 "피 n" = 엔진 `score.piCount`** | **불일치 13,553 (11.5%)** — 예: 칸 "피 9", 엔진 piCount 11, `gukjinAsPi: true` |
| **획득패 칸 "열끗 n" = 엔진 `score.yeolCount`** | **불일치 13,558** — 같은 원인 |
| 국진 위치 변경 | 1,623회, 그중 이벤트가 따르는 것 538회(묻기 모드 `GukjinPlaced`). **자동 모드의 위치 변경은 이벤트·화면 신호 0** |
| 정산 점수 분해 행 합 = `steps`의 `base` | 스톱·자동 스톱 2,905판 불일치 **0** |
| 정산 행별 점수(광·열끗·고도리·띠·홍/청/초단·피) = 엔진 `scoreCaptured(winner, settlement.gukjinAsPi[winner])` | 불일치 **0** |
| 정산 `finalPoints` = (add 합) × (mul 곱) = 화면 값 | 2,988판 불일치 **0** |
| 즉시 정산 목록 = 엔진 `instantPayouts` | 135판 불일치 **0** |
| 정산 금액 ≤ 점수×점당(상한 적용) | 위반 **0** |

- 피 **가치**(쌍피 2, 보너스 2피 2·3피 3)로 세는지: `CapturedPile.svelte:24`·`adapter.ts:72`·엔진 모두 `piValue` 합이다. 장수로 세는 곳은 없다.
- 정산·점수 분해 화면(`routes/Settlement.svelte`)은 있고 엔진과 정확히 같다. 즉시 정산도 별도 절로 나온다(점수로만 표시, 금액·상한 여부는 없음 — 경미).

**S-2 (심각). 국진이 쌍피로 옮겨 가도 획득패 칸은 열끗에 그대로 두고 칸 숫자도 바꾸지 않아, 화면의 "피"·"열끗" 숫자가 엔진과 다르다** — `ui/CapturedPile.svelte:15-26`, `game/display.ts:73-76`(국진은 항상 `yeol` 칸), `game/adapter.ts:64-79`, `routes/Settlement.svelte`(국진 위치 미표시), `game/solo.svelte.ts:492-493`(묻기 모드 토스트만)
- 재현: 위 표. 국진 자동 모드에서 국진을 먹은 좌석은 총점이 큰 쪽으로 국진을 옮기는데(S5, rules-vectors 해석 9·29), 화면은 (a) 국진 카드를 계속 열끗 칸에 그리고 (b) 열끗 칸 숫자에 넣고 (c) 피 칸 숫자에서 뺀다. 같은 화면의 진행도 "피 n/10"은 +2를 반영하므로 **한 화면에 피 숫자가 두 개(예: 9와 11)** 뜬다. 위치가 바뀌는 순간 배너·토스트·표식이 없고, 정산 화면도 승자·패자의 국진 위치(`Settlement.gukjinAsPi`, 패자는 피박 회피 쪽)를 보여 주지 않는다. 사용자가 느낀 "피 점수가 이상하다"의 직접 원인으로 본다.
- 수정안: ① `CapturedPile`에 `gukjinAsPi`(좌석 `score.gukjinAsPi`)를 넘겨 쌍피로 셀 때는 국진을 **피 칸에 그리고** 칸 숫자를 엔진 `score.gwangCount/yeolCount/ttiCount/piCount`로 바로 쓴다(화면에서 다시 계산하지 않는다). `display.ts`의 `pileOf`도 같은 규칙. ② 국진 카드에 "쌍피로 셈" 표식(모서리 "9쌍"), 자동 이동 때 짧은 토스트("국진 → 쌍피"). ③ 정산 화면에 "국진: 쌍피(승자) / 열끗(패자, 피박 회피)" 한 줄. ④ I-6(b)의 속성 테스트로 고정. 국진 묻기 설정(L-1)을 켜서 프롬프트 경로도 E2E로 지나가게 한다.

### 경미

- **L-1. 국진 "매번 묻기"(FR-15) 설정 화면 없음** — `settings/settings.svelte.ts:17`에 필드는 있지만 `routes/Settings.svelte`에 토글이 없다. 국진 프롬프트(Board.svelte:282-291)는 실사용에서 도달 불가이고 컴포넌트 테스트도 없다. 설정에 스위치 추가.
- **L-2. 건너뛰기가 고정 대기에 안 먹음** — `game/solo.svelte.ts:343, 354, 396`의 `scaledMs()`가 보드 루트가 아닌 문서 배율을 읽는다. `scaledMs(ms, host.root)`로 바꾸거나 건너뛰기 플래그로 대기를 끊는다.
- **L-3. 손패 6장 한 줄이 좁은 화면에서 잘림** — `ui/Hand.svelte:24`(`ONE_ROW_MAX = 6`), tokens.css:46(`--card-w-l: 62px`). 6장 = 6×62+5×4 = 392px > 390px 화면의 사용 폭 366px(360px 기기는 336px) → 보드 `overflow: hidden`에 양끝 카드가 13~28px 잘린다. Board.test는 5장·10장만 본다. 폭에 따라 줄 수를 정하거나 `ONE_ROW_MAX = 5`.
- **L-4. 두 줄 손패의 첫 줄 표식이 가려짐** — `ui/Hand.svelte:102-104`(둘째 줄이 첫 줄 아래 약 46px를 덮음), `ui/Card.svelte:107-111`(표식은 카드 아래쪽). 첫 줄은 표식을 위쪽에 두거나 겹침을 줄인다.
- **L-5. 끝낸 세션의 정산 화면에 죽은 "다음 판" 버튼** — `solo.end()` 뒤에도 `settlementReady`가 남아 `#/game`으로 돌아오면 정산 덮개와 "다음 판"이 보이지만 `nextRound()`는 phase가 `ended`라 아무것도 안 한다(game/solo.svelte.ts:254-261, routes/Game.svelte:27-51). `ended`면 "새 게임" 화면을 보인다.
- **L-6. "시작"이 진행 중 세션을 확인 없이 덮어씀** — `routes/SoloSetup.svelte:21-24`, `game/current.svelte.ts:52-62`. 저장 슬롯이 하나라 기록도 사라진다. 이어할 세션이 있으면 확인을 받는다.
- **L-7. CPU 오류 시 대체 수가 `legal[0]`** — `game/solo.svelte.ts:383-406`. 고/스톱이면 `go`, 흔들기면 수락, 총통이면 끝내기가 된다. 대체는 스톱·거절·계속 같은 보수적 수로 고정하거나 쉬움 정책을 인라인으로 부른다.
- **L-8.** (S-2로 올림)
- **L-9. AC-06을 단언하지 않음, 표본 부족** — `e2e/solo.spec.ts:122-129`. 로컬 도커 기준 p95 ≤ 700ms 단언(CI는 여유 배율)과 3판 이상 표본.
- **L-10. 기록 화면이 재충전을 무시하고 배수 열이 없음** — `routes/Records.svelte:13, 24-31`(시작→끝 잔액이 재충전 후 틀림), FR-19 "배수" 미표시.
- **L-11. 선택 창이 내 획득패·점수를 가림** — `ui/PromptPanel.svelte:31`. spec 6.3 "작게, 배경은 계속 보인다". 고/스톱 판단 때 내 획득패를 못 본다. 창을 바닥 쪽으로 옮기거나 높이를 줄인다.
- **L-12. 즉시 정산으로 잔액이 0이 돼도 판 끝까지 진행, 파산 좌석이 누구인지 안 보임** — `game/session.ts:129`는 판 종료 때만 파산을 본다(해는 없음). Settlement.svelte:122-126 문구에 좌석 이름 추가. 즉시 정산 절도 점수만 보이고 금액·상한 여부가 없다.
- **L-13. 차례가 아닐 때 손패가 0.45 불투명도로 흐림** — `ui/Card.svelte:103-105`. spec 6.3 "흐리게"는 충족하나 상대 차례에 다음 수를 계획하기 어렵다. 0.7 정도로.
- **L-14. 진동(spec 6.5)·확정 지연(FR-17) 미구현** — PR이 이연을 밝힘. A1(진동 브리지)·M6에서.
- **L-15. 턴 도중 프롬프트에서 "점수"와 "피 n/10"이 서로 다른 시점 값** — 좌석 막대 점수는 엔진 `score`(턴 해결 때 재계산), 진행도는 화면에서 획득패로 다시 계산(adapter.ts:132). 대상·국진 프롬프트 대기 중 1,085개 상태에서 어긋났다(5.1). 진행도도 엔진 `ScoreBreakdown`의 장수 필드를 쓰면 한 시점으로 맞는다.

## 6. 세션·원장 (차원 5)

- MN-01 제로섬: `ledgerIsBalanced`(session.ts:227-231) — 잔액 합 = 시작×2 + 재충전 합. display.test 매 액션, E2E 20판 끝에서 검사.
- MN-02: 판 종료 시 누구든 잔액 ≤ 0이면 `bankrupt` → 정산 화면 "재충전/종료"(Settlement.svelte:122-138). 재충전은 0인 좌석만 시작 잔액으로, 기록 유지(L-12 제외).
- MN-05: 매 `commitState`마다 localStorage 저장(solo.svelte.ts:285-296), 앱을 다시 열면 홈 "이어하기", `#/game` 직접 진입도 이어받음(Game.svelte:14). `parseSession`은 얕은 모양 검사뿐이라 깨진 `game` 필드는 런타임 예외 가능(경미).
- FR-18 즉시 정산: 이벤트 시점에 `applyInstantPayout`(session.ts:146-154). FR-19 기록(L-10 제외).

## 7. Worker·AI (차원 6)

- 시간 제한: 상용급 1000ms(설정값, UI 없음), 보통 400, 쉬움 100(ai-client.ts:21-24). AI-05(Android ≤1.0s) 충족. CPU 최소 표시 250ms는 결정과 병렬.
- 정보 은닉: Worker에 `playerView(state, 1)`만 전달(solo.svelte.ts:381) — AI-01. 결정 시드 = 세션 시드×판×액션 순번 — AI-08.
- 대체: Worker 오류·무응답(제한+5s) → 인라인(최대 300ms)으로 전환하고 대기 요청도 넘김(ai-client.ts:111-124). 결과가 legal이 아니면 거부하고 `legal[0]`(L-7).
- 메인 스레드: 평소에는 엔진 `reduce`·`playerView`·세션 JSON 저장만. 기록이 수백 판이 되면 저장이 매 액션 전체 직렬화라 수 ms(경미).

## 8. 코드 품질 (차원 7)

- Svelte 5 runes만 사용(`$state`·`$state.raw`·`$derived`·`$effect`·`$props`·`$bindable`·snippet·`onclick`). Svelte 4 문법·SvelteKit 흔적 없음. 금지 API 없음(`crypto.getRandomValues`만, Clipboard 대신 선택 텍스트).
- 상태 중복: `SoloSession.state`(권위) ↔ `board`·`extras`(표시)는 의도된 이중화이며 스냅으로 수렴한다. 다만 획득패 칸 숫자·진행도처럼 **엔진이 이미 계산한 값을 화면에서 다시 계산**하는 곳이 S-2·L-15의 원인이다. 표시 숫자는 엔진 `ScoreBreakdown`에서 그대로 가져온다.
- 테스트 품질: `display.test.ts`의 재생=뷰 속성 검사는 카드 배치에 대해서는 의미 있다. 숫자(점수·피·장수)는 비교 대상에서 빠져 있다(`layout()`이 카드 배열만 봄). 20판 E2E는 즉시 모드·고정 선택 정책이라 "막힘 없이 20판 끝난다·원장 제로섬·콘솔 오류 0" 이상은 보장하지 않는다(I-6). Board.test의 48px 검사는 버튼 사각형만 재고 두 줄 겹침으로 가려지는 면적은 보지 않는다.

## 9. 후속 (U1 수정 라운드 제안 순서)

1. S-2(국진·피 숫자) + I-6(b) 숫자 일치 속성 테스트 — 사용자 체감 1순위.
2. S-1(WebKit 카드 면) + I-3(건너뛰기 오조작) — M4 게스트 통합 전.
3. I-1(토스트) · I-2(손패 정렬) — 작고 체감이 크다.
4. I-4(상시 정보·배너 주체) · I-5(메뉴) — UX 라운드.
5. I-6 나머지(막힘 방지 속성 테스트·E2E 정책).

## 10. 등록한 GitHub 이슈

| 결함 | 이슈 |
|---|---|
| S-1 WebKit 카드 뒷면 | #5 |
| S-2 국진·피 숫자 불일치 | #4 |
| I-1 토스트 잔류 | #6 |
| I-2 손패 미정렬 | #7 |
| I-3 건너뛰기 오조작 | #8 |
| I-4 상시 정보·배너 주체 | #9 |
| I-5 게임 중 메뉴 없음 | #10 |
| I-6 테스트 공백 | #11 |
