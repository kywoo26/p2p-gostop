# RP-OPS01 / FR-RP-07 / NF-RP-06. Run in Windows, from the fixed operator folder.
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('preflight', 'status', 'prepare', 'start', 'verify', 'restart', 'apply', 'rollback')]
  [string]$Action,
  [string]$CandidateRepo,
  [string]$Release,
  [string]$Source,
  [string]$Archive,
  [string]$ArchiveSHA,
  [switch]$BuildImage,
  [switch]$AcceptSessionLoss
)
$ErrorActionPreference = 'Stop'
if ($Action -ne 'prepare' -and ($CandidateRepo -or $Release -or $Source -or $Archive -or $ArchiveSHA -or $BuildImage)) {
  [Console]::Error.WriteLine('Candidate arguments are accepted only by prepare; nothing was changed.')
  exit 2
}
$opsAction = $Action
$request = [pscustomobject]@{
  CandidateRepo = $CandidateRepo; Release = $Release; Source = $Source
  Archive = $Archive; ArchiveSHA = $ArchiveSHA; BuildImage = [bool]$BuildImage
  AcceptSessionLoss = [bool]$AcceptSessionLoss
}
. (Join-Path $PSScriptRoot 'relay.ps1') -Library
. (Join-Path $PSScriptRoot 'lifecycle.ps1')
exit (InvokeRelayOps $opsAction $request)
