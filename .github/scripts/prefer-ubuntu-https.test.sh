#!/usr/bin/env bash
# 실제 /etc·sudo·네트워크에 접근하지 않는 NF-09 설치 경계 검증.
set -euo pipefail
script_dir=$(cd "$(dirname "$0")" && pwd)
fixture_dir=$(mktemp -d)
trap 'rm -rf "$fixture_dir"' EXIT
mirror_list_file="$fixture_dir/apt-mirrors.txt"
original=$'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3'
printf '%s\n' "$original" > "$mirror_list_file"
printf '%s\n' 'URIs: mirror+file:/etc/apt/apt-mirrors.txt' 'Suites: noble noble-updates noble-backports noble-security' 'Components: main restricted universe multiverse' 'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg' > "$fixture_dir/ubuntu.sources"
printf '%s\n' 'Package: pinned-fixture' 'Pin: version 1.0' 'Pin-Priority: 1001' > "$fixture_dir/preferences"
printf '%s\n' 'deb [signed-by=/usr/share/keyrings/vendor-fixture.gpg] https://vendor.invalid/deb stable main' > "$fixture_dir/vendor.list"
cp "$fixture_dir/ubuntu.sources" "$fixture_dir/ubuntu.sources.before"
cp "$fixture_dir/preferences" "$fixture_dir/preferences.before"
cp "$fixture_dir/vendor.list" "$fixture_dir/vendor.list.before"
bash "$script_dir/prefer-ubuntu-https.sh" "$mirror_list_file"
# 파일 순서와 별개로 낮은 priority가 먼저다. 호스트·스킴·경로는 기존 목록 그대로여야 한다.
[[ $(awk '$2 == "priority:1" { print $1 }' "$mirror_list_file") == 'https://archive.ubuntu.com/ubuntu/' ]]
[[ $(awk '$2 == "priority:2" { print $1 }' "$mirror_list_file") == 'https://security.ubuntu.com/ubuntu/' ]]
[[ $(awk '$2 == "priority:3" { print $1 }' "$mirror_list_file") == 'http://azure.archive.ubuntu.com/ubuntu/' ]]
[[ $(wc -l < "$mirror_list_file") -eq 3 ]]
cp "$mirror_list_file" "$fixture_dir/preferred"
bash "$script_dir/prefer-ubuntu-https.sh" "$mirror_list_file"
cmp -s "$mirror_list_file" "$fixture_dir/preferred"
for file in ubuntu.sources preferences vendor.list; do
  cmp -s "$fixture_dir/$file" "$fixture_dir/$file.before"
done
# 새 임의 미러·형식 변경·누락·symlink는 조용히 허용하지 않는다.
for invalid in "${original}"$'\nhttps://unknown.invalid/ubuntu/\tpriority:4' "${original/priority:1/priority:9}"; do
  printf '%s\n' "$invalid" > "$mirror_list_file"
  cp "$mirror_list_file" "$fixture_dir/invalid.before"
  if bash "$script_dir/prefer-ubuntu-https.sh" "$mirror_list_file" >/dev/null 2>&1; then
    echo '알 수 없는 미러 구성을 허용했다.' >&2
    exit 1
  fi
  cmp -s "$mirror_list_file" "$fixture_dir/invalid.before"
done
if bash "$script_dir/prefer-ubuntu-https.sh" "$fixture_dir/missing" >/dev/null 2>&1; then exit 1; fi
ln -s "$mirror_list_file" "$fixture_dir/link"
if bash "$script_dir/prefer-ubuntu-https.sh" "$fixture_dir/link" >/dev/null 2>&1; then exit 1; fi
if bash "$script_dir/prefer-ubuntu-https.sh" "$mirror_list_file" extra >/dev/null 2>&1; then exit 1; fi
echo 'Ubuntu HTTPS 미러 합성 검증 통과: 우선순위·멱등성·서명/핀/타 저장소 보존·미지원 무변경 실패'
