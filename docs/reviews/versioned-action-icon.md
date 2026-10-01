# #229 버전 경로 SeatBar 벨 검증

근거: spec FR-40·NF-03·NF-08, plan §3-2 #229 실행행. [Draft PR #230](https://github.com/kywoo26/p2p-gostop/pull/230), [이슈 역링크](https://github.com/kywoo26/p2p-gostop/issues/229#issuecomment-5922023121). 기준 main `a31353a13fbeac0f33a74fb8bde72236d5cff853`, 계획 `dd58c33ad4be49b96fbc1cbb71909ffd2382e044`, 제품 수정 `5e87329b65cd0901190697097d3f0ba09765790a`. 최종 source SHA·artifact hash·CI 결과는 PR 본문과 root 인계에서 확인한다.

## 원인과 범위

`SeatBar.svelte`의 `<img>`만 `/skin/bell-illustrated.webp`를 root 절대경로로 조합했다. StaticSite의 버전 prefix 자산 조회와 불일치한다. 기존 카드·라이선스 관례인 `import.meta.env.BASE_URL`을 적용했다. public 자산 바이트·CSS·서버 alias·이미지 품질·규칙·저장·의존성·예산 상한은 그대로다. 다른 CSS 경로 전체의 결함으로 일반화하지 않는다.

공식 API 확인: [Vite public base path](https://vite.dev/guide/build#public-base-path), [static assets](https://vite.dev/guide/assets), [Playwright Page](https://playwright.dev/docs/api/class-page), [Locator](https://playwright.dev/docs/api/class-locator). Context7 callable 도구가 없어 공식 원문을 직접 조회했다.

## 전후 관측

`W/e2e/versioned-action-icon.spec.ts`는 동일 dist를 root 또는 `/r/v0.0.1/<artifact-hash>/`에 제공한다. 버전 prefix 밖 벨 요청은 404를 반환한다. 합성 loopback LAN relay는 운영 설정·자격을 상속하지 않는다. 각 브라우저에서 host/guest가 정상 홈→로비→선 고르기→첫 판 손패10장까지 진행하며 손패 입력은 하지 않는다. 선 고르기 동률은 정상 UI로 다시 고르고, 모달 퇴장 transition 이후 가림을 관측한다.

| 소스·경로 | 이미지 표본 | SeatBar 응답 | naturalWidth | decode |
|---|---:|---:|---:|---|
| 수정 전 root | C/W × host/guest × 3 = 12 | 200 | 96 | 성공 |
| 수정 전 버전 | C/W × host/guest × 3 = 12 | 404 | 0 | EncodingError |
| 수정 후 root | C/W × host/guest × 3 = 12 | 200 | 96 | 성공 |
| 수정 후 버전 | C/W × host/guest × 3 = 12 | 200 | 96 | 성공 |

수정 전 테스트 결과는 root 6개 통과·버전 6개 실패(각 테스트가 두 좌석 관측), 수정 후 12개 모두 통과다. HTTP 응답은 SeatBar의 `currentSrc`와 같은 경로만 집계해 다른 행동 이미지와 혼동하지 않는다. 수정 후 24표본 모두 complete=true, 16×16 렌더, 이미지 가로 3지점 비가림, alt="", 부모 aria-hidden="true", 카운터 접근성 이름 `뻑 0회, 흔들기 0회`, 외부 HTTP/WS 요청0을 확인했다.

## 호스트 검증

Node 24.21.0/npm 11.19.0에서 새 checkout `npm ci` 수행. 필수 명령은 저장소 루트에서 실행한다. 아래 값은 환경변수이며 실행 전에 치환할 자리표시자가 아니다.

```sh
npm run lint
npm run check
npm test
npm run test:browser
npm run build -w packages/web
PLAYWRIGHT_PORT=4252 npm run e2e:smoke -w packages/web
android/gradlew -p android assembleDebug testDebugUnitTest lint --max-workers=4
```

lint/check PASS(svelte-check 오류·경고0), Node **563/36파일**, browser **894/94파일**, smoke **426 passed**(workers4, timing 직렬), Android 세 작업 PASS. 표적 실행은 같은 smoke 명령에 `-- --grep 'HTTP/decode' --project=chromium --project=webkit --workers=4 --no-deps`를 붙인다. 이 환경의 파일명 필터가 전체 테스트를 선택하는 현상 때문에 grep으로 대상12개를 확인했다.

전체 raw dist **1,572,446 B/75파일**, 상한 **1,572,864 B**, 여유 **418 B**. 기준 main 1,572,434 B에서 +12 B이며 상한은 올리지 않았다. 번들 외부 URL 검사0. 최종 head는 다시 빌드하고 raw 및 manifest를 root에 전달한다. 빌드 시간과 source SHA가 포함되므로 재빌드 hash는 같다고 가정하지 않는다.

## 남은 수용과 #228 인계

최종 CI와 독립 리뷰는 PR의 해당 source SHA로 확인한다. reviewer는 root가 배정하며 이 담당은 새 agent 생성·병합을 하지 않는다. Galaxy/iPhone·핫스팟 사람 실기기는 미검증이다. 자동 표본을 실기기 PASS로 기록하지 않는다.

#228은 이 BASE_URL 수정이 포함된 최종 dist를 격리 환경에서 재측정해야 한다. `version.json`의 wireVersion/hash와 합성 `/r/v0.0.1/<hash>/` 자료, 파일별 SHA-256 manifest 및 source SHA를 root 인계로 받는다. HTTP200/decode 회귀 성공은 첫 게임 전체 전송량·CPU/프레임 성능 또는 예산 개정 승인을 뜻하지 않는다. 운영 relay/Funnel/wrapper/secret/release clone 접근0. Refs #207 #228; 별도 계측 P2 항목은 이 제품 수정 범위에 포함하지 않는다.
