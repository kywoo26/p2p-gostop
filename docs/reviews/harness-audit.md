# Claude Code 하네스 감사와 재설계

- 검토일: 2026-09-29 · 대상: `.claude/**`, `.mcp.json`, `CLAUDE.md`, `AGENTS.md`(+ `.gitignore` 두 줄, `plan.md` 훅 언급 두 곳)
- 기준 버전: Claude Code 2.1.280(로컬 `claude --version`)
- 원칙: 공식 문서에 근거가 있는 것만 둔다. 문서가 권하지만 이 저장소에서 측정해 보니 효과가 없는 것은 뺀다.

## 공식 근거(조회한 문서)

| 약칭 | 문서 | 조회 방법 |
|---|---|---|
| [BP] | Best practices for Claude Code, https://code.claude.com/docs/en/best-practices (구 anthropic.com/engineering/claude-code-best-practices에서 308 이동) | WebFetch |
| [MEM] | How Claude remembers your project, https://code.claude.com/docs/en/memory | WebFetch |
| [SUB] | Subagents, https://code.claude.com/docs/en/sub-agents | WebFetch, Context7 `/llmstxt/code_claude_llms_txt` |
| [HOOK] | Hooks reference, https://code.claude.com/docs/en/hooks · Hooks guide, https://code.claude.com/docs/en/hooks-guide | WebFetch |
| [SKILL] | Skills, https://code.claude.com/docs/en/skills | WebFetch, Context7 `/websites/code_claude` |
| [PERM] | Configure permissions, https://code.claude.com/docs/en/permissions | WebFetch |
| [SET] | Settings, https://code.claude.com/docs/en/settings | WebFetch |
| [MCP] | MCP, https://code.claude.com/docs/en/mcp | WebFetch, Context7 `/websites/code_claude` |
| [AGM] | AGENTS.md 규약, https://agents.md/ | WebFetch |

## 판정 요약

| # | 항목 | 현재 | 공식 근거 | 판정 | 조치 |
|---|---|---|---|---|---|
| 1 | `reviewer` 에이전트 | opus·effort medium·`disallowedTools: Edit, Write, NotebookEdit`. 프롬프트가 "docs/reviews는 Bash로 작성"을 지시 | [SUB] `effort`(low/medium/high/xhigh/max)·`disallowedTools`·`model` 모두 유효 필드. 읽기 전용은 도구 제한으로 강제하라("Enforce constraints"). [BP] "Add an adversarial review step": 새 컨텍스트의 검토자, 정확성·요구사항 결함만 보고하게 하라 | **수정** | Bash 쓰기 우회 지시 삭제(결과는 호출자에게 반환). `Agent` 추가 차단(중첩 위임 방지). 절차·보고 형식·"취향 지적은 선택" 명시. 재현은 임시 워크트리에서 |
| 2 | `implementer` 에이전트 | opus·effort high. "워크트리 격리를 전제"라고 글로만 적음 | [SUB] `isolation: worktree` 필드가 있다(기본 브랜치에서 딴 임시 워크트리, 변경 없으면 자동 정리) | **수정** | `isolation: worktree`로 격리를 강제. AGENTS.md·CLAUDE.md와 겹치는 문장 삭제, 워크트리 첫 `install`·커밋 전 `lint:fix`·보고 형식만 남김 |
| 3 | `hygiene` 에이전트 | sonnet·effort low. 설명에 "문서 동기화" 포함 | [SUB] "Control costs by routing tasks to faster, cheaper models". Agent 도구 호출에는 `effort` 인자가 없어 저비용·저노력 위임은 사용자 정의 에이전트로만 고정 가능. 설명은 자동 위임 판단에 쓰인다 | **수정** | 유지하되 설명을 "지시가 구체적인 기계적 작업"으로 좁힘(문서 동기화처럼 판단이 필요한 일이 low effort로 자동 위임되는 것을 막음). `Agent` 차단 |
| 4 | 추가 에이전트(`device-log-analyst` 등) | 없음 | [SUB] 반복되고 도구 제한·전용 프롬프트가 필요한 일에만 | **추가 안 함** | 실기기 기록은 스킬 `device-round`로 충분(도구 제한 불필요) |
| 5 | PostToolUse 포맷 훅 | `Edit\|Write`마다 `${CLAUDE_PROJECT_DIR}/dev.sh format:file`(Docker 컨테이너 1회), 모든 출력·실패를 `>/dev/null 2>&1 \|\| true`로 숨김 | [HOOK-guide] 포맷 훅은 공식 예시. 그러나 [HOOK] "`${CLAUDE_PROJECT_DIR}` stays put … still runs the script in the main checkout", "`cwd` follows Claude". [BP] 훅은 "zero exceptions"가 필요한 동작용 | **제거** | 아래 "훅 측정" 참고. 워크트리 작업(이 저장소의 기본 방식)에서 web 파일은 한 번도 포맷되지 않고, 엔진 파일은 메인 체크아웃의 툴체인으로 포맷된다. 포맷은 커밋 전 `lint:fix`, 검사는 CI `lint`(`oxfmt --check`·`prettier --check`)로 이미 결정적으로 강제된다 |
| 6 | `git push`·커밋 가드 훅 | 없음 | [PERM] 같은 일을 `ask` 규칙으로 할 수 있고, "ask rule … still prompts … even in auto mode". 훅과 규칙 모두 `git -C . push` 같은 변형은 못 막는다("isn't a security boundary") | **훅 대신 권한 규칙** | 7번의 `ask` 규칙으로 처리. `git commit` 가드는 오케스트레이터가 늘 커밋을 지시하므로 소음만 늘어 두지 않음 |
| 7 | 권한(`permissions`) | 없음 | [PERM] `Bash(cmd *)` 문법, deny→ask→allow 순서, 복합 명령은 하위 명령마다 매칭, `npx`·`docker exec` 같은 러너는 벗겨지지 않으므로 "runner + inner command"로 구체적으로. 프로젝트 `allow`는 작업 공간 신뢰 후에만 적용, `deny`·`ask`는 즉시. [BP] "pre-approve the tools you trust" | **추가** | allow: 검증 태스크(`./dev.sh lint·lint:fix·check·test·test:browser·build:web·e2e·ci·apk:debug·android:test·install`)와 gh 조회. ask: main·태그·강제 푸시, `gh pr merge`, `gh release create/delete`, Docker 볼륨 삭제. deny: 서명 키·비밀 읽기(`.gitignore`와 같은 패턴) |
| 8 | `.mcp.json` Svelte MCP | `npx -y @sveltejs/mcp@0.1.26`, `type` 없음 | [MCP] 프로젝트 범위 `.mcp.json`, 대화형 세션에서 첫 사용 전 승인. `type`은 생략 가능(공식 예시에 없음). 0.1.26은 npm 최신(2026-08-07 게시, Docker로 `npm view` 확인) | **유지(소폭 수정)** | `"type": "stdio"` 명시. 사용법은 CLAUDE.md에 한 줄. 호스트 `npx`로 도는 것을 AGENTS.md 1장에 유일한 예외로 명시 |
| 9 | `CLAUDE.md` | `@AGENTS.md` + 3줄 보충(요구사항 ID, Context7, 실기기) | [MEM] `@AGENTS.md` 가져오기는 공식 권장 패턴(재귀 4단계, 상대 경로는 가져오는 파일 기준). "target under 200 lines", 블록 HTML 주석은 컨텍스트에서 제거됨. [BP] "Would removing this cause Claude to make mistakes?" | **수정** | 요구사항 ID·실기기 규칙은 도구 중립이라 AGENTS.md로 이동. Claude 전용은 Context7·Svelte MCP 사용법 2줄만. 유지보수 메모는 HTML 주석 |
| 10 | `AGENTS.md` 크기·구조 | 56줄(버전 표 20줄 포함) | [MEM] 200줄 목표. [BP] 자주 바뀌는 정보는 제외 권장. [AGM] 도구 중립 단일 파일, 가져오기 문법 없음 | **유지(소폭 수정)** | 60줄. 버전 표는 옮기지 않음: `ci.yml`·`release.yml`·`.npmrc`·`dependabot.yml`·`libs.versions.toml`이 "AGENTS.md 2장 버전 표"를 가리키고, 표의 대부분이 "TS 7 금지", "targetSdk 37 금지" 같은 함정 정보다. 진입점 문장을 교체 PR에 견디게 고치고(5장), PR·병합 규칙과 포맷 방식을 추가 |
| 11 | `.claude/rules/`(경로 한정 규칙) | 없음 | [MEM] `paths` 프런트매터만 읽음. "Path-scoped rules trigger when Claude reads files matching the pattern" | **도입 안 함** | (1) Codex는 `.claude/rules`를 읽지 않아 금지 목록을 옮기면 복제나 누락이 생긴다. (2) 읽을 때만 로드되므로 새 파일을 만들 때는 규칙이 안 붙는다(금지 목록이 가장 필요한 순간). (3) 금지 목록은 9줄이고 ESLint·oxlint가 이미 기계적으로 막는다 |
| 12 | 스킬 | 없음 | [SKILL] 반복 절차·부작용 있는 작업은 `disable-model-invocation: true`, 격리 실행은 `context: fork` + `agent`, `allowed-tools`는 공백 구분 규칙 | **추가 3개** | `/review-pr <n>`(fork→reviewer), `/release <tag>`(수동 전용, CI 게이트 선확인), `/device-round <문서>`(실기기 결과 기록 형식) |
| 13 | 개인 파일 git 제외 | `.claude/worktrees/`만 | [SET] `settings.local.json`은 Claude Code가 만들 때 전역 excludes에 넣지만 손으로 만들면 직접 `.gitignore`. [MEM] `CLAUDE.local.md`는 `.gitignore`에 넣으라 | **추가** | `.gitignore`에 두 줄 |
| 14 | `settings.json` `$schema` | 없음 | [SET] `https://json.schemastore.org/claude-code-settings.json` | **추가** | 편집기 검증용 |

## 훅 측정(5번 근거)

이 워크트리에서 훅 명령을 그대로 재현했다.

| 경우 | 명령 | 결과 |
|---|---|---|
| 워크트리 세션 자신의 `dev.sh` | `./dev.sh format:file packages/engine/src/index.ts` | 0.6초. 이 워크트리용 compose 프로젝트의 볼륨·네트워크를 새로 만들고, `node_modules`가 비어 있어 아무것도 안 함(성공으로 끝남) |
| 서브에이전트가 워크트리에서 편집(`CLAUDE_PROJECT_DIR`=메인) · 엔진 파일 | 메인 `dev.sh format:file <워크트리 절대경로>/packages/engine/src/zz.ts` | 메인 체크아웃의 oxfmt가 워크트리 파일을 포맷함(체크아웃 간 결합) |
| 같은 조건 · web 파일 | 메인 `dev.sh format:file <워크트리 절대경로>/packages/web/src/zz.ts` | `packages/web/*` 분기에 안 걸려 oxfmt로 가고, oxfmt가 "All matched files may have been excluded by ignore rules"로 건너뜀. **Prettier는 한 번도 안 돈다.** `.svelte`는 분기 자체가 없어 즉시 종료 |

즉, Claude가 주로 맡는 Svelte UI를 워크트리에서 작업할 때 훅은 매 편집마다 컨테이너만 띄우고 효과가 없었다. 실패도 전부 숨겨져 아무도 알 수 없었다. 고쳐 쓰려면 입력 JSON의 `cwd`로 체크아웃을 찾고 워크트리마다 `install`을 보장해야 하며, 진입점 교체 PR 뒤 다시 고쳐야 한다. 포맷은 이미 `lint`가 CI에서 결정적으로 검사하므로 편집 시점 강제는 필요 없다고 판단했다. 부수 발견: 워크트리마다 `p2p-gostop-agent-*_node_modules` 볼륨과 네트워크가 남는다(감사 시점 각 15개, 이 감사의 재현으로 생긴 1쌍은 지웠다). 훅 제거로 편집마다 생기던 몫은 사라진다.

## 권한 설계 메모(7번)

- `Bash(./dev.sh test *)`는 `./dev.sh test`와 `./dev.sh test <인자>`를 허용하고 `test:watch`·`test:browser`는 허용하지 않는다(공백 뒤 `*` 규칙). `./dev.sh npm *`, `sh:*`, `dev:web`, `relay`, `apk:release`는 임의 명령·장기 실행·서명이라 허용하지 않는다.
- 앞쪽 와일드카드(`*/dev.sh test*`)는 `rm -rf x/dev.sh test`에도 걸리므로 쓰지 않았다. 그래서 워크트리에서도 `./dev.sh`(상대 경로)로 불러야 허용된다.
- `ask`는 auto 모드에서도 묻는다. 브랜치 보호는 비공개 무료 저장소라 쓸 수 없어(`gh api …/branches/main/protection` → 403 "Upgrade to GitHub Pro") 이 규칙이 main 보호의 유일한 로컬 안전망이다. 다만 `git -C . push` 같은 변형은 못 막는다(문서 명시).
- `deny`의 `Read(*.jks)` 등은 `.gitignore`의 서명 키 패턴과 같다. 파일 도구 기준 차단이며 보안 경계는 아니다.

## 사용자 선택이 필요한 것

1. **허용 목록 폭**: 지금은 검증 태스크와 gh 조회만. `./dev.sh format`, `git commit *`, `gh pr create *`까지 넓히면 프롬프트가 더 줄지만 auto 모드 분류기 검토도 건너뛴다.
2. **main 직접 푸시**: 최근 main에 `docs(plan)` 같은 직접 커밋이 있다. `Bash(git push * main)`을 `ask`로 두어 매번 확인을 받게 했다. 오케스트레이터가 main에 직접 푸시하는 흐름을 유지하려면 그대로 두고 매번 승인, 금지하려면 `deny`로 올린다.
3. **Svelte MCP 실행 위치**: 호스트 `npx`(현재, 세션 시작이 빠르고 Docker가 꺼져 있어도 동작) 대 `docker run --rm -i node:24-bookworm-slim npx -y @sveltejs/mcp@0.1.26`(Docker 전용 원칙에 맞지만 Docker가 꺼져 있으면 MCP가 안 뜸). 현재 유지, AGENTS.md에 예외로 명시했다.
4. **effort 값**: reviewer medium, implementer high, hygiene low는 기존 선택을 유지했다. 문서상 모두 유효한 값이다.

## 범위 밖 후속(이 PR에서 고치지 않음)

- `dev.sh`: `format:file` 태스크와 "PostToolUse 훅용" 주석이 이제 쓰이지 않는다. `ci` 태스크에 `test:browser`가 빠져 `ci.yml`과 어긋난다(ci.yml 67행은 돈다). 진입점 교체 PR에서 함께 정리한다.
- 진입점 교체 PR이 병합되면 `AGENTS.md` 4·5장과 `.claude/settings.json`의 `./dev.sh …` 허용 규칙을 새 명령 형태로 바꾼다.
- 남은 워크트리 볼륨 정리(`docker volume ls | grep p2p-gostop-agent-`)는 사용자 판단(권한 `ask` 대상).
- `docs/research/agent-era-stack.md`의 "PostToolUse 포맷 훅" 권고는 조사 기록이라 그대로 두고, 채택 결과는 `plan.md`와 이 문서가 정본이다.
- `plan.md` 트랙 표의 "hygiene(Sonnet, low)" 등 에이전트 이름은 그대로 유효하다(이름 유지).

## 검증

- 정적 검사(`node:24-bookworm-slim` 컨테이너, `yaml@2.8.1`): 에이전트 3개·스킬 3개 프런트매터 파싱, 필드 이름이 문서 표 안에 있는지, `effort`·`model`·`isolation`·`context`·`agent` 값, `allowed-tools` 규칙 형식, `settings.json` 규칙 41개 형식과 `hooks` 제거, `.mcp.json` 버전, `@AGENTS.md` 경로, 새·수정 파일이 가리키는 문서 경로 10개 존재 → `ALL OK`. 처음 돌렸을 때 `hygiene` 설명의 `예: `가 YAML 매핑으로 읽혀 파싱이 실패했고(원래 파일에는 없던 문제), 문구를 고쳐 통과시켰다.
- 실제 로드(`claude -p … --debug-file`, 2.1.280, 워크트리에서): `Loaded … project: 3` 스킬, 에이전트 로드 오류 없음, `MCP server "svelte": Successfully connected (transport: stdio) in 2847ms`. 신뢰하지 않은 작업 공간에서는 `Ignoring 21 permissions.allow entries … not been trusted`가 뜬다(문서대로, 대화형으로 한 번 신뢰하면 적용). 사용자 전역 스킬·플러그인을 합쳐 스킬 목록이 예산(8000자)을 넘어 설명이 잘린다는 경고가 있다. 이번에 넣은 스킬 중 둘은 `disable-model-invocation: true`라 모델 목록 부담이 작다.
