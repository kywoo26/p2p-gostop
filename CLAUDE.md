@AGENTS.md

# Claude Code 전용 보충
- 작업 전 `plan.md`의 현재 마일스톤과 `spec.md`의 관련 요구사항 ID를 확인하고, 커밋 메시지·PR에 ID를 적는다.
- 라이브러리 문서는 Context7(`resolve-library-id` → `query-docs`)로 조회한다.
- 빌드·테스트는 `docker compose run --rm dev <명령>`(AGENTS.md 5장). Dev Container 안에서 실행 중이면 `<명령>`을 그대로 쓴다.
- PostToolUse 훅(`.claude/settings.json`)은 편집한 파일이 속한 체크아웃에서 `docker compose run --rm -T dev npm run format:file -- <경로>`를 부른다(web은 Prettier, 나머지는 oxfmt). 그 체크아웃에 `node_modules`가 없으면 조용히 건너뛰므로 워크트리를 만들면 먼저 `npm ci`를 한다.
- 실기기 검증 항목(핫스팟, iPhone Safari)은 사람이 한다. `docs/device-test/`의 절차서를 갱신하고 결과 로그를 그곳에 남긴다.
