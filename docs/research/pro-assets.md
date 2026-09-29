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
| [ambientCG Leather037](https://ambientcg.com/view?id=Leather037) | CC0, 무료 | 1K 팩 7MB 표기, photometric stereo 가죽 | **실사용** HUD 읽기 면, 거친 표면과 어두운 글자 받침 분리 |
| [ambientCG Metal034](https://ambientcg.com/view?id=Metal034) | CC0, 무료 | 1K 팩 3MB 표기, gold material | **실사용** 판 금속 트림. 실시간 반사 없음 |
| [Poly Haven Leather Red 02](https://polyhaven.com/a/leather_red_02) | [CC0](https://polyhaven.com/license), 무료 | Rob Tuytel, 1K~8K, albedo/normal/roughness. 페이지에 각 맵 미리보기 | 후보. 붉은 가죽이 A 먹빛보다 강해 이번 기본판 제외 |
| [Kenney UI Pack Adventure](https://kenney.nl/assets/ui-pack-adventure), [원본 sample](https://kenney.nl/media/pages/assets/ui-pack-adventure/6ee19514ca-1723597272/sample.png) | CC0, 무료 | 130개, Vector·PNG Default/Double, 패널/버튼/초상 링 | **제외 확정**. 원본/생성파일/요청 제거, A 자체 CSS 1px 프레임으로 교체 |
| [Kenney Fantasy UI Borders](https://kenney.nl/assets/fantasy-ui-borders), [sample](https://kenney.nl/media/pages/assets/fantasy-ui-borders/ac36214d33-1701602364/sample.png) | CC0, 무료 | 140개, 모노 프레임·SVG | 비교 후보. 과도한 장식과 모노 픽셀 인상이 있어 이번 프레임에서는 제외 |
| [para Animated Particle Effects #1](https://opengameart.org/content/animated-particle-effects-1) | CC0, 무료 | 1024² atlas, 128² ×64프레임, 14종/변형. 페이지 원본 GIF/이미지 미리보기 | **실사용** 10번 붉은 충격=뻑, 07 청색 스파크=쪽, 13 금색 링=따닥/고/정산, 09 불꽃 링=폭탄, 04 연기=후속 잔향 후보. 원본 프레임 보존 |
| [para #2](https://opengameart.org/content/animated-particle-effects-2) | CC0, 무료 | fire/teleporter/air bubbles/blood, 512~1024 atlas | 후보. 혈흔은 게임 맥락에 맞지 않아 제외. 필요하면 teleporter 사용 |
| [Kenney Particle Pack](https://kenney.nl/assets/particle-pack) | CC0, 무료 | 80개 512² 투명 스프라이트 | **파이프라인 실사용/화면 보류** glow·spark를 atlas로 묶음. 화면에서는 para 효과를 우선해 중복 글로우 방지 |
| [Kenney Animal Pack](https://kenney.nl/assets/animal-pack), [preview](https://kenney.nl/media/pages/assets/animal-pack/3562615d13-1677669990/preview.png) | CC0, 무료 | 전문 제작 동물 얼굴 PNG | **제외 확정**. Commons 화투 월별 초상 12종으로 교체 |
| [Kenney Board Game Icons](https://kenney.nl/assets/board-game-icons) | CC0, 무료 | 카드/주사위/행동 아이콘 세트 | 후보. 현재 필수 기능 라벨 유지, 읽기 검토 뒤 부분 도입 |
| [Kenney Casino Audio](https://kenney.nl/assets/casino-audio) | CC0, 무료 | 50개 카드·칩 Foley | **실사용** card-slide-1, chips-collide-1 → 카드 조작/정산 |
| [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0, 무료 | 소재별 충격 녹음 | **실사용** impactWood_heavy_000 → 뻑/폭탄. 최종 믹스에서는 두 사건의 레이어 구분 필요 |
| [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0, 무료 | UI 확인/열기/클릭 등 | **실사용** confirmation_002, open_001 → 쪽·스톱/고·흔들기. 샘플 대체 경로 검증이며 최종 9사건 사운드 디자인 완료를 뜻하지 않음 |
| [pimen Explosion Effect](https://pimen.itch.io/explosion-effect) | 유료 후보, 정가 US$4 / 확인 시 할인 US$3.40. 개인·상업 사용/변경 허용, 원본 재판매·재배포 금지 | 30종, 16~64px pixel art, PNG/GIF/Aseprite | **구매하지 않음**. A의 재질 판과 픽셀 FX 이질감, 공개 저장소 원본 커밋 불가. 허용되는 제품 배포 범위 확인 후만 도입 |

무료 CC-BY도 저자·작품·라이선스·변경 고지를 보존하면 후보가 될 수 있으나 이번 실제 파일은 CC0 및 기존 카드 파생 초상의 CC BY-SA 4.0이다. OFL Pretendard는 기존 고지 유지. 자산 페이지 미리보기는 조사 링크이며 앱이 가져오지 않는다.

## 3. 재현 파이프라인과 로딩 계약

| 단계 | 구현 / 규칙 |
|---|---|
| 입력 | `assets-src/manifest.json`, 선택 원본과 동봉 License.txt. 소스 해시 불일치면 변환 실패. 새 제공 이미지도 출처/권리/변경 허용 여부 등록 뒤 같은 파이프라인 사용 |
| 실행 | `uv run packages/web/scripts/build-pro-assets.py`. Pillow 10.2.0, FFmpeg 6.1.1, libavif 1.0.4를 dev image4에만 설치. npm 런타임 의존성0 |
| 이미지 | WebP quality88 + AVIF q20~30, 1x/2x/3x. texture 기준512px, art512px, avatar64px. **원본보다 확대해 품질이 늘었다고 하지 않음**: 1K 원본은 3x도1K,128px FX cell은2x/3x 동일 상한 |
| 재질 | Fabric albedo 재색상화·normal 방향광 베이크. roughness 원본은 보관하되 현재 런타임 미사용. 가죽/나무/금도 먹/호두/무광 황동으로 재색상화. WebGL/Pixi 도입 없음 |
| 스프라이트 | para 8×8,64프레임 유지하며 각 tier 리사이즈. Kenney 개별 광점은128px cell 가로 atlas+JSON으로 패킹. 투명 알파 보존 |
| 오디오 | mono44.1kHz Ogg Vorbis q4 / AAC96kbps M4A faststart. 지원 검사 후 하나만 요청. 입력 녹음 소리를 쓰며 합성 도형 효과음으로 대체하지 않음 |
| 고지 | manifest→`credits.ts`→License 화면, `/pro/NOTICE.md` 파일별 SHA/변경 고지 자동 생성. 외부 URL은 텍스트 고지뿐, NF-01 빌드 검사 정확 일치 허용 목록 |
| 첫 화면 | HTML에 즉시 indeterminate 진행 표시 → 실제 화면 이미지 건수 진행 표시. 이미지 실패는 기능을 막지 않으며 재시도. `data-pro-ready`로 계측 가능 |
| 화면 분할 | Home/Board/일반·정산 화면별 Scene에서 필요한 image만 로드. Home에서 VFX/audio 선다운로드 없음. 공유 재질은 메모리/브라우저 캐시 재사용; DPR별 WebP 한 tier만 선택. AVIF는 생성·비교 후보이며 현재 runtime 기본은 WebP |
| 후순위 | 음향은 첫 사용자 조작 후 병렬 다운로드/decode. 사건 atlas는 해당 사건 첫 표시 때 필요 로딩(처음에는 글자만 먼저 읽힘). 실기기에서 첫 FX 지연이 보이면 Board 준비 완료 후 atlas 낮은 우선순위 프리로드로 조정 |
| 실행 비용 | canvas384² 하나/사건, drawImage만, CSS blur/backdrop-filter 없음. owner `durationMs('banner')` 동안만 rAF, unmount cancel. reduced-motion/갤러리 instant는 대표 프레임. 화면 숨김 후 반복 중단 |
| 범위 | 기본 앱은 기존 외관 유지. `?visual=pro`에서 Home/실제 Board/정산에 적용. 게임·통신·정산 계산 및 anim 소유 경로 미변경. #104 계약은 통합 때 흡수 |

API 근거: [Pillow Image](https://pillow.readthedocs.io/en/stable/reference/Image.html), [FFmpeg](https://ffmpeg.org/ffmpeg.html), [libavif](https://github.com/AOMediaCodec/libavif), [Svelte effect](https://svelte.dev/docs/svelte/$effect), [Canvas drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage), [Web Audio decode](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData). Context7 도구가 현재 세션에 노출되지 않아 공식 문서로 조회했다.

## 4. 확정 아트 디렉션과 일러스트

[아트 디렉션](../design/art-direction.md)을 가공 전에 고정했다. 사용자 제공을 기다리는 목록은 폐기한다. 홈·정산은 같은 학/소나무 원화, 아바타는 같은 화투 도상 계열, 화면 구조물은 자체 CSS로 통일한다.

| 대상 | 원본·권리 근거 | 가공/규격 | 적용 |
|---|---|---|---|
| 홈·정산 | [Met JP660, Hokusai](https://www.metmuseum.org/art/collection/search/37107), Public Domain. [Met Open Access](https://www.metmuseum.org/hubs/open-access) CC0. [API](https://metmuseum.github.io/) isPublicDomain=true 원자료 보관 | 870×1932 원본, 별도 크롭·먹/한지 듀오톤, 원화 획과 종이 결 보존. 크롭 좌표 manifest 기록 | 같은 작품의 두 구도, 본문 글자는 이미지 밖/불투명 받침 |
| 월별 초상 12종 | 기존 Commons Hwatu, Spenĉjo·Marcus Richert·Louie Mantia Jr. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | 카드별 출처와 SHA 고정, SVG 도상 사각 추출→원형→듀오톤→64/128/192px. 원본 48장 무변경, 파생본 동일 라이선스 | 학·매조·벚꽃·두견·붓꽃·나비·멧돼지·기러기·국화·사슴·봉황·제비. 현재 좌석에는 학/사슴 |
| 프레임·버튼·배지 | 자체 CSS(MIT 코드) | 먹색 읽기 면, 한지색 주요 버튼, 1px 무광 황동 경계, radius 12/10px | Kenney RPG 패널/버튼/초상 링 완전 제외 |
| 사건 | para CC0 원본 alpha·64프레임 보존 | 공통 따뜻한 흰 심지 + 사건별 적갈/청록/황동/주황 | 원색 네온 혼용을 제거 |

새 그림을 직접 그린 것이 아니라 원화/기존 SVG를 크롭·재색상화했다. 원화의 서명/문구를 제품 카피로 쓰지 않는다. source/licenseUrl/changes를 License 화면과 NOTICE에 자동 생성하며, 월별 파생 초상에 CC0를 잘못 붙이지 않는다. Pillow·Playwright 공식 API로 오프라인 가공, 추가 런타임 라이브러리 없음.

### 제작 도구 크기와 Ogg 결정성 (리뷰 5351703073)

| 로컬 이미지 | 이미지 ID | docker image inspect `.Size` |
|---|---|---:|
| p2p-gostop-dev:3 | `sha256:25b9fb36f9345e33657ef2f8bfb30be2a75ce7ac9c636da246cbc80279f61a5d` | 1,166,425,769 bytes |
| p2p-gostop-dev:4 | `sha256:a9faa530af5b7dcb82d2d93b7d11740825e32712ce6cdc30f08e1df18f76a6d6` | 1,168,473,579 bytes |
| 증가 | 2026-09-29 작성자 재확인, 리뷰 관측과 동일 | **+2,047,810 bytes (약1.95MiB)** |

압축 전 로컬 이미지 레이어 크기 기준이다. registry 전송 압축 크기/호스트 공유 레이어 실제 추가 점유량/앱 dist 증가와 다르다. Dockerfile은 주석만 갱신해 동일 이미지 태그를 유지한다.

[FFmpeg format flags / Ogg](https://ffmpeg.org/ffmpeg-formats.html#ogg) 근거로 `-flags +bitexact -fflags +bitexact -serial_offset 0`, 입력 metadata 제거를 고정했다. `pro-audio.py`를 생성/검증이 공유한다. `uv run packages/web/scripts/check-pro-assets.py`는 5개 Ogg를 각각 두 번 독립 인코딩해 SHA-256 상호 일치, 커밋 산출물 일치, Ogg 헤더 serial=0을 검사한다. 동일 입력·고정 도구 재현성을 보장하며 다른 인코더 버전의 동일 바이트까지 주장하지 않는다.

## 5. 측정과 승인

**예산 개정 승인 전. 현행 전체1.5MiB·게스트 첫 로딩≤2초 유지.** 초과분은 평가 빌드에만 있다. 스토어 MB, 디스크 원본 bytes, dist 전체 bytes, 한 화면 실제 요청 bytes, decode 메모리를 따로 보고한다. Chromium/WebKit Docker rAF 측정은 실기기 FPS가 아니다. iPhone p95·Galaxy 메모리/FPS는 [실기기 절차](../device-test/pro-assets.md)에 따라 사람이 기록하며 이 PR에서 합격을 만들어 쓰지 않는다.


### 평가 빌드 실측 (2026-09-29, 아트 디렉션 갱신)

| 산출물 | 실측 | 의미 |
|---|---:|---|
| 선택 원본(중복 파일 경로 1회 산입) | 18,388,284 bytes | 제작 입력, 배포 제외 |
| 기본 dist | 1,233.2 KiB | ≤1,536KiB 현행 gate 통과 |
| 평가 dist | 13,373.6 KiB | 모든 tier/코덱, 평가만 초과 허용 |
| 단일 최대 WebP+M4A 팩 | 2,618,279 bytes (2.50 MiB) | 미사용 후보/초상12종 포함, 동일 tier만 선택 |
| 전체 선택 이미지 RGBA 계산 | 44,125,632 bytes (42.08 MiB) | Σw×h×4, 브라우저 실제 PSS 아님 |
| GitHub PNG | 실제 앱8장 + 초상 contact sheet1장, 각 85,967~217,432 bytes | 모두412×915, ≤300KB |

| 렌더러 / DPR | 3×5초 rAF Hz | p95 프레임 간격 | 최대 | 판정 |
|---|---:|---:|---:|---|
| chromium / 1 | 60.02–60.02 | 16.7–16.7ms | 16.8ms | 대역 계측; 실기기 합격 아님 |
| chromium / 3.5 | 60.02–60.13 | 16.7–16.8ms | 16.8ms | 대역 계측; 실기기 합격 아님 |
| webkit / 1 | 59.19–59.46 | 32.0–34.0ms | 44.0ms | 대역 계측; 실기기 합격 아님 |
| webkit / 3.5 | 53.38–53.99 | 44.0–45.0ms | 58.0ms | 60fps 미달; 개선 필요 |

이전 RPG 프레임 구성 WebKit DPR3.5 51.91–52.31Hz → 이번 약53–54Hz. 변경 전후 한 환경의 관측이며 원인 분리 실험이 아니므로 프레임 제거 효과로 단정하지 않는다. CSS blur/backdrop-filter는 없고, 고해상도 배경/그림자·전환 repaint가 비용 후보다. GPU trace 없이 원인을 확정하지 않는다. 다음 성능 작업에서 정적 배경 합성 레이어 분리, 그림자 제거, atlas 해상도 제한을 각각 A/B 측정한다. #104 고정6행 통합 후에도 재검증한다.

| WebKit 공유 대역폭 | cold | 진행 표시 p95 | 이름 입력 p95 | 재질 완료 p95 | bytes |
|---|---:|---:|---:|---:|---:|
| 10Mbps +20ms | 20 | 515ms | 515ms | 604ms | 665,518 |
| 30Mbps +20ms | 20 | 218ms | 218ms | 254ms | 665,518 |
| 60Mbps +20ms | 20 | 164ms | 165ms | 193ms | 665,518 |

실제 `?role=guest&visual=pro` 참가 화면의 공유 응답-byte 큐이며 갤러리 대체가 아니다. 라디오 손실·연결 설정·모바일 CPU/Safari 디코더는 재현하지 못한다. **실기기 미검증**. 이 값으로 iPhone ≤2초 합격을 선언하지 않는다. [renderer/resources](data/pro-measurements.json), [throttle60회](data/pro-throttle.json) 원자료와 외부 요청0을 기록한다.

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
| 게스트 전체 세션 팩 | 기본 1.20MiB + 단일 변형 2.50MiB = 3.70MiB. 10% 여유 후0.5MiB 단위 올림 **4.5MiB 후보** | 이전4MiB 후보에서 원화/12초상 추가를 반영. 첫 화면 일괄 전송 금지. 미사용 후보·중복코덱 제거 후 확정 |
| Android 로컬 고해상도 | 단일 최대 변형 2.50MiB×1.1 후0.5MiB 단위 올림 **추가3MiB 후보** | 로컬팩 경로/서버 allowlist 분리, 메모리·열·FPS·배터리 통과 전 미승인 |
| 변환/평가 빌드 | 13.06MiB는 모든 tier/코덱 비교 비용 | 이를 게스트 최소 필요 용량이라고 주장하지 않음. 본선 전체1.5MiB gate 유지 |

### 6.3 분할 로딩·프리로드·배터리 조건

1. 첫 HTML에서 진행 표시, 앱이 준비되면 자산 건수/실패·재시도 상태로 전환한다. 네트워크 실패가 입력 잠금이나 무한 가짜100%로 이어지지 않는다.
2. 게스트 첫 화면에는 이름·접속 안내·필수 글꼴·저해상도 재질만 포함한다. Board 진입 전에 필수 카드·HUD 자산 준비 상태를 확인한다. 이후 화면이나 사건의 고해상도 팩을 최초 페이지와 함께 요청하지 않는다.
3. 프리로드는 현재 화면을 사용할 수 있게 된 뒤 다음 화면에 필요한 소량만 한다. 뒤로 가기/앱 숨김 시 불필요한 프리로드 취소, 동시 다운로드 제한, 진행 중 필수 입력과 경쟁 방지를 후속 구현의 승인 조건으로 둔다. 현재 프로토타입은 필요시 이미지 로딩/공유 캐시/사용자 조작 후 오디오 준비까지 구현했다.
4. `intend.md` §3.3의 다크 UI·이벤트 중에만 렌더 루프·숨김 복구 의도를 따른다. 상시 파티클·동영상·폴링·실시간 PBR 반사 셰이더를 넣지 않는다. 큰 저장 용량이 지속 GPU 작업을 정당화하지 않는다. 효과 atlas는 한 번 decode하고 사건 종료/unmount 때 rAF를 멈춘다.
5. Android 로컬팩도 무료 자원이 아니다. 1024² RGBA 한 장은 약4MiB 디코드 메모리이며 압축 파일60KiB와 다른 값이다. 로컬팩 선택 전에 동시에 살아 있는 texture/atlas 수와 renderer PSS·긴 프레임·10분 열/배터리 변화를 확인한다.

### 6.4 실행·반영 경계

```sh
# 현행 본선 gate: 평가 팩 제외, ≤1.5MiB
 npm run build -w packages/web
# 평가 전용: 명시적으로 초과 허용, 기본/릴리스 빌드와 구분
 PRO_ASSET_REVIEW=1 npm run build -w packages/web
 node packages/web/scripts/review-pro-assets.mjs
 node packages/web/scripts/throttle-pro-assets.mjs
 PRO_ASSET_REVIEW=1 npm run e2e -w packages/web -- e2e/pro-assets.spec.ts
```

기본 production 빌드는 `?visual=pro`만 붙여도 평가 팩을 켤 수 없다. dev 또는명시적 평가 빌드에서만 활성화된다. 공식 APK/본선 전환은 이 PR의 자동 승인 대상이 아니다.

## 7. 예산 때문에 본선에 넣지 못하는 자산과 용량

현재 기본 1,233.2KiB, 잔여 302.8KiB. 작은 재질·짧은 소리는 선별 도입 여지가 있으나 전체 사건 atlas/원화를 동시에 넣는 구성은 예산을 넘는다. 다음은 이번 가공 후 실측이다. 모든 팩은 이 PR에서 평가 전용이다.

| 자산 | 1x WebP bytes | 최대3x WebP bytes | 본선 제외 이유 |
|---|---:|---:|---|
| ppeok | 238,280 | 588,518 | 4사건 합계가 잔여 예산 초과 |
| jjok | 139,540 | 350,754 | 4사건 합계가 잔여 예산 초과 |
| ttadak | 198,290 | 425,680 | 4사건 합계가 잔여 예산 초과 |
| bomb | 211,582 | 487,806 | 4사건 합계가 잔여 예산 초과 |
| smoke | 107,228 | 216,190 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| glow | 5,064 | 33,416 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| spark | 6,578 | 38,986 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| felt | 14,090 | 59,048 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| leather | 1,428 | 6,406 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| gold | 874 | 3,002 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| wood | 11,032 | 46,782 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| key-art | 54,482 | 121,362 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| settlement-art | 39,144 | 87,656 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-01 | 2,238 | 8,476 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-02 | 2,544 | 9,946 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-03 | 3,160 | 14,146 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-04 | 3,014 | 13,046 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-05 | 2,586 | 9,032 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-06 | 2,754 | 11,234 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-07 | 2,786 | 11,506 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-08 | 2,144 | 8,594 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-09 | 2,550 | 9,530 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-10 | 2,658 | 10,292 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-11 | 1,978 | 6,996 | 평가용; 우선순위/해상도 선별 후 본선 검토 |
| avatar-12 | 2,644 | 11,234 | 평가용; 우선순위/해상도 선별 후 본선 검토 |

4사건 합계1x 787,692bytes / 최대 1,852,758bytes. Ogg5개 31,153bytes + M4A5개 28,641bytes = 59,794bytes; 소리48KiB 계획에는 codec 분리/선별 필요. 원본 18,388,284bytes는 제작 입력으로 배포하지 않는다. UI Adventure/Animal Pack은 예산이 아닌 방향 결정으로 제거됐다.

## 8. 검증·후속 경계

개발 이미지에서 npm ci/lint/check 통과, Node491·브라우저278 통과. 기본 E2E96통과/16skip(기존4+평가전용12), 평가 전용 E2E14통과. Android assembleDebug/testDebugUnitTest/lint 통과. 기존 갤러리 기준샷은 고지 추가 때문에 License의2PNG·2ARIA만 갱신했고 다른 기준샷은 그대로다.

#104의 고정6행/문턱칩/10장2행·12월 최악fixture는 이 main 기반 평가 브랜치에 아직 포함되지 않았다. 현재4viewport 기본fixture 검사 결과를 그 계약 완료로 바꾸어 보고하지 않는다. WebKit DPR3.5 약53~54Hz, 실기기 p95/메모리·200%확대·Safari 음향unlock은 채택 전 검증/개선 항목이다.

### NF 성능 항목 개정 후보 (NF-03 부속 또는 별도 NF ID, 리뷰 전)

| 항목 | 후보 상한/목표 | 도출과 승인 조건 |
|---|---|---|
| 프레임 | **60fps**, 60Hz에서 p95 간격 ≤20ms·50ms 초과 ≤1% | 기존60fps 의도에 프레임 분포 지표 추가. Docker rAF와 실제 GPU 완료는 다름. Galaxy 10분·사건별30회 trace, 현재 WebKit 대역 목표 미달 |
| 자산 메모리 | decode RGBA 작업 집합 **48MiB 후보** | catalog의 단일 최대 변형 `Σw×h×4` 계산에 여유 부여. 전체 앱/브라우저 PSS와 다름; 실제 사용은 화면별 로딩으로 이보다 적어야 함 |
| WebView 메모리 | 기본 대비 renderer PSS 증가 **64MiB 후보** | 48MiB 자산 + canvas/오디오/관리용16MiB 여유라는 설계 가정. 전체 PSS는 기본 실기기값 확보 후 고정. 50사건/숨김복귀10회 후 지속 증가 없음. **실기기 미검증** |
| 배터리 | 기본 대비 추가 소비 **≤1%p/30분 후보**, 대기/숨김 추가 RAF 0 | 기내·오프라인·핫스팟·동일 밝기/60Hz/소리/진동 조건 3회 교차 시험. percent 계측 해상도/온도 기록 병행. 아직 관측 근거 없는 허용오차 제안이며 승인값 아님 |
| 전송/입력 | 첫 필수1.5MiB·cold p95≤2초·입력≤100ms 유지 | 화면별 분할/진행 표시/취소 가능한 후순위 preload. 로컬 고해상도 팩은 게스트 HTTP 목록에서 분리 |

[intend.md](../../intend.md)의 배터리·오프라인 의도 때문에 파일 크기를 늘리는 것만으로 성능을 달성했다고 판단하지 않는다. 메모리·FPS·배터리 목표를 함께 검토한 후 spec에 반영한다. 현재 이 표는 연구 제안이며 `spec.md`를 수정하지 않았다.
