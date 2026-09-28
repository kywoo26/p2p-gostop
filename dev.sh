#!/usr/bin/env bash
# p2p-gostop 작업 진입점. 네이티브에 아무것도 설치하지 않고 Docker 컨테이너에서 실행한다.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "$ROOT/docker/compose.yml")

if ! docker info >/dev/null 2>&1; then
  echo "Docker가 실행 중이 아닙니다. Windows 호스트에서 Docker Desktop을 켜고 WSL 통합을 확인하세요." >&2
  exit 1
fi

run() { local svc="$1"; shift; "${COMPOSE[@]}" run --rm "$svc" "$@"; }

task="${1:-help}"; shift || true
case "$task" in
  install)      run node npm ci "$@" ;;
  test)         run node npm test -- "$@" ;;
  test:watch)   run node npm run test:watch -- "$@" ;;
  lint)         run node npm run lint "$@" ;;
  check)        run node npm run check "$@" ;;
  build:web)    run node npm run build -w packages/web "$@" ;;
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
  install        npm ci (node 컨테이너)
  test           전체 단위·속성·계약 테스트
  test:watch     감시 모드
  lint           ESLint + Prettier 검사
  check          svelte-check + tsc + knip
  build:web      웹 앱 빌드 (packages/web/dist)
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
