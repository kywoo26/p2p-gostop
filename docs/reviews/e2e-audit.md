# E2E 감사 (AC-04·05·06 / plan M3·§4)

대상: `a714e30`, 2026-09-30. [CI 36609433392](https://github.com/kywoo26/p2p-gostop/actions/runs/36609433392) 로그의 개별 시간(반올림값)을 집계했다. CI는 **300 통과·20 skip, 7.8분**이다. 아래 시간은 병렬 테스트 시간의 합으로 벽시계와 다르다. C=Chromium, W=WebKit.

| spec (`.spec.ts`) | 기존 전개 수 | CI 합계 초 | 지키는 계약 | 판정 / PR 실행 수 |
|---|---:|---:|---|---|
| auto-choices | 5×2=10 | 13.1 | FR-15·16·46~50, UX-10·24 | 저장·메뉴·실제 relay 연결은 단위와 다름; 솔로 C, 혼합 브라우저 1회 / 5 |
| cards | (1+3 DPR+1)×2=10 | 26.1 | NF-01·03·07·08, UX-12·14 | map 컴포넌트와 일부 중복이나 dist SVG·SVGO 재현은 고유; 요청 전용만 C / 9 |
| fonts | (4뷰포트+고지)×2=10 | 6.8 | NF-01·07·08, VD-04, UX-11·13 | 글꼴 로딩·숫자·대비는 폭에 독립; PR 최소 폭 1개, full 4개 / 4 |
| gallery | 16×2=32 | 63.7 | AC-05, NF-08, UX-11~14 | 픽셀·axe 유지; W는 카드·게임판·정산·게스트 / 25 |
| hand-feedback | (4×2상태+4×2묶음)×2=32 | 57.5 | FR-40·46~50, UX-06·14 | 4폭×2엔진 손패 노출/가림 고유 / 32 |
| hand-input | 3×2=6 | 5.1 | FR-12·16, UX-10·22·24 | Board.input과 입력 계약 일부 중복, 실제 저장까지 연결하므로 유지; 솔로 C / 3 |
| hud | 4×2=8 | 11.2 | FR-40, UX-04·12·24 | Board.hud와 기하 중복, 최종 CSS 대비·axe·실제 메뉴 연결은 고유; 솔로 메뉴 C / 7 |
| layout | (4×14상태+2)×2=116 | 109.9 | NF-08, UX-01~09·13 | 4뷰포트×2엔진 모두 유지; 안전 영역·실제 hit-test·확대 / 116 |
| navigation | 7×2=14 | 28.2 | MN-05, NF-05, UX-24 | Android Back·솔로 저장·설정 왕복 C / 7 |
| p2p-screens | 4×2=8 | 7.7 | FR-04·05, NP-01, NF-01, AC-05 | 비보안 origin·게스트·로비 W 유지, 호스트 진입 C / 7 |
| p2p | 3×2=6 | 55.2 | AC-04, MN-01, FR-51~53, NP-03·10 | 기존부터 직접 브라우저 실행; W 프로젝트 3건은 skip 중복 / 3 |
| pro-assets-release | 1×2=2 | 1.0 | PA-01, NF-07 | 기본 번들 평가 자산 배제 C / 1 |
| pro-assets | (4+2)×2=12 | 0 | PA-03·04, NF-01·08 | 명시적 평가 빌드 전용, full 유지 / 0 |
| push | 7×2=14 | 40.1 | FR-14·16·18, MN-01·05, NP-03 | session-push와 계산 중복이나 Worker·저장·실제 relay 검증은 고유 / 7 |
| reconnect | 2×2=4 | 13.5 | FR-07, NP-03, NF-05·06 | 혼합 브라우저 1회씩; 응답 유실은 PR에서도 전용 직렬 프로젝트 / 2 |
| settings-rules | 6×2=12 | 18.5 | FR-21·24·46~50, MN-04 | 솔로·호스트 C, welcome 전파·프리셋 W 유지 / 8 |
| settlement-layout | 4×2=8 | 50.7 | FR-14·18, UX-09·11 | 장문·고정 버튼·내부 스크롤 기하, 4뷰포트 모두 필요 / 8 |
| smoke | 4×2=8 | 5.4 | NF-01·07, FR-31, §6.2·6.6 | 홈 메뉴 1개 삭제(Home.test 존재); 빌드 식별자는 남은 홈→라이선스 경로로 이동 / 3 |
| solo | (2기능+2계측)×2=8 | 204.9 | AC-04·06, MN-01·04·05, FR-15·19, UX-15 | 기능 2개+빠름 계측 C 유지; 나머지 계측 full / 3 |

**삭제 1개 정의(2회), 신규 강등 0개**. `packages/web/src/routes/Home.test.ts`의 메뉴 검증은 양 엔진에서 유지하고, 배포 빌드 식별자는 홈→라이선스 E2E에 보존했다. full 318건은 이 삭제 외 기존 시나리오·엔진·뷰포트·기준 이미지를 보존한다. PR 250건은 추가 68건 제외: 엔진 반복47(기존 skip8 포함) + 폰트 추가 폭6 + 계측3 + 평가 빌드 skip12.

| 판단 | 유지 범위·근거 |
|---|---|
| 태그/프로젝트 | `@smoke` 진입·라우팅, `@guest` 게스트, `@layout` 기하, `@visual` 픽셀/시각, `@fonts` 폰트, `@paired` 자체 브라우저 실행, `@full` full 전용. PR C는 full 전용 외 전체, W는 guest/layout/fonts이며 paired 제외. 새 무태그 기능도 C에서 실행 |
| 스크린샷 가치/비용 | gallery CI 합63.7초. DOM 검사로 대체 불가하므로 C 전량·W 게스트/게임판 유지; W 호스트 메뉴는 full AC-05. layout PNG는 이미 14상태 중 2상태만 비교. 기준 PNG/ARIA 변경 없음 |
| AC-06 / #145 | **PR에도 빠름 C 1건 유지**(CI 28.8초): p50≤700ms·두 번째 최대≤900ms. 보통 C 47.9초·빠름 W 43초·보통 W 약60초는 full 전용. 3경로·워밍업·표본7·임계값·hosted W 기록 정책 그대로. 모든 timing은 일반 프로젝트 종료 후1 worker, full W는 C 뒤 실행 |
| P0 커버리지 | P2P 20판·재접속 AC-04(CI 36초), 솔로20판·원장, FR-07/NF-06 연결 교체, FR-10~14·18 공유 UI, NF-08 및 AC-06 엄격 빠름을 PR에 보존. 삭제 메뉴는 Home.test로 유지. 기존 자동화가 지키던 P0 손실0이며 미완 실기기/AI 요구가 완료됐다는 뜻은 아님; plan §3-2 상태 불변 |
| 예상 비용 | 기존 CI 선택 테스트 합 약476초. 일반 병렬 구간+직렬 계측으로 로컬4 workers 2~3분 목표. 2-worker 단독 CI에서 3분 보장 불가; ci/e2e-speed 샤딩 후 CI 실측 필요 |

| 호스트 네이티브, 4 workers·재시도0 | 통과 | skip | 벽시계(빌드 포함) |
|---|---:|---:|---:|
| 변경 전 full | 300 | 20 | 243.9초 |
| 변경 후 smoke | 250 | 0 | 104.2초 |
| 변경 후 full | 298 | 20 | 225.6초 |
| main 병합 후 smoke | 250 | 0 | 84.8초 |
| main 병합 후 full | 298 | 20 | 227.0초 |

공식 API는 [Context7 Playwright 문서](https://context7.com/microsoft/playwright)(tags/grep/projects/dependencies)를 조회했다. 최초 전후 비교는 `a714e30`, 재검증은 main `db20cd7` 앱 코드 및 `b9bd84b` CI 병합 후다. 실행 결과는 각각 1회, 로컬 `--reporter=json` stats 기준이며 실패·재시도0이다. smoke는 기존 대비57.3% 단축; full의 작은 시간 차이는 실행 편차를 포함한다. `npm ci`, `npm run lint:fix`, `npm run lint`, `npm run check`, `npm test`(563), `npm run test:browser`(main 병합 후640), `npm run test:net -w packages/web`(35), `npm run build -w packages/web`, `android/gradlew -p android assembleDebug testDebugUnitTest lint --max-workers=4` 모두 통과. #181(`b9bd84b`) 병합 후 CI 일반/timing 단계에 이벤트별 스크립트를 연결했다. PR의 W timing은 제외하고 main 푸시도 full을 실행한다. 엔진 필터·캐시는 #181 그대로다. PR은 `npm run e2e:smoke -w packages/web`, main 푸시·수동·릴리스 전은 `npm run e2e -w packages/web`(full); 루트 별칭도 같다.
