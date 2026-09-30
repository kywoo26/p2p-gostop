# Windows 운영 회귀 근거 (2026-09-30)

대상: spec.md FR-RP-07·NF-RP-06, plan.md RP-03B. 사용자 위임으로 실제 Windows 11 + Docker Desktop WSL2 + Windows Tailscale에서 순차 실행했다. 원본 `<WSL저장소절대경로>`는 v0.3.1 태그/추적 파일 clean이며, 준비된 동일 이미지에 `up -d --no-build`했다. wrapper는 별도 worktree, QR/소유 marker도 wrapper에 둔다. secret 내용을 읽거나 공유하지 않았으며 기존 파일을 덮어쓰지 않았다.

| 표적 | 실제 결과 |
|---|---|
| WindowsPS 5.1.26100.9444, Console.OutputEncoding=ks_c_5601-1987 | 실제 Tailscale status JSON 파싱 exit0, BackendState Running·DNS 존재(원문/peer 미출력) |
| PowerShell 7.6.6 | start exit0·Relay ready, 로컬 health ready=true, version=v0.3.1, 공개 health ready=true, stop exit0 |
| WindowsPS 5.1.26100.9444 | start exit0·Relay ready, 로컬 health ready=true, version=v0.3.1, 공개 health ready=true, stop exit0 |
| 각 런타임 합성 회귀 | `check-native.ps1` 8개씩 통과: 한글 UTF-8 JSON/별도 정상 stderr, 호출자 CP949 보존, exit17, stderr 131072바이트 동시 drain, 빈/공백/따옴표/뒤 백슬래시 인수, foreground·다른 호스트·빈 설정 |
| 각 런타임 선택 회귀 | `check-runtime.ps1` 4개씩 통과: PATH pwsh, 기본 설치 경로 pwsh, 둘 다 없을 때 5.1, 실제 PC의 pwsh 선택. 이 검사는 서비스를 기동하지 않음 |
| 최종 제어 인계(14:44 UTC) | status exit0, 활성 설정=false, 해당 Funnel 프로세스=0, Compose 프로젝트 컨테이너=0; 이후 live start/stop 금지, 사용자/root로 제어 인계 |

추가 실측 결함: foreground Funnel 실행 중 텍스트 status는 `No serve config`지만 JSON에는 `Foreground`가 있었다. 시작/종료가 background와 foreground의 정확한 호스트·443·루트 handler·17777 proxy를 검사하도록 고쳤다. foreground 프로세스를 종료하면 설정이 사라지므로 남은 설정이 있을 때만 off한다. 이미 Ctrl+C로 종료된 handler에 불필요한 off를 하지 않는다. 다른 endpoint를 변경하거나 reset/down하지 않았다.

검증 수집기의 자식 pipe 상속으로 출력 수집이 종료를 기다리는 경우가 있어 별도 임시 파일 수집과 독립 health 요청으로 확인했다. 제품은 QR를 자동으로 열지 않고 파일 경로를 제공한다. 실제 status JSON과 개인 peer 정보·승인 URL·자격 비밀은 검증 산출물에 포함하지 않는다.

설계 근거는 공식 [PowerShell preference/native exitcode](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_preference_variables?view=powershell-7.6), [문자 인코딩](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding?view=powershell-7.6), [5.1→7 이행](https://learn.microsoft.com/powershell/scripting/install/migrating-from-windows-powershell-51-to-powershell-7), [native 인수 전달](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_parsing?view=powershell-7.6), [.NET Process 양쪽 pipe 교착 조건](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.process.standardoutput), [ReadToEndAsync](https://learn.microsoft.com/en-us/dotnet/api/system.io.streamreader.readtoendasync?view=netframework-4.8.1), [Tailscale Funnel](https://tailscale.com/docs/reference/tailscale-cli/funnel)이다. 이번 세션에는 Context7 도구가 없어 Microsoft/Tailscale 원문을 직접 조회했다. PowerShell 7.2 이후 native redirection/오류 처리와 7.3 인수 전달 변경에 기대지 않고, 5.1 파서에서도 읽히는 공통 .NET 경계로 양쪽 UTF-8 pipe를 동시에 drain하고 명시적 ExitCode를 반환한다. `$ErrorActionPreference`와 `$PSNativeCommandUseErrorActionPreference`를 전역 변경하지 않는다.

Node 24.21.0/npm 11.19.0으로 새 worktree `npm ci` 완료. 정적 배포 경계 검사 통과. 제품 필수 검사와 CI 결과는 PR #190에 기록한다. 이것은 PC 중계 운영 검증이며 Galaxy/iPhone 실제 게임 연결·재부팅·2시간 세션·NF-RP-06 전체 wire 호환 수용 판정은 하지 않는다.
