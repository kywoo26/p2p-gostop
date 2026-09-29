# R4: 웹 호스트 세션 책임 분리

기준: main `1287e7f`(#100 포함). 근거: spec NP-03·NP-06·MN-05, plan §1.3·§1.4, `docs/refactor-plan.md` R4. 이 PR은 R4 중 웹 호스트를 다룬다. protocol HostSession 내부의 추가 분해는 별도 작업이다.

| 수정할 책임 | 위치 |
|---|---|
| 반응형 상태, 세션 생명주기, 재접속·이벤트 조율 | `packages/web/src/p2p/host.svelte.ts` |
| 좌석 0 화면·정산·비공개 이벤트 투영 | `host-view.ts` |
| v2 저장 envelope, rev/seq 중복 방지, 실패 재시도 | `host-save.ts` |
| 세션별 Transport 구독 창구 | `session-port.ts` |

기존 host 모듈의 타입·저장 함수 export 경로, `gostop.host.v2`, 프로토콜 상태 v1, 스케줄링 순서와 저장 실패 정책은 유지한다. controller·UI·Game 화면은 변경하지 않는다. 전체 줄 수 감소가 아니라 책임을 찾는 경계를 만드는 작업이다.

## 전후 검증

모든 명령은 저장소 루트에서 `docker compose run --rm dev <명령>`으로 실행했다. 첫 설치는 `npm ci`.

| 검사 | 기준 | 변경 후 |
|---|---:|---:|
| `npm run lint`, `npm run check` | 통과 | 통과 |
| `npm test` (규칙 벡터 227개·fast-check 포함) | 519 | 519 |
| `npm run test:net -w packages/web` | 9 | 9 |
| `npm run test:browser` (Chromium·WebKit 합계) | 298 | 306 |
| `npm run build -w packages/web` | 통과 | 통과 |
| `npm run e2e -w packages/web` | 106 통과 / 6 skip | 106 통과 / 6 skip |
| `android/gradlew -p android assembleDebug testDebugUnitTest lint` | 통과 | 통과 |
| host.svelte.ts LOC (`wc -l`) | 742 | 606 |
| 대상 production 합계 LOC | 742 | 780 (606+70+72+32) |

추가한 `host-save.test.ts`만 기준 코드에서도 먼저 실행해 8/8 통과했다: `npm run test:browser -w packages/web -- src/p2p/host-save.test.ts`. 새로운 기대값으로 이전 동작을 바꾸지 않았음을 확인한다.

## 저장 fixture

`p2p/fixtures/host-v2-{legacy-settled,push-decision}.json`은 기준 커밋의 실제 HostSession/GuestSession을 MemoryTransport로 연결해 만든 합성 저장이다. seed 바이트는 모두 1, 점당 100, 시작 잔액 1,000,000, standard/arcade 프리셋에서 합법 수 중 stop 우선·그 외 첫 수를 실행했다. seq 105, 첫 판 승자 좌석 0에서 저장했다. 실기기에서 수집한 결과는 아니다.

legacy-settled는 이전 v2의 선택 필드 `pushes`·`lastAbort`를 생략했다. 기존 프로토콜 복원이 이를 0/null로 보완하고 rev를 한 번 올리는지 검사한다. push-decision은 아직 정산하지 않은 밀기/받기 대기를 보존한다. 두 fixture 모두 복원·재저장 시 원장/기록 중복 반영이 없음을 검사한다. 추가로 quota 실패 뒤 재시도, 성공 후 중복 쓰기 생략, 미지원 envelope 버전 거부를 검사한다.

Context7이 제공되지 않아 plan §0.1의 공식 문서 대체 경로를 사용했다: [Svelte $state](https://svelte.dev/docs/svelte/$state). 반응형 필드는 기존 클래스에 남기고 순수 투영과 비반응형 저장 캐시만 분리했다.
