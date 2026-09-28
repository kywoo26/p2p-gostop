#!/usr/bin/env bash
# p2p-gostop 작업 진입점. 네이티브에 아무것도 설치하지 않고 Docker 컨테이너에서 실행한다.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 워크트리를 여러 개 동시에 쓰기 위해 체크아웃별로 compose 프로젝트(=볼륨 네임스페이스)를 분리한다.
# 메인 체크아웃(p2p-gostop)은 기존 이름을 유지해 볼륨을 재사용한다.
base="$(basename "$ROOT")"
if [ "$base" = "p2p-gostop" ]; then export COMPOSE_PROJECT_NAME="p2p-gostop"; else export COMPOSE_PROJECT_NAME="p2p-gostop-$(echo "$base" | tr -c 'a-z0-9\n' '-')"; fi
COMPOSE=(docker compose -f "$ROOT/docker/compose.yml")

if ! docker info >/dev/null 2>&1; then
  echo "Docker가 실행 중이 아닙니다. Windows 호스트에서 Docker Desktop을 켜고 WSL 통합을 확인하세요." >&2
  exit 1
fi

run() { local svc="$1"; shift; "${COMPOSE[@]}" run --rm "$svc" "$@"; }

# 명명된 볼륨(node_modules)은 처음 만들어질 때 root 소유다. 컨테이너는 uid 1000으로 돌므로 소유자를 맞춘다.
fix_volume_owner() { "${COMPOSE[@]}" run --rm --no-deps --user root node chown 1000:1000 /work/node_modules; }

# PostToolUse 훅용: 파일 하나를 해당 툴체인으로 포맷한다 (web → Prettier, 나머지 → oxfmt).
format_file() {
  local f="${1:-}"
  [ -n "$f" ] || return 0
  f="${f#"$ROOT"/}"
  case "$f" in /* | ../*) return 0 ;; esac
  [ -f "$ROOT/$f" ] || return 0
  local tool
  case "$f" in
    packages/web/*.ts | packages/web/*.js | packages/web/*.mjs | packages/web/*.svelte | packages/web/*.json | packages/web/*.css | packages/web/*.html)
      tool="node_modules/.bin/prettier --log-level warn --write" ;;
    packages/web/*) return 0 ;;
    *.ts | *.js | *.mjs | *.json | *.css | *.yml | *.yaml) tool="node_modules/.bin/oxfmt" ;;
    *) return 0 ;;
  esac
  "${COMPOSE[@]}" run --rm -T node sh -c "[ -x node_modules/.bin/oxfmt ] || exit 0; exec $tool \"\$0\"" "$f"
}

task="${1:-help}"; shift || true
case "$task" in
  install)      fix_volume_owner; run node npm ci "$@" ;;
  npm)          run node npm "$@" ;;
  test)         run node npm test -- "$@" ;;
  test:watch)   run node npm run test:watch -- "$@" ;;
  test:browser) run e2e npm run test:browser -w packages/web -- "$@" ;;
  lint)         run node npm run lint "$@" ;;
  lint:fix)     run node npm run lint:fix "$@" ;;
  format)       run node npm run format "$@" ;;
  format:file)  format_file "$@" ;;
  check)        run node npm run check "$@" ;;
  build:web)    run node npm run build -w packages/web "$@" ;;
  dev:web)      "${COMPOSE[@]}" run --rm --service-ports node npm run dev -w packages/web -- "$@" ;;
  relay)        "${COMPOSE[@]}" run --rm --service-ports node npm run start -w packages/relay-dev ;;
  e2e)          run e2e npm run e2e -w packages/web -- "$@" ;;
  sim)          run node npm run sim -- "$@" ;;
  apk:debug)    run android bash -c "cd android && ./gradlew --no-daemon assembleDebug $*" ;;
  apk:release)  run android bash -c "cd android && ./gradlew --no-daemon assembleRelease $*" ;;
  android:test) run android bash -c "cd android && ./gradlew --no-daemon testDebugUnitTest lint $*" ;;
  sh:node)      run node bash ;;
  sh:android)   run android bash ;;
  pull)         "${COMPOSE[@]}" pull ;;
  help|*)
    cat <<'USAGE'
사용법: ./dev.sh <task> [args]
  install        npm ci (node 컨테이너, node_modules 볼륨 소유자 보정 포함)
  npm <args>     node 컨테이너에서 npm 실행 (예: ./dev.sh npm install -D foo -w packages/web)
  test           단위·속성·계약 테스트 (Node)
  test:watch     감시 모드
  test:browser   웹 컴포넌트 테스트 (Vitest 브라우저 모드, Chromium + WebKit)
  lint           oxlint + oxfmt(순수 TS) / ESLint + Prettier(web) 검사
  lint:fix       위 두 툴체인 자동 수정
  format         oxfmt + Prettier 포맷
  format:file F  파일 하나 포맷 (PostToolUse 훅용)
  check          tsc 7(순수 TS) / svelte-check + tsc 6(web) + knip
  build:web      웹 앱 빌드 + 번들 예산·외부 URL 검사 (packages/web/dist)
  dev:web        Vite 개발 서버 (http://localhost:5173)
  relay          개발 중계 서버 (ws://localhost:17777/ws?role=host|guest)
  e2e            Playwright E2E (Chromium + WebKit)
  sim            셀프플레이 시뮬레이션 CLI
  apk:debug      Android 디버그 APK
  apk:release    Android 릴리스 APK (서명 환경변수 필요)
  android:test   Android 단위 테스트 + Lint
  sh:node        node 컨테이너 셸
  sh:android     android 컨테이너 셸
  pull           이미지 미리 받기
USAGE
    ;;
esac
