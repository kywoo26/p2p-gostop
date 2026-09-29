# 게임급 시각 업그레이드 조사·프로토타입

2026-09-29 · 디자인 리드 · VU-01~04. `spec.md` §6, NF-01/02/03/04/07/08·AC-07, `plan.md` §1.6/1.8·.1-A. **출시 규범 변경이 아닌 사용자 검토용 실험**이다. #104 `57f8689`를 보존하고 `design/visual-upgrade-proto`에서 분기했다. 카드48장·게임/정산/P2P 로직·시간표는 유지한다.

## 1. 달성할 인상과 방법

이전 제안은 위계·가림 해소에는 집중했지만, 질감·빛·접지·오브젝트·사건의 순간적 밀도를 지나치게 제거했다. 이번 제안은 **실제 재질이 있는 판, 그 위에 놓인 카드, 짧게 반응하는 빛과 파편**이다. 다크/한지색/Pretendard와 기능 라벨은 유지하고 무질감 원칙은 재검토한다. ‘모던’이라는 단어 대신 아래 관찰 가능한 결과를 평가한다.

| 결과 | 구현 | 검토 기준 |
|---|---|---|
| 판이 재질과 깊이를 가짐 | ambientCG CC0 직물 Color map을 재색상화한 WebP + 고정 비네트/조명 + 자체 SVG 상감 | 카드와 다른 공간으로 읽히되 월/光/표식을 가리지 않음 |
| 카드가 판에 놓여 있음 | 접지 그림자·두께 그림자·더미 단면, 기존 SVG 유지 | 숫자/그림 흐림 없음, 선택 표식/48px 입력 보존 |
| 홈이 게임 오브젝트를 보여 줌 | 나무 타원 판·기울어진 실제 카드2장·자체 동전/식물 모티프 SVG | 스크린샷 합성 대신 실제 Home에서 동일하게 표시 |
| 사건마다 다른 반응 | 뻑=따뜻한 파편/충격 고리, 쪽=푸른 마름모/광원. 32입자 Canvas | 선택 예약 행 안, 주체+사건명 유지, 타이머 추가로 턴 지연 없음 |
| 뒤집기가 입체적으로 읽힘 | CSS perspective/rotateY 키프레임, 기존 opacity 면 전환 유지 | #86 시간·취소·최종 상태 보존, WebKit 뒷면 오류 재검증 |

## 2. 전송 예산 재검토 (VU-01)

현재 NF-03은 첫 로딩2초·총1.5MB를 함께 적고, 빌드 게이트는 **1.5MiB=1,572,864B의 dist 원본 총합**을 검사한다. 이는 실제 첫 방문의 전송량·압축량·렌더 시간을 직접 측정한 값이 아니다. [Android LOHS 문서](https://developer.android.com/develop/connectivity/wifi/localonlyhotspot)는 인터넷 없는 로컬 기기 통신을 보장하지만 Galaxy→iPhone의 유효 Mbps SLA를 제공하지 않는다. **수십 Mbps는 아래 설계 시나리오이며 이 기기쌍의 실측 결과가 아니다.** 밴드·간섭·거리·절전·동시 AI 부하가 변수다. [Apple의 AP 밴드 설명](https://support.apple.com/en-ca/guide/security/secfd166f620/web)도 호환성 모드가 대역을 제한함을 보여 주지만, 이를 Android LOHS의 성능 수치로 대입하지 않는다.

순수 전송 하한 = `MiB × 1,048,576 × 8 / (Mbps × 1,000,000)`. 아래에는 QR/Wi-Fi 접속·TCP·요청 대기·압축 해제·JS 파싱·폰트/이미지 디코딩·첫 페인트 시간이 **포함되지 않는다**.

| 전송할 바이트 | 10Mbps | 20Mbps | 40Mbps | 80Mbps |
|---|---:|---:|---:|---:|
| 1.5MiB | 1.258초 | 0.629초 | 0.315초 | 0.157초 |
| 2MiB | 1.678초 | 0.839초 | 0.419초 | 0.210초 |
| 4MiB | 3.355초 | 1.678초 | 0.839초 | 0.419초 |
| 6MiB | 5.033초 | 2.517초 | 1.258초 | 0.629초 |

| 예산 개정 제안 | 값 / 근거 | 채택 조건 |
|---|---|---|
| 공용 게임 자산 총합 | **4MiB** 상한. 현재 코어/카드/폰트 + 약2.7MiB의 홈 일러스트·사건 시트·음향 여유 | dist 총합과 실제 경로별 전송을 별도 게이트로 관리 |
| Android 전용 고해상도 선택 팩 | 추가≤2MiB, APK 내 웹 자산 총합 **6MiB** | 게스트가 이 파일을 요청하지 않음을 검사 |
| 게스트 첫 입력 가능 화면 | **≤2MiB**, 목표≤2초 유지 | 실기기 cold cache20회에서 p95≤2초. 최저 측정 대역에서 초과하면1.5MiB 또는 더 낮은 단계로 복귀 |
| 게스트 이후 선택 자산 | 나머지를 해당 화면 진입 시 로드. 진행 중 선행 로딩은 실측 후 결정 | 초기 AI/분배와 이미지 디코딩 동시 실행 회피. 요청 실패 시 단색 판으로 플레이 가능 |
| 외부 요청 | **계속0**, 서비스워커/CDN 없음 | APK의 Ktor/loopback/같은 LAN origin에서만 제공 |

20Mbps에서4MiB는 전송만1.68초,6MiB는2.52초다. 따라서 ‘6MiB로 올려도 항상2초’라고 약속할 수 없다. **권고는 총4MiB + 게스트 첫 화면2MiB + Android 선택2MiB**이며 사용자 결정 전 현행 규범/게이트는 바꾸지 않는다.

[Android 로컬 콘텐츠](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)는 네트워크 다운로드를 없앨 수 있지만 디코딩·GPU 업로드·메모리 비용은 남는다. 현재 저장소는 `SmokeServer.kt`가 `AssetManager` 바이트를 loopback/LAN으로 서빙하며 같은 자산을 쓴다. ‘Android 무제한’ 대신 설치/디코딩 예산을 둔다. 이번에는 WebP/AVIF MIME만 보완했고 전송/게임 로직은 바꾸지 않았다.

### 해상도·코덱 전략

| 자산 | 게스트 기본 / 고해상도 | 디코딩·전송 전략 |
|---|---|---|
| 타일 질감 | 256² / 512² WebP, CSS 타일256px | 이번 프로토타입에 실제2단계 적용. 2dppx 이상에서512를 요청하며 둘을 미리 가져오지 않음. **현재는 DPR 선택이고 host/guest 분기는 아직 제안** |
| 홈 일러스트 | 가로824px / Android1236px, WebP 또는 AVIF | `<picture>`로 지원 포맷1개만 요청. 세로 약700px 이하, 경로별≤250/450KiB의 자체 상한 제안. 카드 원 SVG와 글자는 별도 레이어 |
| 사건 시트 | 256px 프레임8~12개 / 384px 선택형 | 전환 때만 디코딩, 사건 공용 atlas1개. 전체4K 텍스처/모든 PBR 채널을 넣지 않음 |
| UI/숫자/표식 | 로컬 OFL 폰트·SVG | 흐린 래스터 글자를 만들지 않음. 48px 입력·14px 손패 표식 유지 |

[Google WebP 문서](https://developers.google.com/speed/webp/docs/compression)는 손실·무손실·alpha를 지원한다고 설명한다. 평균 절감률을 우리 자산의 결과로 주장하지 않고 실제 파일을 비교한다. [Safari16 WebKit 공지](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/)는 iOS16 AVIF 지원을 명시한다. 목표 iOS26.5는 범위 안이지만 디코딩 속도·WebView 구현은 따로 측정한다. 이번 산출물은 **WebP만** 쓰며 AVIF 인코더를 새로 설치하지 않았다.

## 3. 기법·비용·성능 (VU-02)

개발 일수는 1인 구현+자동검사+1회 시각 조정의 추정이며 기기 인터뷰/완전 수용 기간은 제외한다. 크기는 명시된 실측 외에는 **후속 제작 상한 제안**이다.

| 기법 | 자산/코드 예산 | 60fps·배터리 위험과 통제 | 구현 비용 / 권고 |
|---|---|---|---|
| 타일 직물·한지·목재 | 이번 직물/목재4개 **18,426B** | 512² RGBA는1MiB. 정적 반복 타일·조명이라 매 프레임 노이즈 생성 없음. 4K 이미지 사용 금지 | 1~2일. 직물 판 우선, 한지는 판 전체보다 팝업 포인트 후보 |
| 비네트/조명 | 이미지0, CSS gradient | 빛 위치/blur를 상시 애니메이션하지 않음. OLED에서도 밝은 면적 증가의 전력량은 실측 필요 | 0.5~1일. 그림자 방향 통일 |
| 카드 접지·단면 | 이미지0, 고정 CSS box-shadow | 그림자 자체 보간 금지. 원SVG·Card 구조 유지, 움직이는 카드만 기존 will-change | 0.5~1일 |
| 3D 뒤집기 | 이미지0, 표시 어댑터 | 280/140/84ms 시간표 그대로. 기존 opacity 전환 보존. Safari preserve-3d/opacity flattening 주의 | 1~2일. 프로토타입 어댑터를 정식 anim 표현 API로 합의 후 이전 |
| 반투명/유리 패널 | 이미지0, 낮은 alpha+테두리 | 이번 blur는 예약 행 한 곳6px. 큰 blur·다중 겹침·전면 backdrop-filter 금지, 불투명 fallback 유지 | 0.5~1일 |
| Canvas 파티클/글로우 | 프로토타입32입자·64² 광원 캐시, 외부팩0 | 예약 행만, 내부DPR≤2, 사건 동안만 rAF. 숨긴 탭/해제 시 종료, reduced-motion에서 정보 글자만. 전체 화면 canvas 회피 | 2~3일. 현재 규모에는 충분한지 실기기 측정 |
| 스프라이트 시트 | 8~12×256² 프레임, 사건당≤96KiB 제안 | 12×256² RGBA 약3MiB. 압축파일이 작아도 디코딩 메모리는 큼. 짧은1회 재생·재사용 | 제작2~4일 + 연결1일. 수작업/생성 효과가 절차적 입자보다 나을 때 |
| 자체 SVG 일러스트/아이콘 | 홈/상감/동전 이번3개, 일반 아이콘6개≤12KiB 제안 | 외부이미지/font/filter 없는 SVG. 강조색·광원·외곽두께 일관성 | 1~2일. 기본 outline 아이콘 라이브러리만으로 게임 그래픽을 대신하지 않음 |
| PixiJS WebGL | MIT, **이 저장소의 최소 빌드 증가 미측정** | 많은 sprite/atlas batching 이점. GPU context 손실·텍스처 GC·ticker·WebView 회복·접근성 DOM 동기화 추가 | 3~5일 spike+기기 측정. 지금 도입 안 함, §1.8 금지의 조건부 재검토 후보 |

[Chrome 렌더링 문서](https://web.dev/articles/rendering-performance): 60Hz의 프레임 간격16.67ms 중 브라우저 비용을 고려해 앱 작업을 줄인다. [애니메이션 지침](https://web.dev/articles/animations-guide): transform/opacity와 제한된 레이어를 우선한다. [MDN Canvas 최적화](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas): 반복 도형 사전 렌더·캔버스 크기 관리. [Pixi 성능 지침](https://pixijs.com/8.x/guides/concepts/performance-tips) 및 [MIT 원문](https://github.com/pixijs/pixijs/blob/dev/LICENSE): batching과 메모리 관리는 장점이나 라이브러리 도입 자체가60fps 보장은 아니다.

**금지 결정 개정 조건:** 동일32/128/256입자 장면에서 Canvas와 Pixi의 압축/원본 dist·프레임 p95·30분 열화·context 복귀를 비교한다. Canvas가 Galaxy에서 지연되고 Pixi가 명확히 개선할 때 버전 고정 및 사용 API 범위를 plan1.8에 별도 TRIAL로 추가한다. Tailwind/shadcn/GSAP 전환은 이번 그래픽 문제의 필요조건이 아니므로 제안하지 않는다.

## 4. 구체 자산 목록·수용 파이프라인 (VU-03)

| 자산 / 원문 | 라이선스 | 선택/용도 |
|---|---|---|
| [ambientCG Fabric037](https://ambientcg.com/view?id=Fabric037), [Wood050](https://ambientcg.com/view?id=Wood050) | [CC0](https://docs.ambientcg.com/license/) | **실사용**. 각각1K-JPG zip에서 Color.jpg만 추출, 재색상화/256·512 축소. 원본 procedural material이며 사진 촬영물이라고 주장하지 않음 |
| [Kenney Particle Pack](https://kenney.nl/assets/particle-pack) | 페이지CC0 | spark/star/smoke 단일 스프라이트 후보. 이번32입자는 자체 Canvas이므로 이 팩은 미번들 |
| [OGA Animated particle effects #2](https://opengameart.org/content/animated-particle-effects-2) | 해당 업로드CC0 | 충격/폭발 프레임 후보. archive 통째 배포 금지, 필요한 atlas만 검수 |
| [Kenney Board Game Icons](https://kenney.nl/assets/board-game-icons), [Board Game Info](https://kenney.nl/assets/board-game-info) | 페이지CC0 | 상대/소리/설정/게임 모드 보조 후보. 다른 라이선스 사이트와 혼동하지 않음 |
| [Phosphor core](https://github.com/phosphor-icons/core/blob/main/LICENSE) | MIT | 기능 아이콘만 필요할 때 단일SVG+고지. 일러스트/질감 대체재 아님 |
| 기존 Pretendard | OFL-1.1, 저장소 원문 고지 유지 | 문자 전용. OFL을 일반 이미지의 사용권으로 적용하지 않음 |
| `hero-inlay/table-inlay/coin.svg`·Canvas | 자체 제작, 저장소 MIT | **실사용**, 제3자 게임의 로고·캐릭터·구도 복사 없음 |
| 사용자 제공/생성 이미지 | 제공 시 권리/출처 확인, 자체 제작 또는 허용 라이선스별 기록 | 상용 게임 캡처·출처 없는 팩을 그대로 넣지 않음. 생성물은 프롬프트/도구/날짜·입력 이미지 권리를 기록하고 검수 |

사용 자산의 출처는 `public/visual/NOTICE.md`, 파일별 크기·해시는 [자산 명세](visual-upgrade-assets.json)에 기록한다. Commons 카드의 기존 CC BY-SA 고지는 그대로 둔다.

| 입력 단계 | 규격 / 자동 처리 |
|---|---|
| 질감 | 정사각 1024~2048, 가장자리 연결 가능한 무문자 이미지. 광원/비네트는 이미지에 굽지 않고 별도 레이어 |
| 홈 일러스트 | 원본가로1648px 권장, 중앙 주체·버튼 영역 비움, 투명PNG 가능. 표준화된 조명·팔레트로 검수 |
| 사건 | 투명PNG 프레임256/384, 8~12장 또는 sprite sheet+프레임JSON. 텍스트/점수/손패는 이미지에 굽지 않음 |
| 원본 보관 | `.visual-source/`(git ignore), 원본 URL·CC0/MIT/OFL/자체제작 구분·SHA256. 원본 파일 재배포 조건 확인 |
| 최적화 | 아래 기존 Playwright 스크립트. aspect ratio 유지·alpha 유지·재인코딩으로 메타데이터 제거·파일당 크기 게이트. SVG는 외부참조/스크립트 검사 후 기존 svgo 경로로 별도 처리 |
| AVIF | 다음 후보: 고정버전 encoder를 plan1.8에 기록하고 WebP와 시각/디코드 비용 A/B. ‘AVIF가 언제나 더 좋다’고 전제하지 않음 |
| 배포·검수 | 앱 상대/동일origin URL, MIME 확인, 저/고해상도 중1개만 요청, axe/초점/4화면/실제 폰의 흐림·타일 이음새 확인 |

재현: 소스 다운로드는 `docker compose run --rm dev python3 docs/research/fetch-visual-sources.py`; 앱 최적화는 다음처럼 실행한다. 크기512는256으로 바꿔 같은 절차를 반복한다. 사용자 이미지에는 `tone=none`을 써 색을 유지한다.

```sh
docker compose run --rm dev node packages/web/scripts/prepare-visual-asset.mjs .visual-source/Fabric037_1K-JPG_Color.jpg packages/web/public/visual/felt-512.webp 512 felt 100
docker compose run --rm dev node packages/web/scripts/prepare-visual-asset.mjs .visual-source/Wood050_1K-JPG_Color.jpg packages/web/public/visual/wood-512.webp 512 wood 100
```

## 5. 상용 레퍼런스를 요소로 분해 (VU-04)

2026-09-29 공식 페이지·스토어 이미지 열람. 아래 스토어 그림에는 광고 합성이 포함돼 있다. 앱 내부의 실제 구현 기술·FPS·효과 지속시간은 이 그림으로 판정하지 않는다. 이미지는 로컬 열람만 했고 앱/문서 자산으로 복제하지 않는다.

| 공식 근거 / 확인 표본 | 관찰한 구성 | 같은 인상을 위한 우리 요소 목록 |
|---|---|---|
| [Balatro / Playstack](https://play.google.com/store/apps/details?id=com.playstack.balatro.android&hl=en), 현재 표기2026-09-07 업데이트, [스토어1번](https://play-lh.googleusercontent.com/aBZxyrdzbus7uWY4_OS8-EImZxVmcN62oEntu5-By0Wr2g4ic6YpKJJzxlKi5fXIiEMnUUxJFzRdB0m3-o3lleU=w1000) | 녹색 유체무늬 판, 불투명/반투명 슬롯, 카드 아래 두꺼운 접지 그림자, 점수 팝업과 칩/배수 색분리. 레트로 화풍이어도 화면이 평면 폼처럼 보이지 않음 | 재질 판·기능별 면·카드 접지·큰 사건 숫자·일관된 움직임. CRT/픽셀 글꼴 자체는 이식하지 않음 |
| [Marvel Snap 공식 Overview](https://marvelsnap.com/game-overview/), [스토어](https://play.google.com/store/apps/details?id=com.nvsgames.snap&hl=en), [카드 홍보 프레임](https://play-lh.googleusercontent.com/DqVx6I1zgKd9nKeNuovAW--StVsODlBTJRksALzGcBxAeIQrkoe3r__l-FyFcmqRKlJ6qPu3Dg7sSJqnohGp29s=w1000) | 공식은 카드별 능력/Location을 각각 이미지·영상으로 분리. 홍보 프레임에는 강한 전경 일러스트, 카드 면의 원근, 고유 발광 궤적. 홍보 합성을 플레이판으로 오인하지 않음 | 공간의 전경/판/빛 분리, 행동의 시작→도착 광원, 사건별 형태. 캐릭터·카드 그림은 복제하지 않고 Commons 카드 외부 연출로 구현 |
| [한게임 신맞고 / NHN](https://play.google.com/store/apps/details?id=com.NHNEnt.NDuelgo&hl=ko), 현재 표기2026-09-15 업데이트, [스토어6번](https://play-lh.googleusercontent.com/TlN7X6HYZ0Ka2rWevIzvXGr5hTmW-ytiAwUZ-X_tVnhzjxDOLCAB6NXz8L1o0jmCNzQcmvtPwXGe8j6lUBsF=w1000) | 녹색 판·카드 속도선·큰5고·방사광·반짝임·캐릭터. 광고 합성에서 ‘큰 사건’이 화면 밀도와 명암을 바꿈 | 고/폭탄/뻑/쪽마다 다른 순간적 반응·대비·타격점. 전면 캐릭터/판매 UI 대신 예약 구역 안의 강한 한 번 반응 |

이번 프로토타입은 재질·조명·홈 오브젝트·접지·3D·뻑/쪽을 실제 앱으로 검증한다. 완성된 상용 게임 수준의 캐릭터 일러스트·9종 효과·오디오 마스터링을 모두 구현했다는 뜻은 아니다. 다음 제작 후보는 **자체/제공 홈 키아트1장 + 사건 atlas1개 + 9종 음향**이며 별도 사용자 시각 선택을 받는다.

## 6. 실행·실측·한계

이 절의 수치는 최초 프로토타입 `c7cb3af`의 기록이다. 강화 변형 및 최종 재검증은 §8을 따른다.

```sh
docker compose run --rm -p 5173:5173 dev npm run dev -w packages/web
# 실제 홈/솔로: /?visual=upgrade  /?visual=upgrade#/solo
# 비교 A: /  (query 없음)
# 사건 정지 프레임: /?visual=upgrade&impact-frame=0.25#/dev/gallery/upgrade-ppeok
docker compose run --rm dev npm run e2e -w packages/web -- visual-upgrade.spec.ts --project=chromium --project=webkit
docker compose run --rm dev node packages/web/scripts/measure-visual-upgrade.mjs
```

성능은 개발 이미지의 headless Chromium/WebKit에서 CSS412×915·DPR1/3.5, 이벤트5회/5초, CPU/네트워크 제한 없이 측정한다. rAF 간격을 이용한 FPS 추정과 JS 콜백 시간을 기록한다. **화면에 실제 표시된 GPU 프레임 수, Galaxy WebView FPS, iPhone 실기기 FPS 또는 배터리 소모가 아니다.** 각 모드의1.2초 유휴 콜백0도 검사한다. 원자료 `test-results/visual-upgrade/performance.json` 및 문서에 보존한 요약을 따른다.

실측 결과는 아래 최종 측정 표에 기록한다. 수치 없는 칸을 합격으로 간주하지 않는다.

측정일 2026-09-29, Linux 개발 이미지 / Intel i7-14700K / 논리 CPU20. Chromium153.0.8010.12·WebKit26.6, 각 조합1회이므로 통계적 성능 보장으로 해석하지 않는다. [측정 요약 JSON](visual-upgrade-performance.json)은 브라우저 버전·자산 선택·콜백 수를 보존한다.

| 빌드/자산 지표 | 실측 |
|---|---:|
| 전체 dist 원본 합계 | **1,274,665B = 1,244.8KiB**, 현행1,536KiB 이하 |
| 추가 질감4개 | 18,426B |
| 자체 SVG3개 | 2,033B |
| 기존 로컬 폰트 | 143,932B, 변경 없음 |
| 의존성 추가 | 0 |
| 외부 요청 | 두 브라우저·두DPR·홈/판/사건 경로 모두0 |
| 판 진입 리소스 encodedBodySize 합계 | Chromium DPR1 **455,581B**, DPR3.5 **460,487B**; WebKit 각각456,247B /461,153B |
| 해상도 선택 | DPR1은 felt-256(3,796B), DPR3.5는 felt-512(8,702B)만 요청 |

리소스 합계는 초기 판 경로의 Resource Timing 값이며 HTML navigation·HTTP 헤더·이후 화면 자산은 제외한다. 전체 dist와 같지 않고, 초기 로딩2초를 측정한 값도 아니다. 기본 A와 비교한 이 경로의 추가 이미지 전송은 DPR1 4,273B /DPR3.5 9,179B다. 공용 JS/CSS에는 실험 코드가 포함되므로 이 차이를 전체 실험 코드의 크기라고 해석하지 않는다.

| 브라우저 / DPR | 기본 A rAF 회/초 → 실험 | 프레임 간격 p95, A → 실험 | 25ms 초과 간격 수, A → 실험 | 실험 앱 콜백 p95 /최대 |
|---|---:|---:|---:|---:|
| Chromium /1 | 60.00 → **60.00** | 16.8 →16.7ms | 0 →0 | 0.3 /0.4ms |
| Chromium /3.5 | 60.00 → **60.00** | 16.8 →16.7ms | 0 →0 | 0.3 /0.7ms |
| WebKit /1 | 61.96 → **53.85** | 17 →17ms | 1 →5 | 1 /1ms |
| WebKit /3.5 | 61.96 → **53.51** | 17 →17ms | 1 →5 | 1 /1ms |

**WebKit은 효과 포함 장면에서 회귀가 관측됐다.** p95만 보면17ms로 같지만 긴 간격이5회라 평균 cadence가 낮아진다. 효과마다 갤러리 경로를 전환하므로 화면 교체·첫 Canvas 생성/합성 비용도 포함한다. JS 콜백의 짧은 시간만으로 GPU/합성에 문제가 없다고 단정할 수 없다. 정식 적용 전에 실제 사건 연속 재생 trace로 생성/합성/blur 비용을 나누고 Canvas 재사용·광원/blur 축소를 비교한다. WebKit의 기본61.96 역시 실제 화면의62fps를 의미하지 않는다. 모든 조합에서 유휴1.2초의 앱 rAF 콜백은0이었다.

| 검증 | 결과 / 범위 |
|---|---|
| lint /check | 통과, svelte-check 오류·경고0 |
| Node /브라우저 컴포넌트 | 491 /312건 통과 |
| 전체 E2E | **256건 통과**, 기존 skip4건. 기존 A 픽셀 기준샷 수정0 |
| 새 프로토타입 E2E | Chromium/WebKit 합계22건: 실제 솔로 저장 재개→카드3D뒤집기/뻑 연결, 홈·판·두 사건, 최소 화면4종, reduced-motion |
| 최소 화면·입력 | 360×780 /390×734 /430×822 /412×915, 손패10장·입력48px·뷰포트/바닥 구역 검사 통과 |
| axe /네트워크 | 새 홈·판·두 사건·최소 화면 검사에서 위반0 /외부 요청0 |
| 접근성 전후 | 기존 정보/포커스 DOM·기능 라벨 유지. 새 이미지 장식 및 Canvas는 입력을 가로채지 않음. 동작 줄이기에서 입자 비표시·사건 글자 유지. axe 색 대비 자동검사 통과; 질감 위 실기기 가독성은 별도 검토 |
| Android | assembleDebug /testDebugUnitTest /lint 통과. WebP·AVIF MIME 테스트 포함 |
| 미검증 | Galaxy 실화면 FPS·열화·배터리, iPhone 핫스팟 첫 로딩 p95. 사람의 실기기 검증 필요 |

캡처는 CSS412×915, 이미지 DPR1이다. 홈은 실제 Home이고 판/사건은 **실제 Board 컴포넌트에 시각 fixture를 주입한 화면**이다. fixture 자체를 정상 게임 이력이라고 주장하지 않는다. 실제 솔로 게임의 3D뒤집기·뻑 도달은 별도 E2E로 검증했다. 사건은 비교하기 쉽도록 재생25% 프레임을 고정했다. PNG는 git에 넣지 않고 `packages/web/test-results/visual-upgrade/`에 남긴다.

| 화면 | Chromium 캡처 | WebKit 캡처 |
|---|---|---|
| 홈 | `home-chromium-412x915.png` | `home-webkit-412x915.png` |
| 인게임 | `board-chromium-412x915.png` | `board-webkit-412x915.png` |
| 뻑 | `ppeok-chromium-412x915.png` | `ppeok-webkit-412x915.png` |
| 쪽 | `jjok-chromium-412x915.png` | `jjok-webkit-412x915.png` |

실기기 수용: [검증 절차](../device-test/visual-upgrade.md). Galaxy WebView와 게스트 iPhone에서 저/고해상도·cold cache20회·30분 반복 사건/AI·온도/배터리·OS 동작 줄이기를 비교한다. 결과 전까지60fps/2초/배터리 합격을 주장하지 않는다.

## 7. 채택 제안

1. 시각은 **현재 프로토타입의 재질·조명·오브젝트 계층을 출발점으로** 사용자 캡처 평가 후 다듬는다. A의 정보 위계·기능 라벨은 유지하고 무질감 규범만 개정 대상으로 둔다.
2. 총자산4MiB/게스트 첫 화면2MiB/Android 선택2MiB를 조건부 예산안으로 검토한다. 이번 파일들이 기존1.5MiB 안에 들어가더라도 일러스트·음향 제작 여유는 따로 결정한다.
3. Pixi 도입은 보류하고 Canvas2D·SVG·CSS3D로 실기기 병목을 먼저 확인한다. 이번3D MutationObserver 어댑터는 실험용이며 정식 채택 때 anim 담당과 주입 API로 교체한다. 시간/게임 로직 변경 없이 갈아 끼울 수 있게 한다.
4. 사용자 결정 후 #104 화면 스킨을 갱신하고, 사건/음향 PR에서9종 효과·강조/소리/Android 진동 기본값을 함께 완성한다. #100 정산 로직·#103 timing 계측 소유권은 유지한다.

## 8. 강화 변형·공유용 초안 (VU-05)

사용자 확인 뒤 같은 브랜치에 `?visual=upgrade&variant=rich`를 추가했다. 기존 프로토타입 `?visual=upgrade`와 #104는 보존한다. [PNG 비교 목록](../design/mockups/upgrade/README.md)은 실제 앱 컴포넌트를 CSS412×915에서 렌더한 기본4장+강화8장이다. 각≤300,000B, 적응형256색 문서 사본이며 앱 자산/기준샷과 무관하다. 원본 색 PNG는 test-results에 보존한다.

| 강화 항목 | 구현 / 기존 계약 |
|---|---|
| 카드 뒤집기 광택 | 기존 3D 키프레임 위에 가는 대각선 빛. 원본 Animation의 duration/delay/easing에 맞춘 장식이며 취소/스킵 때 제거 |
| 획득 이동 모션 블러 인상 | 실시간 blur 대신 그라데이션 잔광·속도선의 transform/opacity. 원본 위치·도착·시간 변경0, 카드 SVG 변경0 |
| 판 테두리 | 로컬 나무 WebP border-image + 얇은 금속색 안쪽 선. 기존 구역 높이/입력 크기는 그대로 |
| 좌석 아바타 슬롯 | 22px 원형, 기본 인물 도형. 상대 청록/나 금색, 장식 aria-hidden. 점수·잔액·이름의 기존 접근성 라벨 유지 |
| 뻑 /쪽 | 붉은 사각 파편 /청록 마름모 스파크. 사건 문구·주체 유지 |
| 따닥 /폭탄 | 금색 십자광 /주황 방사선+굵은 이중 폭발 링. 색과 형태를 함께 구분 |
| 고 | 금색 십자광·이중 링 + 실제 배너의 N고. 시간표의 banner 구간 안에서 종료 |
| 정산 | 공통 Screen의 정산 표시 레이어와 외관 CSS만 변경. 상단 빛/입자, 최종 금액 강조. **카운트업 없음**, `routes/Settlement.svelte`와 계산/다음 판 로직 변경0 |
| 접근성·자원 | 장식 pointer-events:none, reduced-motion에서 입자/광택/잔광 숨김, 유휴 루프0. 신규 의존성0 |

설정의 효과 강도/소리/Android 진동 통합과9종 완성은 기존 사건/음향 PR 범위다. 이번 opt-in 비교 화면을 출시 설정 통합 완료라고 보고하지 않는다.

### WebKit 53fps 추정치의 원인 분리

원본 `c7cb3af` dist, Linux headless WebKit26.6 /DPR3.5 /5초에5사건 /조건당3회. [1차 제거 실험](visual-upgrade-diagnostic.json), [대상별 제거 실험](visual-upgrade-diagnostic-target.json)을 보존한다. 아래는 rAF cadence의 중앙값으로 **실제 표시 FPS가 아니다**.

| 제거/격리 조건 | 1차 중앙값 (회/초) | 해석 |
|---|---:|---|
| 원본 | 53.43 | 범위42.64~54.63, 최초 생성 비용/실행 편차 있음 |
| filter·backdrop-filter 제거 | 48.13 | 이 비교에서는 개선하지 않음. 필터가 단독 원인이라는 가설 지지 안 함 |
| 모든 box/text shadow 제거 | 61.62 | 가장 큰 개선. 그림자 raster/무효화가 주요 원인 후보 |
| Canvas만 합성 레이어로 | 54.83 | 작은 개선, 충분하지 않음 |
| EventRail contain:layout paint | 54.49 | 충분하지 않음 |
| Canvas paint 비표시 | 54.51 | 입자 그리기만 없애도 원상 회복 안 됨 |

| 그림자 대상별 제거 | 중앙값 (회/초) | 범위 |
|---|---:|---|
| 원본 | 54.30 | 43.45~54.63 |
| 카드+손패 slot | 58.59 | 58.58~58.78 |
| 판의 큰 inset만 | 55.62 | 55.57~55.69 |
| text-shadow만 | 55.84 | 55.33~56.03 |
| 카드+slot+판 inset | 59.09 | 58.95~59.19 |
| 모든 그림자 | 61.61 | 61.37~61.62 |

개선 적용은 **강화 변형에만** 한다: 중첩된 획득패는 번짐 없는1×2px 단면 그림자, 판/손패는4px 접지 그림자, slot 중복 그림자 제거, 판 inset45px 제거(기존 비네트 그라데이션 유지). 그림자를 전부 없애 시각 목표를 포기하지 않는다. 이동 잔광도 실제 blur 필터를 피한다.

측정에는 최초 feedback-play→사건 fixture의 Board 생성 비용이 섞여 있었다. 그래서 `--steady` 옵션으로 처음부터 사건 Board를 띄우고 유휴 뒤 사건만 교대하는 측정을 추가했다. [원본 steady 측정](visual-upgrade-steady-performance.json)에서 Chromium60.00, WebKit DPR3.5 60.59 /DPR1 52.11이었다. DPR1은 첫 사건 부근494ms·265ms 간격이 남았고, DPR3.5는 최대89ms였다. **첫 페인트/캐시/그림자 비용과 반복 사건을 구분해야 하며, 한 번의53fps 결과를 지속적 게임 FPS로 일반화할 수 없다.** 1차와 대상별 측정 사이 일부 개발 작업이 있어 전체실행의 min/max도 공개한다. GPU/합성의 정확한 단계는 실제 장치 trace로 확인한다.

```sh
# 기존 build 후, 다른 브라우저 검사와 겹치지 않게 각각 실행
docker compose run --rm dev node packages/web/scripts/measure-visual-upgrade.mjs --diagnose
docker compose run --rm dev node packages/web/scripts/measure-visual-upgrade.mjs --diagnose-target
docker compose run --rm dev node packages/web/scripts/measure-visual-upgrade.mjs --rich
docker compose run --rm dev node packages/web/scripts/measure-visual-upgrade.mjs --rich --steady
```

### 강화 변형 최종 재측정·검증

동일 환경에서 다른 자체 브라우저 테스트를 종료한 뒤 각 조합1회 실행했다. [첫 전환 포함 원자료](visual-upgrade-rich-performance.json) /[판 유지 원자료](visual-upgrade-rich-steady-performance.json). 정상 상태만 좋아졌다고 첫 지연을 숨기지 않는다.

| 강화 변형 | 첫 사건 화면 전환 포함 rAF 회/초 | 판 유지 후 사건 교대 rAF 회/초 | 판 유지 gap p95 /p99 /최대 |
|---|---:|---:|---:|
| Chromium DPR1 | 60.00 | 60.00 | 16.7 /16.8 /16.8ms |
| Chromium DPR3.5 | 60.00 | 60.00 | 16.7 /16.8 /16.8ms |
| WebKit DPR1 | 55.57 | 59.52 | 17 /27 /203ms |
| WebKit DPR3.5 | 55.28 | 60.36 | 17 /37 /99ms |

WebKit의 최초 화면 전환 포함 최대 간격은 DPR1 490ms /DPR3.5 400ms다. **그림자 단순화는 개선책이지만 최초 생성 지연이 해결된 것은 아니다.** 정식 적용 전 단계는 (1) 실제 WebView trace로 첫 raster/합성 확인, (2) 접지 그림자를 작은 자체 SVG/9-slice 또는 더 적은 그림자 레이어로 대체 비교, (3) 그림자·Canvas 생성 비용을 첫 입력 이후로 미루지 않도록 화면 준비 시점 검토, (4) 시각 밀도 유지와 기기 성능을 함께 승인하는 순서다. 선언형 CSS만으로 GPU의 원인을 확정하지 않는다.

| 최종 확인 | 결과 |
|---|---|
| dist /원본 대비 증가 | **1,281,801B = 1,251.8KiB**, c7cb3af 대비7,136B 증가. 현행1.5MiB 게이트 통과 |
| 네트워크·유휴 | 전 조합 외부 요청0. 첫 전환 모드 유휴1.2초 콜백0. steady WebKit 두DPR에서는 초기 사건 잔여로 보이는 콜백1회 관측(원자료 공개); 60초 장기 유휴/실기기 검사는 별도 |
| 필수 명령 | lint /check /Node491 /브라우저314 /build /E2E286(기존 skip4) /Android assembleDebug·testDebugUnitTest·lint 통과 |
| 추가 시각 검사 | 강화8화면×2브라우저 axe, 실제 솔로 base/rich 뒤집기·사건 연결, 취소/skip 장식 회수, 정산 최종값 불변 |
| 최소 화면·기준샷 | 기본/강화4종 입력·바닥/손패 계약 검사 통과. 기존 픽셀 기준샷 갱신0 |
| PNG | 기본4+강화8=12장, 각412×915, 48,491~118,374B. [파일별 용량](../design/mockups/upgrade/manifest.json) |

이 측정은 판·뻑/쪽 반복의 합성 부하다. 아바타/테두리는 포함하지만 카드 이동이 동시에 일어나는 실기기 GPU 부하나 폭탄·고·정산의 지속 부하를 전부 대표하지 않는다. 해당 경로의 기능/axe 검사는 통과했으며 기기 프레임 추적은 [Galaxy 절차](../device-test/visual-upgrade.md)에 남긴다.

### 예산 근거 3줄

- **공용4MiB:** 현재 코어·카드·폰트 약1.2MiB에 홈 키아트·사건 atlas·9종 음향 제작 여유를 둔다. 20Mbps에서도4MiB 순수 전송은1.68초이므로 전량 선행 로딩은 피한다.
- **게스트 첫 화면2MiB:** 20Mbps 순수 전송0.84초, 40Mbps0.42초. 나머지 시간은 파싱/디코딩/입력 준비에 쓰되 실효 속도는 가정이며 실기기 cold cache20회 p95≤2초로 채택 여부를 결정한다.
- **Android 추가2MiB:** APK 로컬 assets의 고해상도 선택 팩으로 RF 전송을 없애고 게스트에는 저용량 변형만 제공한다. 설치 총6MiB 안에서도 디코딩 메모리·GPU 업로드·30분 발열을 별도 검사한다.
