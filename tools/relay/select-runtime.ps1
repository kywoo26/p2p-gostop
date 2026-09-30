# FR-RP-07 / RP-03B. Bootstrap with the OS Windows PowerShell, then validate Core 7.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'native.ps1')
function RelayRuntimeCandidates([string]$SearchPath, [string]$InstallRoot) {
  $seen = @{}
  foreach ($entry in ($SearchPath -split ';')) {
    $directory = [Environment]::ExpandEnvironmentVariables($entry.Trim().Trim('"'))
    # Empty/relative PATH entries must not implicitly search the current directory.
    if (-not $directory -or $directory -notmatch '^(?:[a-zA-Z]:[\\/]|\\\\[^\\]+\\[^\\]+)') { continue }
    $candidate = Join-Path $directory 'pwsh.exe'
    if (-not $seen.ContainsKey($candidate)) { $seen[$candidate] = $true; $candidate }
  }
  if ($InstallRoot) {
    $candidate = Join-Path $InstallRoot 'PowerShell\7\pwsh.exe'
    if (-not $seen.ContainsKey($candidate)) { $candidate }
  }
}
function TestRelayRuntimeFile([string]$Path) { return [IO.File]::Exists($Path) }
function GetRelayRuntimeMetadata([string]$Path) { return [Diagnostics.FileVersionInfo]::GetVersionInfo($Path) }
function ConfirmRelayCore7([string]$Path) {
  $metadata = GetRelayRuntimeMetadata $Path
  if ($metadata.ProductName -ne 'PowerShell' -or $metadata.ProductMajorPart -ne 7 -or $metadata.CompanyName -notmatch '^Microsoft') {
    throw 'The selected pwsh executable is not a PowerShell 7 product; no fallback was attempted.'
  }
  $result = InvokeRelayNative $Path @('-NoProfile', '-NonInteractive', '-Command', 'if ($PSVersionTable.PSEdition -ne "Core" -or $PSVersionTable.PSVersion.Major -ne 7) { exit 42 }; "Core|7"')
  if ($result.ExitCode -ne 0 -or $result.Stdout.Trim() -cne 'Core|7') { throw 'The selected PowerShell 7 failed identity validation; no fallback was attempted.' }
}
function ResolveRelayRuntime([string]$SearchPath, [string]$InstallRoot, [string]$SystemDirectory) {
  foreach ($candidate in @(RelayRuntimeCandidates $SearchPath $InstallRoot)) {
    if (TestRelayRuntimeFile $candidate) { ConfirmRelayCore7 $candidate; return $candidate }
  }
  $fallback = Join-Path $SystemDirectory 'WindowsPowerShell\v1.0\powershell.exe'
  if (-not (TestRelayRuntimeFile $fallback)) { throw 'No PowerShell 7 or Windows PowerShell fallback is installed.' }
  return $fallback
}
try { ResolveRelayRuntime $env:PATH $env:ProgramFiles (Join-Path $env:SystemRoot 'System32') }
catch { [Console]::Error.WriteLine($_.Exception.Message); exit 2 }
