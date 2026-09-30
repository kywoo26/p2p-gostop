# FR-RP-07 / NF-RP-06 / RP-03B. Every OS/service adapter below is mocked.
# All hostnames, paths, SIDs, PIDs, image/container IDs and sessions are synthetic fixtures.
param([string]$RecoveryMarker, [string]$LockMarker)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ownership.ps1')
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'relay.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Relay script parse failed' }
foreach ($function in $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$false)) { Invoke-Expression $function.Extent.Text }
$script:Repo='/fixture/release'; $script:Tailscale='C:\Fixture\Tailscale\tailscale.exe'; $script:Target='http://127.0.0.1:17777'
$script:Release='v0.3.1'; $script:Docker="'fixture-docker'"
$script:node='fixture.example.ts.net'; $script:sid='S-1-5-21-111-222-333-1001'
$script:image='sha256:'+('a'*64); $script:tag='abcdef123456'; $script:web='/r/v0.3.1/'+('b'*64)+'/'
$script:count=0
$directory=if($RecoveryMarker){Split-Path $RecoveryMarker}elseif($LockMarker){Split-Path $LockMarker}else{Join-Path $PSScriptRoot ('relay-owner-fixture-'+[Guid]::NewGuid().ToString('N'))}
if(-not $RecoveryMarker -and -not $LockMarker){$null=New-Item -ItemType Directory $directory}
$script:Marker=if($RecoveryMarker){$RecoveryMarker}elseif($LockMarker){$LockMarker}else{Join-Path $directory '.funnel-owned'}
function GetRelayUserSid { return $script:sid }
function DnsName { $script:events.Add('node'); return $script:activeNode }
function FunnelStatus { $script:events.Add('status'); return $script:status }
function GetRelayProcessRecord { $script:events.Add('record'); return $script:record }
function OpenRelayProcess { $script:events.Add('open'); return $script:process }
function Start-Sleep { }
function EnsureSecret { $script:events.Add('secret') }
function RemoveRelayLogs { }
function Wsl([string]$Command) {
  $script:events.Add('wsl')
  if($script:fail -eq 'prerequisite' -and $Command -like 'test -f*'){throw 'synthetic prerequisite failure'}
  if($Command -like 'git describe*'){return $script:version}
  if($Command -like 'git rev-parse*'){return $script:tag}
  if($Command -like '* image inspect *'){return $script:selectedImage}
  if($Command -like '* inspect --format *'){return $script:image+'|'+$(if($script:fail -eq 'project'){'foreign-project'}else{$script:lastProject})+'|'+$script:service}
  return ''
}
function Compose($Lease,[string]$Arguments) {
  AssertRelayLease $Lease
  $script:lastProject=$Lease.Project
  $script:composeCalls.Add([pscustomobject]@{Project=$Lease.Project;Arguments=$Arguments})
  if($Arguments -eq 'ps -a -q'){if($script:projects.ContainsKey($Lease.Project)){return ('c'*64)}; return ''}
  if($Arguments -like 'up *'){
    $script:projects[$Lease.Project]=$true
    if($script:fail -eq 'up'){throw 'synthetic port collision after partial create'}
  }
  if($Arguments -eq 'down'){
    if($script:fail -eq 'down'){throw 'synthetic down failure'}
    $script:projects.Remove($Lease.Project)
  }
  return ''
}
function LocalHealth { $script:events.Add('localhealth'); if($script:fail -eq 'local'){throw 'synthetic health failure'} }
function Invoke-RestMethod {return [pscustomobject]@{current=[pscustomobject]@{release=$script:version;path=$script:web}}}
function PublicHealth { $script:events.Add('publichealth'); if($script:fail -eq 'public'){throw 'synthetic public failure'} }
function ShowRelayReady { $script:events.Add('ready') }
function NewFixtureProcess {
  $p=[pscustomobject]@{Id=4242;Handle=1;StartTime=[datetime]'2026-01-01T00:00:00Z';HasExited=$false}
  $p|Add-Member ScriptMethod Kill {$script:events.Add('kill');$this.HasExited=$true;if($script:status.Foreground){$script:status.Foreground.PSObject.Properties.Remove('owned-session')}}
  $p|Add-Member ScriptMethod WaitForExit {param($timeout) return $true}
  $p|Add-Member ScriptMethod Dispose {$script:events.Add('dispose')}
  return $p
}
function NewFixtureStatus {
  return ('{"Foreground":{"owned-session":{"TCP":{"443":{"HTTPS":true}},"Web":{"fixture.example.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:17777"}}}}}}}'|ConvertFrom-Json)
}
function StartRelayFunnel {
  $script:events.Add('launch'); $script:status=NewFixtureStatus
  return $script:process
}
function ResetFixture {
  if([IO.File]::Exists($Marker)){[IO.File]::Delete($Marker)}
  $script:events=New-Object 'Collections.Generic.List[string]'
  $script:composeCalls=New-Object 'Collections.Generic.List[object]'
  $script:projects=@{}; $script:status='{}'|ConvertFrom-Json; $script:activeNode=$script:node
  $script:fail=''; $script:version='v0.3.1'; $script:selectedImage=$script:image; $script:service='relay'
  $script:process=NewFixtureProcess
  $script:record=[pscustomobject]@{Id=4242;CreationTicks=638712864000000000;ParentId=$PID;Executable=$script:Tailscale;CommandLine='"'+$script:Tailscale+'" funnel --https=443 '+$script:Target;OwnerSid=$script:sid}
}
function NewFixtureLease {
  $lease=NewRelayLease $script:node $script:tag $script:image
  $lease.Process=[pscustomobject]@{Id=4242;ParentId=$script:record.ParentId;CreationTicks=$script:record.CreationTicks;StartTicks=$script:process.StartTime.ToUniversalTime().Ticks;CommandLine=$script:record.CommandLine}
  $lease.SessionId='owned-session'; $lease.WebPath=$script:web; $lease.Phase='running'; $lease.ComposeAttempted=$true
  return $lease
}
function SaveFixture($Lease){$lock=EnterRelayLock;try{WriteRelayLease $Lease}finally{$lock.Dispose()}}
function Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Pass { $script:count++ }
function DownCount { return @($script:composeCalls|Where-Object {$_.Arguments -eq 'down'}).Count }
function UpCount { return @($script:composeCalls|Where-Object {$_.Arguments -like 'up *'}).Count }
function RefuseStop($Lease){$refused=$false;try{StopOwnedRelayFunnel $Lease}catch{$refused=$true};Assert $refused 'Unsafe process accepted';Assert (-not $script:events.Contains('kill')) 'Foreign process killed';Pass}
try {
  if($LockMarker){
    $refused=$false
    try{$lock=EnterRelayLock; $lock.Dispose()}catch{$refused=$true}
    if(-not $refused){throw 'Concurrent host acquired an occupied lock'}
    Write-Output 'PASS: cross-host lock refusal'; exit 0
  }
  if($RecoveryMarker){
    # A genuinely new PowerShell host reconstructs only synthetic adapters from a serialized marker.
    $raw=[IO.File]::ReadAllText($Marker)
    ResetFixture
    [IO.File]::WriteAllText($Marker,$raw)
    $lease=ReadRelayLease
    $script:record.ParentId=$lease.Process.ParentId
    $script:status=NewFixtureStatus; $script:projects[$lease.Project]=$true
    Assert ((InvokeRelayAction 'stop') -eq 0) 'Fresh process stop failed'
    Assert ((DownCount) -eq 1 -and $script:composeCalls[-1].Project -eq $lease.Project) 'Fresh stop project not restored'
    Write-Output 'PASS: fresh-host marker recovery'; exit 0
  }
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus
  StopOwnedRelayFunnel $lease
  Assert ($script:events.IndexOf('node') -lt $script:events.IndexOf('open') -and $script:events.IndexOf('record') -lt $script:events.IndexOf('kill')) 'Validation happened after termination'; Pass
  foreach($suffix in @('/other',' --set-path=/other',' extra')){
    ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus; $script:record.CommandLine+=$suffix; RefuseStop $lease
  }
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus; $lease.OwnerSid='S-1-5-21-999-999-999-1001'; RefuseStop $lease
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus; $script:record.OwnerSid='S-1-5-21-999-999-999-1001'; RefuseStop $lease
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus; $script:record.CreationTicks++; RefuseStop $lease
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus; $script:process.StartTime=$script:process.StartTime.AddSeconds(1); RefuseStop $lease
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus; $script:record.ParentId++; RefuseStop $lease
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus; $script:record.Executable='C:\Other\tailscale.exe'; RefuseStop $lease
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus; $script:activeNode='other.example.ts.net'; RefuseStop $lease
  Assert (-not $script:events.Contains('open')) 'Node was checked after process lookup'
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus
  $script:status.Foreground.'owned-session'.Web.'fixture.example.ts.net:443'.Handlers.'/'.Proxy=$Target+'/other'
  RefuseStop $lease; Assert (-not $script:events.Contains('open')) 'Session was checked after process lookup'
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus
  $script:status.Foreground.'owned-session'.Web.'fixture.example.ts.net:443'.Handlers|Add-Member NoteProperty '/other' ([pscustomobject]@{Proxy=$Target})
  RefuseStop $lease

  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus; $script:record=$null; RefuseStop $lease
  ResetFixture; Assert ((InvokeRelayAction 'stop') -eq 0 -and $script:events.Count -eq 0 -and (DownCount) -eq 0) 'Marker absence changed external resources'; Pass
  foreach($markerText in @('legacy-node-only','{"Schema":2')){
    ResetFixture; [IO.File]::WriteAllText($Marker,$markerText)
    Assert ((InvokeRelayAction 'stop') -eq 2 -and $script:events.Count -eq 0 -and (DownCount) -eq 0) 'Invalid marker changed resources'; Pass
  }
  ResetFixture; $lease=NewFixtureLease; SaveFixture $lease
  $script:process=$null; $script:projects[$lease.Project]=$true
  Assert ((InvokeRelayAction 'stop') -eq 0 -and (DownCount) -eq 1 -and -not [IO.File]::Exists($Marker)) 'Gone process did not clean owned project'; Pass
  ResetFixture; $lease=NewFixtureLease; SaveFixture $lease
  $script:process=$null; $script:status=NewFixtureStatus; $script:projects[$lease.Project]=$true
  Assert ((InvokeRelayAction 'stop') -eq 3 -and -not $script:events.Contains('kill') -and [IO.File]::Exists($Marker)) 'Remaining session erased its recovery marker'; Pass
  ResetFixture; $lease=NewFixtureLease; $script:status=NewFixtureStatus
  $foreign=('{"TCP":{"8443":{"HTTPS":true}},"Web":{"other.example.ts.net:8443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:29999"}}}}}'|ConvertFrom-Json)
  $script:status.Foreground|Add-Member NoteProperty 'foreign-session' $foreign
  StopOwnedRelayFunnel $lease
  Assert ($script:status.Foreground.'foreign-session' -eq $foreign) 'Other endpoint changed'; Pass
  ResetFixture; $lease=NewFixtureLease; SaveFixture $lease; $script:status=NewFixtureStatus; $script:projects[$lease.Project]=$true
  Assert ((InvokeRelayAction 'start') -eq 0 -and (UpCount) -eq 0 -and (DownCount) -eq 0 -and -not $script:events.Contains('kill')) 'Duplicate start changed resources'; Pass
  Assert ((ReadRelayLease).RunId -eq $lease.RunId) 'Duplicate start replaced ownership'
  foreach($failure in @('image','service','project','release')){
    ResetFixture; $lease=NewFixtureLease; SaveFixture $lease; $script:status=NewFixtureStatus; $script:projects[$lease.Project]=$true
    if($failure -eq 'image'){$script:selectedImage='sha256:'+('d'*64)}
    if($failure -eq 'service'){$script:service='foreign'}
    if($failure -eq 'project'){$script:fail='project'}
    if($failure -eq 'release'){$script:version='v9.9.9'}
    Assert ((InvokeRelayAction 'start') -eq 4 -and (DownCount) -eq 0 -and (UpCount) -eq 0 -and -not $script:events.Contains('kill')) 'Rejected duplicate cleaned existing resources'; Pass
  }
  foreach($endpoint in @((NewFixtureStatus),($foreign|ConvertTo-Json -Depth 6|ConvertFrom-Json))){
    ResetFixture; $script:status=$endpoint
    Assert ((InvokeRelayAction 'start') -eq 4 -and (DownCount) -eq 0 -and (UpCount) -eq 0 -and -not [IO.File]::Exists($Marker)) 'Pre-start endpoint refusal cleaned Compose'; Pass
  }
  ResetFixture; $script:fail='prerequisite'
  Assert ((InvokeRelayAction 'start') -eq 4 -and (DownCount) -eq 0 -and (UpCount) -eq 0) 'Prerequisite failure cleaned Compose'; Pass
  foreach($failure in @('up','local','public')){
    ResetFixture; $script:fail=$failure; $script:projects['p2p-gostop-relay']=$true; $script:projects['foreign-project']=$true
    Assert ((InvokeRelayAction 'start') -eq 4 -and (DownCount) -eq 1) 'Mid-start failure did not isolate cleanup'
    Assert ($script:projects.ContainsKey('p2p-gostop-relay') -and $script:projects.ContainsKey('foreign-project')) 'External Compose project removed'
    Assert ($script:composeCalls[-1].Project -match '^p2p-gostop-relay-[a-f0-9]{32}$' -and -not [IO.File]::Exists($Marker)) 'Owned cleanup lost scope'; Pass
  }
  ResetFixture; $lease=NewFixtureLease; SaveFixture $lease; $script:status=NewFixtureStatus; $script:projects[$lease.Project]=$true; $script:fail='down'
  Assert ((InvokeRelayAction 'stop') -eq 3 -and [IO.File]::Exists($Marker)) 'Failed stop erased ownership'
  $script:fail=''; Assert ((InvokeRelayAction 'stop') -eq 0 -and -not [IO.File]::Exists($Marker)) 'Stop retry did not recover'; Pass
  foreach($phase in @('prepared','compose','launching')){
    ResetFixture; $lease=NewRelayLease $script:node $script:tag $script:image; $lease.Phase=$phase; $lease.ComposeAttempted=($phase -ne 'prepared'); SaveFixture $lease
    if($lease.ComposeAttempted){$script:projects[$lease.Project]=$true}
    Assert ((InvokeRelayAction 'stop') -eq 0 -and -not [IO.File]::Exists($Marker) -and -not $script:events.Contains('kill')) 'Crash/reboot without a process did not recover'; Pass
  }
  ResetFixture; $lease=NewRelayLease $script:node $script:tag $script:image; $lease.Phase='launching'; $lease.ComposeAttempted=$true; SaveFixture $lease
  $script:status=NewFixtureStatus; $script:projects[$lease.Project]=$true
  Assert ((InvokeRelayAction 'stop') -eq 3 -and -not $script:events.Contains('open') -and [IO.File]::Exists($Marker)) 'Incomplete launch killed unknown process'; Pass
  ResetFixture; $lease=NewFixtureLease; SaveFixture $lease; $bytes=[IO.File]::ReadAllText($Marker); $lock=EnterRelayLock
  try { Assert ((InvokeRelayAction 'start') -eq 2 -and $script:events.Count -eq 0 -and [IO.File]::ReadAllText($Marker) -ceq $bytes) 'Concurrent start changed ownership' }
  finally {$lock.Dispose()}; Pass
  ResetFixture; $lease=NewFixtureLease; SaveFixture $lease
  $other=NewRelayLease $script:node $script:tag $script:image
  $lock=EnterRelayLock
  try {
    $refused=$false;try{WriteRelayLease $other}catch{$refused=$true};Assert $refused 'Foreign marker overwritten'
    $refused=$false;try{RemoveRelayLease $other}catch{$refused=$true};Assert $refused 'Foreign marker deleted'
    $lease.Phase='compose';WriteRelayLease $lease
    Assert ((ReadRelayLease).RunId -ceq $lease.RunId -and (ReadRelayLease).Phase -eq 'compose') 'Atomic replacement corrupted JSON'
  }finally{$lock.Dispose()};Pass
  ResetFixture; $lease=NewFixtureLease; SaveFixture $lease
  $before=[IO.File]::ReadAllText($Marker); $lock=EnterRelayLock
  $reader=[IO.File]::Open($Marker,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try {
    $lease.Phase='compose'; $refused=$false
    try{WriteRelayLease $lease}catch{$refused=$true}
    Assert ($refused -and [IO.File]::ReadAllText($Marker) -ceq $before) 'Failed rename destroyed the previous marker'
  }finally{$reader.Dispose();$lock.Dispose()};Pass
  ResetFixture; $lease=NewFixtureLease; SaveFixture $lease
  # Simulate interruption after writing the adjacent temporary file, before rename.
  [IO.File]::WriteAllText($Marker+'.'+$lease.RunId+'.tmp','incomplete synthetic write')
  $script:process=$null; $script:projects[$lease.Project]=$true
  Assert ((InvokeRelayAction 'stop') -eq 0 -and -not [IO.File]::Exists($Marker+'.'+$lease.RunId+'.tmp')) 'Interrupted write lost recovery ownership';Pass
  ResetFixture; $lease=NewFixtureLease; SaveFixture $lease
  . (Join-Path $PSScriptRoot 'native.ps1')
  $hostExe=Join-Path $PSHOME $(if($PSVersionTable.PSEdition -eq 'Core'){'pwsh.exe'}else{'powershell.exe'})
  $lock=EnterRelayLock
  try {
    $before=[IO.File]::ReadAllText($Marker)
    $result=InvokeRelayNative $hostExe @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PSCommandPath,'-LockMarker',$Marker)
    Assert ($result.ExitCode -eq 0 -and $result.Stdout -match 'cross-host lock refusal' -and [IO.File]::ReadAllText($Marker) -ceq $before) 'Concurrent PowerShell host changed ownership'
  }finally{$lock.Dispose()};Pass
  ResetFixture; $lease=NewFixtureLease; SaveFixture $lease

  $hostExe=Join-Path $PSHOME $(if($PSVersionTable.PSEdition -eq 'Core'){'pwsh.exe'}else{'powershell.exe'})
  $result=InvokeRelayNative $hostExe @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PSCommandPath,'-RecoveryMarker',$Marker)
  Assert ($result.ExitCode -eq 0 -and $result.Stdout -match 'fresh-host marker recovery' -and -not [IO.File]::Exists($Marker)) 'Fresh PowerShell host did not recover marker';Pass
  # Compose -p command generation is tested without Docker/WSL: replace only the Wsl sink.
  $composeAst=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Compose'},$true)
  Invoke-Expression $composeAst.Extent.Text
  function Wsl([string]$Command){$script:command=$Command;return ''}
  foreach($operation in @('up -d --no-build','down','ps -a -q','logs --tail=30 relay')){
    $null=Compose $lease $operation
    Assert ($script:command -match ('compose -p '+[regex]::Escape($lease.Project)+' -f compose.relay.yaml '+[regex]::Escape($operation))) 'Compose project option omitted'
  };Pass
  Write-Output ("PASS: {0} ownership/failure regression cases; host {1} {2}" -f $script:count,$PSVersionTable.PSEdition,$PSVersionTable.PSVersion)
}finally{if(-not $RecoveryMarker -and -not $LockMarker){Remove-Item $directory -Recurse -Force -ErrorAction SilentlyContinue}}
