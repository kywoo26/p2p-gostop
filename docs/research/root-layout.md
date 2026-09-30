# 루트 구조와 SDLC 문서 home 결정

2026-10-01 · #224 · spec NF-09·NF-01·NF-RP-06 · plan §1.2·§1.8·§3-2.
수락 근거: 사용자가 이슈·PR 진행과 공식 가이드 확인, 위치 의사결정 및 필요한 이동을 위임했다. 이 계획을 먼저 commit하고 구현·검증 기록을 PR에 연결한다. 요구사항 상태와 제품 동작은 바꾸지 않는다.

## 공식 가이드와 프로젝트 결정

[The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook)의 Plan / Infrastructure는 단일 제품에서 제품 repo의 `intent/` 폴더를 가장 단순한 intent home으로 제안한다. Design / How to execute는 `spec.md`를 `intent.md` 옆에 commit하도록 안내한다. Build는 계획을 `plan.md`로 commit하도록 하되 그 디렉터리는 명시하지 않는다. CLAUDE.md 절은 해당 진입점을 repo root에 두도록 명시한다.

따라서 같은 제품의 의도·명세·계획을 `intent/`에 함께 둔다. 계획까지 같은 디렉터리에 두는 것은 가이드의 명시적 요구가 아니라 산출물 연결과 탐색을 위한 프로젝트 결정이다. 제품 전체의 정본 3개를 유지하며 변경마다 정본 복제본을 만들지 않는다. 기존 `intend.md`는 공식 산출물 이름과 맞춰 `intent.md`로 고친다. 미래에 변경별 intent가 필요하면 별도 계획으로 도입한다.

## 파일과 변경 순서

1. `intend.md` → `intent/intent.md`, `spec.md` → `intent/spec.md`, `plan.md` → `intent/plan.md`.
2. `privacy-audit.mjs`·`privacy-audit.test.mjs`·`privacy-audit-allowlist.json` → `tools/privacy/`. 공유 `lint-imports.mjs` → `tools/lint/`.
3. 문서에서 나가는 상대 링크와 모든 활성 참조를 새 정본으로 연결한다. 루트 README·AGENTS·CLAUDE에서 문서 chain을 찾을 수 있게 한다. 과거 commit/tag에 고정된 공개 URL은 당시 경로를 보존한다.
4. npm scripts·Oxlint JS plugin·web ESLint import를 새 경로로 연결한다. 개인정보 policy는 저장소 root 기준 `tools/privacy/`에서 읽고 합성 저장소 테스트의 policy 배치도 일치시킨다. 허용표는 이동된 파일의 path/line만 조정하며 hash/type/reason과 pending 범위는 보존한다.
5. 구조도와 도구 책임을 갱신한다. 루트 npm workspaces 설정의 `tools/*`는 실제 package.json이 있는 sim만 패키지로 인식하며 새 도구 디렉터리에 package.json이나 의존성을 추가하지 않는다.

루트 추적 파일은 25→18개가 된다. README·LICENSE·AGENTS·CLAUDE·MCP, npm 설정·lock, 편집기·Git·버전·공통 린트/포맷·TS/Vitest/Knip 설정은 루트에 유지한다. relay Compose와 Docker context도 현재 운영 계약을 유지한다. 숨김 설정을 모두 config 폴더로 옮기는 작업은 하지 않는다.

## 위험과 통합

- 링크 이동: baseline의 Markdown 상대 링크를 이동 사상으로 변환해 동일 목적지인지 비교한다. 기존부터 없는 링크/앵커는 신규 회귀와 구분한다. 저장소 root 기준 명령과 인라인 코드 경로는 상대 Markdown 링크와 구별한다.
- 검사 경로: 개인정보 CLI의 저장소 cwd 계약, 합성 repository policy·상대 test import, 양쪽 린터 plugin 로딩, knip workspace 인식을 실제 실행으로 확인한다.
- 개인정보 허용: 이동을 신규 추가 행으로 검사하므로 이전 allowance path를 옮겨야 한다. 원문·비밀 값을 재출력하거나 broad allowance를 추가하지 않는다.
- 동시 작업: #219가 plan·agent 지침을 수정하는 draft PR이다. main 기반 이동만 수행하며 #219 내용을 선취하지 않는다. 통합 순서는 root orchestrator가 정하고 #219 이후 이 이동을 통합하는 순서가 유리하다. #214/#218/#223/#225의 좁은 plan/spec 변경도 통합 시 보존한다. 후속 갱신은 작업 브랜치에서 `git merge origin/main`만 사용하며 stash·rebase·force-push·main 직접 편집·병합은 하지 않는다. 다른 PR 소유자에게 중복 경로 이동을 지시하지 않는다. 이미 게시된 과거 이슈·PR 본문은 수정하지 않는다.
- 이탈: 실제 diff가 위 범위를 벗어나면 같은 구현 commit에서 이 계획을 갱신한다. 병합·배포·실기기 검증은 이번 작업에 포함하지 않는다.

구현 중 확인한 경로 접점: web의 workspace 경계 규칙은 `tools/` 상대 import도 막는다. 이동한 린트 모듈을 설정에서 읽기 위해 `eslint.config.js` 한 파일의 정확한 정적 경로만 예외로 둔다. 앱·E2E·동적 import 및 다른 tools 경로는 계속 금지한다. [공식 regex 옵션](https://eslint.org/docs/latest/rules/no-restricted-imports#regex)과 [files 범위](https://eslint.org/docs/latest/use/configure/configuration-files)을 확인했다(Context7 미노출로 공식 문서 대체). 허용표·probe도 같은 commit에서 갱신한다.

## 증명과 완료 조건

새 워크트리의 `npm ci` 후 기존 PR gate인 lint·check·Node tests·browser tests·web build·E2E smoke·Android assembleDebug/testDebugUnitTest/lint를 네이티브로 실행한다. Docker context canary와 기존 import-boundary probes도 실행한다. 공유 호스트 worker 상한을 지킨다.

정본 경로·파일 이동·기존 Markdown 링크 목적지 보존·익명화·git diff --check를 확인한다. 구조 이동으로 생긴 고장과 기존 실패/호스트 부족을 구별해 PR에 기록한다. 커밋과 PR에는 요구사항 ID, Closes #224, 이 계획의 실제 commit SHA, 수락 근거 및 검증 결과를 적는다. 독립 reviewer가 실제 diff와 계획·동일 head CI를 대조하도록 하고 병합은 수행하지 않는다.

2026-10-01 root 조율 반영: #224 생성 후 이슈 제목·본문·labels·milestone·state는 이슈 정제 담당의 단독 소유다. 이 작업은 해당 필드를 더 이상 편집하지 않으며 PR·최종 SHA·이동경로·승인 범위·검증을 지정 리뷰/오케스트레이션 담당에게 인계한다. 운영 wrapper·release clone·secret에는 접근하지 않는다.
