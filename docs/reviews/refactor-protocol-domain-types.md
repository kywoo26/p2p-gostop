# R1: protocol 도메인 타입·오류 코드 단일화 검증

2026-09-29 · base `bb389e5` · 브랜치 `refactor/protocol-domain-types`.
선행 [감사·계획 PR #91](https://github.com/kywoo26/p2p-gostop/pull/91)의 R1, RF-01/02.
요구사항: spec.md NP-02·FR-18·NF-09. 설계: plan.md §1.3·§1.4·§1.6·§1.8, D3/D4.

## 1. 변경과 경계

| 변경 | 결과 |
|---|---|
| CardId·Month·Seat·SettleStepKind | engine 공개 API에서 type 재수출. protocol의 기존 공개 이름 유지 |
| CapturedView·RoundPhase·SettleStepView | 각각 CapturedPile·Phase·SettleStep의 type alias. 읽기 전용·선택 필드 유지 |
| ERROR_CODES | 같은 9개·같은 순서의 리터럴 배열에서 ErrorCode와 Zod enum을 도출 |

wire 버전 2, 저장 v1, encode/decode 분기와 엔진·AI 정책은 그대로다. 한국어 라벨·화면 전용 SeatView·SettlementView 사유 축약은 화면 계약에 남긴다. 전체 메시지의 `as Message`와 느슨한 rules/event 스키마 정합은 R3 후속이며, 이번 변경으로 해결됐다고 주장하지 않는다.

제품 변경은 `packages/protocol/src/{messages,schema,view-types}.ts` 세 파일뿐이다. runtime import는 schema→messages 하나 추가되며 messages의 엔진·뷰 의존은 type-only다. 새 의존성 없음. 웹 UI·game/session 파싱·p2p·Android Back·빌드 파일·디자인 문서 변경 없음.

Zod API는 [공식 Mini 문서](https://zod.dev/packages/mini)와 [enum 문서](https://zod.dev/api#enums)를 먼저 확인했다. Context7 도구가 노출되지 않아 plan §0.1의 공식 문서 경로를 사용했다.

## 2. 같은 분모의 전후 계측

| 항목 | 전 | 후 |
|---|---:|---:|
| protocol 코드 파일(테스트 포함) | 20 | 20 |
| protocol LOC(빈 줄·주석 포함) | 5,762 | 5,726 |
| view-types.ts | 339 | 320 |
| messages.ts | 159 | 151 |
| schema.ts | 319 | 310 |
| 엔진과 같은 모양을 재기술한 7개 선언 | 7 | 0(재수출/alias) |
| 오류 코드 목록의 정의 지점 | 3 | 1 |
| 패키지/파일 순환 | 0 / 0 | 0 / 0 |
| 전체 코드 LOC | 35,322 | 35,286 |
| 함수 길이 | 변경 없음 | 변경 없음 |
| 규칙 JSON 벡터 | 227 | 227 |

감사 PR의 스크립트를 각 상태에서 다음과 같이 실행했다. `.ts/.js/.mjs/.svelte/.kt/.kts`와 git 추적 목록 기준이며 이 검증 문서는 분모 밖이다. 타입 alias 변경을 큰 상태 기계의 책임 분리로 과장하지 않는다.

```sh
git ls-files packages tools android | ./dev.sh npm exec -- node --input-type=module --eval "$(git show refactor/audit-plan:docs/research/codebase-audit.mjs.txt)"
```

## 3. 공개 타입과 wire 동작 비교

### 공개 타입

기준 커밋의 `view-types.ts`와 현재 파일을 동시에 TS 7로 검사해 **기존 공개 타입 30개 모두 동일 모양**인 것을 확인했다(exit 0). 비교 소스는 임시 디렉터리에 만들고 종료 시 삭제했다. 실제 protocol 패키지의 strict·exactOptionalPropertyTypes 설정을 사용했다. 리포지터리 소비자의 module augmentation 사용은 없으며, interface→alias는 외부 선언 병합 확장용 API를 지원한다는 뜻은 아니다(비배포 private workspace).

```sh
proof_dir=$(mktemp -d packages/protocol/test/refactor-proof-XXXXXX)
trap 'rm -r "$proof_dir"' EXIT
git show bb389e5:packages/protocol/src/view-types.ts > "$proof_dir/before.ts"
cat > "$proof_dir/proof.ts" <<'TS'
import type * as Before from './before.ts';
import type * as After from '../../src/view-types.ts';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
export type Proof = [
TS
sed -n -E 's/^export (type|interface) ([[:alnum:]_]+).*/\2/p' "$proof_dir/before.ts" | while IFS= read -r name; do
  printf 'Assert<Equal<Before.%s, After.%s>>,\n' "$name" "$name" >> "$proof_dir/proof.ts"
done
printf '];\n' >> "$proof_dir/proof.ts"
./dev.sh npm exec -- node node_modules/typescript-7/bin/tsc -p packages/protocol/tsconfig.json
```

### wire 결과

기존 `wire.json`은 실제 **41개**다(기존 docs/protocol §10의 36 표기는 낡음). 전체 벡터의 디코딩 결과에 모든 거부 코드 9개와 잘못된 값 5개를 추가했다. 같은 base/head에서 결과 배열 JSON의 SHA-256은 모두 다음과 같았다.

`6d5c35f875fb8578c3c9f02050571c300f61da11f0a6a611b80c19845eac57b0`

아래를 `/tmp/refactor-wire-check.mjs`로 저장한 뒤, 각 체크아웃에서 `./dev.sh npm exec -- node --input-type=module --eval "$(cat /tmp/refactor-wire-check.mjs)"`로 실행한다. script와 해시는 분석 전용으로 제품 번들에 들어가지 않는다. 해시 일치는 이 55입력의 결과 보존 증거이며 가능한 모든 입력에 대한 증명은 아니다. 아래 기존 회귀·속성 테스트로 보완한다.

```js
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { decode, ERROR_CODES, PROTOCOL_VERSION } from './packages/protocol/src/index.ts';
const vectors = JSON.parse(fs.readFileSync('packages/protocol/test/vectors/wire.json', 'utf8'));
const results = vectors.map(v => ({ id: v.id, result: decode(JSON.stringify(v.value), v.from) }));
const probes = [...ERROR_CODES, '', 'bankrupt', 'UNKNOWN', null, 0];
for (const reason of probes) results.push({ reason, result: decode(JSON.stringify({ t: 'reject', seq: 0, reason, message: '거부', extra: '제거' }), 'host') });
console.log(JSON.stringify({ version: PROTOCOL_VERSION, vectors: vectors.length, probes: probes.length, sha256: createHash('sha256').update(JSON.stringify(results)).digest('hex') }));
```

## 4. 전체 회귀

검사는 모두 Docker `./dev.sh`로 실행했다. 새 동작이 없으므로 동작을 그대로 복제한 새 테스트는 추가하지 않았다. 타입 비교·wire 결과 비교는 추가 분석이며 기존 테스트 수에 포함하지 않는다.

| 명령 | 전 | 후 |
|---|---|---|
| lint / check(knip 포함) | 통과 | 통과, knip 미사용 항목 0 |
| test | 25파일·487개 통과 | 25파일·487개 통과 |
| test:browser | 32파일·226개 통과 | 32파일·226개 통과 |
| npm run test:net -w packages/web | 1파일·9개 통과 | 1파일·9개 통과 |
| build:web | 1016.3 KiB·외부 URL 0 | 1016.3 KiB·외부 URL 0 |
| e2e | 56 통과·4 skipped | 56 통과·4 skipped |
| apk:debug / android:test | 통과 | 통과 |

기준선 첫 동시 검사에서 AI info-hiding 1건이 5초 timeout이었다. 다른 검사와 겹치지 않은 동일 명령 재실행에서 487개 통과했고 timeout 설정을 바꾸지 않았다. fast-check·227개 규칙 벡터·메모리/실제 WS 20판·공정성/복원/원장 테스트는 그대로 유지한다. Gradle의 기존 deprecation 경고, E2E의 기존 skip, Galaxy/iPhone 실기기 미검증은 남는다.
