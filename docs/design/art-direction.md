# 사이 · 전문 자산 아트 디렉션

상태: PR #147 평가용 고정안. A(먹빛·한지색·Pretendard)를 유지한다. spec UX-11/13/18·NF-01/03/07, plan PA-01~04. 현행 NF-03 총 1.5 MiB는 변경하지 않는다.

## 1. 공통 문법

| 항목 | 고정 규칙 | 금지/검수 |
|---|---|---|
| 색 | 먹 `oklch(23% .025 160)`, 한지 `oklch(92% .035 85)`, 황동 `oklch(69% .07 85)` | RGB 네온·화면별 다른 금색 금지 |
| 재질 | 저채도 먹색 펠트, 짙은 호두나무 외곽, 무광 황동 1~2px 안선 | RPG 가죽 버튼·볼트·두꺼운 장식 프레임 제외 |
| 질감 스케일 | 판 타일 380 CSS px, 가죽 160px, 나무 외곽 9px | DPR별 해상도만 변경; 무늬의 화면 크기 유지 |
| 조명 | 좌상단(30% 18%)의 넓고 따뜻한 광원, 우하단 그림자 | 실시간 블러·다중 글로우·상시 파티클 없음 |
| UI 형태 | 자체 CSS, 패널 12px·버튼 10px·아바타 원형, 1px 경계 | 텍스처는 판에, 읽는 면은 불투명에 가까운 먹색 |
| 선·아이콘 | 2px 단색 윤곽, 끝 둥글게; 정보 도형은 색+형태 병용 | 전문 팩의 서로 다른 아이콘 스타일 혼합 금지 |
| 타입 | 로컬 Pretendard 파생 서브셋, 점수 24px/보조 14px, tnum | 슬로건·감성 문구·세로 장식 문구 없음 |
| 그림 | 학·소나무 도상; 동일 박물관 작품에서 홈/정산 크롭, 먹/한지 듀오톤 | 원화 위에 새 낙서 도형 추가하지 않음 |
| 아바타 | Commons48 실제 월별 도상 12종을 별도 원형 크롭·듀오톤 | 원본 48장 변경 금지; 파생본 CC BY-SA 4.0 유지 |
| 효과 | 공통 따뜻한 밝은 심지, 뻑 적갈/쪽 청록/따닥 황동/폭탄 주황 | 원본의 과채도 제거; 의미는 글자·형태로도 구분 |
| 시간 | #86 durationMs 계약 그대로, 유한 RAF, reduced-motion 정지 프레임 | --dur-*·anim 로직 변경 없음; 금액 카운트업 금지 |
| 배치 | ui-spec 구역/여백/48px 입력 계약. 효과 영역 밖 카드 가림 0 | #104 구조 통합 전 평가 화면을 최종 HUD로 간주하지 않음 |

## 2. 자산 가공 및 권리

| 채택/제외 | 원본·권리 | 일관성 가공 | 적용 |
|---|---|---|---|
| 채택 | ambientCG Fabric037/Wood050/Leather037/Metal034, CC0 | 원래 미세 결 유지, 먹/호두/무광 황동으로 명도·색조 제한; 펠트 normal 조명 bake | 판·트림·좌석 |
| 채택 | para Animated Particle Effects 1, CC0 | 알파/64프레임 보존, 사건별 제한 팔레트 | 뻑·쪽·따닥·폭탄 |
| 채택 | Kenney Particle/Casino/Impact/Interface, CC0 | 파티클 atlas, mono Ogg/AAC; 화면 진입 시 무음·제스처 후 로드 | 효과·소리 |
| 제외 | Kenney UI Adventure / Animal Pack | 원본·파생 산출물 제거 | 자체 CSS 프레임 / 화투 초상으로 교체 |
| 채택 | [Hokusai, Cranes on Branch of Snow-covered Pine, Met JP660](https://www.metmuseum.org/art/collection/search/37107), Public Domain / [Met Open Access CC0](https://www.metmuseum.org/hubs/open-access) | 먹/한지 듀오톤, 홈·정산별 크롭; 작가 서명은 장식 문구로 재사용하지 않음 | 홈 키비주얼·정산 |
| 채택 | [Spenĉjo·Marcus Richert·Louie Mantia Jr., Commons Hwatu](https://commons.wikimedia.org/wiki/Category:SVG_Hwatu), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | 기존 svgo 최적화본에서 월별 도상 크롭·원형 마스크·듀오톤. 파생본 동일 라이선스 | 좌석 초상 12종 |

원본 SHA-256·다운로드·가공 좌표는 assets-src/manifest.json에 기록한다. License 화면과 pro/NOTICE.md에 원저작자·출처·변경·라이선스를 함께 출력한다. 외부 URL은 고지 텍스트이며 실행 중 요청하지 않는다. 사용자 제공 자산은 필요하지 않다.

## 3. 일관성 검수표

| 검수 | 합격 기준 | 증거 |
|---|---|---|
| 팔레트/광원 | 홈·판·정산의 먹/한지/황동, 좌상단 광원 동일 | mockups/pro home·board·settlement |
| 프레임 | RPG border-image 없음; 판 트림만 전문 질감 | 소스 및 제외 자산 검사 |
| 초상 | 카드와 같은 도상, 동일 원형/듀오톤, 원본 카드 무변경 | avatars 캡처·git diff |
| 그림 | 홈/정산 같은 원화 계열, 읽기 영역과 분리 | home·settlement 캡처 |
| 효과 | 같은 밝은 심지/알파, 사건색 차이, 카드 가림 없음 | ppeok·jjok·ttadak·bomb |
| 접근성 | 최소 4화면 axe, 48px 입력, 대비·focus·reduced-motion | PR 검증표 |
| 성능 | 평가/정규 빌드 분리, 외부 요청 0, FPS·용량·미검증 실기기 명시 | research/pro-assets·device-test/pro-assets |

## 4. 통합 순서

#104: 구조·표식·HUD 정보 설계, 최소 화면·가림0, #100 정산 로직 위 기본 A 외관을 먼저 병합 가능하게 한다. #147은 전문 스킨과 자산의 평가/아트 디렉션 PR로 유지한다. 확정 후 별도 스킨 PR에서 #104의 고정 구역/선택 예약/문턱 칩을 보존하며 재질·자체 프레임·그림·초상을 입힌다. #104에 평가 팩이나 예산 예외를 섞지 않는다. NF 개정 승인 전 본선1.5MiB gate 유지.
