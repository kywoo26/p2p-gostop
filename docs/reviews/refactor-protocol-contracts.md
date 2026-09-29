# R3a 프로토콜 스키마·타입 정합

근거: `spec.md` NP-02·NP-04·NP-06, FR-21/24; `plan.md` §1.3/1.4/1.6, 리팩토링 계획 R3a/RF-03·04. 기준 `7cb06f3`(#91·#93 병합). 엔진 도메인 타입과 wire 검증의 소유권을 유지하면서 스키마의 추론 결과를 공개 계약과 대조한다.

## 발견과 변경

`month`는 `z.number().check(z.int(), z.minimum(1), z.maximum(12))`라 런타임에서는 1~12만 허용하지만 추론 결과는 `number`였다. 실제 타입 정합 검사를 먼저 추가하자 게스트·호스트 두 검사 모두 TS 7에서 실패했다. 동일한 숫자 집합의 `z.literal([1, …, 12])`로 바꾸면 두 검사가 통과한다. 성공 출력·MALFORMED 판정·미지 필드 제거는 유지한다. 공개 exports나 메시지 타입의 변경은 없다.

| 검사 대상 | 보장 / 남는 경계 |
|---|---|
| GuestMessage 10종 전체 | 스키마 출력과 공개 타입을 `t`별로 대조. 필드 추가·누락, 리터럴, optional, 배열/튜플 모양 검사 |
| HostMessage 13종 | 아래 세 경계를 명시적으로 분리하고 나머지는 같은 방식으로 대조 |
| welcome.rules | 현재 record(string, unknown). 타입 검사도 이 실제 느슨한 모양을 확인하며 RuleOptions 검증을 완료했다고 주장하지 않음 |
| events.list | 공통 seq·seat·cards는 엔진과 대조. type은 string이며 종류별 추가 필드는 미검증으로 유지 |
| revealHost.options | 엔진 RoundOptions 중 테스트용 deck/pickPools는 기존 정책대로 지움. 추론 타입에도 두 필드가 없음을 검사 |
| readonly / 명시적 undefined | JSON에 없는 차이만 정규화. optional 키 자체는 유지해 필수/선택 필드 드리프트를 검사 |

검사 위치는 `packages/protocol/test/schema-contracts.test.ts`다. **타입 비교 3개는 Vitest 런타임이 아니라 `npm run check`의 TS 7 검사로 검증한다.** 기존 protocol tsconfig의 `test` 범위에 포함된다. 나머지 1개는 실제 decode의 월 전수·오류 경계·fast-check 검사다. codec/schema의 “모든 필드가 검증된다”는 과도한 주석도 실제 범위에 맞게 고쳤다.

입력 정책을 강화하는 R3b(규칙 필드와 이벤트별 필드의 검증)는 wire 호환성·FR-21 옵션 노출 정책을 정한 뒤 별도 기능 PR로 진행한다. 이 PR은 스키마 분할만을 위한 파일 이동이나 규칙/UI 변경을 포함하지 않는다.

## 검증·전후 계측

```sh
# 전후 수신 결과 비교: 기존 wire 벡터 41 + 월 경계 입력 21
docker compose run --rm -T dev node --input-type=module < docs/research/protocol-contract-probes.mjs.txt
# 타입 정합은 check, 런타임 성질은 Vitest
docker compose run --rm dev npm run check -w packages/protocol
docker compose run --rm dev npm exec -- vitest run packages/protocol/test/schema-contracts.test.ts
wc -l packages/protocol/src/schema.ts packages/protocol/src/codec.ts packages/protocol/test/schema-contracts.test.ts
```

62개 결과(JSON 파싱 결과 또는 오류 코드)의 SHA-256은 전후 동일하다:
`bbf630a8ee2e66df354d6d3609cc02f92ab24fc7ebdba20dc87b919a922f777c`.

| 항목 | 전 | 후 |
|---|---:|---:|
| month 추론 | number | 엔진 Month와 같은 1~12 union |
| 게스트·호스트 전체 정합 검사 | 없음 | 10종 / 13종, 명시된 3경계 포함 |
| 새 정합 검사를 기존 schema에 적용 | TS 7 오류 2개 | 오류 0 |
| 월 수신 성질 | 기존 범위 검사 | 1~12 전수 + 오류 경계 + fast-check seed=96, 1,000회 |
| Node 테스트 / 파일 | 487 / 25 | 491 / 26 |
| JSON 규칙 벡터 / wire 벡터 | 227 / 41 | 227 / 41 |
| 브라우저 / net | 252 / 9 | 252 / 9 |
| schema.ts / codec.ts LOC | 310 / 99 | 311 / 100 |
| schema-contracts.test.ts | 없음 | 72줄 |

전체 게이트는 루트 `docker compose run --rm dev`로 `npm run lint`, `npm run check`(knip 포함), `npm test`(기존 fast-check 포함), `npm run test:net -w packages/web`, `npm run test:browser`, `npm run build -w packages/web`, `npm run e2e -w packages/web`, `android/gradlew -p android assembleDebug testDebugUnitTest lint`를 실행한다. 최종 결과는 PR 본문에 기록한다.

API 근거: [Zod Mini](https://zod.dev/packages/mini), [리터럴 집합](https://zod.dev/api?id=literals), [출력 타입 추론](https://zod.dev/basics), [Vitest expectTypeOf](https://vitest.dev/api/expect-typeof.html), [fast-check 숫자 arbitrary](https://fast-check.dev/docs/core-blocks/arbitraries/primitives/number/). Context7 미노출로 plan §0.1의 공식 문서 대체 경로를 사용했다. 새 의존성은 없다.
