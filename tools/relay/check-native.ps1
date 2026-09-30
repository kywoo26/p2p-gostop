# FR-RP-07 / NF-RP-06 / RP-03B. Synthetic only; never starts Docker or Funnel.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'native.ps1')
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
$previousEncoding = [Console]::OutputEncoding
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::GetEncoding(949)
  $result = InvokeRelayNative 'wsl.exe' @('--exec', '/bin/bash', '-lc', 'printf ''{"text":"\355\225\234\352\270\200"}''; printf ''Network Creating\n'' >&2')
  $json = $result.Stdout | ConvertFrom-Json
  Assert ($result.ExitCode -eq 0 -and $json.text -eq ([string][char]0xd55c + [char]0xae00)) 'UTF8 JSON decoding failed'
  Assert ($result.Stderr -match 'Network Creating') 'Normal stderr must remain separate'
  Assert ([Console]::OutputEncoding.CodePage -eq 949) 'Caller encoding changed'
  $result = InvokeRelayNative 'wsl.exe' @('--exec', '/bin/bash', '-lc', 'printf failure >&2; exit 17')
  Assert ($result.ExitCode -eq 17 -and $result.Stderr -eq 'failure') 'Nonzero exit code lost'
  $result = InvokeRelayNative 'wsl.exe' @('--exec', '/bin/bash', '-lc', 'head -c 131072 /dev/zero | tr "\0" x >&2; printf done')
  Assert ($result.ExitCode -eq 0 -and $result.Stdout -eq 'done' -and $result.Stderr.Length -eq 131072) 'Concurrent pipe draining failed'
  $values = @('', 'plain', 'space here', 'quote"here', 'tail space\', 'slash\"quote')
  $result = InvokeRelayNative 'wsl.exe' (@('--exec', '/bin/bash', '-c', 'printf ''<%s>'' "$@"', 'probe') + $values)
  Assert ($result.ExitCode -eq 0 -and $result.Stdout -eq '<><plain><space here><quote"here><tail space\><slash\"quote>') 'Windows native argument quoting failed'
  $tokens = $null; $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'relay.ps1'), [ref]$tokens, [ref]$errors)
  Assert ($errors.Count -eq 0) 'Common script parse failed'
  . (Join-Path $PSScriptRoot 'ownership.ps1')
  $Target = 'http://127.0.0.1:17777'
  # Explicit synthetic hostnames: constructed here, never read from Tailscale/environment.
  $foreground = '{"Foreground":{"synthetic":{"TCP":{"443":{"HTTPS":true}},"Web":{"sample.example.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:17777"}}}}}}}' | ConvertFrom-Json
  $state = FunnelState $foreground 'sample.example.ts.net'
  Assert ($state.Ours -and $state.HasEndpoint -and -not $state.ForeignTarget) 'Foreground endpoint missed'
  $state = FunnelState $foreground 'other.example.ts.net'
  Assert ($state.ForeignTarget -and -not $state.Ours) 'Foreign hostname accepted'
  $state = FunnelState ('{}' | ConvertFrom-Json) 'sample.example.ts.net'
  Assert (-not $state.Ours -and -not $state.HasEndpoint) 'Empty/Ctrl+C status accepted as active'
  Write-Output ("PASS: 8 native/state regression checks; runtime {0} {1}" -f $PSVersionTable.PSEdition, $PSVersionTable.PSVersion)
} finally { [Console]::OutputEncoding = $previousEncoding }
