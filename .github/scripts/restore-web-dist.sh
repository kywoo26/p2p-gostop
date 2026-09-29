#!/usr/bin/env bash
# B1: 같은 SHA의 성공한 main push CI에서만 재사용. 누락/만료/할당량 초과는 격리 빌드로 복귀.
set -euo pipefail
out="$RUNNER_TEMP/web-dist"
mkdir -p "$out"
echo 'reused=false' >> "$GITHUB_OUTPUT"
run_id=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs?head_sha=$GITHUB_SHA&branch=main&event=push&status=success&per_page=1" \
  --jq '.workflow_runs[0].id // empty')
if [ -z "$run_id" ]; then
  echo '재사용할 main CI가 없습니다. 격리 웹 빌드를 실행합니다.'
  exit 0
fi
if gh run download "$run_id" --repo "$GITHUB_REPOSITORY" --name web-dist --dir "$out" && [ -f "$out/index.html" ]; then
  echo "main CI $run_id, SHA $GITHUB_SHA 웹 번들 재사용"
  echo 'reused=true' >> "$GITHUB_OUTPUT"
else
  # 부분 다운로드도 남기지 않는다.
  rm -rf "$out"
  mkdir -p "$out"
  echo '아티팩트를 사용할 수 없습니다. 격리 웹 빌드를 실행합니다.'
fi
