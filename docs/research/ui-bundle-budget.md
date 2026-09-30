# #207 누적 UI 번들 측정과 안전한 절감

NF-03·AC-07·NF-RP-06 / plan **B207-1**. 계획 commit `357a34907d0cee6ca828b1d2270bc7b50fa981ae` 뒤 구현한 연구·빌드 PR이며 요구 전체 완료·규범 개정 승인 문서가 아니다. 원 UI 브랜치와 제품 소스는 편집하지 않았다. 현행 전체 raw 상한 **1,572,864 B (1.5 MiB)**를 그대로 적용한다. MB=1,000,000 B, MiB=1,048,576 B다. NF-03/AC-07의 첫 전송 1.5MB 문구와 raw gate를 같은 회계로 해석하지 않는다.

## 고정 기준과 실제 합성

| 기준 | 고정 SHA | 제한 |
|---|---|---|
| main / #226 | `2e90fedb2bca04c6157ea594cf743d52032abcc1` | 계측 시작 기준 |
| #218 | `ad1afc818af1506aad710439de508bccf50adda2` | #226 통합·10 PNG 근거 포함. 측정 중 main `2fe4da3f6ec841ecfff09fd03c227a242f05ebe7`로 병합됐으므로 이 승인 제품 조합과 매핑하고 중복 재빌드하지 않음 |
| #223 | `12a2950ec92aba28e61e85da41fbc48cd6571dd9` | 최종 제품 전 임시 checkpoint. 후속 Board 예산/회귀 head는 별도 측정 필요 |
| #225 | `a3acbb8df4b969046c6a4bd9cf97fe16db47b905` | 독립 제품 리뷰 뒤 동결된 기준 |

별도 임시 checkout에서 main→218→223→225 순서의 실제 Git 병합 tree를 빌드했다. 원 PR이나 이 최적화 제품 브랜치에 UI를 병합하지 않았다. 합성 checkpoint는 `50fec7f7b5fa6cf83026c38f0fe3fd378bde27a2`이며 부모는 임시 main+218+223 tree와 #225 head다. `Game.svelte` 충돌은 #225 summary/pending/acknowledge와 #218 soloDifficulty 전달을 함께 보존했다. `Settlement.svelte`는 #218 난이도·축약 시각 제목/원문 sr-only/title과 #225 pending/acknowledge·stage·tabindex/heading focus를 함께 보존했다. plan 충돌은 두 진행 블록을 모두 보존했다. 자동 병합된 #223 Board playbackBusy와 슬롯/재생 예산은 유지했다. 이 최소 합성은 측정 fixture이며 제품 통합 승인이나 전체 기능 검증이 아니다.

Node **24.21.0**, npm **11.19.0**, lock 고정, 새 checkout마다 npm ci 후 기본 `npm run build -w packages/web`를 **각 조건 세 번** 실행했다. PRO_ASSET_REVIEW는 사용하지 않았다. 실패한 build도 표준 gate를 변경하지 않고 생성된 dist를 집계했다. [실행·manifest 해시](bundle-budget/runs.json)와 조건별 전체 파일/SHA-256 manifest를 함께 남긴다. 현재 build는 시간을 JS에 넣으므로 세 번의 artifact 해시는 달라질 수 있지만 모든 조건의 raw 길이는 동일했다.

## 중복 없는 배포 회계와 A/B

각 행은 실제 빌드한 전체 dist이며 개별 증분의 합이 아니다. 카드·스킨의 고지/manifest는 metadata에만 센다. 표의 숫자는 B다.

| 조건(각 3회 동일) | JS | CSS | WOFF2 | 카드 SVG | skin WebP | metadata | 전체 raw | 상한 여유 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 575,722 | 92,063 | 144,248 | 620,988 | 84,804 | 52,880 | **1,570,705** | 2,159 |
| #218 | 577,742 | 92,182 | 144,248 | 620,988 | 84,804 | 52,880 | **1,572,844** | 20 |
| #223 임시 checkpoint | 578,369 | 92,063 | 144,248 | 620,988 | 84,804 | 52,880 | **1,573,352** | −488 |
| #225 | 578,060 | 92,063 | 144,248 | 620,988 | 84,804 | 52,880 | **1,573,043** | −179 |
| 실제 누적 A | 582,730 | 92,182 | 144,248 | 620,988 | 84,804 | 52,880 | **1,577,832** | **−4,968** |
| 실제 누적 B: JSON 공백 제거 | 582,730 | 92,182 | 144,248 | 620,988 | 84,804 | 52,470 | **1,577,422** | **−4,558** |
| main + 동일 최적화 | 575,722 | 92,063 | 144,248 | 620,988 | 84,804 | 52,470 | **1,570,295** | 2,569 |

누적 A의 main 대비 제품 JS는 **+7,008 B**, CSS **+119 B**다. JSON 공백 제거는 **410 B**만 줄여 누적 gate를 해결하지 못했다. source 단독 여유 또는 hosted PR CI 통과가 최종 #218/#223/#225 조합 통과를 뜻하지 않는다.

### 실행한 후보와 보존 증거

`compact-metadata.mjs`가 Vite 배포 복사 후 **skin/manifest.json 하나**의 JSON 공백을 제거한다. 출처·라이선스·가공 설명·SHA·해상도·문자열·배열 순서를 모두 보존하며 source manifest는 읽기만 한다. 이미지/글꼴/카드/고지/wire/release metadata는 편집하지 않는다. 원본 제작 파이프라인의 가독성도 유지한다. 실험 [동등성 manifest](bundle-budget/equivalence.json)는 52 SVG와 모든 WebP/WOFF2/CSS/고지 blob 동일, 공통 정적 파일의 유일한 변경이 skin/manifest.json임을 확인한다. parsed 전체 값 동등성·멱등·다른 파일 불변 직접 검사 1개가 통과했다. 렌더 입력 이미지와 CSS는 바이트 동일하므로 새 시각 품질 변경이 없다.

SVGO 4.1.0 공식 문서(Context7)와 설치된 plugin으로 실제 후보를 비교했다. reusePaths는 **43 B 증가**, group/default의 좌표 변환 없는 pass는 **0 B 절감**이었다. path 재직렬화는 precision 1~4에서 **0 B 절감**, 높은 precision 후보는 **2,896 B 증가** 또는 좌표 변경이 있어 기각했다. 좌표 정밀도 감소·래스터 전환·폰트 glyph/힌트 제거·라이선스/표시 문구 삭제는 시행하지 않았다. Vite는 이미 prototype 팩을 release에서 제외하므로 그 자산을 다시 절감으로 세지 않았다. 손실 없는 후보로 남은 4,558 B를 억지로 맞추지 않는다.

## 전송 실측과 별도 비용

누적 B artifact를 현행 `StaticSite.load/handle` 그대로 사용하는 **비공개 loopback HTTP fixture**에서 서빙했다. 운영 wrapper·Docker·Funnel·release clone·자격 증명은 접근하지 않았다. desktop headless Chromium/WebKit, 412×840 DPR3.5, 무제한 CPU/network, fresh context→`?role=guest` 이름 입력란·fonts.ready, 같은 context reload를 각각 세 번 측정했다. 외부 요청 시도0, 모든 필수 응답 `Content-Encoding` 없음(**identity**). 이미지나 전체 게임 세션을 이 초기 진입 값에 합치지 않는다.

| 관측(각 엔진 3회 동일) | 값 | 뜻과 제한 |
|---|---:|---|
| cold entry 실제 필수 body | **747,451 B** | HTML660 + main JS512,150 + CSS90,393 + WOFF2 144,248. encodedBodySize=decodedBodySize |
| cold Resource Timing transferSize | **748,651 B** | 브라우저의 header 포함 계수. TCP/TLS/무선 전체 패킷 실측 아님 |
| warm reload network body 추정 | **660 B** | index no-store 재응답, immutable JS/CSS/font 캐시. timing에서 transferSize>0인 body만 분리 |
| Chromium warm encodedBodySize 합 | **747,451 B** | 캐시된 resource도 원 body 크기를 보고함. 네트워크 재전송량으로 쓰면 안 됨 |
| WebKit warm encodedBodySize 합 | **660 B** | 엔진 보고 차이를 원값 그대로 보존 |

[실제 response header·Resource Timing 표본](bundle-budget/transfer-static.json)에 모든 필수 경로와 캐시 계수를 기록했다. routing은 HTTP cache를 끄므로 사용하지 않고 loopback 제외 요청은 도달 불가 proxy로 제한했다. cache-hit body를 0 전송으로 분리한 값은 timing 기반 추정이며 서버 packet 계수는 아니다. Android `SmokeServer.kt` serveAsset는 `respondBytes`이고 Content-Encoding 구현이 없지만, 이번 desktop 서버 관측을 Android/WebView 실측으로 전용하지 않는다. Android의 cards/skin no-store와 정적 release의 immutable도 서로 다르다.

[오프라인 압축 비교 모형](bundle-budget/offline-compression-model.json)은 누적 B의 파일별 gzip level9 합 **705,562 B**, Brotli quality11 합 **638,796 B**다. 이는 전체 파일을 각각 압축한 모델이며 **실제 serving이 아니다**. 현행 정적 서버가 gzip/Brotli를 구현한 것으로 쓰지 않는다. 사전 압축본을 함께 배포하면 전체 raw 파일이 증가하므로 serving 설계·배포 회계를 함께 검토해야 한다.

후속 게임/동적 Gallery·AI worker 요청과 전체 cold/warm 세션, JS parse/execute 시간, 카드 cold decode 및 decoded/GPU memory, 프레임/입력 지연은 이 body 측정으로 증명하지 않는다. 기존 #197의 데스크톱 trace도 최신 head의 실기기 성능 근거가 아니다. Galaxy hotspot/WebView·iPhone Safari·Funnel 실제 encoded 응답/첫 paint/60fps/열·전력은 **미검증**이다.

## 리뷰 가능한 예산 개정 제안 — 적용하지 않음

현행 승인 UI 누적도 안전 절감 후 **4,558 B 초과**하고, 단독 #218 여유20 B는 다음 명시적 UI 요구를 수용할 근거가 아니다. 추가 자산/렌더러 품질을 희생해 현재 상한을 맞추는 대신 다음을 **사용자 승인 전 후보**로 제안한다.

1. NF-03·AC-07의 최초 **필수 응답 body ≤1,500,000 B (decimal MB)**를 초기 guest 입력뿐 아니라 초기 게임 가능 시점의 요청 집합/동적 worker/필수 카드로 정의하고 cold 실제 serving Content-Encoding/encodedBodySize로 검증한다. response header와 TCP/TLS는 별도 회계한다. 현재747,451 B는 입력란까지의 하위 경로라 전체 수용 근거가 아니다.
2. 전체 웹 배포 raw 상한 후보 **2,097,152 B (2 MiB)**를 압축 전 파일·license·metadata·worker·지연 chunk·필수 offline 자산 전체 합으로 정의한다. 현 누적 B 대비519,730 B 여유는 약33%의 재투자 공간일 뿐 향후 모든 요구 충분성·성능을 증명하지 않는다. 다른 숫자를 선택할 수 있으며 지금 gate는 계속1,572,864 B다.
3. cold 전체 세션 unique encoded body·warm/후속 판 incremental body·APK 배포 크기·첫 paint/JS 실행·decode/메모리·frame 지연을 별도 표로 관측하고, 전송/배포 용량으로 2초·100ms·60fps 통과를 대체하지 않는다. 실제 Android와 release serving·cache 조건, hotspot iPhone/Galaxy 최소3회 및 사용자 시각/동작 수용, 독립 리뷰 뒤에만 spec/plan/gate 개정을 결정한다.

승인 전 spec NF-03·AC-07·NF-RP-06, check-bundle 상한/guard, 요구 완료 상태를 변경하지 않는다. #131/#201 등 기능 이슈를 이 연구로 닫지 않는다. 최종 #223 checkpoint와 #225의 실제 main 통합 및 새 hosted exact-head CI/실제 누적 gate는 남는다.

## 재현과 검증

복붙 경로 변수 `PROJECT_ROOT`는 사용자가 자신의 연구 checkout으로 지정하는 환경변수이며 자리표시자 디렉터리를 그대로 실행하지 않는다. 새 checkout에서 `nvm use`·`npm ci` 뒤 각 고정 SHA를 별도 임시 checkout으로 준비하고 위 순서의 merge conflict 보존 규칙으로 합성한다. 원 UI branch를 수정하지 않는다.

```sh
npm run build -w packages/web
node tools/bundle/measure-dist.mjs packages/web/dist /tmp/bundle-manifest.json
node --test tools/bundle/measure-dist.test.mjs packages/web/scripts/compact-metadata.test.mjs
```

gate 실패는 기록하고 dist를 삭제하거나 상한을 바꾸지 않는다. A는 기존 build, B는 본 PR의 metadata step 하나만 추가한다. 각 조건3회 raw/hash를 기록한다. 로컬 serving fixture는 현행 StaticSite를 사용하는 아래 코드로 **연구 checkout의 별도 terminal에서만** 시작한다(운영 serving 아님).

```sh
node --input-type=module <<'JS'
import { createServer } from 'node:http';
import { StaticSite } from './packages/relay-dev/src/static.ts';
const site = await StaticSite.load([{ id: 'v0.4.0', distDir: 'packages/web/dist' }]);
createServer((request, response) => {
  if (!site.handle(request, response)) response.writeHead(404).end();
}).listen(4246, '127.0.0.1', () => console.log(site.current.path));
JS
```

출력한 artifact 경로를 환경변수 `ARTIFACT_PATH`에 설정한 뒤 실행한다. loopback 외 주소는 도구가 거절한다.

```sh
node packages/web/scripts/measure-transfer.mjs "http://127.0.0.1:4246${ARTIFACT_PATH}" /tmp/transfer.json
```

로컬 변경 검증: 직접 raw accounting/symlink 검사1 + metadata 동등성 검사1 PASS, lint/privacy16·Node563·browser790·PR smoke408·Android assembleDebug/testDebugUnitTest/lint PASS. 계측 도구의 workspace 등록 후 최종 lint/check도 통과했다. smoke는 계측 fixture4246과 겹치지 않도록4247/workers2, Gradle workers2. main+B 기본 build는1,570,295 B로 통과, 실제 누적 B는1,577,422 B로 실패. hosted CI와 독립 리뷰는 새 PR head 기준으로 별도 보고한다.
