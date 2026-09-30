---
name: review-pr
description: PR 번호를 받아 reviewer 서브에이전트(코드 수정 불가)로 spec/plan·AGENTS.md 대비 표준 검토를 돌리고 판정과 결함 표를 돌려받는다.
argument-hint: <pr-number>
disable-model-invocation: true
context: fork
agent: reviewer
allowed-tools: Bash(gh pr view *) Bash(gh pr diff *) Bash(gh pr checks *) Bash(gh issue view *)
---

PR #$ARGUMENTS 를 검토한다. 공통 작업 계약은 `intent/plan.md` §3이며 AGENTS.md가 단일 규범이다.

1. `gh pr view $ARGUMENTS --json title,body,headRefName,headRefOid,baseRefName,files,commits`로 범위를 잡고, 본문과 커밋 메시지에서 요구사항 ID를 모은다. ID가 없으면 그것 자체를 "중요" 결함으로 적는다.
2. 본문의 수락 기록·실제 계획 commit full SHA를 읽어 그 시점의 plan과 spec 요구를 확인한다. 파일/순서/위험/증명·소유 인계를 실제 diff와 비교하고 승인된 이탈이 코드와 같은 commit의 계획에 반영됐는지 확인한다. 기존 작업은 현행 보완을 확인하고 소급 최초 계획 SHA를 만들게 하지 않는다.
3. `gh pr checks $ARGUMENTS`와 해당 CI run의 headSha를 PR의 현재 headRefOid와 대조한다. run 조회는 reviewer의 읽기 도구 범위에서 수행하며 접근할 수 없으면 동일 head 미확인을 보고한다. 녹색이 아니면 실패/진행 중 잡과 원인을 먼저 적는다. 이전 head 녹색·구현자 로컬 보고·실기기 수용을 섞지 않는다.
4. `gh pr diff $ARGUMENTS`를 읽고 아래 체크리스트를 적용한다.
   - 요구사항 ID별 충족·부분·미충족과 근거(파일:라인, 테스트 이름)
   - AGENTS.md 3장 금지 목록(Svelte 4 문법, 비보안 컨텍스트 API, 엔진 부수효과·`Math.random`, 툴체인 경계, erasable TS 문법)
   - 새 의존성이 AGENTS.md 2장 버전 표에 있는지, 없으면 intent/plan.md 1.8 근거가 있는지
   - 규칙 로직 변경이면 벡터에 규칙 ID·한국어 설명, 정상·경계·반례 3종이 있는지
   - PR이 소유 범위 밖 파일을 바꿨는지
5. reviewer 시스템 프롬프트의 보고 형식으로 끝낸다.

검토 결과는 호출한 세션으로 돌아간다. 파일(`docs/reviews/`)로 남길지, PR 코멘트로 올릴지는 호출한 쪽이 사용자 지시에 따라 정한다.
