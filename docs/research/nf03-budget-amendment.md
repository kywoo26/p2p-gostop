# B207-2 예산 정의·gate — 정책 승인·병합, 전체 수용 미검증

NF-03·AC-07·NF-RP-06 / plan B207-2. [PR #228 승인 기록](https://github.com/kywoo26/p2p-gostop/pull/228#issuecomment-5924715804)·[#207 상태 기록](https://github.com/kywoo26/p2p-gostop/issues/207#issuecomment-5924731961)에 따라 사용자 승인 후 #228이 main `a735bb345e16891d34d1982aafe9f5c178ba44f5`에 병합됐다. 현행 규범은 초기 필수 encoded HTTP body **1,500,000 B** / 전체 raw **2,097,152 B**, 기존2초·100ms·60fps 유지다. 이는 실기기/성능·최종 #223/#225 누적·NF-03/AC-07 및 #207 전체 수용·출하 승인이 아니다.

아래는 [#227 실측과 안전한410 B 최적화](ui-bundle-budget.md)를 바탕으로 한 **당시 제안·계획·검증 기록**이다. 준비 기준 main `a31353a13fbeac0f33a74fb8bde72236d5cff853`의 당시 raw 한도1,572,864 B(1.5MiB), 최초 Draft 계획SHA `b72f9a48065192a421955e95822fb66af1c4783a`,4,213 B 초과·404 실패와 별도 #230 후보 관측은 그대로 보존한다. 아래 승인 전/Draft/main 표현은 당시 상태이며 현재 승인 상태를 뜻하지 않는다.

| 회계 | 당시 승인/main | 당시 제안(현재 정책 승인) | 판정 방법 |
|---|---|---|---|
| 초기 필수 HTTP response body | NF-03/AC-07에1.5MB, 실제 build gate는 전체 raw1.5MiB로 섞여 있음 | **1,500,000 B(decimal 1.5MB)** | cold 각 역할의 정상 진입→필수 초기 선택·분배 재생 완료→첫 합법 입력 가능까지 실제 serving encoded body. HTML·JS/동적 chunk·해당 경로에 필요한 worker·CSS·font·SVG/이미지 포함 |
| 전체 raw 웹 배포 | **1,572,864 B(1.5MiB)** | **2,097,152 B(2MiB)** | dist의 모든 파일 길이 합. license·metadata·숨김·지연 chunk·바이너리도 포함. 파일 제외 확대/압축 합계 대체/동적 예산 없음 |
| 시간·프레임 | 첫 로딩≤2초·응답≤100ms·60fps | **그대로** | body 크기나 build 완료로 증명하지 않음. 사람 입력/로비 대기·선 고르기 생각 시간과 앱 로딩 처리를 분리 |

MB=1,000,000 B, MiB=1,048,576 B. raw 후보는524,288 B 증가다. header·WS/HTTP protocol/TCP/TLS·무선 비용은 body와 별도 기록하고, cold 전체 세션 unique body·warm reload·후속 판 incremental body도 초기 필수 집합과 분리한다. Chromium 캐시 hit가 원 encodedBodySize를 계속 보고하는 경우 transferSize=0을 재전송량으로 오해하지 않는다. offline gzip/Brotli 합계는 실제 serving이 아니다. 새 숫자는 request 비용·JS parse/실행·image decode/memory/GPU·frame/input·전력이나 모든 향후 기능 충분성을 보장하지 않는다.

## 바이트 동일 gate A/B와 변경 경계

[기존 고정 UI 합성 artifact의 실제 A/B](bundle-budget-amendment/gate-ab.json)는 원 제품 파일을 바꾸지 않고 공개 gate script의 상수만 비교했다. 합성 source `8acab28614444211c71b04ed7ad559660fe81165`(#218+고정 #223 `8ccc9b9`+#225 `a3acbb8`)와 #227 metadata 최적화의 artifact다. version/hash를 현행 StaticSite가 검증하는 같은 파일을 읽었고, 두 gate 실행 전후 raw/hash는 모두 동일했다.

| 같은 artifact | raw | 한도 | 여유 | 실제 CLI exit |
|---|---:|---:|---:|---:|
| 승인/main gate | **1,577,077 B** | 1,572,864 | **−4,213 B** | 1, 실패 |
| Draft 제안 gate | **1,577,077 B** | 2,097,152 | **520,075 B** | 0, 제안 검사 통과 |

제안 통과는 제품 통합 승인/출하가 아니며 **기존4,213 B 초과 실패를 덮어쓰지 않는다**. 520,075 B 여유는 현재 artifact 대비 약33%의 공간이며 미래 요구를 모두 담는다는 증명이 아니다. image/font/card/CSS/문구/ARIA/규칙/wire/저장/제품 guard는 변경하지 않았다. `check-bundle.mjs`는 고정 상수1.5→2MiB만 바꾸고 외부 URL guard·기존 평가 팩 경계를 유지한다. CLI 경계2MiB−1/정확/초과와 metadata·고지·숨김·지연 chunk·바이너리의 전체 회계, 외부 URL 반례4검사가 통과했다. font160KiB·skin128KiB 등 하위 예산은 그대로다.

`ui-spec` 앱 전체 row와 plan의 활성 PA-05/AC-07 참조만 제안에 맞춰 정리한다. 2026-09-29 PA/시각 방향 배분, B207-1 과거 gate 실패/manifest, #197/#227 연구 수치는 **그때 규범·관측의 역사 기록**으로 보존한다. 오래된 측정의1.5MiB 숫자를2MiB 성공 기록으로 치환하지 않는다. skin 제작 script의128KiB assert는 그대로이며 오류 문구의 전체 gate 참조만 분리한다.

## 실제 제품 첫 게임 요청과 남은 제한

B207-1의 guest 입력/fonts까지747,451 B는 첫 게임보다 앞선 하위 endpoint다. 이번에는 기존 LAN E2E의 실제 홈→방 열기→guest 이름/입장→로비→시작→초기 선 고르기→게임판 흐름을 private loopback **현행 StaticSite**와 개발 LAN relay fixture로 실행한다. 운영 relay/Funnel/Docker/secret/release clone은 사용하지 않는다. 시험 컨텍스트에서만 고정 entropy host101/guest201로 합법 셔플·초기 선 고르기를 재현하며 token·이름·WS payload·초대 URL은 출력하지 않는다. 실제 제품 버튼만 누르고 앱/엔진을 바꾸거나 ready를 주입하지 않는다. speed=instant는 기존 E2E 옵션이며 성능2초/100ms/60fps 측정은 아니다. routing으로 cache를 끄지 않고 loopback 외 연결은 도달 불가 proxy로 제한한다.

최초 고정 누적 artifact의 실제 versioned release 경로에서는 **필수 행동 그림 `/skin/bell-illustrated.webp`가404**이며 이미지 naturalWidth0/decode 실패가 관측됐다. UI의 root-absolute skin URL과 versioned StaticSite 경계가 맞지 않는다. 이 PR에서 UI를 바꾸거나 서버 root alias를 붙여 성공으로 만들지 않는다. 이 최초 관측의 첫 게임 전체 필수 자산 완료·warm 게임 reload·한 판 추가 계측은 **미완**으로 보존한다. 부분 요청 body는 성공한 요청의 관측값일 뿐 첫 필수 전송 budget PASS가 아니다. Android root asset serving과 이 versioned 경로를 같은 관측으로 쓰지 않는다.

[실제 paired3회×역할 교체3회 관측](bundle-budget-amendment/first-game-attempt.json)은 두 엔진·각 역할3표본씩이며 전부 필수 decode 실패로completeReady=false다. 손패10장·초기 선 고르기 없음·권위 seq3·실제 한쪽canAct=true의 첫 판에서 손패 입력 전에 기록했다. HTTP 응답은 모두identity다. 전체 완료된 첫 게임 전송량이라고 쓰지 않는 부분 관측은 아래와 같다.

| 역할/엔진(각3회 동일) | 실제 HTTP response 수 | timing 기반 unique encoded body B | 판정 |
|---|---:|---:|---|
| host Chromium | 29 | 1,058,941 | 필수 그림404/decode 실패, 수용 미달 |
| host WebKit | 29 | 1,058,946 | 같은 실패 |
| guest Chromium | 24 | 972,099 | 같은 실패 |
| guest WebKit | 24 | 972,104 | 같은 실패 |

이 합법 P2P 경로의 HTTP 집합에는 카드/font가 있지만 AI worker는 없다. 솔로 worker 초기 요청 비용·후속 전체 판·warm game cache 수용을0으로 추정하지 않는다. 실패 뒤 추가 판을 진행하지 않아 후속/warm 수치는 생성하지 않았다.

측정 도구는 해당 자산 실패를 데이터의 completeReady=false와HTTP404로 남기고 exit1로 실패시킨다. 처음 합법 입력 endpoint 이전에는 초기 pickFirst만 선택하고 손패를 자동 플레이하지 않는다. 통과할 제품 checkpoint에서는 그 뒤 한 판을 실제 합법 버튼으로 진행해 다음 판/guest warm reload를 수집하도록 준비돼 있다. 이번 실패를 우회하거나 worker/후속 요청 비용을 추정하지 않는다. P2P에서 AI worker가 요청되지 않았더라도 솔로 첫 worker 수용이0 B라는 뜻이 아니다.

## 독립 리뷰 계측 수정과 별도 #230 후보 재관측

[독립 리뷰5373399266](https://github.com/kywoo26/p2p-gostop/pull/228#pullrequestreview-5373399266)의 네 반례를 수정했다. 최초 endpoint는 두 좌석의 손패10장·초기 선택 종료와 실제 활성 좌석의 Board `data-busy=false`·보이는 합법 손패 버튼 활성까지 기다린다. 상대 좌석의 입력 잠금은 풀지 않는다. 필수 HTTP 상태/requestfailed/미완 요청, font face error/loading, 이미지 decode와 응답별 timing 누락도 완료를 막는다. HTTP404와 requestfailed는 구분한다. `document.fonts.ready`만으로 실패 font를 성공 취급하지 않는다.

실제 body 합은 phase의 **응답별** Resource Timing entry에서 network(`transferSize>0`) encoded body를 모두 더한다. query를 포함한 요청 URL은 내부에서만 식별하고 보고서에는 trial 안의 익명 `urlId`와 공개 pathname만 쓴다. HTTP에 전송되지 않는 fragment는 식별에서 제외한다. query별 응답·같은 URL 재전송을 모두 센 network 합과, 같은 URL 최대 관측 body를1개만 세는 unique 자산 합, cache/local(`transferSize=0`) 관측을 별도 필드로 기록한다. cache의 encodedBodySize와 Playwright received body 관측을 실제 재전송 합으로 쓰지 않는다. 각 phase의 timeOrigin/startTime baseline을 두고 후속 판에서 옛 navigation을 제외하며 reload의 새 navigation은 포함한다. timing이 없는 응답을0 B로 수용하지 않는다. 실패 trial은 익명 예외 종류·도달 phase·부분 표본을 저장하며 overall complete=false/exit1이다. 시작부터 새 보고서를 써 기존 성공 파일을 남기지 않는다.

| 합성 반례(Chromium/WebKit 각각 동일) | 수정 전 동작 | 수정 후 |
|---|---|---|
| canAct=true/hand10/선택 DOM 없음/busy/손패 enabled0/CSS404 | 완료 true | endpoint false·필수 HTTP 실패 기록 |
| no-store 800,000 B query2개+동일 URL 재전송1개 | pathname unique800,000 B | 실제 응답 합2,400,000 B·unique1,600,000 B |
| 추가 요청0의 후속 phase | 옛 HTML526 B 재계수 | 0건/0 B; reload 새 HTML은 포함 |
| navigation 예외 | 최종 write0회 | write1회·익명 실패/부분 표본·complete=false |

이것은 계측 결함의 합성 회귀이며 실제 게임 성공/성능 자료가 아니다. 직접 Node 경계5검사와 양 엔진 브라우저 반례/정상 endpoint 검사를 통과했다. `node --test packages/web/scripts/game-transfer-probe.test.mjs`는 build에도 포함된다. `node --test packages/web/scripts/game-transfer-probe.browser.mjs`는 loopback4250을 전용으로 쓰므로 실제 fixture를 종료한 뒤 실행한다.

이후 별도 #230 고정 후보 source **294e150cfe8d715ec7c4f1a0ca366670376c1b58**의 읽기 전용 artifact를 현행 StaticSite/개발 relay에서 재관측했다. manifest SHA-256 **cd91526360e15076f37db745041a8f937e31acff447c2d7089145dd43b113049**,75파일/raw **1,572,446 B**, wire3/version hash **9128a67ee6eb64af54ab8485f3577591986f077af245411248fcf7222b9eec72**다. **main218+227+230 후보이고 #223/#225 누적 artifact가 아니다.** 기존 누적1,577,077 B/4,213 B 초과 A/B와404 자료는 그대로 보존한다. #230 제품/자산을 이 PR에서 편집하거나 서버 alias를 붙이지 않았다. #230은 exact-head CI·독립 리뷰 후 main `36f59d401f5e4ead6169bad5db369fd9289fc726`에 병합됐다. 이 측정은 그 고정 source artifact의 관측이며 #228 예산 개정/전체 누적/출하 승인은 아니다.

[재관측 자료](bundle-budget-amendment/first-game-294e150.json)는 paired6회·30표본(첫게임12/한판추가12/warm guest6)이며 양 엔진·각 역할3회다. 모든 필수 HTTP/font/image가 성공했고 첫 입력 전 active손패10버튼 활성/Board busyfalse·seq3, 추가판 seq96·rounds1을 관측했다. 보고서 complete=true는 이 desktop fixture의 계측 완료이며 요구사항/사용자 승인/실기기 PASS가 아니다. 모든 응답 Content-Encoding은identity다.

| phase·역할 | 각 엔진의 실제 response 수 | network encoded body B | unique body B | 조건 |
|---|---:|---:|---:|---|
| cold 첫게임 host | 29 | **1,057,068** | 1,057,068 | Chromium/WebKit 각3회 동일 |
| cold 첫게임 guest | 24 | **970,226** | 970,226 | Chromium/WebKit 각3회 동일 |
| 한판 진행→다음판 host | 26 | **312,713** | 312,713 | 새 카드 등 후속 요청, 옛 HTML 제외 |
| 한판 진행→다음판 guest | 25 | **279,044** | 279,044 | 같은 phase의 새 요청만 |
| warm reload guest Chromium | 24 | **660** | 660 | cache/local23건, 원 encoded 관측951,399 B는 network 합 아님 |
| warm reload guest WebKit | 23 | **660** | 660 | cache/local22건, encoded 관측0 B도 자산 부재/후속 비용0 증거 아님 |

카드/font 포함이고 P2P 경로에서 worker를 요청하지 않았다. 솔로 worker·전체 기능 누적·다른 셔플·장기 세션·배포 서버의 압축/cache·실기기/핫스팟·2초/100ms/60fps는 여전히 미검증이다. 후보의 첫 body가1,500,000 B 아래라는 관측은 이 경로에 한정하며 규범 상향 적용 권한이 아니다.

## 당시 사용자 승인 전에 필요한 판단

B207-1은 **대상 서버/기기/핫스팟 baseline·사람 최소3회·독립 리뷰 후 규범 결정**을 추천했다. 이번 Draft의 자동/desktop 근거는 그 사람 관측을 대신하지 않는다. Galaxy WebView·iPhone Safari cold 첫 게임, 원격/Funnel 실제 responseEncoding/cache·첫 paint·100ms·60fps·JS/decode/memory/전력과 전체 후속 세션은 아직 검증하지 않았다. 필수 이미지 경로의 별도 #230 후보 로컬 재관측은 위와 같으며 제품 독립 리뷰/통합 및 최종 누적/실기기 수용은 남아 있다.

승인 옵션의 장점은 동일 시각 품질/문구/접근성을 보존하고 실제4213 B raw 통합 차단과 최초 전송 회계를 분리하는 것이다. 단점은 전체 배포 한도가33% 증가하며 더 큰 코드의 parse/메모리/프레임·첫 게임 전송이 자동 개선되지 않는다는 것이다. 승인 보류 시 main1.5MiB와 기존 기능 PR budget 차단을 유지하고 추가 품질 보존 절감/serving baseline을 진행한다.

**최종 사용자 결정 대상:** 초기 필수 encoded HTTP body1,500,000 B와 전체 raw2,097,152 B의 분리·spec/plan/ui-spec/gate 제안 diff를, 위 실기기/첫 게임/프레임 미검증 및 별도 출하 수용 조건을 유지하면서 승인할지 결정한다. 미관측이 해소되기 전 승인한다면 그것은 숫자/정의 정책 승인만이며 NF-03/AC-07 전체 수용·기능 PR 병합·v0.4.0 출시 승인이 아니다. 승인 대기 중에는 Draft 해제/merge/tag/release 또는 다른 PR의 cap 우회를 하지 않는다.

## 당시 재현·검증

계획→제안 diff→검증을 고정한다. 새 checkout에서 `nvm use`/`npm ci` 후 표준 PR 필수 검사를 실행한다. `node --test packages/web/scripts/check-bundle.test.mjs`는 fixture만 생성하며 main artifact를 바꾸지 않는다. main gate 값은 `git show a31353a13fbeac0f33a74fb8bde72236d5cff853:packages/web/scripts/check-bundle.mjs`의1.5MiB로 별도 확인한다. 같은 불변 UI artifact에 old/proposed script를 별도 임시 디렉터리에서 읽기 전용으로 적용한 정확 결과가 위 A/B다.

첫 게임 probe는 B207-1 문서의 private StaticSite fixture와 기존 LAN E2E 개발 relay에만 실행한다. 환경변수 `ARTIFACT_PATH`는 fixture가 출력한 artifact 경로, `TEST_RELAY_PORT`는 개발 시험 relay의 loopback 포트로 사용자가 설정한다. 운영 값·실제 초대 URL을 넣지 않는다.

```sh
node packages/web/scripts/measure-game-transfer.mjs "http://127.0.0.1:4250${ARTIFACT_PATH}" "${TEST_RELAY_PORT}" /tmp/first-game.json
```

로컬: Node563/browser894, source build raw1,572,434 B, Android3작업 통과. lint/privacy/check·PR smoke414(workers2)·경계4검사도 통과했다. hosted exact-head CI·독립 리뷰는 게시 head 기준으로 보고한다. 제안 한도로 기본 build/CI가 통과하더라도 현재 main 규범/전체 UI 수용 상태와 구분한다.
