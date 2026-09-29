# 규칙 벡터 대응표 (M1)

작성: 2026-09-28 · 갱신: 2026-09-28(M1 리뷰 `docs/reviews/README.md` 반영, 결정 D1~D4), 2026-09-28(plan 3-2 트랙 E1: 공개 손패 `revealed`, 검증 생략 경로 `applyUnchecked`, 밀기, `matchPreview`, 피·국진 표적 벡터) · 근거: `docs/research/rules-commercial.md` 12장(규범), 13장(불일치 → 토글), §10.1(밀기) · 요구사항: spec AC-01, AC-02, FR-12, AI-03, plan M1·E1

- 벡터 파일: `packages/engine/test/vectors/*.json`(deal·bonus·score·events·gostop·settle, E1 트랙의 push(밀기)·view(공개 손패·미리보기)·pi(피 가치·국진 표적)), 실행기: `packages/engine/test/vector-harness.ts`, 테스트: `packages/engine/test/vectors.test.ts`. 실행기는 받아들여진 모든 액션을 `applyUnchecked`로도 적용해 `reduce`와 상태·이벤트가 같은지 확인한다.
- 벡터 스키마: `id`, `ruleId`(R/B/S/E/G/M), `case`(normal 정상 / boundary 경계 / counter 반례), `toggle`(13장 토글 값, 선택), `description`(한국어), `preset`·`rulesPatch`, `setup`(손패·바닥·뻑 무더기·더미 순서·획득 패·좌석 카운터) 또는 `deal`(시드·선·고정 덱·선 고르기 후보), `actions[]`, `expect`(상태·이벤트 부분 일치, 정산 steps(밀기 단계는 `origin: "push"`), 원장, 합법 수, 스톱 미리보기, 거부 사유, 좌석의 공개 손패 `revealed`, 뷰의 공개 손패와 `unseenCards` 제외 `revealedView`, `matchPreview`).
- 카드는 이름(`1광`, `5피a`, `11쌍피`, `B2a` 등, `packages/engine/src/names.ts`)이나 숫자 ID로 쓴다. 기대값은 12장 표에서 직접 도출했고 다른 구현의 출력은 쓰지 않았다.
- 결정 D1~D4(spec v0.5 변경 이력, M1 리뷰 F-2·F-5·F-7)로 기대값이 바뀐 벡터와 새 벡터는 설명에 "결정 Dn"을 적었다. 해석 9·13·14·3과 "고정 점수 승리" 절 참조.
- 도달 가능성: 모든 `setup`은 실제 판에서 도달할 수 있는 상태여야 한다. 고 횟수 n이면 마지막 고 점수 ≥ 6 + n(고는 7점부터, 재고는 +1점마다)이고 스톱 시 점수 ≥ 마지막 고 점수 + 1이다(F-12에서 `G3-*`·`G4-no-go-bak`·`G10-go-and-bak`·`M3-no-fee`를 고침).
- 테스트가 강제하는 것: 12.1~12.6의 모든 항목(R1~R7, B1~B5, S1~S5, E1~E14, G1~G10, M1~M4)에 벡터가 1개 이상 있을 것, 특수 이벤트(E1·E2·E4·E5·E6·E7·E8·E9·E11·E12·B2)마다 정상·경계·반례가 모두 있을 것, 13장 토글 값과 12.7 엔진 토글 값(밀기 `push=true/false` 포함)마다 벡터가 있을 것, 따닥 반례 `E6-two-pairs-not-ttadak`이 있을 것.
- 속성 테스트(`packages/engine/test/properties.test.ts` + `step-checks.ts`): 기본 1,000판(+ 선 고르기부터 100판), `ENGINE_FULL=1`이면 10,000판(+ 1,000판). 판마다 카드 보존·더미 부족 없음·제로섬·배수 곱·결정론·좌석 대칭, 그리고 **매 수마다** 입력 상태 deepFreeze 후 `reduce`(불변성), 무작위·형태 오류 액션 4개의 수락 여부 = `legalActions` 포함 여부(거부), 두 좌석 뷰의 숨은 정보 무관성과 상대 이벤트의 숨은 카드 검사(누출), 실제 숨은 정보로 `determinize` → 원래 상태·무작위 표본(공개 손패를 뺀 숨은 손패 형식) → 같은 합법 수(결정화), 뷰·이벤트 16KB 이하(NP-07). E1 트랙에서 더한 것: **매 수** `applyUnchecked` ≡ `reduce`(적용 전 상태·같은 액션 → 같은 상태·이벤트, 기본 1,000판에 약 2만 수, `ENGINE_FULL`이면 10,000판), 공개 손패 = 이벤트(흔들기·총통 끝내기)로 공개된 카드 ∩ 손패(독립 추적), 상대 공개 손패가 `unseenCards`에 없음, 무작위 카드 내기 하나의 `matchPreview`가 실제 적용 결과(대상 선택·흔들기 질문·먹은 카드)와 맞음, 점수 분해(모든 상태에서 total = 항목 합·피 점수 = max(0, 피 장수 − 9), 턴 경계에서 장수 필드 = 획득 패 독립 계산(피 장수 = 카드 가치 합 + 쌍피로 둔 국진 2)·저장 점수 = `seatScore` 재계산, 턴 시작에 어느 좌석도 고/스톱 문턱 이상이 아님 = 묻지 않고 지나간 턴 없음). **판마다** 밀기 정산 불변식(해석 30)과 "승자 기본점수 = 정산에 쓴 국진 위치의 족보 합계 + 고 가산(표시 위치와 같으면 표시 합계 + 고 가산)". 판이 끝나면 무작위 정책이 밀기가 가능한 승자로 절반쯤 민다(연속 밀기 0~2판에서 시작). 테스트 끝에 각 경로(밀기, 공개 손패, 미리보기 6종)를 실제로 지났는지 센다.

총 227개. 규칙별 개수: R1 3, R2 1, R3 2, R4 8, R5 2, R6 4, R7 3, B1 4, B2 4, B3 4, B4 4, B5 5, S1 5, S2 5, S3 6, S4 6, S5 15, E1 4, E2 6, E3 3, E4 10, E5 5, E6 9, E7 3, E8 6, E9 6, E10 3, E11 10, E12 11, E13 3, E14 3, G1 5, G2 3, G3 6, G4 3, G5 1, G6 8, G7 2, G8 2, G9 7, G10 18, M1 3, M2 3, M3 1, M4 2

| 규칙 | 벡터 ID | 사례 | 토글 | 설명 | 파일 |
|---|---|---|---|---|---|
| R1 | `R1-deck-51` | 정상 | `bonusCards=3` | 표준 덱은 48장 + 보너스 3장(2피·2피·3피) = 51장: 손패 10·10, 바닥 8, 더미 23 | deal |
| R1 | `R1-deck-50` | 경계 | `bonusCards=2` | 보너스 2장(2피·3피) 구성이면 50장: 더미 22 | deal |
| R1 | `R1-deck-48` | 경계 | `bonusCards=0` | 보너스 0장 구성이면 48장: 더미 20 | deal |
| R2 | `R2-deal-dealer-first` | 정상 |  | 분배는 손패 각 10, 바닥 8, 더미 23. 선(좌석 1)이 먼저 10장을 받고 먼저 친다 | deal |
| R3 | `R3-floor-bonus` | 정상 |  | 분배 때 바닥에 깔린 보너스는 선이 즉시 가져가고 더미에서 1장을 보충한다 | deal |
| R3 | `R3-floor-bonus-chain` | 경계 |  | 보충한 패가 또 보너스면 그것도 선이 가져가고 다시 보충한다 | deal |
| R4 | `R4-first-pick-month` | 정상 | `firstDealer=pickCard` | 첫 판 선 고르기: 각자 1장을 골라 높은 월이 선 (5월 vs 9월 → 9월을 고른 좌석 1이 선) | deal |
| R4 | `R4-first-pick-bonus` | 경계 |  | 보너스를 고르면 12월보다도 우선해 무조건 선 | deal |
| R4 | `R4-first-pick-tie` | 경계 |  | 같은 월을 고르면 다시 고른다 (동월 처리는 문서 없음 → 자체 결정: 새 후보로 재선택) | deal |
| R4 | `R4-first-pick-tie-cap` | 경계 |  | 동월이 3번 연속이면 더 고르지 않고 시드 난수로 선을 정한다 (자체 결정) | deal |
| R4 | `R4-first-pick-night` | 정상 | `firstDealer=timeOfDay` | 밤일낮장(밤): 낮은 월이 선 (5월 vs 9월 → 5월을 고른 좌석 0이 선) | deal |
| R4 | `R4-first-pick-day` | 반례 | `firstDealer=timeOfDay` | 밤일낮장(낮): 패 고르기와 같이 높은 월이 선 | deal |
| R4 | `R4-first-pick-rps-stub` | 반례 | `firstDealer=rockPaperScissors` | 가위바위보는 P2 미구현: 패 고르기(높은 월)로 대체된다 | deal |
| R4 | `R4-first-pick-same-index` | 반례 |  | 상대가 이미 고른 카드는 고를 수 없다 | deal |
| R5 | `R5-next-dealer-winner` | 정상 |  | 다음 판 선은 직전 판 승자 | settle |
| R5 | `R5-next-dealer-nagari` | 경계 |  | 나가리면 선을 유지한다 | settle |
| R6 | `R6-floor-chongtong-nagari` | 정상 | `floorChongtong=nagari` | 바닥 8장에 같은 월 4장(바닥 총통)이면 나가리, 다음 판 ×2 | deal |
| R6 | `R6-floor-chongtong-dealer-wins` | 경계 | `floorChongtong=dealerWins` | 바닥 총통 '선 승리' 토글: 선이 총통 점수(10점)로 이긴다 | deal |
| R6 | `R6-floor-chongtong-redeal` | 경계 | `floorChongtong=redeal` | 바닥 총통 '재분배(배수 없음)' 토글: 시드 난수로 다시 섞어 나눈다 | deal |
| R6 | `R6-no-floor-chongtong` | 반례 |  | 바닥에 같은 월 3장은 총통이 아니다(자연뻑 무더기로 둔다, R7) | deal |
| R7 | `R7-natural-ppeok` | 정상 | `naturalPpeokSteal=true` | 분배 때 바닥에 깔린 같은 월 3장(자연뻑)은 한 무더기로, 먹는 사람이 4장과 상대 피 1장 | bonus |
| R7 | `R7-natural-ppeok-no-steal` | 반례 | `naturalPpeokSteal=false` | 자연뻑 '뺏기 없음' 토글: 4장은 먹지만 피를 뺏지 않는다 | bonus |
| R7 | `R7-natural-ppeok-by-flip` | 경계 |  | 자연뻑 무더기는 뒤집은 패로도 먹는다 | bonus |
| B1 | `B1-hand-bonus` | 정상 | `bonusSteal=true` | 손패 보너스를 내면 즉시 획득하고 상대 피 1장을 뺏은 뒤 더미 1장을 손패로 받아 같은 턴에 다시 낸다 | bonus |
| B1 | `B1-hand-bonus-traditional` | 반례 | `bonusSteal=false` | 정통(보너스 뺏기 끔): 보너스를 내도 피를 뺏지 않는다. 획득·보충·다시 내기는 같다 | bonus |
| B1 | `B1-bonus-last-card` | 경계 |  | 마지막 손패가 보너스여도 보충받은 1장을 다시 내고 뒤집는다 (그 턴이 마지막 턴) | bonus |
| B1 | `B1-preview-bonus` | 경계 |  | 미리보기: 보너스 카드는 바닥과 맞추지 않고 바로 획득한다(bonus) | view |
| B2 | `B2-flip-bonus` | 정상 |  | 더미에서 보너스가 뒤집히면 획득(뺏기)하고 한 장 더 뒤집는다 | bonus |
| B2 | `B2-flip-bonus-chain` | 경계 |  | 보너스가 연달아 뒤집히면 모두 획득하고 장마다 뺏는다 | bonus |
| B2 | `B2-flip-bonus-buried-in-ppeok` | 경계 |  | 보너스를 뒤집고 이어진 뒤집기로 뻑이 나면 보너스도 뻑 무더기에 묻힌다(획득·뺏기 없음) | bonus |
| B2 | `B2-flip-bonus-last-turn` | 반례 |  | 마지막 턴에는 뻑이 성립하지 않으므로 뒤집은 보너스는 묻히지 않고 획득한다 | bonus |
| B3 | `R3-deal-steal-off` | 정상 | `dealFloorBonusSteal=false` | B3(d) 기본(끔): 분배 시 바닥 보너스를 가져가도 뺏기가 발동하지 않는다 | deal |
| B3 | `R3-deal-steal-on` | 경계 | `dealFloorBonusSteal=true` | B3(d) 켬: 분배 시점에는 상대 피가 0장이므로 뺏기는 무효(0장 무효 규칙) | deal |
| B3 | `B3-pile-bonus` | 정상 |  | B3(c): 뻑 무더기에 묻힌 보너스를 먹어도 뺏기가 발동한다(뻑 먹기 뺏기와 별도) | bonus |
| B3 | `B3-stolen-bonus-no-chain` | 반례 |  | 상대 획득 패에서 피로 뺏어온 보너스는 뺏기를 다시 발동하지 않는다 | bonus |
| B4 | `B4-lowest-plain-first` | 정상 |  | 뺏는 피는 가장 낮은 가치부터: 일반피가 있으면 일반피 | bonus |
| B4 | `B4-ssangpi-before-bonus` | 경계 |  | 일반피가 없으면 쌍피 → 보너스 2피 → 3피 순 (쌍피가 보너스 2피보다 먼저) | bonus |
| B4 | `B4-bonus2-before-bonus3` | 경계 |  | 보너스만 남으면 2피를 3피보다 먼저 준다 | bonus |
| B4 | `B4-zero-pi` | 반례 |  | 상대 피가 한 장도 없으면 뺏기는 무효 | bonus |
| B5 | `B5-bonus-chongtong-first-turn` | 정상 | `bonusChongtong=firstTurn` | 첫 턴에 보너스를 내고 받은 패로 같은 월 4장이 되면 총통 선택(끝내기/계속)을 묻는다 | bonus |
| B5 | `B5-bonus-chongtong-continue` | 정상 |  | 보너스 총통에서 계속하기를 고르면 같은 턴에 다시 내고, 4장 중 1장을 낼 때 흔들기를 물을 수 있다 | bonus |
| B5 | `B5-bonus-chongtong-later-turn` | 반례 | `bonusChongtong=firstTurn` | 첫 턴이 아니면(기본 '첫 턴만') 보너스로 만든 4장은 총통이 아니다 | bonus |
| B5 | `B5-bonus-chongtong-never` | 반례 | `bonusChongtong=never` | '불인정'(피망식): 첫 턴이라도 보너스로 만든 4장은 총통이 아니다 | bonus |
| B5 | `B5-bonus-chongtong-always` | 경계 | `bonusChongtong=always` | '항상 인정'(한게임식): 몇 번째 턴이든 보너스로 4장이 되면 총통 선택 | bonus |
| S1 | `S1-three-gwang` | 정상 |  | 비광 없는 광 3장은 3점 | score |
| S1 | `S1-bi-three-gwang` | 경계 |  | 비광이 섞인 광 3장(비삼광)은 2점 | score |
| S1 | `S1-four-gwang` | 정상 |  | 광 4장은 비광 포함 여부와 무관하게 4점 | score |
| S1 | `S1-five-gwang` | 정상 |  | 오광은 15점 | score |
| S1 | `S1-two-gwang` | 반례 |  | 광 2장은 0점 | score |
| S2 | `S2-five-yeol` | 정상 |  | 열끗 5장 1점 | score |
| S2 | `S2-six-yeol` | 경계 |  | 열끗 6장 2점(이후 1장당 +1) | score |
| S2 | `S2-four-yeol` | 반례 |  | 열끗 4장은 0점 | score |
| S2 | `S2-godori` | 정상 |  | 고도리(2·4·8월 새) 5점 | score |
| S2 | `S2-godori-missing` | 반례 |  | 새 2장은 고도리가 아니다 | score |
| S3 | `S3-five-tti` | 정상 |  | 띠 5장 1점 | score |
| S3 | `S3-hongdan` | 정상 |  | 홍단(1·2·3월 띠) 3점 | score |
| S3 | `S3-cheongdan` | 정상 |  | 청단(6·9·10월 띠) 3점 | score |
| S3 | `S3-chodan` | 정상 |  | 초단(4·5·7월 띠) 3점 | score |
| S3 | `S3-bi-tti-no-dan` | 반례 |  | 12월 띠(비띠)로는 초단을 만들 수 없다 | score |
| S3 | `S3-six-tti-with-dan` | 경계 |  | 띠 점수와 단 점수는 따로 더한다: 홍단 + 띠 6장 = 3 + 2 | score |
| S4 | `S4-ten-pi` | 정상 |  | 피 10장 1점 | score |
| S4 | `S4-nine-pi` | 반례 |  | 피 9장은 0점 | score |
| S4 | `S4-ssangpi-bonus` | 경계 |  | 쌍피 2, 보너스 2피 2, 3피 3으로 센다: 11쌍피+12쌍피+B2a+B3+일반피 2장 = 11 → 2점 | score |
| S4 | `S4-pi-value-crosses-ten` | 정상 |  | 피는 장수가 아니라 가치로 센다(12.3 S4 '11·12월 쌍피 = 2, 보너스 2피 = 2, 3피 = 3', §3 '피 10장(쌍피=2, …) 1점'): 11쌍피·3피·일반피 4장(9)에 5피 2장을 먹으면 8장이지만 가치 11 → 2점 | pi |
| S4 | `S4-nine-value-boundary` | 반례 |  | 피 가치 9는 0점: 11쌍피 + 일반피 7장 = 8장, 가치 9 (10부터 1점) | pi |
| S4 | `S4-bonus-and-ssangpi-values` | 경계 |  | 보너스 2피 2장(2+2) + 3피(3) + 11·12월 쌍피(2+2) = 5장, 가치 11 → 2점 | pi |
| S5 | `S5-gukjin-auto-pi` | 정상 |  | 국진 자동 최적: 쌍피로 옮겨 피 10이 되면 옮긴다 | score |
| S5 | `S5-gukjin-auto-yeol` | 경계 |  | 국진 자동 최적: 열끗 5장이 되면 열끗으로 둔다(피로 옮겨도 점수가 없을 때) | score |
| S5 | `S5-gukjin-ask-yeol` | 반례 |  | 국진 '매번 묻기'에서 열끗으로 두었으면 피로 세지 않는다 | score |
| S5 | `S5-gukjin-fixed-when-alone` | 경계 | `gukjin=auto` | 상대가 피를 뺏을 때 다른 피가 없고 국진만 있으면 국진은 열끗 자리에 고정(뺏기지 않음, S5 원문·결정 D1) | score |
| S5 | `S5-gukjin-ask-steal` | 경계 | `gukjin=ask` | '매번 묻기'로 국진을 쌍피로 두었고 다른 피(3피)가 있으면 국진쌍피가 3피보다 먼저 뺏긴다(B4 순위) | score |
| S5 | `S5-gukjin-ask-alone-fixed` | 반례 | `gukjin=ask` | '매번 묻기'에서 쌍피로 두었어도 국진이 유일한 피면 열끗으로 고정되어 뺏기지 않는다 | score |
| S5 | `S5-gukjin-ask-prompt` | 정상 | `gukjin=ask` | '매번 묻기'에서 국진을 먹으면 열끗/쌍피를 묻는다 | score |
| S5 | `S5-gukjin-avoid-pibak` | 정상 | `gukjin=auto` | 상대 스톱 시 패자 피가 7장 이하면 국진을 쌍피로 자동 이동해 피박을 피한다(6 + 2 = 8) | score |
| S5 | `S5-gukjin-winner-meongtta` | 경계 | `gukjin=auto` | 승자는 최종 점수가 커지도록 국진을 둔다: 열끗 7장(멍따 ×2)이 되면 열끗 | score |
| S5 | `S5-gukjin-auto-steal-when-pi` | 경계 | `gukjin=auto` | 자동 모드에서도 지금 점수가 국진을 쌍피로 세고(피 9 → 11) 다른 피가 있으면 쌍피와 같은 순위로 뺏긴다. 같은 순위는 ID 순이라 11·12월 쌍피보다 먼저(결정 D1, B4 "쌍피/국진쌍피") | score |
| S5 | `S5-gukjin-auto-no-steal-when-yeol` | 반례 | `gukjin=auto` | 지금 점수가 국진을 열끗으로 세면(열끗 5장 1점) 뺏기 후보가 아니다: 쌍피를 준다(결정 D1) | score |
| S5 | `S5-gukjin-auto-reaches-seven` | 정상 | `gukjin=auto` | 자동 최적(S5 '7점 도달 시 자동 이동'): 광 3 + 띠 6장 2 + 열끗 5장(국진 포함) 1 = 6점에서 피 2장을 먹어 피 가치 9가 되면, 국진을 쌍피로 옮겨 피 11(2점) + 열끗 4장(0) = 7점이 되므로 옮기고 고/스톱을 묻는다(열끗으로 두면 6점) | pi |
| S5 | `S5-gukjin-ask-no-auto-move` | 반례 | `gukjin=ask` | '매번 묻기'에서 열끗으로 두었으면 자동으로 옮기지 않는다: 같은 배치에서 6점이라 고/스톱을 묻지 않는다 | pi |
| S5 | `S5-gukjin-auto-tie-yeol` | 경계 | `gukjin=auto` | 옮겨도 총점이 같으면 열끗에 둔다(해석 29 '같으면 열끗'): 열끗 6장(2) + 피 8(0) = 2, 옮기면 열끗 5장(1) + 피 10(1) = 2 | pi |
| S5 | `S5-gukjin-godori-intact` | 경계 | `gukjin=auto` | 국진(9월)은 고도리 새(2·4·8월, S2)가 아니므로 쌍피로 옮겨도 고도리 5점은 그대로다: 열끗 5장 1 + 고도리 5 = 6 → 옮기면 고도리 5 + 피 11(2) = 7 | pi |
| E1 | `E1-ppeok` | 정상 |  | 낸 패로 바닥 1장을 먹으려는데 뒤집은 패도 같은 월이면 뻑: 세 장을 바닥에 남긴다 | events |
| E1 | `E1-ppeok-last-turn` | 경계 |  | 마지막 손패 턴에서는 뻑이 성립하지 않고 세 장을 모두 가져간다 | events |
| E1 | `E1-no-ppeok-other-month` | 반례 |  | 뒤집은 패가 다른 월이면 뻑이 아니다(낸 패로 먹고 뒤집은 패는 바닥에) | events |
| E1 | `E1-preview-take` | 정상 |  | 미리보기: 바닥 1장(5초)이면 그 1장을 먹는다(take). 뒤집은 카드가 같은 월이면 뻑이 될 수 있다 | view |
| E2 | `E2-ppeok-taken` | 정상 |  | 남이 싼 뻑을 4번째 패로 먹으면 상대 피 1장 | events |
| E2 | `E2-self-ppeok` | 정상 |  | 자뻑(자기가 싼 뻑을 자기가 먹음)은 상대 피 2장 | events |
| E2 | `E2-self-ppeok-ssangpi` | 경계 |  | 자뻑에서 첫 장이 쌍피 이상이면 그 1장으로 끝(쌍피·삼피는 한 장만) | events |
| E2 | `E2-self-ppeok-plain-then-ssangpi` | 경계 |  | 자뻑에서 첫 장이 일반피면 두 번째 장은 다음으로 낮은 쌍피 | events |
| E2 | `E2-ppeok-taken-zero-pi` | 반례 |  | 상대 피가 없으면 뻑을 먹어도 뺏을 피가 없다 | events |
| E2 | `E2-preview-pile` | 경계 |  | 미리보기: 뻑 무더기(5초·5열·5피a)는 4번째 패로 통째로 먹는다(pile) | view |
| E3 | `E3-last-turn-ppeok-take-no-steal` | 경계 | `lastTurnPpeokSteal=false` | 마지막 턴에 뻑을 먹으면 4장은 가져가지만 피는 뺏지 않는다(기본) | events |
| E3 | `E3-last-turn-ppeok-take-steal` | 정상 | `lastTurnPpeokSteal=true` | 피망식 토글: 마지막 턴 뻑 먹기도 피 1장을 뺏는다 | events |
| E3 | `E3-last-turn-natural-no-steal` | 반례 |  | 마지막 턴 예외는 자연뻑 무더기에도 같이 적용한다(자체 해석) | events |
| E4 | `E4-first-ppeok` | 정상 | `ppeokPayout=points` | 첫뻑(자기 첫 턴에 뻑)은 7점 × 점당을 즉시 받는다(점수와 별도) | events |
| E4 | `E4-second-ppeok` | 정상 |  | 연뻑(첫 턴·두 번째 턴 연속 뻑)은 14점 | events |
| E4 | `E4-first-ppeok-second-seat` | 경계 |  | 후공(좌석 1)도 자기 첫 턴에 뻑이면 첫뻑 | events |
| E4 | `E4-ppeok-not-from-first` | 반례 |  | 첫 턴에 뻑이 없었으면 두 번째 턴 뻑은 연뻑이 아니고 즉시 정산도 없다 | events |
| E4 | `E4-streak-broken` | 반례 |  | 첫 턴에 뻑이 없고 2·3번째 턴 뻑이면 3연뻑이 아니다 | events |
| E4 | `E4-base-multiple` | 정상 | `ppeokPayout=baseMultiple` | 넷마블식 토글: 첫뻑은 기본점수(맞고 7점, §5.8)×1 = 7점. 기본값과 같은 금액(결정 D3) | events |
| E4 | `E4-base-multiple-second` | 경계 | `ppeokPayout=baseMultiple` | 넷마블식 토글: 연뻑은 기본점수 7점×2 = 14점(결정 D3) | events |
| E4 | `E4-base-multiple-third` | 경계 | `ppeokPayout=baseMultiple` | 넷마블식 토글: 3연뻑은 7점×3 = 21점, 이어서 3뻑 승리 7점(결정 D3) | events |
| E4 | `E4-payout-off` | 반례 | `ppeokPayout=off` | 즉시 정산 끔: 첫뻑이어도 금액이 없다 | events |
| E4 | `E4-three-consecutive-49` | 경계 |  | 3연뻑: 7 + 14 + 21점 즉시 정산 후 3뻑 승리 7점 = 총 49점 | events |
| E5 | `E5-three-ppeok` | 정상 | `threePpeokPoints=7` | 한 판에 뻑 3회(불연속 포함)면 7점으로 즉시 승리 | events |
| E5 | `E5-three-ppeok-no-multiplier` | 경계 |  | 3뻑 승리에는 판 안의 배수(흔들기·고박)를 적용하지 않지만 나가리 이월 ×4는 곱한다: 7×4 = 28, 다음 판 배수는 1(결정 D2, §8 "나가리 다음 판 무조건 ×2") | events |
| E5 | `E5-three-ppeok-jackpot` | 정상 | `jackpotRound=5x2` | 3뻑 승리에도 대박판 배수는 곱한다: 아케이드 5번째 판 7×2 = 14(결정 D2) | events |
| E5 | `E5-three-ppeok-10` | 정상 | `threePpeokPoints=10` | 넷마블·윈조이식 토글: 3뻑은 10점 | events |
| E5 | `E5-two-ppeok` | 반례 |  | 뻑 2회는 승리가 아니다 | events |
| E6 | `E6-ttadak` | 정상 |  | 바닥 2장 + 낸 패 + 뒤집은 패가 모두 같은 월이면 따닥: 4장 획득 + 피 1장 | events |
| E6 | `E6-first-ttadak` | 정상 | `firstTtadakPayout=true` | 첫따닥(자기 첫 턴 따닥)은 7점 즉시 정산 | events |
| E6 | `E6-first-ttadak-off` | 반례 | `firstTtadakPayout=false` | 피망식 토글(첫따닥 금액 없음): 따닥 피 1장만 | events |
| E6 | `E6-two-pairs-not-ttadak` | 반례 |  | 필수 반례: 서로 다른 월 두 쌍을 먹는 것(낸 패 5월 쌍 + 뒤집은 패 6월 쌍)은 따닥이 아니다 | events |
| E6 | `E6-ttadak-last-turn` | 경계 |  | 마지막 턴 따닥은 4장만 가져오고 따닥으로 치지 않는다(피 뺏기 없음) | events |
| E6 | `E6-target-prompt` | 경계 |  | 바닥에 같은 월 2장이 있을 때만 대상 선택을 묻는다(FR-13) | events |
| E6 | `E6-target-choice-matters` | 정상 |  | 대상 선택 후 뒤집은 패가 다른 월이면 고른 1장만 먹고 나머지는 바닥에 남는다 | events |
| E6 | `E6-flip-target` | 경계 |  | 뒤집은 패의 월에 바닥 2장이 있으면 뒤집은 뒤에도 대상 선택을 묻는다 | events |
| E6 | `E6-preview-choose` | 정상 |  | 미리보기: 바닥에 같은 월 2장(5초·5피a)이면 둘 중 하나를 고른다(choose) | view |
| E7 | `E7-jjok` | 정상 |  | 먹을 게 없어 낸 패를 뒤집은 패로 바로 먹으면 쪽: 피 1장 | events |
| E7 | `E7-jjok-last-turn` | 경계 |  | 마지막 턴 쪽은 2장만 먹고 피를 뺏지 않는다 | events |
| E7 | `E7-no-jjok` | 반례 |  | 뒤집은 패가 다른 월이면 쪽이 아니다(낸 패는 바닥에 남는다) | events |
| E8 | `E8-sseul` | 정상 |  | 바닥을 모두 쓸어가면 쓸: 피 1장 | events |
| E8 | `E8-sseul-with-jjok` | 경계 |  | 쪽과 쓸이 겹치면 각각 따로 뺏는다(피 2장) | events |
| E8 | `E8-sseul-with-ttadak` | 경계 |  | 따닥과 쓸이 겹치면 각각 따로 뺏는다(피 2장) | events |
| E8 | `E8-sseul-with-ppeok-take` | 경계 |  | 뻑 먹기와 쓸이 겹치면 각각 따로 뺏는다(피 2장) | events |
| E8 | `E8-sseul-last-turn` | 경계 |  | 마지막 턴 쓸은 피를 뺏지 않는다 | events |
| E8 | `E8-no-sseul` | 반례 |  | 바닥에 한 장이라도 남으면 쓸이 아니다 | events |
| E9 | `E9-bomb` | 정상 |  | 폭탄: 손패 같은 월 3장 + 바닥 1장을 한 번에 먹고 피 1장, 흔들기 1회(×2), 폭탄패 2장 | events |
| E9 | `E9-bomb-token-turn` | 경계 |  | 폭탄 후에는 폭탄패로 손패를 내지 않고 뒤집기만 하는 턴을 쓸 수 있다 | events |
| E9 | `E9-bomb-legal` | 경계 |  | 폭탄이 가능해도 한 장만 내는 것도 합법이다 | events |
| E9 | `E9-no-bomb-empty-floor` | 반례 |  | 바닥에 그 월이 없으면 폭탄이 아니다(흔들기 대상) | events |
| E9 | `E9-bomb-settle` | 정상 |  | 폭탄 1회는 승자 정산에 ×2 | events |
| E9 | `E9-bomb-not-revealed` | 반례 |  | 폭탄은 손패 3장을 공개하지만 곧바로 먹으므로 손에 남는 공개 카드가 없다 | view |
| E10 | `E10-two-card-bomb-off` | 반례 | `twoCardBomb=off` | 2장 폭탄은 기본 끔: 손패 2장 + 바닥 2장이어도 폭탄 불가 | events |
| E10 | `E10-two-card-bomb-no-multiplier` | 정상 | `twoCardBomb=noMultiplier` | 2장 폭탄 켬(한게임 수류탄식): 피 1장 + 폭탄패 1장, 배수 없음 | events |
| E10 | `E10-two-card-bomb-double` | 정상 | `twoCardBomb=double` | 2장 폭탄 켬(피망식 ×2): 흔들기로 처리해 배수 1회 | events |
| E11 | `E11-shake` | 정상 |  | 같은 월 3장을 쥐고 바닥에 그 월이 없을 때 그 패를 내면 흔들기 여부를 묻는다. 흔들면 3장을 보여주고 1회 기록 | events |
| E11 | `E11-shake-prompt` | 경계 |  | 흔들기 질문 중에는 흔들기 응답만 합법이다 | events |
| E11 | `E11-shake-decline` | 경계 |  | 흔들지 않기로 하면 배수 없이 그냥 낸다. 거절은 이벤트를 내지 않는다(F-1, 뷰 가림 규칙) | events |
| E11 | `E11-no-shake-other-card` | 반례 |  | 같은 월 3장이 있어도 다른 월 카드를 내면 흔들기를 묻지 않는다 | events |
| E11 | `E11-no-shake-floor-has-month` | 반례 |  | 바닥에 그 월이 있으면(폭탄 대상) 흔들기를 묻지 않는다 | events |
| E11 | `E11-shake-settle` | 정상 |  | 흔들기는 1회당 ×2, 두 번이면 ×4 (승자만) | events |
| E11 | `E11-shake-revealed` | 정상 |  | 흔들면 보여 준 같은 월 카드 중 아직 손에 있는 것(5초·5피a)이 공개 손패(revealed)가 되고, 상대 뷰의 보이지 않는 카드(unseenCards)에서 빠진다 | view |
| E11 | `E11-shake-revealed-shrinks` | 경계 |  | 공개 손패는 손에 남은 것만: 흔든 뒤 5초를 내면 공개 손패는 5피a 하나 | view |
| E11 | `E11-shake-decline-not-revealed` | 반례 |  | 흔들지 않으면 아무것도 공개되지 않는다(거절은 이벤트도 없다, 뷰 가림 규칙) | view |
| E11 | `E11-preview-shake` | 경계 |  | 미리보기: 같은 월 3장을 쥐고 바닥에 그 월이 없으면 놓이는 카드(place)이면서 흔들기 질문이 나온다(shake). 다른 월 카드는 아니다 | view |
| E12 | `E12-chongtong-prompt` | 정상 | `chongtongContinue=true` | 손패 같은 월 4장(총통)이면 끝내기/계속하기를 묻는다 | events |
| E12 | `E12-chongtong-end` | 정상 | `chongtongPoints=10` | 총통 끝내기는 10점 승리 | events |
| E12 | `E12-chongtong-7` | 정상 | `chongtongPoints=7` | 피망식 토글: 총통 7점 | events |
| E12 | `E12-chongtong-carry` | 경계 |  | 나가리 다음 판(×2)에 총통 끝내기면 20점 | events |
| E12 | `E12-chongtong-no-continue` | 경계 | `chongtongContinue=false` | 계속하기 불허 토글: 묻지 않고 즉시 총통 승리 | events |
| E12 | `E12-chongtong-continue` | 정상 |  | 계속하기를 고르면 판을 진행하고, 4장 중 1장을 내면 4장 흔들기를 물을 수 있다(흔들기+폭탄 ×4 경로). 계속하기는 이벤트가 없다(F-6) | events |
| E12 | `E12-chongtong-non-dealer` | 경계 |  | 후(좌석 1)의 총통도 첫 턴 전에 묻고, 계속하면 선부터 친다 | events |
| E12 | `E12-no-chongtong-three` | 반례 |  | 손패 같은 월 3장은 총통이 아니다 | events |
| E12 | `E12-chongtong-continue-not-revealed` | 반례 |  | 총통 계속하기는 공개가 아니다(F-6): 공개 손패 없음 | view |
| E12 | `E12-chongtong-four-shake-revealed` | 경계 |  | 총통 계속 후 4장 흔들기를 하면 4장이 공개되고, 낸 1광을 뺀 3장(1홍·1피a·1피b)이 공개 손패로 남는다 | view |
| E12 | `E12-chongtong-end-revealed` | 정상 |  | 총통 끝내기는 4장을 보여 주는 공개 이벤트다: 끝난 판의 공개 손패는 1월 4장 | view |
| E13 | `E13-both-chongtong-nagari` | 정상 | `bothChongtong=nagari` | 양측 총통은 나가리(다음 판 ×2) | events |
| E13 | `E13-both-chongtong-dealer` | 정상 | `bothChongtong=dealerWins` | 한게임식 토글: 양측 총통은 선 승리(총통 점수) | events |
| E13 | `E13-one-chongtong` | 반례 |  | 한쪽만 총통이면 양측 총통이 아니다 | events |
| E14 | `E14-hudang-off` | 반례 | `hudang=false` | 허당은 기본 끔: 5턴 연속 못 먹어도 판이 계속된다 | events |
| E14 | `E14-hudang-on` | 정상 | `hudang=true` | 허당 켬(한게임 구 맞고): 연속 5번 아무 패도 못 먹으면 7점이 되며 게임이 끝난다 | events |
| E14 | `E14-hudang-four` | 경계 | `hudang=true` | 허당 켬: 연속 4번까지는 끝나지 않는다 | events |
| G1 | `G1-seven-prompt` | 정상 |  | 7점이 되면 고/스톱을 묻는다(FR-14 미리보기 포함) | gostop |
| G1 | `G1-six-no-prompt` | 반례 |  | 6점이면 고/스톱을 묻지 않고 상대 턴으로 넘어간다 | gostop |
| G1 | `G1-go` | 정상 |  | 고를 부르면 고 횟수와 그 시점 점수를 기록하고 상대 턴으로 넘어간다 | gostop |
| G1 | `G1-stop` | 정상 |  | 스톱하면 판이 끝나고 그 점수로 정산한다 | gostop |
| G1 | `G1-auto-stop-last-card` | 경계 |  | 마지막 손패로 7점이 되면 더 칠 패가 없으므로 고 없이 자동 스톱(자체 결정) | gostop |
| G2 | `G2-rego-needs-increase` | 반례 |  | 고 이후에는 직전 고 점수(7)보다 1점 이상 올라야 다시 묻는다: 7 그대로면 묻지 않음 | gostop |
| G2 | `G2-rego-increase` | 정상 |  | 고 이후 8점이 되면 다시 고/스톱을 묻는다 | gostop |
| G2 | `G2-score-drop-after-steal` | 경계 |  | 고(8점) 후 상대 쪽으로 피를 뺏겨 7점이 된 뒤 1점을 되찾아 8점이면 아직 9점이 아니므로 묻지 않는다 | gostop |
| G3 | `G3-go-1` | 정상 | `goScoring=plusNAndDouble` | 1고 스톱: +1점 (배수 없음). 1고(7점) 뒤 8점: 8 + 1 = 9 | gostop |
| G3 | `G3-go-2` | 경계 | `goScoring=plusNAndDouble` | 2고 스톱: +2점 (배수 없음). 2고(8점) 뒤 9점: 9 + 2 = 11 | gostop |
| G3 | `G3-go-3` | 정상 | `goScoring=plusNAndDouble` | 3고 스톱: +3점, 3고부터 ×2^(n-2) = ×2. 3고(9점) 뒤 10점: (10 + 3)×2 = 26 | gostop |
| G3 | `G3-go-5` | 경계 | `goScoring=plusNAndDouble` | 5고 스톱: +5점, 3고부터 ×2^(n-2) = ×8. 5고(11점) 뒤 12점: (12 + 5)×8 = 136 | gostop |
| G3 | `G3-double-only-3` | 정상 | `goScoring=doubleOnly` | '3고부터 배수만' 토글: 3고는 가산 없이 ×2 (10×2 = 20) | gostop |
| G3 | `G3-double-only-2` | 경계 | `goScoring=doubleOnly` | '3고부터 배수만' 토글: 2고까지는 +n 가산 유지(자체 해석, 9 + 2 = 11) | gostop |
| G4 | `G4-go-bak` | 정상 |  | 고를 한 상대가 내 스톱으로 지면 고박 ×2 | gostop |
| G4 | `G4-go-bak-auto-stop` | 경계 |  | 마지막 패 자동 스톱으로 이겨도 상대가 고를 했으면 고박 | gostop |
| G4 | `G4-no-go-bak` | 반례 |  | 패자가 고를 하지 않았으면 고박이 아니다(승자 자신의 고는 무관) | gostop |
| G5 | `G5-reverse-go` | 정상 |  | 역고(상대가 고한 뒤 나도 나서 고)는 일반 고로 처리한다: 별도 배수 없음 | gostop |
| G6 | `G6-pibak` | 정상 | `piBakThreshold=7` | 승자가 피로 점수를 냈고 패자 피가 7장 이하면 피박 ×2 | gostop |
| G6 | `G6-pibak-eight` | 반례 |  | 패자 피 8장(보너스 2피 포함)이면 피박이 아니다 | gostop |
| G6 | `G6-pibak-zero-exempt` | 반례 | `piBakZeroExempt=true` | 패자 피가 0장이면 피박이 아니다(피망식 예외, 기본 켬) | gostop |
| G6 | `G6-pibak-zero-no-exempt` | 경계 | `piBakZeroExempt=false` | 0장 예외 끔: 패자 피 0장도 피박 | gostop |
| G6 | `G6-pibak-threshold-6` | 경계 | `piBakThreshold=6` | 피박 기준 6장 토글: 패자 피 7장이면 피박이 아니다 | gostop |
| G6 | `G6-no-pibak-without-pi-score` | 반례 |  | 승자가 피 점수 없이 이겼으면 패자 피가 적어도 피박이 아니다(광박은 적용) | gostop |
| G6 | `G6-pibak-counts-value` | 반례 | `piBakThreshold=7` | 피박 기준 '패자 피 7장 이하'(§7, 12.5 G6)의 장수도 S4와 같은 가치 기준이다: 패자가 4장(11쌍피·12쌍피·3피·일반피)뿐이어도 가치 8이면 피박이 아니다(7점 그대로) | pi |
| G6 | `G6-pibak-single-ssangpi` | 경계 |  | 패자 피가 쌍피 1장(가치 2)이면 0장 예외가 아니므로 피박: 7 × 2 = 14 | pi |
| G7 | `G7-gwangbak-bi` | 경계 |  | 비삼광(2점)으로 이겨도 광 점수이므로 패자 광 0장이면 광박 | gostop |
| G7 | `G7-no-gwangbak` | 반례 |  | 패자에게 광이 1장이라도 있으면 광박이 아니다 | gostop |
| G8 | `G8-meongtta` | 정상 |  | 승자 열끗 7장 이상이면 멍따 ×2 | gostop |
| G8 | `G8-no-meongtta` | 반례 |  | 열끗 6장이면 멍따가 아니다 | gostop |
| G9 | `G9-nagari` | 정상 |  | 모든 패를 쓸 때까지 아무도 나지 못하면 나가리: 다음 판 ×2 | gostop |
| G9 | `G9-nagari-go-no-increase` | 경계 |  | 고를 한 사람이 추가 점수를 못 내고 상대도 못 나면 나가리 | gostop |
| G9 | `G9-nagari-cap-8-carry-8` | 경계 | `nagariCap=8` | 나가리 배수 상한 ×8: 이번 판 ×8 나가리 → 다음 판 ×8 | gostop |
| G9 | `G9-nagari-cap-None-carry-8` | 정상 | `nagariCap=null` | 나가리 배수 상한 없음: 이번 판 ×8 나가리 → 다음 판 ×16 | gostop |
| G9 | `G9-nagari-cap-4-carry-4` | 경계 | `nagariCap=4` | 나가리 배수 상한 ×4: 이번 판 ×4 나가리 → 다음 판 ×4 | gostop |
| G9 | `G9-nagari-cap-16-carry-8` | 정상 | `nagariCap=16` | 나가리 배수 상한 ×16: 이번 판 ×8 나가리 → 다음 판 ×16 | gostop |
| G9 | `G9-carry-applied` | 정상 |  | 나가리 다음 판에 점수가 나면 무조건 ×2 | gostop |
| G10 | `G10-all-multipliers` | 정상 |  | 배수는 모두 곱한다: 흔들기·폭탄·피박·광박·고박·나가리 = ×64 | gostop |
| G10 | `G10-go-and-bak` | 경계 |  | 고 가산 후 고 배수와 박을 곱한다: (10+3)×2×2 = 52 | gostop |
| G10 | `G10-jackpot` | 정상 | `jackpotRound=5x2` | 아케이드 대박판(5판마다 ×2): 5번째 판 승리는 ×2 | gostop |
| G10 | `G10-jackpot-off-round` | 반례 | `jackpotRound=5x2` | 대박판 주기가 아닌 판(4번째)은 배수 없음 | gostop |
| G10 | `G10-jackpot-disabled` | 반례 | `jackpotRound=null` | 표준(대박판 끔)은 5번째 판도 배수 없음 | gostop |
| G10 | `G10-push-forfeit` | 정상 | `push=true` | 밀기(§10.1 한게임 신맞고, 12.7): 이긴 좌석(좌석 0, 7점)이 밀면 이번 판 정산을 포기해 돈이 오가지 않고, 다음 판은 ×2(연속 밀기 1회), 선은 승자 | push |
| G10 | `G10-push-next-round` | 정상 | `push=true` | 한 번 민 다음 판에 점수가 나면 ×2: 7 × 2 = 14. 밀기 배수는 그 판에서 소진된다(다음 판 연속 밀기 0) | push |
| G10 | `G10-push-second` | 경계 | `push=true` | 연속 두 번째 밀기: 이미 ×2인 판의 승리(14점)를 다시 밀면 다음 판은 ×4(§10.1 연속 2회까지) | push |
| G10 | `G10-push-x4` | 경계 | `push=true` | 두 번 민 판(×4)의 승리는 7 × 4 = 28이고, 이 판의 승자는 더 밀 수 없다(합법 수에 push 없음) | push |
| G10 | `G10-push-cap` | 반례 | `push=true` | 연속 3번째 밀기는 없다: 두 번 민 판의 승자가 밀려고 하면 거부(판 종료) | push |
| G10 | `G10-push-off` | 반례 | `push=false` | 밀기 끔(표준 기본값, 12.7 '끔'): 승자도 밀 수 없고 판 정산은 그대로다 | push |
| G10 | `G10-push-loser` | 반례 | `push=true` | 밀기는 이긴 사람만 한다: 진 좌석(1)의 밀기는 거부 | push |
| G10 | `G10-push-instant-kept` | 경계 | `push=true` | 밀어도 이미 받은 즉시 정산(첫뻑 7점)은 그대로다: 원장에는 첫뻑 700만 있고 판 정산(8점)은 없다 | push |
| G10 | `G10-push-nagari-keeps` | 경계 | `push=true` | 민 판(×2)이 나가리면 밀기 배수는 사라지지 않고 다음 판으로 이어지며 나가리 이월(×2)과 따로 곱한다(해석 30) | push |
| G10 | `G10-push-with-carry` | 정상 | `push=true` | 배수는 모두 곱한다: 나가리 이월 ×2 + 밀기 ×2 판의 7점 승리 = 28 (나가리 이월 → 밀기 순) | push |
| G10 | `G10-push-carry-consumed` | 경계 | `push=true` | 나가리 이월(×2) 판의 승리를 밀면 이월은 그 판(승자가 있는 판)에서 소진되고 다음 판은 밀기 ×2만 남는다(해석 30) | push |
| G10 | `G10-push-jackpot` | 경계 | `push=true` | 아케이드: 5번째 판(대박판 ×2)이 민 판(×2)이면 7 × 2 × 2 = 28 (밀기 → 대박판 순) | push |
| G10 | `G10-push-fixed-win` | 경계 | `push=true` | 고정 점수 승리(총통 끝내기 10점)에도 밀기 배수는 판 밖의 배수로 곱한다: 10 × 2 = 20. 그 승리도 밀 수 있다 | push |
| M1 | `M1-settle-money` | 정상 |  | 정산액 = 최종점수 × 점당 (7점 × 100) | settle |
| M1 | `M1-instant-separate` | 경계 |  | 즉시 정산(첫뻑 7점)은 판 정산과 별도 원장 항목: 7 × 50 | settle |
| M1 | `M1-nagari-no-money` | 반례 |  | 나가리는 돈이 오가지 않는다 | settle |
| M2 | `M2-cap-loser-balance` | 경계 |  | 획득 상한은 패자 잔액(올인): 57,600 요구 → 패자 잔액 20,000만 이동 | settle |
| M2 | `M2-limited-liability` | 정상 | `limitedLiability=true` | 유한책임제 선택: 승자 보유액(5,000)까지만 획득 | settle |
| M2 | `M2-no-cap-needed` | 반례 | `limitedLiability=false` | 잔액이 충분하면 상한이 걸리지 않는다(유한책임제 끔이면 승자 잔액 무관) | settle |
| M3 | `M3-no-fee` | 정상 |  | 수수료 없음: 승자는 패자가 낸 금액을 그대로 받는다(9점 × 1000) | settle |
| M4 | `M4-stop-preview` | 정상 |  | 고/스톱 선택 시 스톱하면 받을 점수를 미리 계산해 보여준다(흔들기 1회면 14점) | settle |
| M4 | `M4-preview-with-pibak` | 경계 |  | 미리보기에도 박 배수가 반영된다(피박 → 14점) | settle |

## 13장 불일치 항목 → 토글 → 벡터

| 13장 | 토글 (`RuleOptions`) | 값별 벡터 |
|---|---|---|
| 1 총통 점수 | `chongtongPoints` 7 / **10** | `E12-chongtong-7`, `E12-chongtong-end` |
| 2 3뻑 점수 | `threePpeokPoints` **7** / 10 | `E5-three-ppeok`, `E5-three-ppeok-10` |
| 3 첫뻑 계열 금액 | `ppeokPayout` **points** / baseMultiple(기본점수 7 × n, 지금은 points와 같은 금액, 결정 D3) / off | `E4-first-ppeok`, `E4-base-multiple*`, `E4-payout-off` |
| 4 총통 계속 | `chongtongContinue` **true** / false | `E12-chongtong-prompt`, `E12-chongtong-no-continue` |
| 5 바닥·양측 총통 | `floorChongtong` **nagari** / dealerWins / redeal, `bothChongtong` **nagari** / dealerWins | `R6-*`, `E13-*` |
| 6 보너스로 만든 총통 | `bonusChongtong` never / **firstTurn** / always | `B5-*` |
| 7 2장 폭탄 | `twoCardBomb` **off** / noMultiplier / double | `E10-*` |
| 8 첫따닥 금액 | `firstTtadakPayout` **true** / false | `E6-first-ttadak`, `E6-first-ttadak-off` |
| 9 마지막 턴 뻑먹기 뺏기 | `lastTurnPpeokSteal` **false** / true | `E3-*` |
| 10 피박 0장 예외 | `piBakZeroExempt` **true** / false | `G6-pibak-zero-*` |
| 11 3고 이후 가산 | `goScoring` **plusNAndDouble** / doubleOnly | `G3-*` |
| 12 고박/독박 문구 | (토글 없음, 신맞고 ×2 채택) | `G4-*` |
| 13 뺏기 카드 | `bonusSteal` **true** / false, `dealFloorBonusSteal` **false** / true(2인에서는 효과 없음, 해석 3·결정 D4) | `B1-*`, `R3-deal-steal-*` |
| 14 대박판 | `jackpotRound` **null** / {every 5, ×2}(아케이드) | `G10-jackpot*` |
| 15 CPU 분배 가중치 | 없음(엔진은 시드 PRNG 균등 셔플만 한다) | 속성 테스트 |
| 16 선 고르기 동월 | (자체 결정, 아래 해석 1) | `R4-first-pick-tie`, `R4-first-pick-tie-cap` |

그 밖의 12.7 엔진 토글도 값마다 벡터가 있다: `bonusCards`(R1), `piBakThreshold`(G6), `nagariCap`(G9), `gukjin`(S5), `firstDealer`(R4), `naturalPpeokSteal`(R7), `hudang`(E14), `limitedLiability`(M2), `push`(밀기, G10 배수 결합 아래 `G10-push-*`, 해석 30).

## 엔진 설계 요약

- 공개 API(`packages/engine/src/index.ts`): `newRound(rules, seed, opts)`, `reduce(state, action)`, `applyUnchecked(state, action)`, `legalActions(state, seat)`, `playerView(state, seat, options?)`, `redactEvent(event, seat)`, `settle(state)`, `previewStop(state, seat)`, `matchPreview(stateOrView, seat, card)`, `determinize(view, sample, rng?)`, `unseenCards(view)`, `replay(rules, seed, actions, opts)`, `createLedger` / `applyInstantPayout` / `applySettlement`, `cardName` / `cardId`, 상수 `BASE_POINTS`(맞고 기본점수 7)·`MAX_PUSHES`(밀기 연속 상한 2).
- 플레이 보조 공개 API(spec FR-13·FR-46·FR-48, plan D2): `equivalentTargets(stateOrView, pending)`는 현재 play/flip target의 일반피 동등성과 최소 ID 대표를, `uniqueLegalAction(legal)`은 유일한 play/flipOnly만, `guaranteedCaptures(view)`는 자기 합법 play별 none/match/guaranteed 및 공개 이유를 반환한다. 확정 조건은 바닥에 같은 월 짝이 있고 `unseenCards(view)`와 상대 `revealed` 손패 양쪽에 그 월이 없는 것이다. `unseenCards`는 공개된 상대 손패를 제외하므로 CF09는 match(`opponentRevealedMonth`)다. 행동 실행·미래 획득/점수 예측은 하지 않는다.
- **검증 생략 경로 `applyUnchecked(state, action) → { state, events }`**(E1, ai-tuning §6-6): 형태·판 종료·합법 수 검사를 건너뛴다. **호출자가 합법성을 보장한다**(같은 상태의 `legalActions`가 낸 액션만). 합법 수에는 `reduce`와 상태·이벤트가 똑같고(속성 테스트·모든 벡터로 강제), 합법이 아닌 액션이면 결과는 정의되지 않는다. 롤아웃·결정화 탐색 전용이며 네트워크·UI 입력에는 `reduce`를 쓴다. 같은 트랙에서 점수 변화 판정(`ScoreChanged`를 낼지)을 `JSON.stringify` 비교에서 필드별 비교로 바꿔 `reduce`도 빨라졌다. 측정(`docker compose run --rm dev npm run bench -w packages/engine`, 표준 프리셋 무작위 3,000판 · 59,717수, Node 24 컨테이너): main의 `reduce` 약 226,000수/초 → 지금 `reduce` 약 310,000수/초 → `applyUnchecked` 약 430,000수/초(main 대비 ×1.9, 지금 `reduce` 대비 ×1.38). 합법 수 열거 + 무작위 선택까지 넣은 롤아웃은 9,600 → 12,300(`reduce`) → 14,500판/초(`applyUnchecked`, main 대비 ×1.5).
- **미리보기 `matchPreview(table, seat, card) → { kind, floor, shake }`**(FR-12, M1 리뷰 5.2): 낸 카드가 바닥에서 무엇을 먹는지(`place` 놓임 / `take` 1장 / `choose` 2장 중 선택 / `pile` 뻑·자연뻑 무더기 / `bonus` 보너스 획득)와 흔들기 질문 여부. `GameState`와 `PlayerView` 모두 받는다(뷰에서 상대 손패를 모르면 `shake`는 false). 낸 카드의 매칭(MATCH_PLAY)까지만이며 뒤집은 카드로 바뀌는 쪽·뻑·따닥은 예고하지 않는다(더미 순서는 비공개). 손패에 없는 카드면 `RangeError`.
- 테스트 도우미: `createScenario`(시나리오 배치)·`collectCards`는 `@p2p-gostop/engine/testing` 하위 경로로 쓴다. 호환을 위해 루트에도 남아 있다. `RoundOptions.deck`·`pickPools`도 테스트 전용 입력이다(M1 리뷰 F-10).
- **거부 방식**: `reduce`는 규칙 위반에 예외를 던지지 않고 `{ ok: false, reason: 'roundOver' | 'notYourTurn' | 'illegalAction', message }`를 돌려준다. 받아들이는 액션은 `legalActions`가 낸 것뿐이며(`sameAction`으로 비교) 규칙 검증은 `legal.ts` 한 곳에만 있다. 형태가 잘못된 입력(`null`, 알 수 없는 `type`, 좌석 `'0'`·`2`, 순환 객체)도 `illegalAction`이다(`reduce(state, null)`은 진행 중·끝난 판 모두 `illegalAction`, `api.test.ts` "reduce 형태 오류 입력"으로 확인). 끝난 판(`phase: 'end'`)에는 밀기(`push`, 승자만)만 받고 나머지는 `roundOver`다. 네트워크의 검증 전 JSON은 `reduce(state, input: unknown)` 시그니처로 그대로 넘길 수 있다(F-9). 예외는 엔진 버그(불변식 위반, 예: 더미 부족)에만 쓴다.
- **정산 규칙 인수**: `settle(state)`는 항상 `state.rules`를 쓴다. 예전 두 번째 인수는 호환용으로 받되 무시한다(F-10).
- 상태: `phase`(chooseFirst/turn/end), `seats[2]`(손패, 종류별 획득 패, 고 횟수·마지막 고 점수, 흔들기·폭탄·폭탄패, 뻑 턴 목록, 턴 수, 허당 카운터, 국진 위치, 점수 분해), `floor`(월별 무더기: loose / ppeok(소유 좌석) / natural), `deck`, `pending`(pickFirst·chongtong·play·shake·target·gukjin·goStop), `ctx`(진행 중 턴), `round`(판 번호·나가리 배수), `instantPayouts`, `result`, `rng`, `eventSeq`. 카드는 ID 0~50만.
- **뷰**(`PlayerView`): 상태에서 숨은 정보(아래 "뷰 가림 규칙")를 뺀 것 + 보는 좌석의 합법 수 `legal` + `stopPreview`. `SeatView`에는 결정화에 필요한 공개 카운터 `ppeokTurns`·`turnsTaken`·`noCaptureStreak`와 `gukjinAsPi`(묻기 모드 선택), 그리고 규칙상 공개된 손패 `revealed`(해석 31)가 있다. `PlayerView.round`는 `{ number, carry, pushes }`, 판이 끝난 뒤 `legal`에는 밀기가 가능한 승자에게만 `push`가 있다. `stopPreview`는 보는 좌석이 고/스톱 프롬프트 중일 때만 `{points, basePoints, multiplier, steps, perPoint, requested, money, capped}`이고 그 밖에는 `null`이다. 금액은 `playerView(state, seat, { perPoint })`면 점수 × 점당, `{ ledger }`면 원장 상한(M2)까지 적용한 실제 이동액이다(FR-14, F-4).
- **결정화**(F-3, AI-03): `unseenCards(view)`는 보는 좌석이 볼 수 없는 카드(상대의 **숨은** 손패 ∪ 더미, 선 고르기 중에는 덱 전체)다. 상대가 흔들기·총통 끝내기로 공개한 손패(`revealed`)는 보이는 카드라 빠진다(E1). `determinize(view, { opponentHand, deck, pending?, firstPickPool? }, rng?)`의 `opponentHand`는 숨은 손패(`handCount − revealed.length`장, 공개 카드는 결정화가 더함) 또는 호환용 전체 손패(`handCount`장, 공개 카드를 모두 포함해야 함)다. `determinize`는 뷰의 공개 정보와 표본으로 전체 `GameState`를 만든다(프롬프트·진행 중 턴·즉시 정산·이벤트 순번·카운터 포함). 표본이 뷰와 모순되면(장수·카드 집합, 가려진 상대 총통인데 손패에 같은 월 4장 없음) `RangeError`. 실제 숨은 정보와 실제 PRNG를 넣으면 원래 상태와 같고(테스트 전용 `round.fixedDeck`·`firstPick.nextPools`는 `null`·`[]`), 무작위 표본이면 보는 좌석의 합법 수가 같다(속성 테스트).
- 모듈: `cards`·`names`(카탈로그), `rng`·`deck`(PRNG), `rules`(옵션·프리셋), `deal`(선 고르기·분배), `turn`(턴 진행·해결), `capture`(획득·뺏기), `floor`, `score`, `settle`, `ledger`, `legal`, `reduce`, `view`, `determinize`, `replay`, `scenario`·`testing`.
- 정산 `steps[]` 순서: base → goBonus → goMultiplier → shake → bomb → piBak → gwangBak → meongtta → goBak → nagariCarry → jackpot(밀기, `origin: 'push'`) → jackpot(N판마다 대박판). `finalPoints = (add 합) × (mul 곱)`. 밀기 단계의 종류를 새로 만들지 않고 `jackpot` + `origin`으로 둔 것은 §10.1이 밀기를 "판 키우기(대박판) 장치"로 분류하고, protocol·web이 `SettleStepKind`를 미러한 타입(`view-types.ts`, `settle-labels.ts`)을 이 트랙에서 깨지 않기 위해서다. M6 UI가 라벨을 나눌 때 `'push'` 종류로 바꾸는 것을 검토한다.
- `Settlement`에 선택 필드 `pushed`·`forfeitedPoints`·`nextPushes`가 더해졌다(엔진이 만드는 정산에는 항상 있음, `tools/sim` 등 외부에서 만든 정산 리터럴과의 호환 때문에 선택). `applySettlement`는 `pushed`면 원장을 바꾸지 않는다. 다음 판은 `newRound(..., { pushes: settlement.nextPushes })`로 이어 붙인다.
- 이벤트: spec 4.5의 25종 + `Redealt`·`FirstPicked`·`FirstPickTie`·`CardDrawn`·`GukjinPlaced`·`Hudang`·`Placed`·`Pushed{pushes, multiplier, forfeitedPoints}`(E1). 밀기를 하면 `Pushed` 뒤에 포기한 정산으로 `Settled`를 한 번 더 낸다: 마지막 `Settled`가 유효하다. `Placed{source: 'play' | 'flip'}`는 낸 패·뒤집은 패가 먹지 못하고 바닥에 놓일 때 낸다(F-8: UI가 `Matched` 부재로 추론하지 않게). `Settled`는 점수 정산(`Settlement`)이며 원장 항목은 호출자가 `applySettlement`로 만든다.
- **메시지 크기(NP-07, F-14)**: 속성 테스트가 매 수마다 `PlayerView`와 `reduce` 한 번의 이벤트 묶음이 UTF-8 16KB 이하인지 검사한다. 한 판 전체 이벤트 로그는 `ScoreChanged`가 매번 전체 점수 분해를 실어 16KB에 가까워질 수 있으므로(표준 규칙 무작위 3,000판 측정: 한 판 전체 최대 14.7KB, `PlayerView` 최대 2.8KB, `reduce` 한 번 최대 1.9KB — `Placed` 추가 후), NP-03 재동기화는 이벤트 차이가 크면 스냅샷(`PlayerView`)을 보내는 쪽을 우선한다. `ScoreChanged` 형식은 호환을 위해 바꾸지 않았다. **E1 재검토(M1 리뷰 F-14) 결론: 유지.** (1) 웹 `display.ts`가 `breakdown.total`·`gukjinAsPi`로 점수·족보 진행도를 그리고, (2) NP-07은 메시지 하나의 상한인데 `reduce` 한 번의 이벤트 묶음은 최대 약 1.9KB이며(속성 테스트가 매 수 16KB 이하를 강제), (3) protocol `HostSession`의 재동기화가 이미 이벤트 40개 초과 또는 16KB 초과면 스냅샷(`PlayerView`)으로 바꾼다(`packages/protocol/src/session.ts`). 바뀐 필드만 보내는 형식은 소비자 세 곳을 함께 바꿔야 하는데 얻는 것이 없어 하지 않았다. 이 트랙에서 점수 비교를 필드별로 바꿔 계산 비용 쪽 문제는 없앴다.

## 뷰 가림 규칙 (누구에게 무엇을 가리는가)

`playerView(state, seat)`와 `redactEvent(event, seat)`의 계약. 속성 테스트가 "보는 좌석이 모르는 정보(상대 손패 배치·더미 순서·PRNG·선 고르기 후보)를 바꿔도 뷰가 똑같다"와 "상대에게 가는 이벤트에 아직 숨은 카드 ID가 없다"를 매 수 검사한다(M1 리뷰 F-1·F-6·F-11).

| 정보 | 본인 | 상대 | 방법 |
|---|---|---|---|
| 손패 카드 ID | 보임 | 장수만 | `SeatView.hand = null`, `handCount` |
| 더미 순서·PRNG | 가림 | 가림 | `deckCount`만, `rng` 없음 |
| 선 고르기 후보 | 가림 | 가림 | `poolSize`·`picks`·`ties`·`isNight`만. 고른 뒤 `FirstPicked`로 두 장 공개 |
| 보너스 보충으로 받은 카드(B1) | 보임 | 가림 | `CardDrawn` 이벤트의 `cards`를 상대에게 `[]`로 |
| 흔들기 프롬프트(E11) | `pending: shake{card, month}` | `pending: play` | 질문이 있었다는 사실만으로 뒤이어 낼 카드의 월에 3장 이상을 쥐었다는 것이 드러나므로 종류까지 가린다 |
| 흔들기 거절 | 액션으로 앎 | 모름 | 엔진이 이벤트를 내지 않는다. 흔들면 `Shake{accepted: true}`가 그 월 카드를 모두 공개(규칙상 공개) |
| 총통 프롬프트(E12), 차례인 좌석(선의 분배 직후 총통, B5 보너스 총통) | `pending: chongtong{months}` | `pending: play` | 첫 턴 전 선이 고르는 동안·같은 턴 안이라 기다림이 자연스럽다 |
| 총통 프롬프트, 선 첫 턴 전 후 좌석 | 위와 같음 | `pending: chongtong{months: []}` | 선이 첫 턴을 못 하고 기다리는 것 자체가 드러나므로 종류는 남기고 월만 가린다(피할 수 없는 누출) |
| 총통 계속하기 | 액션으로 앎 | 모름 | 엔진이 이벤트를 내지 않는다. 4장 흔들기를 고르면 그때 공개. 끝내기는 `Chongtong{choice: 'end'}`로 공개 |
| 스톱 미리보기 | 고/스톱 프롬프트 중에만 | `null` | 모두 공개 정보로 계산되지만 UI 계약상 행동하는 좌석에만 준다 |
| 공개 손패 `revealed`(E1) | 보임 | 보임 | 흔들기(`Shake{accepted: true}`)·총통 끝내기(`Chongtong` end·auto)로 이미 공개된 카드 중 손에 남은 것. 총통 계속하기는 넣지 않는다(위 행). 상대의 `unseenCards`에서 빠진다(해석 31) |

그 밖의 모든 것(바닥, 양측 획득 패, 뻑 무더기와 주인, 카운터, 진행 중 턴의 낸 패·뒤집은 패·들고 있는 보너스, 대상 선택 후보, 국진·고/스톱 프롬프트, 즉시 정산, 결과, 이벤트 순번)은 양쪽에 같게 보인다. 가림 때문에 순번(`seq`)에 빈틈이 생기는 일은 없다(가려야 할 이벤트는 아예 만들지 않는다).

## 해석 (규칙 문서가 침묵하거나 모호해서 엔진이 정한 것)

1. **선 고르기 동월(R4, 13장 16)**: 후보 8장(시드 셔플)에서 두 좌석이 서로 다른 자리를 고른다. 같은 월이면(보너스끼리도 같은 것으로 본다) 새 후보 8장으로 다시 고르고, 동월이 3번 연속이면 시드 PRNG로 선을 정한다. 밤일낮장은 엔진이 시각을 읽지 않으므로 호출자가 `isNight`를 넘긴다. 가위바위보는 P2 미구현이며 패 고르기로 대체된다.
2. **분배 순서(R2)**: 선 손패 10 → 후 손패 10 → 바닥 8 → 나머지 더미. 연출 순서는 결과와 무관하므로 단순화했다.
3. **분배 시 바닥 보너스 뺏기(B3(d), 결정 D4)**: 토글을 켜도 분배 시점에는 상대 피가 0장이라 항상 무효다(0장 무효 규칙). 따라서 **2인 맞고에서는 이 토글이 결과를 바꾸지 않는다**. 12.7 목록과 맞추기 위해 토글은 남겨 두되(3인 이상 확장이나 "첫 획득 때 지연 발동" 같은 재정의 여지), FR-21 설정 화면에는 노출하지 않거나 "2인에서는 효과 없음"으로 표시하는 것을 권한다(M1 리뷰 해석 3·F-7).
4. **바닥 총통 '재분배'(R6)**: 같은 판 안에서 시드 PRNG로 다시 섞어 나누고 나가리 배수는 바꾸지 않는다. 16회 연속이면 나가리로 끝낸다. '선 승리'의 점수는 총통 점수(`chongtongPoints`)를 쓴다.
5. **자연뻑(R7)**: 분배 직후 같은 월 3장만 자연뻑 무더기로 둔다(보충 후 판정). 소유자가 없으므로 자뻑이 되지 않는다. 마지막 턴 예외(E3)도 똑같이 적용한다.
6. **보너스 내기(B1)**: 턴을 소비하지 않는다. 턴 번호는 그 턴의 첫 액션(보너스 내기 포함)에서 센다. 보너스로 받은 패로 같은 월 4장이 되는 B5의 "첫 턴"은 **그 좌석의 자기 첫 턴**이다.
7. **뒤집은 보너스(B2)**: 뻑 여부가 이어진 뒤집기로 정해지므로, 뒤집은 보너스는 그 턴의 해결 단계에서 획득(뺏기 포함)하거나 뻑 무더기에 묻는다.
8. **뺏기 순위(B4)**: 일반피 → 쌍피·국진쌍피(같은 순위, B4 원문 "쌍피/국진쌍피") → 보너스 2피 → 보너스 3피, 같은 순위는 카드 ID 오름차순이라 국진쌍피(32)가 11쌍피(43)·12쌍피(47)보다 먼저다. 한 턴에 뺏기가 여럿이면 순서는 폭탄 → 보너스 획득 → 뻑 먹기/자뻑/자연뻑 → 따닥 → 쪽 → 쓸. (이전 판은 쌍피를 국진쌍피보다 먼저 주었는데, 그렇게 두면 자동 모드에서 국진이 뺏기는 경우가 수학적으로 생기지 않는다: 쌍피가 다 빠지고 나면 남는 피는 보너스 최대 7 + 국진 2 = 9라 국진이 피로 세어지지 않기 때문이다. 결정 D1의 뜻을 살리려고 같은 순위로 합쳤다.)
9. **국진(S5, 결정 D1)**: 자동 모드에서는 점수를 계산할 때마다 총점이 큰 쪽으로 세고(같으면 열끗), 정산 때는 승자가 최종 점수를 최대로(예: 열끗 7장 멍따), 패자가 최소로(예: 피박 회피) 고른다. **뺏기**: 뺏기 직전 획득 패로 다시 계산한 점수가 국진을 쌍피로 세고(자동 모드: 총점이 더 큰 쪽이 쌍피, 묻기 모드: 좌석이 쌍피를 고름) 피가 1장 이상 더 있으면 국진은 쌍피와 같은 순위(해석 8)의 뺏기 후보다. 국진이 유일한 피면 S5 원문("다른 피가 없으면 열끗 고정")대로 열끗에 고정되어 뺏기지 않는다. 점수는 쌍피로 세면서 뺏기는 면제받던 이전 해석(양쪽 이득)을 없앤 것이다. 뺏어온 국진은 쌍피로 둔다(`gukjinAsPi = true`, 자동 모드에서는 어차피 최적 위치로 센다). 벡터 `S5-gukjin-auto-steal-when-pi`·`S5-gukjin-auto-no-steal-when-yeol`·`S5-gukjin-fixed-when-alone`·`S5-gukjin-ask-steal`.
10. **마지막 턴(E1·E3·E6·E7·E8, 12.8)**: 그 턴이 끝나면 자기 손패 + 폭탄패가 0장인 턴. 이때 뻑은 불성립(3장 획득), 따닥·쪽·쓸은 카드만 먹고 이벤트·뺏기 없음.
11. **자뻑 2장(E2)**: 12.4의 자체 해석대로 "뺏은 가치 합이 2 이상이면 중단". 일반피 1장 다음 쌍피를 가져오는 것은 허용된다.
12. **마지막 턴 뻑 먹기(E3)**: 남의 뻑·자뻑·자연뻑 모두에 같은 예외를 적용한다.
13. **첫뻑·연뻑·3연뻑(E4, 결정 D3)**: 자기 1·2·3번째 턴에 끊김 없이 뻑일 때만. '기본점수×1/2/3'(넷마블식) 토글의 기본점수는 맞고의 기본점수 **7점**(`BASE_POINTS`, rules-commercial §5.8 "7점(맞고류 기본점수)", §6.3 넷마블 "기본점수 이상의 점수로 '고'")이다. 그래서 이 토글은 7/14/21점으로 **지금은 기본값 'points'와 같은 금액**이다. 토글은 기본점수 정의가 바뀔 때를 위해 남겨 두었고, FR-21 화면에서는 기본값과 같다고 표시하거나 숨기는 것을 권한다. 3연뻑이면 21점 즉시 정산 뒤 3뻑 승리(E5)도 성립한다(총 49점).
14. **3뻑(E5) "배수 미적용"(결정 D2)**: 판 안의 배수(고 가산·고 배수, 흔들기·폭탄, 피박·광박·멍따·고박)만 적용하지 않고, 나가리 이월과 대박판은 곱한다. 아래 "고정 점수 승리의 배수 규칙" 참조.
15. **첫따닥(E6)**: 자기 첫 턴의 따닥. 대상 선택은 spec 4.3 순서대로 낼 때 묻는다(뒤이어 따닥이 되면 선택과 무관하게 4장).
16. **쓸(E8)**: 이번 턴에 무엇이든 먹었고 해결 뒤 바닥(뻑 무더기 포함)이 비었으면 성립한다. 쪽으로 바닥이 비는 경우도 쪽·쓸 각각 뺏는다.
17. **폭탄(E9·E10)**: 배수는 정산의 `bomb` 단계로 따로 표기한다(흔들기와 같은 ×2/회). 폭탄패는 손패처럼 원하는 턴에 쓰는 뒤집기 전용 턴이다. 2장 폭탄 'double'은 폭탄 배수 1회로 센다.
18. **흔들기(E11)**: 같은 월 3장 이상을 쥐고 바닥에 그 월이 없을 때, 그 월 카드를 낼 때만 묻는다. 총통 계속 후 4장도 흔들 수 있다(흔들기 + 이후 폭탄 = ×4, E12 피망 경로).
19. **총통(E12)**: 분배 직후 첫 턴 전에(후 좌석이어도) 묻는다. 끝내기 점수는 "고정 점수 승리" 규칙을 따른다. 계속하기는 상대에게 이벤트를 내지 않고, 프롬프트도 차례인 좌석이면 카드 내기 대기로 보인다(뷰 가림 규칙).
20. **허당(E14, 기본 끔)**: 연속 5턴 아무것도 먹지 못한(보너스 획득도 먹은 것) 좌석이 7점으로 이기고 판이 끝난다. 배수는 "고정 점수 승리" 규칙을 따른다.
21. **자동 스톱(G1)**: 자기 손패(+폭탄패)가 없는 턴에 나거나 재고 조건을 채우면 더 칠 수 없으므로 고를 묻지 않고 스톱한다(`reason: autoStop`, 상대가 고를 했으면 고박 적용).
22. **'3고부터 배수만'(G3 토글)**: 1·2고의 +n 가산은 유지하고 3고부터 가산 없이 ×2^(n-2).
23. **나가리 배수(G9)**: 다음 판 배수 = min(이번 판 배수 × 2, 상한). 나가리 판에서 이미 받은 즉시 정산은 그대로 둔다. 판 종료 시 더미에 남은 보너스는 누구에게도 주지 않는다(12.8).
24. **원장(M1·M2)**: 즉시 정산도 판 정산과 같은 상한(지불자 잔액, 유한책임제면 받는 쪽 잔액)을 적용한다. 잔액은 음수가 되지 않는다.
25. **대박판**: 12.7 토글(P2)이지만 구현이 한 줄이라 넣었다: `round.number % every === 0`인 판의 승리에 ×k. 판 번호는 호출자가 `roundNumber`로 넘긴다.
26. **비공개 프롬프트의 상대 뷰(F-1·F-6)**: 흔들기·총통 프롬프트와 흔들기 거절·총통 계속하기가 상대에게 어떻게 보이는지는 위 "뷰 가림 규칙" 표가 규범이다.
27. **국진 '매번 묻기'의 시점**: 국진을 먹은 턴의 해결 직후 한 번만 묻고 이후에는 바꿀 수 없다. 피망의 "7점 도달 시·상대 고 시 선택창"((1)·(2))은 두지 않았다. 자동 모드가 그 역할(매 계산 최적, 정산 min-max)을 한다.
28. **폭탄 턴의 뻑**: 폭탄 턴(E9·E10)은 낸 카드 1장이 없으므로(손패 3장 또는 2장을 한꺼번에 먹음) 뒤집은 카드와 겹칠 "낸 패"가 없어 뻑이 생길 수 없다. 뒤집은 카드는 보통의 한 장 매칭(뻑 무더기 먹기 포함)만 한다. 폭탄패 턴도 같다.
29. **경기 중 점수와 정산의 국진 위치**: 경기 중 점수 표시(`SeatState.score`, `ScoreChanged`)와 G1·G2 고/스톱 문턱은 양 좌석 모두 "총점이 큰 쪽" 국진 위치로 계산한다(같으면 열끗). 정산만 승자 최대·패자 최소(min-max)를 쓴다(S5 "상대 스톱 시 피박 회피 자동 이동"). 그래서 패자의 표시 점수와 정산에 쓴 국진 위치(`Settlement.gukjinAsPi`)가 다를 수 있다.

30. **밀기(12.7 토글 `push`, rules-commercial §10.1 한게임 신맞고 "이긴 사람이 이번 판 정산을 포기하고 다음 판 ×2. 연속 2회까지(×4)" [H-신맞고PC/A])**: 끝난 판(`phase: 'end'`)에서 승자만 `push` 액션을 낼 수 있다(규칙이 켜져 있고, 아직 밀지 않았고, 이번 판까지 연속 밀기가 2회 미만). 프롬프트(`pending`)를 새로 만들지 않고 끝난 판의 선택 액션으로 둔 것은, 밀지 않는 경우에 액션이 필요 없어 기존 호출자(판이 끝나면 곧바로 정산을 원장에 넣는 web·sim·protocol)가 그대로 동작하고(`Pending` 종류를 늘리면 web `adapter.ts`의 전수 `switch`가 깨진다), 판 결과(`result`)가 이미 정해진 뒤의 선택이라 턴 상태 기계와 섞이지 않기 때문이다. 밀지 않기는 "액션 없음"이다: 밀기가 켜져 있으면 호출자가 승자의 선택을 기다린 뒤 원장에 넣는다. 세부:
    - 민 판의 정산: 돈이 오가지 않는다(`finalPoints` 0, `steps` 없음, `pushed: true`, `forfeitedPoints` = 포기한 점수, `applySettlement`는 원장을 바꾸지 않음). 이미 발생 시점에 원장에 넣은 즉시 정산(첫뻑 등)은 그대로다(벡터 `G10-push-instant-kept`). 다음 판 선은 승자(R5와 같음, `G10-push-forfeit`).
    - 배수: 다음 판에 `2^(연속 밀기 횟수)`를 판 밖의 배수로 곱한다(나가리 이월 뒤, 대박판 앞). 스톱 승리와 고정 점수 승리(3뻑·총통·허당·바닥/양측 총통 선 승리) 모두에 곱한다(`G10-push-fixed-win`, 아래 "고정 점수 승리의 배수 규칙"의 판 밖에서 온 배수).
    - 연속: "연속"은 미는 좌석과 무관하게 판 단위로 센다. 민 판의 승자가 또 밀면 2회(×4, `G10-push-second`), 2회 민 판의 승자는 밀 수 없다(`G10-push-cap`). 민 다음 판에 승자가 받으면(밀지 않으면) 밀기 배수는 소진되어 0으로 돌아간다(`G10-push-next-round`).
    - 나가리와의 관계: 민 판이 나가리면 밀기 배수는 사라지지 않고 다음 판으로 그대로 넘어가며(`nextPushes` 유지), 나가리 이월(G9, 상한 `nagariCap`)은 따로 두 배가 된다(`G10-push-nagari-keeps`). 키운 판돈은 승부가 날 때까지 유지된다는 뜻으로 읽었다(§8 "나가리 다음 판 ×2 누적"과 같은 방향). 밀기 배수에는 나가리 상한을 적용하지 않고 밀기 자체 상한(×4)만 둔다.
    - 이월을 안은 판을 밀 때: 나가리 이월(예: ×2)이 걸린 판의 승리를 밀면 이월은 그 판(승자가 있는 판)에서 소진되고(`nextCarry` 1) 다음 판에는 밀기 배수만 남는다(`G10-push-carry-consumed`). §8 "나가리 다음 판: 점수가 나면 ×2"에서 점수가 난 판은 이 판이기 때문이다.
    - 대박판(12.7)과는 곱한다: 5번째 판이 민 판이면 7 × 2 × 2 = 28(`G10-push-jackpot`).
    - 나무위키의 "밀기 배수 최대 ×8"[W-신맞고/C]은 공식 문서(×4, [H-신맞고PC/A])보다 신뢰도가 낮아 채택하지 않았다. "상대가 수락 않고 나가면 전판 머니 반환"은 세션 규칙이라 엔진 밖이다(M6 후속).
31. **공개 손패(`SeatState.revealed`, E1)**: 흔들기로 보여 준 카드(`Shake` 이벤트의 카드 = 그 월 손패 전부)와 총통 끝내기·자동 승리로 보여 준 카드 중 아직 손에 있는 것. 손을 떠나면(내기·폭탄) 빠진다. 폭탄의 손패 3장은 공개되지만 곧바로 먹으므로 남지 않는다(`E9-bomb-not-revealed`). 총통 계속하기는 공개가 아니다(F-6, `E12-chongtong-continue-not-revealed`). 계속 후 4장 흔들기를 하면 그때 4장이 공개된다(`E12-chongtong-four-shake-revealed`). 보너스로 받아 손에 들어온 같은 월 카드는 공개되지 않은 카드다. 결정화는 상대 손패 표본에서 공개 카드를 고정한다(ai-tuning §6-2 "흔들기로 공개된 카드는 이벤트에만 있고 뷰에는 없어서 엔진 API가 필요").
32. **피 장수는 카드 가치로 센다(S4·G6)**: 12.3 S4 "10장 1점 +1/장. 11·12월 쌍피 = 2, 보너스 2피 = 2, 3피 = 3", §3 "피 10장(쌍피=2, 2피 보너스=2, 3피 보너스=3) 1점"은 쌍피를 2장으로 세는 표기다. 그래서 피 점수의 "10장"은 가치 합 10이고(`S4-pi-value-crosses-ten`: 8장이지만 가치 11 → 2점, `S4-nine-value-boundary`: 가치 9 → 0점, `S4-bonus-and-ssangpi-values`: 5장 가치 11 → 2점), 같은 문서의 피박 "패자 피 7장 이하"(12.5 G6, §7 "패자 피가 **7장 이하**")도 같은 단위로 읽어 가치 합으로 센다(`G6-pibak-counts-value`: 4장이지만 가치 8이면 피박 아님, `G6-pibak-single-ssangpi`: 쌍피 1장(가치 2)은 0장 예외가 아니라 피박). 쌍피로 둔 국진도 가치 2다(S5 "쌍피"). 점수 분해의 `piCount`는 장수가 아니라 이 가치 합이다(속성 테스트가 매 턴 경계에서 획득 패로 독립 계산해 비교한다).
33. **국진 자동 위치(S5) 확인**: 자동 모드는 매 계산에서 총점이 큰 쪽(같으면 열끗)이다. 그래서 국진을 옮겨야 7점이 되면 옮기고 고/스톱을 묻고(S5 "7점 도달 시 자동 이동", `S5-gukjin-auto-reaches-seven`; 묻기 모드에서 열끗으로 두었으면 묻지 않음 `S5-gukjin-ask-no-auto-move`), 열끗 5·6장 경계에서 점수가 같으면 열끗에 둔다(`S5-gukjin-auto-tie-yeol`). 국진은 고도리 새(2·4·8월, S2)가 아니므로 옮겨도 고도리는 깨지지 않는다(`S5-gukjin-godori-intact`). 패자 피박 회피(`S5-gukjin-avoid-pibak`), 승자 멍따 유지(`S5-gukjin-winner-meongtta`), 유일한 피면 뺏기지 않음(`S5-gukjin-fixed-when-alone`), 쌍피로 세면 쌍피 순위로 뺏김(`S5-gukjin-auto-steal-when-pi`, 결정 D1)은 기존 벡터가 덮는다. E1 트랙의 표적 벡터·속성 검사에서 피 가치·국진·총점 계산의 엔진 결함은 나오지 않았다.

### 고정 점수 승리의 배수 규칙 (해석 14·19·20, 결정 D2)

3뻑(E5)·총통 끝내기(E12)·바닥 총통 선 승리(R6 토글)·양측 총통 선 승리(E13 토글)·허당(E14)은 족보 점수 대신 정해진 점수(3뻑 7/10, 총통 10/7, 허당 7)로 이긴다. 이때:

- **적용하지 않는 것**: 판 안에서 생긴 배수 — 고 가산·고 배수(G3), 흔들기·폭탄(E9·E11), 피박·광박·멍따·고박(G4·G6~G8). rules-commercial 12.4 E5 "배수 미적용", §5.1 표 피망 3뻑 "기본점수만(배수 불인정)"·§5.2 "한게임·피망 7점(배율 불인정)".
- **적용하는 것**: 판 밖에서 온 배수 — 나가리 이월(G9, §8 "나가리 다음 판: 점수가 나면 **무조건** ×2" [H/A, P-룰/A, N/B]), 밀기(12.7, §10.1, 해석 30)와 대박판(12.7). 이월 배수는 이 판에서 쓰이고 다음 판은 ×1로 돌아간다(`nextCarry = 1`, 승자가 있는 판이므로).
- 정산 `steps`: `base`(고정 점수) → `nagariCarry` → `jackpot`(밀기) → `jackpot`(대박판). 벡터 `E5-three-ppeok-no-multiplier`(7×4 = 28), `E5-three-ppeok-jackpot`(7×2 = 14), `E12-chongtong-carry`(10×2 = 20), `G10-push-fixed-win`(10×2 = 20).
- 이전 판은 3뻑만 이월까지 빼서 이월 배수가 3뻑 판에서 쓰이지도 넘어가지도 않고 사라졌다(M1 리뷰 F-5). 총통·허당과 한 규칙으로 맞췄다.

## M1 범위 밖 (후속)

- **P2 토글(타입만, 엔진 무시)**: `missions`(미션), `firstDealer: 'rockPaperScissors'`. 목록은 `UNIMPLEMENTED_RULES`. 밀기(`push`)는 E1 트랙에서 엔진에 구현했다(해석 30).
- **밀기의 엔진 밖 후속(M6)**: (1) protocol 액션 스키마(`packages/protocol/src/index.ts`)에 `{type: 'push'}`가 없어 게스트의 밀기는 지금 디코드 단계에서 거부된다. (2) 웹 솔로·호스트 세션은 판이 끝나면 첫 `Settled`로 바로 원장에 넣으므로 밀기 창이 없다: 밀기가 켜진 규칙이면 승자의 선택(밀기/받기)을 기다린 뒤 마지막 `Settled`(또는 `settle(state)`)를 원장에 넣고 `nextPushes`를 다음 판에 넘겨야 한다. (3) 정산 화면 라벨: `jackpot` + `origin: 'push'`를 "밀기 ×n"으로. (4) §10.1 "상대가 수락 않고 나가면 전판 머니 반환"은 세션(연결 종료) 규칙이라 엔진 밖이다.
- 로컬 설정(진행 속도·자동치기)은 `LocalPlayOptions`로 분리되어 엔진 결과와 무관하다.
- 세션 흐름(판 번호, 다음 판 선·나가리 배수 전달, 파산 시 재충전 선택)은 호출자(M3 web / M2 sim)가 `settle()`의 `nextDealer`·`nextCarry`로 이어 붙인다.
- 속성 테스트는 무작위 합법 정책이다. AI 대 AI 강도 벤치마크와 판당 정산액 분포(MN-03)는 M2(`tools/sim`)에서 한다.
