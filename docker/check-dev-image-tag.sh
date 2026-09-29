#!/usr/bin/env bash
# plan.md §2: Dockerfile 변경 시 Compose 이미지 태그도 갱신한다.
set -euo pipefail

base=${1:-HEAD^1}
git rev-parse --verify "${base}^{commit}" >/dev/null

committed_changed=false
if ! git diff --quiet "$base" HEAD -- docker/Dockerfile; then
  committed_changed=true
fi
local_changed=false
if ! git diff --cached --quiet HEAD -- docker/Dockerfile || ! git diff --quiet -- docker/Dockerfile; then
  local_changed=true
fi
if [[ "$committed_changed" == false && "$local_changed" == false ]]; then
  exit 0
fi

image_tag() {
  sed -nE 's/^[[:space:]]*image:[[:space:]]*(p2p-gostop-dev:[0-9]+)([[:space:]#].*)?$/\1/p' | head -n 1
}

current=$(image_tag < compose.yaml)
if [[ -z "$current" ]]; then
  echo '::error::compose.yaml의 dev 이미지 태그가 없습니다.' >&2
  exit 1
fi

if [[ "$local_changed" == true ]]; then
  head_tag=$(git show HEAD:compose.yaml | image_tag)
  if [[ "$head_tag" == "$current" ]]; then
    echo "::error::미커밋 docker/Dockerfile 변경이 있지만 compose.yaml 이미지 태그($current)가 HEAD와 같습니다." >&2
    exit 1
  fi
fi

if [[ "$committed_changed" == false ]]; then
  echo "작업 트리 이미지 태그 갱신: $head_tag → $current"
  exit 0
fi

# 최초 도입 PR에는 base에 compose.yaml이 없다. 다음 Dockerfile 변경부터 태그를 비교한다.
if ! git cat-file -e "${base}:compose.yaml" 2>/dev/null; then
  echo "개발 이미지 첫 도입: $current"
  exit 0
fi

previous=$(git show "${base}:compose.yaml" | image_tag)
if [[ "$previous" == "$current" ]]; then
  echo "::error::docker/Dockerfile이 바뀌었지만 compose.yaml 이미지 태그($current)가 그대로입니다." >&2
  exit 1
fi
echo "개발 이미지 태그 갱신: $previous → $current"
