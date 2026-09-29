# R5: 솔로 저장 스키마와 복원 경계

기준: main `1287e7f`(#100). spec MN-05·NF-05·FR-18, plan §1.3·§1.4·§1.8, `docs/refactor-plan.md` R5. #100 이후 사용자가 game/p2p 소유권을 해제하고 재지시한 범위다. controller·UI·Game 화면·PromptPanel은 수정하지 않는다.

## 변경 지점 지도

| 책임 | 파일 (`packages/web/src/` 기준) |
|---|---|
| 순수 판 진행·원장·재충전 | `game/session.ts` |
| 버전 분기, v0 보완, 검증 후 반환 | `storage/session-save.ts` |
| 저장된 게임판·좌석·입력의 구조 | `storage/session-game-schema.ts` |
| v1 세션·기록·원장, 필드 사이 정합성 | `storage/session-schema.ts` |
| 솔로 envelope 버전·난이도, 이어하기 오류 분류 | `storage/solo-save.ts` |
| JSON 읽기 결과(없음/오류/값), 쓰기·삭제 | `storage/local.ts` |

`game/session.ts`의 parseSession과 `game/solo.svelte.ts`의 SoloSave·loadResult 공개 경로는 유지한다. 스키마가 모델을 런타임 import하지 않으므로 재수출로 실행 순환을 만들지 않는다. 모델 타입과 저장 입력의 허용 범위를 무리하게 같게 만들지 않는다.

## 호환 정책

| 입력 | 기존 정책을 그대로 적용 |
|---|---|
| 솔로 envelope | v0/v1 수용, 반환 v1, 키 `gostop.solo.v1` 유지 |
| 세션 v0 | 원장 잔액 합이 초기 잔액×2일 때만 refilled=[0,0], 없는 roundStart=잔액 보완 |
| 세션 v1 | 필수 필드와 잔액 합·설정/원장·설정/게임 규칙·판 번호 정합성 검사 |
| 알 수 없는 버전·손상 | 복원 거부, 원본 저장은 삭제하지 않음 |
| 추가 필드 | 검증 후 원본 반환으로 보존; v1 객체 참조도 유지 |
| 규칙 옵션 | #88의 PRESETS별 typeof 정책 유지. 새 enum/범위 제한을 추가하지 않음 |
| 미저장/접근 거부/깨진 JSON/null/envelope/난이도 오류 | 기존 구분·문구·검사 우선순위 유지 |
| 호스트·게스트·설정 저장 | 기존 readJson 계약(실패 시 null) 유지; 각 저장 형식 변경 없음 |

기존 wire 스키마는 저장본과 수용 범위가 다르므로 강제로 재사용하지 않는다. 새 형식이나 규칙 검증 강화는 별도 버전/마이그레이션 검토 대상이다. 현재 저장 형식이 같으므로 버전을 올리지 않았다.

zod는 protocol이 이미 쓰는 4.6.5를 web의 직접 의존성으로 명시했다. 도입 근거를 먼저 plan §1.8에 기록했다. Context7 미제공에 따라 plan §0.1 대체 절차로 [공식 mini 문서](https://zod.dev/packages/mini)와 [API 문서](https://zod.dev/api)를 확인했다. safeParse·object·tuple·discriminatedUnion·check/refine을 쓰며 파싱 출력으로 원본을 정규화하지 않는다.

## fixture와 판정 비교

`storage/fixtures/`의 5개 JSON은 기준 코드에서 생성한 합성 저장이다(실기기 결과 아님). 시드 1234, 점당 100, 이름 나/컴퓨터, 난이도 normal. standard/arcade에서 합법 수 중 stop 우선·그 외 첫 수를 선택했다.

| fixture | 조건/검사 |
|---|---|
| solo-v0-balanced | standard, 초기 잔액 1,000,000; refilled·roundStart 없는 v0 보완 |
| solo-v1-playing | standard, 선 고르기 뒤 진행 상태·시드 보존 |
| solo-v1-push-decision | arcade, 정산 보류 상태; 받기 한 번만 원장 반영 |
| solo-v1-pushed | arcade, 밀기 완료; 다음 판의 pushes=1·기록·원장 보존 |
| solo-v1-refilled | standard, 초기 잔액 100에서 파산 뒤 재충전; 잔액 보존 |

22개 검사×두 브라우저=44개를 변경 전 파서·SoloSession에서도 먼저 통과시켰다. fixture 왕복 외에 v0 잔액 불일치, 필수 하위 필드 삭제, 추가 필드, 미지원 버전, 오류 문구·원본 보존, 접근 거부·quota 실패를 검사한다.

`session-storage-probes.mjs.txt`는 각 fixture의 객체 필드와 배열 첫 원소를 재귀 순회해 삭제/null/잘못된 타입/경계 수치로 바꾸고, 실제 저장처럼 JSON 왕복한 입력을 검사한다. 추가 필드 보존도 포함한다. 수용/거부뿐 아니라 반환 JSON과 순서까지 해시한다. **모든 가능한 입력의 동등성 증명은 아니며, 배열의 모든 위치·변이 조합을 열거하지 않는다.** JSON으로 표현할 수 없는 sparse 배열·함수·순환 객체는 저장 계약 밖이다.

전후 동일 결과:

```json
{"total":10397,"accepted":894,"rejected":9503,"sha256":"c6d20ee78102af176f2a9545d2d54641a38337e5e195a1573477b429bb23fec8"}
```

현재 브랜치에서 재현:

```sh
npm ci
node --input-type=module < docs/research/session-storage-probes.mjs.txt
npm run test:browser -w packages/web -- src/storage/session-save.test.ts
wc -l packages/web/src/game/session.ts packages/web/src/game/solo.svelte.ts packages/web/src/storage/{local,session-game-schema,session-schema,session-save,solo-save}.ts
```

기준 코드는 `git worktree add --detach /tmp/gostop-r5-before 1287e7f`로 마련하고, 이 PR의 fixture 디렉터리·session-save.test.ts·probe 파일만 동일 상대 경로로 복사한 뒤 그 루트에서 위 명령을 실행한다. 기준 파일의 LOC는 `git show 1287e7f:<경로> | wc -l`로 계산한다.

## 전체 검증

모두 저장소 루트의 `docker compose run --rm dev <명령>`으로 실행했다.

| 검사/계측 | 기준 | 변경 후 |
|---|---:|---:|
| `npm run lint` / `npm run check` | 통과 | 통과 |
| `npm test` (규칙 벡터 227개·fast-check 포함) | 519 | 519 |
| `npm run test:net -w packages/web` | 9 | 9 |
| `npm run test:browser` | 298 | 342 |
| `npm run build -w packages/web` | 통과 | 통과 |
| dist 크기 / 예산 1,536 KiB | 1,195.3 KiB | 1,196.6 KiB |
| `npm run e2e -w packages/web` | 106 통과 / 6 skip | 106 통과 / 6 skip |
| `android/gradlew -p android assembleDebug testDebugUnitTest lint` | 통과 | 통과 |
| session.ts LOC | 647 | 265 |
| solo.svelte.ts LOC | 410 | 383 |
| 대상 production LOC 합계 | 1,117 (647+410+60) | 1,078 (265+383+74+154+126+40+36) |

두 브라우저 E2E의 이어하기·재접속·밀기/받기·다음 판·원장 시나리오와 별도 시간 계측을 포함한다. skip 수는 기준과 같다. UI·폰트 자산은 변경하지 않았다.
