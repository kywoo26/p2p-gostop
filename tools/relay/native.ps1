# FR-RP-07 / RP-03B: Windows PowerShell 5.1 native UTF-8 and exit-code boundary.
# ASCII source, so Windows PowerShell 5.1 does not require a BOM.
function ConvertToRelayNativeArgument([string]$Value) {
  if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
  # Windows CommandLineToArgvW quoting: double backslashes before quotes/end.
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}
function InvokeRelayNative([string]$FilePath, [string[]]$Arguments) {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $FilePath
  $info.Arguments = ($Arguments | ForEach-Object { ConvertToRelayNativeArgument $_ }) -join ' '
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $info.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $info
  try {
    $null = $process.Start()
    # Drain both pipes concurrently; verbose stderr cannot deadlock stdout.
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      Stdout = $stdout.GetAwaiter().GetResult()
      Stderr = $stderr.GetAwaiter().GetResult()
    }
  } finally { $process.Dispose() }
}
