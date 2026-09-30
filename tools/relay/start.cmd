@echo off
setlocal
call "%~dp0runtime.cmd"
"%RELAY_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0relay.ps1" start
set "result=%ERRORLEVEL%"
echo.
if not "%result%"=="0" echo Relay start failed. See the message above.
pause
exit /b %result%
