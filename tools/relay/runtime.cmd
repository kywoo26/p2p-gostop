@echo off
rem FR-RP-07 / RP-03B: identical selection for start and stop. No retry after failure.
set "RELAY_POWERSHELL="
for /f "delims=" %%P in ('where.exe pwsh.exe 2^>nul') do if not defined RELAY_POWERSHELL set "RELAY_POWERSHELL=%%P"
if not defined RELAY_POWERSHELL if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "RELAY_POWERSHELL=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined RELAY_POWERSHELL set "RELAY_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
exit /b 0
