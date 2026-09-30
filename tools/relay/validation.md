# Windows 운영·격리 회귀 근거 (FR-RP-07 · NF-RP-06 · RP-03B)

**이전 wrapper 운영 검증(2026-09-30):** 대상: intent/spec.md FR-RP-07·NF-RP-06, intent/plan.md RP-03B. 사용자 위임으로 실제 Windows 11 + Docker Desktop WSL2 + Windows Tailscale에서 순차 실행했다. 원본 `<WSL저장소절대경로>`는 v0.3.1 태그/추적 파일 clean이며, 준비된 동일 이미지에 `up -d --no-build`했다. wrapper는 별도 worktree, QR/소유 marker도 wrapper에 둔다. secret 내용을 읽거나 공유하지 않았으며 기존 파일을 덮어쓰지 않았다.

| 표적 | 실제 결과 |
|---|---|
| WindowsPS 5.1.26100.9444, Console.OutputEncoding=ks_c_5601-1987 | 실제 Tailscale status JSON 파싱 exit0, BackendState Running·DNS 존재(원문/peer 미출력) |
| PowerShell 7.6.6 | start exit0·Relay ready, 로컬 health ready=true, version=v0.3.1, 공개 health ready=true, stop exit0 |
| WindowsPS 5.1.26100.9444 | start exit0·Relay ready, 로컬 health ready=true, version=v0.3.1, 공개 health ready=true, stop exit0 |
| 각 런타임 합성 회귀 | `check-native.ps1` 8개씩 통과: 한글 UTF-8 JSON/별도 정상 stderr, 호출자 CP949 보존, exit17, stderr 131072바이트 동시 drain, 빈/공백/따옴표/뒤 백슬래시 인수, foreground·다른 호스트·빈 설정 |
| 각 런타임 선택 회귀 | `check-runtime.ps1` 4개씩 통과: PATH pwsh, 기본 설치 경로 pwsh, 둘 다 없을 때 5.1, 실제 PC의 pwsh 선택. 이 검사는 서비스를 기동하지 않음 |
| 최종 제어 인계(14:44 UTC) | status exit0, 활성 설정=false, 해당 Funnel 프로세스=0, Compose 프로젝트 컨테이너=0; 이후 live start/stop 금지, 사용자/root로 제어 인계 |

추가 실측 결함: foreground Funnel 실행 중 텍스트 status는 `No serve config`지만 JSON에는 `Foreground`가 있었다. 시작/종료가 background와 foreground의 정확한 호스트·443·루트 handler·17777 proxy를 검사하도록 고쳤다. 이전 수정본은 foreground 프로세스를 종료한 뒤 남은 설정에만 off했다. 아래 소유권 수정본은 off/reset 없이 검증한 foreground 프로세스만 종료한다. 이미 Ctrl+C로 종료된 handler에 불필요한 off를 하지 않는다. 다른 endpoint를 변경하거나 reset/down하지 않았다.

검증 수집기의 자식 pipe 상속으로 출력 수집이 종료를 기다리는 경우가 있어 별도 임시 파일 수집과 독립 health 요청으로 확인했다. 제품은 QR를 자동으로 열지 않고 파일 경로를 제공한다. 실제 status JSON과 개인 peer 정보·승인 URL·자격 비밀은 검증 산출물에 포함하지 않는다.

설계 근거는 공식 [PowerShell preference/native exitcode](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_preference_variables?view=powershell-7.6), [문자 인코딩](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding?view=powershell-7.6), [5.1→7 이행](https://learn.microsoft.com/powershell/scripting/install/migrating-from-windows-powershell-51-to-powershell-7), [native 인수 전달](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_parsing?view=powershell-7.6), [.NET Process 양쪽 pipe 교착 조건](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.process.standardoutput), [ReadToEndAsync](https://learn.microsoft.com/en-us/dotnet/api/system.io.streamreader.readtoendasync?view=netframework-4.8.1), [Tailscale Funnel](https://tailscale.com/docs/reference/tailscale-cli/funnel)이다. 이번 세션에는 Context7 도구가 없어 Microsoft/Tailscale 원문을 직접 조회했다. PowerShell 7.2 이후 native redirection/오류 처리와 7.3 인수 전달 변경에 기대지 않고, 5.1 파서에서도 읽히는 공통 .NET 경계로 양쪽 UTF-8 pipe를 동시에 drain하고 명시적 ExitCode를 반환한다. `$ErrorActionPreference`와 `$PSNativeCommandUseErrorActionPreference`를 전역 변경하지 않는다.

Node 24.21.0/npm 11.19.0으로 새 worktree `npm ci` 완료. 정적 배포 경계 검사 통과. 제품 필수 검사와 CI 결과는 PR #190에 기록한다. 이것은 PC 중계 운영 검증이며 Galaxy/iPhone 실제 게임 연결·재부팅·2시간 세션·NF-RP-06 전체 wire 호환 수용 판정은 하지 않는다.

## PR #190 / #210 소유권 수정 (2026-10-01)

새 격리 작업트리에서 Node 24.21.0/npm 11.19.0 `npm ci` 후 검사했다. **현재 수정본의 live 기동·CIM 조회·Tailscale·Docker·자격 파일·release clone 접근은 0회**다. 운영 중인 이전 wrapper 경로는 읽기/쓰기/이동하지 않았다. 위 실제 기동 성공은 현재 소유권 수정본의 live 성공을 뜻하지 않는다.

| 합성 검사 | 각 WindowsPS 5.1 / PowerShell 7 결과 |
|---|---|
| native | 8개: UTF-8/별도 stderr·종료 코드·동시 drain·인수·foreground 상태 |
| runtime | 9개: 절대 PATH/기본 설치·5.1 fallback·현재 폴더 미선택·제품/Core 7 불일치 및 실행 실패 시 fallback 금지·cmd 선택 |
| ownership/failure | 43개: 정확 argv/실행 파일/SID/PID/생성 시각/부모/노드/대상, 외부 endpoint/추가 경로/marker 없음, 중복 기동 image/release/project 검증, up 전 실패·포트 충돌·중간 실패 격리, stop 재시도·프로세스 소멸·부분 marker·중단 복원 |

모든 서비스 adapter는 가짜 fixture로 대체했다. hostname·SID·경로·PID·이미지 ID는 코드에서 만든 합성이며 실제 환경/상태에서 수집하지 않았다. 실제 실행한 것은 격리 임시 파일의 WSL UNC 잠금/rename, 새 PowerShell 자식 host의 marker 복원·잠금 거부, 설치된 PowerShell 정체 확인이다. PC 중계·게임 실기기 검증과 구분한다.

**리뷰 설계 근거:** `FileShare.None` 잠금을 시작 확인부터 up/marker/rollback/stop 전체에 유지한다. 같은 lock 파일을 삭제하지 않아 두 호출이 서로 다른 lock을 잡지 않는다. marker는 schema·run nonce·소유 사용자/저장소·image/release와 프로세스/foreground 식별만 저장하며 생성 자격·초대 비밀은 넣지 않는다. 로컬 소유 정보와 marker 원문은 공개 문서/CI 로그에 출력하지 않는다.

완성된 UTF-8 JSON을 marker와 **같은 디렉터리**의 `<marker>.<run nonce>.tmp`에 닫아 기록한다. 소유 nonce를 재확인한 뒤 [MoveFileExW 공식 계약](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)의 `MOVEFILE_REPLACE_EXISTING (0x1) | MOVEFILE_WRITE_THROUGH (0x8)`로 이름을 교체한다. helper도 두 절대 경로의 디렉터리가 같은지 검사한다. `COPY_ALLOWED`, delete→copy, 비원자 fallback은 없다. NTFS에서 가능한 `File.Replace`의 backup 동작은 WSL UNC에서 미지원으로 확인해 사용하지 않는다. rename 실패는 예외로 전달하며 이전 marker를 지우지 않는다. 파일 잠금으로 실제 rename 실패를 유도해 이전 바이트 보존을 확인했다.

동시 호출은 전체 작업 잠금으로 거부하고, marker 교체는 완성 파일의 단일 rename이다. 임시 파일 작성 중 중단은 이전 marker로 복원하며, 동일 소유 nonce의 임시 파일만 stop에서 정리한다. 첫 marker 이전에는 up을 호출하지 않는다. compose intent는 up 전에 기록하고 **모든 up/down/ps 조회에 nonce 프로젝트 `-p`**를 전달한다. [Compose 공식 우선순위](https://docs.docker.com/compose/how-tos/project-name/)에서 `-p`가 파일의 고정 `name`보다 우선한다. 포트 충돌/실패는 이번 호출의 프로젝트만 down하며 기존 기본/외부 프로젝트는 보존한다. 디스크 손상·파일시스템 자체의 전원 장애 내구성은 이 검사로 보증하지 않는다.

시작 호출은 원래 `Start-Process` 객체의 handle을 유지한다. handle은 직렬화하지 않는다. 새 PowerShell의 stop은 marker의 PID로 **새 handle을 먼저 열고**, .NET 시작 시각과 CIM 생성 시각/부모/사용자/실행 파일/전체 argv 및 노드/foreground 대상을 재검증한다. PID 재사용/불일치/부분 marker에서는 종료하지 않는다. launch 직후 식별 저장 전 중단으로 활성 endpoint와 식별이 부족하면 marker를 보존하고 자동 프로세스 종료를 거부한다. process/session이 소멸한 경우 소유 근거가 남은 nonce 프로젝트만 정리한다. 실패 marker는 stop 재실행에 사용하며 legacy marker를 자동 승계/삭제하지 않는다.

현재 수정본의 재부팅·실제 start→local/public health→stop·게임 연결은 **미검증**이다. 사용 중인 서비스 때문에 live 재기동하지 않았다. 동일 HEAD 필수 CI와 독립 재리뷰가 남아 있으며, v0.3.2의 최소 운영 결함 범위만 다룬다. #186 게임 실기기·#208 전체 개인정보 감사는 별도 잔여 범위다.
