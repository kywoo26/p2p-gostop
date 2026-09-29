# 시각 방향 조사 — 카드 밖의 맞고 경험

2026-09-29 · 디자인 리드 · **조사/권고이며 채택 대기**. 기준 커밋 `39e8af9`, 요구사항 `spec.md` UX §6·NF-01~04/07/08·AC-06/07, `plan.md` §1.6/1.8·D2. [제안과 목업](../design/visual-direction.md).

## 1. 조사 범위와 판정법 (VD-01)

| 구분 | 조사 방식 / 한계 |
|---|---|
| 게임 | 제작사 공식 페이지와 제작사가 등록한 Google Play 이미지 직접 열람. 광고 합성 화면과 실제 게임 영역을 구분. 리뷰·머니 거래 사이트·비공식 APK는 근거에서 제외 |
| 시각 관찰 | 색·외곽선·영역·글자 크기 관계를 관찰한 디자인 판단. 특정 게임 전체가 낡았다거나 이용성이 낮다고 단정하지 않음 |
| 미확인 | 스토어에 없는 고/스톱·정산 상태, 이펙트 시간·실제 서체명은 추정하지 않음. 정지 화면으로 모션 시간을 역산하지 않음 |
| 모던 기준 | ① 카드/숫자/행동 위계 ② 한 장면의 강조 대상 수 ③ 표면·여백·서체 일관성 ④ 읽을 수 있는 사건 인과 ⑤ 작은 화면·동작 줄이기 대응. **플랫/신작 여부 자체는 점수 아님** |
| 자산 | 상용 화면은 링크 참조만. 이미지·로고·캐릭터·소리·폰트를 앱이나 목업에 복제하지 않음. 확정 카드 48장만 기존 Commons 자산 유지 |
| 툴 수치 | 공식 크기와 직접 측정, 도입 시 상한을 구분. npm 설치 크기·gzip·dist 원본 크기를 혼합하지 않음 |
| 에이전트 친화성 | 모델 학습 데이터는 확인 불가. 공식 예제/llms.txt/공개 컴포넌트 관례/현재 Svelte 5 API를 대리지표로 평가. 생성 품질 벤치마크를 수행했다는 뜻이 아님 |

## 2. 상용 맞고의 시각 언어

아래 번호는 열람일의 **스토어 스크린샷 나열 순서**다. 지역·캠페인에 따라 순서가 바뀔 수 있어 대표 이미지도 별도로 연결한다.

| 게임 / 공식 근거 | 판·배경 / HUD | 팝업·사건·타이포 관찰 | 채택 / 덜어낼 것 |
|---|---|---|---|
| [한게임 신맞고 / NHN](https://play.google.com/store/apps/details?id=com.NHNEnt.NDuelgo&hl=ko), 2번 [모드 선택 이미지](https://play-lh.googleusercontent.com/CT5xbH5rNpN2A-b34mSpBVZMacUGbFeUiqmBfmDzAKROn2OvpCG1ADk1Ny5VGiASgY-Rb8K9CPaKTsKN55wkT9E=w1000), 4번 무료뽑기 | 로비의 파랑/초록 면, 좌석·재화·기능 아이콘 밀집. 이번에 직접 본 표본은 로비/홍보 중심이라 플레이 HUD 세부는 판정 보류 | 모드 선택은 크림색 패널·두꺼운 금색 프레임·주황 CTA·캐릭터. 굵고 테두리 있는 제목. 고/스톱 선택·정산·뻑/따닥 프레임은 미확인. 6번 고 연출은 아래 추가 관찰 | 빠름 선택을 명시적으로 제공하는 점 채택. 반사광·프레임 중첩·로비 판매 요소는 오프라인 2인 제품에 불필요 |
| [피망 뉴맞고 / NEOWIZ](https://play.google.com/store/apps/details?id=com.neowiz.games.newmatgo&hl=ko), 3번 [미션 화면](https://play-lh.googleusercontent.com/SqG43RL0_djBvn9itINO7y6fgd1BS0k-5xTw_Tf1KMTjdrTVcTUUNGG5FUf_tyHUe9QtkCcuwZ9yV4By7-OpEQ=w1000) | 초록 판·어두운 나무 테두리, 중앙 바닥과 아래 손패, 우측 인물/금액. 카드의 흰 면이 명확 | 미션 패널의 O/X와 ×2 수치가 큼. 여러 광선·금색 제목·캐릭터가 카드와 경쟁. 미션 팝업을 고/스톱으로 오인하지 않음 | 상태를 큰 숫자/기호로 즉시 읽는 원리 채택. 카드와 별개인 대형 캐릭터와 전체 판 광선 생략 |
| ‘넷마블 맞고’ 검색의 현행 공식 결과: [윈조이 대박 맞고 / Zempot](https://play.google.com/store/apps/details?id=com.netmarble.mmatgo&hl=ko), 3번 [캐릭터 연출](https://play-lh.googleusercontent.com/fgLdRNBmGjv1YA8Idk-H119686HBopmQj70kBf0SAki4T1w4RirvdoiAKUFB4ESM8fxvcxdXJJTj978Cnltl=w1000) | 초록 판·하단 손패·우측 좌석/감정 메뉴. 패키지 ID의 `netmarble`을 현재 운영사 이름으로 쓰지 않음 | ‘쪽’ 큰 글자+캐릭터+하트의 중복 신호, 흰 외곽선/그림자. 고/스톱·정산은 해당 표본에 없음 | 짧은 사건명은 읽기 쉬움. 카드를 가리는 인물 크기와 여러 보조 효과는 줄이고 사건 주체를 함께 씀 |
| [피망 뉴맞고 카카오 / NEOWIZ](https://play.google.com/store/apps/details?id=com.neowiz.games.newmatgoKakao&hl=ko), 1번 [타짜 제휴 키비주얼](https://play-lh.googleusercontent.com/qbvcNLtBshRCtNZuKxUQeouI0gy4RMLVpJuqij7qVpiGMM998v0JHEHyB3mWJ1FIQMn24Htt9qFabTm04Gmd=w1000) | 어두운 실사 테이블과 한정된 적색 포인트. 이는 **광고 키비주얼**, 플레이 화면의 현대화 증거가 아님 | 큰 흰/빨강 글자와 고대비 인물 구도. 앱 설명에서 속도 조절 확인. 카카오판만의 정산/고스톱 차이는 검증 못함 | 다크+하나의 강조색은 B안의 무드 참조. 배우·영화 글자·테이블 사진은 사용하지 않음 |
| 조이시티 | [공식 사이트](https://www.joycity.com/) 접근/제품 확인 실패. 공식 모바일 맞고 제품과 스토어 표본을 이번 조사에서 식별하지 못함 | ‘조이시티 맞고’라는 이름으로 다른 회사 제품을 대입하지 않음 | 비교 채점에서 제외. 출처가 확보되면 추가할 항목이지 실재/서비스 종료 단정이 아님 |

추가 직접 열람: 한게임 6번 [‘5고’ 홍보 합성 프레임](https://play-lh.googleusercontent.com/TlN7X6HYZ0Ka2rWevIzvXGr5hTmW-ytiAwUZ-X_tVnhzjxDOLCAB6NXz8L1o0jmCNzQcmvtPwXGe8j6lUBsF=w1000)은 녹색 판·우측 점수·아래 획득패 진행도 위에 큰 ‘5고’, 방사형 광선, 인물, 고도리 임박 말풍선을 동시에 겹친다. **숫자+사건명 결합**은 채택하고 강조 신호의 중복은 줄인다. 윈조이 4번 [대박판 프레임](https://play-lh.googleusercontent.com/eeEdEUs86BmGhJXA4owW46gnnFI_7fYjdcomBDaXlJts0ZQ-OHYX97J6tYAgCaBuCrhQwySRyeDTKhPeTaL7Bw=w1000)은 점수·고가 우측에 모이고 중앙 카드 충격/가장자리 불꽃이 강하다. 대박의 크기 대비만 참고하며 전체 화면 불꽃은 배제한다. 두 이미지 모두 마케팅 합성이므로 실제 게임에서 동시 재생되는 요소/지속 시간은 확정하지 않는다.

| 요소 | 구식으로 느끼기 쉬운 조합(이 제품 기준) | 제안 기준 |
|---|---|---|
| 판 | 우드·천·빛·무늬가 동시에 카드와 경쟁 | 저채도 단색 바닥, 카드 외곽과 안정적인 공간 |
| HUD | 모든 값이 같은 크기의 알약/뱃지, 금액의 자리 이동 | 점수 24px → 잔액/고/배수 14px → 진행도, 고정 수치 열 |
| 결정 팝업 | 강조색 버튼 둘과 캐릭터, 판을 덮는 정중앙 모달 | 스톱 예상액·위험·두 선택을 예약 구역에 고정 |
| 사건 | 매번 전체 화면 발광·여러 소리·카드 가림 | 사건명+주체+방향, 한 개의 국소 효과, 상태 갱신과 같은 시간축 |
| 타이포 | 상시 텍스트까지 외곽선/기울임/다중 그림자 | 본문 고딕 1종, 숫자 등폭, 큰 글자 효과는 사건에 한정 |

고/스톱의 정보 요구·정산 계산은 상용 스크린샷으로 새로 정하지 않는다. `rules-commercial.md` §12, `spec.md`, HUD 담당의 계약을 사용한다. 위 미확인 상태를 목업에서는 **자체 설계**로 제안한다.

## 3. 맞고 밖에서 가져올 기준 (VD-02)

| 공식 레퍼런스 | 관찰 / 공식 설명 | 우리에게 가져올 기준 | 제외 |
|---|---|---|---|
| [Balatro 공식](https://www.playbalatro.com/), [스토어](https://play.google.com/store/apps/details?id=com.playstack.balatro.android&hl=ko), [2025 Apple Design Awards](https://developer.apple.com/design/awards/2025/) | Innovation 게임 수상. 직접 열람한 스토어 프레임은 왼쪽 고정 점수/칩·배수 블록, 중앙 손패, 위 조커 영역으로 분리. 레트로 픽셀이어도 정보 역할은 선명 | 점수와 배수를 분리하고 계산 결과를 정산에서 연결. ‘현대적’은 새 질감보다 일관된 정보 위계 | CRT·픽셀 본문·움직이는 배경의 그대로 이식. 공식 페이지에 없는 ms 수치 주장 |
| [Marvel Snap 공식 Game Overview](https://marvelsnap.com/game-overview/), [Google Play 2023 공식 선정](https://blog.google/products-and-platforms/platforms/google-play/google-play-best-apps-games-2023/) | 공식 설명은 짧은 대전·세 구역의 승부·Snap 선택을 중심으로 구성. Google의 2023 미국 Best Multiplayer **honorable mention**(대상 아님) | 게임의 판세와 위험 선택을 중심 사건으로 격상. 이동 방향/원인/최종 숫자가 이어지도록 설계 | 카드 일러스트·3D 효과·로고 복제, 선택을 강요하는 과장된 CTA |
| [Hearthstone 공식](https://hearthstone.blizzard.com/en-us), [스토어 화면](https://play.google.com/store/apps/details?id=com.blizzard.wtcg.hearthstone&hl=ko) | 직접 열람한 프레임: 상하 대칭 좌석, 가운데 비어 있는 대전 공간, 가능한 카드에 녹색 윤곽. 장식적인 판에서도 활성 상태가 우선 | 누르는 순간 후보 외곽을 강조하고 관련 영역으로 수렴. 강조 없는 카드를 과도하게 흐리게 하지 않음 | 큰 판 가장자리 소품·파티클·카드 팬을 412px에 축소 복사 |
| [Apple Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | 모션은 상태/피드백 전달, 모션 민감성과 대비·초점 고려 | 정지 프레임에서도 주체·결과 이해, reduced motion에서 정보 유지, 텍스트 4.5:1과 입력 48px 제품 계약 | 수상 이력을 접근성/성능 인증처럼 사용 |

**자체 도출:** 이동→도착 인지→상태 갱신의 한 흐름, 상시 수치의 정렬, 사건 때만 밀도 상승. 실제 모션 수치는 상용 게임의 추정값이 아니라 [#86](https://github.com/kywoo26/p2p-gostop/pull/86)의 표를 따른다.

## 4. 디자인 패키지 평가 (VD-03)

범례: 추가 크기는 **앱에 실제 포함하는 산출물** 관점. ‘미측정’은 라이브러리를 설치하거나 프로덕션 샘플 빌드하지 않은 상태다. 조건부 도입은 반드시 고정 버전·최소 샘플의 `dist` 차이·라이선스 고지를 다음 PR에서 제출한다. 어떤 패키지도 이번에 앱에 추가하지 않았다.

| 후보 / 1차 출처 | 라이선스 | 번들 영향 | 오프라인 / Svelte 5 | 에이전트 친화성·유지비 | §1.8 권고 |
|---|---|---|---|---|---|
| [Tailwind v4](https://tailwindcss.com/docs/compatibility), [MIT](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE) + [shadcn-svelte](https://www.shadcn-svelte.com/docs), [MIT](https://github.com/huntabyte/shadcn-svelte/blob/main/LICENSE.md) | MIT | Tailwind 런타임 JS 없음, 생성 CSS는 사용량 의존. shadcn은 복사 코드+Bits 등 전이 코드라 ‘0KB’ 아님; 미측정 | 로컬 빌드 가능. shadcn 현행 Svelte 5/Tailwind 계열. v4 Safari 16.4+라 제품 iOS 목표보다 낮음 | 공개 관례·AI 문서 강함. 복사 코드 업스트림 수정은 직접 반영; v3/React 관례 혼입 관리 필요 | **금지 유지**. 로비 폼 생산성은 있으나 맞춤 판/연출/폰트 문제를 해결하지 않음. 기존 CSS 전환 비용 큼 |
| [Bits UI](https://bits-ui.com/docs/introduction), [MIT](https://github.com/huntabyte/bits-ui/blob/main/LICENSE) | MIT | 사용하는 primitive+의존성 만큼 JS; Dialog 단일 산출물 미측정 | 자체 스타일, Svelte 5용 API·포커스 관리. 번들로 오프라인 가능 | llms 문서·snippets 관례 좋음, 접근성 회귀 비용 감소 가능 | 기존 **조건부 TRIAL 유지**. 네이티브 dialog의 실제 초점/중첩 결함이 입증될 때 1개만 비교 |
| [Melt UI](https://github.com/melt-ui/melt-ui) | MIT | 선택 builder+지원 코드; 미측정 | 로컬 가능, 기존 builder API와 Svelte 5 문법을 구분해 시험 필요 | headless 접근성 자산은 좋지만 Bits와 API 중복. 저장소 설명만으로 ‘유지 중단’ 단정 안 함 | 보류. Bits보다 유지비가 낮다는 근거가 없음 |
| [Skeleton](https://www.skeleton.dev/), [저장소](https://github.com/skeletonlabs/skeleton) | MIT | 테마 CSS+컴포넌트/전이 코드; 미측정 | Tailwind 기반, Svelte 지원, 로컬 가능 | 테마/앱 셸 작업에는 유리. 게임 패널 재스타일링과 별도 토큰 체계 유지 비용 | 비채택. Tailwind 금지와 중복 스타일 체계 |
| [Open Props](https://open-props.style/), [MIT](https://github.com/argyleink/open-props/blob/main/LICENSE) | MIT | CSS 변수 집합; 사용 부분만 선택하면 작음, 이 앱 빌드 미측정 | 프레임워크 무관, 모두 로컬 | 의미 토큰과 easing 원리 참고 유용. 전체 import는 불필요한 토큰 증가 | 개념 참고만. 기존 `tokens.css` 한 곳에 제품 역할 유지 |
| [UnoCSS](https://unocss.dev/), [MIT](https://github.com/unocss/unocss/blob/main/LICENSE) | MIT | 생성 CSS, 일반 빌드 사용 시 런타임 0; 설정별 미측정 | Svelte/Vite 통합 가능, 로컬 빌드 | 프리셋·동적 class 추출 규칙 추가. Tailwind와 비슷해 보여도 관례는 다름 | 비채택. 유틸리티 엔진 교체보다 현재 scoped CSS 계약이 단순 |
| [Panda CSS](https://panda-css.com/docs/overview/getting-started), [MIT](https://github.com/chakra-ui/panda/blob/main/LICENSE) | MIT | 정적 CSS 추출+생성 코드; 미측정 | 프레임워크 독립을 표방하나 이 Svelte/Vite 조합의 추출 시험 안 함 | 타입 있는 recipe 장점; codegen·추출 설정·또 하나의 토큰 원본 | 비채택. 작은 앱의 빌드 경로를 늘릴 이유 부족 |
| [Motion](https://motion.dev/docs/animate), [MIT](https://github.com/motiondivision/motion/blob/main/LICENSE.md) | MIT 코어; Motion+ 별도 | 공식 mini **2.3kb**, hybrid **18kb** 표기. 그 페이지 압축 조건 불명이라 원본 dist 예산에 직접 대입 금지 | JS API는 Svelte에서도 사용 가능; React 전용 API와 구분. 로컬 가능 | 문서·llms 강함. 또 하나의 취소/완료 계약을 #86 큐와 통합해야 함 | 기존 mini **조건부 TRIAL 유지**, 현재는 WAAPI로 충분 |
| [Svelte transition](https://svelte.dev/docs/svelte/transition) + [WAAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API) | Svelte MIT / 브라우저 API | 새 라이브러리 **0B**, 자체 CSS/JS는 증가 | Svelte 5 정식; 브라우저 내장, 보안 컨텍스트 필수 API 아님 | 프로젝트에 이미 있는 재생/스킵 계약을 확장. 생성 예제도 저장소에서 고정 가능 | **유지·채택**. transition=패널, WAAPI FLIP=카드, 정지 후 RAF 없음 |
| [Rive Web](https://rive.app/docs/runtimes/web/web-js), [MIT runtime](https://github.com/rive-app/rive-wasm/blob/master/LICENSE) | runtime MIT, 에디터/마켓 자산은 별개 | JS+WASM+`.riv`; renderer별 차이 큼, 미측정 | WASM도 직접 번들해야 오프라인. JS 수명 관리 래퍼 필요 | 벡터 상태 기계·디자이너 협업 강점. 바이너리 편집/메모리 해제/렌더 루프 운영 부담 | 비채택. 350ms 국소 효과를 위한 별도 렌더러는 과함 |
| [Lottie-web](https://github.com/airbnb/lottie-web) / [dotLottie](https://github.com/LottieFiles/dotlottie-web) | 코어 MIT, 다운로드 애니메이션은 개별 라이선스 | Lottie는 JS+JSON/SVG, dotLottie는 JS+WASM+압축 자산; 미측정 | 파일·WASM까지 로컬 고정 필요. dotLottie Svelte 래퍼 제공 | AE 내보내기 결과를 리뷰/수정하기 어렵고 스킵 동기화 필요 | 비채택. 압축 컨테이너가 런타임 비용을 없애지는 않음 |
| 자체 CSS/SVG / 스프라이트 | 자체 MIT 또는 CC0 | 런타임 0, 3안의 효과/아이콘 **예산 12 KiB**(상한, 실측 아님) | Svelte와 무관, 번들 가능 | DOM/토큰으로 읽고 수정하기 쉬움. 래스터 프레임 수 증가 감시 | **채택**. transform/opacity, 효과 1개, 최대 소형 도형 6개 |
| [Lucide Svelte](https://lucide.dev/guide/svelte), [라이선스](https://lucide.dev/license) | **ISC**(일부 원출처 별도 고지) | tree shaking, 아이콘 수별; 미측정 | Svelte 제공·오프라인 가능 | 문서/이름 관례 풍부 | **이번 자산에는 제외**. 사용자 허용 CC0/OFL/MIT에 ISC 없음 |
| [Phosphor core](https://github.com/phosphor-icons/core), [Svelte 구현](https://github.com/haruaki07/phosphor-svelte) | MIT | 정적 SVG 몇 개만 복사하면 래퍼 불필요. 라이브러리 사용량 미측정 | Svelte 패키지 존재, 문서에 이전 slot 예시도 있어 버전 검증 필요 | 이름/weight 일관성 좋음. all-icons import와 React 예제 혼입 주의 | 보조 후보. 우선 자체 도형, 필요하면 **MIT SVG 6~10개만** 출처/고지와 도입 |
| [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) + [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | API / CC0 자산 | 새 라이브러리 0, 짧은 음 6~8종 **48 KiB 예산** | 오프라인. 첫 사용자 제스처 후 오디오 시작; Safari 잠금 복귀는 실기기 확인 | 기존 오디오 계층 재사용, 큐/음량 한 곳에서 제어 | 채택 후보. 음성·BGM·Howler 의존성은 이번 요구에 없음 |

[GSAP 라이선스](https://gsap.com/standard-license)는 무료 사용 가능 여부와 MIT 여부를 혼동하면 안 된다. 독자 라이선스다. 도구 라이선스와 개별 효과 자산의 CC0/OFL/MIT 조건은 별도로 검토한다. **GSAP·Storybook 금지 유지**: 모션 플레이어는 이미 존재하고, 목업/컴포넌트 검토에는 기존 `/dev/gallery` + Playwright가 있다. [Storybook Svelte Vite](https://storybook.js.org/docs/get-started/frameworks/svelte-vite)는 지원 존재의 근거이지 이 프로젝트의 도입 필요성 근거는 아니다. ‘도구를 쓰지 않아 구식’이라는 진단보다 미완성 시각 계약·타입·상태별 디테일을 먼저 고친다.

## 5. 한국어 타이포와 실제 용량 (VD-04)

**측정:** Docker FontTools 4.61.1+Brotli 1.2.0. `39e8af9`의 `packages/web/src/**/*.svelte,ts`에서 한국어(주석 포함), 목업 한국어, ASCII/기호를 합한 **703개 문자**. 모든 가중치·OpenType 기능 유지, 힌팅 제거, WOFF2 출력. 번역 카탈로그가 없는 단계의 보수적인 문구 상한이며 사용자 이름/로그 전체 글리프를 보장하지 않는다. [스크립트](../design/mockups/font-study.py), [원본 해시·결과](../design/mockups/font-metrics.json), [코퍼스](../design/mockups/fonts/corpus.txt), [FontTools 공식](https://fonttools.readthedocs.io/en/latest/subset/index.html).

**실제 사용 글리프 별도 측정:** Playwright가 18개 화면의 `#app.innerText`를 수집했다. 아이콘 기호를 제외한 실제 표시 문구는 **117문자**이며, 같은 옵션의 가변 subset은 Pretendard **32.3 KiB**, SUIT **30.2 KiB**, Wanted **24.8 KiB**, Noto **21.5 KiB**였다. [표시 문구 코퍼스](../design/mockups/fonts/rendered-corpus.txt). 이 작은 표본을 앱 전체 용량으로 오인하지 않도록 아래 표/예산/동봉 파일에는 703문자 상한을 사용한다.

| 폰트 / 공식 출처 | 라이선스·측정 입력 | 입력 크기 → 703문자 가변 WOFF2 | 숫자 기능(실제 파일) | 판단 |
|---|---|---:|---|---|
| [Pretendard Variable](https://github.com/orioncactus/pretendard) | OFL 1.1, v1.3.9 WOFF2 | 2,009.5 → **140.3 KiB** | `tnum` 있음, 기본 숫자는 가변 폭 | A 추천. 긴 한국어 설명과 작은 HUD에 균형 잡힌 기준 서체 |
| [SUIT Variable](https://github.com/sun-typeface/SUIT), [공식 소개](https://sun.fo/suit/) | OFL 1.1, commit `55118d981336d8fce005eb62888c12c0568ef7b0` WOFF2 | 609.9 → **145.2 KiB** | `tnum` 있음, 기본 가변 폭 | B. 차분한 넓은 공간/얇은 위계와 비교. 기존 sunn-us URL만 보고 다운로드하지 않고 현행 sun-typeface 원본 확인 |
| [Wanted Sans Variable](https://github.com/wanteddev/wanted-sans) | OFL 1.1, commit `02c9b822349c188ada95f9e2d90c2ed18f853235` WOFF2 | 1,259.1 → **106.0 KiB** | `tnum` 있음, 기본 가변 폭 | C. 무거운 제목과 기하적 인상, 가장 작은 측정 서브셋 |
| [Noto Sans KR](https://github.com/google/fonts/tree/main/ofl/notosanskr) | OFL 1.1, google/fonts `23e54b51ddffbc7713c583748e3bd86f62b1fa4a` TTF | **TTF 10,170.5** → **116.7 KiB WOFF2** | 이 입력은 `tnum` 태그 없음. 기본 0~9 advance가 모두 521로 이미 등폭 | 다국어 fallback 강점. 입력 형식이 달라 원본 압축률을 다른 세 폰트와 순위 비교하면 안 됨 |
| 시스템 스택 | 시스템 설치 서체 사용, 폰트 재배포 없음 | **0B** | 기기·서체에 따라 다름, `tabular-nums`만으로 보장 불가 | 사용자 이름/로그 fallback. Apple SD Gothic Neo와 Android 서체의 폭·굵기 차이 때문에 주 UI 통일에는 불리 |

| 구현 쟁점 | 권고 |
|---|---|
| unicode-range | CSS 선언만으로 파일 바이트가 줄지 않는다. 먼저 실제 glyph subset, 그 결과 cmap의 범위를 선언. 이번 목업은 한 파일/가족, 703문자 누락 0. 실서비스는 필요 시 숫자/공통 한글의 **비중복 분할**을 검토 |
| 동적 서브셋 배포 | CDN용 수십 파일 전체를 로컬 복사하면 요청량과 **dist 전체 크기**는 별개. 현재 게이트는 dist 전체 합이므로 전체 한글 pack을 넣고 첫 화면만 작다고 주장하지 않음 |
| 예산 | 사용자 제공 약1,007 KiB를 출발점으로 했고, 이 체크아웃의 Docker `build:web`은 **1,010.2 KiB**였다. 1,536−1,010.2=**525.8 KiB** 여유. 폰트160 + 효과/아이콘12 + 소리48 + 새 UI CSS/JS24 = **244 KiB 상한**, 예상 합 ≤1,254.2 KiB, 여유281.8 KiB. 채택 폰트는 **한 종만** 배포. 이 PR의 목업/폰트는 docs에만 있어 앱 증가0 |
| 숫자 | `font-variant-numeric: tabular-nums`를 금액/점수/배수에 적용, 쉼표 포함 값은 고정 폭 열+오른쪽 정렬. tnum 태그 보존을 subset 설정에 명시 |
| 렌더 | [WOFF2](https://www.w3.org/TR/WOFF2/), 가변 wght CSS 사용. 목업 3종을 Chromium/WebKit 412×915에서 확인. 24px 단일 숫자 폭은 Linux Chromium 최대1 CSS px 편차, WebKit 0을 관찰했다. 힌팅 제거로도 Chromium 편차는 없어지지 않아 원인은 확정하지 않았다. 고정 수치 열/우측 정렬로 정보 위치를 유지하며, 엄밀한 실기기 숫자폭 검증은 남긴다. Noto는 파일 기능 측정만. 실제 Galaxy WebView/iPhone의 래스터화·aA·textZoom은 사람 확인 전 보장하지 않음 |
| 로딩 | 로컬 `@font-face`, `font-display:swap`, 고정 행 높이. 서버는 올바른 MIME. 필수 UI가 fallback에서도 잘리지 않아야 함. Secure Context 기능 의존 없음 |
| 서브셋 누락 | 사용자 이름·예외/로그는 `system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif`로 fallback. 새 UI 문구 추가 시 corpus 갱신·누락 검사·폰트 다시 측정 |
| OFL | 원본 고지 포함. 수정본은 Reserved Font Name을 피하도록 내부 family/PS 이름을 `VDPretendard`/`VDSUIT` 등으로 변경. [OFL FAQ](https://openfontlicense.org/ofl-faq/) 참고. 목업용 이름이며 출시명은 채택 후 결정 |

**권고:** Pretendard 가변 로컬 subset 1종을 우선 검토하고 본문 400/500, 레이블 600, 점수/제목 700~800만 사용. 전 weight를 따로 파일로 배포하지 않는다. 비용만 최적화하면 Wanted가 작지만, 35 KiB 차이보다 선택 문구의 안정적인 읽기를 우선한다. 이것은 디자이너 판단이며 실기기 사용자 비교는 아직 없다.

## 6. 이미지·질감·효과 자산 출처 (VD-05)

| 출처 | 확인 라이선스 | 사용 가능 범위 / 이번 제안 |
|---|---|---|
| [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | 제품 페이지 CC0 | 놓기/선택/획득의 짧은 소리 후보. 100개 통째 배포하지 않음, 실제 선택·청음 후 파일 단위 고지/해시 |
| [Kenney Board Game Icons](https://kenney.nl/assets/board-game-icons) | 제품 페이지 CC0 확인 | 보조 보드 아이콘 후보. 이번 목업에 가져오지 않음 |
| [OpenGameArt: Animated particle effects #2](https://opengameart.org/content/animated-particle-effects-2) | 개별 업로드 CC0 | 스프라이트 원리/후보. 원 archive 5.9 MB여서 통째 도입 금지. 필요한 프레임만 추려도 예산/읽기 이점이 없으면 제외 |
| [Phosphor core](https://github.com/phosphor-icons/core/blob/main/LICENSE) | MIT | 메뉴/음량/뒤로 6~10개만 가능, 원 LICENSE 동봉. 현재 목업은 자체 CSS/텍스트 기호 사용 |
| Pretendard / SUIT / Wanted / Noto | OFL 1.1, 위 원문·동봉 고지 | 문서용 subset 동봉. 한 종만 구현 후보 |
| 자체 CSS/SVG | 저장소 MIT; 별도 공개 효과 자산은 CC0 선택 가능 | 원/호/짧은 선/도장 모티프. 한지색은 색상 관계로 표현, 판에 실제 종이 사진·노이즈 텍스처 없음 |
| 기존 Commons 카드 | **기존 확정 예외: CC BY-SA 4.0** | 새 자산 허용 목록과 별개. [기존 저작자 표기](../../packages/web/public/cards/ATTRIBUTION.md) 유지, SVG 수정 없음. 이를 포함한 PNG에도 카드 출처 표기 |
| 상용 게임·검색 이미지·Lottie/Rive 마켓 | 오픈 사용권 미확인 | 레퍼런스 링크만. 무료 다운로드를 CC0/MIT로 간주하지 않음 |

## 7. 이번 결론과 후속 검증

| 지금 결정할 것 | 방향 채택 후 확인할 것 |
|---|---|
| A/B/C의 팔레트·타이포·표면·사건 성격. 추천은 A | 폰트 최종 카탈로그/실기기 가독성, 긴 금액/200% 확대, 상대 손패 은닉 |
| 새 디자인 프레임워크 없이 현 Svelte/CSS 유지 | `<dialog>`의 실제 접근성 결함이 나올 때만 Bits 재평가 |
| 국소 효과와 표준 사건 색 유지 | #86의 보통/빠름/매우 빠름·스킵·동작 줄이기 동기화 |
| docs 목업과 앱을 분리 | 앱 통합 후 NF-03/AC-07 전체 dist 측정, 외부 요청 0, Chromium/WebKit 회귀·사람 기기 확인 |

Playwright API는 [Context7의 Microsoft Playwright 원문 연결](https://context7.com/api/v1/microsoft/playwright?tokens=1000&topic=screenshot)과 [공식 screenshot 문서](https://playwright.dev/docs/screenshots), 폰트 처리는 [Context7 FontTools](https://context7.com/api/v1/fonttools/fonttools?tokens=1000&topic=subset) 및 공식 문서를 조회했다. 고정 412×915 정지 목업은 실서비스의 상호작용·규칙·접근성 수용 시험을 대신하지 않는다.
