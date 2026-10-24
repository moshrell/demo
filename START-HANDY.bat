@echo off
cd /d "%~dp0"
echo Checking packages...
call npm install --no-audit --no-fund
echo.
echo ================================================================
echo  Telefon im selben WLAN, im Browser oeffnen:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo    http:%%a:4321/vorschau/auto/glanzleistung/
echo  (Windows fragt evtl. nach Firewall-Freigabe: "Zulassen")
echo ================================================================
echo.
call npm run handy
pause
