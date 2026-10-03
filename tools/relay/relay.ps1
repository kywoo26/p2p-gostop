# FR-RP-07 / NF-RP-06 / RP-03B. ASCII source for Windows PowerShell 5.1.
param([ValidateSet('start', 'stop')][string]$Action, [switch]$Library)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'native.ps1')
. (Join-Path $PSScriptRoot 'ownership.ps1')
if (-not $Library) { Write-Host ("Runtime: {0} {1}" -f $PSVersionTable.PSEdition, $PSVersionTable.PSVersion) }
$Repo = $env:RELAY_WSL_REPO
$Docker = $null
$Target = 'http://127.0.0.1:17777'
$SecretDirectory = '$HOME/.local/share/p2p-gostop/relay'
$Release = 'v0.0.0'
$Marker = Join-Path $PSScriptRoot '.funnel-owned'
$Tailscale = if ($env:RELAY_TAILSCALE_EXE) { $env:RELAY_TAILSCALE_EXE } else { Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe' }

function Fail([string]$Message) { throw $Message }

function Wsl([string]$Command) {
  $result = InvokeRelayNative 'wsl.exe' @('--cd', $Repo, '--exec', '/bin/bash', '-lc', $Command)
  if ($result.ExitCode -ne 0) { Fail "WSL command failed (exit $($result.ExitCode)): $($result.Stderr.Trim())" }
  return $result.Stdout
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
  Fail 'Local /health is not ready. Check release/image, WSL forwarding, the fixed relay port and secret file. Use this wrapper stop before retrying.'
}

function FunnelStatus {
  $result = InvokeRelayNative $Tailscale @('funnel', 'status', '--json')
  if ($result.ExitCode -ne 0) { Fail 'Tailscale Funnel status failed. Start/sign in to the Windows Tailscale app.' }
  try { return ($result.Stdout | ConvertFrom-Json) }
  catch { Fail 'Tailscale returned invalid Funnel status JSON; raw status is withheld.' }
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
function ResolveRelayDocker {
  if ($Docker) { return }
  $path = if ($env:RELAY_WSL_DOCKER) { $env:RELAY_WSL_DOCKER } else {
    (Wsl 'command -v docker || { test -x "$HOME/.local/bin/docker" && printf "%s" "$HOME/.local/bin/docker"; }' | Out-String).Trim()
  }
  if (-not $path) { Fail 'Docker CLI was not found in WSL. Set RELAY_WSL_DOCKER to its executable path.' }
  $script:Docker = "'" + $path.Replace("'", "'\''") + "'"
}
function Compose($Lease, [string]$Arguments) {
  AssertRelayLease $Lease
  ResolveRelayDocker
  $command = 'RELAY_CREATION_SECRET_PATH="$HOME/.local/share/p2p-gostop/relay/creation-secret" ' +
    'RELAY_ALLOWED_ORIGINS=http://127.0.0.1:17777,https://' + $Lease.Node + ' RELAY_RELEASE=' + $Lease.Release +
    ' RELAY_IMAGE_TAG=' + $Lease.ImageTag + ' ' + $Docker +
    ' compose -p ' + $Lease.Project + ' -f compose.relay.yaml ' + $Arguments
  Wsl $command
}
function RelayImageId([string]$Tag) {
  if ($Tag -cnotmatch '^[a-f0-9]{12}$') { Fail 'Invalid release image tag.' }
  ResolveRelayDocker
  $id = (Wsl ($Docker + ' image inspect p2p-gostop-relay:' + $Tag + " --format '{{.Id}}'") | Out-String).Trim()
  if ($id -cnotmatch '^sha256:[a-f0-9]{64}$') { Fail 'Matching release image is not prepared; build it once in WSL.' }
  return $id
}
function AssertRelayCompose($Lease, [bool]$RequireContainer = $false) {
  $ids = @(((Compose $Lease 'ps -a -q' | Out-String).Trim() -split '\s+') | Where-Object { $_ })
  if ($RequireContainer -and $ids.Count -eq 0) { Fail 'Owned relay container is missing; retry stop before starting again.' }
  foreach ($id in $ids) {
    if ($id -cnotmatch '^[a-f0-9]{64}$') { Fail 'Unexpected container identifier; no cleanup is permitted.' }
    $fields = (Wsl ($Docker + ' inspect --format ' + "'{{.Image}}|{{index .Config.Labels ""com.docker.compose.project""}}|{{index .Config.Labels ""com.docker.compose.service""}}' " + $id) | Out-String).Trim().Split('|')
    if ($fields.Count -ne 3 -or $fields[0] -cne $Lease.ImageId -or $fields[1] -cne $Lease.Project -or $fields[2] -cne 'relay') {
      Fail 'Container image/project/service differs from its ownership marker; no cleanup is permitted.'
    }
  }
}
function RelayVersion($Lease) {
  $null = LocalHealth
  $version = Invoke-RestMethod -Uri "$Target/version" -TimeoutSec 3 -MaximumRedirection 0
  if ($version.current.release -cne $Lease.Release -or $version.current.path -cnotmatch '^/r/v[0-9]+\.[0-9]+\.[0-9]+/[a-f0-9]{64}/$' -or
      ($Lease.WebPath -and $version.current.path -cne $Lease.WebPath)) { Fail 'Relay web release/path differs from the ownership marker.' }
  return $version.current.path
}
function StartRelayFunnel($Lease) {
  # Retain this invocation's original process handle independently of the persisted identity.
  $out = Join-Path $env:TEMP ('p2p-gostop-relay-' + $Lease.RunId + '.stdout')
  $err = Join-Path $env:TEMP ('p2p-gostop-relay-' + $Lease.RunId + '.stderr')
  $process = Start-Process -FilePath $Tailscale -ArgumentList @('funnel', '--https=443', $Target) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  $null = $process.Handle
  return $process
}
function RemoveRelayLogs($Lease) {
  foreach ($suffix in @('.stdout', '.stderr')) {
    Remove-Item (Join-Path $env:TEMP ('p2p-gostop-relay-' + $Lease.RunId + $suffix)) -Force -ErrorAction SilentlyContinue
  }
}
function ShowRelayReady($Lease) {
  $url = 'https://' + $Lease.Node
  $qrWindows = Join-Path $PSScriptRoot 'relay-url.svg'
  $quotedQr = "'" + $qrWindows.Replace("'", "'\''") + "'"
  $qrWsl = (Wsl ('wslpath -u ' + $quotedQr) | Out-String).Trim()
  $quotedQrWsl = "'" + $qrWsl.Replace("'", "'\''") + "'"
  $null = Wsl ('source "$HOME/.nvm/nvm.sh" && nvm use >/dev/null && node tools/relay/write-qr.ts ' + $url + '/ ' + $quotedQrWsl)
  Write-Host "Relay ready: $url/"
  Write-Host "Health: $url/health"
  Write-Host "Web: $url$($Lease.WebPath)"
  Write-Host "QR file in WSL: $qrWsl"
  Write-Host 'Health confirms the relay response only; game connection is a separate check.'
}
function CleanupRelayInvocation($Run) {
  if (-not $Run.Lease) { return }
  $clean = $true
  if ($Run.Process) {
    # Only the object returned by OUR Start-Process call is used here. Never enumerate/kill by a matching PID.
    try {
      if (-not $Run.Process.HasExited) {
        AssertRelayLease $Run.Lease
        AssertRelayNodeAndSession $Run.Lease (FunnelStatus)
        if (-not $Run.Lease.Process -or $Run.Process.Id -ne $Run.Lease.Process.Id -or
            $Run.Process.StartTime.ToUniversalTime().Ticks -ne $Run.Lease.Process.StartTicks) { Fail 'Incomplete original process identity; automatic termination is unsafe.' }
        AssertRelayProcessRecord (GetRelayProcessRecord $Run.Process.Id) $Run.Lease
        $Run.Process.Kill(); if (-not $Run.Process.WaitForExit(3000)) { Fail 'Owned process did not exit.' }
      }
    }
    catch { [Console]::Error.WriteLine('This invocation could not stop its Funnel process; preserve the marker and retry stop.'); $clean = $false }
    if ($clean -and $Run.Lease.SessionId -and (GetRelaySession (FunnelStatus) $Run.Lease.SessionId)) { $clean = $false }
  }
  if ($Run.ComposeAttempted) {
    try { AssertRelayCompose $Run.Lease; $null = Compose $Run.Lease 'down' }
    catch { [Console]::Error.WriteLine('This invocation could not clean up its Compose project; preserve the marker and retry stop.'); $clean = $false }
  }
  if ($clean) { RemoveRelayLogs $Run.Lease; RemoveRelayLease $Run.Lease }
}
function InvokeRelayStart([string]$RunId) {
  $run = [pscustomobject]@{ Lease = $null; Process = $null; ComposeAttempted = $false }
  $succeeded = $false
  try {
    $existing = ReadRelayLease
    $dns = DnsName
    $status = FunnelStatus
    $state = FunnelState $status $dns
    if ($existing) {
      if ($existing.Phase -ne 'running') { Fail 'An interrupted invocation owns resources; run this wrapper stop before retrying start.' }
      AssertRelayNodeAndSession $existing $status
      if (-not (GetRelaySession $status $existing.SessionId)) { Fail 'Owned Funnel session is missing; run stop before retrying start.' }
      $process = OpenVerifiedRelayProcess $existing
      if (-not $process) { Fail 'Owned Funnel process is missing; run stop before retrying start.' }
      $process.Dispose()
      $tag = (Wsl 'git rev-parse --short=12 HEAD' | Out-String).Trim()
      if ($tag -cne $existing.ImageTag -or (RelayImageId $tag) -cne $existing.ImageId) { Fail 'Current release image differs from the ownership marker.' }
      AssertRelayCompose $existing $true
      $null = RelayVersion $existing
      PublicHealth ('https://' + $existing.Node)
      ShowRelayReady $existing
      $succeeded = $true
      return 0
    }
    if ($state.HasEndpoint) { Fail 'A Serve/Funnel endpoint exists without this wrapper ownership; no resources were changed.' }
    $null = Wsl 'test -f compose.relay.yaml && test -d packages/web/dist'
    $releaseInput = if ($env:RELAY_RELEASE) { $env:RELAY_RELEASE } else { (Wsl 'git describe --tags --exact-match' | Out-String).Trim() }
    if ($releaseInput -cnotmatch '^v[0-9]+\.[0-9]+\.[0-9]+$') { Fail 'Use the matching release tag or set RELAY_RELEASE to vMAJOR.MINOR.PATCH.' }
    $script:Release = $releaseInput
    $tag = (Wsl 'git rev-parse --short=12 HEAD' | Out-String).Trim()
    $lease = NewRelayLease $dns $tag (RelayImageId $tag) $RunId
    EnsureSecret
    WriteRelayLease $lease
    $run.Lease = $lease
    if ((Compose $lease 'ps -a -q' | Out-String).Trim()) { Fail 'New project unexpectedly exists; ownership cannot be established.' }
    $lease.Phase = 'compose'; $lease.ComposeAttempted = $true
    WriteRelayLease $lease # Persist intent before up, so a fresh stop can recover a crash.
    $run.ComposeAttempted = $true
    $null = Compose $lease 'up -d --no-build --no-recreate --pull never'
    AssertRelayCompose $lease $true
    $lease.WebPath = RelayVersion $lease
    $lease.Phase = 'launching'
    WriteRelayLease $lease
    $run.Process = StartRelayFunnel $lease
    CaptureRelayProcess $run.Process $lease
    WriteRelayLease $lease
    Start-Sleep -Seconds 2
    if ($run.Process.HasExited) { Fail 'Funnel exited before readiness; check this node approval.' }
    $after = FunnelStatus
    $sessions = @($after.Foreground.PSObject.Properties | Where-Object { TestRelaySession $_.Value $dns })
    if ($sessions.Count -ne 1) { Fail 'A unique owned foreground session was not established.' }
    $lease.SessionId = $sessions[0].Name
    WriteRelayLease $lease
    PublicHealth ('https://' + $dns)
    $lease.Phase = 'running'
    WriteRelayLease $lease
    ShowRelayReady $lease
    $succeeded = $true
    return 0
  } catch {
    if ($Library) { [Console]::Error.WriteLine('Owned start failed; native details are withheld.') }
    else { [Console]::Error.WriteLine("Start failed: $_") }
    return 4
  } finally {
    if (-not $succeeded) { CleanupRelayInvocation $run }
    if ($run.Process) { $run.Process.Dispose() }
  }
}
function InvokeRelayStop {
  $lease = ReadRelayLease
  if (-not $lease) { Write-Host 'No resources are owned by this wrapper; nothing was changed.'; return 0 }
  $failed = $false
  try { StopOwnedRelayFunnel $lease; Write-Host 'Relay Funnel endpoint disabled.' }
  catch { [Console]::Error.WriteLine("Owned Funnel cleanup refused or incomplete: $_"); $failed = $true }
  if ($lease.ComposeAttempted) {
    try { AssertRelayCompose $lease; $null = Compose $lease 'down'; Write-Host 'Relay container stopped.' }
    catch { [Console]::Error.WriteLine("Owned Compose cleanup refused or incomplete: $_"); $failed = $true }
  }
  if ($failed) { return 3 }
  RemoveRelayLogs $lease
  RemoveRelayLease $lease
  return 0
}
function InvokeRelayAction([string]$RequestedAction) {
  $lock = $null
  try {
    if (-not $Repo -or -not $Repo.StartsWith('/')) { Fail 'Set RELAY_WSL_REPO to the absolute WSL release repository path.' }
    $lock = EnterRelayLock # Held through checks/up/marker updates/rollback/stop; second invocation changes nothing.
    if ($RequestedAction -eq 'start') { return (InvokeRelayStart) }
    if ($RequestedAction -eq 'stop') { return (InvokeRelayStop) }
    Fail 'Unsupported relay action.'
  } catch { [Console]::Error.WriteLine("Relay operation refused: $_"); return 2 }
  finally { if ($lock) { $lock.Dispose() } }
}
if (-not $Library) { exit (InvokeRelayAction $Action) }
