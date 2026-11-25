@echo off
cd /d "%~dp0hero"
if not exist node_modules (
  echo Installing Remotion, first run only...
  call npm install
)
call npm run studio
pause
