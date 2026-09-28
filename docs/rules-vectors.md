# 규칙 벡터 대응표 (M1)

작성: 2026-09-28 · 근거: `docs/research/rules-commercial.md` 12장(규범), 13장(불일치 → 토글) · 요구사항: spec AC-01, AC-02, plan M1

- 벡터 파일: `packages/engine/test/vectors/*.json`(deal·bonus·score·events·gostop·settle), 실행기: `packages/engine/test/vector-harness.ts`, 테스트: `packages/engine/test/vectors.test.ts`.
- 벡터 스키마: `id`, `ruleId`(R/B/S/E/G/M), `case`(normal 정상 / boundary 경계 / counter 반례), `toggle`(13장 토글 값, 선택), `description`(한국어), `preset`·`rulesPatch`, `setup`(손패·바닥·뻑 무더기·더미 순서·획득 패·좌석 카운터) 또는 `deal`(시드·선·고정 덱·선 고르기 후보), `actions[]`, `expect`(상태·이벤트 부분 일치, 정산 steps, 원장, 합법 수, 스톱 미리보기, 거부 사유).
- 카드는 이름(`1광`, `5피a`, `11쌍피`, `B2a` 등, `packages/engine/src/names.ts`)이나 숫자 ID로 쓴다. 기대값은 12장 표에서 직접 도출했고 다른 구현의 출력은 쓰지 않았다.
- 테스트가 강제하는 것: 12.1~12.6의 모든 항목(R1~R7, B1~B5, S1~S5, E1~E14, G1~G10, M1~M4)에 벡터가 1개 이상 있을 것, 특수 이벤트(E1·E2·E4·E5·E6·E7·E8·E9·E11·E12·B2)마다 정상·경계·반례가 모두 있을 것, 13장 토글 값마다 벡터가 있을 것, 따닥 반례 `E6-two-pairs-not-ttadak`이 있을 것.

총 189개. 규칙별 개수: R1 3, R2 1, R3 2, R4 8, R5 2, R6 4, R7 3, B1 3, B2 4, B3 4, B4 4, B5 5, S1 5, S2 5, S3 6, S4 3, S5 9, E1 3, E2 5, E3 3, E4 9, E5 4, E6 8, E7 3, E8 6, E9 5, E10 3, E11 6, E12 8, E13 3, E14 3, G1 5, G2 3, G3 6, G4 3, G5 1, G6 6, G7 2, G8 2, G9 7, G10 5, M1 3, M2 3, M3 1, M4 2

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
| S5 | `S5-gukjin-auto-pi` | 정상 |  | 국진 자동 최적: 쌍피로 옮겨 피 10이 되면 옮긴다 | score |
| S5 | `S5-gukjin-auto-yeol` | 경계 |  | 국진 자동 최적: 열끗 5장이 되면 열끗으로 둔다(피로 옮겨도 점수가 없을 때) | score |
| S5 | `S5-gukjin-ask-yeol` | 반례 |  | 국진 '매번 묻기'에서 열끗으로 두었으면 피로 세지 않는다 | score |
| S5 | `S5-gukjin-fixed-when-alone` | 경계 | `gukjin=auto` | 상대가 피를 뺏을 때 다른 피가 없고 국진만 있으면 국진은 열끗 자리에 고정(뺏기지 않음) | score |
| S5 | `S5-gukjin-ask-steal` | 경계 | `gukjin=ask` | '매번 묻기'로 국진을 쌍피로 두었고 다른 피(3피)가 있으면 국진쌍피가 3피보다 먼저 뺏긴다(B4 순위) | score |
| S5 | `S5-gukjin-ask-alone-fixed` | 반례 | `gukjin=ask` | '매번 묻기'에서 쌍피로 두었어도 국진이 유일한 피면 열끗으로 고정되어 뺏기지 않는다 | score |
| S5 | `S5-gukjin-ask-prompt` | 정상 | `gukjin=ask` | '매번 묻기'에서 국진을 먹으면 열끗/쌍피를 묻는다 | score |
| S5 | `S5-gukjin-avoid-pibak` | 정상 | `gukjin=auto` | 상대 스톱 시 패자 피가 7장 이하면 국진을 쌍피로 자동 이동해 피박을 피한다(6 + 2 = 8) | score |
| S5 | `S5-gukjin-winner-meongtta` | 경계 | `gukjin=auto` | 승자는 최종 점수가 커지도록 국진을 둔다: 열끗 7장(멍따 ×2)이 되면 열끗 | score |
| E1 | `E1-ppeok` | 정상 |  | 낸 패로 바닥 1장을 먹으려는데 뒤집은 패도 같은 월이면 뻑: 세 장을 바닥에 남긴다 | events |
| E1 | `E1-ppeok-last-turn` | 경계 |  | 마지막 손패 턴에서는 뻑이 성립하지 않고 세 장을 모두 가져간다 | events |
| E1 | `E1-no-ppeok-other-month` | 반례 |  | 뒤집은 패가 다른 월이면 뻑이 아니다(낸 패로 먹고 뒤집은 패는 바닥에) | events |
| E2 | `E2-ppeok-taken` | 정상 |  | 남이 싼 뻑을 4번째 패로 먹으면 상대 피 1장 | events |
| E2 | `E2-self-ppeok` | 정상 |  | 자뻑(자기가 싼 뻑을 자기가 먹음)은 상대 피 2장 | events |
| E2 | `E2-self-ppeok-ssangpi` | 경계 |  | 자뻑에서 첫 장이 쌍피 이상이면 그 1장으로 끝(쌍피·삼피는 한 장만) | events |
| E2 | `E2-self-ppeok-plain-then-ssangpi` | 경계 |  | 자뻑에서 첫 장이 일반피면 두 번째 장은 다음으로 낮은 쌍피 | events |
| E2 | `E2-ppeok-taken-zero-pi` | 반례 |  | 상대 피가 없으면 뻑을 먹어도 뺏을 피가 없다 | events |
| E3 | `E3-last-turn-ppeok-take-no-steal` | 경계 | `lastTurnPpeokSteal=false` | 마지막 턴에 뻑을 먹으면 4장은 가져가지만 피는 뺏지 않는다(기본) | events |
| E3 | `E3-last-turn-ppeok-take-steal` | 정상 | `lastTurnPpeokSteal=true` | 피망식 토글: 마지막 턴 뻑 먹기도 피 1장을 뺏는다 | events |
| E3 | `E3-last-turn-natural-no-steal` | 반례 |  | 마지막 턴 예외는 자연뻑 무더기에도 같이 적용한다(자체 해석) | events |
| E4 | `E4-first-ppeok` | 정상 | `ppeokPayout=points` | 첫뻑(자기 첫 턴에 뻑)은 7점 × 점당을 즉시 받는다(점수와 별도) | events |
| E4 | `E4-second-ppeok` | 정상 |  | 연뻑(첫 턴·두 번째 턴 연속 뻑)은 14점 | events |
| E4 | `E4-first-ppeok-second-seat` | 경계 |  | 후공(좌석 1)도 자기 첫 턴에 뻑이면 첫뻑 | events |
| E4 | `E4-ppeok-not-from-first` | 반례 |  | 첫 턴에 뻑이 없었으면 두 번째 턴 뻑은 연뻑이 아니고 즉시 정산도 없다 | events |
| E4 | `E4-streak-broken` | 반례 |  | 첫 턴에 뻑이 없고 2·3번째 턴 뻑이면 3연뻑이 아니다 | events |
| E4 | `E4-base-multiple` | 정상 | `ppeokPayout=baseMultiple` | 넷마블식 토글: 첫뻑은 기본점수×1(1점) | events |
| E4 | `E4-base-multiple-second` | 경계 | `ppeokPayout=baseMultiple` | 넷마블식 토글: 연뻑은 기본점수×2(2점) | events |
| E4 | `E4-payout-off` | 반례 | `ppeokPayout=off` | 즉시 정산 끔: 첫뻑이어도 금액이 없다 | events |
| E4 | `E4-three-consecutive-49` | 경계 |  | 3연뻑: 7 + 14 + 21점 즉시 정산 후 3뻑 승리 7점 = 총 49점 | events |
| E5 | `E5-three-ppeok` | 정상 | `threePpeokPoints=7` | 한 판에 뻑 3회(불연속 포함)면 7점으로 즉시 승리 | events |
| E5 | `E5-three-ppeok-no-multiplier` | 경계 |  | 3뻑 승리에는 배수를 적용하지 않는다(나가리 이월 ×4·흔들기가 있어도 7점) | events |
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
| E10 | `E10-two-card-bomb-off` | 반례 | `twoCardBomb=off` | 2장 폭탄은 기본 끔: 손패 2장 + 바닥 2장이어도 폭탄 불가 | events |
| E10 | `E10-two-card-bomb-no-multiplier` | 정상 | `twoCardBomb=noMultiplier` | 2장 폭탄 켬(한게임 수류탄식): 피 1장 + 폭탄패 1장, 배수 없음 | events |
| E10 | `E10-two-card-bomb-double` | 정상 | `twoCardBomb=double` | 2장 폭탄 켬(피망식 ×2): 흔들기로 처리해 배수 1회 | events |
| E11 | `E11-shake` | 정상 |  | 같은 월 3장을 쥐고 바닥에 그 월이 없을 때 그 패를 내면 흔들기 여부를 묻는다. 흔들면 3장을 보여주고 1회 기록 | events |
| E11 | `E11-shake-prompt` | 경계 |  | 흔들기 질문 중에는 흔들기 응답만 합법이다 | events |
| E11 | `E11-shake-decline` | 경계 |  | 흔들지 않기로 하면 배수 없이 그냥 낸다 | events |
| E11 | `E11-no-shake-other-card` | 반례 |  | 같은 월 3장이 있어도 다른 월 카드를 내면 흔들기를 묻지 않는다 | events |
| E11 | `E11-no-shake-floor-has-month` | 반례 |  | 바닥에 그 월이 있으면(폭탄 대상) 흔들기를 묻지 않는다 | events |
| E11 | `E11-shake-settle` | 정상 |  | 흔들기는 1회당 ×2, 두 번이면 ×4 (승자만) | events |
| E12 | `E12-chongtong-prompt` | 정상 | `chongtongContinue=true` | 손패 같은 월 4장(총통)이면 끝내기/계속하기를 묻는다 | events |
| E12 | `E12-chongtong-end` | 정상 | `chongtongPoints=10` | 총통 끝내기는 10점 승리 | events |
| E12 | `E12-chongtong-7` | 정상 | `chongtongPoints=7` | 피망식 토글: 총통 7점 | events |
| E12 | `E12-chongtong-carry` | 경계 |  | 나가리 다음 판(×2)에 총통 끝내기면 20점 | events |
| E12 | `E12-chongtong-no-continue` | 경계 | `chongtongContinue=false` | 계속하기 불허 토글: 묻지 않고 즉시 총통 승리 | events |
| E12 | `E12-chongtong-continue` | 정상 |  | 계속하기를 고르면 판을 진행하고, 4장 중 1장을 내면 4장 흔들기를 물을 수 있다(흔들기+폭탄 ×4 경로) | events |
| E12 | `E12-chongtong-non-dealer` | 경계 |  | 후(좌석 1)의 총통도 첫 턴 전에 묻고, 계속하면 선부터 친다 | events |
| E12 | `E12-no-chongtong-three` | 반례 |  | 손패 같은 월 3장은 총통이 아니다 | events |
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
| G3 | `G3-go-1` | 정상 | `goScoring=plusNAndDouble` | 1고 스톱: +1점 (배수 없음) | gostop |
| G3 | `G3-go-2` | 경계 | `goScoring=plusNAndDouble` | 2고 스톱: +2점 (배수 없음) | gostop |
| G3 | `G3-go-3` | 정상 | `goScoring=plusNAndDouble` | 3고 스톱: +3점, 3고부터 ×2^(n-2) = ×2 | gostop |
| G3 | `G3-go-5` | 경계 | `goScoring=plusNAndDouble` | 5고 스톱: +5점, 3고부터 ×2^(n-2) = ×8 | gostop |
| G3 | `G3-double-only-3` | 정상 | `goScoring=doubleOnly` | '3고부터 배수만' 토글: 3고는 가산 없이 ×2 | gostop |
| G3 | `G3-double-only-2` | 경계 | `goScoring=doubleOnly` | '3고부터 배수만' 토글: 2고까지는 +n 가산 유지(자체 해석) | gostop |
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
| G10 | `G10-go-and-bak` | 경계 |  | 고 가산 후 고 배수와 박을 곱한다: (7+3)×2×2 = 40 | gostop |
| G10 | `G10-jackpot` | 정상 | `jackpotRound=5x2` | 아케이드 대박판(5판마다 ×2): 5번째 판 승리는 ×2 | gostop |
| G10 | `G10-jackpot-off-round` | 반례 | `jackpotRound=5x2` | 대박판 주기가 아닌 판(4번째)은 배수 없음 | gostop |
| G10 | `G10-jackpot-disabled` | 반례 | `jackpotRound=null` | 표준(대박판 끔)은 5번째 판도 배수 없음 | gostop |
| M1 | `M1-settle-money` | 정상 |  | 정산액 = 최종점수 × 점당 (7점 × 100) | settle |
| M1 | `M1-instant-separate` | 경계 |  | 즉시 정산(첫뻑 7점)은 판 정산과 별도 원장 항목: 7 × 50 | settle |
| M1 | `M1-nagari-no-money` | 반례 |  | 나가리는 돈이 오가지 않는다 | settle |
| M2 | `M2-cap-loser-balance` | 경계 |  | 획득 상한은 패자 잔액(올인): 57,600 요구 → 패자 잔액 20,000만 이동 | settle |
| M2 | `M2-limited-liability` | 정상 | `limitedLiability=true` | 유한책임제 선택: 승자 보유액(5,000)까지만 획득 | settle |
| M2 | `M2-no-cap-needed` | 반례 | `limitedLiability=false` | 잔액이 충분하면 상한이 걸리지 않는다(유한책임제 끔이면 승자 잔액 무관) | settle |
| M3 | `M3-no-fee` | 정상 |  | 수수료 없음: 승자는 패자가 낸 금액을 그대로 받는다(8점 × 1000) | settle |
| M4 | `M4-stop-preview` | 정상 |  | 고/스톱 선택 시 스톱하면 받을 점수를 미리 계산해 보여준다(흔들기 1회면 14점) | settle |
| M4 | `M4-preview-with-pibak` | 경계 |  | 미리보기에도 박 배수가 반영된다(피박 → 14점) | settle |

## 13장 불일치 항목 → 토글 → 벡터

| 13장 | 토글 (`RuleOptions`) | 값별 벡터 |
|---|---|---|
| 1 총통 점수 | `chongtongPoints` 7 / **10** | `E12-chongtong-7`, `E12-chongtong-end` |
| 2 3뻑 점수 | `threePpeokPoints` **7** / 10 | `E5-three-ppeok`, `E5-three-ppeok-10` |
| 3 첫뻑 계열 금액 | `ppeokPayout` **points** / baseMultiple / off | `E4-first-ppeok`, `E4-base-multiple`, `E4-payout-off` |
| 4 총통 계속 | `chongtongContinue` **true** / false | `E12-chongtong-prompt`, `E12-chongtong-no-continue` |
| 5 바닥·양측 총통 | `floorChongtong` **nagari** / dealerWins / redeal, `bothChongtong` **nagari** / dealerWins | `R6-*`, `E13-*` |
| 6 보너스로 만든 총통 | `bonusChongtong` never / **firstTurn** / always | `B5-*` |
| 7 2장 폭탄 | `twoCardBomb` **off** / noMultiplier / double | `E10-*` |
| 8 첫따닥 금액 | `firstTtadakPayout` **true** / false | `E6-first-ttadak`, `E6-first-ttadak-off` |
| 9 마지막 턴 뻑먹기 뺏기 | `lastTurnPpeokSteal` **false** / true | `E3-*` |
| 10 피박 0장 예외 | `piBakZeroExempt` **true** / false | `G6-pibak-zero-*` |
| 11 3고 이후 가산 | `goScoring` **plusNAndDouble** / doubleOnly | `G3-*` |
| 12 고박/독박 문구 | (토글 없음, 신맞고 ×2 채택) | `G4-*` |
| 13 뺏기 카드 | `bonusSteal` **true** / false, `dealFloorBonusSteal` **false** / true | `B1-*`, `R3-deal-steal-*` |
| 14 대박판 | `jackpotRound` **null** / {every 5, ×2}(아케이드) | `G10-jackpot*` |
| 15 CPU 분배 가중치 | 없음(엔진은 시드 PRNG 균등 셔플만 한다) | 속성 테스트 |
| 16 선 고르기 동월 | (자체 결정, 아래 해석 1) | `R4-first-pick-tie`, `R4-first-pick-tie-cap` |

그 밖의 12.7 엔진 토글도 값마다 벡터가 있다: `bonusCards`(R1), `piBakThreshold`(G6), `nagariCap`(G9), `gukjin`(S5), `firstDealer`(R4), `naturalPpeokSteal`(R7), `hudang`(E14), `limitedLiability`(M2).

## 엔진 설계 요약

- 공개 API(`packages/engine/src/index.ts`): `newRound(rules, seed, opts)`, `reduce(state, action)`, `legalActions(state, seat)`, `playerView(state, seat)`, `redactEvent(event, seat)`, `settle(state, rules)`, `previewStop(state, seat)`, `replay(rules, seed, actions, opts)`, `createLedger` / `applyInstantPayout` / `applySettlement`, `createScenario`(테스트용 배치), `collectCards`, `cardName` / `cardId`.
- **거부 방식**: `reduce`는 규칙 위반에 예외를 던지지 않고 `{ ok: false, reason: 'roundOver' | 'notYourTurn' | 'illegalAction', message }`를 돌려준다. 받아들이는 액션은 `legalActions`가 낸 것뿐이며(`sameAction`으로 비교) 규칙 검증은 `legal.ts` 한 곳에만 있다. 예외는 엔진 버그(불변식 위반, 예: 더미 부족)에만 쓴다.
- 상태: `phase`(chooseFirst/turn/end), `seats[2]`(손패, 종류별 획득 패, 고 횟수·마지막 고 점수, 흔들기·폭탄·폭탄패, 뻑 턴 목록, 턴 수, 허당 카운터, 국진 위치, 점수 분해), `floor`(월별 무더기: loose / ppeok(소유 좌석) / natural), `deck`, `pending`(pickFirst·chongtong·play·shake·target·gukjin·goStop), `ctx`(진행 중 턴), `round`(판 번호·나가리 배수), `instantPayouts`, `result`, `rng`, `eventSeq`. 카드는 ID 0~50만.
- 모듈: `cards`·`names`(카탈로그), `rng`·`deck`(PRNG), `rules`(옵션·프리셋), `deal`(선 고르기·분배), `turn`(턴 진행·해결), `capture`(획득·뺏기), `floor`, `score`, `settle`, `ledger`, `legal`, `reduce`, `view`, `replay`, `scenario`.
- 정산 `steps[]` 순서: base → goBonus → goMultiplier → shake → bomb → piBak → gwangBak → meongtta → goBak → nagariCarry → jackpot. `finalPoints = (add 합) × (mul 곱)`.

## 해석 (규칙 문서가 침묵하거나 모호해서 엔진이 정한 것)

1. **선 고르기 동월(R4, 13장 16)**: 후보 8장(시드 셔플)에서 두 좌석이 서로 다른 자리를 고른다. 같은 월이면(보너스끼리도 같은 것으로 본다) 새 후보 8장으로 다시 고르고, 동월이 3번 연속이면 시드 PRNG로 선을 정한다. 밤일낮장은 엔진이 시각을 읽지 않으므로 호출자가 `isNight`를 넘긴다. 가위바위보는 P2 미구현이며 패 고르기로 대체된다.
2. **분배 순서(R2)**: 선 손패 10 → 후 손패 10 → 바닥 8 → 나머지 더미. 연출 순서는 결과와 무관하므로 단순화했다.
3. **분배 시 바닥 보너스 뺏기(B3(d))**: 토글을 켜도 분배 시점에는 상대 피가 0장이라 항상 무효다(0장 무효 규칙). 토글은 문서대로 두었다.
4. **바닥 총통 '재분배'(R6)**: 같은 판 안에서 시드 PRNG로 다시 섞어 나누고 나가리 배수는 바꾸지 않는다. 16회 연속이면 나가리로 끝낸다. '선 승리'의 점수는 총통 점수(`chongtongPoints`)를 쓴다.
5. **자연뻑(R7)**: 분배 직후 같은 월 3장만 자연뻑 무더기로 둔다(보충 후 판정). 소유자가 없으므로 자뻑이 되지 않는다. 마지막 턴 예외(E3)도 똑같이 적용한다.
6. **보너스 내기(B1)**: 턴을 소비하지 않는다. 턴 번호는 그 턴의 첫 액션(보너스 내기 포함)에서 센다. 보너스로 받은 패로 같은 월 4장이 되는 B5의 "첫 턴"은 **그 좌석의 자기 첫 턴**이다.
7. **뒤집은 보너스(B2)**: 뻑 여부가 이어진 뒤집기로 정해지므로, 뒤집은 보너스는 그 턴의 해결 단계에서 획득(뺏기 포함)하거나 뻑 무더기에 묻는다.
8. **뺏기 순위(B4)**: 일반피 → 쌍피 → 국진쌍피 → 보너스 2피 → 보너스 3피, 같은 순위는 카드 ID 오름차순. 한 턴에 뺏기가 여럿이면 순서는 폭탄 → 보너스 획득 → 뻑 먹기/자뻑/자연뻑 → 따닥 → 쪽 → 쓸.
9. **국진(S5)**: 자동 모드에서는 점수를 계산할 때마다 총점이 큰 쪽으로 세고(같으면 열끗), 정산 때는 승자가 최종 점수를 최대로(예: 열끗 7장 멍따), 패자가 최소로(예: 피박 회피) 고른다. 자동 모드의 국진은 평소 열끗 자리에 있다고 보아 뺏기 대상이 아니다. '매번 묻기'는 국진을 먹은 턴의 해결 직후에 묻고, 쌍피로 두면 쌍피 다음 순위로 뺏길 수 있으나 유일한 피면 열끗으로 고정된다. 뺏어온 국진은 쌍피로 둔다.
10. **마지막 턴(E1·E3·E6·E7·E8, 12.8)**: 그 턴이 끝나면 자기 손패 + 폭탄패가 0장인 턴. 이때 뻑은 불성립(3장 획득), 따닥·쪽·쓸은 카드만 먹고 이벤트·뺏기 없음.
11. **자뻑 2장(E2)**: 12.4의 자체 해석대로 "뺏은 가치 합이 2 이상이면 중단". 일반피 1장 다음 쌍피를 가져오는 것은 허용된다.
12. **마지막 턴 뻑 먹기(E3)**: 남의 뻑·자뻑·자연뻑 모두에 같은 예외를 적용한다.
13. **첫뻑·연뻑·3연뻑(E4)**: 자기 1·2·3번째 턴에 끊김 없이 뻑일 때만. '기본점수×1/2/3' 토글은 기본점수를 1점(× 점당)으로 해석했다. 3연뻑이면 21점 즉시 정산 뒤 3뻑 승리(E5)도 성립한다(총 49점).
14. **3뻑(E5) "배수 미적용"**: 나가리 이월·대박판을 포함한 모든 배수를 적용하지 않는다.
15. **첫따닥(E6)**: 자기 첫 턴의 따닥. 대상 선택은 spec 4.3 순서대로 낼 때 묻는다(뒤이어 따닥이 되면 선택과 무관하게 4장).
16. **쓸(E8)**: 이번 턴에 무엇이든 먹었고 해결 뒤 바닥(뻑 무더기 포함)이 비었으면 성립한다. 쪽으로 바닥이 비는 경우도 쪽·쓸 각각 뺏는다.
17. **폭탄(E9·E10)**: 배수는 정산의 `bomb` 단계로 따로 표기한다(흔들기와 같은 ×2/회). 폭탄패는 손패처럼 원하는 턴에 쓰는 뒤집기 전용 턴이다. 2장 폭탄 'double'은 폭탄 배수 1회로 센다.
18. **흔들기(E11)**: 같은 월 3장 이상을 쥐고 바닥에 그 월이 없을 때, 그 월 카드를 낼 때만 묻는다. 총통 계속 후 4장도 흔들 수 있다(흔들기 + 이후 폭탄 = ×4, E12 피망 경로).
19. **총통(E12)**: 분배 직후 첫 턴 전에(후 좌석이어도) 묻는다. 끝내기 점수에는 나가리 이월·대박판만 곱하고 박은 없다. 계속하기를 고르면 그 월은 상대 뷰·이벤트에서 가린다.
20. **허당(E14, 기본 끔)**: 연속 5턴 아무것도 먹지 못한(보너스 획득도 먹은 것) 좌석이 7점으로 이기고 판이 끝난다(나가리 이월만 곱함).
21. **자동 스톱(G1)**: 자기 손패(+폭탄패)가 없는 턴에 나거나 재고 조건을 채우면 더 칠 수 없으므로 고를 묻지 않고 스톱한다(`reason: autoStop`, 상대가 고를 했으면 고박 적용).
22. **'3고부터 배수만'(G3 토글)**: 1·2고의 +n 가산은 유지하고 3고부터 가산 없이 ×2^(n-2).
23. **나가리 배수(G9)**: 다음 판 배수 = min(이번 판 배수 × 2, 상한). 나가리 판에서 이미 받은 즉시 정산은 그대로 둔다. 판 종료 시 더미에 남은 보너스는 누구에게도 주지 않는다(12.8).
24. **원장(M1·M2)**: 즉시 정산도 판 정산과 같은 상한(지불자 잔액, 유한책임제면 받는 쪽 잔액)을 적용한다. 잔액은 음수가 되지 않는다.
25. **대박판**: 12.7 토글(P2)이지만 구현이 한 줄이라 넣었다: `round.number % every === 0`인 판의 승리에 ×k. 판 번호는 호출자가 `roundNumber`로 넘긴다.

## M1 범위 밖 (후속)

- **P2 토글(타입만, 엔진 무시)**: `push`(밀기), `missions`(미션), `firstDealer: 'rockPaperScissors'`. 목록은 `UNIMPLEMENTED_RULES`. 아케이드 프리셋의 `push: true`는 현재 효과가 없다(M6).
- 로컬 설정(진행 속도·자동치기)은 `LocalPlayOptions`로 분리되어 엔진 결과와 무관하다.
- 세션 흐름(판 번호, 다음 판 선·나가리 배수 전달, 파산 시 재충전 선택)은 호출자(M3 web / M2 sim)가 `settle()`의 `nextDealer`·`nextCarry`로 이어 붙인다.
- 속성 테스트는 무작위 합법 정책이다. AI 대 AI 강도 벤치마크와 판당 정산액 분포(MN-03)는 M2(`tools/sim`)에서 한다.
