#!/bin/sh
# 폐기됨(plan.md M6에서 삭제): 진행 중인 브랜치가 옛 진입점을 부르면 새 명령을 안내하고 실패한다. AGENTS.md 5장 참조.
echo "dev.sh는 폐기되었습니다. 대신: docker compose run --rm dev npm run ${1:-<script>}  (Android: docker compose run --rm dev android/gradlew -p android <task>, 전체 목록: AGENTS.md 5장)" >&2; exit 1
