# 카드 도안 조사 (디자인 트랙 D1 1단계)

- 작성일: 2026-09-29
- 목적: 빌려 쓰는 Wikimedia Commons "SVG Hwatu"(CC BY-SA 4.0)를 **직접 그린 현대적 카드 세트(CC0)**로 바꾸기 전에, (a) 플레이어가 카드를 알아보는 데 쓰는 월·종류별 도상과 (b) 현대적으로 다시 그린 하나후다·화투 사례를 정리한다.
- 관련 요구사항: spec 6.6(자산), NF-07(라이선스), NF-08(색만으로 구분하지 않음), NF-03(전송량), 6.4(애니메이션 예산). 규범 문서: `docs/design/cards-style.md`.
- **다른 세트의 그림은 한 조각도 복사하지 않았다.** 아래 사례는 접근 방식만 기술하며, 시안 A·B의 모든 도형은 `packages/web/scripts/card-drafts.mjs`가 좌표로 새로 만든다.

## 1. 카드 구성의 근거

종류 구성은 `docs/research/rules-commercial.md` 1.1 표와 엔진 카탈로그(`packages/engine/src/cards.ts`)를 따른다. 도상 설명은 한국어 위키 두 곳과 현재 Commons 세트의 실제 그림(`packages/web/public/cards/`)으로 확인했다.

| 월 | 이름 | 광 | 열끗 | 띠 | 피 |
|---|---|---|---|---|---|
| 1 | 송학(솔) | 학·붉은 해·소나무 | — | 홍단 | 2 |
| 2 | 매조(매화) | — | 꾀꼬리(고도리) | 홍단 | 2 |
| 3 | 벚꽃 | 휘장(만막) | — | 홍단 | 2 |
| 4 | 흑싸리(등나무) | — | 두견새(고도리) | 초단 | 2 |
| 5 | 난초(붓꽃) | — | 다리(팔교) | 초단 | 2 |
| 6 | 모란 | — | 나비 | 청단 | 2 |
| 7 | 홍싸리 | — | 멧돼지 | 초단 | 2 |
| 8 | 공산(억새) | 보름달·붉은 하늘 | 기러기 세 마리(고도리) | — | 2 |
| 9 | 국준(국화) | — | 술잔(국진, 쌍피 전환 가능) | 청단 | 2 |
| 10 | 단풍 | — | 사슴 | 청단 | 2 |
| 11 | 오동 | 봉황 | — | — | 2 + 쌍피 1 |
| 12 | 비(버들) | 비광(우산 쓴 사람·개구리) | 제비 | 비띠(단 불성립) | 쌍피 1 |

### 1.1 알아보는 단서 (플레이어 관점)
- **월은 식물로 읽는다.** 같은 월 4장은 같은 식물(솔·매화·벚꽃·싸리·붓꽃·모란·싸리·억새·국화·단풍·오동·버들)과 같은 색 조합을 공유한다. 전통 카드에는 숫자가 없어서 초보자는 식물과 월 대응을 외워야 한다([Fuda Wiki, Hanafuda](https://fudawiki.org/en/hanafuda), [steve-p.org](https://steve-p.org/cards/Hana.html)).
- **한국 화투의 변형**: 일본 하나후다에서 녹색은 검정으로, 보라는 파랑으로 바뀌었고 그림이 단순해졌다. 광에는 동그라미 안에 `光` 글자가 들어간다. 11월(오동)과 12월(비)의 순서가 일본과 반대다. 비광의 인물은 옷차림이 바뀌었다([위키백과 화투](https://ko.wikipedia.org/wiki/%ED%99%94%ED%88%AC), [나무위키 화투/패](https://namu.wiki/w/%ED%99%94%ED%88%AC/%ED%8C%A8)).
- **띠**: 홍단(1·2·3월)은 빨간 띠에 글자, 청단(6·9·10월)은 파란 띠에 글자, 초단(4·5·7월)과 12월 비띠는 글자 없는 빨간 띠다(현재 Commons 1.svg·33.svg에 "홍단"·"청단"이 세로로 쓰여 있음). 홍단과 초단은 **색이 같고 글자 유무로만 다르다** → 색각과 무관하게 이미 모양(글자) 단서를 쓴다.
- **쌍피**: 11월 쌍피는 다른 피와 색이 다르고, 12월 쌍피는 빨간 바탕에 번개·북 그림이다. 9월 술잔(국진)은 열끗이지만 쌍피로 쓸 수 있다(한게임 모바일은 "11월 오동, 12월 비, 9월 국진은 쌍피"라고 표기, rules-commercial.md 1.1).
- **고도리**: 2·4·8월 열끗의 새 세 마리. 전통 카드에는 별도 표시가 없다.
- **보너스 패**(상용 앱): 대부분 "2피"·"3피"처럼 가치를 글자로 크게 쓴다. 현재 우리 보너스(48~50)도 이 관행을 따른다.

### 1.2 현재 앱의 보완 방식과 한계
- 앱은 Commons 그림 위에 `1광`·`9열`·`12쌍` 같은 표식을 **런타임 오버레이**로 덧그린다(`src/ui/Card.svelte`, spec 6.6). CC BY-SA 원본을 고치지 않으려는 선택이다.
- 한계(`docs/design/preview-compare.png`):
  1. 획득패 크기(26px)에서는 표식을 숨긴다(`marks = size !== 's'`). 더미에서 카드 왼쪽 7~10px만 보이므로 월을 알아볼 단서가 그림 조각뿐이다.
  2. 표식이 그림의 왼쪽 아래를 가려 광의 `光` 동그라미(1월)와 겹친다.
  3. 원본 SVG가 크다. 같은 12장이 132 KB(시안 A 27 KB, B 38 KB), 전체 52장이 604 KiB로 전송 예산 1.5 MB(NF-03)의 40%다.
  4. CC BY-SA의 동일조건 때문에 그림을 고치면 변경본도 CC BY-SA로 내야 하고, 저작자 표시 화면이 필요하다(NF-07).

## 2. 현대적 재디자인 사례

| 세트 | 만든 이·연도 | 접근 | 작은 크기에서 읽히는 이유 |
|---|---|---|---|
| **Junior Hanafuda** (Phoenix 2019, Dragon & Tiger 2020) | Louie Mantia, Jr. | 일본 가문(몬) 문장을 바탕으로 한 **단순하고 굵은 도형**, 밝은 색. 포커 카드 판형. 5월 열끗의 다리를 잉어로 바꾸는 등 "동물 카드는 동물"로 규칙성을 맞춤 | **두 모서리에 월(꽃) 아이콘 색인**, **종류마다 배경을 다르게** 해 광·열끗·띠·피를 배경만으로 구분. 가운데는 식별용 그림에만 씀 |
| **Wikimedia "Hanafuda"/"Hwatu" SVG** (2021, 2024) | Louie Mantia 그래픽 → Marcus Richert가 한국 화투 색·선으로 수정 → Spenĉjo가 장별 추출 | 전통 도안을 벡터로 충실히 재현. 한국식 빨간 테두리·검정 덩어리 | 전통 배치 그대로라 숫자·종류 표시가 없다. 우리 앱이 오버레이로 보완 중 |
| **Hanafuda Neo** (2025) | Thomas Park | Mantia 그림을 바탕으로 "검정이 많은 전통 그림"보다 밝게. **카드마다 식물 이름·월·가치 캡션** | 글자 캡션으로 종류 혼동(학은 광인데 동물처럼 보임, 술잔은 열끗인데 물건)을 없앰 |
| **Modern Hanafuda** (2012, Kickstarter) | Sarah Thomas | **굵은 평면 색과 기하 무늬**. 판형이 크고 길다 | 평면 색면이 커서 멀리서도 색 덩어리로 월을 구분 |
| **Cochae "Kokoyo"** (2019) | Cochae | 굵고 선명한 그림, 모든 요소에 얼굴 | **배경색으로 종류 코딩**(광 금색, 열끗 은색) |
| **Hanafuda Hawaii** (2009, 2016) | Hanafuda Hawaii | 하와이 식물로 재해석 | **카드에 점수를 인쇄하고 족보 아이콘**을 넣음 |
| **Indianwolf Sensu / Hanami** (2018~2020) | Indianwolf Studios | "미니멀하지만 사실적인" 그림 | 초보용 **색인(인덱스)** 판 |
| 상용 맞고 앱 (피망 뉴맞고, 소원맞고 등) | 국내 사업자 | 전통 도안 유지 + 골드·우드 등 스킨, "큰 화투패" 판 | 카드 자체를 크게 그리고, 광·쌍피 등은 전통 표식(光, 색)에 기댐 |
| Nintendo "대통령" / Club Nintendo Mario 화투 (2007) | Nintendo | 높은 점수 카드에만 캐릭터를 넣고 나머지는 전통 도안 | 전통 배치를 지켜 숙련자 인식을 해치지 않음 |

출처는 5장에 모았다. 스토어 설명·요약 기사로만 확인한 항목(Cochae, Indianwolf, 상용 앱 스킨)은 접근 방식 수준에서만 인용한다.

### 2.1 공통 교훈
1. **모서리 색인은 거의 모든 초보용 현대 세트가 채택한다**(Junior, Sensu, Hanafuda Hawaii). 숫자가 식물보다 빠르다. 한국 맞고 플레이어도 "9월", "12쌍" 같이 숫자로 말한다.
2. **종류는 배경·테두리·기호 중 하나로 한눈에** 보이게 한다(Junior 배경, Cochae 배경색, 한국 화투의 `光` 원). 색만 쓰면 NF-08을 어기므로 모양 기호와 함께 쓴다.
3. **도형은 적고 굵게.** 평면 색면과 굵은 윤곽(Mantia, Sarah Thomas)은 작게 줄여도 뭉개지지 않는다. 가는 선과 세부 묘사(현재 Commons 세트의 억새·버들 결)는 44px에서 회색 얼룩이 된다.
4. **전통 도상은 유지한다.** 월별 식물·동물·물건(학과 해, 술잔, 우산, 번개)은 바꾸지 않아야 숙련자가 망설이지 않는다. Junior처럼 도상을 바꾸는 선택(다리 → 잉어)은 한국 사용자에게는 손해다.
5. **가치가 있는 특수 카드는 가치를 드러낸다**(보너스 2피·3피, 쌍피). 우리 시안은 피의 가치를 "칩 개수"로 통일했다.

## 3. 우리 제약에서 나온 추가 요구
- 카드 폭: 획득패 26px(더미에서 왼쪽 7~10px만 보임), 바닥 44px, 손패 62px(`src/styles/tokens.css`, `src/ui/CapturedPile.svelte`). 과제 설명의 22/46/60px와 같은 범위다.
- 다크 UI, 초록 판(`--color-felt`)과 어두운 배경 위에 놓인다 → 밝은 앞면이 판과 대비 10:1 이상.
- 애니메이션: `<img>` + WAAPI `transform`·`opacity`만 쓴다(plan.md 1.6). SVG는 한 번 래스터화되므로 **filter·그라디언트·마스크를 쓰지 않고** 평면 도형만 쓴다.
- 네트워크 없음(NF-01): 글꼴을 번들하지 않도록 숫자도 경로(path)로 그린다.

## 4. 시안 방향 (결과는 cards-style.md와 미리보기 PNG)
- **시안 A — 플랫 기하**: Mantia·Sarah Thomas 계열의 평면 색면 + 균일한 먹선(윤곽 2.4). 전통 도상을 원·호·다각형으로 다시 그림.
- **시안 B — 먹·붓 미니멀**: 한지색 바탕, 붓 획(굵기가 변하는 채운 다각형), 한 장에 강조색 하나, 넓은 여백. 모서리 숫자는 빨간 도장(낙관) 칸.
- 두 시안은 **같은 모서리 색인 체계**(월 숫자 + 종류 기호)를 공유한다. 차이는 그림체뿐이라 사용자는 그림체만 고르면 된다.

## 5. 출처 (2026-09-29 접속)
- 위키백과, 「화투」: https://ko.wikipedia.org/wiki/%ED%99%94%ED%88%AC
- 나무위키, 「화투/패」: https://namu.wiki/w/%ED%99%94%ED%88%AC/%ED%8C%A8
- 브런치, 「화투 월별 의미 상징 그림 족보 완벽정리」: https://brunch.co.kr/@54f543cebbd84d4/854
- Fuda Wiki, Hanafuda: https://fudawiki.org/en/hanafuda · Suits: https://fudawiki.org/en/hanafuda/suits
- steve-p.org, Hanafuda cards: https://steve-p.org/cards/Hana.html · Junior Hanafuda: https://steve-p.org/cards/Juni.html
- Arun Venkatesan, "Icon designer Louie Mantia's take on traditional Japanese playing cards": https://arun.is/blog/junior-hanafuda/
- Junior Hanafuda: https://www.junior.cards/ · Louie Mantia: https://www.junior.cards/louie-mantia/
- Willamette Week, "Louie Mantia Updates Centuries-Old Japanese Playing Cards" (2021-01-13): https://www.wweek.com/culture/2021/01/13/louie-mantia-updates-century-old-japanese-playing-cards-with-stunning-modern-designs/
- Wikimedia Commons, File:Hwatu overview.svg (Marcus Richert, 2021-02-22, CC BY-SA 4.0): https://commons.wikimedia.org/wiki/File:Hwatu_overview.svg · Category:SVG Hwatu: https://commons.wikimedia.org/wiki/Category:SVG_Hwatu
- Thomas Park, "Redesigning Hanafuda & Hwatu Cards for Beginners" (2025-02): https://thomaspark.co/2025/02/redesigning-hanafuda-hwatu-cards-for-beginners/
- Sarah Thomas, Modern Hanafuda (Kickstarter): https://www.kickstarter.com/projects/sarahehthomas/modern-hanafuda · https://www.modernhanafuda.net/about/
- Ways To Play, "New Hanafuda & Hwatu" (Cochae Kokoyo, Junior Phoenix, Hanafuda Hawaii, Indianwolf, Tuhwa 등 목록): https://games.porg.es/articles/cards/japan/hanafuda/new-manufacturers/
- Super Mario Wiki, Club Nintendo Hanafuda: https://www.mariowiki.com/Club_Nintendo_Hanafuda
- Google Play, 피망 뉴맞고(골드·우드 화투패 스킨): https://play.google.com/store/apps/details?id=com.neowiz.games.newmatgo&hl=ko · 소원맞고("큰 화투패"): https://play.google.com/store/apps/details?id=com.tnk.fgt&hl=en_US
- 프로젝트 내부: `docs/research/rules-commercial.md` 1.1, `docs/research/code-refs.md` 4장, `packages/web/src/ui/Card.svelte`, `packages/web/src/ui/CapturedPile.svelte`
