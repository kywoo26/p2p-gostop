#!/usr/bin/env bash
# 호스트 툴체인 준비 (AGENTS.md §5, plan §2). 처음 한 번, 그리고 .nvmrc·@playwright/test·Android 설정이 바뀐 뒤 실행한다.
#   tools/setup-host.sh
# 대상: Ubuntu 24.04(WSL2 포함, CI 러너와 같은 배포판). 여러 번 실행해도 이미 된 단계는 건너뛴다.
# 설치하는 것(버전은 AGENTS.md §2 표):
#   - Node: .nvmrc 버전 (nvm install)
#   - npm 의존성: npm ci (node_modules가 없을 때)
#   - apt(sudo): Playwright Chromium·WebKit 시스템 라이브러리(npx playwright install-deps),
#     openjdk-21-jdk-headless(Gradle), ffmpeg·libavif-bin(자산 변환 바이너리, PA-03), unzip
#   - uv 확인: 파이썬 스크립트는 PEP 723 메타데이터로 `uv run`이 의존성(Pillow·FontTools)을 받는다
#   - Playwright 브라우저: ~/.cache/ms-playwright (npx playwright install)
#   - Android SDK: $ANDROID_HOME(기본 ~/Android/Sdk)에 cmdline-tools + platforms;android-36·build-tools;36.0.0·platform-tools
# sudo 암호는 터미널에서 직접 실행할 때만 묻는다. 비대화형이면 그 단계를 보류로 남기고 끝에 알린다.
# 어떤 단계도 스크립트를 다시 실행(exec)하지 않는다. 각 단계는 설치 여부를 먼저 확인하므로 여러 번 실행해도 된다.
set -euo pipefail
cd "$(dirname "$0")/.."

pending=()
step() { printf '\n== %s\n' "$*"; }
interactive() { [[ -t 0 && -t 1 ]]; }
can_sudo() { [[ $(id -u) == 0 ]] || sudo -n true 2>/dev/null || interactive; }
as_root() { if [[ $(id -u) == 0 ]]; then "$@"; else sudo "$@"; fi; }

if ! grep -qs 'VERSION_ID="24.04"' /etc/os-release; then
  echo "경고: Ubuntu 24.04가 아니다. Playwright 의존성·apt 버전이 CI(ubuntu-24.04)와 다를 수 있다." >&2
fi

want_node=$(cat .nvmrc)
step "Node $want_node (.nvmrc)"
if [[ "$(node -v 2>/dev/null)" != "v$want_node" ]]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    echo "nvm이 없다. 공식 설치(https://github.com/nvm-sh/nvm#installing-and-updating) 뒤 다시 실행한다." >&2
    exit 1
  fi
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm install # .nvmrc를 읽는다. 이 스크립트 안에서만 전환되므로 셸에서는 'nvm use'.
fi
echo "node $(node -v), npm $(npm -v)"

step "npm 의존성"
# 디렉터리만 있고 설치가 중간에 끊긴 경우(.bin 없음)도 다시 설치한다.
if [[ -x node_modules/.bin/playwright ]]; then echo "node_modules 있음 (lock이 바뀌었으면 npm ci)"; else npm ci; fi

step "apt 패키지 (sudo)"
apt_pkgs=(openjdk-21-jdk-headless ffmpeg libavif-bin unzip)
missing=()
for p in "${apt_pkgs[@]}"; do
  dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q 'install ok installed' || missing+=("$p")
done
pw_deps_ok=true
npx playwright install-deps --dry-run chromium webkit >/dev/null 2>&1 || pw_deps_ok=false
if [[ ${#missing[@]} == 0 && $pw_deps_ok == true ]]; then
  echo "모두 설치됨"
elif can_sudo; then
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "설치: ${missing[*]}"
    as_root apt-get update
    as_root apt-get install -y --no-install-recommends "${missing[@]}"
  fi
  if [[ $pw_deps_ok == false ]]; then
    echo "설치: Playwright Chromium·WebKit 시스템 라이브러리 (npx playwright install-deps chromium webkit)"
    npx playwright install-deps chromium webkit # 공식 명령. root가 아니면 내부에서 sudo를 부른다.
  fi
else
  [[ ${#missing[@]} -gt 0 ]] && echo "보류: ${missing[*]}"
  [[ $pw_deps_ok == false ]] && echo "보류: Playwright Chromium·WebKit 시스템 라이브러리"
  pending+=("apt(sudo): 터미널에서 tools/setup-host.sh를 다시 실행")
fi

step "uv (파이썬 스크립트, PEP 723)"
if command -v uv >/dev/null; then
  uv --version
else
  echo "uv가 없다. 공식 설치(https://docs.astral.sh/uv/getting-started/installation/) 뒤 다시 실행한다."
  pending+=("uv 설치: https://docs.astral.sh/uv/getting-started/installation/")
fi

step "Playwright 브라우저 (Chromium·WebKit)"
npx playwright install chromium webkit

step "Android SDK"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
# cmdline-tools 23.0: https://dl.google.com/android/repository/repository2-3.xml 의 cmdline-tools;23.0
cmdline_build=16111833
cmdline_sha256=0877a1d048fe4a24efe2eff536ca4223f7adeb58648bb81909d33c446918cfa8
sdkmanager="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [[ ! -x "$sdkmanager" ]]; then
  echo "설치: cmdline-tools $cmdline_build → $ANDROID_HOME/cmdline-tools/latest"
  tmp=$(mktemp -d)
  curl -fsSLo "$tmp/tools.zip" "https://dl.google.com/android/repository/commandlinetools-linux-${cmdline_build}_latest.zip"
  echo "$cmdline_sha256  $tmp/tools.zip" | sha256sum -c -
  unzip -q "$tmp/tools.zip" -d "$tmp"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi
sdk_pkgs=("platforms;android-36" "build-tools;36.0.0" "platform-tools")
sdk_missing() {
  local p
  for p in "${sdk_pkgs[@]}"; do [[ -d "$ANDROID_HOME/${p//;//}" ]] || printf '%s\n' "$p"; done
}
mapfile -t todo < <(sdk_missing)
if [[ ${#todo[@]} -gt 0 ]]; then
  echo "설치: ${todo[*]}"
  # cmdline-tools 23.0의 sdkmanager는 Android CLI(https://d.android.com/tools/agents/android-cli, `android sdk install`)로
  # 위임된다. `--licenses`는 "no longer needed" 경고만 내고 파일을 만들지 않으며, 설치 명령이 묻지 않고
  # licenses/android-sdk-license를 기록한다(2026-09-30 실측). 문서의 `android sdk install`에도 동의 옵션이 없다.
  # 구버전 sdkmanager면 설치가 동의를 물으므로 터미널에서는 그대로 입력을 받고, 비대화형이면 stdin을 닫아 실패시킨다.
  if interactive; then
    "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "${todo[@]}" || true
  else
    "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "${todo[@]}" </dev/null >/dev/null || true
  fi
  mapfile -t todo < <(sdk_missing)
fi
if [[ ${#todo[@]} -gt 0 ]]; then
  pending+=("Android SDK 패키지: 터미널에서 $sdkmanager --sdk_root=\"$ANDROID_HOME\" --install$(printf ' "%s"' "${todo[@]}")")
else
  echo "SDK: $(ls "$ANDROID_HOME/platforms") / build-tools $(ls "$ANDROID_HOME/build-tools") / licenses $(ls "$ANDROID_HOME/licenses" 2>/dev/null | tr '\n' ' ')"
fi
# Gradle(AGP)은 ANDROID_HOME으로 SDK를 찾는다. 셸 설정에 한 번만 추가한다.
case "${SHELL##*/}" in zsh) rc="$HOME/.zshenv" ;; *) rc="$HOME/.bashrc" ;; esac
if ! grep -qs 'ANDROID_HOME=' "$rc"; then
  echo "export ANDROID_HOME=\"$ANDROID_HOME\" # p2p-gostop tools/setup-host.sh" >> "$rc"
  echo "추가: $rc 에 ANDROID_HOME (새 셸부터 적용)"
fi

step "요약"
echo "node $(node -v) · npm $(npm -v) · playwright $(npx playwright --version)"
javac -version 2>&1 || echo "javac 없음"
dpkg-query -W -f='${Package} ${Version}\n' ffmpeg libavif-bin 2>/dev/null || true
if [[ ${#pending[@]} -gt 0 ]]; then
  printf '\n보류된 단계 (사람이 터미널에서 실행):\n'
  printf '  - %s\n' "${pending[@]}"
  exit 1
fi
echo "준비 완료: npm run verify"
