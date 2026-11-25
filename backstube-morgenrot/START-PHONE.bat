@echo off
cd /d "%~dp0"
echo Pakete pruefen...
call npm install --no-audit --no-fund
echo.
echo ===== Auf dem Handy oeffnen (gleiches WLAN wie der PC) =====
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo   http://%%b:4321/vorschau/cafe/backstube-morgenrot/
)
echo ============================================================
echo Beim ersten Start fragt Windows nach der Firewall: "Private Netzwerke" erlauben.
echo.
call npx astro dev --host --port 4321
pause
