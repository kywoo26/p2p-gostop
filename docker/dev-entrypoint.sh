#!/bin/sh
# plan.md §2: 옛 볼륨의 root 소유 마운트 자리를 명확히 알린다.
set -eu

if [ "$(id -u)" != 0 ] && [ -d /work/node_modules ] && [ ! -w /work/node_modules ]; then
  cat >&2 <<'MESSAGE'
node_modules에 쓸 수 없습니다. 옛 개발 환경이 남긴 root 소유 디렉터리일 수 있습니다.
비어 있다면 호스트에서 'rmdir node_modules'를 실행하세요.
내용이 있다면 'docker compose run --rm --user root dev chown -R 1000:1000 /work/node_modules'로 소유권을 고치세요.
그 뒤 'docker compose run --rm dev npm ci'를 다시 실행하세요. 자세한 절차: AGENTS.md §5.
MESSAGE
  exit 1
fi

exec "$@"
