# 시각 방향 목업 재현

문서용 정적 프로토타입. 앱에 포함하지 않는다. [제안](../visual-direction.md) · [조사](../../research/visual-direction.md).

## 이미지 재생성

```sh
./dev.sh install
./dev.sh e2e --config e2e/design/visual-direction.config.ts
```

기존 Playwright `mcr.microsoft.com/playwright:v1.63.0-noble` 컨테이너에서 실행한다. `prototype.html?theme=ink|club|pop&scene=home|game|gostop|ppeok|jjok|settlement`를 file URL로 열며 외부 HTTP 요청은 없어야 한다. 테마별 로컬 폰트와 기존 카드 SVG를 로드한다.

- CSS viewport 412×915, deviceScaleFactor 3.5. PNG 저장은 `scale: 'css'` → 412×915.
- Chromium 18개 파일을 저장하며 WebKit 18개 상태는 같은 DOM·폰트·입력 범위 검증만 수행한다.
- 이미지 디코드 완료·폰트 로드·콘솔 오류0·외부 요청0·문서 스크롤0·버튼≥48×48·선택/손패 비교차를 검사한다.
- 문서 PNG 파일 크기는 각각 **≤300,000B**. 프로덕션 Vite dist에는 포함되지 않는다.
- 정적 버튼이므로 실제 클릭/규칙/포커스/스크린리더 수용 시험은 아니다.

## 폰트 측정 재현

FontTools 4.61.1, Brotli 1.2.0은 `plan.md` §1.8에 근거를 기록한 **Docker 안의 일회성 조사 도구**다. 호스트에 설치하지 않는다. 다음 원본 파일을 임시 입력 폴더에 저장한다. 앱은 이 URL을 요청하지 않는다.

| 입력 파일 | 고정 원본 |
|---|---|
| Pretendard.woff2 | [v1.3.9 WOFF2](https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2) |
| OFL.txt | [Pretendard LICENSE](https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/LICENSE) |
| SUIT.woff2 | [SUIT WOFF2](https://raw.githubusercontent.com/sun-typeface/SUIT/55118d981336d8fce005eb62888c12c0568ef7b0/fonts/variable/woff2/SUIT-Variable.woff2) |
| SUIT-OFL.txt | [SUIT LICENSE](https://raw.githubusercontent.com/sun-typeface/SUIT/55118d981336d8fce005eb62888c12c0568ef7b0/LICENSE) |
| Wanted.woff2 | [Wanted WOFF2](https://raw.githubusercontent.com/wanteddev/wanted-sans/02c9b822349c188ada95f9e2d90c2ed18f853235/packages/wanted-sans/fonts/webfonts/variable/complete/woff2/WantedSansVariable.woff2) |
| Wanted-OFL.txt | [Wanted OFL](https://raw.githubusercontent.com/wanteddev/wanted-sans/02c9b822349c188ada95f9e2d90c2ed18f853235/OFL.txt) |
| Noto.ttf | [Noto Sans KR TTF](https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf) |
| Noto-OFL.txt | [Noto OFL](https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/notosanskr/OFL.txt) |

```sh
# 저장소 루트, /tmp/visual-research에 위 8개 파일이 준비된 경우
# 사용한 python 이미지 digest: sha256:f77ac9e44ae96ef2c90b8053ea08c31f8be030f824196b0ae4db6d462c84e51f
docker run --rm -v "$PWD:/work" -v /tmp/visual-research:/inputs \
  python:3.12-slim@sha256:f77ac9e44ae96ef2c90b8053ea08c31f8be030f824196b0ae4db6d462c84e51f \
  sh -c 'pip install --quiet fonttools==4.61.1 brotli==1.2.0 && python /work/docs/design/mockups/font-study.py'
```

`font-study.py`는 입력 SHA-256·코퍼스·subset 바이트·OpenType tnum·기본 숫자 advance를 `font-metrics.json`에 쓴다. 한글 코퍼스는 현재 소스(한국어 주석 포함)+목업에서 추출하므로 새 문구/브랜치에 따라 숫자가 달라진다. 모든 weight·OpenType 기능을 유지하며 힌팅은 제거한다. 원본 폰트 바이너리는 커밋하지 않는다. 내부 표시명/PS 이름을 VD 접두 이름으로 바꾸며 원 OFL 고지를 동봉한다.

렌더러는 `.rendered/`(git 제외)에 18개 화면의 실제 문구를 저장한다. FontTools 실행은 이를 합쳐 `fonts/rendered-corpus.txt`(117문자)를 만들고 실제 표시 문자만의 크기도 기록한다. 동봉 폰트/예산은 앱 소스까지 포함하는703문자 기준이다. 실제 문구 재측정은 **렌더 → font-study** 순서로 실행한다. 일반 E2E 결과 폴더와 분리해 다른 테스트가 코퍼스를 지우지 않게 했다.

## 라이선스

- **기존 카드**: Commons 화투 SVG, CC BY-SA 4.0. Spenĉjo, Marcus Richert, Louie Mantia Jr. 상세 원본은 [ATTRIBUTION.md](../../../packages/web/public/cards/ATTRIBUTION.md)와 [LICENSE](../../../packages/web/public/cards/LICENSE). PNG에 카드가 포함되므로 이 고지를 함께 유지한다. 카드 그래픽은 수정하지 않고 배열/크기만 바꾸었다.
- **폰트**: [Pretendard 고지](fonts/VDPretendard-OFL.txt), [SUIT 고지](fonts/VDSUIT-OFL.txt), [Wanted 고지](fonts/VDWanted-OFL.txt), [Noto 고지](fonts/VDNoto-OFL.txt). 수정 subset도 OFL 1.1.
- **자체 UI/CSS/문서 스크립트**: 저장소 MIT. 화면 PNG의 기존 카드 권리는 해당 CC BY-SA를 따르며 PNG 전체를 CC0라고 표시하지 않는다.
- 상용 게임 스크린샷/로고/음원은 커밋하지 않았다.

## 검증 기록

최종 실행 결과를 이곳에 기록한다. 실기기 결과는 [별도 절차](../../device-test/visual-direction.md)에 사람이 확인한 내용만 추가한다.

2026-09-29, 기준39e8af9 + 이 문서 변경:

| Docker 명령 | 결과 |
|---|---|
| `./dev.sh install` | 성공 |
| `./dev.sh lint:fix`, `lint` | 성공 |
| `./dev.sh check` | 성공, svelte-check 0 errors / 0 warnings, knip 통과 |
| `./dev.sh test` | 23파일 / 478테스트 통과 |
| `./dev.sh test:browser` | 최종32파일 / 224테스트 통과 |
| `./dev.sh build:web` | 1,010.2 KiB / 1,536 KiB, 외부 URL0 |
| `./dev.sh e2e` | 54통과 / 기존 조건부2 skipped. 빠름 p50 Chromium526ms·WebKit592ms |
| `./dev.sh apk:debug` | BUILD SUCCESSFUL |
| `./dev.sh android:test` | JVM tests + Android lint BUILD SUCCESSFUL |
| `./dev.sh e2e --config e2e/design/visual-direction.config.ts` | 36통과, PNG18장, 412×915, 최대142,004B |

초회 앱 브라우저 검사에는 Card/Board의 timeout·키보드 단언4건 실패가 있었고, **앱 코드를 바꾸지 않은 전체 재실행**은224/224 통과했다. 원인을 확정하지 않았으며 실기기 성공 근거로 쓰지 않는다. 최초 `ci`는 docs에 둔 렌더러의 knip 등록 문제로 중단되어, 렌더러를 기존 `packages/web/e2e/design/` 경계에 배치하고 entry 등록 후 모든 필수 태스크를 개별 완료했다.

폰트는 tnum 존재만으로 브라우저 픽셀폭이 정확히 같다고 단정하지 않았다. 24px 단일 숫자의 Linux Chromium 측정은 최대1 CSS px 편차, WebKit은0이었다. 렌더 검사의 허용치는1px로 명시했고 HUD는 고정 열/우측 정렬을 사용한다. 사람 기기 검증에서 재확인한다.

## 2026-09-29 사용자 조정 반영

슬로건·감성 문구·세로 텍스트 장식을 제거했다. 앱 이름은 모든 안에서 “맞고”, 홈/정산/상태는 기능 라벨만 사용한다. 먹을 패의 실제 카드 이미지는 유지한다. 18 PNG를 모두 재렌더했다.

폰트 측정은 [공통 OFL 파이프라인](../fonts/README.md)을 사용한다. `sources.json`의 원본/고지 SHA-256 확인 → 글리프 subset → 저장 결과 재개방 → cmap/tnum/숫자 advance/가변 축/160 KiB gate를 거친다. `fonts.css`는 실제 cmap의 unicode-range이며 고지 원문은 byte 그대로 보존한다. 공통 도구의 실패 테스트와 최종 렌더 결과는 아래 추가 기록한다. 제품 적용은 사용자 방향 선택 후 별도 PR이다.

| 조정 후 검증 (2026-09-29, 앱 기준39e8af9 유지) | 결과 |
|---|---|
| `./dev.sh lint:fix` / `./dev.sh ci` | lint·check·node478·build:web·전체E2E·APK·Android tests/lint 모두 성공 |
| 기존 gallery 픽셀/axe 포함 전체 E2E | 54통과, 기존 조건부2 skipped. **기존 기준 PNG 변경0** |
| `./dev.sh test:browser` | 32파일 / 224통과, 이번 실행 실패0 |
| 빠름 AC-06 | p50 Chromium533ms / WebKit553ms |
| 제품 번들 / 외부 URL | 1,010.2 KiB / 0건, 앱 런타임 변경0 |
| 최종 문서 렌더 | Chromium18+WebKit18 통과. 기능 라벨/세로장식 없음·후보 원 SVG 대응도 검사 |
| PNG 산출물 | 18장 모두412×915, 최대138,838B, 합계1,845,705B. 앱 dist와 분리 |
| 공통 OFL 파이프라인 | CLI 출력 성공, 5개 gate 테스트 통과(정상4후보 + 해시/글리프/용량/tnum 실패) |
| 새 폰트 코퍼스/크기 | 앱 소스 포함703문자, 실제 표시117문자. Pretendard140.3 / SUIT145.2 / Wanted106.0 / Noto116.7 KiB |

OFL 파일은 이전 측정의 공백 정규화를 없애고 원본 byte 그대로 동봉한다. 고지 파일만 `.gitattributes`에서 원본의 행 끝 공백을 허용하며 `sources.json` 해시와 동일함을 파이프라인이 검사한다. 제품 접근성/최소4화면 계약의 구현 전후 평가는 [제안 §10](../visual-direction.md#10-유지해야-할-기능-목록--매-구현-pr-대조표)에 분리했다. 인계 브랜치 f566f46의 검사 수치는 [인계 검토](../foundations/hud-handoff.md)의 원 담당 보고이며 위 현재 브랜치 재검증과 섞지 않는다.
