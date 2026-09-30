# PC 공개 중계 수동 운영 (FR-RP-07 · NF-RP-06 · RP-03B)

Windows의 Docker Desktop WSL2 통합과 Windows Tailscale 앱을 사용한다. 게임할 때만 켜고 끝나면 끈다. 정본은 [spec §13](../../spec.md)·[plan §1.9](../../plan.md)이다.

## 간단 기동 가이드 (Windows PowerShell)

최초 준비가 끝난 release 저장소와 수정된 `tools/relay` 폴더를 사용한다. 아래 **두 placeholder만 자신의 경로로 바꾼다**. `<Windows도구폴더>`는 `start.cmd`가 있는 Windows 절대 경로이며, WSL 파일이면 `\\wsl.localhost\<WSL배포판>\...\tools\relay` 형식이다. bare UNC를 명령으로 입력하지 않는다.

```powershell
$env:RELAY_WSL_REPO = '<WSL저장소절대경로>'
$RelayTools = '<Windows도구폴더>'
& "$RelayTools\start.cmd"
```

1. Docker Desktop과 Windows Tailscale을 켜고 위 명령을 **Windows PowerShell**에서 실행한다. start/stop은 PATH의 `pwsh.exe` → 기본 PowerShell 7 설치 → Windows PowerShell 5.1 순서로 탐색한다. **7이 없을 때만** 5.1 fallback이며, 7 실패 후 자동 재기동하지 않는다. `Runtime: Core 7...` 또는 `Runtime: Desktop 5.1...`로 실제 버전을 표시한다. 준비된 이미지로 `up -d --no-build`하므로 재빌드는 필요 없다.
2. **`Relay ready:`가 나온 뒤** 출력된 `Health:` 주소를 열어 `relay=p2p-gostop`, `ready=true`를 확인한다. 승인 URL은 관리 콘솔에서 이 노드의 공개 권한을 허용하는 주소다. `Relay ready`의 공개 서비스 URL이 앱에 저장할 중계 기본 주소다.
3. 같은 release의 Galaxy 앱 원격 설정에 기본 주소와 생성 자격을 본인 화면에서만 등록한다. 앱에서 health 확인 → 방 생성 → **앱이 만든 초대 링크**를 iPhone Safari로 공유한다. wrapper QR은 중계 기본 주소이며 방 초대가 아니다. health 성공과 실제 게임 연결 성공은 구분한다.
4. 게임이 끝나면 **같은 PowerShell 창·같은 wrapper**에서 종료한다.

```powershell
& "$RelayTools\stop.cmd"
```

성공 출력은 `Relay Funnel endpoint disabled.` 또는 `No relay Funnel endpoint is active.`, 이어서 `Relay container stopped.`다. Ctrl+C로 foreground Funnel이 이미 꺼져 설정이 없으면 추가 off가 필요 없다. 이 상태의 `handler does not exist`는 해제할 대상이 없다는 뜻이다. 다른 endpoint, Tailscale 앱 자체, 로그인/부팅 설정은 변경하지 않는다. `--bg`는 사용하지 않는다.

탐색기는 `explorer.exe $RelayTools`로 열어 start/stop을 더블클릭할 수 있다. 이 방식은 먼저 Windows 사용자 환경변수에 `RELAY_WSL_REPO`를 설정한다. 5.1을 직접 지정하는 진단은 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$RelayTools\relay.ps1" start`이며, 종료는 마지막 인수만 `stop`으로 바꾼다. 스크립트 자체도 UTF-8 stdout/stderr와 exitcode를 명시적으로 처리하므로 콘솔 인코딩을 수동 변경할 필요가 없다.

## 최초 준비·release 변경 (WSL 셸)

현재 준비된 이미지에는 이 빌드를 반복하지 않는다. APK와 같은 정확한 release 태그·commit의 웹 번들을 준비할 때만 실행한다. Docker CLI는 WSL PATH에서 찾고, 없으면 `$HOME/.local/bin/docker`를 확인한다. 특수 설치는 Windows 환경변수 `RELAY_WSL_DOCKER`에 WSL 실행 파일 경로를 지정한다.

```sh
cd '<WSL저장소절대경로>'
source "$HOME/.nvm/nvm.sh"
nvm use
npm ci
npm run build -w packages/web
mkdir -p -m 700 "$HOME/.local/share/p2p-gostop/relay"
if ! test -f "$HOME/.local/share/p2p-gostop/relay/creation-secret"; then
  node tools/relay/create-credentials.ts "$HOME/.local/share/p2p-gostop/relay/creation-secret"
fi
export RELAY_CREATION_SECRET_PATH="$HOME/.local/share/p2p-gostop/relay/creation-secret"
export RELAY_ALLOWED_ORIGINS="http://127.0.0.1:17777,https://<Funnel공개호스트>"
export RELAY_RELEASE="$(git describe --tags --exact-match)"
# 설치된 Docker CLI로 실행한다.
RELAY_IMAGE_TAG=$(git rev-parse --short=12 HEAD) docker compose -f compose.relay.yaml build
```

자격 파일은 저장소 밖에 생성되며 기존 파일을 덮어쓰지 않는다. **생성 자격, 실제 status JSON/peer 정보, 초대값, 개인 경로/호스트는 채팅·Git·PR·공유 로그에 출력하지 않는다.** 자격 내용은 Galaxy 개인 설정에만 등록한다. start는 파일이 없으면 같은 외부 위치에 생성한다. 회전/폐기는 먼저 stop하고 방 종료를 확인한 뒤 별도 작업으로 한다. 재시작하면 메모리 방이 사라진다.

v0.3.1 운영 수정은 별도 wrapper 폴더에서 제공한다. 원본 release 태그·추적 파일·dist·이미지 SHA 태그는 유지한다. wrapper의 폴더 위치를 운영 중 이동하지 않는다. marker/QR은 wrapper 옆에 생성하며 QR는 파일로 직접 연다. `/version` release와 정적 경로를 확인한 뒤에만 공개한다. 다음 정식 release에서 수정 wrapper를 함께 배포한다.

## 실패 진단·검증

| 실패 | 확인할 것 |
|---|---|
| Docker/WSL prerequisite | Docker Desktop·WSL2 통합, `RELAY_WSL_REPO` 절대 경로, Docker CLI 탐색 |
| 로컬 health/version | 같은 release의 dist/이미지·자격 파일·고정 중계 포트 점유. WSL의 `docker compose -f compose.relay.yaml logs --tail=30 relay`를 개인적으로 확인 |
| Tailscale/Funnel | Windows 앱 연결·MagicDNS·이 노드 승인·443. 다른 endpoint를 대체하지 않음 |
| 공개 health | 로컬 health → Funnel 승인/설정 → Windows localhost 전달 → DNS/TLS 순서. 원인을 추측해 단정하지 않음 |
| stop 불완전 | 같은 wrapper stop 재실행. `funnel reset`/`tailscale down`은 사용하지 않음 |

텍스트 Funnel status는 foreground 설정을 누락할 수 있어 스크립트는 JSON의 `Foreground`도 검사한다. 서비스 기동 없는 회귀검사는 각 PowerShell에서 `check-native.ps1`·`check-runtime.ps1`을 `-File`로 실행한다. Node 정적 검사는 `node tools/relay/check-static.ts`. [운영 검증 근거](validation.md)와 [게임 실기기 절차](../../docs/device-test/remote-play.md)는 구분한다.
