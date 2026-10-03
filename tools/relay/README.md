# PC 공개 중계 수동 운영 (FR-RP-07 · NF-RP-06 · RP-03B)

Windows의 Docker Desktop WSL2 통합과 Windows Tailscale 앱을 사용한다. 운영 중인 서비스는 전환 검토 전까지 유지하며, 종료는 아래 소유 wrapper 절차로만 한다. 정본은 [spec §13](../../intent/spec.md)·[plan §1.9](../../intent/plan.md)이다.

## 간단 기동 가이드 (Windows PowerShell)

최초 준비가 끝난 release 저장소와 수정된 `tools/relay` 폴더를 사용한다. 아래 **두 placeholder만 자신의 경로로 바꾼다**. `<Windows도구폴더>`는 `start.cmd`가 있는 Windows 절대 경로이며, WSL 파일이면 `\\wsl.localhost\<WSL배포판>\...\tools\relay` 형식이다. bare UNC를 명령으로 입력하지 않는다.

```powershell
$env:RELAY_WSL_REPO = '<WSL저장소절대경로>'
$RelayTools = '<Windows도구폴더>'
& "$RelayTools\start.cmd"
```

1. Docker Desktop과 Windows Tailscale을 켜고 위 명령을 **Windows PowerShell**에서 실행한다. start/stop은 절대 경로 PATH의 `pwsh.exe` → 기본 PowerShell 7 설치 → Windows PowerShell 5.1 순서로 탐색하며, 현재 폴더를 암묵적으로 검색하지 않는다. 선택한 실행 파일의 제품 정보와 Core 7 정체를 확인한다. **7이 없을 때만** 5.1 fallback이며, 7 실패 후 자동 재기동하지 않는다. `Runtime: Core 7...` 또는 `Runtime: Desktop 5.1...`로 실제 버전을 표시한다. 준비된 이미지로 별도 소유 프로젝트에 `up -d --no-build --no-recreate --pull never`하므로 재빌드는 필요 없다.
2. **`Relay ready:`가 나온 뒤** 출력된 `Health:` 주소를 열어 `relay=p2p-gostop`, `ready=true`를 확인한다. 승인 URL은 관리 콘솔에서 이 노드의 공개 권한을 허용하는 주소다. `Relay ready`의 공개 서비스 URL이 앱에 저장할 중계 기본 주소다.
3. 같은 release의 Galaxy 앱 원격 설정에 기본 주소와 생성 자격을 본인 화면에서만 등록한다. 앱에서 health 확인 → 방 생성 → **앱이 만든 초대 링크**를 iPhone Safari로 공유한다. wrapper QR은 중계 기본 주소이며 방 초대가 아니다. health 성공과 실제 게임 연결 성공은 구분한다.
4. 게임이 끝나면 **같은 PowerShell 창·같은 wrapper**에서 종료한다.

```powershell
& "$RelayTools\stop.cmd"
```

소유 자원이 있으면 성공 출력은 `Relay Funnel endpoint disabled.`, 이어서 `Relay container stopped.`다. marker가 없으면 `No resources are owned by this wrapper; nothing was changed.`로 끝나며 기존 서비스를 정리하지 않는다. Ctrl+C로 foreground Funnel이 이미 꺼져 설정이 없으면 추가 off가 필요 없다. 이 상태에서 수동 off의 `handler does not exist`는 해제할 대상이 없다는 뜻이다. wrapper는 off/reset을 호출하지 않는다. 다른 endpoint, Tailscale 앱 자체, 로그인/부팅 설정은 변경하지 않는다. `--bg`는 사용하지 않는다.

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

v0.3.1 운영 수정은 별도 wrapper 폴더에서 제공한다. 원본 release 태그·추적 파일·dist·이미지 SHA 태그는 유지한다. wrapper의 폴더 위치를 운영 중 이동하지 않는다. marker/잠금/QR은 wrapper 옆에 생성하며 QR는 파일로 직접 연다. 시작부터 종료 정리까지 잠금으로 동시 호출을 막고, marker의 소유 프로젝트·정확한 프로세스·노드/대상을 확인한다. 이전 wrapper의 marker는 승계하지 않는다. 운영 중에는 기존 wrapper를 보존하고 종료에도 그 wrapper를 사용한다. `/version` release와 정적 경로를 확인한 뒤에만 공개한다. 다음 정식 release에서 수정 wrapper를 함께 배포한다.

## 실패 진단·검증

| 실패 | 확인할 것 |
|---|---|
| Docker/WSL prerequisite | Docker Desktop·WSL2 통합, `RELAY_WSL_REPO` 절대 경로, Docker CLI 탐색 |
| 로컬 health/version | 같은 release의 dist/이미지·자격 파일·고정 중계 포트 점유. 고정 기본 Compose 프로젝트를 수동 down하지 말고 같은 wrapper stop 후 재시도 |
| Tailscale/Funnel | Windows 앱 연결·MagicDNS·이 노드 승인·443. 다른 endpoint를 대체하지 않음 |
| 공개 health | 로컬 health → Funnel 승인/설정 → Windows localhost 전달 → DNS/TLS 순서. 원인을 추측해 단정하지 않음 |
| stop 불완전 | marker를 지우거나 폴더를 옮기지 말고 같은 wrapper stop 재실행. 새 PowerShell 창에서도 marker로 소유 프로젝트를 복원한다. legacy/부분 marker 또는 바뀐 프로세스·노드는 자동 종료를 거부한다. 알려진 원래 wrapper로 종료하거나 남은 foreground 호출이 끝난 뒤 재시도. reset/down 금지 |

텍스트 Funnel status는 foreground 설정을 누락할 수 있어 스크립트는 JSON의 `Foreground`도 검사한다. 서비스 기동 없는 회귀검사는 각 PowerShell에서 `check-native.ps1`·`check-runtime.ps1`·`check-ownership.ps1`을 `-File`로 실행한다. Node 정적 검사는 `node tools/relay/check-static.ts`. [운영 검증 근거](validation.md)와 [게임 실기기 절차](../../docs/device-test/remote-play.md)는 구분한다.

## 준비·교체·복구 (RP-OPS01)

이 절차는 고정된 새 도구 폴더의 `ops.ps1`을 사용한다. 기존 운영 폴더·release 저장소·marker는 그대로 보존한다. **개선 도구의 실제 운영 적용은 별도 검토 후 한다.** 개발 fixture 성공은 실제 서비스 적용 성공이 아니다. [설계·관측 한계](../../docs/design/relay-operations.md)를 함께 확인한다.

다음 값은 실행 전에 치환할 자리표시자다. `$RelayTools`는 새 도구 폴더, `$Candidate`는 운영 저장소와 다른 깨끗한 exact-tag WSL checkout, `$Release`·`$Source`는 승인 태그와 전체 40자리 commit, `$Archive`·`$ArchiveSHA`는 승인된 웹 ZIP의 Windows 경로와 전체 SHA-256이다. Git checkout·다운로드·설치·웹 빌드는 자동으로 하지 않는다. 기존 `RELAY_WSL_REPO`·자격 파일·주소를 재사용한다.

```powershell
$RelayTools = '<새Windows도구폴더>'
$Candidate = '<별도WSLrelease저장소절대경로>'
$Release = 'v<MAJOR.MINOR.PATCH>'
$Source = '<승인전체commitSHA>'
$Archive = '<승인웹ZIP의Windows절대경로>'
$ArchiveSHA = '<승인ZIP의SHA256>'
$RelayPS = & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$RelayTools\select-runtime.ps1"
if ($LASTEXITCODE -ne 0 -or -not $RelayPS) { throw 'Runtime selection failed' }
& $RelayPS -NoProfile -ExecutionPolicy Bypass -File "$RelayTools\ops.ps1" status
& $RelayPS -NoProfile -ExecutionPolicy Bypass -File "$RelayTools\ops.ps1" preflight
```

`status`는 소유 phase·ready·버전·관측 TCP 수와 `rooms=unknown`만 출력한다. ready는 소유 프로세스/session 조건이며 HTTP health 성공은 `preflight`·`verify`에서 별도로 확인한다. 부분 소유 상태는 ready가 아니며 연결 수를 추정하지 않는다. legacy 또는 다른 사용자/저장소/프로세스/session은 자동 승계하지 않는다. `preflight`·`verify`와 이미 실행 중인 같은 버전의 `start`는 기존 프로세스/session을 보존하고, 자산·이미지·설정·공개 응답을 대조한다. 준비되지 않은 stopped 상태의 `start`는 거절한다. 성공은 원격 대전 성공을 뜻하지 않는다.

서비스를 멈추기 **전에** 준비한다. `prepare`는 승인 ZIP SHA를 먼저 확인하고 .NET `ZipArchive`로 안전한 경로·중복·파일 유형·4096 entry·총 해제 64 MiB 상한을 검사한 뒤 새 임시 폴더에 직접 복사한다. .NET CRC 검증 보장을 주장하지 않는다. Node 24.21.0 helper는 전체 파일 bytes·경로 manifest, 기존 served hash, Kit source, 초기 JS/CSS 참조를 대조한다. 기존 build-only 파일 `skin/NOTICE.md`·`skin/manifest.json`·`oss/bundled-packages.json`·`cards/LICENSE`도 전체 manifest에 보존하되 served hash에는 기존 서버와 같이 포함하지 않는다. 기존의 다른 dist는 덮어쓰지 않으며, 기존 이미지도 전체 manifest를 대조한다. 이미지가 없을 때만 명시적 `-BuildImage`로 원 Docker 빌드 1회를 요청한다. 자동 rebuild/pull은 없다.

```powershell
& $RelayPS -NoProfile -ExecutionPolicy Bypass -File "$RelayTools\ops.ps1" prepare -CandidateRepo $Candidate -Release $Release -Source $Source -Archive $Archive -ArchiveSHA $ArchiveSHA
# 이미지 준비가 필요한 경우에만 위 prepare에 -BuildImage 추가
& $RelayPS -NoProfile -ExecutionPolicy Bypass -File "$RelayTools\ops.ps1" apply -AcceptSessionLoss
& $RelayPS -NoProfile -ExecutionPolicy Bypass -File "$RelayTools\ops.ps1" verify
```

`apply`는 준비된 checkout·ZIP 귀속·이미지·자격 fingerprint·노드·Compose를 다시 검사한다. 같은 source/hash가 이미 실행 중이면 교체하지 않는다. 실제 교체 및 `restart -AcceptSessionLoss`에는 명시적 세션 손실 수용이 필요하며, 활성 소유 TCP가 관측되거나 연결 수를 확인할 수 없으면 거절한다. **TCP 0은 방 0이 아니다.** 방·인증·코드는 프로세스 메모리에 있다(방 cap 4·수명 6시간, 초대 15분, 호스트 부재 10분). 교체하면 진행 중인 방과 토큰 수명이 끊기므로 사용자 세션 보존이 필요하면 교체하지 않는다. 무중단·기존 방 복구를 보장하지 않는다.

소유 lock으로 동시 명령을 거절하고 교체 전 이전 release/이미지와 candidate nonce를 journal에 저장한다. 복구 nonce와 `restoring` 단계도 이전 release를 시작하기 전에 저장한다. 실패하면 자동으로 다른 서비스를 정리하거나 재시작하지 않는다. 같은 폴더에서 아래 명령으로 소유 경계를 다시 검사한다.

```powershell
& $RelayPS -NoProfile -ExecutionPolicy Bypass -File "$RelayTools\ops.ps1" status
& $RelayPS -NoProfile -ExecutionPolicy Bypass -File "$RelayTools\ops.ps1" rollback -AcceptSessionLoss
& $RelayPS -NoProfile -ExecutionPolicy Bypass -File "$RelayTools\ops.ps1" verify
```

`rollback`은 journal에 미리 기록된 정확한 이전/candidate/복구 nonce만 처리한다. 정상 이전 release가 남아 있거나, 복구 health 확인 후 journal 완료 직전에 중단됐으면 프로세스를 다시 시작하지 않고 완료한다. 복구 프로세스가 running이어도 마지막 자산 검증에 실패하면 실패 상태를 보존한다. 운영자가 `rollback -AcceptSessionLoss`를 명시했을 때만 정확한 소유권·활성/미확인 연결 거절 검사를 다시 거쳐 한 번 교체할 수 있다. 새 프로세스도 검증에 실패하면 성공으로 처리하거나 자동 반복하지 않는다. 완료된 rollback 반복도 비파괴다. 알 수 없는 foreground endpoint·프로세스·nonce·부분 lease는 추측해 정리하지 않는다. marker/journal을 수동 삭제하거나 wrapper 폴더를 이동하지 말고 원 소유 절차로 조사한다. 이전 release로 돌아가도 옛 방·인증은 복구되지 않는다.

### 기존 wrapper에서 전환

1. 새 폴더에서 별도 exact-tag checkout·승인 ZIP·이미지를 먼저 준비한다. 새 도구가 legacy marker를 읽어 승계하게 만들지 않는다.
2. 사용자 세션 손실을 수용하고 활성 연결이 없음을 확인한 뒤 **원 wrapper의 `stop.cmd`만** 실행한다. 원 wrapper가 자신의 marker와 자원을 정상 정리했는지 확인한다. 실패하면 새 start를 진행하지 않는다.
3. `RELAY_WSL_REPO`를 준비된 checkout으로 지정하고 새 `ops.ps1 start` → `verify`를 실행한다. 같은 주소를 재사용하므로 기존 기본 주소 QR는 유지되며, lifecycle은 private URL을 로컬 사용자 상태 폴더에 저장한다.
4. 새 start 실패 시 새 도구의 정확한 소유 자원만 정리됐는지 확인한다. pending marker/endpoint가 남으면 원 wrapper 재기동을 하지 않는다. 정리가 확인된 경우에만 이전 `RELAY_WSL_REPO`로 되돌려 **원 wrapper의 `start.cmd`**로 복귀한다. 수동 marker 승계·광역 kill/down/reset은 하지 않는다.

준비/복구 journal과 fingerprint는 사용자 `%LOCALAPPDATA%`의 폴더별 상태에 저장하며 공개하지 않는다. 실제 주소·자격·환경·native 오류 원문은 공유 로그에 내보내지 않는다. native UTF-8 어댑터와 기존 런타임 선택을 재사용한다. Windows에서 실행하며 WSL interop로 시작한 foreground 자식의 수명은 호출 세션에 의존할 수 있다. detached 운영을 보장하지 않고 `--bg`로 우회하지 않는다. 운영 창/세션을 보존한다.

격리 회귀검사는 `node --test tools/relay/artifact.test.mjs`, `node tools/relay/check-static.ts`, 선택한 PowerShell의 `check-lifecycle.ps1 -List` 후 같은 파일 실행이다. lifecycle fixture는 실제 lease/lock/소유 guard를 사용하되 Docker·Tailscale·HTTP·프로세스 adapter를 mock으로 막는다. 복구 시작 전/중/health 뒤 journal 중단과 legacy 전환 복귀는 합성 fixture 결과이며 LIVE 적용 증거와 구분한다.
