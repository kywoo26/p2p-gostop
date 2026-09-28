# 고스톱/맞고 오픈소스 구현·자산 조사 (code-refs)

- 조사일: 2026-09-28
- 목적: 새 TypeScript 맞고 엔진을 설계할 때 참고할 수 있는 오픈소스 구현, 쓸 수 있는 오픈 라이선스 화투 이미지, 엔진 설계 자료를 찾는다.
- 원칙(intend.md 4.1): **존재한다는 이유만으로 참고하지 않는다.** 라이선스가 있고, 구조가 좋고, 테스트가 있는 코드만 참고 대상으로 삼는다. 규칙 정합성은 상용 기준(한게임 신맞고 공식 가이드)과 대조해 판정한다.

## 0. 조사 방법과 판정 기준

**검색 범위**
- GitHub `gh search repos`: gostop, go-stop, godori, matgo, hwatu, 고스톱, 맞고, 화투, "go-stop card game", "hwatu game", "gostop ai", hanafuda koikoi 등. 검색 결과 약 150개 저장소를 메타데이터(언어, 스타, 최근 푸시, 라이선스, 파일 트리, 테스트 파일 수)로 1차 선별했다.
- 1차 선별을 통과한 저장소는 `/tmp/gs`에 shallow clone해서 코드를 읽었다. 테스트가 있는 TS/JS 저장소 4곳은 **테스트를 직접 실행했다.**
- npm 레지스트리 검색(gostop, go-stop, hwatu, matgo, hanafuda, koikoi)과 PyPI(`/pypi/<name>/json`) 조회
- WebSearch: RL 환경, 화투 이미지 라이선스, 규칙·설계 문서
- Wikimedia Commons 파일 설명 페이지에서 이미지 라이선스를 직접 확인했다.

**규칙 대조 기준**: 한게임 신맞고 공식 가이드(게임규칙/점수 계산). 요지는 다음과 같다.
- 각 10장, 바닥 8장
- 1고 +1, 2고 +2, 3고 (점수+3)×2, 4고 (점수+4)×4, 5고 (점수+5)×8
- 흔들기·폭탄은 회당 ×2
- 멍따: 열끗 7장 이상이면 ×2
- 피박: 피 10장 이상으로 이겼고 상대 피가 7장 이하면 ×2
- 광박: 광 3장 이상으로 이겼고 상대 광이 0장이면 ×2
- 독박(고박): 고를 부른 뒤 상대가 스톱하면 ×2
- 총통 10점 즉시 종료, 3뻑 7점 승리, 나가리 다음 판 ×2

세부 규칙은 `rules-commercial.md`에서 확정한다. 이 문서에서는 **구현 간 불일치를 찾아내는 기준선**으로만 쓴다.

**판정 등급**
| 등급 | 의미 |
|---|---|
| 참고 가치 있음(reference-worthy) | 라이선스, 구조, 테스트, 규칙 정합성이 모두 기준 이상이다. 설계를 읽고 테스트 케이스를 차용할 가치가 있다. |
| 부분 참고(partial) | 특정 아이디어(자료구조, 이벤트 모델 등)만 참고할 수 있다. 규칙 구현은 믿지 않는다. |
| 회피(avoid) | 라이선스가 없거나, 규칙 오류가 크거나, 미완성이다. 참고하지 않는다. |

> 전반적 현황: 고스톱/맞고 분야에는 **널리 검증된 대표 오픈소스가 없다.** 최다 스타가 sunduk/freegostop(36★, 2017년 이후 정체)이다. 2026년에 AI 보조로 만든 저장소가 대량으로 생겼지만, 대부분 라이선스가 없거나 테스트가 없다. 따라서 "스타 수"가 아니라 코드와 테스트를 직접 읽고 판정했다.

---

## 1. 후보 요약표

| # | 저장소 | 언어 | 라이선스 | ★ | 최근 커밋 | 인원 | 테스트 | 판정 |
|---|---|---|---|---|---|---|---|---|
| 1 | [itsent-lab/hwatu](https://github.com/itsent-lab/hwatu) | TypeScript(React) + C# API + Swift | MIT (카드 SVG는 CC BY-SA 4.0) | 5 | 2026-07-22 | 2인 맞고 + 3인 고스톱 | 웹 45개 파일(규칙 109케이스 직접 실행 통과) + 공통 JSON 테스트 벡터 | **참고 가치 있음** |
| 2 | [bipark/gostop-ts](https://github.com/bipark/gostop-ts) | TypeScript(Vite) | **PolyForm Noncommercial 1.0** | 4 | 2026-09-16 | 2·3·4인 | 11개 파일, 115개(직접 실행 통과) | **참고 가치 있음(설계만 읽기, 코드 복사 금지)** |
| 3 | [civilian7/gostop](https://github.com/civilian7/gostop) | Delphi FMX | **PolyForm Noncommercial 1.0** | 8 | 2026-08-13 | 2·3·4인 | 단위 테스트 없음, 리플레이 픽스처(`records/*.rec`)와 시뮬레이터 | 부분 참고(규칙·AI 문서) |
| 4 | [ctbot000/go-stop-game](https://github.com/ctbot000/go-stop-game) | JavaScript(ESM, 무의존) | MIT (카드 SVG는 CC BY-SA 4.0) | 0 | 2026-09-22 | 2인 맞고 | 30개(직접 실행 통과) | 부분 참고(따닥 오류) |
| 5 | [tscz/gostop](https://github.com/tscz/gostop) | TypeScript(React, Zustand) | MIT (카드 SVG는 CC BY-SA 4.0) | 1 | 2026-03-30 | 2인 | 4개 파일, 123개(직접 실행 통과) | 회피(규칙 오류 다수) |
| 6 | [yubyunghun/hwatu-gostop-rl](https://github.com/yubyunghun/hwatu-gostop-rl) | Python + React | **없음** | 0 | 2026-09-25 | 2인(설계상 3인 확장) | pytest 16개 파일 | 회피(규칙), RL 인터페이스 설계만 참고 |
| 7 | [sunduk/freegostop](https://github.com/sunduk/freegostop) | C#(Unity 5) | LICENSE 파일 없음, README에 "상업·비상업 자유 사용" 문구 | 36 | 2017-07-07 | 2인 맞고 | 없음 | 부분 참고(구조, 카드 이미지 후보) |
| 8 | [reidlindsay/gostop](https://github.com/reidlindsay/gostop) | Python | MIT | 11 | 2017-06-25 | 미완성 | 5개 파일(소규모) | 회피(미완성) |
| 9 | [k-culture-play/gostop-guide](https://github.com/k-culture-play/gostop-guide) | TypeScript(Next.js) | MIT (카드 PNG는 CC BY-SA 4.0) | 2 | 2026-07-30 | 규칙 해설 사이트(엔진 아님) | - | 부분 참고(해설·계산기 UI) |
| 10 | [guansanghai/KoiKoi-AI](https://github.com/guansanghai/KoiKoi-AI) | Python | MIT | 21 | 2025-07-22 | 일본 코이코이(인접 게임) | - | 부분 참고(AI 연구) |
| 11 | [boardgameio/boardgame.io](https://github.com/boardgameio/boardgame.io) + [p2p](https://github.com/boardgameio/p2p) | TypeScript | MIT | 12.4k / 25 | 2026-09-18 / 2023-11-03 | 범용 턴제 프레임워크 | 있음 | 설계 개념 참고(의존성으로 채택하지는 않음) |

npm·PyPI: 고스톱/맞고/화투 패키지는 **없다**(npm `gostop`/`hwatu`/`matgo` 검색 결과 0건, PyPI `gostop`/`hwatu`/`matgo` 미등록). 인접 패키지로 `@fudapop/hanafuda-js`(MIT, 코이코이, 1★, 2025-01)가 있지만 규칙이 달라 참고하지 않는다.

---

## 2. 후보별 상세

### 2.1 itsent-lab/hwatu — 참고 가치 있음
- URL: https://github.com/itsent-lab/hwatu
- 언어·구성: `apps/web`(React 19 + TS + Vite + Vitest), `services/api`(ASP.NET Core 10 + MySQL), `apps/macos`(SwiftUI 네이티브, 규칙 패리티 테스트 포함)
- 라이선스: 코드는 MIT. 카드 SVG는 Wikimedia Commons "SVG Hwatu" 세트이며 CC BY-SA 4.0이다. `ATTRIBUTION.txt`와 파일별 `verification.json`으로 출처를 기록해 두었다. 사운드 출처도 따로 정리되어 있다(CC0/CC BY).
- ★5, 커밋 16, 최근 2026-07-22
- 인원: 2인 맞고(`gameState.ts`, 615줄)와 3인 고스톱(`games/gostop/*`)
- 규칙 범위: 뻑, 싼 패 먹기, 자뻑, 3뻑(7점 승리), 쪽, 따닥, 싹쓸이, 폭탄(2·3·4장), 흔들기(4장 흔들기 포함), 총통(바닥 총통 나가리, 손 총통 선택), 고/스톱, 고박, 피박, 광박, 멍박, 나가리 이월 배수, 보너스피(맞고 50장, 고스톱 51장), 국진 열끗/쌍피 전환, 미션(각패) 배수
- 코드 품질:
  - 규칙이 `engine/rules/*.ts`에 순수 함수로 잘게 나뉘어 있다(`scoring.ts`, `settlement.ts`, `specialRules.ts`, `bonusPee.ts`, `nagari.ts`).
  - 정산 결과에 **단계별 계산식 `steps[]`**(기본점수 → 고 점수 → 고 배수 → 흔들기 → 미션 → 박 → 이월)가 들어 있어 UI 설명과 테스트에 바로 쓸 수 있다.
  - `shared/contracts/game-rule-vectors-v1.json`(+ JSON Schema)에 **플랫폼 중립 규칙 테스트 벡터**가 있다. 웹과 Swift 양쪽이 같은 벡터로 검증한다(`docs/game-rule-test-vectors.md`). 사례는 13개로, 비삼광, 고도리, 국진 전환, 3고, 박 중첩, 지급 면제 등을 다룬다.
  - 규칙 해설 문서 `docs/game-rules.md`가 한국어로 상세하다. 따닥, 자뻑, 마지막 패 예외 등을 문장으로 명시한다.
  - 규칙 관련 테스트 8개 파일(109개)을 직접 실행했고 모두 통과했다.
- 한계:
  - 맞고 상태가 `PlayerId = 'human' | 'computer'`, `humanHand`/`computerHand`처럼 **사람 대 컴퓨터로 하드코딩**되어 있다. 대칭적인 P2P 좌석 모델로는 그대로 쓸 수 없다.
  - 일부 판정이 하우스 룰 쪽이다. 광박은 "5광이면 무조건"을 포함하고, 멍박은 상대 열끗 수와 무관하게 7장 이상이면 성립한다. 후자는 한게임 "멍따"와 일치한다.
  - UI, 서버, 통계 코드가 섞여 저장소가 크다(706개 파일).
- 판정: **참고 가치 있음.** 정산 파이프라인, 테스트 벡터 계약, 규칙 문서화 방식이 이 조사에서 가장 좋다.

### 2.2 bipark/gostop-ts — 참고 가치 있음(설계만 읽기, 코드 복사 금지)
- URL: https://github.com/bipark/gostop-ts (웹 데모: https://bipark.github.io/gostop-ts/)
- 성격: civilian7/gostop(Delphi)의 엔진을 1:1로 옮긴 TypeScript 포트다. README는 "같은 시드면 같은 셔플과 같은 대국"이 재현되도록 원작과 비트 단위로 일치한다고 밝힌다.
- 라이선스: **PolyForm Noncommercial 1.0.0**. 비상업 용도로만 쓸 수 있고, 파생물에도 조건과 Required Notice가 따라온다. 이 조건이 우리 저장소 코드에 전파되지 않게 하려면 **코드를 복사하지 말고 설계만 읽어야 한다.**
- ★4, 커밋 5(포트 결과물), 최근 2026-09-16
- 인원: 2인 맞고(10/8), 3인(7/6), 4인 광팔기, 3인 쇼당
- 규칙 범위: 먹기, 뻑, 자뻑, 연뻑, 첫뻑, 쓰리뻑, 쪽, 따닥, 싹쓸이, 폭탄, 흔들기(흔든 월을 반드시 내게 하는 옵션 포함), 총통(바닥·손), 보너스패(쌍피 2장 + 3피, 뒤집기 연쇄 처리, 뻑 더미에 묻히는 경우 처리), 고/스톱, 역고, 고박(고 부른 패자가 전액 부담), 피박(0장 면제, 7장 이하), 광박, 멍박, 국진 이중 해석, 나가리 판돈 이월
- 코드 품질:
  - `cards.ts`, `deck.ts`, `deal.ts`, `score.ts`, `play.ts`(턴 엔진, 1,082줄), `ai.ts`(결정화 몬테카를로)로 층이 명확히 나뉜다.
  - `ScoreOptions`가 지역 룰 편차를 **설정값으로 흡수**한다. 3광, 비삼광, 5광 점수, 열끗·띠·피 시작 장수, 피박 기준, 멍박 기준, 고박 배수, 역고 배수 등이 여기에 들어간다.
  - 국진은 **승자는 최고점 해석, 패자는 피박 회피 우선 해석**으로 처리한다. `evaluate`와 `evaluateAsLoser`로 나눈 설계가 정교하다.
  - 턴 엔진이 `PlayEventKind` 이벤트 로그(Bbeok, Jjok, Ttadak, Sseul, PiSteal 등)를 내놓는 구조다. UI 애니메이션과 AI 재현성 검증에 좋다.
  - 테스트 115개를 직접 실행했고 전부 통과했다. 시드별 자동 완주와 제로섬 검증(`integration.test.ts`), AI 재현성 테스트가 있다. 테스트 헬퍼로 손패, 바닥, 더미를 직접 세팅해 특정 상황(뻑, 쪽, 따닥)을 재현하는 방식이 좋다.
- 한계:
  - 라이선스(비상업). 사람 확인 없이 AI로 옮긴 포트다(README 명시). 엔진이 클래스 기반의 가변 상태 구조다.
  - 한게임과 다른 부분: 멍박에 "패자 열끗 0장" 조건이 있다(pagat 방식). 피박은 0장이면 면제한다. 둘 다 옵션으로 바꿀 수 있다.
- 판정: **참고 가치 있음(읽기 전용).** 규칙 커버리지와 옵션화 설계, 이벤트 모델, 테스트 시나리오 구성이 가장 완성도 높다.

### 2.3 civilian7/gostop (루미 고스톱, Delphi 원작) — 부분 참고
- URL: https://github.com/civilian7/gostop
- 라이선스: PolyForm Noncommercial 1.0.0. 커밋 162로 활발하다. 최근 2026-08-13, ★8.
- Delphi FMX, Win64 전용이다. 엔진 코드는 2.2의 TS 포트로 읽는 편이 낫다.
- 이 저장소에서 가치 있는 것은 **문서**다. `docs/game-rules.md`(엔진이 실제로 구현한 규칙의 정본), `docs/ai-monte-carlo.md`, `docs/ai-opponent.md`, `docs/balance.md`, 설계 스펙(`docs/superpowers/specs/*`: 시드 기반 시나리오 시작, 쇼당 AI 등)이 있다.
- 리플레이 픽스처 `delphi/records/*.rec`(4go, chongtong, shodang 등)는 특정 상황을 재현하는 회귀 테스트 아이디어로 참고할 만하다.
- 단위 테스트 프레임워크는 보이지 않는다(시뮬레이터 `GostopSim`만 있다).
- 판정: **부분 참고.** 규칙 정본 문서와 AI 문서는 읽을 가치가 있다. 코드는 라이선스와 언어 문제로 쓰지 않는다.

### 2.4 ctbot000/go-stop-game — 부분 참고
- URL: https://github.com/ctbot000/go-stop-game (데모: https://ctbot000.github.io/go-stop-game/)
- 라이선스: 코드 MIT. 카드 48장은 Commons "SVG Hwatu", CC BY-SA 4.0이다. ATTRIBUTION.md는 저작자를 Louie Mantia로만 적었는데 **정확하지 않다.** 실제 저작자는 Spenĉjo, Marcus Richert, Louie Mantia Jr.다.
- ★0, 커밋 5, 2026-09-22 생성. 순수 ESM에 의존성이 없다. `engine.js` 611줄.
- 규칙 범위: 광·열끗·띠·피, 고도리, 단, 국진 자동 해석, 뻑, 뻑 회수, 쪽, 따닥, 싹쓸이, 폭탄, 흔들기, 총통, 고박, 피박, 광박, 멍박, 나가리. 보너스 카드와 나가리 이월 배수는 없다.
- 좋은 점: **시드 PRNG(mulberry32)를 상태에 저장**해서 시드 하나로 한 판 전체가 재생된다. 엔진은 상태를 변경하고 **이벤트 목록을 반환**한다(UI 애니메이션용). 테스트 30개를 직접 실행했고 통과했다. "AI 대 AI 1,000판 동안 카드 보존" 같은 불변식 테스트가 있다.
- **확인된 규칙 오류**:
  - 따닥: `handCaptured.length === 2 && flipCaptured.length === 2`, 즉 "낸 패로 한 쌍, 뒤집은 패로 다른 한 쌍"이면 따닥으로 처리한다. 서로 다른 월의 평범한 두 번 먹기가 따닥이 되는 것이다. 테스트도 이 잘못된 정의를 그대로 검증한다(`test/engine.test.mjs:330`). 올바른 따닥은 바닥의 같은 월 2장에 손패로 1장을 먹고, 뒤집은 패가 그 월의 4번째 장이 되어 4장을 모두 가져가는 경우다(pagat, itsent-lab 문서 모두 일치).
  - 고 가산점을 `min(goCount, 2)`로 제한한다. 한게임은 3고 = (점수+3)×2다.
  - 피박 기준이 `loserJunk < 7`이다. 한게임 기준 "7장 이하"와 한 장 어긋난다.
- 판정: **부분 참고.** 시드 재현, 이벤트 반환, 불변식 테스트 아이디어만 가져온다. **테스트가 통과해도 규칙이 틀릴 수 있다**는 반면교사다.

### 2.5 tscz/gostop — 회피
- URL: https://github.com/tscz/gostop, MIT, ★1, 커밋 24, 최근 2026-03-30
- React + Zustand, `src/core`에 순수 로직이 있다. 테스트 123개를 직접 실행했고 통과했다. i18n(de/en/ko), 수 해설(`moveExplainer.ts`)이 있다.
- **규칙 오류**:
  - 띠 장수에서 12월 비띠를 뺀다(`c.month !== 12`). 비띠는 단 조합에만 들어가지 않을 뿐 띠 장수에는 들어간다.
  - 고 배수가 "4고 ×6, 5고 ×24"다. 한게임은 ×4, ×8이다. 3고부터 가산점도 빠진다.
  - 피박, 광박, 멍박, 고박 정산이 **아예 없다.**
  - 총통, 보너스 카드, 나가리 이월이 없다.
  - 상태가 `playerHand`/`aiHand`로 하드코딩되어 있다.
- 판정: **회피.** 테스트는 많지만 잘못된 규칙을 고정할 뿐이다.

### 2.6 yubyunghun/hwatu-gostop-rl — 회피(규칙), RL 인터페이스만 참고
- URL: https://github.com/yubyunghun/hwatu-gostop-rl, **LICENSE 없음**(법적으로 전부 권리 유보), ★0, 커밋 24, 최근 2026-09-25
- 구성: 순수 Python 규칙 엔진(`engine/`, 725줄), Gymnasium 환경과 MaskablePPO 셀프플레이(`rl/`), FastAPI, React
- 좋은 점:
  - `RULES.md`에 모든 규칙 결정을 출처와 함께 고정했고, 상수는 `rules_config.py` 한 곳에만 둔다.
  - 엔진 인터페이스가 `pending_decision` / `legal_options()` / 타입 있는 action 메서드로 되어 있다. 학습 환경과 서빙이 **같은 엔진 객체**를 쓴다.
  - 행동 공간은 `Discrete(51)`에 합법 수 마스크를 씌운다. 관측은 자기중심 인코딩이며, 상대 손패는 "미공개" 집합에 합쳐 정보가 새지 않게 한다.
- **규칙 오류**:
  - 2인 딜이 **손 10장, 바닥 6장, 더미 22장**이다. 표준은 바닥 8장이고, pagat과 한게임 모두 10/8이다.
  - 피박 기준이 "상대 피 < 5"다. 한게임은 7장 이하다.
  - 흔들기가 미구현(`HEUNDEUL_ENABLED=False`)이다.
  - 쪽, 총통, 국진, 보너스 카드가 없다.
  - 따닥 정의(RULES.md 6절)는 올바르다.
- 판정: **규칙 참고는 회피**한다. 라이선스가 없어 코드 차용도 불가하다. 다만 "결정 지점별 step + 합법 수 마스크 + 자기중심 관측" 설계 **개념**은 CPU AI 셀프플레이 설계에 참고할 수 있다.

### 2.7 sunduk/freegostop — 부분 참고
- URL: https://github.com/sunduk/freegostop, ★36 / 포크 32(이 분야 최다), 커밋 17, 최근 2017-07-07
- 라이선스: LICENSE 파일은 없다. README에 "소스코드와 그래픽 리소스는 상업적, 비상업적 어느 용도이든 자유롭게 사용 가능"이라고 적혀 있다. 글꼴은 배달의민족 글꼴(별도 라이선스)이다. **표준 라이선스가 아니어서** 법적 명확성이 낮다.
- Unity 5(C#), 2인 맞고, 컴퓨터 대전만 된다. `engine/CGostopEngine.cs`(737줄)는 `CARD_EVENT_TYPE`(KISS=쪽, PPUK, DDADAK, CLEAN=쓸, BOMB, SHAKING, EAT_PPUK)으로 이벤트를 분류한다. 로컬 서버와 패킷 프로토콜 구조(`CLocalServer`, `protocol.cs`)로 클라이언트와 엔진을 분리한 점은 P2P 구조와 닮았다.
- 한계: 테스트가 없다. 점수 계산에 **피박, 광박, 멍박 정산이 없다.** 보너스 카드와 총통이 없다. 8년째 정체 상태다.
- 판정: **부분 참고.** "엔진은 로컬 서버, UI는 패킷 수신자"라는 구조 아이디어와, 숫자가 표시된 단순화 카드 이미지(자유 사용 문구 있음) 정도만 참고한다.

### 2.8 reidlindsay/gostop — 회피
- URL: https://github.com/reidlindsay/gostop, MIT, ★11, 최근 커밋 2017-06-25(Travis CI 시절)
- `GameState`가 합법 `GameAction` 목록을 반환하는 고전적 상태 패턴은 깔끔하다. 하지만 뻑, 따닥, 박 등 특수 규칙이 **거의 구현되지 않은 미완성**이다(엔진 335줄).
- 판정: **회피.**

### 2.9 k-culture-play/gostop-guide — 부분 참고(해설)
- URL: https://github.com/k-culture-play/gostop-guide (사이트: https://gostopguide.com/gostop), 코드 MIT, ★2
- 게임 엔진이 아니라 고스톱 시각 해설 사이트다(점수 계산기 `score-calculator.tsx`, 족보, 특수 규칙 섹션). hwatu-gostop-rl이 규칙 출처로 인용한다.
- 카드 PNG는 Commons `Hwatu012.svg`(Pk0001 등의 "민화 화투", CC BY-SA 4.0)를 잘라 쓴 것이다. NOTICE.md에 재사용 조건이 정리되어 있다.
- 판정: **부분 참고.** 규칙 설명 UX와 점수 계산기 UI 참고용이다.

### 2.10 guansanghai/KoiKoi-AI — 부분 참고(인접 게임 AI)
- URL: https://github.com/guansanghai/KoiKoi-AI, MIT, ★21, 최근 2025-07-22
- 일본 코이코이(고스톱과 같은 화투 계열의 낚시형 게임)에서 Transformer와 몬테카를로 RL로 학습한 AI다. 논문은 Guan et al., "Learning to Play Koi-Koi Hanafuda Card Games With Transformers", IEEE Transactions on AI 4(6), 2023(https://ieeexplore.ieee.org/document/10032777). 숙련자 상대로 승률 53%를 보고했다.
- 규칙이 달라 엔진 참고 대상은 아니다. **카드 상태 토큰화, 다판(multi-round) 보상 설계**는 CPU AI 고도화 단계에서 읽을 만하다.

### 2.11 boardgame.io (+ @boardgame.io/p2p) — 설계 개념 참고
- URL: https://github.com/boardgameio/boardgame.io (MIT, ★12.4k, 최근 2026-09-18), https://github.com/boardgameio/p2p (MIT, ★25, 최근 2023-11-03, "Experimental")
- 고스톱 구현은 아니다. 우리 구조(호스트 권위 + 원격 클라이언트)와 같은 문제를 푼 검증된 프레임워크라서 포함했다.
  - `playerView({G, ctx, playerID})`로 **플레이어별 비밀 상태를 제거한 뷰만 전송**한다. 기본 구현 `PlayerView.STRIP_SECRETS`가 있다(Context7 공식 문서로 확인).
  - `client: false` 이동은 비밀 상태를 쓰므로 클라이언트에서 낙관적 실행을 하지 않고 마스터에서만 실행한다.
  - master/client 구조와 낙관적 업데이트: 마스터가 권위 상태를 계산하고 클라이언트 예측을 덮어쓴다.
  - p2p 패키지: 호스트 클라이언트가 브라우저 안에서 권위 상태를 보유한다.
- 판정: **의존성으로는 채택하지 않는다.** p2p 패키지는 실험 단계이고 2023년 이후 정체다. WebRTC 시그널링이 필요해 기내 오프라인 구조와 맞지 않는다. 대신 **"권위 상태 G → 좌석별 playerView → 전송"** 패턴을 우리 WebSocket 프로토콜 설계에 그대로 적용한다.

### 2.12 제외 목록(요약)
검토했으나 아래 이유로 참고하지 않는다.

| 저장소 | 사유 |
|---|---|
| hongddo324/gostop, akunim84-blip/hwatu-game, michaeldslim/hwatu-game, joseph-jy/go-stop, hannavii/gostop, sigco3111/gostop, Kosmos12138/huatu, zerosynn/circuit-matgo, StockHedge/matgo-pocket, Hosung99/GO-STOP-, leebyeungkok/GoStopGame(Java, 유튜브 강좌), mpark2021/gostop-AI, nook247/GoStop-client-public, kmax2001/GoSTOP, amandania/GoStop | **LICENSE 없음.** 일부는 테스트가 있지만 법적으로 차용할 수 없고, 대부분 2026년 단기 제작물이다. |
| cmh1027/matgo (Python, MIT, 2018) | 테스트가 없다. pygame UI와 로직이 결합되어 있다. |
| ALee1303/Hwatu (C# MonoGame, MIT, 2018) | 테스트가 없다. 민화투 중심이고 고스톱 규칙은 일부만 있다. |
| makesitgo/hwatu, wfus/gostop, riotlead/lightseller, iyagicom/GoStopIyagi | 사실상 빈 저장소이거나 README만 있다. |
| tdubuke98/gostop, ZeroFriends/GoStopCalculator, gostoptools/* (GPL-3.0) | 오프라인 판의 점수 기록기나 계산기라서 엔진이 아니다. |
| 10kindrat/matgo, JiminLeexkrj/MatgoWebApp (MIT) | 테스트가 없다. 소규모 단일 파일 구현이다. |
| @fudapop/hanafuda-js, matsuokakoki/hanahuda | 일본 코이코이 규칙이다(후자는 라이선스도 없다). |

---

## 3. 구현 간 규칙 불일치 표(교차 검증 결과)

같은 "고스톱"이라도 구현마다 판정이 다르다. 우리 엔진에서 **옵션으로 둘 항목**과 **테스트 벡터로 고정할 항목**을 고르는 근거로 쓴다.

| 항목 | 한게임 신맞고 | itsent-lab | bipark(civilian7) | ctbot000 | tscz | hwatu-gostop-rl |
|---|---|---|---|---|---|---|
| 2인 딜(손/바닥) | 10/8 | 10/8 | 10/8 | 10/8 | 10/8 | **10/6(오류)** |
| 3고 이상 | (점수+고)×2^(고-2) | 동일 | 동일 | 가산 최대 2점 | **×2, ×6, ×24(오류)** | +1/고, 3고부터 ×2^ |
| 피박 | 상대 피 ≤7(승자 피 10+) | 1~7장 | 1~7장(0장 면제) | **<7** | **없음** | **<5** |
| 광박 | 광 3+로 승리, 상대 광 0 | 동일(+5광이면 무조건) | 광 점수 있음 + 상대 0 | 동일 | **없음** | 동일 |
| 멍박/멍따 | 열끗 7+면 ×2(상대 무관) | 동일 | 상대 열끗 0 조건 | 상대 열끗 0 조건 | **없음** | 7+ |
| 따닥 정의 | (바닥 2장 + 손패 + 뒤집기 같은 월) | 올바름 | 올바름 | **오류(서로 다른 두 쌍)** | 대체로 올바름(테스트 기준) | 올바름 |
| 12월 비띠 | 띠 장수에 포함 | 포함 | 포함 | 포함 | **제외(오류)** | 포함 |
| 보너스 카드 | 있음(맞고 50장) | 있음 | 있음(쌍피 2 + 3피) | 없음 | 없음 | 없음 |
| 나가리 이월 | 다음 판 ×2 | 있음 | 있음 | 없음 | 없음 | 상수만 있음 |

---

## 4. 오픈 라이선스 화투 이미지

### 4.1 결론
- **CC0나 MIT 같은 "무조건 자유" 화투 48장 세트는 찾지 못했다.** Wikimedia Commons의 화투·하나후다 SVG는 확인한 범위에서 모두 **CC BY-SA 4.0**이다. OpenGameArt에는 하나후다 CC0 세트가 없고 요청 글만 있다(https://opengameart.org/forumtopic/hanafuda-cards-request). `nojhan/hanafuda` SVG는 LICENSE가 없어 사용할 수 없다.
- 실사용 후보는 아래와 같다.

| 세트 | 형식 | 저작자 | 라이선스 | 비고 |
|---|---|---|---|---|
| Commons **"SVG Hwatu"** (https://commons.wikimedia.org/wiki/Category:SVG_Hwatu) | 개별 SVG 48장(+flipped 변형 4, overview 1) | 개별 파일: **Spenĉjo**(2024-12-12, overview에서 추출·최적화). 원본 overview: **Marcus Richert**(2021-02-22). 기반: **Louie Mantia, Jr.**의 Hanafuda 그래픽 | **CC BY-SA 4.0** (파일 페이지에서 확인) | 한국 화투 색감으로 다시 그렸다(11월 똥, 12월 비). itsent-lab, tscz, ctbot000, civilian7, akunim84 등 대부분이 사용한다. **1순위.** |
| Commons "PNG Hwatu" (48장) | PNG | 위와 동일 | CC BY-SA 4.0 | Commons가 SVG 사용을 권장한다. |
| Commons "SVG Hwatu (with Japanese-style artwork)" (48장) | SVG | Louie Mantia 계열 | CC BY-SA 4.0(계열 확인, 개별 파일 재확인 필요) | 일본식 도안이다. |
| Commons `Hwatu001~012.svg` "민화 화투" | 월별 시트 SVG | Pk0001(+huzinger827) | CC BY-SA 4.0 | 창작 민화 스타일이라 전통 도안과 다르다. gostop-guide가 사용한다. |
| sunduk/freegostop 카드 이미지 | PNG 아틀라스 | sunduk | README 문구로 "상업·비상업 자유"(표준 라이선스 없음) | 숫자가 표시된 단순화 도안이다. 법적 명확성이 낮아 **예비 후보.** |
| civilian7/gostop `bonus_*`, `back_*` | SVG/PNG | civilian7 | README에는 "자체 제작, 자유 사용"이라고 되어 있으나 저장소 전체가 PolyForm NC | 명시적 라이선스가 충돌하므로 **사용하지 않는다.** |

### 4.2 CC BY-SA 4.0 사용 시 준수 사항(우리 앱 기준)
1. **저작자 표시**: 앱 안의 크레딧 화면과 저장소 `ATTRIBUTION`에 적는다. 예: "Hwatu card art by Spenĉjo, Marcus Richert, based on Hanafuda graphics by Louie Mantia, Jr. — Wikimedia Commons, CC BY-SA 4.0". 원본 링크와 변경 여부도 표기한다. ctbot000처럼 저작자를 일부만 적는 실수를 피한다.
2. **동일조건(ShareAlike)은 이미지와 그 변형물에만 적용된다.** 엔진과 UI 코드는 별개 저작물이므로 MIT 등으로 유지할 수 있다. itsent-lab과 ctbot000이 이렇게 분리 고지한다. 카드 위에 숫자나 표식을 **런타임에 덧그리는** 방식(ctbot000의 `art.js`)을 쓰면 원본 SVG를 수정하지 않아도 된다.
3. SVG를 수정해서 배포하면 수정본도 CC BY-SA 4.0으로 공개해야 한다. 파일명 변경이나 공백 압축 같은 기계적 변경은 표기만 해 둔다.
4. **보너스 카드 3장(2피·2피·3피)과 카드 뒷면은 Commons 세트에 없다. 직접 제작한다.** 우리 저작물로 CC0나 MIT로 공개하면 라이선스가 깔끔해진다.
5. 기내 오프라인 요구 때문에 SVG는 앱 번들에 포함한다(CDN 금지). SVG 48장 전체 용량과 최적화(SVGO) 여부는 구현 단계에서 확인한다.

---

## 5. 엔진 설계 관련 읽을 거리

| 자료 | 내용 | 가치 |
|---|---|---|
| itsent-lab/hwatu `docs/game-rules.md`, `docs/game-rule-test-vectors.md` | 한국어 규칙 정본과 크로스플랫폼 규칙 벡터 운영 기준 | 높음. 테스트 벡터 계약 방식은 그대로 차용할 가치가 있다. |
| civilian7/gostop `docs/game-rules.md`, `docs/ai-monte-carlo.md`, `docs/ai-opponent.md` | 구현 규칙 정본, 결정화 몬테카를로 AI 설계 | 높음(읽기만). intend.md의 ISMCTS/결정화 방향과 직결된다. |
| yubyunghun/hwatu-gostop-rl `RULES.md`, README "RL approach" | 규칙 상수 고정 문서화, 결정 지점별 step, 합법 수 마스크, 자기중심 관측 | 중간. 문서화 방식과 RL 인터페이스만 본다(규칙 값에는 오류가 있다). |
| pagat.com Go-Stop (https://www.pagat.com/fishing/gostop.html) | 영어권에서 가장 신중한 규칙 정리. 변형(국진 1/2피, 조커, 3인 보상 등)을 명시한다. | 중간. 변형 목록 확인용이다. 피박 5장 기준 등 한국 상용 룰과 다른 부분이 있다. |
| boardgame.io 문서: Secret State / Multiplayer (https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/secret-state.md) | playerView, 마스터 권위, 낙관적 업데이트, 비밀 상태 이동 | 높음. 호스트 권위 P2P 프로토콜 설계에 직접 쓸 수 있다. |
| Guan et al., IEEE TAI 2023 (KoiKoi-AI) | 화투 계열 게임의 RL 기반 AI | 낮음~중간. AI 고도화 단계용이다. |

> 한국어 "고스톱 엔진 상태 머신 설계" 기술 글은 신뢰할 만한 것을 찾지 못했다(검색 결과가 포럼 질문이나 광고성 글이다). 상태 머신 설계는 위 구현들의 phase 정의(itsent-lab `phase: 'playing' | 'awaiting-go-stop' | 'awaiting-chongtong' | 'round-ended'`, bipark `GamePhase.AwaitingFlipChoice` 등)와 boardgame.io의 phase/stage 개념을 종합해 우리 쪽에서 새로 정의하는 편이 낫다.

---

## 6. 채택 권고

### 6.1 읽을 저장소(우선순위)
1. **itsent-lab/hwatu (MIT)**: 코드 차용이 가능한 유일한 "구조와 테스트를 갖춘" 참고원이다.
2. **bipark/gostop-ts (PolyForm NC, 읽기 전용)**: 규칙 커버리지, 옵션화, 이벤트 모델이 가장 완성도 높다. 코드는 복사하지 않고 설계와 테스트 시나리오 **아이디어만** 가져온다. 원작 civilian7/gostop의 `docs/`도 함께 읽는다.
3. **ctbot000/go-stop-game (MIT)**: 시드 재현 PRNG, 이벤트 반환 엔진, 불변식 테스트만 참고한다. 규칙 판정은 참고하지 않는다.

### 6.2 구체적으로 가져올 것
**데이터 모델**
- 카드 = 불변 ID(`m01-01` 또는 `m01-gwang`) + 정적 카탈로그. 상태에는 **ID 배열만** 두고 JSON 직렬화할 수 있게 한다(itsent-lab, ctbot000). WebSocket 전송, 저장, 리플레이에 유리하다.
- 카드 메타는 `month`, `kind`(광/열끗/띠/피/보너스), `junkValue`(1/2/3), `ribbon`(홍/청/초/없음), `isGodori`, `isBiGwang`, `isGukjin` 같은 **플래그 필드**로 둔다(bipark `HwatuCard`). 태그 문자열보다 타입 안전하다.
- 좌석은 `human`/`computer`나 `player`/`ai`로 하드코딩하지 않고 **좌석 인덱스(0, 1)** 로 둔다. P2P 대칭성을 확보하고 CPU를 어느 좌석에나 앉힐 수 있게 하기 위해서다(bipark는 인덱스 기반, itsent와 tscz는 반면교사).

**엔진 구조**
- 순수 함수 `reduce(state, action) → { state, events[] }`. ctbot000과 bipark의 "이벤트 로그" 모델을 합친 형태로, 이벤트는 UI 애니메이션, 효과음, 통계, AI 재현 검증에 공통으로 쓴다.
- 대기 결정은 명시적 phase로 표현한다. 바닥 2장 선택, 뒤집기 2장 선택, 흔들기/폭탄 선언, 국진 선택, 고/스톱, 총통 선택이 해당한다. `legalActions(state, seat)`를 단일 진실원으로 둔다(hwatu-gostop-rl의 `pending_decision`/`legal_options` 개념). UI, CPU AI, 네트워크 검증이 모두 이 함수를 쓴다.
- 시드 PRNG를 상태에 저장한다(ctbot000, bipark). intend.md의 commit-reveal 셔플과 결합하면 양측 시드로 결정적 셔플이 되고 리플레이도 된다.
- 호스트 권위 + `playerView(state, seat)`로 상대 손패와 더미 순서를 제거한 뷰만 전송한다(boardgame.io 패턴).

**점수·정산**
- `ScoreOptions`(bipark)처럼 **지역 룰을 설정값으로** 둔다. 3장의 불일치 표에 나온 항목(피박 기준·0장 면제, 멍박 상대 조건, 5광 광박, 고 가산점 방식, 보너스 카드 효과)은 모두 옵션으로 만들고 기본값은 `rules-commercial.md`의 상용 기준을 따른다.
- 국진은 승자 최고점 해석과 패자 피박 회피 해석을 분리한다(bipark `evaluate`/`evaluateAsLoser`). 사용자 선택 UI를 붙일지는 규칙 문서에서 결정한다.
- 정산 결과에 **단계별 `steps[]`**(기본 → 고 → 고 배수 → 흔들기·폭탄 → 박 → 나가리 이월)를 포함한다(itsent-lab). 정산 화면 설명과 테스트 기대값이 이 한 곳에서 나온다.

**테스트**
- **플랫폼 중립 JSON 규칙 벡터**(itsent-lab `game-rule-vectors-v1.json` 방식)를 둔다. 사례마다 `id`, `operation`, `input`, `expected`(부분 일치), 한국어 `description`을 적는다. 나중에 BLE 네이티브 경로나 다른 언어 구현이 생겨도 같은 벡터로 검증할 수 있다. 벡터의 기대값은 반드시 **상용 규칙 문서(rules-commercial.md)에서 도출**하고, 다른 오픈소스 구현의 출력을 기대값으로 쓰지 않는다.
- 시나리오 헬퍼로 손패, 바닥, 더미를 직접 세팅하는 테스트를 만든다(bipark `engine(hands, floor, stock)`). 뻑, 자뻑, 첫뻑, 연뻑, 3뻑, 쪽, 따닥, 쓸, 폭탄, 흔들기, 총통, 보너스 연쇄 뒤집기, 마지막 패 예외를 각각 **정상 사례, 경계 사례, 적용되지 않아야 하는 반례**로 쓴다(itsent-lab 운영 기준).
- 불변식·속성 테스트로 시드 N천 판 AI 대 AI 완주를 돌려 카드 보존(48+보너스), 제로섬 정산, 같은 시드면 같은 결과인지 확인한다(ctbot000, bipark).
- 따닥 반례 테스트("서로 다른 월 두 쌍 먹기는 따닥이 아니다")를 꼭 넣는다. ctbot000에서 실제로 발견된 오류 유형이다.

### 6.3 피할 것
- **라이선스 없는 저장소의 코드**(hwatu-gostop-rl 포함, 2.12 목록)와 **PolyForm NC 코드의 복사**(bipark, civilian7). 읽고 설계를 이해하는 데까지만 허용한다.
- **다른 구현의 테스트를 규칙 근거로 삼는 것.** ctbot000(따닥)과 tscz(고 배수, 비띠, 박 누락)는 테스트가 모두 통과하는데도 규칙이 틀렸다. 규칙 근거는 상용 기준 문서 하나로 통일한다.
- 사람 대 컴퓨터로 하드코딩된 상태 모델(itsent-lab 맞고, tscz). P2P 2인 대칭 구조와 맞지 않는다.
- hwatu-gostop-rl의 규칙 상수(바닥 6장, 피박 <5 등)와 pagat 변형 값을 기본값으로 쓰는 것.
- 저작자 표기가 불완전한 채로 Commons 이미지를 쓰는 것(ctbot000 사례). 저작자 3명(Spenĉjo, Marcus Richert, Louie Mantia, Jr.)과 CC BY-SA 4.0 링크를 반드시 표기한다.
- civilian7의 "자유 사용" 보너스·뒷면 이미지(저장소 라이선스와 충돌). 보너스 카드와 뒷면은 직접 제작한다.
- boardgame.io p2p를 의존성으로 채택하는 것(실험 단계, 정체, WebRTC 시그널링 필요). 패턴만 가져온다.

---

## 부록: 확인 로그
- 직접 실행한 테스트:
  - bipark/gostop-ts: vitest 115/115 통과
  - itsent-lab/hwatu: 규칙 관련 8개 파일 109/109 통과
  - tscz/gostop: 123/123 통과
  - ctbot000/go-stop-game: `node --test` 30/30 통과
- 규칙 대조 원문: 한게임 신맞고 가이드 "게임규칙/점수 계산 방법" 페이지(10장/8장 딜, 고 배수, 멍따, 독박, 피박 7장 이하, 광박, 총통 10점, 3연뻑, 나가리 2배)
- 이미지 라이선스 확인 페이지:
  - https://commons.wikimedia.org/wiki/File:Hwatu_January_Hikari.svg (Spenĉjo, CC BY-SA 4.0)
  - https://commons.wikimedia.org/wiki/File:Hwatu_overview.svg (Marcus Richert, CC BY-SA 4.0)
  - https://commons.wikimedia.org/wiki/File:Hwatu_April_Kasu_1.png (Marcus Richert·Louie Mantia Jr., CC BY-SA 4.0)
  - https://commons.wikimedia.org/wiki/File:Hanafuda_January_Hikari_Alt.svg (Louie Mantia·すけじょ, CC BY-SA 4.0)
  - https://commons.wikimedia.org/wiki/File:Hwatu012.svg (Pk0001, CC BY-SA 4.0)
