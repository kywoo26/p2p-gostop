#!/usr/bin/env bash
# NF-09 / plan §1.8: GitHub Ubuntu 러너의 기존 미러만 재정렬한다. 호스트 설치에는 호출하지 않는다.
# 인수는 합성 검증용 파일 경로이며 CI에서는 기본 경로만 쓴다.
set -euo pipefail
if [[ $# -gt 1 ]]; then
  echo '사용법: prefer-ubuntu-https.sh [검증용 미러 파일]' >&2
  exit 64
fi
mirror_list_file=${1:-/etc/apt/apt-mirrors.txt}
original=$'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3'
preferred=$'http://azure.archive.ubuntu.com/ubuntu/\tpriority:3\nhttps://archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://security.ubuntu.com/ubuntu/\tpriority:2'
if [[ ! -f "$mirror_list_file" || -L "$mirror_list_file" ]]; then
  echo '지원하는 GitHub Ubuntu 미러 파일이 없다. 러너 설정을 검토해야 한다.' >&2
  exit 1
fi
current=$(cat -- "$mirror_list_file")
case "$current" in
  "$original") printf '%s\n' "$preferred" > "$mirror_list_file" ;;
  "$preferred") ;;
  *)
    echo 'GitHub Ubuntu 미러 형식이 예상과 다르다. 변경 없이 중단한다.' >&2
    exit 1
    ;;
esac
# sources·suite·component·Signed-By·신뢰 키·핀은 쓰지 않는다. APT 서명 검증은 그대로 적용된다.
echo 'Ubuntu apt: 기존 HTTPS archive → HTTPS security → Azure fallback 우선순위 적용'
