# PC 공개 중계 수동 운영 (RP-03A/B)

정본: [spec §13](../../spec.md) FR-RP-07·NF-RP-06, [plan §1.9](../../plan.md) RP-03A/B. Windows 11 Docker Desktop WSL2 통합, Windows Tailscale 앱, WSL 저장소 `/home/k/github/p2p-gostop` 기준이다. 게임할 때만 실행한다. 로그인·부팅 자동 시작과 Docker 재시작 정책은 사용하지 않는다.

## 최초 설치·release 변경

1. Windows Tailscale 앱에서 로그인·연결, MagicDNS와 **이 PC의** Funnel 노드 속성 승인을 확인한다. 다른 PC/노드에 넓게 승인하지 않는다. 공개 대상은 `https://<이 PC>.ts.net` 하나다. 사용자 PC에서 기본 WebSocket 경로는 2026-09-29 통과했지만, 인증 방과 실제 게임은 별도 검증이 필요하다.
2. 배포할 정확한 release를 WSL 저장소에 체크아웃하고 APK와 **같은 commit의 웹 번들**을 준비한다. 저장소 루트에서 다음을 실행한다.

   ```sh
   docker compose run --rm dev npm ci
   docker compose run --rm dev npm run build -w packages/web
   docker compose build dev
   mkdir -p -m 700 "$HOME/.local/share/p2p-gostop/relay"
   docker compose run --rm -v "$HOME/.local/share/p2p-gostop/relay:/relay-secret" dev node tools/relay/create-credentials.ts /relay-secret/creation-secret
   export RELAY_CREATION_SECRET_PATH="$HOME/.local/share/p2p-gostop/relay/creation-secret"
   export RELAY_ALLOWED_ORIGINS="http://127.0.0.1:17777,https://<이 PC>.ts.net"
   export RELAY_RELEASE="$(git describe --tags --exact-match)" # APK와 같은 release 태그
   RELAY_IMAGE_TAG=$(git rev-parse --short=12 HEAD) docker compose -f compose.relay.yaml build
   ```

   생성 파일은 저장소 밖 `$HOME/.local/share/p2p-gostop/relay/creation-secret`(32바이트 base64url 43자 한 줄, 0600)다. 이미 있으면 생성기는 실패하며 덮어쓰지 않는다. `start.cmd`는 이 파일이 없으면 같은 위치에 자동 생성한다. 파일 내용은 운영자 Galaxy 개인 설정에만 1회 등록한다. 공용 웹/APK, Git, 이슈, 로그에 넣지 않는다. PC 이전은 파일을 안전하게 이전하거나 새 키를 만들고 Galaxy 설정을 다시 등록한다.
3. Docker 이미지는 웹 `dist`, Node 중계와 실행에 필요한 protocol/engine 소스 및 운영 의존성만 포함한다. 중계는 게임 규칙을 실행하거나 상태를 저장하지 않는다. 이미지는 Git SHA 12자리로 태그하고 시작 스크립트가 현재 체크아웃의 같은 태그를 선택한다. 공개 계약은 `RELAY_PUBLIC=1`, `RELAY_CREATION_SECRET_FILE=/run/secrets/creation-secret`, `RELAY_ALLOWED_ORIGINS`, `RELAY_RELEASE`, `RELAY_DIST_DIR`, `GET /health`다. health는 `relay=p2p-gostop`·`ready=true`를 검사하고 `/version`의 release 경로도 확인한다. `packages/web/dist`의 content hash·APK commit/release·이미지 ID를 아래 기록 칸에 남긴다. 현재 release와 직전 **wire 호환이 검증된** release만 제공한다. 호환되지 않으면 URL만 재사용하지 말고 APK/웹/PC 이미지를 함께 갱신한다.

## 게임 시작과 종료

- Windows 탐색기에서 `tools/relay/start.cmd`를 더블클릭한다. 저장소 위치가 다르면 현재 사용자 환경변수 `RELAY_WSL_REPO`에 WSL 절대 경로를 설정한다. Tailscale 설치 경로가 다르면 `RELAY_TAILSCALE_EXE`를 설정한다. 체크아웃은 APK와 같은 정확한 release 태그여야 한다. 별도 빌드 체크아웃이면 Windows 사용자 환경변수 `RELAY_RELEASE`에 `vN.N.N`을 지정한다. 스크립트는 `tailscale status --json`의 이 노드 MagicDNS와 `tailscale funnel status`의 공개 호스트를 대조해 `RELAY_ALLOWED_ORIGINS=http://127.0.0.1:17777,https://<funnel-host>`를 자동 구성한다. 이름/상태가 다르면 시작을 멈추고 두 상태를 확인하도록 안내한다. 시작은 Docker 상태 → 로컬 health·`/version` → Funnel → 공개 health 순으로 검사한다. 공개 URL·호환 웹 경로와 기본 URL의 QR SVG(`tools/relay/relay-url.svg`)를 출력한다. 이 QR은 **중계 기본 주소**이며 방 초대 QR은 앱에서 별도로 만든다. 출력된 URL을 Galaxy 원격 설정에 등록한다.
- 앱에서는 **① PC 중계 켜기 → ② 저장된 URL health 확인 → ③ 방 만들기·초대 공유** 순서로 진행한다. health 성공은 중계 응답만 뜻한다. 상대 접속이나 게임 시작 성공을 뜻하지 않는다.
- 게임 후 `tools/relay/stop.cmd`를 더블클릭한다. 이 스크립트가 시작한 Funnel 443과 전용 Compose 프로젝트만 끈다. Tailscale 자체나 다른 컨테이너는 끄지 않는다. 중복 실행은 안전해야 한다. 시작 스크립트는 Tailscale `--bg`를 쓰지 않는다. 공식 문서상 `--bg`는 재부팅 뒤 Funnel 공개를 재개하기 때문이다.
- 시작 중 오류가 나면 이번 실행에서 띄운 Funnel 프로세스와 정확한 17777 대상의 공개 설정을 정리한다. stop은 소유 marker가 없어도 이 노드의 17777 대상 또는 해당 Tailscale 프로세스 명령행을 확인해 종료를 시도한다. 다른 Funnel 대상은 건드리지 않는다.

PowerShell 대안(Windows PowerShell에서 저장소의 `tools/relay` 디렉터리로 이동):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\relay.ps1 start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\relay.ps1 stop
```

## 실패 진단·복구

| 확인된 상태 | 조치 |
|---|---|
| `docker info` 실패 | Docker Desktop 실행, WSL2 통합과 WSL의 `/home/k/.local/bin/docker` 확인 |
| 외부 생성 자격 파일 또는 `packages/web/dist` 없음 | start는 비밀만 자동 생성한다. 웹 번들은 위 설치 단계 실행 |
| 로컬 health 실패 | `docker compose -f compose.relay.yaml logs --tail=30 relay` 확인. 포트 17777 점유는 `docker compose -f compose.relay.yaml ps`와 `ss -ltn`으로 확인. 다른 프로세스를 자동 종료하지 않음 |
| Windows Tailscale 미연결 | 앱 로그인/연결·MagicDNS 확인 |
| Funnel 명령 거절 | 관리 콘솔에서 이 노드의 Funnel 속성 승인·443 설정 확인. 정책을 우회하지 않음 |
| 공개 health 불통 | PC 전원 → Docker/로컬 health → Windows Tailscale/Funnel → Windows localhost 전달 → DNS/TLS 순으로 확인. 원인 미확인 상태에서 PC·Docker·Funnel 하나를 단정하지 않음 |
| 중단 실패 | `tailscale funnel status`와 `docker compose -f compose.relay.yaml ps`로 남은 상태 확인. 이 노드의 `http://127.0.0.1:17777` 대상이 남아 있으면 `tailscale funnel --https=443 http://127.0.0.1:17777 off` 실행. 다른 대상은 보존 |

배포 컨텍스트 확인: 이미지 빌드 전에 `bash docker/relay/check-context.sh`를 실행한다. Docker가 `FROM scratch`와 `COPY . /`로 가짜 민감 파일을 내보내는 검사이며 CI에서도 실행된다. 실제 비밀 파일을 만들거나 읽지 않는다.

비밀 폐기: 실행 중이면 먼저 stop, 해당 방 종료를 확인하고 WSL 사용자 홈의 생성 자격 파일을 안전하게 제거한다. 다음 start에서 새 파일 생성·Galaxy 개인 설정 재등록 후 방을 다시 만든다. 비밀이 유출되었다면 옛 키를 다시 사용하지 않는다. 이전 이미지로 롤백할 때도 같은 release의 웹·APK wire 호환을 확인하고 새 방으로 시작한다. 중계 재시작으로 메모리 방은 사라진다.

## 운영 기록 (사람 작성)

| 날짜 | PC 이미지 ID / 웹 SHA-256 / APK release | 로컬 health / 공개 health | start·stop·재부팅 결과 | 비고(비밀 제외) |
|---|---|---|---|---|
| 미실시 |  |  |  | Windows 실측 대기 |

실기기 항목은 [원격 대전 절차](../../docs/device-test/remote-play.md)에 기록한다.
