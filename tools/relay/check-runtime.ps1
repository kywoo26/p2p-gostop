# FR-RP-07 / RP-03B: selection only; does not execute a relay or mock runtime.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'native.ps1')
$directory = Join-Path $env:TEMP ('relay-runtime-test-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $directory
try {
  $selector = Join-Path $PSScriptRoot 'runtime.cmd'
  $probe = Join-Path $directory 'probe.cmd'
  function SelectRuntime([string]$SearchPath, [string]$InstallRoot) {
    @('@echo off', ('set "PATH=' + $SearchPath + '"'), ('set "ProgramFiles=' + $InstallRoot + '"'), ('call "' + $selector + '"'), 'echo %RELAY_POWERSHELL%') | Set-Content $probe -Encoding ASCII
    $r = InvokeRelayNative 'C:\Windows\System32\cmd.exe' @('/d', '/c', $probe)
    if ($r.ExitCode -ne 0) { throw 'Runtime selection probe failed' }
    return $r.Stdout.Trim()
  }
  $systemPath = Join-Path $env:SystemRoot 'System32'
  $fake = Join-Path $directory 'pwsh.exe'
  $null = New-Item -ItemType File $fake
  $chosen = SelectRuntime ($directory + ';' + $systemPath) $directory
  if ($chosen -ne $fake) { throw 'PATH pwsh not preferred' }
  Remove-Item $fake
  $install = Join-Path $directory 'PowerShell\7'
  $null = New-Item -ItemType Directory -Path $install -Force
  $installed = Join-Path $install 'pwsh.exe'
  $null = New-Item -ItemType File $installed
  $chosen = SelectRuntime $systemPath $directory
  if ($chosen -ne $installed) { throw 'Default install pwsh not preferred' }
  Remove-Item $installed
  $chosen = SelectRuntime $systemPath $directory
  if ($chosen -ne (Join-Path $systemPath 'WindowsPowerShell\v1.0\powershell.exe')) { throw 'Missing pwsh fallback failed' }
  $chosen = SelectRuntime $env:PATH $env:ProgramFiles
  if ($chosen -notmatch '\\pwsh.exe$') { throw 'Installed runtime not selected on this PC' }
  Write-Output ("PASS: 4 runtime selection checks; test host {0} {1}" -f $PSVersionTable.PSEdition, $PSVersionTable.PSVersion)
} finally { Remove-Item $directory -Recurse -Force -ErrorAction SilentlyContinue }
