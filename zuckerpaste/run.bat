@echo off
rem Zuckerpaste: рендер на видеокарте. Остановленный рендер просто запустить снова: готовые кадры пропускаются.
chcp 65001 >nul
set BL=D:\Webdesign\tools\blender\blender.exe
set HERE=%~dp0
cd /d "%HERE%"
echo === ПК 16:9, 180 кадров ===
"%BL%" -b --factory-startup -P "%HERE%coil.py" -- "%HERE%frames_pc" 1920 1080 128 all cam_pc > "%HERE%log_pc.txt" 2>&1
echo === Телефон 9:16, 180 кадров ===
"%BL%" -b --factory-startup -P "%HERE%coil.py" -- "%HERE%frames_tel" 1080 1920 128 all cam_tel > "%HERE%log_tel.txt" 2>&1
echo FERTIG > "%HERE%fertig.txt"
