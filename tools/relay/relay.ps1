# RP-03B / FR-RP-07. Windows 11 + Docker Desktop WSL2 + Windows Tailscale.
# This file deliberately uses ASCII so Windows PowerShell 5.1 reads it without a BOM.
param([Parameter(Mandatory = $true)][ValidateSet('start', 'stop')][string]$Action)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'native.ps1')
Write-Host ("Runtime: {0} {1}" -f $PSVersionTable.PSEdition, $PSVersionTable.PSVersion)
$Repo = $env:RELAY_WSL_REPO
$Docker = $null
$Target = 'http://127.0.0.1:17777'
$SecretDirectory = '$HOME/.local/share/p2p-gostop/relay'
$Origin = 'http://127.0.0.1:17777'
$Release = 'v0.0.0'
$Marker = Join-Path $PSScriptRoot '.funnel-owned'
$FunnelStdout = Join-Path $env:TEMP 'p2p-gostop-relay-funnel.stdout'
$FunnelStderr = Join-Path $env:TEMP 'p2p-gostop-relay-funnel.stderr'
$Tailscale = if ($env:RELAY_TAILSCALE_EXE) { $env:RELAY_TAILSCALE_EXE } else { Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe' }

function Fail([string]$Message) { throw $Message }
function Wsl([string]$Command) {
  $result = InvokeRelayNative 'wsl.exe' @('--cd', $Repo, '--exec', '/bin/bash', '-lc', $Command)
  if ($result.ExitCode -ne 0) { Fail "WSL command failed (exit $($result.ExitCode)): $($result.Stderr.Trim())" }
  return $result.Stdout
}
function Compose([string]$Arguments) {
  $command = 'RELAY_CREATION_SECRET_PATH="$HOME/.local/share/p2p-gostop/relay/creation-secret" ' +
    'RELAY_ALLOWED_ORIGINS=' + $Origin + ' RELAY_RELEASE=' + $Release +
    ' RELAY_IMAGE_TAG=$(git rev-parse --short=12 HEAD) ' + $Docker +
    ' compose -f compose.relay.yaml ' + $Arguments
  Wsl $command
}
function EnsureSecret {
  $null = Wsl ('mkdir -p -m 700 "' + $SecretDirectory + '" && chmod 700 "' + $SecretDirectory + '"')
  $exists = (Wsl ('if test -f "' + $SecretDirectory + '/creation-secret"; then printf yes; else printf no; fi') | Out-String).Trim()
  if ($exists -eq 'yes') { return }
  $command = 'source "$HOME/.nvm/nvm.sh" && nvm use >/dev/null && node tools/relay/create-credentials.ts "' + $SecretDirectory + '/creation-secret"'
  $null = Wsl $command
  Write-Host 'A new creation secret was saved under the WSL user home directory.'
}
function LocalHealth {
  for ($i = 0; $i -lt 15; $i++) {
    try {
      $r = Invoke-RestMethod -Uri "$Target/health" -TimeoutSec 2 -MaximumRedirection 0
      if ($r.relay -eq 'p2p-gostop' -and $r.ready -eq $true) { return $r }
    } catch { Start-Sleep -Seconds 1 }
  }
  Fail 'Local /health is not ready. Check: docker compose -f compose.relay.yaml logs --tail=30 relay. Verify RELAY_PUBLIC, RELAY_RELEASE and the creation secret file.'
}
function FunnelStatus {
  $result = InvokeRelayNative $Tailscale @('funnel', 'status', '--json')
  if ($result.ExitCode -ne 0) { Fail 'Tailscale Funnel status failed. Start/sign in to the Windows Tailscale app.' }
  try { return ($result.Stdout | ConvertFrom-Json) }
  catch { Fail 'Tailscale returned invalid Funnel status JSON; raw status is withheld.' }
}
function FunnelState($Status, [string]$Dns) {
  # Text status can omit foreground sessions. Inspect background and Foreground.
  $configs = @($Status)
  if ($Status.Foreground) { $configs += @($Status.Foreground.PSObject.Properties | ForEach-Object { $_.Value }) }
  $hasEndpoint = $false
  $ours = $false
  $foreignTarget = $false
  foreach ($config in $configs) {
    if ($config.TCP -and @($config.TCP.PSObject.Properties).Count -gt 0) { $hasEndpoint = $true }
    if ($config.Web) {
      foreach ($web in $config.Web.PSObject.Properties) {
        foreach ($handler in $web.Value.Handlers.PSObject.Properties) {
          if ($handler.Value.Proxy -eq $Target) {
            if ($web.Name.ToLowerInvariant() -eq ($Dns + ':443') -and $handler.Name -eq '/') { $ours = $true }
            else { $foreignTarget = $true }
          }
        }
      }
    }
  }
  return [pscustomobject]@{ HasEndpoint = $hasEndpoint; Ours = $ours; ForeignTarget = $foreignTarget }
}
function OwnedFunnelProcessIds {
  # A missing marker can follow a failed marker write. Match this exact target.
  try {
    @(Get-CimInstance Win32_Process -Filter "Name = 'tailscale.exe'" -ErrorAction Stop |
      Where-Object { $_.ExecutablePath -eq $Tailscale -and $_.CommandLine -match 'funnel\s+--https=443\s+' -and $_.CommandLine.Contains($Target) } |
      ForEach-Object { $_.ProcessId })
  } catch {
    [Console]::Error.WriteLine("Could not inspect Tailscale process arguments: $_")
    @()
  }
}
function FunnelOff {
  # Foreground sessions disappear when their owning process exits; off addresses
  # background handlers and fails with "handler does not exist" after Ctrl+C.
  foreach ($id in @(OwnedFunnelProcessIds)) { Stop-Process -Id $id -Force -ErrorAction Stop }
  $dns = DnsName
  $state = FunnelState (FunnelStatus) $dns
  if ($state.ForeignTarget) { Fail 'The relay target is configured on another hostname/path; inspect it before stopping.' }
  Remove-Item $FunnelStdout, $FunnelStderr -Force -ErrorAction SilentlyContinue
  if (-not $state.Ours) { return }
  $result = InvokeRelayNative $Tailscale @('funnel', '--https=443', $Target, 'off')
  if ($result.ExitCode -ne 0) { Fail 'Tailscale rejected Funnel off. Inspect the owned endpoint before retrying.' }
  if ((FunnelState (FunnelStatus) $dns).Ours) { Fail 'The relay Funnel endpoint is still configured.' }
}
function DnsName {
  $result = InvokeRelayNative $Tailscale @('status', '--json')
  if ($result.ExitCode -ne 0) { Fail 'Windows Tailscale is stopped or not signed in. Start the app and connect.' }
  try { $state = $result.Stdout | ConvertFrom-Json }
  catch { Fail 'Windows Tailscale returned invalid UTF-8 JSON. Update/check the Windows app; raw status is withheld.' }
  if ($state.BackendState -ne 'Running' -or -not $state.Self.DNSName) { Fail 'Windows Tailscale is not connected or MagicDNS is unavailable.' }
  $name = $state.Self.DNSName.TrimEnd('.').ToLowerInvariant()
  if ($name -notmatch '^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$') { Fail 'Unexpected Tailscale DNS name. Check MagicDNS and the selected node.' }
  return $name
}
function PublicHealth([string]$Url) {
  for ($i = 0; $i -lt 12; $i++) {
    try {
      $r = Invoke-RestMethod -Uri "$Url/health" -TimeoutSec 4 -MaximumRedirection 0
      if ($r.relay -eq 'p2p-gostop' -and $r.ready -eq $true) { return }
    } catch { Start-Sleep -Seconds 2 }
  }
  Fail 'Public /health did not respond. Check Funnel approval, DNS/TLS, Windows localhost forwarding, and port 443. The cause is not yet identified.'
}

try {
  if (-not $Repo -or -not $Repo.StartsWith('/')) { Fail 'Set RELAY_WSL_REPO to the absolute WSL release repository path.' }
  $dockerPath = if ($env:RELAY_WSL_DOCKER) { $env:RELAY_WSL_DOCKER } else {
    (Wsl 'command -v docker || { test -x "$HOME/.local/bin/docker" && printf "%s" "$HOME/.local/bin/docker"; }' | Out-String).Trim()
  }
  if (-not $dockerPath) { Fail 'Docker CLI was not found in WSL. Set RELAY_WSL_DOCKER to its executable path.' }
  $Docker = "'" + $dockerPath.Replace("'", "'\''") + "'"
  if ($Action -eq 'start' -and -not (Test-Path $Tailscale)) { Fail "Tailscale is missing: $Tailscale. Install/start the Windows app." }
  if ($Action -eq 'start') {
    try { $null = Wsl 'test -f compose.relay.yaml' }
    catch { Fail "WSL repo was not found: $Repo. Set RELAY_WSL_REPO to its absolute WSL path." }
    try { $null = Wsl "$Docker info --format '{{.ServerVersion}}'" }
    catch { Fail 'Docker Desktop is not responding in WSL. Start Docker Desktop and enable WSL2 integration.' }
  }
} catch {
  [Console]::Error.WriteLine("Prerequisite check failed: $_. Check WSL path ($Repo), Docker Desktop/WSL integration, built web artifact, and the credentials file.")
  exit 2
}

if ($Action -eq 'stop') {
  $failed = $false
  try {
    $hasMarker = Test-Path $Marker
    $ownedProcesses = @(OwnedFunnelProcessIds)
    $status = $null
    $dns = ''
    try { $status = FunnelStatus; $dns = DnsName }
    catch {
      if ($ownedProcesses.Count -eq 0) { throw }
      [Console]::Error.WriteLine("Funnel status is unavailable; stopping this script's relay process: $_")
    }
    if ($hasMarker) {
      $ownerDns = (Get-Content $Marker -Raw).Trim()
      if ($dns -and $dns -ne $ownerDns) { Fail 'The active Tailscale node differs from the node saved by start. Inspect the Funnel status before stopping it.' }
    }
    $state = if ($status -and $dns) { FunnelState $status $dns } else { $null }
    $targetOnThisNode = $state -and $state.Ours
    if ($targetOnThisNode -or $ownedProcesses.Count -gt 0) {
      try { FunnelOff }
      finally { foreach ($id in $ownedProcesses) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } }
      Write-Host 'Relay Funnel endpoint disabled.'
    } elseif ($state -and $state.ForeignTarget) {
      Fail 'The relay target appears on a different Tailscale node; inspect funnel status before stopping it.'
    } else { Write-Host 'No relay Funnel endpoint is active.' }
    if ($hasMarker) { Remove-Item $Marker -Force }
  } catch { [Console]::Error.WriteLine("Funnel may still be public: $_. Run tailscale funnel --https=443 $Target off manually."); $failed = $true }
  try { $null = Compose 'down'; Write-Host 'Relay container stopped.' }
  catch { [Console]::Error.WriteLine("Relay container may still be running: $_"); $failed = $true }
  if ($failed) { exit 3 } else { exit 0 }
}

$startedFunnelThisRun = $false
$startedProcess = $null
$ownedBeforeStart = $false
$startSucceeded = $false
try {
  try { $null = Wsl 'test -d packages/web/dist' }
  catch { Fail 'Web dist is missing. Build the same release as the Galaxy APK on the WSL host.' }
  $releaseInput = if ($env:RELAY_RELEASE) { $env:RELAY_RELEASE } else {
    try { (Wsl 'git describe --tags --exact-match' | Out-String).Trim() }
    catch { Fail 'This checkout is not a release tag. Check out the matching APK release tag or set RELAY_RELEASE explicitly.' }
  }
  if ($releaseInput -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$') { Fail 'RELAY_RELEASE must be vMAJOR.MINOR.PATCH.' }
  $Release = $releaseInput
  EnsureSecret
  $dns = DnsName
  $url = "https://$dns"
  $Origin = "http://127.0.0.1:17777,$url"
  $before = FunnelStatus
  $beforeState = FunnelState $before $dns
  $ours = $beforeState.Ours
  if ($beforeState.ForeignTarget) {
    Fail 'Funnel target is active on a different hostname. Inspect tailscale status --json and tailscale funnel status; no relay was started.'
  }
  if ($ours -and -not (Test-Path $Marker)) { Fail 'Port 443 already points to this target but this script does not own it. Inspect tailscale funnel status before changing it.' }
  $ownedBeforeStart = $ours
  if (-not $ours -and $beforeState.HasEndpoint) { Fail 'Another HTTPS Serve/Funnel endpoint is active. Inspect tailscale funnel status; this script will not replace it.' }
  $null = Compose 'up -d --no-build'
  $null = LocalHealth
  $version = Invoke-RestMethod -Uri "$Target/version" -TimeoutSec 3 -MaximumRedirection 0
  if ($version.current.release -ne $Release -or $version.current.path -notmatch '^/r/v[0-9]+\.[0-9]+\.[0-9]+/[a-f0-9]{64}/$') {
    Fail 'The relay web artifact does not match RELAY_RELEASE. Rebuild the matching APK/web release.'
  }
  if (-not $ours) {
    # No --bg: Tailscale documents that --bg resumes sharing after reboot.
    $startedProcess = Start-Process -FilePath $Tailscale -ArgumentList @('funnel', '--https=443', $Target) -WindowStyle Hidden -PassThru -RedirectStandardOutput $FunnelStdout -RedirectStandardError $FunnelStderr
    $startedFunnelThisRun = $true
    Start-Sleep -Seconds 2
    if ($startedProcess.HasExited) { Fail 'Funnel did not stay running. Check node approval in the Tailscale admin console and tailscale funnel status.' }
    $after = FunnelStatus
    if (-not (FunnelState $after $dns).Ours) {
      Fail 'Funnel target or hostname does not match this Tailscale node. Check node approval and tailscale funnel status.'
    }
    Set-Content -Path $Marker -Value $dns -NoNewline
  }
  PublicHealth $url
  # Put generated files beside this wrapper, even when the release repo is separate.
  $qrWindows = Join-Path $PSScriptRoot 'relay-url.svg'
  $quotedQr = "'" + $qrWindows.Replace("'", "'\''") + "'"
  $qrWsl = (Wsl ('wslpath -u ' + $quotedQr) | Out-String).Trim()
  $quotedQrWsl = "'" + $qrWsl.Replace("'", "'\''") + "'"
  $null = Wsl ('source "$HOME/.nvm/nvm.sh" && nvm use >/dev/null && node tools/relay/write-qr.ts ' + $url + '/ ' + $quotedQrWsl)
  Write-Host "Relay ready: $url/"
  Write-Host "Health: $url/health"
  Write-Host "Web: $url$($version.current.path)"
  Write-Host "QR file in WSL: $qrWsl"
  Write-Host 'Health confirms the relay response only; host/guest game connection is a separate check.'
  $startSucceeded = $true
} catch {
  $reason = "$_"
  if ($reason -match 'port is already allocated|address already in use|bind:') {
    $reason = 'Port 17777 is occupied. Inspect docker compose -f compose.relay.yaml ps and ss -ltn; stop the conflicting service manually.'
  }
  [Console]::Error.WriteLine("Start failed: $reason")
} finally {
  if (-not $startSucceeded) {
    # Cleanup is based on this invocation, even if status/marker writing failed.
    if ($startedFunnelThisRun -or $ownedBeforeStart) {
      $offSucceeded = $false
      try {
        FunnelOff
        $offSucceeded = $true
        if (Test-Path $Marker) { Remove-Item $Marker -Force }
      } catch { [Console]::Error.WriteLine("Funnel may still be public: $_") }
    }
    if ($null -ne $startedProcess) {
      try { Stop-Process -Id $startedProcess.Id -Force -ErrorAction Stop }
      catch { if (-not $startedProcess.HasExited) { [Console]::Error.WriteLine("Funnel process may still be running: $_") } }
    }
    if (($startedFunnelThisRun -or $ownedBeforeStart) -and -not $offSucceeded) {
      try { FunnelOff; if (Test-Path $Marker) { Remove-Item $Marker -Force } }
      catch { [Console]::Error.WriteLine("Funnel may still be public after retry: $_") }
    }
    try { $null = Compose 'down' } catch { [Console]::Error.WriteLine("Relay may still be running: $_") }
  }
}
if ($startSucceeded) { exit 0 }
exit 4
