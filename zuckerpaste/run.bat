@echo off
rem Zuckerpaste: рендер на видеокарте. Прогресс виден в этом окне (строки FRAME). Окно не закрывать.
rem Остановленный рендер просто запустить снова: готовые кадры пропускаются.
chcp 65001 >nul
set BL=D:\Webdesign\tools\blender\blender.exe
set HERE=%~dp0
cd /d "%HERE%"
echo === ПК 16:9: 180 кадров, ~20 с на кадр ===
"%BL%" -b --factory-startup -P "%HERE%coil.py" -- "%HERE%pc" 1920 1080 64 all cam_pc
echo === Телефон 9:16: 180 кадров, ~10 с на кадр ===
"%BL%" -b --factory-startup -P "%HERE%coil.py" -- "%HERE%tel" 720 1280 64 all cam_tel
echo FERTIG > "%HERE%fertig.txt"
echo Готово. Окно можно закрыть.
pause
