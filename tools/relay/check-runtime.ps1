# FR-RP-07 / RP-03B: selector regression only. No relay, CIM, Docker or Tailscale calls.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'native.ps1')
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'select-runtime.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Runtime selector parse failed' }
foreach ($function in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) { Invoke-Expression $function.Extent.Text }
$realTest = ${function:TestRelayRuntimeFile}; $realMetadata = ${function:GetRelayRuntimeMetadata}; $realNative = ${function:InvokeRelayNative}
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
$script:files = @{}; $script:calls = 0
function TestRelayRuntimeFile([string]$Path) { return $script:files.ContainsKey($Path) }
function GetRelayRuntimeMetadata([string]$Path) { return $script:files[$Path] }
function InvokeRelayNative { $script:calls++; return [pscustomobject]@{ExitCode=$script:code; Stdout=$script:identity; Stderr=''} }
function Reset {
  $script:files = @{}; $script:calls = 0; $script:code = 0; $script:identity = 'Core|7'
  $script:files['C:\OS\WindowsPowerShell\v1.0\powershell.exe'] = $null
}
function Refuse([scriptblock]$Action) { $failed=$false; try { & $Action | Out-Null } catch { $failed=$true }; Assert $failed 'Invalid runtime accepted' }
$valid = [pscustomobject]@{ProductName='PowerShell'; ProductMajorPart=7; CompanyName='Microsoft Corporation'}
Reset
$script:files['C:\FixtureA\pwsh.exe']=$valid; $script:files['C:\FixtureB\PowerShell\7\pwsh.exe']=$valid
Assert ((ResolveRelayRuntime 'C:\FixtureA' 'C:\FixtureB' 'C:\OS') -eq 'C:\FixtureA\pwsh.exe') 'PATH runtime not preferred'
Reset
$script:files['C:\FixtureB\PowerShell\7\pwsh.exe']=$valid
Assert ((ResolveRelayRuntime 'C:\Empty' 'C:\FixtureB' 'C:\OS') -eq 'C:\FixtureB\PowerShell\7\pwsh.exe') 'Default install not selected'
Reset
Assert ((ResolveRelayRuntime '' 'C:\Empty' 'C:\OS') -match 'powershell.exe$') 'Missing 7 fallback failed'
Assert ($script:calls -eq 0) 'Fallback ran a candidate'
Assert (@(RelayRuntimeCandidates ';.;relative;C:relative;\relative' '').Count -eq 0) 'Current/relative directory searched'
Reset
$script:files['C:\FixtureA\pwsh.exe']=[pscustomobject]@{ProductName='Other';ProductMajorPart=7;CompanyName='Microsoft'}
Refuse { ResolveRelayRuntime 'C:\FixtureA' '' 'C:\OS' }
Assert ($script:calls -eq 0) 'Invalid product was executed'
Reset
$script:files['C:\FixtureA\pwsh.exe']=$valid; $script:identity='Desktop|5'
Refuse { ResolveRelayRuntime 'C:\FixtureA' '' 'C:\OS' }
Assert ($script:calls -eq 1) 'Identity failure retried fallback'
Reset
$script:files['C:\FixtureA\pwsh.exe']=$valid; $script:code=42
Refuse { ResolveRelayRuntime 'C:\FixtureA' '' 'C:\OS' }
Assert ($script:calls -eq 1) 'Execution failure retried fallback'
# Real selector, current-directory decoy: execute only the trusted installed PowerShell identity probe.
${function:TestRelayRuntimeFile}=$realTest; ${function:GetRelayRuntimeMetadata}=$realMetadata; ${function:InvokeRelayNative}=$realNative
$directory = Join-Path $env:TEMP ('relay-selector-fixture-' + [Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory $directory
$location=Get-Location
try {
  $null=New-Item -ItemType File (Join-Path $directory 'pwsh.exe')
  Set-Location $directory
  $chosen=ResolveRelayRuntime $env:PATH $env:ProgramFiles (Join-Path $env:SystemRoot 'System32')
  Assert ($chosen -notlike ($directory+'*') -and $chosen -match '\\pwsh.exe$') 'Current directory decoy selected'
  $selector=Join-Path $PSScriptRoot 'runtime.cmd'
  $probe=Join-Path $directory 'probe.cmd'
  @('@echo off',('call "'+$selector+'"'),'if errorlevel 1 exit /b 2','echo %RELAY_POWERSHELL%') | Set-Content $probe -Encoding ASCII
  $r=InvokeRelayNative (Join-Path $env:SystemRoot 'System32\cmd.exe') @('/d','/c',$probe)
  Assert ($r.ExitCode -eq 0 -and $r.Stdout.Trim() -eq $chosen) 'Common cmd selector failed'
} finally { Set-Location $location; Remove-Item $directory -Recurse -Force }
Write-Output ("PASS: 9 runtime selection checks; host {0} {1}" -f $PSVersionTable.PSEdition,$PSVersionTable.PSVersion)
