# RP-03B / FR-RP-07. Windows 11 + Docker Desktop WSL2 + Windows Tailscale.
# This file deliberately uses ASCII so Windows PowerShell 5.1 reads it without a BOM.
param([Parameter(Mandatory = $true)][ValidateSet('start', 'stop')][string]$Action)
$ErrorActionPreference = 'Stop'
$Repo = if ($env:RELAY_WSL_REPO) { $env:RELAY_WSL_REPO } else { '/home/k/github/p2p-gostop' }
$Docker = '/home/k/.local/bin/docker'
$Target = 'http://127.0.0.1:17777'
$SecretDirectory = '$HOME/.local/share/p2p-gostop/relay'
$Origin = 'http://127.0.0.1:17777'
$Release = 'v0.0.0'
$Marker = Join-Path $PSScriptRoot '.funnel-owned'
$Tailscale = if ($env:RELAY_TAILSCALE_EXE) { $env:RELAY_TAILSCALE_EXE } else { 'C:\Program Files\Tailscale\tailscale.exe' }

function Fail([string]$Message) { throw $Message }
function Wsl([string]$Command) {
  $output = & wsl.exe --cd $Repo --exec /bin/bash -lc $Command 2>&1
  if ($LASTEXITCODE -ne 0) { Fail "WSL command failed: $Command`n$output" }
  return $output
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
  $output = & $Tailscale funnel status 2>&1
  if ($LASTEXITCODE -ne 0) { Fail "Tailscale Funnel status failed. Start/sign in to the Windows Tailscale app. $output" }
  return ($output | Out-String)
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
  $output = & $Tailscale funnel --https=443 $Target off 2>&1
  if ($LASTEXITCODE -ne 0) { Fail "Tailscale rejected Funnel off: $output" }
}
function DnsName {
  $raw = & $Tailscale status --json 2>&1
  if ($LASTEXITCODE -ne 0) { Fail 'Windows Tailscale is stopped or not signed in. Start the app and connect.' }
  $state = ($raw | Out-String) | ConvertFrom-Json
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
    $status = ''
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
    $targetOnThisNode = $dns -and $status.Contains($Target) -and $status.ToLowerInvariant().Contains($dns)
    if ($targetOnThisNode -or $ownedProcesses.Count -gt 0) {
      try { FunnelOff }
      finally { foreach ($id in $ownedProcesses) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } }
      Write-Host 'Relay Funnel endpoint disabled.'
    } elseif ($status.Contains($Target)) {
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
  $ours = $before.Contains($Target)
  if ($ours -and -not $before.ToLowerInvariant().Contains($dns)) {
    Fail 'Funnel target is active on a different hostname. Inspect tailscale status --json and tailscale funnel status; no relay was started.'
  }
  if ($ours -and -not (Test-Path $Marker)) { Fail 'Port 443 already points to this target but this script does not own it. Inspect tailscale funnel status before changing it.' }
  $ownedBeforeStart = $ours
  if (-not $ours -and $before -match 'https://') { Fail 'Another HTTPS Serve/Funnel endpoint is active. Inspect tailscale funnel status; this script will not replace it.' }
  $null = Compose 'up -d --no-build'
  $null = LocalHealth
  $version = Invoke-RestMethod -Uri "$Target/version" -TimeoutSec 3 -MaximumRedirection 0
  if ($version.current.release -ne $Release -or $version.current.path -notmatch '^/r/v[0-9]+\.[0-9]+\.[0-9]+/[a-f0-9]{64}/$') {
    Fail 'The relay web artifact does not match RELAY_RELEASE. Rebuild the matching APK/web release.'
  }
  if (-not $ours) {
    # No --bg: Tailscale documents that --bg resumes sharing after reboot.
    $startedProcess = Start-Process -FilePath $Tailscale -ArgumentList @('funnel', '--https=443', $Target) -WindowStyle Hidden -PassThru
    $startedFunnelThisRun = $true
    Start-Sleep -Seconds 2
    if ($startedProcess.HasExited) { Fail 'Funnel did not stay running. Check node approval in the Tailscale admin console and tailscale funnel status.' }
    $after = FunnelStatus
    if (-not $after.Contains($Target) -or -not $after.ToLowerInvariant().Contains($dns)) {
      Fail 'Funnel target or hostname does not match this Tailscale node. Check node approval and tailscale funnel status.'
    }
    Set-Content -Path $Marker -Value $dns -NoNewline
  }
  PublicHealth $url
  $null = Wsl ('source "$HOME/.nvm/nvm.sh" && nvm use >/dev/null && node tools/relay/write-qr.ts ' + $url + '/ tools/relay/relay-url.svg')
  try {
    $qrWindows = (Wsl 'wslpath -w "$PWD/tools/relay/relay-url.svg"' | Out-String).Trim()
    if ($qrWindows) { Start-Process -FilePath $qrWindows }
  } catch { Write-Host 'QR viewer could not open; use the WSL file path below.' }
  Write-Host "Relay ready: $url/"
  Write-Host "Health: $url/health"
  Write-Host "Web: $url$($version.current.path)"
  Write-Host "QR file in WSL: $Repo/tools/relay/relay-url.svg"
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
