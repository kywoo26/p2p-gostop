#!/usr/bin/env bash
# 호스트 로컬 표준 준비 (AGENTS.md §5, plan §2). 처음 한 번, 그리고 @playwright/test 버전이 바뀐 뒤 실행한다.
#   tools/host/setup.sh
# sudo를 부르지 않는다. 시스템 의존성이 빠졌으면 사람이 실행할 명령만 출력하고 실패한다.
set -euo pipefail
cd "$(dirname "$0")/../.."

# 1) Node: package.json engines(>=24.20.0 <25). nvm 공식 절차(https://github.com/nvm-sh/nvm#nvmrc): nvm install → nvm use (.nvmrc)
node_version=$(node -p 'process.versions.node' 2>/dev/null || echo none)
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a===24&&b>=20?0:1)' 2>/dev/null; then
  echo "Node ${node_version}은 engines(>=24.20.0 <25) 밖입니다. 'nvm install && nvm use' 후 다시 실행하세요." >&2
  exit 1
fi
echo "Node ${node_version} (engines 충족)"

# 2) 의존성: node_modules가 없으면 설치한다(lock 변경 뒤에는 직접 npm ci).
[[ -d node_modules ]] || npm ci

# 3) Playwright 브라우저: lock의 playwright 버전에 맞는 빌드를 ~/.cache/ms-playwright에 받는다(sudo 불필요).
npx playwright install chromium webkit

# 4) WebKit 시스템 라이브러리 확인: 실제로 띄워 본다.
if node --input-type=module -e "import { webkit } from 'playwright'; await (await webkit.launch()).close();" 2>/dev/null; then
  echo "Chromium·WebKit 준비 완료: npm run verify"
else
  cat >&2 <<'MESSAGE'
WebKit 시스템 라이브러리가 없습니다(GStreamer·GTK4 등, apt). 사람이 한 번 Playwright 공식 명령을 실행합니다
(https://playwright.dev/docs/browsers#install-system-dependencies, root가 아니면 Playwright가 sudo 암호를 묻는다):
  npx playwright install --with-deps chromium webkit
에이전트는 sudo를 쓰지 않는다. 설치 전에는 WebKit이 필요한 검증을 이미지에서 돌린다:
  docker compose run --rm dev npm run test:browser
  docker compose run --rm dev npm run e2e -w packages/web
MESSAGE
  exit 1
fi
