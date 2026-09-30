# FR-RP-07 / RP-03B. Local ownership records; never print their contents.
# A same-directory rename avoids File.Replace's unsupported backup operation on WSL UNC.
if (-not ('RelayAtomicFile' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
public static class RelayAtomicFile {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool MoveFileEx(string source, string destination, uint flags);
  public static void Replace(string source, string destination) {
    source = Path.GetFullPath(source);
    destination = Path.GetFullPath(destination);
    if (!String.Equals(Path.GetDirectoryName(source), Path.GetDirectoryName(destination), StringComparison.OrdinalIgnoreCase))
      throw new IOException("Ownership replacement must stay in one directory.");
    // REPLACE_EXISTING | WRITE_THROUGH; never copy/delete across volumes.
    if (!MoveFileEx(source, destination, 1 | 8))
      throw new Win32Exception(Marshal.GetLastWin32Error());
  }
}
'@
}
function EnterRelayLock {
  try { return [IO.File]::Open($Marker + '.lock', [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
  catch { Fail 'Another wrapper invocation is active, or the ownership lock is unavailable. Retry after it finishes.' }
}
function GetRelayUserSid { return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }
function AssertRelayLease($Lease) {
  if (-not $Lease -or $Lease.Schema -ne 2 -or $Lease.RunId -cnotmatch '^[a-f0-9]{32}$' -or
      $Lease.Project -cne ('p2p-gostop-relay-' + $Lease.RunId) -or $Lease.OwnerSid -cne (GetRelayUserSid) -or
      $Lease.Repo -cne $Repo -or $Lease.Tailscale -ine $Tailscale -or
      $Lease.Node -cnotmatch '^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$' -or
      $Lease.Release -cnotmatch '^v[0-9]+\.[0-9]+\.[0-9]+$' -or $Lease.ImageTag -cnotmatch '^[a-f0-9]{12}$' -or
      $Lease.ImageId -cnotmatch '^sha256:[a-f0-9]{64}$' -or $Lease.ComposeAttempted -isnot [bool] -or
      $Lease.Phase -notin @('prepared', 'compose', 'launching', 'running')) {
    Fail 'Ownership marker is missing, legacy, incomplete, or belongs to another user/repository. Preserve it and use the original wrapper for recovery.'
  }
  if ($Lease.Process) {
    if ($Lease.Process.Id -le 0 -or $Lease.Process.CreationTicks -le 0 -or $Lease.Process.StartTicks -le 0 -or
        $Lease.Process.ParentId -le 0 -or -not $Lease.Process.CommandLine -or
        -not (TestRelayFunnelCommand $Lease.Process.CommandLine $Lease.Tailscale)) { Fail 'Invalid process identity in ownership marker.' }
  }
  if ($Lease.Phase -eq 'running' -and (-not $Lease.Process -or -not $Lease.SessionId -or
      $Lease.WebPath -cnotmatch '^/r/v[0-9]+\.[0-9]+\.[0-9]+/[a-f0-9]{64}/$')) { Fail 'Incomplete running ownership marker.' }
}
function ReadRelayLease {
  if (-not [IO.File]::Exists($Marker)) { return $null }
  try { $lease = [IO.File]::ReadAllText($Marker) | ConvertFrom-Json }
  catch { Fail 'Ownership marker is legacy or incomplete; no automatic cleanup is permitted.' }
  AssertRelayLease $lease
  return $lease
}
function WriteRelayLease($Lease) {
  AssertRelayLease $Lease
  # All readers/writers hold the same exclusive lock; replace a complete JSON file.
  $temporary = $Marker + '.' + $Lease.RunId + '.tmp'
  try {
    [IO.File]::WriteAllText($temporary, ($Lease | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
    if ([IO.File]::Exists($Marker)) {
      $current = ReadRelayLease
      if ($current.RunId -cne $Lease.RunId) { Fail 'Ownership changed; refusing to overwrite another invocation.' }
      [RelayAtomicFile]::Replace($temporary, $Marker)
    } else { [IO.File]::Move($temporary, $Marker) }
  } finally {
    if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
  }
}
function RemoveRelayLease($Lease) {
  $current = ReadRelayLease
  if ($current -and $current.RunId -cne $Lease.RunId) { Fail 'Ownership changed; refusing to remove another invocation.' }
  if ($current) {
    $temporary = $Marker + '.' + $Lease.RunId + '.tmp'
    if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
    [IO.File]::Delete($Marker)
  }
}
function NewRelayLease([string]$Node, [string]$ImageTag, [string]$ImageId) {
  $runId = [Guid]::NewGuid().ToString('N')
  return [pscustomobject]@{
    Schema = 2; RunId = $runId; Project = 'p2p-gostop-relay-' + $runId
    OwnerSid = GetRelayUserSid; Repo = $Repo; Tailscale = $Tailscale; Node = $Node
    Release = $Release; ImageTag = $ImageTag; ImageId = $ImageId; ComposeAttempted = $false
    Phase = 'prepared'; Process = $null; SessionId = $null; WebPath = $null
  }
}
function TestRelayFunnelCommand([string]$CommandLine, [string]$Executable) {
  $exe = [regex]::Escape($Executable)
  # Anchored complete argv: no suffix path, --set-path, extra flag, or extra target.
  return $CommandLine -match ('^\s*(?:"' + $exe + '"|' + $exe + ')\s+funnel\s+--https=443\s+(?:"http://127\.0\.0\.1:17777"|http://127\.0\.0\.1:17777)\s*$')
}
function GetRelayProcessRecord([int]$ProcessId) {
  $record = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  if (-not $record) { return $null }
  $owner = Invoke-CimMethod -InputObject $record -MethodName GetOwnerSid -ErrorAction Stop
  if ($owner.ReturnValue -ne 0) { Fail 'Could not verify process owner; no process will be stopped.' }
  return [pscustomobject]@{
    Id = [int]$record.ProcessId; CreationTicks = $record.CreationDate.ToUniversalTime().Ticks
    ParentId = [int]$record.ParentProcessId; Executable = $record.ExecutablePath
    CommandLine = $record.CommandLine; OwnerSid = $owner.Sid
  }
}
function OpenRelayProcess([int]$ProcessId) {
  try {
    $process = [Diagnostics.Process]::GetProcessById($ProcessId)
    $null = $process.Handle # Open a handle before checking identity; Kill uses this process object.
    return $process
  } catch [ArgumentException] { return $null }
}
function AssertRelayProcessRecord($Record, $Lease) {
  $identity = $Lease.Process
  if (-not $Record -or $Record.Id -ne $identity.Id -or $Record.CreationTicks -ne $identity.CreationTicks -or
      $Record.ParentId -ne $identity.ParentId -or $Record.OwnerSid -cne $Lease.OwnerSid -or
      $Record.Executable -ine $Lease.Tailscale -or $Record.CommandLine -cne $identity.CommandLine -or
      -not (TestRelayFunnelCommand $Record.CommandLine $Lease.Tailscale)) {
    Fail 'Process identity/owner/arguments changed; refusing to stop it.'
  }
}
function CaptureRelayProcess($Process, $Lease) {
  $null = $Process.Handle
  $record = GetRelayProcessRecord $Process.Id
  if (-not $record -or $record.Id -ne $Process.Id -or $record.ParentId -ne $PID -or $record.OwnerSid -cne $Lease.OwnerSid -or
      $record.Executable -ine $Lease.Tailscale -or -not (TestRelayFunnelCommand $record.CommandLine $Lease.Tailscale) -or $Process.HasExited) {
    Fail 'Could not establish ownership of the newly launched Funnel process.'
  }
  $Lease.Process = [pscustomobject]@{
    Id = $record.Id; ParentId = $record.ParentId; CreationTicks = $record.CreationTicks
    StartTicks = $Process.StartTime.ToUniversalTime().Ticks; CommandLine = $record.CommandLine
  }
}
function OpenVerifiedRelayProcess($Lease) {
  if (-not $Lease.Process) { return $null }
  $process = OpenRelayProcess $Lease.Process.Id
  if (-not $process) { return $null }
  try {
    if ($process.HasExited) { $process.Dispose(); return $null }
    if ($process.StartTime.ToUniversalTime().Ticks -ne $Lease.Process.StartTicks) { Fail 'PID was reused; refusing to stop it.' }
    AssertRelayProcessRecord (GetRelayProcessRecord $Lease.Process.Id) $Lease
    return $process
  } catch { $process.Dispose(); throw }
}
function FunnelState($Status, [string]$Dns) {
  $configs = @($Status)
  if ($Status.Foreground) { $configs += @($Status.Foreground.PSObject.Properties | ForEach-Object { $_.Value }) }
  $hasEndpoint = $false; $ours = $false; $foreignTarget = $false
  foreach ($config in $configs) {
    if ($config.TCP -and @($config.TCP.PSObject.Properties).Count -gt 0) { $hasEndpoint = $true }
    if ($config.Web) {
      foreach ($web in $config.Web.PSObject.Properties) {
        $hasEndpoint = $true
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
function TestRelaySession($Config, [string]$Node) {
  $tcp = @($Config.TCP.PSObject.Properties)
  $web = @($Config.Web.PSObject.Properties)
  if ($tcp.Count -ne 1 -or $tcp[0].Name -ne '443' -or $tcp[0].Value.HTTPS -ne $true -or
      $web.Count -ne 1 -or $web[0].Name -ine ($Node + ':443')) { return $false }
  $handlers = @($web[0].Value.Handlers.PSObject.Properties)
  if ($handlers.Count -ne 1 -or $handlers[0].Name -ne '/' -or $handlers[0].Value.Proxy -cne $Target) { return $false }
  return $true
}
function GetRelaySession($Status, [string]$SessionId) {
  if (-not $Status.Foreground -or -not $SessionId) { return $null }
  return ($Status.Foreground.PSObject.Properties | Where-Object { $_.Name -ceq $SessionId } | Select-Object -First 1).Value
}
function AssertRelayNodeAndSession($Lease, $Status) {
  if ((DnsName) -cne $Lease.Node) { Fail 'Active Tailscale node differs from the ownership marker; nothing will be stopped.' }
  $session = GetRelaySession $Status $Lease.SessionId
  if ($session -and -not (TestRelaySession $session $Lease.Node)) { Fail 'Owned session target/path changed; nothing will be stopped.' }
  if (-not $Lease.Process -and (FunnelState $Status $Lease.Node).HasEndpoint) {
    Fail 'Incomplete launch identity with active endpoints; automatic process cleanup is unsafe.'
  }
}
function StopOwnedRelayFunnel($Lease) {
  AssertRelayLease $Lease
  $status = FunnelStatus
  AssertRelayNodeAndSession $Lease $status # Validate BEFORE opening or killing any process.
  $process = OpenVerifiedRelayProcess $Lease
  if ($process) {
    try { $process.Kill(); if (-not $process.WaitForExit(3000)) { Fail 'Owned process did not exit; retain the marker and retry stop.' } }
    finally { $process.Dispose() }
  }
  # Only foreground sessions created by this wrapper are managed; never issue a blanket off/reset.
  for ($i = 0; $i -lt 10; $i++) {
    if (-not (GetRelaySession (FunnelStatus) $Lease.SessionId)) { return }
    Start-Sleep -Milliseconds 100
  }
  Fail 'Owned foreground session remains; preserve the marker and retry stop after inspecting it.'
}
