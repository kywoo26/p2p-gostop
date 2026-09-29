@AGENTS.md

<!-- 유지보수 메모(컨텍스트에서 제거됨): 규범은 AGENTS.md 한 곳(Codex 등 다른 도구도 읽음). 여기에는 Claude Code에만 해당하는 것만 둔다.
     하네스(.claude/agents, skills, settings.json, .mcp.json) 설계 근거는 docs/reviews/README.md. -->

# Claude Code 전용
- 라이브러리 문서는 Context7(`resolve-library-id` → `query-docs`)로 조회한다.
- Svelte는 Svelte MCP(`.mcp.json`의 `svelte`)를 쓴다: 문서는 `list-sections` → `get-documentation`, `.svelte` 컴포넌트를 쓰거나 고친 뒤에는 `svelte-autofixer`가 문제를 보고하지 않을 때까지 고친다.
