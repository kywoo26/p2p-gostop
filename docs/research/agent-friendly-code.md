# 에이전트가 수정·검증하기 쉬운 코드: 근거와 채택 판단

조사일 2026-09-29. 적용 대상 main `bb389e5`. 상위: [plan §0·§1](../../plan.md), [리팩토링 계획](../refactor-plan.md). 에이전트 성공률을 이 저장소에서 측정한 실험은 아직 없다. 아래의 구조 개선 효과는 별도 표시가 없더라도 **이 저장소에 대한 가설**이다.

## 1. 근거를 읽는 기준

| 등급 | 뜻 | 주장할 수 없는 것 |
|---|---|---|
| 공식 문서 | 제작자가 보장하는 도구 동작·권장 사용법 | 권고를 따른 코드가 작업 성공률을 높인다는 인과 효과 |
| 실증 연구 | 비교군·과제·평가지표가 있는 연구 | 다른 언어·모델·과제에 같은 효과가 난다는 보장 |
| 경험담 | 당사자의 운영 사례·엔지니어링 블로그·OSS 관례 | 보편적 최적 구조·최적 파일 길이 |

1차 출처만 읽었다. 공식 회사 블로그라도 통제 비교가 없는 경험 보고는 경험담으로 분류했다. 검색 결과에 논문이 있다는 이유만으로 동료 심사 완료로 분류하지 않았다. 아래 R1은 arXiv v2 원문을 확인했으나 학회 채택 여부는 확인하지 못했다. R2는 ICLR 2024 정식 논문집과 논문을 확인했다. 두 근거를 구별한다.

## 2. 읽은 1차 출처

| ID·등급 | 출처 | 확인한 내용·한계 |
|---|---|---|
| O1 공식 문서 | [OpenAI: AGENTS.md](https://developers.openai.com/codex/guides/agents-md/) (현재 ChatGPT Learn으로 이동) | 시작할 때 지침을 읽고 디렉터리별 지침을 합친다. 명령·저장소 관례를 전달하는 수단이지 성능 연구가 아니다. |
| O2 공식 문서 | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) (기존 Anthropic engineering URL에서 이동) | 검증 기준, 실제 검사 결과, 간결한 지침을 권장한다. 권고의 저장소별 효과는 별도 측정해야 한다. |
| E1 경험담 | [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), 2025-11-26 | 작은 증분·검증 가능한 진행 기록·환경 시작 명령·E2E를 사용한 내부 앱 개발 사례. 제품 코드의 파일 길이를 독립 변수로 비교한 연구는 아니다. |
| E2 경험담(OSS 관례) | [OpenAI Codex AGENTS.md](https://github.com/openai/codex/blob/main/AGENTS.md) | 크레이트 이름·대상 테스트·공개 API 규약·큰 중심 모듈의 책임 분리를 명시한다. Rust 저장소 사례를 TS에 그대로 이식하지 않는다. |
| E3 경험담(OSS 관례) | [VS Code CONTRIBUTING](https://github.com/microsoft/vscode/blob/main/CONTRIBUTING.md), [Writing Tests](https://github.com/microsoft/vscode/wiki/Writing-Tests) | 기여 안내가 상세 개발/테스트 문서로 연결되고 단위 테스트는 `src/vs/**/*.test.ts`다. 테스트 동거가 에이전트 성능을 높였다는 실험은 없다. |
| R1 실증 연구(사전 공개 논문) | [Gloaguen 외, Evaluating AGENTS.md, v2](https://arxiv.org/html/2602.11988v2), 2026-06-23 | CTXbench 12개 Python 저장소·138과제와 SWE-bench에서 비교. 컨텍스트 파일은 일반적으로 성공률을 개선하지 않았고 평균 추론 비용은 20% 이상 증가했다. 지침 준수와 탐색/테스트 증가가 성공률 향상과 같지 않다. 언어·과제·모델 제한 때문에 현재 TS/Kotlin 앱의 결과로 일반화하지 않는다. |
| R2 실증 연구(동료 심사) | [Jimenez 외, SWE-bench, ICLR 2024](https://proceedings.iclr.cc/paper_files/paper/2024/hash/edac78c3e300629acfe6cbe9ca88fb84-Abstract-Conference.html), [논문](https://proceedings.iclr.cc/paper_files/paper/2024/file/edac78c3e300629acfe6cbe9ca88fb84-Paper-Conference.pdf) | 12개 Python 저장소의 실제 이슈/PR 2,294개로 저장소 수준 수정 능력을 평가한다. 여러 함수·파일에 걸친 변경을 다룬다. 파일 크기·테스트 동거·타입 단일화의 효과를 분리해 입증한 연구는 아니므로 해당 권고의 실증 근거로 쓰지 않는다. |
| O3 공식 문서 | [Node package entry points](https://nodejs.org/api/packages.html#package-entry-points) | `exports`는 공개 하위 경로를 제한한다. 파일시스템 상대경로까지 경계를 강제하는 보안 장치는 아니다. |
| O4 공식 문서 | [Oxlint no-restricted-imports](https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports), [ESLint no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports) | 경로·패턴·이름 제한을 설정할 수 있다. 정적 import/export 검사는 가능하지만 모든 동적 경로의 의미론적 의존 분석을 대신하지 않는다. |
| O5 공식 문서 | [Zod Mini](https://zod.dev/packages/mini), [Zod enums](https://zod.dev/api#enums) | 타입 추론과 리터럴 목록 기반 검증을 제공한다. 도메인 모델 전체를 Zod로 옮겨야 한다는 근거는 아니다. |
| O6 공식 문서 | [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) | AST 순회·소스 위치로 함수 범위와 import를 계측할 수 있다. 감사 부록은 이미 설치된 TS 6을 분석에만 사용하며 순수 TS 타입 검사기는 TS 7 그대로다. |

Context7 도구가 이 세션에 노출되지 않아 plan §0.1의 공식 문서 대체 경로를 사용했다. 라이브러리 설치·제품 런타임 요청은 추가하지 않았다. 링크는 조회 시점 내용이며 OSS main 문서는 이후 바뀔 수 있다.

## 3. 후보별 채택·기각

| 후보 주장 | 근거·판정 | 이 저장소에 적용할 범위 | 효과 확인 방법 |
|---|---|---|---|
| 작은 파일·단일 책임이면 에이전트가 더 잘 고친다 | E2 경험담, **가설**. 200/300줄 절대 상한은 기각 | `host.ts`는 복원/전송/판 전이를 구분해 검토. 단순 줄 수 감소만 위한 이동 금지 | 같은 유형 수정에서 읽은 파일·수정 파일·회귀·리뷰 왕복 비교 |
| 공개 API와 import 경계가 도움이 된다 | O3/O4 공식 기능, 에이전트 효과는 **가설** | 현재 exports 유지. 역방향·내부 경로 우회에 실패 신호 추가 | 금지 import 샘플이 lint에서 실패하고 허용 테스트 하위 경로는 통과 |
| 결정적인 검증 명령이 작업을 안내한다 | O1/O2 공식 권고, E1 경험담, 효과는 **가설** | 기존 Docker 명령 유지. 시드·명령·종료 코드·검사 수를 PR에 기록 | 동일 기준 SHA에서 재실행; 부하성 timeout과 논리 실패 분리 |
| 테스트는 무조건 코드 바로 옆이어야 한다 | E3 관례만 있음, 보편 주장 **기각** | engine/protocol의 `test/`·JSON 벡터 유지, web의 동거 방식 유지 | 기능→테스트 지도와 의미 있는 이름부터 개선 |
| Zod가 모든 계약의 단일 진실이어야 한다 | O5 기능, 일반화 **기각** | 엔진 도메인 타입은 engine, 외부 입력 검증은 protocol. 동일 리터럴 목록·의미 같은 타입만 연결 | 정적 계약 검사 + 기존 정상·경계·잘못된 프레임 벡터 |
| AGENTS.md에 전체 파일 지도를 넣으면 성공률이 오른다 | O1 공식 메커니즘과 R1 실증 결과를 구별. 보편 주장 **기각** | 이미 있는 규범은 유지. 필요한 변경 위치·테스트만 짧게 링크, 본 계획의 §5 지도부터 사용 | 지침 유무/길이와 무관하게 실제 과제 성과 측정. 문서 중복·낡은 링크 검사 |
| 이름이 일관되면 탐색이 쉬워진다 | E2/E3 관례, **가설** | `m4.test.ts` 등 마일스톤 이름은 해당 영역 수정 시 기능별 이름으로 분할. `SeatView`처럼 다른 계약은 무리하게 합치지 않음 | 검색 결과 오인·잘못 고친 파일·리뷰 수정 횟수 |
| 부수효과 격리로 검증이 쉬워진다 | E1 경험담 + 기존 NF-09 설계, 에이전트 효과는 **가설** | 엔진 순수 함수·시드·외부 시계 주입 보존. BLE용 새 프레임워크 금지 | 같은 시드/액션 재생, 메모리/실제 WS 동일 세션 결과 |

## 4. 로컬 실증 계획

리팩토링 전후 각각 같은 6개 과제(규칙 옵션, 정산 종류, 메시지 필드, 저장 복원, AI 정책, relay 경계)를 고정하고 새 세션에서 수행한다. 모델·추론 설정·토큰 예산·도구·기준 SHA·과제 순서·환경을 기록한다. 성공은 독립된 기존/보강 수용 테스트와 리뷰로 판정하며 자체 “완료” 선언은 세지 않는다. 두 조건의 순서를 교대하고 과제별 최소 3회 반복한다. 동일 과제 풀이 유출을 피하며 비용상 못 수행하면 미실시로 남긴다.

| 지표 | 측정 | 해석 제한 |
|---|---|---|
| 과제 성공/회귀 | 수용 테스트·규칙 벡터·E2E·독립 리뷰 | 성공률 숫자는 실제 실험 이후만 |
| 탐색 비용 | 최초 올바른 파일 선택까지 읽은 파일/토큰/시간 | 파일이 작아져 읽은 파일 수가 늘어도 실패가 아닐 수 있음 |
| 수정 국소성 | 의미 있는 변경 파일 수, 소유권 충돌 수 | 타입 단일화 초기 이동 비용과 후속 유지 비용 구분 |
| 피드백 품질 | 첫 lint/test 실패 원인, 수정 반복 수 | 테스트 늘린 것과 에이전트 개선을 혼동하지 않음 |

현재 증거는 코드 계측과 회귀 검사뿐이다. 이를 에이전트 생산성 향상 실증으로 부르지 않는다.
