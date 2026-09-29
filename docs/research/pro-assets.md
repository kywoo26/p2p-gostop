# 전문 게임 자산 도입 — PA-01~04

2026-09-29 · 디자인 리드 · spec NF-01/03/07/08·AC-07, plan §1.8. `design/pro-assets`는 main에서 분기한 **검토용 실제 앱 프로토타입**이다. `PRO_ASSET_REVIEW=1` 평가 빌드 또는 dev에서 `?visual=pro`로 켜며 #104의 화면/HUD 구현과 아직 합치지 않는다. 슬로건 없음, Commons 카드 48장 유지. 직접 그린 캐릭터·파티클·키비주얼 없음. 아래 크기는 출처가 공개한 값 또는 변환 스크립트 실측이며 서로 다른 의미를 혼합하지 않는다.

**범위 정정:** 앞선 상한 폐지 지시는 철회됐다. spec/intend는 변경하지 않는다. 아래 개정안은 리뷰와 사용자 승인 후 별도 PR에서만 반영한다. 기본 빌드는 평가 자산을 제외하고1.5MiB gate를 통과해야 한다.

## 1. 상용 게임의 기준

| 게임 / 공식 근거 | 스토어 표기 크기(확인일 기준) | 확인되는 구성 | 공개되지 않은 정보 / 우리 기준 |
|---|---:|---|---|
| [피망 뉴맞고, 한국 App Store](https://apps.apple.com/kr/app/id1458568643) | 803.8 MB | 판·패 테마, 캐릭터/감정 표현, 메뉴와 보상 화면. 판은 재질, HUD는 대비 높은 별도 면, 사건은 큰 글자·반응 표현 | 실제 설치 후 캐시/추가 다운로드, 판/캐릭터/VFX별 MB·비중은 미공개. 수백 MB 전체를 한 번에 게스트에게 보낼 이유는 없음 |
| [MARVEL SNAP, 캐나다 App Store](https://apps.apple.com/ca/app/marvel-snap/id1592081003) | 356.5 MB | 캐릭터 카드의 여러 아트 변형, 50개 이상 장소, 강한 조명·카드/판 레이어 | 스토어 값은 설치 후 모든 리소스 합계가 아님. 캐릭터 아트가 필요하다는 관찰을 바이트 비율로 바꾸지 않음 |
| [Balatro+, 미국 App Store](https://apps.apple.com/us/app/balatro/id6502451661) | 142.4 MB | 150개 이상 조커, 픽셀 아트·CRT 재질·타격 피드백·읽기 쉬운 숫자 | Arcade판 수치이며 일반 유료판과 혼합 금지. 공식 1.4.4 변경 기록은 배터리 소모 때문에 CRT bloom을 제거했다고 명시: 저장 용량 자유와 GPU 비용 자유는 다름 |
| [한게임 신맞고, 공식 Google Play](https://play.google.com/store/apps/details?id=com.NHNEnt.NDuelgo) | 기기별 설치 크기 공개 고정값 없음 | 공식 스크린샷의 판·좌석 초상·패·HUD·사건/보상 층 | Android 실제 설치 크기는 실기기 다운로드 후 별도 기록. 임의 숫자나 역공학 비중을 쓰지 않음 |

**기준:** 전문 재질 + 일관된 프레임 + 작가 제작 VFX + 캐릭터/키아트 + 녹음된 효과음을 각 화면의 정보 위계에 맞춰 조합한다. 현행1.5MiB 안에서 우선순위를 정한다. 이 브랜치의 평가 빌드만 전문 팩의 초과 용량/품질을 비교하며, 그 결과로 규범을 자동 변경하지 않는다. 상용 화면/캐릭터를 복제하지 않는다.

## 2. 전문 팩 선별과 실제 매핑

모든 실사용 파일은 `packages/web/assets-src/manifest.json`에 파일·원본 SHA-256·저자·다운로드·미리보기·라이선스를 고정한다. 이 문서의 후보와 실제 번들 파일을 구분한다. 팩 전체가 아니라 선택 파일만 커밋한다.

| 출처 / 원본 품질 미리보기 | 권리 / 가격 | 품질·해상도 | 적용 / 상태 |
|---|---|---|---|
| [ambientCG Fabric037](https://ambientcg.com/view?id=Fabric037) | [CC0](https://docs.ambientcg.com/license/), 무료 | 1K JPG PBR 팩 9MB 표기, 직조 표면·Color/NormalGL/Roughness. 사진 스캔이라 주장하지 않음(원본 procedural) | **실사용** 먹빛 펠트 판/Home 배경. albedo+normal 조명 베이크, 원본 맵 보관. 런타임 PBR 셰이더가 아니라 2D 베이크 |
| [ambientCG Wood050](https://ambientcg.com/view?id=Wood050) | CC0, 무료 | 1K Color | **실사용** 나무 테두리. 앞선 검토에서 확보한 동일 원본 해시 고정 |
| [ambientCG Leather037](https://ambientcg.com/view?id=Leather037) | CC0, 무료 | 1K 팩 7MB 표기, photometric stereo 가죽 | **실사용** HUD/홈 패 받침, 거친 표면과 어두운 글자 받침 분리 |
| [ambientCG Metal034](https://ambientcg.com/view?id=Metal034) | CC0, 무료 | 1K 팩 3MB 표기, gold material | **실사용** 판 금속 트림. 실시간 반사 없음 |
| [Poly Haven Leather Red 02](https://polyhaven.com/a/leather_red_02) | [CC0](https://polyhaven.com/license), 무료 | Rob Tuytel, 1K~8K, albedo/normal/roughness. 페이지에 각 맵 미리보기 | 후보. 붉은 가죽이 A 먹빛보다 강해 이번 기본판 제외 |
| [Kenney UI Pack Adventure](https://kenney.nl/assets/ui-pack-adventure), [원본 sample](https://kenney.nl/media/pages/assets/ui-pack-adventure/6ee19514ca-1723597272/sample.png) | CC0, 무료 | 130개, Vector·PNG Default/Double, 패널/버튼/초상 링 | **실사용** brown dark corners 패널, brown 버튼·초상 링. nine-slice로 모서리 유지. 장르가 RPG에 가까운 한계는 사용자 검토 대상 |
| [Kenney Fantasy UI Borders](https://kenney.nl/assets/fantasy-ui-borders), [sample](https://kenney.nl/media/pages/assets/fantasy-ui-borders/ac36214d33-1701602364/sample.png) | CC0, 무료 | 140개, 모노 프레임·SVG | 비교 후보. 과도한 장식과 모노 픽셀 인상이 있어 이번 프레임에서는 제외 |
| [para Animated Particle Effects #1](https://opengameart.org/content/animated-particle-effects-1) | CC0, 무료 | 1024² atlas, 128² ×64프레임, 14종/변형. 페이지 원본 GIF/이미지 미리보기 | **실사용** 10번 붉은 충격=뻑, 07 청색 스파크=쪽, 13 금색 링=따닥/고/정산, 09 불꽃 링=폭탄, 04 연기=후속 잔향 후보. 원본 프레임 보존 |
| [para #2](https://opengameart.org/content/animated-particle-effects-2) | CC0, 무료 | fire/teleporter/air bubbles/blood, 512~1024 atlas | 후보. 혈흔은 게임 맥락에 맞지 않아 제외. 필요하면 teleporter 사용 |
| [Kenney Particle Pack](https://kenney.nl/assets/particle-pack) | CC0, 무료 | 80개 512² 투명 스프라이트 | **파이프라인 실사용/화면 보류** glow·spark를 atlas로 묶음. 화면에서는 para 효과를 우선해 중복 글로우 방지 |
| [Kenney Animal Pack](https://kenney.nl/assets/animal-pack), [preview](https://kenney.nl/media/pages/assets/animal-pack/3562615d13-1677669990/preview.png) | CC0, 무료 | 전문 제작 동물 얼굴 PNG | **실사용 임시 아바타** panda/parrot. 슬롯·명암·다운로드 검증용. 최종 한국풍 캐릭터가 완성됐다고 취급하지 않음 |
| [Kenney Board Game Icons](https://kenney.nl/assets/board-game-icons) | CC0, 무료 | 카드/주사위/행동 아이콘 세트 | 후보. 현재 필수 기능 라벨 유지, 읽기 검토 뒤 부분 도입 |
| [Kenney Casino Audio](https://kenney.nl/assets/casino-audio) | CC0, 무료 | 50개 카드·칩 Foley | **실사용** card-slide-1, chips-collide-1 → 카드 조작/정산 |
| [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0, 무료 | 소재별 충격 녹음 | **실사용** impactWood_heavy_000 → 뻑/폭탄. 최종 믹스에서는 두 사건의 레이어 구분 필요 |
| [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0, 무료 | UI 확인/열기/클릭 등 | **실사용** confirmation_002, open_001 → 쪽·스톱/고·흔들기. 샘플 대체 경로 검증이며 최종 9사건 사운드 디자인 완료를 뜻하지 않음 |
| [pimen Explosion Effect](https://pimen.itch.io/explosion-effect) | 유료 후보, 정가 US$4 / 확인 시 할인 US$3.40. 개인·상업 사용/변경 허용, 원본 재판매·재배포 금지 | 30종, 16~64px pixel art, PNG/GIF/Aseprite | **구매하지 않음**. A의 재질 판과 픽셀 FX 이질감, 공개 저장소 원본 커밋 불가. 허용되는 제품 배포 범위 확인 후만 도입 |

무료 CC-BY도 저자·작품·라이선스·변경 고지를 보존하면 후보가 될 수 있으나 이번 실제 파일은 CC0만이다. OFL Pretendard는 기존 고지 유지. 자산 페이지 미리보기는 조사 링크이며 앱이 가져오지 않는다.

## 3. 재현 파이프라인과 로딩 계약

| 단계 | 구현 / 규칙 |
|---|---|
| 입력 | `assets-src/manifest.json`, 선택 원본과 동봉 License.txt. 소스 해시 불일치면 변환 실패. 새 제공 이미지도 출처/권리/변경 허용 여부 등록 뒤 같은 파이프라인 사용 |
| 실행 | `docker compose run --rm dev python3 packages/web/scripts/build-pro-assets.py`. Pillow 10.2.0, FFmpeg 6.1.1, libavif 1.0.4를 dev image4에만 설치. npm 런타임 의존성0 |
| 이미지 | WebP quality88 + AVIF q20~30, 1x/2x/3x. texture 기준512px, UI128px, avatar64px. **원본보다 확대해 품질이 늘었다고 하지 않음**: 1K 원본은 3x도1K,128px FX cell은2x/3x 동일 상한 |
| 재질 | Fabric albedo 재색상화·normal 방향광 베이크. roughness 원본은 보관하되 현재 런타임 미사용. 가죽/나무/금은 원본 색 유지. WebGL/Pixi 도입 없음 |
| 스프라이트 | para 8×8,64프레임 유지하며 각 tier 리사이즈. Kenney 개별 광점은128px cell 가로 atlas+JSON으로 패킹. 투명 알파 보존 |
| 오디오 | mono44.1kHz Ogg Vorbis q4 / AAC96kbps M4A faststart. 지원 검사 후 하나만 요청. 입력 녹음 소리를 쓰며 합성 도형 효과음으로 대체하지 않음 |
| 고지 | manifest→`credits.ts`→License 화면, `/pro/NOTICE.md` 파일별 SHA/변경 고지 자동 생성. 외부 URL은 텍스트 고지뿐, NF-01 빌드 검사 정확 일치 허용 목록 |
| 첫 화면 | HTML에 즉시 indeterminate 진행 표시 → 실제 화면 이미지 건수 진행 표시. 이미지 실패는 기능을 막지 않으며 재시도. `data-pro-ready`로 계측 가능 |
| 화면 분할 | Home/Board/일반·정산 화면별 Scene에서 필요한 image만 로드. Home에서 VFX/audio 선다운로드 없음. 공유 재질은 메모리/브라우저 캐시 재사용; DPR별 WebP 한 tier만 선택. AVIF는 생성·비교 후보이며 현재 runtime 기본은 WebP |
| 후순위 | 음향은 첫 사용자 조작 후 병렬 다운로드/decode. 사건 atlas는 해당 사건 첫 표시 때 필요 로딩(처음에는 글자만 먼저 읽힘). 실기기에서 첫 FX 지연이 보이면 Board 준비 완료 후 atlas 낮은 우선순위 프리로드로 조정 |
| 실행 비용 | canvas384² 하나/사건, drawImage만, CSS blur/backdrop-filter 없음. owner `durationMs('banner')` 동안만 rAF, unmount cancel. reduced-motion/갤러리 instant는 대표 프레임. 화면 숨김 후 반복 중단 |
| 범위 | 기본 앱은 기존 외관 유지. `?visual=pro`에서 Home/실제 Board/정산에 적용. 게임·통신·정산 계산 및 anim 소유 경로 미변경. #104 계약은 통합 때 흡수 |

API 근거: [Pillow Image](https://pillow.readthedocs.io/en/stable/reference/Image.html), [FFmpeg](https://ffmpeg.org/ffmpeg.html), [libavif](https://github.com/AOMediaCodec/libavif), [Svelte effect](https://svelte.dev/docs/svelte/$effect), [Canvas drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage), [Web Audio decode](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData). Context7 도구가 현재 세션에 노출되지 않아 공식 문서로 조회했다.

## 4. 사용자 제공/생성·외주 필요 자산

무료 팩으로 한국 맞고의 고유 캐릭터와 일관된 고급 키아트까지 해결됐다고 할 수 없다. 아래는 **요청 목록**이며 현재 임시 아바타·실제 카드 조합을 최종 일러스트라고 부르지 않는다.

| 요청 | 원본 규격 | 안전 영역 / 납품 조건 | 수용·화면 매핑 |
|---|---|---|---|
| 홈 키비주얼 1점 | 2048×1536, 4:3, sRGB PNG 또는 레이어 PSD+PNG | 중심70%에 주제, 외곽15% 크롭 가능. 글자/로고/카드 그림 굽기 금지. 먹빛 판·한지/금속 포인트 | 360~430 CSS폭 hero, 1/2/3x 변환. 현재 Commons 카드 조합과 교체 |
| 좌석 캐릭터 2~4명 | 각1024² 투명 PNG, 정면/3/4 얼굴, 선택적 표정3종 | 얼굴·머리 중심72%, 원형 크롭 밖 장식 금지. 피부색/실루엣 구분, 특정 상용 캐릭터 복제 금지 | 원형40~64px 슬롯. Kenney 동물 임시 이미지 교체 |
| 정산 승리 일러스트 1점 | 1600×900,16:9, 투명 PNG+배경 분리 | 가운데60% 주제, 금액/버튼 안전 영역은 별도. “승리” 글자·금액 굽지 않음 | 정산 상단, 확정 금액 위 장식. 카운트업 없음 |
| 사건별 한글 레터링(선택) | 뻑/쪽/따닥/폭탄/흔들기/고/스톱, 각1024² 투명 PNG 또는 권리 확보 SVG | 외곽12% 여백, 120px에서도 구분. 화면 읽기용 텍스트 별도 유지 | 동일 서체 기반 전문 타이포 아트. 기본 폰트로도 기능은 유지 |

제공 시 저작자·상업 이용/수정/번들 재배포 허용 범위·원본 출처를 같이 받는다. 생성본이면 사용 도구와 이용권한을 기록한다. 유료 원본 재배포가 금지되면 공개 `assets-src`에 올리지 않고 별도 비공개 입력으로 CI 산출물만 제공하는 계약이 필요하다.

## 5. 측정과 승인

**예산 개정 승인 전. 현행 전체1.5MiB·게스트 첫 로딩≤2초 유지.** 초과분은 평가 빌드에만 있다. 스토어 MB, 디스크 원본 bytes, dist 전체 bytes, 한 화면 실제 요청 bytes, decode 메모리를 따로 보고한다. Chromium/WebKit Docker rAF 측정은 실기기 FPS가 아니다. iPhone p95·Galaxy 메모리/FPS는 [실기기 절차](../device-test/pro-assets.md)에 따라 사람이 기록하며 이 PR에서 합격을 만들어 쓰지 않는다.


### 평가 빌드 실측 (2026-09-29, Docker 개발 이미지4)

| 산출물 | 실측 | 의미 |
|---|---:|---|
| 선택 원본 | 16,150,524bytes (15.40MiB) | 제작 입력, 앱 배포 제외 |
| 기본 dist | 약1,213.4KiB | ≤1,536KiB 현행 gate 통과, 평가 팩 제외 |
| 평가 dist | 12,946.6KiB (12.64MiB) | 모든tier/코덱 포함, 평가만 초과 허용 |
| 단일 최대 WebP+M4A 팩 | 2,451,952bytes (2.34MiB) | 중복tier/코덱 제거한 비교치, 아직 본선 적용 불가 |
| GitHub PNG | 8장, 각123,474~218,267bytes | 412×915,256색 문서용, 앱 dist와 무관 |

| 렌더러 / DPR | 3×5초 rAF Hz 범위 | p95 프레임 간격 범위 | 최대 간격 | 판정 |
|---|---:|---:|---:|---|
| chromium / 1 | 60.02–60.06 | 16.7–16.7ms | 16.8ms | 대역 계측; 기기 합격 아님 |
| chromium / 3.5 | 60.02–60.21 | 16.7–16.7ms | 16.8ms | 대역 계측; 기기 합격 아님 |
| webkit / 1 | 57.43–59.79 | 30.0–37.0ms | 57.0ms | 대역 계측; 기기 합격 아님 |
| webkit / 3.5 | 51.91–52.31 | 46.0–49.0ms | 69.0ms | 고해상도 비용 개선 필요 |

측정은 atlas를 예열한 뒤0.5초마다 사건을 바꾸는 실제 Board다. rAF cadence는 GPU가 모든 프레임을 완성했다는 증거가 아니다. WebKit DPR3.5의약52Hz는60fps 목표 충족으로 표시하지 않는다. blur/backdrop-filter 없이도 고해상도 배경·nine-slice·배너 전환 repaint 비용이 후보이며, 병목 확정에는 DevTools/실기기 trace가 필요하다. 후속: 사건 영역의 크기/위치 고정, 정적 재질 합성 레이어 분리, atlas 해상도/동시 수 제한을 각각 비교한다. 현재 사건 영역은 바닥 패를 덮지 않도록 여백을 잡지만 #104의 고정6행 통합 전이다.

| WebKit 공유 대역폭 시나리오 | cold 횟수 | 최초 진행 표시 p95 | 이름 입력 가능 p95 | 필수 재질 완료 p95 | 전송 bytes |
|---|---:|---:|---:|---:|---:|
| 10Mbps +20ms | 20 | 513ms | 513ms | 598ms | 656,135 |
| 30Mbps +20ms | 20 | 222ms | 222ms | 258ms | 656,135 |
| 60Mbps +20ms | 20 | 169ms | 169ms | 198ms | 656,135 |

실제 `?role=guest&visual=pro`의 참가 화면이며 갤러리 대체 화면이 아니다. 압축 해제된 응답 body bytes를 하나의 전송 큐로 제한했다. 메뉴/재질 완료 관측치에는 브라우저 실행이 포함되지만 라디오 손실·연결 설정·모바일 CPU 스로틀은 없다. **실기기 미검증**. 이 값으로 기존1.5MiB를 폐지하거나 iPhone p95통과를 선언하지 않는다.

원자료: [renderer/resources](../design/mockups/pro/measurements.json), [WebKit throttle60회](../design/mockups/pro/throttle.json). 모든 수집 화면에서 외부 요청0. `test-results/pro-assets/`는 후속 E2E가 지울 수 있으므로 문서용 결과도 커밋한다.


## 6. NF-03 개정안 — 예산 개정 승인 전

**현행은 그대로다:** `intend.md`의 오프라인·배터리·단일 웹 UI 의도, `spec.md` NF-03의 게스트 첫 로딩≤2초·전체1.5MiB·100ms 응답·60fps를 유지한다. 이 PR은 spec를 수정하지 않는다. 아래 문안은 측정 결과를 검토하고 사용자가 승인한 뒤 별도 규범 PR에서 반영할 제안이다. “상한 폐지”는 제안하지 않는다.

### 6.1 숫자의 근거와 제한

| 근거 | 관찰 | 숫자로 사용할 범위 |
|---|---|---|
| [Cisco Wi-Fi 6/6E·7 실효 처리량 시험 안내](https://www.cisco.com/c/en/us/support/docs/wireless-mobility/wireless-lan-wlan/212892-802-11ac-wireless-throughput-testing-and.html) | PHY 링크율과 실제 처리량이 다르며 채널/공간 스트림/클라이언트 경합에 좌우된다. 최적 대용량 전송 예시는 링크율×0.7 근사 | Galaxy LocalOnlyHotspot→iPhone을 직접 잰 자료가 아니다. 링크율 수백 Mbps를 게스트 전송 속도로 대입하지 않음 |
| [Cisco 처리량 검증 가이드](https://www.cisco.com/c/en/us/support/docs/wireless/catalyst-9800-series-wireless-controllers/221766-validate-wi-fi-throughput-testing-and.html) | 인터넷 속도와 무선 구간을 분리하고 전용 처리량 도구로 측정 권고 | 같은 핫스팟에서 실제 HTTP 파일/타임라인을 측정해야 함. 현재 실물 iPhone 미확보 |
| [Playwright WebKit throttling 이슈](https://github.com/microsoft/playwright/issues/19173), [route API](https://playwright.dev/docs/api/class-route) | Chromium CDP 방식이 WebKit에 그대로 적용되지 않음. 요청 보류/응답 대체로 시나리오를 구성 가능 | 이 PR은 **공유 대역폭 응답 스케줄러**를 쓴다. 모든 요청이 각각30Mbps를 얻는 오류를 피하며, 실제 TCP/무선 손실/CPU/Safari 디코더는 재현하지 못함 |
| 이번 시나리오 | 10Mbps(느린 조건),30Mbps(비교 기준),60Mbps(빠른 조건), 요청당20ms, cold20회, WebKit412×915/DPR3.5 | 실측 핫스팟 속도라는 주장이 아니라 민감도 분석 입력. p95는20개 중19번째(nearest-rank). **실기기 미검증** |

전송 가능량은 `B ≤ R_low × (2초 − HTML/JS/글꼴·디코드·레이아웃·왕복 여유) / 8`로 정한다. 예를 들어 보수적10Mbps와0.5초 처리 여유를 **가정**하면1,875,000 bytes(1.79MiB)이다. 여기서 첫 화면1.5MiB를 유지하면 약0.29MiB의 전송 여유가 남는다. 이 가정은 실기기 p95 처리비용과 저속 처리량을 얻으면 다시 계산한다. 로딩 표시가 먼저 보였다는 이유만으로2초 목표를 만족했다고 하지 않는다. 이름 입력/필수 안내/글꼴을 읽고 조작 가능한 시점과 필수 시각 자산 완료를 모두 보고한다.

### 6.2 제안 문안(미승인)

> NF-03 개정 후보: 게스트의 초기 필수 화면은 cold p95≤2초를 목표로 하고, 초기 필수 전송은1.5MiB 이하를 유지한다. UI·글꼴·첫 화면 재질만 먼저 내려받고 HTML부터 실제 진행 표시를 제공한다. 전체 세션 자산은 화면/사건 단위로 분리하며 상한은 선택된 단일 변형의 실측 합계와 처리량 시험으로 산정한다. Android 전용 고해상도 팩은 APK 로컬 경로로 분리해 게스트 HTTP 자산 목록에서 제외한다. 상호작용≤100ms·60fps 목표, 외부 요청0, 다크 UI와 이벤트 시에만 렌더 루프를 유지한다. 기기별 메모리·배터리·first-screen p95 검증 전에는 상향된 자산 구성을 본선에 적용하지 않는다.

| 범위 | 수치 후보의 도출 | 승인 조건 |
|---|---|---|
| 게스트 첫 필수 화면 | **1.5MiB 유지**. 위10Mbps 가정의1.79MiB 전송창보다 작게 둠 | WebKit 대체 시험에 더해 iPhone cold/warm30회 p95≤2초 확인. 앱/서체/이미지 모두 포함 |
| 게스트 전체 세션 팩 | 기본 빌드 약1.19MiB + 선택 고해상도 WebP/M4A 한 세트2.34MiB = 약3.53MiB. 변환/고지 여유 약13%를 더한 **4MiB 후보** | 첫 화면으로4MiB 일괄 전송 금지. 미사용 atlas·AVIF 중복·같은 2x/3x 파일 제거 후 재측정. 현재4MiB를 규범으로 적용하지 않음 |
| Android 로컬 고해상도 | 선택3x WebP/M4A 팩2.34MiB를 근거로 **추가2.5MiB 후보** | 로컬 전용 asset 경로·서버 allowlist 분리 필요. 현재 Kotlin 서버를 수정하지 않았고 별도 구현/리뷰 필요. 기기 메모리·열·FPS 통과 |
| 변환 작업 디렉터리/평가 빌드 | 모든tier·코덱을 비교하려고 함께 담은 약12.7MiB는 제작/평가 비용 | 이것을 게스트 세션팩의 최소 필요량으로 주장하지 않음. 본선 전체1.5MiB gate는 승인 전 계속 적용 |

### 6.3 분할 로딩·프리로드·배터리 조건

1. 첫 HTML에서 진행 표시, 앱이 준비되면 자산 건수/실패·재시도 상태로 전환한다. 네트워크 실패가 입력 잠금이나 무한 가짜100%로 이어지지 않는다.
2. 게스트 첫 화면에는 이름·접속 안내·필수 글꼴·저해상도 재질만 포함한다. Board 진입 전에 필수 카드·HUD 자산 준비 상태를 확인한다. 이후 화면이나 사건의 고해상도 팩을 최초 페이지와 함께 요청하지 않는다.
3. 프리로드는 현재 화면을 사용할 수 있게 된 뒤 다음 화면에 필요한 소량만 한다. 뒤로 가기/앱 숨김 시 불필요한 프리로드 취소, 동시 다운로드 제한, 진행 중 필수 입력과 경쟁 방지를 후속 구현의 승인 조건으로 둔다. 현재 프로토타입은 필요시 이미지 로딩/공유 캐시/사용자 조작 후 오디오 준비까지 구현했다.
4. `intend.md` §3.3의 다크 UI·이벤트 중에만 렌더 루프·숨김 복구 의도를 따른다. 상시 파티클·동영상·폴링·실시간 PBR 반사 셰이더를 넣지 않는다. 큰 저장 용량이 지속 GPU 작업을 정당화하지 않는다. 효과 atlas는 한 번 decode하고 사건 종료/unmount 때 rAF를 멈춘다.
5. Android 로컬팩도 무료 자원이 아니다. 1024² RGBA 한 장은 약4MiB 디코드 메모리이며 압축 파일60KiB와 다른 값이다. 로컬팩 선택 전에 동시에 살아 있는 texture/atlas 수와 renderer PSS·긴 프레임·10분 열/배터리 변화를 확인한다.

### 6.4 실행·반영 경계

```sh
# 현행 본선 gate: 평가 팩 제외, ≤1.5MiB
 docker compose run --rm dev npm run build -w packages/web
# 평가 전용: 명시적으로 초과 허용, 기본/릴리스 빌드와 구분
 docker compose run --rm dev env PRO_ASSET_REVIEW=1 npm run build -w packages/web
 docker compose run --rm dev node packages/web/scripts/review-pro-assets.mjs
 docker compose run --rm dev node packages/web/scripts/throttle-pro-assets.mjs
 docker compose run --rm dev env PRO_ASSET_REVIEW=1 npm run e2e -w packages/web -- e2e/pro-assets.spec.ts
```

기본 production 빌드는 `?visual=pro`만 붙여도 평가 팩을 켤 수 없다. dev 또는명시적 평가 빌드에서만 활성화된다. 공식 APK/본선 전환은 이 PR의 자동 승인 대상이 아니다.

## 7. 예산 때문에 본선에 넣지 못하는 자산과 용량

현재 기본 빌드 약1,213.4KiB, 현행1,536KiB 중 잔여약322.6KiB다(최종 빌드 실측 표 우선). **모든 전문 자산이 예산 때문에 불가능한 것은 아니다.** 재질/프레임/짧은 소리는 선별하면 들어간다. 문제는 4사건64프레임 atlas를 함께 유지하는 구성이다. 뻑·쪽·따닥·폭탄 WebP만 1x합계819,748bytes(800.5KiB), 고해상도합계1,992,646bytes(1,946.0KiB)다. 기존 앱을 유지한 채 이4개를 전부 넣을 수 없어 평가 빌드에만 포함했다. 프레임 수/해상도 축소 또는 일부 사건 제외는 품질 비교와 승인이 필요하다.

| 자산 | 1x WebP bytes | 최대3x WebP bytes(원본 상한) | 판단 |
|---|---:|---:|---|
| frame | 1,068 (1.0KiB) | 1,068 (1.0KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| button | 478 (0.5KiB) | 478 (0.5KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| avatar-ring | 6,416 (6.3KiB) | 6,744 (6.6KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| avatar-me | 1,556 (1.5KiB) | 4,636 (4.5KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| avatar-other | 2,238 (2.2KiB) | 7,242 (7.1KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| ppeok | 243,314 (237.6KiB) | 623,768 (609.1KiB) | 본선 제외: 4사건 합계가 잔여 예산 초과 |
| jjok | 141,006 (137.7KiB) | 372,906 (364.2KiB) | 본선 제외: 4사건 합계가 잔여 예산 초과 |
| ttadak | 215,614 (210.6KiB) | 468,748 (457.8KiB) | 본선 제외: 4사건 합계가 잔여 예산 초과 |
| bomb | 219,814 (214.7KiB) | 527,224 (514.9KiB) | 본선 제외: 4사건 합계가 잔여 예산 초과 |
| smoke | 101,044 (98.7KiB) | 222,546 (217.3KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| glow | 5,064 (4.9KiB) | 33,416 (32.6KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| spark | 6,578 (6.4KiB) | 38,986 (38.1KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| felt | 14,090 (13.8KiB) | 59,048 (57.7KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| leather | 1,246 (1.2KiB) | 5,816 (5.7KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| gold | 1,182 (1.2KiB) | 3,854 (3.8KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |
| wood | 11,032 (10.8KiB) | 46,782 (45.7KiB) | 평가 전용; 작은 항목은 예산 내 선별 도입 가능하나 이 PR에서 채택하지 않음 |

오디오 5개는 Ogg합계31,472bytes(30.7KiB), M4A합계28,690bytes(28.0KiB), 양쪽 모두 보관하면60,162bytes(58.8KiB)다. 폰별 지원형식 하나만 전송하나 dist gate에는 둘 다 산입된다. 기존 소리48KiB 계획과 비교해 codec별 배포 분리 또는 파일 선별이 필요하다. 원본16,150,524bytes는 제작 입력이며 앱 번들에 넣지 않는다. AVIF/WebP와중복2x/3x를 모두 둔 평가 dist를 최종 최소 용량으로 오해하지 않는다.

## 8. 검증·후속 경계

개발 이미지에서 npm ci/lint/check 통과, Node491·브라우저278 통과. 기본 E2E96통과/16skip(기존4+평가전용12), 평가 전용 E2E14통과. Android assembleDebug/testDebugUnitTest/lint 통과. 기존 갤러리 기준샷은 고지 추가 때문에 License의2PNG·2ARIA만 갱신했고 다른 기준샷은 그대로다.

#104의 고정6행/문턱칩/10장2행·12월 최악fixture는 이 main 기반 평가 브랜치에 아직 포함되지 않았다. 현재4viewport 기본fixture 검사 결과를 그 계약 완료로 바꾸어 보고하지 않는다. WebKit DPR3.5 약52Hz, 실기기 p95/메모리·200%확대·Safari 음향unlock은 채택 전 검증/개선 항목이다.
