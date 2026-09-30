@echo off
setlocal
call "%~dp0runtime.cmd"
"%RELAY_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0relay.ps1" stop
set "result=%ERRORLEVEL%"
echo.
if not "%result%"=="0" echo Relay stop was incomplete. See the message above.
pause
exit /b %result%
