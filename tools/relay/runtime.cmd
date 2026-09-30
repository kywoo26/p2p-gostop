@echo off
rem FR-RP-07 / RP-03B: common selector. The OS bootstrap never runs the relay.
set "RELAY_POWERSHELL="
for /f "usebackq delims=" %%P in (`""%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0select-runtime.ps1""`) do set "RELAY_POWERSHELL=%%P"
if not defined RELAY_POWERSHELL exit /b 2
exit /b 0
