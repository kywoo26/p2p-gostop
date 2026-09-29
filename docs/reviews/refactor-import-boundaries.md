# R2 공개 API·import 경계 검증

근거: `spec.md` NF-09, `plan.md` §0 원칙 9·§1.3/1.8·D4, `docs/refactor-plan.md` R2/RF-09·10. 기준 `7cb06f3`(#91·#93 병합). 제품 소스·공개 exports·의존성은 바꾸지 않는다.

## 적용 범위

| 소비자 | 허용 workspace API |
|---|---|
| engine | 자기 공개 API; 다른 workspace 없음 |
| ai / protocol | engine |
| relay-dev/src | protocol |
| relay-dev/test | protocol·engine |
| tools/sim | engine·ai |
| web | engine·ai·protocol, 자기 공개 web/net |

Oxlint `eslint/no-restricted-imports`의 패키지별 override와 web ESLint `no-restricted-imports`를 사용한다. 정적 import·타입 import·재수출에 모두 적용한다. 비공개 하위 경로를 막고 공개 `engine/testing`·`web/net`만 예외로 둔다. 명시된 6개 workspace와 packages/tools 경로가 포함된 상대 import도 금지한다. 기존 순수성·비보안 컨텍스트 API 규칙은 유지한다.

[Oxlint 공식 문서](https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports)는 문자열 동적 import도 지원하지만 [ESLint 규칙](https://eslint.org/docs/latest/rules/no-restricted-imports)은 정적 import만 검사한다. web에는 동일 패턴의 `no-restricted-syntax` 선택자를 적용해 문자열 동적 import를 검사한다. `.svelte` script와 E2E도 검증했다. Context7이 노출되지 않아 plan §0.1에 따라 공식 문서를 조회했다.

한계: 이 설정은 경로 문자열 패턴 검사다. `import()`의 계산된 경로·템플릿은 아래 규칙으로 금지하지만, require·절대경로·커스텀 alias의 의미론적 해석이나 모든 순환을 보장하지 않는다. 기존에 없는 동명 내부 디렉터리(예: `src/engine`)는 상대경로 정책과 충돌할 수 있으므로 추가 시 규칙을 함께 검토한다. workspace 추가·exports 변경 때 허용표와 probe를 갱신한다. 엔진 테스트 도우미의 개별 심볼 사용 여부는 이 경로 검사 범위 밖이다.

## 재현 및 결과

```sh
# 각 fixture를 실제 소스 경로에 잠시 만들고 기존 린터로 검사한 뒤 finally에서 제거한다.
node --input-type=module < docs/research/import-boundary-probes.mjs.txt
# 기존 AST 감사 도구로 현재 파일/패키지 그래프를 계측한다.
git ls-files packages tools android | node --input-type=module --eval "$(cat docs/research/codebase-audit.mjs.txt)" > /tmp/import-boundary-audit.json
wc -l .oxlintrc.json packages/web/eslint.config.js
git show 7cb06f3:.oxlintrc.json | wc -l
git show 7cb06f3:packages/web/eslint.config.js | wc -l
```

초기 제출(`7cb06f3` → `9590c73`) 계측이다. 리뷰 후속 수치는 아래에 별도로 적는다.

| 항목 | 전 | 후 |
|---|---:|---:|
| workspace 방향 제한 | 0 | Oxlint 5개 override + web 규칙 |
| 패키지 순환 / 파일 순환 / 패키지 간 상대 import | 0 / 0 / 0 | 0 / 0 / 0 |
| 경계 probe | 없음 | 72/72 예상 결과 일치 |
| `.oxlintrc.json` 줄 수 | 59 | 199 |
| web ESLint 설정 줄 수 | 107 | 130 |
| 제품 모듈 변경 | — | 0 |
| Node 테스트 / JSON 규칙 벡터 / net | 487 / 227 / 9 | 487 / 227 / 9 |
| 브라우저 테스트 | 252 | 252 |

probe는 금지/허용 의존 방향, deep import, 상대경로·중간 `..`, 타입 전용 import, 재수출, 문자열 동적 import, 공개 testing/net 및 그 아래 비공개 경로, Svelte/E2E를 검사한다. 부정 fixture가 다른 경고 때문에 실패한 것을 성공으로 세지 않고 **경계 규칙 진단과 종료 코드**를 확인한다. 최초 실험에서 `*`가 깊은 하위 경로를 놓치는 것을 발견해 Oxlint 패턴을 `**`로 수정했다.

전체 게이트는 루트에서 다음 명령을 실행한다: `npm run lint`, `npm run check`(knip 포함), `npm test`(fast-check 포함), `npm run test:net -w packages/web`, `npm run test:browser`, `npm run build -w packages/web`, `npm run e2e -w packages/web`, `android/gradlew -p android assembleDebug testDebugUnitTest lint`. lock이 같아 앞선 새 진입점 `npm ci` 결과를 유지했다. 최종 결과는 PR 본문에 기록한다.

#96의 브라우저 간헐 실패 수정은 별도 PR #97이다. 이 PR은 해당 테스트를 포함하거나 변경하지 않으며, 병합 순서는 #97을 먼저 권장한다.

## #98 리뷰 후속: 템플릿·확장자 우회 차단

main `f9c38f5`를 병합한 기존 설정에서 리뷰의 세 사례를 재현했다. engine의 상수 템플릿 protocol import, web의 상수 템플릿 relay-dev import, ai의 `.mjs` protocol 재수출 모두 **exit 0·진단 0**이었다. 이후 아래 정책을 추가했다.

| 항목 | 보강 |
|---|---|
| `import()` 경로 | **따옴표 문자열 리터럴만 허용**. 치환 없는 템플릿도 금지하며 변수·문자열 결합·조건식·함수 호출·치환 있는 템플릿은 평가하지 않고 거부 |
| 구현 | 루트 `lint-imports.mjs`의 `workspace/string-literal-imports`를 Oxlint와 web ESLint가 공유. 기존 문자열 경계 규칙은 유지 |
| 순수 패키지의 경계 override | `.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs` 포함. `.cjs`는 ESM 재수출 자체가 문법 오류라 유효한 `import()`로 검사 |
| 규범 | AGENTS §4에 허용표 링크·템플릿/계산 경로 금지·exports 변경 시 갱신 위치·Docker lint 명령 한 줄 추가 |
| 의존성과 도구 경계 | 패키지·lock·버전 변경 0. 순수 패키지는 여전히 Oxlint, web은 ESLint이며 두 도구의 AST 규칙 API만 공유 |

[Oxlint의 내장 no-dynamic-require](https://oxc.rs/docs/guide/usage/linter/rules/import/no-dynamic-require)는 `esmodule: true`여도 치환 없는 템플릿을 허용한다. 따라서 그 규칙을 켜는 것만으로 리뷰 반례를 막을 수 없다. [공식 JS plugin API](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html)로 작은 로컬 규칙을 작성했다. Oxlint JS plugin API는 **alpha**이므로 버전 변경 시 아래 실제 린터 probe를 다시 실행한다. 새 npm 의존성이나 분석 도구를 설치하지 않았다.

확장 probe는 두 도구의 상수/치환 템플릿·변수·결합·함수/조건식 import, 따옴표 경로 허용, 순수 패키지 6개 위치 × 8개 확장자의 허용/금지, web JS/MJS/CJS/MTS/CTS, Svelte/E2E를 포함한다. 오류 종료만으로 성공 처리하지 않고 **경계 규칙 또는 string-literal-imports 진단**을 확인한다. 임시 파일은 예외가 나도 finally에서 삭제한다. 최신 probe 수·설정 LOC와 전체 게이트 결과는 PR 본문에 기록한다.

후속 실행 결과: **198/198 probe 예상 일치**(기존 72개 + 126개). Oxc 설정 199→204줄, web 설정 130→133줄, 공유 규칙 0→26줄. Node/브라우저/네트워크의 제품 테스트 개수는 이 규칙 변경으로 늘지 않는다. main 병합에 따른 기준선 증가는 PR 본문의 최신 실행 결과와 구별한다.

최신 전체 게이트(main `f9c38f5` 병합 후): lint·check(knip), Node 491/26파일(규칙 벡터 227·fast-check), net 9, 브라우저 278/46파일, build 1,036.2 KiB/외부 URL 0, E2E 84 passed/4 skipped, Android assembleDebug·testDebugUnitTest·lint 모두 통과. #97의 두 wiring 사례는 이 브랜치에 포함하지 않았다. `git diff --check` 통과, probe 임시 파일 잔여 0.
