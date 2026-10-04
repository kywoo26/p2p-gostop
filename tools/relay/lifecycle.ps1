# RP-OPS01: bounded, explicit operations. Existing native/ownership adapters are reused.
# ASCII for Desktop 5.1. No global registry, background boot sharing, or secret rotation.
$identityHash = [Security.Cryptography.SHA256]::Create()
try { $OpsIdentity = ([BitConverter]::ToString($identityHash.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($PSScriptRoot).ToLowerInvariant())))).Replace('-', '').ToLowerInvariant() }
finally { $identityHash.Dispose() }
$OpsStateDirectory = Join-Path $env:LOCALAPPDATA ('p2p-gostop-relay\' + $OpsIdentity)
$OpsPreparedFile = Join-Path $OpsStateDirectory 'prepared.json'
$OpsJournalFile = Join-Path $OpsStateDirectory 'rollback.json'

function QuoteOpsShell([string]$Value) {
  if ($Value.Contains([char]0) -or $Value.Contains("`r") -or $Value.Contains("`n")) { Fail 'Invalid argument.' }
  return "'" + $Value.Replace("'", "'\''") + "'"
}
function Wsl([string]$Command) {
  $result = InvokeRelayNative 'wsl.exe' @('--cd', $Repo, '--exec', '/bin/bash', '-lc', $Command)
  if ($result.ExitCode -ne 0) { Fail 'WSL adapter failed; native details are withheld.' }
  return $result.Stdout
}
function ReadOpsRecord([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { return $null }
  if (([IO.File]::GetAttributes($Path) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'Operation record cannot be a link.' }
  $record = [IO.File]::ReadAllText($Path) | ConvertFrom-Json
  if ($record.Schema -ne 1 -or $record.OwnerSid -cne (GetRelayUserSid) -or $record.Wrapper -cne $OpsIdentity) { Fail 'Operation record belongs to another wrapper/user.' }
  return $record
}
function WriteOpsRecord([string]$Path, $Record) {
  if ($Record.Schema -ne 1 -or $Record.OwnerSid -cne (GetRelayUserSid) -or $Record.Wrapper -cne $OpsIdentity) { Fail 'Invalid operation record.' }
  $null = [IO.Directory]::CreateDirectory($OpsStateDirectory)
  if (([IO.File]::GetAttributes($OpsStateDirectory) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'Operation directory cannot be a link.' }
  $temporary = $Path + '.tmp'
  $created = $false
  try {
    if ([IO.File]::Exists($temporary) -or [IO.Directory]::Exists($temporary)) { Fail 'Stale operation temporary file requires inspection.' }
    $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes(($Record | ConvertTo-Json -Depth 20))
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $created = $true
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    if ([IO.File]::Exists($Path)) { $null = ReadOpsRecord $Path; [RelayAtomicFile]::Replace($temporary, $Path) }
    else { [IO.File]::Move($temporary, $Path) }
  } finally { if ($created -and [IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}
function NewOpsRecord {
  return [pscustomobject]@{ Schema = 1; OwnerSid = GetRelayUserSid; Wrapper = $OpsIdentity }
}
function GetOpsSecretFingerprint {
  $value = (Wsl 'f="$HOME/.local/share/p2p-gostop/relay/creation-secret"; test -f "$f" && test ! -L "$f" && sha256sum "$f"' | Out-String).Trim().Split(' ')[0]
  if ($value -cnotmatch '^[a-f0-9]{64}$') { Fail 'Existing creation secret is required; no secret was generated.' }
  return $value
}
function EnsureSecret { $null = GetOpsSecretFingerprint }
function GetOpsSource([string]$ExpectedRelease, [string]$ExpectedSource) {
  if ($ExpectedRelease -cnotmatch '^v[0-9]+\.[0-9]+\.[0-9]+$' -or $ExpectedSource -cnotmatch '^[a-f0-9]{40}$') { Fail 'Exact release/source are required.' }
  $head = (Wsl 'git rev-parse HEAD' | Out-String).Trim()
  $tag = (Wsl ('git rev-parse ' + (QuoteOpsShell ($ExpectedRelease + '^{commit}'))) | Out-String).Trim()
  if ($head -cne $ExpectedSource -or $tag -cne $head -or (Wsl 'git status --porcelain --untracked-files=all' | Out-String).Trim()) { Fail 'Use a separate clean exact-tag checkout; no checkout/reset is performed.' }
  if ((Wsl 'cat .nvmrc' | Out-String).Trim() -cne '24.21.0') { Fail 'Node pin differs.' }
  $compose = (Wsl 'sha256sum compose.relay.yaml' | Out-String).Trim().Split(' ')[0]
  if ($compose -cnotmatch '^[a-f0-9]{64}$') { Fail 'Compose source is unavailable.' }
  return $compose
}
function InvokeOpsArtifact([string]$Directory, [string]$Source) {
  $helper = (Wsl ('wslpath -u ' + (QuoteOpsShell (Join-Path $PSScriptRoot 'artifact.mjs'))) | Out-String).Trim()
  $command = 'source "$HOME/.nvm/nvm.sh" && nvm use >/dev/null && node ' + (QuoteOpsShell $helper) + ' inspect ' + (QuoteOpsShell $Directory) + ' ' + (QuoteOpsShell $Source)
  return ((Wsl $command | Out-String) | ConvertFrom-Json)
}
function AssertOpsArtifact($Artifact, [string]$Source) {
  if ($Artifact.source -cne $Source -or $Artifact.hash -cnotmatch '^[a-f0-9]{64}$' -or $Artifact.assetSetVersion -ne 2 -or
      $Artifact.wireVersion -lt 1 -or @($Artifact.files).Count -lt 1 -or @($Artifact.files).Count -gt 4096 -or @($Artifact.initial).Count -lt 1) { Fail 'Invalid artifact metadata.' }
  foreach ($file in $Artifact.files) {
    if ($file.path -cnotmatch '^[A-Za-z0-9_/.-]+$' -or $file.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $file.size -lt 0 -or $file.size -gt 67108864) { Fail 'Invalid file manifest.' }
  }
}
function TestOpsManifest($Left, $Right) {
  return ($Left | ConvertTo-Json -Depth 20 -Compress) -ceq ($Right | ConvertTo-Json -Depth 20 -Compress)
}
function GetOpsImageFiles([string]$ImageId) {
  if ($ImageId -cnotmatch '^sha256:[a-f0-9]{64}$') { Fail 'Invalid image identifier.' }
  ResolveRelayDocker
  # A temporary, network-disabled image inspection. No ports, mounts, or relay command.
  $code = @'
const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto');let total=0;const a=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())walk(f);else{const s=fs.lstatSync(f);if(!s.isFile()||s.size>67108864||a.length>=4096)throw Error('input');total+=s.size;if(total>67108864)throw Error('limit');a.push({path:p.relative('/app/packages/web/dist',f),sha256:c.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),size:s.size})}}}walk('/app/packages/web/dist');a.sort((x,y)=>x.path.localeCompare(y.path));console.log(JSON.stringify(a));
'@
  return ((Wsl ($Docker + ' run --rm --network none --read-only --cap-drop=ALL --security-opt=no-new-privileges --entrypoint=node ' + $ImageId + ' -e ' + (QuoteOpsShell $code)) | Out-String) | ConvertFrom-Json)
}
function ExpandOpsArchive([string]$Archive, [string]$ExpectedSHA, [string]$Destination) {
  if ($ExpectedSHA -cnotmatch '^[a-f0-9]{64}$' -or -not [IO.File]::Exists($Archive) -or [IO.Directory]::Exists($Destination) -or [IO.File]::Exists($Destination)) { Fail 'Archive/destination are invalid.' }
  if (([IO.File]::GetAttributes($Archive) -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or ([IO.FileInfo]$Archive).Length -gt 67108864) { Fail 'Archive input refused.' }
  if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedSHA) { Fail 'Archive SHA differs from the approved input.' }
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
  try {
    if ($zip.Entries.Count -lt 1 -or $zip.Entries.Count -gt 4096) { Fail 'Archive entry limit.' }
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $total = 0L
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName.TrimEnd('/')
      $directory = $entry.FullName.EndsWith('/')
      if ($name -cnotmatch '^[A-Za-z0-9_/.-]+$' -or $name.StartsWith('/') -or @($name.Split('/') | Where-Object { -not $_ -or $_ -eq '.' -or $_ -eq '..' -or $_.StartsWith('.') }).Count -gt 0 -or -not $seen.Add($name)) { Fail 'Unsafe/duplicate archive path.' }
      $kind = ($entry.ExternalAttributes -shr 16) -band 61440
      if ($kind -notin @(0, $(if ($directory) { 16384 } else { 32768 })) -or $entry.Length -lt 0 -or $entry.Length -gt 67108864 -or ($directory -and $entry.Length -ne 0)) { Fail 'Unsupported archive entry.' }
      $total += $entry.Length
      if ($total -gt 67108864) { Fail 'Archive decompressed size limit.' }
    }
    $null = [IO.Directory]::CreateDirectory($Destination)
    foreach ($entry in $zip.Entries) {
      $path = Join-Path $Destination $entry.FullName
      if ($entry.FullName.EndsWith('/')) { $null = [IO.Directory]::CreateDirectory($path); continue }
      $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))
      $input = $entry.Open(); $output = $null
      try {
        $output = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $buffer = New-Object byte[] 8192; $written = 0L
        while (($n = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
          $written += $n
          if ($written -gt $entry.Length) { Fail 'Archive decompression exceeded declared size.' }
          $output.Write($buffer, 0, $n)
        }
        if ($written -ne $entry.Length) { Fail 'Archive entry size mismatch.' }
      } finally { $input.Dispose(); if ($output) { $output.Dispose() } }
    }
  } catch { if ([IO.Directory]::Exists($Destination)) { [IO.Directory]::Delete($Destination, $true) }; throw }
  finally { $zip.Dispose() }
}
function AssertOpsPrepared($Prepared) {
  if (-not $Prepared -or -not $Prepared.Repo.StartsWith('/') -or $Prepared.Release -cnotmatch '^v[0-9]+\.[0-9]+\.[0-9]+$' -or
      $Prepared.Source -cnotmatch '^[a-f0-9]{40}$' -or $Prepared.ImageTag -cne $Prepared.Source.Substring(0, 12) -or
      $Prepared.ImageId -cnotmatch '^sha256:[a-f0-9]{64}$' -or $Prepared.Secret -cnotmatch '^[a-f0-9]{64}$' -or
      $Prepared.Node -cnotmatch '^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$') { Fail 'Prepared record is incomplete.' }
  AssertOpsArtifact $Prepared.Artifact $Prepared.Source
}
function CheckOpsPrepared($Prepared) {
  AssertOpsPrepared $Prepared
  $saved = $Repo; $script:Repo = $Prepared.Repo
  try {
    if ((GetOpsSource $Prepared.Release $Prepared.Source) -cne $Prepared.Compose -or
        (GetOpsSecretFingerprint) -cne $Prepared.Secret -or (DnsName) -cne $Prepared.Node -or
        (RelayImageId $Prepared.ImageTag) -cne $Prepared.ImageId) { Fail 'Prepared source/config/secret/node/image changed; prepare again.' }
    $artifact = InvokeOpsArtifact 'packages/web/dist' $Prepared.Source
    if (-not (TestOpsManifest $artifact $Prepared.Artifact) -or -not (TestOpsManifest @(GetOpsImageFiles $Prepared.ImageId) @($Prepared.Artifact.files))) { Fail 'Prepared dist/image bytes changed.' }
  } finally { $script:Repo = $saved }
}
function GetOpsSnapshot($Lease) {
  $source = (Wsl 'git rev-parse HEAD' | Out-String).Trim()
  $artifact = InvokeOpsArtifact 'packages/web/dist' $source
  $snapshot = [pscustomobject]@{ Repo = $Repo; Release = $Lease.Release; Source = $source; ImageTag = $Lease.ImageTag; ImageId = $Lease.ImageId; Node = $Lease.Node; Secret = GetOpsSecretFingerprint; Compose = GetOpsSource $Lease.Release $source; Artifact = $artifact }
  CheckOpsPrepared $snapshot
  return $snapshot
}
function InvokeOpsPrepare($Request) {
  $journal = ReadOpsRecord $OpsJournalFile
  $lease = ReadOpsCurrentLease $journal
  if (-not $Request.CandidateRepo -or -not $Request.CandidateRepo.StartsWith('/') -or ($lease -and $Request.CandidateRepo -ceq $lease.Repo)) { Fail 'Prepare in a separate checkout while a lease is present.' }
  if ($journal -and $journal.Stage -notin @('applied', 'restored')) { Fail 'Pending recovery must finish before prepare.' }
  $saved = $Repo; $script:Repo = $Request.CandidateRepo
  $staging = Join-Path $env:TEMP ('relay-artifact-' + [Guid]::NewGuid().ToString('N'))
  try {
    $compose = GetOpsSource $Request.Release $Request.Source
    ExpandOpsArchive $Request.Archive $Request.ArchiveSHA $staging
    $directory = (Wsl ('wslpath -u ' + (QuoteOpsShell $staging)) | Out-String).Trim()
    $artifact = InvokeOpsArtifact $directory $Request.Source
    AssertOpsArtifact $artifact $Request.Source
    # Never overwrite an existing wrong dist. Copy only a missing output, before downtime.
    $exists = (Wsl 'if test -e packages/web/dist; then printf yes; else printf no; fi' | Out-String).Trim()
    if ($exists -eq 'yes') {
      if (-not (TestOpsManifest (InvokeOpsArtifact 'packages/web/dist' $Request.Source) $artifact)) { Fail 'Candidate dist differs; it was preserved.' }
    } else { $null = Wsl ('test -d packages/web && test ! -L packages && test ! -L packages/web && test ! -L packages/web/dist && cp -a -- ' + (QuoteOpsShell $directory) + ' packages/web/dist') }
    $tag = $Request.Source.Substring(0, 12)
    if ($Request.BuildImage) {
      ResolveRelayDocker
      $null = Wsl ('RELAY_IMAGE_TAG=' + $tag + ' ' + $Docker + ' compose -f compose.relay.yaml build relay')
    }
    $prepared = [pscustomobject]@{ Repo = $Repo; Release = $Request.Release; Source = $Request.Source; ImageTag = $tag; ImageId = RelayImageId $tag; Node = DnsName; Secret = GetOpsSecretFingerprint; Compose = $compose; Artifact = $artifact; ArchiveSHA = $Request.ArchiveSHA }
    CheckOpsPrepared $prepared
    $record = NewOpsRecord; $record | Add-Member NoteProperty Prepared $prepared
    WriteOpsRecord $OpsPreparedFile $record
    return $prepared
  } finally { $script:Repo = $saved; if ([IO.Directory]::Exists($staging)) { [IO.Directory]::Delete($staging, $true) } }
}
function GetOpsJson([string]$Url) { return (Invoke-RestMethod -Uri $Url -TimeoutSec 5 -MaximumRedirection 0 -Headers @{ Connection = 'close' }) }
function GetOpsHttpDigest([string]$Url) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5 -MaximumRedirection 0 -Headers @{ Connection = 'close' }
  $memory = New-Object IO.MemoryStream
  $hash = [Security.Cryptography.SHA256]::Create()
  try {
    $response.RawContentStream.Position = 0; $response.RawContentStream.CopyTo($memory)
    return [pscustomobject]@{ Status = [int]$response.StatusCode; Type = [string]$response.Headers['Content-Type']; SHA = ([BitConverter]::ToString($hash.ComputeHash($memory.ToArray()))).Replace('-', '').ToLowerInvariant() }
  } finally { $memory.Dispose(); $hash.Dispose() }
}
function VerifyOpsRelease($Prepared) {
  $prefix = '/r/' + $Prepared.Release + '/' + $Prepared.Artifact.hash + '/'
  foreach ($origin in @($Target, ('https://' + $Prepared.Node))) {
    $health = GetOpsJson ($origin + '/health'); $version = GetOpsJson ($origin + '/version')
    if ($health.ready -ne $true -or $health.relay -cne 'p2p-gostop' -or $health.wireVersion -ne $Prepared.Artifact.wireVersion -or
        $version.current.release -cne $Prepared.Release -or $version.current.hash -cne $Prepared.Artifact.hash -or
        $version.current.wireVersion -ne $Prepared.Artifact.wireVersion -or $version.current.path -cne $prefix) { Fail 'Health/version/hash/wire mismatch.' }
    foreach ($path in @('index.html') + @($Prepared.Artifact.initial)) {
      $expected = @($Prepared.Artifact.files | Where-Object { $_.path -ceq $path })
      $answer = GetOpsHttpDigest ($origin + $prefix + $(if ($path -eq 'index.html') { '' } else { $path }))
      $type = if ($path -eq 'index.html') { 'text/html' } elseif ($path.EndsWith('.js')) { 'text/javascript' } else { 'text/css' }
      if ($expected.Count -ne 1 -or $answer.Status -ne 200 -or $answer.SHA -cne $expected[0].sha256 -or -not $answer.Type.StartsWith($type)) { Fail 'Initial asset bytes/MIME/status mismatch.' }
    }
  }
}
function GetOpsConnections($Lease) {
  AssertRelayCompose $Lease $true; ResolveRelayDocker
  $ids = @(((Compose $Lease 'ps -q' | Out-String).Trim() -split '\s+') | Where-Object { $_ })
  if ($ids.Count -ne 1 -or $ids[0] -cnotmatch '^[a-f0-9]{64}$') { Fail 'Cannot establish the owned connection boundary.' }
  $code = 'const fs=require("node:fs");let n=0;for(const f of ["/proc/net/tcp","/proc/net/tcp6"])for(const l of fs.readFileSync(f,"utf8").trim().split("\n").slice(1)){const a=l.trim().split(/\s+/);if(a[1].split(":")[1]==="4571"&&a[3]==="01")n++}console.log(n);'
  $count = (Wsl ($Docker + ' exec ' + $ids[0] + ' node -e ' + (QuoteOpsShell $code)) | Out-String).Trim()
  if ($count -cnotmatch '^[0-9]+$') { Fail 'Owned connection count is unavailable.' }
  return [int]$count
}
function AssertOpsOwned($Lease, [bool]$RequireRunning = $true) {
  AssertRelayLease $Lease
  $status = FunnelStatus
  AssertRelayNodeAndSession $Lease $status
  if ($Lease.ComposeAttempted) { AssertRelayCompose $Lease $RequireRunning }
  $process = OpenVerifiedRelayProcess $Lease
  if ($RequireRunning -and ($Lease.Phase -ne 'running' -or -not $process -or -not (GetRelaySession $status $Lease.SessionId))) {
    if ($process) { $process.Dispose() }
    Fail 'Owned running process/session is missing.'
  }
  if ($process) { $process.Dispose() }
}
function StopOpsOwned($Lease) {
  # Validate both resources before touching either. Unlike a blanket down, failed Funnel cleanup aborts here.
  AssertOpsOwned $Lease $false
  StopOwnedRelayFunnel $Lease
  if ($Lease.ComposeAttempted) { AssertRelayCompose $Lease; $null = Compose $Lease 'down' }
  RemoveRelayLogs $Lease; RemoveRelayLease $Lease
}
function ShowRelayReady($Lease) {
  # Private URL stays in a local user file; stdout is a redacted readiness event.
  $null = [IO.Directory]::CreateDirectory($OpsStateDirectory)
  [IO.File]::WriteAllText((Join-Path $OpsStateDirectory 'relay-url.txt'), ('https://' + $Lease.Node + '/'))
  Write-Host 'Relay ready (owned foreground session). Private URL file updated; remote game not verified.'
}
function StartOpsPrepared($Prepared, [string]$RunId) {
  CheckOpsPrepared $Prepared
  $script:Repo = $Prepared.Repo
  $previousRelease = $env:RELAY_RELEASE
  try {
    $env:RELAY_RELEASE = $Prepared.Release
    if ((InvokeRelayStart $RunId) -ne 0) { Fail 'Owned start failed; preserve its marker and rollback record.' }
    VerifyOpsRelease $Prepared
  } finally { $env:RELAY_RELEASE = $previousRelease }
}
function SetOpsStage($Journal, [string]$Stage) { $Journal.Stage = $Stage; WriteOpsRecord $OpsJournalFile $Journal }
function AssertOpsSessionLoss($Lease, $Request) {
  if (-not $Request.AcceptSessionLoss) { Fail 'Replacement loses process-memory rooms/auth/codes. Explicit AcceptSessionLoss is required even at TCP zero.' }
  AssertOpsOwned $Lease $false
  if ($Lease.Phase -in @('prepared', 'compose') -and -not $Lease.Process -and -not $Lease.SessionId -and
      -not (FunnelState (FunnelStatus) $Lease.Node).HasEndpoint) {
    AssertRelayCompose $Lease
    if (-not (Compose $Lease 'ps -a -q' | Out-String).Trim()) { return } # Exact pre-launch intent, no owned container exists.
  }
  if ((GetOpsConnections $Lease) -ne 0) { Fail 'Active owned sockets observed; replacement refused.' }
}
function InvokeOpsSwap($Previous, $Candidate, $Lease, $Request) {
  CheckOpsPrepared $Previous; CheckOpsPrepared $Candidate
  AssertOpsOwned $Lease
  $journal = NewOpsRecord
  foreach ($entry in @{ Previous = $Previous; Candidate = $Candidate; Stage = 'stopping'; BeforeRunId = $Lease.RunId; AfterRunId = [Guid]::NewGuid().ToString('N'); RestoreRunId = $null }.GetEnumerator()) { $journal | Add-Member NoteProperty $entry.Key $entry.Value }
  AssertOpsSessionLoss $Lease $Request
  WriteOpsRecord $OpsJournalFile $journal # Intent survives interruption BEFORE stopping resources.
  StopOpsOwned $Lease
  SetOpsStage $journal 'starting'
  try {
    StartOpsPrepared $Candidate $journal.AfterRunId
    if ((ReadRelayLease).RunId -cne $journal.AfterRunId) { Fail 'Started lease differs from the recorded operation.' }
    SetOpsStage $journal 'applied'
  } catch {
    SetOpsStage $journal 'recovery-required'
    # No speculative cleanup/restart here. Explicit rollback revalidates identities and prepared bytes.
    Fail 'Apply/start verification failed. Resources/intent preserved; use rollback after inspecting status.'
  }
}
function ReadOpsCurrentLease($Journal) {
  if (-not [IO.File]::Exists($Marker)) { return $null }
  if (-not $Journal) { return (ReadRelayLease) }
  # Only previously persisted operation nonces may select their recorded repository.
  $raw = [IO.File]::ReadAllText($Marker) | ConvertFrom-Json
  $expected = if ($raw.RunId -ceq $Journal.BeforeRunId -or ($Journal.RestoreRunId -and $raw.RunId -ceq $Journal.RestoreRunId)) { $Journal.Previous }
    elseif ($raw.RunId -ceq $Journal.AfterRunId) { $Journal.Candidate } else { Fail 'Lease differs from the recorded operation; no adoption permitted.' }
  AssertOpsPrepared $expected
  if ($raw.Repo -cne $expected.Repo -or $raw.Release -cne $expected.Release -or $raw.ImageId -cne $expected.ImageId -or $raw.ImageTag -cne $expected.ImageTag -or $raw.Node -cne $expected.Node) { Fail 'Lease/recorded release identity mismatch.' }
  $script:Repo = $expected.Repo
  return (ReadRelayLease) # SID, process, session and schema validation remain unchanged.
}
function InvokeOpsRollback($Request) {
  $journal = ReadOpsRecord $OpsJournalFile
  if (-not $journal -or $journal.Stage -notin @('stopping', 'starting', 'applied', 'recovery-required', 'restoring', 'restored')) { Fail 'No recoverable operation record.' }
  CheckOpsPrepared $journal.Previous
  $current = ReadOpsCurrentLease $journal
  if ($journal.Stage -eq 'restored' -and $current -and $current.RunId -ceq $journal.RestoreRunId) { AssertOpsOwned $current; VerifyOpsRelease $journal.Previous; return }
  if ($current) {
    if ($current.RunId -ceq $journal.BeforeRunId -and $journal.Stage -eq 'stopping') {
      $healthy = $false
      try { AssertOpsOwned $current; VerifyOpsRelease $journal.Previous; $healthy = $true }
      catch { } # Partially stopped resources still require exact ownership + explicit loss acknowledgement.
      if ($healthy) { $journal.RestoreRunId = $current.RunId; SetOpsStage $journal 'restored'; return }
    }
    if ($journal.Stage -eq 'restoring' -and $current.RunId -ceq $journal.RestoreRunId -and $current.Phase -eq 'running') {
      # A crash after successful health but before the final journal write is idempotently completed.
      AssertOpsOwned $current
      $verificationFailure = $null
      try { VerifyOpsRelease $journal.Previous } catch { $verificationFailure = $_ }
      if (-not $verificationFailure) { SetOpsStage $journal 'restored'; return }
      if (-not $Request.AcceptSessionLoss) { throw $verificationFailure }
      [Console]::Error.WriteLine('Restoration verification failed; explicit recovery must pass ownership and idle socket checks before replacement.')
      # Only this explicit, acknowledged rollback may continue through the existing guards.
      # StartOpsPrepared must verify the fresh instance; another failure retains restoring intent.
    }
    AssertOpsSessionLoss $current $Request
    StopOpsOwned $current
  } elseif ((FunnelState (FunnelStatus) (DnsName)).HasEndpoint) { Fail 'Unowned endpoint prevents rollback.' }
  if ($journal.Stage -eq 'restored') { Fail 'Previously restored resources are now absent; no implicit restart.' }
  if (-not $journal.RestoreRunId) { $journal.RestoreRunId = [Guid]::NewGuid().ToString('N') }
  SetOpsStage $journal 'restoring' # Persist the recovery nonce BEFORE launch, including a repeated attempt.
  StartOpsPrepared $journal.Previous $journal.RestoreRunId
  if ((ReadRelayLease).RunId -cne $journal.RestoreRunId) { Fail 'Restored lease differs from its recorded nonce.' }
  SetOpsStage $journal 'restored'
}
function InvokeOpsStatus {
  $journal = ReadOpsRecord $OpsJournalFile; $lease = ReadOpsCurrentLease $journal
  if (-not $lease) {
    $state = FunnelState (FunnelStatus) (DnsName)
    return [pscustomobject]@{ owned = $false; endpointPresent = $state.HasEndpoint; pendingRecovery = [bool]($journal -and $journal.Stage -notin @('applied', 'restored')); rooms = 'unknown' }
  }
  AssertOpsOwned $lease $false
  $ready = $lease.Phase -eq 'running'
  if ($ready) { AssertOpsOwned $lease }
  $connections = if ($ready) { GetOpsConnections $lease } else { $null }
  return [pscustomobject]@{ owned = $true; phase = $lease.Phase; ready = $ready; release = $lease.Release; establishedSockets = $connections; rooms = 'unknown'; pendingRecovery = [bool]($journal -and $journal.Stage -notin @('applied', 'restored')) }
}
function InvokeRelayOps([string]$Action, $Request) {
  $lock = $null
  try {
    if (-not $Repo -or -not $Repo.StartsWith('/')) { Fail 'Set the configured release repository.' }
    $lock = EnterRelayLock
    if ($Action -eq 'status') { [Console]::WriteLine((InvokeOpsStatus | ConvertTo-Json -Compress)); return 0 }
    if ($Action -eq 'prepare') { $prepared = InvokeOpsPrepare $Request; [Console]::WriteLine('Prepared ' + $prepared.Release + '; live resources unchanged.'); return 0 }
    $journal = ReadOpsRecord $OpsJournalFile
    if ($Action -eq 'rollback') { InvokeOpsRollback $Request; [Console]::WriteLine('Previous owned release restored; old rooms/auth were not restored.'); return 0 }
    $lease = ReadOpsCurrentLease $journal
    $record = ReadOpsRecord $OpsPreparedFile
    if ($journal -and $journal.Stage -notin @('applied', 'restored')) { Fail 'Pending recovery blocks new operations; use status/rollback.' }
    if ($Action -eq 'start' -and -not $lease) {
      if (-not $record -or $record.Prepared.Repo -cne $Repo) { Fail 'Prepare this exact checkout before start.' }
      StartOpsPrepared $record.Prepared; return 0
    }
    if (-not $lease) { Fail 'No current lease; unmanaged resources are not adopted.' }
    AssertOpsOwned $lease
    $current = GetOpsSnapshot $lease
    if ($Action -in @('preflight', 'verify', 'start')) { VerifyOpsRelease $current; [Console]::WriteLine('Verified ' + $current.Release + '; existing process/session preserved.'); return 0 }
    if ($Action -eq 'restart') { InvokeOpsSwap $current $current $lease $Request; return 0 }
    if ($Action -eq 'apply') {
      if (-not $record) { Fail 'Prepare the candidate before apply.' }
      if ($record.Prepared.Release -ceq $current.Release -and $record.Prepared.Source -ceq $current.Source -and $record.Prepared.Artifact.hash -ceq $current.Artifact.hash) { CheckOpsPrepared $record.Prepared; VerifyOpsRelease $current; [Console]::WriteLine('Same release already running; nothing replaced.'); return 0 }
      InvokeOpsSwap $current $record.Prepared $lease $Request; return 0
    }
    Fail 'Unsupported lifecycle action.'
  } catch { [Console]::Error.WriteLine('Relay lifecycle refused or incomplete. Preserve private state; inspect status and the runbook.'); return 2 }
  finally { if ($lock) { $lock.Dispose() } }
}
