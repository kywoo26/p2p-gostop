# 웹 UI 구조 (M3 혼자 연습)

작성: 2026-09-28 · 대상: `packages/web` · 근거: spec 2.5·6장·FR-10~24·MN-01~06·AI-05, plan.md 1.6·M3

## 1. 화면 지도 (해시 라우팅, `src/App.svelte`)

| 경로 | 화면 | 파일 | 비고 |
|---|---|---|---|
| `#/` | 홈 | `routes/Home.svelte` | 친구와 대전 / 혼자 연습 / 기록 / 설정 / 진단, 저장된 세션이 있으면 "이어하기" |
| `#/solo` | 난이도 선택 | `routes/SoloSetup.svelte` | 쉬움·보통·상용급, 규칙·금액 요약 |
| `#/game` | 게임판 + 정산 | `routes/Game.svelte` → `ui/Board.svelte`, `routes/Settlement.svelte` | 정산은 게임판 위 전체 화면 덮개(게임판은 계속 마운트) |
| `#/records` | 기록 | `routes/Records.svelte` | 현재(또는 마지막) 세션의 판별 결과·합계 |
| `#/settings` | 설정 | `routes/Settings.svelte` | 프리셋, 점당 금액(시작 잔액 자동 제안), 속도, 효과음 |
| `#/diagnostics` | 진단·로그 | `routes/Diagnostics.svelte` | 인앱 로그, 전체 선택 텍스트 영역(Clipboard API 없음) |
| `#/license` | 라이선스 | `routes/License.svelte` | |
| `#/versus` | 친구와 대전 | (App 안 안내) | M4 |
| `#/dev/gallery/*` | 개발 갤러리 | `routes/dev/gallery/Gallery.svelte` | 스크린샷·axe 대상 |

쿼리 `?speed=instant`는 저장하지 않는 즉시 모드(`--dur-scale: 0`)다. E2E 자동 플레이가 쓴다.

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

- **순수 층**: `game/session.ts`(세션 = GameState + Ledger + 기록, 다음 판 선·나가리 이월·재충전), `game/display.ts`(이벤트 재생 리듀서), `game/adapter.ts`(PlayerView → BoardView).
- **반응형 층**: `game/solo.svelte.ts`의 `SoloSession`(runes 클래스). 화면은 `board`·`extras`·`banner`·`toast`·`busy`·`thinking`·`settlementReady`·`timings`만 읽는다.
- **애니메이션**: `anim/choreo.ts`가 이벤트 묶음을 단계(낸 패 120 → 뒤집기 140 → 매칭 80 → 획득 160+30 스태거, 뺏기 200 병렬)로 나누고, 카드가 어디서 어디로 갔는지로 시간을 고른다. 계획 합이 540ms를 넘으면 비율로 줄인다(프레임 지연 여유 포함 700ms 예산). 판을 탭하면 `--dur-scale: 0` + `finishAll`로 건너뛴다.
- **검증**: `game/display.test.ts`가 무작위 합법 수 80여 판에서 매 액션 "이전 뷰 + 가려진 이벤트 재생 = 새 뷰"(카드 배치)를 확인한다. 그래서 스냅은 누락 대비 안전망이고 평소에는 튀지 않는다.
- **CPU**: `game/ai-client.ts`가 Worker를 만들고, 실패·무응답(시간 제한 + 5초)이면 메인 스레드 인라인(시간 제한 300ms 상한)으로 넘어간다. CPU 뷰는 `playerView(state, 1)`만 넘긴다(AI-01).

## 3. 계측 (AC-06)

탭(click `timeStamp`) → 그 액션의 이벤트 재생·스냅 완료까지를 `SoloSession.timings`에 남기고 진단 로그에 쓴다. 게임 루트 `data-play-timings`로 E2E가 읽는다. 2026-09-28 도커 e2e 이미지(빠름): Chromium p50 568~571ms·최대 596ms, WebKit p50 578~635ms·최대 599~737ms(12개 병렬 실행 부하에서 1회 초과). E2E는 중앙값 ≤ 700ms를 검사한다.

## 4. M4 protocol로 넘길 것 (어댑터 교체)

`game/adapter.ts`는 잠정이다. `@p2p-gostop/protocol`의 `toBoardView`가 들어오면 교체한다. 그 함수가 채워야 할 계약:

- `toBoardView(view: PlayerView, meta: { names: [string, string]; balances: [number, number] }): BoardView` — 필드는 `lib/view-types.ts`·`fixtures/board.json` 그대로. `playable` = legal의 play 카드, `pending.goStop.stopAmount` = `stopPreview.money`(원장 상한 적용), `multiplier` = 스톱 미리보기 배수(없으면 흔들기·폭탄·고·이월·대박판의 곱).
- BoardView에 아직 없는 값(지금은 `BoardExtras`·`InFlight`로 따로 계산): 선 고르기(`pickFirst{poolSize, taken}`), 폭탄 가능한 월, 폭탄패 뒤집기 가능, 스톱 미리보기 분해(`steps`·`capped`), 대상 고르기 중 손을 떠난 카드(`ctx.played`·`ctx.flipped`·`heldBonuses`). protocol의 BoardView에 넣으면 이 둘을 지운다.
- 게스트 화면도 같은 `display.ts` 리듀서와 `choreo.ts`를 쓴다(입력이 `redactEvent`된 이벤트 + 스냅샷이므로). 호스트 모드는 `SoloSession`과 같은 모양(`board`·`extras`·`submit(action, tapAt)`·`skipAnimations()`·`attach(root)`)으로 상대 좌석만 원격으로 바꾸면 된다.

## 5. 알려진 빈틈 (미룬 것)

- 진동: ESLint 금지 API 규칙(`navigator.vibrate`)을 우회하지 않았다. Android 셸 브리지에 진동 메서드가 생기면 연결(M4/M6). 설정 화면에서도 뺐다.
- 24개 개별 규칙 토글(FR-21), 화폐 단위 선택, CPU 생각 시간 설정 UI: M6. (저장 값과 기본값은 있다)
- 효과음은 Web Audio 합성 최소판(자체 제작). 음색 다듬기는 M6.
- 리플레이 내보내기(FR-33): 세션에 액션 열은 저장하지만 내보내기 UI는 M6.
- 보너스 카드 두 번째 시안(plan §9): 미제작.
