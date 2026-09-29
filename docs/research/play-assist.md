# 점수·현황과 플레이 보조 조사

2026-09-29 · Galaxy 솔로 피드백 후속 · spec FR-40~48 / plan M3·M6·D2. **관례 조사이며 게임 규칙의 정답은 [rules-commercial.md §12](./rules-commercial.md#12-권장-기본-규칙-세트)뿐이다.** 이미지·코드·배치를 복제하지 않는다.

## 1. 확인한 관례와 한계

| 근거 | 확인한 내용 | 채택 / 한계 |
|---|---|---|
| 한게임 신맞고 [공식 게임방 설명](https://mgostop.hangame.com/guide/combine/03_02_contents.html) | 내/상대 점수, 획득패, 고·흔들기·뻑 횟수, 피박·광박, 상대 손패 수, 보유머니를 구분해 설명 | 점수와 공개 상태의 상시 비교. 상품·미션·출금 UI는 제외 |
| 한게임 [점수 계산 도움말](https://mgostop.hangame.com/guide/combine/02_04_rule.html) | 족보·고 가산·배수·박의 원인이 다름 | 현재 족보 점수와 정산 점수/금액을 구별. 해당 서비스의 금액 상한·예외를 이식하지 않음 |
| 피망 뉴맞고 [공식 기본 게임방법](https://dl.gostop.pmang.cloud/gamerule/basicRule.pc-newmatgo.md), [설명 이미지](https://dl.gostop.pmang.cloud/upload/guide_pc_matgo_rule_250527.png) | 손패→중앙덱 순서, 차례, 폭탄패를 설명. 이미지에는 획득패 옆 수량, 좌석 정보, 손패 위 삼각 표식이 보임 | 수량을 대상 가까이 배치. 삼각형의 정확한 의미는 본문에 없어 합법/추천 표식이라고 단정하지 않음 |
| 피망 [화면 리뉴얼 안내](https://m.pmang.com/notice/view/6037?page=1), 2025-02-26 | 설정에서 화면 선택·즉시 적용, 클래식 일부 기능 제한 | 정보 밀도 선택의 선례. 힌트 3단계 자체의 선례는 아님 |
| 넷마블 맞고2.0 [공식 점수계산 2008년 보존본](https://web.archive.org/web/20080620045747/http://c2.img.netmarble.kr/web/help/cardgame/matgo20/guide04_04.html) | 족보 합산·고 가산·배수 설명. 메뉴에 별도 ‘매직카드와 힌트’ 도움말이 존재 | 역사적 참고만. 현재 [넷마블 소개](https://m.netmarble.net/smart/game/mmatgo)는 윈조이 대박맞고를 안내하므로 2008 UI를 현행이라고 하지 않음 |
| 넷마블 맞고2.0 [공식 힌트서비스 보존본](https://web.archive.org/web/20080620045747id_/http://c2.img.netmarble.kr/web/help/cardgame/matgo20/guide01_08.html), [화면 상단](https://web.archive.org/web/20080620045747id_/http://c2.img.netmarble.kr/web/help/cardgame/matgo20/guide03_01.html)·[하단](https://web.archive.org/web/20080620045747id_/http://c2.img.netmarble.kr/web/help/cardgame/matgo20/guide03_02.html) | 족보 달성·남은 보너스에 관한 힌트, 양쪽 점수·고·흔듦·뻑·박·잔액, 클릭/단축키 입력을 설명 | 정보 보조의 역사적 선례. 유료 힌트·자동치기·미공개 카드 정보는 채택하지 않음 |
| Noriworks [맞고! 개발자 스토어 설명](https://play.google.com/store/apps/details?id=com.noriworks.km), [고스톱M](https://play.google.com/store/apps/details?id=com.noriworks.gm&hl=ko) | 한 손·오프라인 플레이, 속도·화면 설정 | 솔로에서도 읽기 부담을 줄이는 근거. 이번 열람의 설명문에서 예상액·패 강조 계약은 확인되지 않음 |

접속: 공식 한게임·피망 원문과 보존본은 HTTP로 확인(검색 도구가 피망 md를 읽지 못해 직접 열람). 광고성 설치 블로그와 검증 불가능한 리뷰는 근거에서 제외. **남은 문턱·조건부 사건 예고·힌트 단계는 아래 사용자 시나리오에서 도출한 자체 설계**이며 상용 3사의 공통 구현이라고 주장하지 않는다.

## 2. 시나리오 → 요구사항

| 사용자의 판단 | 필요한 정보 / 표현 | 요구사항 |
|---|---|---|
| 지금 무엇을 낼 수 있나 | 내 차례의 합법 수와 입력 잠금 구별, 맞는 바닥이 없어도 합법 수임 | FR-41 |
| 이 패를 내면 무엇과 만나나 | 매칭/2개 중 선택/무더기/보너스 구분; 뒤집기 전 획득 확정 표현 금지 | FR-41, FR-44 |
| 이미 확보한 점수는 얼마인가 | 현재 획득 족보 점수, 고 횟수, 배수의 적용 범위, 잔액 분리 | FR-40 |
| 한 장 더 모으면 무엇이 되는가 | 광 3→4→5, 열끗·띠 5 이후 +1, 피 가치 10 이후 +1; 비광·국진과 개별 단 구별 | FR-42 |
| 지금 위험한가 | 양쪽 공개패로 설명할 수 있는 피박·광박·멍따 조건. 승리 보장/상대 다음 수 예측 금지 | FR-43 |
| 폭탄/흔들기/총통을 놓치지 않으려면 | 합법 행동/내 프롬프트만 안내. 뻑·쪽·따닥은 ‘같은 월이 뒤집히면’ 조건문 | FR-44 |
| 언제 결정해야 하나 | 차례·더미 잔여·현재 선택 상태를 고정 문구로 제공 | FR-40, FR-45 |
| 고를 하면 얼마를 얻나 | 스톱 현재 예상액·잔액 상한·적용 배수. 고 이후는 미정, 고박 가능 설명 | FR-45 |
| 도움을 덜 받고 싶다 | 끔/기본/상세, 기본을 신규 기본값으로 제안·채택. 선택을 방해하는 팝업 없음 | FR-46 |
| 상대/AI가 내 패를 아는가 | 동일 playerView로 동일 출력; DOM·ARIA·로그에도 비밀정보 없음 | FR-47~48 |

## 3. 계산 경계와 구현 순서

| 입력/API(현재 코드 확인) | 사용 계약 |
|---|---|
| `legalActions(state, seat)` → `playerView.legal` | UI가 GameState를 요구하지 않는다. 전달된 합법 행동만 소비 |
| `matchPreview(view, viewer, card)` | 바닥 매칭과 흔들기 후보. 차례를 검사하지 않으므로 legal로 먼저 제한. 뒤집기 결과를 계산하지 않음 |
| `scoreCaptured` / 공개 `seat.score` | 현재 족보와 국진 위치. 족보 점수에 고 가산을 임의로 더하지 않음 |
| `previewStop(state, seat)` → `playerView.stopPreview` | 현재 스톱 선택 때 호스트가 계산·제공한 미리보기. UI가 가상 비밀 상태를 복원하지 않음 |
| `unseenCards(view)` | 보이지 않는 카드의 **집합**. 상대 손패/더미 위치와 순서, 다음 카드, 확률·추천 수를 출력하지 않음 |
| 제안 `assistProgress(view, seat)` 순수 함수 | 규칙 토글을 반영한 다음 문턱과 부족 단위, 개별 홍/청/초단·고도리. 아직 없는 API; 별도 엔진 PR에서 S1~5 벡터 |
| 제안 `assistConditions(view, viewer, action)` 순수 함수 | 공개패 기반 양방향 박 조건·사건 조건문. 마지막 턴·0피 예외·2장 폭탄 토글, 미확인일 때 unknown. 뒤집기 시뮬레이션/난수 없음 |

[PR #76 계획](https://github.com/kywoo26/p2p-gostop/pull/76)의 .1-A(#46/#47/#48/#51/#52) 기반 → .2-B(#62) 설정 → .3-A 효과 순서를 유지한다. HUD 시각 PR은 v0.2.1의 .1-A와 순서 조율해 통합; 기본 힌트는 v0.2.2 설정 이후; 상세 사건·위험 보조는 v0.2.3의 효과와 통합한다. 설정/엔진/프로토콜을 HUD PR에서 수정하지 않는다. .1-B 메뉴는 상단 오른쪽 48×48을 예약한다. 추적 목록은 ui-spec §15.4.

전달 경계: 게스트의 `BoardView`는 `PlayerView.rules/ctx`를 갖지 않는다. #81 순수 API → [#87](https://github.com/kywoo26/p2p-gostop/issues/87) 호스트의 좌석별 공개 결과 계산·BoardView 스키마/코덱·솔로/호스트 어댑터·프로토콜 문서·왕복/재접속 검증 → #82 상세 UI 순으로 배정한다(v0.2.3). 게스트에 숨은 상태를 보내 계산시키지 않는다. 상세 계약은 ui-spec §15.3 UX-A02. 기본 #80은 기존 legal 및 공개 매칭 입력만 사용한다.
