# R6: 시뮬레이션 집계와 보고서 분리

기준 main `24bf1e0`. 근거: spec AI-07·MN-03·NF-09, plan §1.3·§1.5, refactor-plan R6. #56 병합을 확인했고 #66·#67은 열린 이슈로 남아 있다. 시뮬레이터 공개 API와 수치는 유지하고, #151/#104 소유 영역 및 AI 가중치·머니 기본값·실험 결과 문서는 변경하지 않는다.

| 바꾸려는 것 | 수정할 파일 (`tools/sim/src/`) |
|---|---|
| 승률·분포·고/스톱 지표·파산 집계 | `stats.ts` |
| 제목·표·숫자/비율 표시·Markdown | `report.ts` |
| 인자·가중치 파일·stdout·JSON/Markdown 쓰기 | `cli.ts` |
| 워크스페이스 공개 이름 | `index.ts` (기존 toMarkdown 포함, 이름 유지) |

report는 Summary·Distribution·StopRate를 **타입으로만** 읽는다. 실행 시 import, 난수, 파일 I/O는 없다. stats는 report에 의존하지 않는다. 각 모듈을 구별하기 위해 별도 프레임워크나 새 의존성을 추가하지 않는다. 기존 계산 본문은 분리 전과 바이트 단위로 같다. formatter의 표현식·템플릿도 유지하며, 기존 린트 규칙에 맞춰 외부 변수를 쓰지 않는 side 표시 함수를 모듈 범위로 옮겼다.

## 동작 보존

리팩토링 전에 실제 CLI에서 생성한 golden 3쌍을 `tools/sim/test/fixtures/reporting/`에 고정했다. 같은 프로세스에서 만든 기대값과 비교하는 테스트가 아니라 커밋된 기준 파일과 매번 비교한다. 저장 JSON은 포맷터가 바이트를 다시 배치하지 않도록 `.json.txt` 확장자를 사용한다.

| 프리셋/모드 | 시드 | 판 수 / 세션 길이 | 시작 잔액 |
|---|---:|---|---|
| standard/match | 1 | 12 / 6 | 미지정 |
| traditional/session | 7 | 12 / 6 | 200 |
| arcade/session | 29 | 12 / 6 | 10,000 |

모두 random 대 easy, 워커 1, 시간 제한 없음, 파산 MC 1,000세션이다. 자식 프로세스에서만 performance.now를 0으로 고정해 시간 통계를 결정적으로 만든다. AI 강도·성능 측정 결과가 아니며 게임 규칙 정답은 기존 규칙 벡터가 검증한다. stdout과 저장 Markdown의 동일성, 고정 시드의 JSON 요약 및 Markdown 전체 바이트를 검사한다. INIT_CWD는 매번 다른 임시 디렉터리여서 호출 위치 기준 저장 경로도 함께 검증한다.

재현 명령(저장소 루트):

```sh
docker compose run --rm dev npm test -- tools/sim/test/report.test.ts
# 의도적인 출력 계약 변경 때만 --update 사용. 기존 formatter 기준 생성은 24bf1e0에서 수행.
git ls-files -co --exclude-standard tools/sim/src | docker compose run --rm -T dev node --input-type=module --eval "$(cat docs/research/codebase-audit.mjs.txt)"
wc -l tools/sim/src/{stats,report,cli,index}.ts
```

기준 formatter 재검증은 `24bf1e0` 체크아웃에 이 PR의 test/report.test.ts와 test/fixtures/reporting을 같은 경로로 복사한 뒤 `npm ci`와 위 테스트 명령을 수행한다. snapshot 업데이트 없이 동일한 golden을 검사한다. AST 계측 분모는 sim/src의 production 파일이며, 중첩 콜백을 포함하는 기존 감사 스크립트를 그대로 사용한다.

Context7 미제공에 따라 plan §0.1의 공식 문서 대체 경로를 사용했다: [Vitest 파일 snapshot](https://vitest.dev/guide/snapshot.html#file-snapshots), [Node execFileSync](https://nodejs.org/api/child_process.html#child_processexecfilesyncfile-args-options), [Node 파일 API](https://nodejs.org/api/fs.html). 자식 프로세스 실행은 shell을 사용하지 않고 인자 배열을 전달한다.

## 전후 계측·검증

모든 검증은 `docker compose run --rm dev <명령>`으로 실행했다. 아래는 `24bf1e0` 기준 전후 비교다. 검증 도중 병합된 #151(main `dd4e9e1`) 반영 뒤 결과는 별도로 기록한다.

| 항목 | 전 | 후 |
|---|---:|---:|
| stats.ts LOC | 484 | 388 |
| report.ts LOC | 없음 | 98 |
| 대상 production LOC (stats/report/cli/index) | 551 | 555 |
| sim/src 파일 수 / LOC | 8 / 1,144 | 9 / 1,148 |
| sim/src 함수 수 / 최대 길이(AST, 콜백 포함) | 113 / 114 | 113 / 114 |
| stats.ts 최대 함수 길이 | 85 | 58 (toMarkdown은 report로 이동, side 추출 후 83줄) |
| sim/src 파일 순환 / 패키지 순환 | 0 / 0 | 0 / 0 |
| sim→ai / sim→engine import 수 | 3 / 4 | 3 / 4 |
| CLI golden | 기준 코드에서 3쌍 생성 | 같은 3쌍 비교 |
| `npm run lint` / `npm run check` | 통과 | 통과 |
| `npm test` (벡터 227·fast-check 포함) | 519 | 522 |
| `npm run test:net -w packages/web` | 9 | 9 |
| `npm run test:browser` | 350 | 350 |
| `npm run build -w packages/web` | 통과 | 통과 |
| dist / 예산 1,536 KiB | 1,242.8 KiB | 1,242.8 KiB |
| `npm run e2e -w packages/web` | 108 pass / 18 skip | 108 pass / 18 skip |
| `android/gradlew -p android assembleDebug testDebugUnitTest lint` | 통과 | 통과 |

최종 main `dd4e9e1`(#151) 반영 후에도 lint·check·Node 522개·test:net 9개·브라우저 366개·웹 빌드·E2E 117 pass/19 skip·Android assembleDebug/testDebugUnitTest/lint가 모두 통과했다. 브라우저 +16개, E2E +9 pass/+1 skip, dist 1,247.5 KiB는 #151 반영 결과이며 R6 변경량에 포함하지 않는다.
