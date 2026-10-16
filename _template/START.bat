@echo off
cd /d "%~dp0"
echo Checking packages...
call npm install --no-audit --no-fund
call npm run dev
pause
