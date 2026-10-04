# RP-OPS01: synthetic fixtures only. No real Docker, Tailscale, CIM, server, or operator wrapper.
param([switch]$List, [string]$Case)
$ErrorActionPreference = 'Stop'
$cases = @(
  'same-version start preserves process/session', 'same-version apply preserves process/session', 'status TCP zero keeps rooms unknown',
  'preflight changed image refuses before mutation', 'restart needs explicit session-loss boundary',
  'restart active sockets refuses', 'restart unknown socket count refuses',
  'concurrent invocation cannot mutate records', 'legacy marker is never adopted',
  'prepare cannot use current live repository', 'changed candidate refuses before stop',
  'apply persists intent then starts exact candidate', 'new start requires preparation',
  'prepared start is idempotent', 'failed start cleans only its nonce project',
  'stop interruption preserves journal and marker', 'rollback before stop preserves healthy original',
  'failed candidate restores previous release', 'restore nonce is persisted before launch',
  'completed rollback is idempotent', 'health-before-final-journal crash completes without restart',
  'running restore verification failure permits only explicit guarded recovery',
  'restore compose interruption reuses nonce', 'prepared partial lease has no compose cleanup',
  'restore prepared-marker interruption reuses nonce', 'restore compose-intent interruption reuses nonce',
  'unidentified launch endpoint forbids cleanup', 'unrecorded lease cannot be rolled back',
  'wrong HTTP asset refuses verify without mutation', 'ZIP SHA refusal makes no destination',
  'ZIP duplicate/traversal/symlink refused', 'ZIP entry size/count limits refused',
  'supported ZIP reader preserves all bytes', 'stale record temporary is preserved', 'entry preserves request through library import', 'legacy migration runbook restores original wrapper'
)
if ($Case) {
  if ($Case -cnotin $cases) { throw 'Unknown lifecycle fixture case' }
  $cases = @($cases | Where-Object { $_ -ceq $Case })
}
if ($List) { $cases | ForEach-Object { Write-Output $_ }; Write-Output ('TOTAL ' + $cases.Count); exit 0 }
. (Join-Path $PSScriptRoot 'ownership.ps1')
foreach ($file in @('relay.ps1', 'lifecycle.ps1', 'ops.ps1')) {
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file), [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw ('Parse failure: ' + $file + ' at ' + $errors[0].Extent.StartLineNumber) }
  foreach ($function in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) { Invoke-Expression $function.Extent.Text }
}
function Fail([string]$Message) { throw $Message }
function Assert([bool]$Value, [string]$Message) { if (-not $Value) { throw $Message } }
function Refuse([scriptblock]$Action) { $caught = $false; try { & $Action | Out-Null } catch { $caught = $true }; Assert $caught 'Expected refusal' }
function InvokeRelayNative { throw 'REAL_NATIVE_ADAPTER_FORBIDDEN' }
function GetRelayUserSid { return 'S-1-5-21-111-222-333-1001' }
$fixtureNode = @('fixture', 'example', 'ts', 'net') -join '.'
function DnsName { return $fixtureNode }
function NewFixtureFingerprint { return [string]::new([char]56,64) }
function Start-Sleep { }
function ResolveRelayDocker { $script:Docker = "'fixture-docker'" }
function GetOpsSecretFingerprint { return ('e' * 64) }
function GetSource { return $(if ($Repo -eq '/fixture/b') { 'b' * 40 } else { 'a' * 40 }) }
function FixtureArtifact {
  return [pscustomobject]@{ source = GetSource; hash = 'f' * 64; wireVersion = 4; assetSetVersion = 2; initial = @('_app/main.js'); files = @([pscustomobject]@{path='index.html';sha256='1'*64;size=5}, [pscustomobject]@{path='_app/main.js';sha256='2'*64;size=3}) }
}
function InvokeOpsArtifact { return (FixtureArtifact) }
function GetOpsImageFiles { return @((FixtureArtifact).files) }
function RelayImageId([string]$Tag) { if ($script:fail -eq 'image') { return ('sha256:' + 'c' * 64) }; return ('sha256:' + (GetSource).PadRight(64, '0')) }
function Wsl([string]$Command) {
  if ($Command -eq 'test -f compose.relay.yaml && test -d packages/web/dist') { return '' }
  if ($Command -eq 'git rev-parse --short=12 HEAD') { return (GetSource).Substring(0,12) }
  if ($Command -eq 'git rev-parse HEAD' -or $Command -like 'git rev-parse *') { return (GetSource) }
  if ($Command -eq 'git status --porcelain --untracked-files=all') { return '' }
  if ($Command -eq 'cat .nvmrc') { return '24.21.0' }
  if ($Command -like 'sha256sum compose*') { return ('d' * 64) }
  if ($Command -like '* inspect --format *') { $lease=$script:projects[$script:lastProject]; return $lease.ImageId+'|'+$lease.Project+'|relay' }
  if ($Command -like '* exec *') { return $script:connections }
  if ($Command -like 'git describe*') { return $(if ($Repo -eq '/fixture/b') { 'v0.5.2' } else { 'v0.5.1' }) }
  throw 'UNEXPECTED_WSL_ADAPTER'
}
function Compose($Lease, [string]$Arguments) {
  AssertRelayLease $Lease; $script:lastProject = $Lease.Project
  $script:events.Add('compose:' + $Arguments)
  if ($Arguments -eq 'ps -q' -or $Arguments -eq 'ps -a -q') { if ($script:projects.ContainsKey($Lease.Project)) { return ('c' * 64) }; return '' }
  if ($Arguments -like 'up *') {
    $script:projects[$Lease.Project] = $Lease
    if ($script:fail -eq 'up') { throw 'synthetic partial up failure' }
  } elseif ($Arguments -eq 'down') {
    if ($script:fail -eq 'down') { throw 'synthetic down failure' }
    $script:projects.Remove($Lease.Project)
  } else { throw 'UNEXPECTED_COMPOSE_ADAPTER' }
  return ''
}
function FunnelStatus { return $script:status }
function GetRelayProcessRecord([int]$ProcessId) {
  if ($script:process -and $script:process.Id -eq $ProcessId -and -not $script:process.HasExited) { return $script:record }
  return $null
}
function OpenRelayProcess([int]$ProcessId) {
  if ($script:process -and $script:process.Id -eq $ProcessId -and -not $script:process.HasExited) { return $script:process }
  return $null
}
function FixtureProcess {
  $script:nextPid++
  $p = [pscustomobject]@{ Id=$script:nextPid;Handle=1;StartTime=[datetime]'2026-10-03T00:00:00Z';HasExited=$false }
  $p | Add-Member ScriptMethod Dispose { }
  $p | Add-Member ScriptMethod Kill { $script:events.Add('kill');$this.HasExited=$true;$script:status='{}'|ConvertFrom-Json }
  $p | Add-Member ScriptMethod WaitForExit { return $true }
  $script:record=[pscustomobject]@{Id=$p.Id;ParentId=$PID;CreationTicks=638712864000000000;Executable=$Tailscale;CommandLine='"'+$Tailscale+'" funnel --https=443 '+$Target;OwnerSid=GetRelayUserSid}
  return $p
}
function StartRelayFunnel {
  $script:events.Add('launch')
  $script:process=FixtureProcess
  $script:status = @{
    Foreground = @{ owned = @{
      TCP = @{ '443' = @{ HTTPS = $true } }
      Web = @{ ($fixtureNode + ':443') = @{ Handlers = @{ '/' = @{ Proxy = $Target } } } }
    } }
  } | ConvertTo-Json -Depth 10 | ConvertFrom-Json
  return $script:process
}
function RemoveRelayLogs { }
function ShowRelayReady { $script:events.Add('ready') }
function LocalHealth { }
function PublicHealth { }
function Invoke-RestMethod { return [pscustomobject]@{current=[pscustomobject]@{release=$(if($Repo -eq '/fixture/b'){'v0.5.2'}else{'v0.5.1'});path='/r/'+$(if($Repo -eq '/fixture/b'){'v0.5.2'}else{'v0.5.1'})+'/'+('f'*64)+'/'}} }
function GetOpsJson([string]$Url) {
  if ($script:fail -eq 'health') { throw 'synthetic health failure' }
  $release=if($Repo -eq '/fixture/b'){'v0.5.2'}else{'v0.5.1'}
  return [pscustomobject]@{ready=$true;relay='p2p-gostop';wireVersion=4;current=[pscustomobject]@{release=$release;hash='f'*64;wireVersion=4;path='/r/'+$release+'/'+('f'*64)+'/'}}
}
function GetOpsHttpDigest([string]$Url) { return [pscustomobject]@{Status=200;Type=$(if($Url.EndsWith('.js')){'text/javascript'}else{'text/html'});SHA=$(if($script:fail -eq 'asset' -or ($script:fail -eq 'asset-for-process' -and $script:process.Id -eq $script:badAssetPid)){'9'*64}elseif($Url.EndsWith('.js')){'2'*64}else{'1'*64})} }
$realWrite = ${function:WriteOpsRecord}
function WriteOpsRecord([string]$Path, $Record) {
  $script:events.Add('journal:' + $Record.Stage)
  if ($script:fail -eq 'final-write' -and $Record.Stage -eq 'restored') { throw 'synthetic crash after health before final journal' }
  & $script:realWrite $Path $Record
}
function Prepared([string]$Path) {
  $saved=$Repo;$script:Repo=$Path
  try { return [pscustomobject]@{Repo=$Path;Release=$(if($Path -eq '/fixture/b'){'v0.5.2'}else{'v0.5.1'});Source=GetSource;ImageTag=(GetSource).Substring(0,12);ImageId=RelayImageId '';Node=DnsName;Secret=GetOpsSecretFingerprint;Compose='d'*64;Artifact=FixtureArtifact} }
  finally { $script:Repo=$saved }
}
function Request([bool]$Loss=$false) { return [pscustomobject]@{AcceptSessionLoss=$Loss;CandidateRepo='/fixture/b';Release='v0.5.2';Source='b'*40;BuildImage=$false} }
$root=Join-Path $env:TEMP ('relay-lifecycle-fixture-'+[Guid]::NewGuid().ToString('N'))
$null=[IO.Directory]::CreateDirectory($root)
$script:Marker=Join-Path $root '.funnel-owned';$script:OpsIdentity='fixture-wrapper'
$script:OpsStateDirectory=Join-Path $root 'state';$script:OpsPreparedFile=Join-Path $OpsStateDirectory 'prepared.json';$script:OpsJournalFile=Join-Path $OpsStateDirectory 'rollback.json'
$script:Tailscale='C:\Fixture\Tailscale\tailscale.exe';$script:Target='http://127.0.0.1:17777';$script:nextPid=5000
$script:Library=$true
function Reset {
  if([IO.File]::Exists($Marker)){[IO.File]::Delete($Marker)}
  if([IO.Directory]::Exists($OpsStateDirectory)){[IO.Directory]::Delete($OpsStateDirectory,$true)}
  $script:Repo='/fixture/a';$script:events=New-Object 'Collections.Generic.List[string]'
  $script:projects=@{};$script:status='{}'|ConvertFrom-Json;$script:process=$null;$script:fail='';$script:connections='0';$script:badAssetPid=0
  $env:RELAY_RELEASE='v0.5.1'
}
function Running {
  $script:Release='v0.5.1';$lease=NewRelayLease (DnsName) ('a'*12) (RelayImageId '') ('1'*32)
  $script:process=StartRelayFunnel $lease;CaptureRelayProcess $script:process $lease
  $lease.SessionId='owned';$lease.WebPath='/r/v0.5.1/'+('f'*64)+'/';$lease.Phase='running';$lease.ComposeAttempted=$true
  $script:projects[$lease.Project]=$lease;WriteRelayLease $lease
  return $lease
}
function SavePrepared($Prepared) { $record=NewOpsRecord;$record|Add-Member NoteProperty Prepared $Prepared;WriteOpsRecord $OpsPreparedFile $record }
function MutationCount { return @($script:events|Where-Object {$_ -eq 'kill' -or $_ -like 'compose:up*' -or $_ -eq 'compose:down'}).Count }
function Journal([string]$Stage, $Lease) {
  $j=NewOpsRecord
  foreach($e in @{Previous=(Prepared '/fixture/a');Candidate=(Prepared '/fixture/b');Stage=$Stage;BeforeRunId=$Lease.RunId;AfterRunId='2'*32;RestoreRunId=$null}.GetEnumerator()){$j|Add-Member NoteProperty $e.Key $e.Value}
  WriteOpsRecord $OpsJournalFile $j;return $j
}
function MakeZip([string]$Path, $Entries) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $z=[IO.Compression.ZipFile]::Open($Path,[IO.Compression.ZipArchiveMode]::Create)
  try { foreach($entry in $Entries){$e=$z.CreateEntry($entry.Name);if($entry.Mode){$e.ExternalAttributes=$entry.Mode};$stream=$e.Open();try{$b=[Text.Encoding]::UTF8.GetBytes($entry.Body);$stream.Write($b,0,$b.Length)}finally{$stream.Dispose()}} }
  finally{$z.Dispose()}
}
try {
  foreach($name in $cases) {
    Reset
    switch ($name) {
      'same-version start preserves process/session' {$lease=Running;$before=[IO.File]::ReadAllText($Marker);Assert ((InvokeRelayOps 'start' (Request)) -eq 0) 'start failed';Assert ([IO.File]::ReadAllText($Marker) -ceq $before -and (MutationCount) -eq 0) 'start replaced resources'}
      'same-version apply preserves process/session' {$null=Running;SavePrepared (Prepared '/fixture/a');$before=[IO.File]::ReadAllText($Marker);Assert ((InvokeRelayOps 'apply' (Request)) -eq 0 -and [IO.File]::ReadAllText($Marker) -ceq $before -and (MutationCount) -eq 0) 'same apply replaced resources'}
      'status TCP zero keeps rooms unknown' {$null=Running;$s=InvokeOpsStatus;Assert ($s.establishedSockets -eq 0 -and $s.rooms -eq 'unknown' -and (MutationCount) -eq 0) 'status inferred rooms'}
      'preflight changed image refuses before mutation' {$null=Running;$script:fail='image';Assert ((InvokeRelayOps 'preflight' (Request)) -eq 2 -and (MutationCount) -eq 0) 'changed image accepted'}
      'restart needs explicit session-loss boundary' {$null=Running;Assert ((InvokeRelayOps 'restart' (Request)) -eq 2 -and (MutationCount) -eq 0) 'missing loss acknowledgement changed resources'}
      'restart active sockets refuses' {$null=Running;$script:connections='1';Assert ((InvokeRelayOps 'restart' (Request $true)) -eq 2 -and (MutationCount) -eq 0) 'active socket replaced'}
      'restart unknown socket count refuses' {$null=Running;$script:connections='unknown';Assert ((InvokeRelayOps 'restart' (Request $true)) -eq 2 -and (MutationCount) -eq 0) 'unknown socket boundary accepted'}
      'concurrent invocation cannot mutate records' {$null=Running;$lock=EnterRelayLock;try{Assert ((InvokeRelayOps 'restart' (Request $true)) -eq 2 -and (MutationCount) -eq 0) 'concurrent operation changed resources'}finally{$lock.Dispose()}}
      'legacy marker is never adopted' {[IO.File]::WriteAllText($Marker,$fixtureNode);Assert ((InvokeRelayOps 'start' (Request)) -eq 2 -and (MutationCount) -eq 0) 'legacy adopted';Assert ([IO.File]::ReadAllText($Marker) -eq $fixtureNode) 'legacy deleted'}
      'prepare cannot use current live repository' {$null=Running;$q=Request;$q.CandidateRepo='/fixture/a';Refuse {InvokeOpsPrepare $q};Assert ((MutationCount) -eq 0) 'prepare stopped resources'}
      'changed candidate refuses before stop' {
        $null=Running;$candidate=Prepared '/fixture/b';$candidate.Secret=NewFixtureFingerprint;SavePrepared $candidate;Assert ((InvokeRelayOps 'apply' (Request $true)) -eq 2 -and (MutationCount) -eq 0) 'stale secret replaced resources'
        $candidate=Prepared '/fixture/b';$candidate.Artifact.files[0].sha256='0'*64;SavePrepared $candidate;Assert ((InvokeRelayOps 'apply' (Request $true)) -eq 2 -and (MutationCount) -eq 0) 'stale manifest replaced resources'
      }
      'apply persists intent then starts exact candidate' {$null=Running;SavePrepared (Prepared '/fixture/b');Assert ((InvokeRelayOps 'apply' (Request $true)) -eq 0) 'apply failed';$j=ReadOpsRecord $OpsJournalFile;Assert ($j.Stage -eq 'applied' -and (ReadRelayLease).RunId -ceq $j.AfterRunId) 'candidate nonce differs';Assert ($events.IndexOf('journal:stopping') -lt $events.IndexOf('kill')) 'intent written after stop'}
      'new start requires preparation' {Assert ((InvokeRelayOps 'start' (Request)) -eq 2 -and (MutationCount) -eq 0) 'unprepared start accepted'}
      'prepared start is idempotent' {SavePrepared (Prepared '/fixture/a');Assert ((InvokeRelayOps 'start' (Request)) -eq 0) 'new start failed';$n=MutationCount;Assert ((InvokeRelayOps 'start' (Request)) -eq 0 -and (MutationCount) -eq $n) 'second start mutated resources'}
      'failed start cleans only its nonce project' {SavePrepared (Prepared '/fixture/a');$projects['foreign']=$true;$script:fail='up';Assert ((InvokeRelayOps 'start' (Request)) -eq 2 -and $projects.ContainsKey('foreign') -and -not [IO.File]::Exists($Marker)) 'cleanup lost scope'}
      'stop interruption preserves journal and marker' {$null=Running;SavePrepared (Prepared '/fixture/b');$script:fail='down';Assert ((InvokeRelayOps 'apply' (Request $true)) -eq 2) 'interruption hidden';Assert ((ReadOpsRecord $OpsJournalFile).Stage -eq 'stopping' -and [IO.File]::Exists($Marker)) 'intent erased'}
      'rollback before stop preserves healthy original' {$lease=Running;$null=Journal 'stopping' $lease;Assert ((InvokeRelayOps 'rollback' (Request)) -eq 0 -and (MutationCount) -eq 0) 'healthy original replaced'}
      'failed candidate restores previous release' {$null=Running;SavePrepared (Prepared '/fixture/b');$script:fail='up';Assert ((InvokeRelayOps 'apply' (Request $true)) -eq 2) 'failed candidate passed';$script:fail='';Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 0 -and (ReadRelayLease).Release -eq 'v0.5.1') 'previous not restored'}
      'restore nonce is persisted before launch' {$lease=Running;$j=Journal 'starting' $lease;StopOpsOwned $lease;Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 0) 'restore failed';$j=ReadOpsRecord $OpsJournalFile;Assert ($j.RestoreRunId -ceq (ReadRelayLease).RunId -and $events.IndexOf('journal:restoring') -lt $events.LastIndexOf('launch')) 'restore intent late'}
      'completed rollback is idempotent' {$lease=Running;$null=Journal 'starting' $lease;StopOpsOwned $lease;Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 0) 'restore failed';$n=MutationCount;Assert ((InvokeRelayOps 'rollback' (Request)) -eq 0 -and (MutationCount) -eq $n) 'repeat restore changed resources'}
      'health-before-final-journal crash completes without restart' {$lease=Running;$null=Journal 'starting' $lease;StopOpsOwned $lease;$script:fail='final-write';Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 2) 'final write failure hidden';$j=ReadOpsRecord $OpsJournalFile;Assert ($j.Stage -eq 'restoring' -and (ReadRelayLease).RunId -ceq $j.RestoreRunId) 'recovery identity lost';$n=MutationCount;$script:fail='';Assert ((InvokeRelayOps 'rollback' (Request)) -eq 0 -and (MutationCount) -eq $n) 'healthy restore restarted'}
      'running restore verification failure permits only explicit guarded recovery' {
        $lease=Running;$null=Journal 'starting' $lease;StopOpsOwned $lease
        $script:fail='asset'
        Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 2) 'initial asset failure was hidden'
        $j=ReadOpsRecord $OpsJournalFile;$partial=ReadRelayLease;$oldProcess=$script:process
        Assert ($j.Stage -eq 'restoring' -and $partial.Phase -eq 'running' -and $partial.RunId -ceq $j.RestoreRunId) 'running restoration identity not retained'
        # Only this failed instance serves bad bytes; a fresh synthetic instance is healthy.
        $script:badAssetPid=$oldProcess.Id;$script:fail='asset-for-process';$n=MutationCount
        Assert ((InvokeRelayOps 'rollback' (Request)) -eq 2 -and (MutationCount) -eq $n) 'unacknowledged recovery mutated resources'
        $script:connections='1'
        Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 2 -and (MutationCount) -eq $n) 'active sockets permitted replacement'
        $script:connections='unknown'
        Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 2 -and (MutationCount) -eq $n) 'unknown socket boundary permitted replacement'
        $script:connections='0';$record.ParentId++
        Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 2 -and (MutationCount) -eq $n) 'changed process identity permitted replacement'
        $record.ParentId--
        Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 0) 'explicit owned recovery remained stuck at failed verification'
        Assert ($oldProcess.HasExited -and $script:process.Id -ne $oldProcess.Id -and (ReadRelayLease).RunId -ceq $j.RestoreRunId -and (ReadOpsRecord $OpsJournalFile).Stage -eq 'restored') 'fresh verified restoration not recorded'
        # Successful verification followed by an incomplete final journal remains non-destructive.
        $complete=ReadOpsRecord $OpsJournalFile;SetOpsStage $complete 'restoring';$n=MutationCount
        Assert ((InvokeRelayOps 'rollback' (Request)) -eq 0 -and (MutationCount) -eq $n) 'healthy restoration was restarted'
        # A persistent asset fault must still fail after exactly one explicit replacement.
        $complete=ReadOpsRecord $OpsJournalFile;SetOpsStage $complete 'restoring';$script:fail='asset'
        $launches=@($events|Where-Object{$_ -eq 'launch'}).Count
        Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 2) 'persistent verification failure became green'
        Assert (@($events|Where-Object{$_ -eq 'launch'}).Count -eq ($launches+1) -and (ReadOpsRecord $OpsJournalFile).Stage -eq 'restoring' -and (ReadRelayLease).RunId -ceq $j.RestoreRunId) 'persistent failure retried or lost recovery intent'
      }
      'restore compose interruption reuses nonce' {$lease=Running;$null=Journal 'starting' $lease;StopOpsOwned $lease;$script:fail='up';Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 2) 'restore interruption hidden';$id=(ReadOpsRecord $OpsJournalFile).RestoreRunId;$script:fail='';Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 0 -and (ReadRelayLease).RunId -ceq $id) 'restore nonce replaced'}
      'prepared partial lease has no compose cleanup' {$script:Release='v0.5.1';$lease=NewRelayLease (DnsName) ('a'*12) (RelayImageId '') ('1'*32);WriteRelayLease $lease;StopOpsOwned $lease;Assert ((MutationCount) -eq 0 -and -not [IO.File]::Exists($Marker)) 'prepared cleanup touched services'}
      'restore prepared-marker interruption reuses nonce' {
        $lease=Running;$j=Journal 'starting' $lease;StopOpsOwned $lease;$j.RestoreRunId='4'*32;SetOpsStage $j 'restoring'
        $script:Release='v0.5.1';$partial=NewRelayLease (DnsName) ('a'*12) (RelayImageId '') $j.RestoreRunId;WriteRelayLease $partial
        $before=@($events|Where-Object{$_ -eq 'compose:down'}).Count
        Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 0 -and (ReadRelayLease).RunId -ceq $j.RestoreRunId -and @($events|Where-Object{$_ -eq 'compose:down'}).Count -eq $before) 'prepared recovery used unrelated cleanup'
      }
      'restore compose-intent interruption reuses nonce' {
        $lease=Running;$j=Journal 'starting' $lease;StopOpsOwned $lease;$j.RestoreRunId='4'*32;SetOpsStage $j 'restoring'
        $script:Release='v0.5.1';$partial=NewRelayLease (DnsName) ('a'*12) (RelayImageId '') $j.RestoreRunId;$partial.Phase='compose';$partial.ComposeAttempted=$true;WriteRelayLease $partial
        Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 0 -and (ReadRelayLease).RunId -ceq $j.RestoreRunId) 'compose intent recovery lost nonce'
      }
      'unidentified launch endpoint forbids cleanup' {$script:Release='v0.5.1';$lease=NewRelayLease (DnsName) ('a'*12) (RelayImageId '') ('1'*32);$lease.Phase='launching';$lease.ComposeAttempted=$true;WriteRelayLease $lease;$projects[$lease.Project]=$lease;$null=StartRelayFunnel $lease;Refuse {StopOpsOwned $lease};Assert ((MutationCount) -eq 0 -and [IO.File]::Exists($Marker)) 'unknown launch cleaned'}
      'unrecorded lease cannot be rolled back' {$lease=Running;$null=Journal 'applied' $lease;RemoveRelayLease $lease;$lease.RunId='3'*32;$lease.Project='p2p-gostop-relay-'+$lease.RunId;WriteRelayLease $lease;Assert ((InvokeRelayOps 'rollback' (Request $true)) -eq 2 -and (MutationCount) -eq 0) 'foreign operation adopted'}
      'wrong HTTP asset refuses verify without mutation' {$null=Running;$script:fail='asset';Assert ((InvokeRelayOps 'verify' (Request)) -eq 2 -and (MutationCount) -eq 0) 'bad bytes accepted'}
      'ZIP SHA refusal makes no destination' {$z=Join-Path $root 'sha.zip';MakeZip $z @(@{Name='index.html';Body='bytes'});$dest=Join-Path $root 'wrong-sha';Refuse {ExpandOpsArchive $z ('0'*64) $dest};Assert (-not [IO.Directory]::Exists($dest)) 'wrong archive wrote files'}
      'ZIP duplicate/traversal/symlink refused' {foreach($entries in @(@(@{Name='../outside.js';Body='a'}),@(@{Name='a.js';Body='a'},@{Name='A.js';Body='b'}),@(@{Name='link.js';Body='x';Mode=-1577123840}))){$z=Join-Path $root ([Guid]::NewGuid().ToString('N')+'.zip');MakeZip $z $entries;$dest=Join-Path $root ([Guid]::NewGuid().ToString('N'));Refuse {ExpandOpsArchive $z ((Get-FileHash $z).Hash.ToLowerInvariant()) $dest};Assert (-not [IO.Directory]::Exists($dest)) 'unsafe archive wrote files'}}
      'ZIP entry size/count limits refused' {
        $z=Join-Path $root 'many.zip';$entries=1..4097|ForEach-Object {@{Name=('f'+$_+'.js');Body=''}};MakeZip $z $entries;$dest=Join-Path $root 'many';Refuse {ExpandOpsArchive $z ((Get-FileHash $z).Hash.ToLowerInvariant()) $dest};Assert (-not [IO.Directory]::Exists($dest)) 'entry limit wrote files'
        $z=Join-Path $root 'large.zip';MakeZip $z @(@{Name='large.js';Body=('x'*67108865)});$dest=Join-Path $root 'large';Refuse {ExpandOpsArchive $z ((Get-FileHash $z).Hash.ToLowerInvariant()) $dest};Assert (-not [IO.Directory]::Exists($dest)) 'size limit wrote files'
      }
      'supported ZIP reader preserves all bytes' {$z=Join-Path $root 'valid.zip';MakeZip $z @(@{Name='index.html';Body='hello'},@{Name='_app/main.js';Body='export{}'});$dest=Join-Path $root 'valid';ExpandOpsArchive $z ((Get-FileHash $z).Hash.ToLowerInvariant()) $dest;Assert ([IO.File]::ReadAllText((Join-Path $dest '_app/main.js')) -ceq 'export{}' -and [IO.File]::ReadAllText((Join-Path $dest 'index.html')) -ceq 'hello') 'ZIP bytes changed'}
      'stale record temporary is preserved' {$null=[IO.Directory]::CreateDirectory($OpsStateDirectory);$temporary=$OpsPreparedFile+'.tmp';[IO.File]::WriteAllText($temporary,'preserve');Refuse {SavePrepared (Prepared '/fixture/a')};Assert ([IO.File]::ReadAllText($temporary) -ceq 'preserve') 'stale temporary removed'}
      'entry preserves request through library import' {
        # Execute the exact entry/library in a private folder. Only the dispatcher is replaced;
        # it cannot call a native/service adapter. Never execute the operating wrapper.
        $entry=Join-Path $root 'entry';$null=[IO.Directory]::CreateDirectory($entry)
        foreach($file in @('ops.ps1','relay.ps1','native.ps1','ownership.ps1')){[IO.File]::WriteAllBytes((Join-Path $entry $file),[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $file)))}
        [IO.File]::WriteAllText((Join-Path $entry 'lifecycle.ps1'), @'
function InvokeRelayOps([string]$Action,$Request) {
  if($Action -cne 'prepare' -or $Request.Release -cne 'v0.5.2' -or $Request.Source -cne ('b'*40) -or -not $Library){throw 'Entry request shadowed'}
  [Console]::WriteLine('entry fixture verified');return 0
}
'@)
        $hostExe=Join-Path $PSHOME $(if($PSVersionTable.PSEdition -eq 'Core'){'pwsh.exe'}else{'powershell.exe'})
        $output=& $hostExe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $entry 'ops.ps1') -Action prepare -Release v0.5.2 -Source ('b'*40)
        Assert ($LASTEXITCODE -eq 0 -and ($output -join '') -ceq 'entry fixture verified') 'entry dispatcher failed'
      }
      'legacy migration runbook restores original wrapper' {
        # Runbook model only: original-wrapper adapters deliberately cannot invoke any real script.
        $migration=New-Object 'Collections.Generic.List[string]'
        [IO.File]::WriteAllText($Marker,'legacy-marker')
        Assert ((InvokeRelayOps 'start' (Request)) -eq 2 -and [IO.File]::Exists($Marker)) 'new wrapper adopted legacy'
        $migration.Add('original-stop');[IO.File]::Delete($Marker) # Only the original wrapper removes its marker.
        SavePrepared (Prepared '/fixture/a');$script:fail='up';$migration.Add('new-start');$code=InvokeRelayOps 'start' (Request)
        if($code -ne 0 -and -not [IO.File]::Exists($Marker)){$migration.Add('original-start');[IO.File]::WriteAllText($Marker,'legacy-marker')}
        Assert (($migration -join ',') -ceq 'original-stop,new-start,original-start' -and [IO.File]::ReadAllText($Marker) -ceq 'legacy-marker') 'migration did not restore original owner'
      }
      default { throw 'Missing test case implementation' }
    }
    Write-Output ('PASS ' + $name)
  }
  Write-Output ('PASS total ' + $cases.Count + '; native service adapters forbidden')
} finally { [IO.Directory]::Delete($root,$true) }
