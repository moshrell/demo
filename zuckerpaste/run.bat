@echo off
rem Zuckerpaste: рендер на видеокарте. Прогресс в этом окне: "Kadr N iz 180". Окно не закрывать.
rem Остановленный рендер просто запустить снова: готовые кадры пропускаются.
chcp 65001 >nul
set BL=D:\Webdesign\tools\blender\blender.exe
set HERE=%~dp0
cd /d "%HERE%"
if exist "%HERE%fertig.txt" del "%HERE%fertig.txt"
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%wach.ps1"
title Zuckerpaste: 1/2 PC
echo === 1/2  ПК 16:9: 180 кадров, ~20 с на кадр ===
"%BL%" -b --factory-startup -P "%HERE%coil.py" -- "%HERE%pc" 1920 1080 64 all cam_pc | findstr /c:"FRAME"
title Zuckerpaste: 2/2 Telefon
echo === 2/2  Телефон 9:16: 180 кадров, ~10 с на кадр ===
"%BL%" -b --factory-startup -P "%HERE%coil.py" -- "%HERE%tel" 720 1280 64 all cam_tel | findstr /c:"FRAME"
echo FERTIG > "%HERE%fertig.txt"
title Zuckerpaste: GOTOVO
color 2F
echo.
echo ==========================================
echo    ГОТОВО. Все кадры посчитаны.
echo    Окно можно закрыть.
echo ==========================================
echo 
pause
