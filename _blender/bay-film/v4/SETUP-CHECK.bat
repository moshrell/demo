@echo off
chcp 65001 >nul
cd /d "%~dp0"
set OUT=%~dp0hardware.txt
echo === GPU === > "%OUT%"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv >> "%OUT%" 2>&1
echo === CPU === >> "%OUT%"
wmic cpu get name,numberofcores,numberoflogicalprocessors >> "%OUT%" 2>&1
echo === RAM bytes === >> "%OUT%"
wmic computersystem get totalphysicalmemory >> "%OUT%" 2>&1
echo === Free space D: === >> "%OUT%"
wmic logicaldisk where "DeviceID='D:'" get freespace >> "%OUT%" 2>&1
set BL=D:\Webdesign\tools\blender
if not exist "%BL%\blender.exe" (
  echo Downloading portable Blender 5.0.1 ...
  mkdir D:\Webdesign\tools 2>nul
  curl.exe -L -o D:\Webdesign\tools\blender.zip https://download.blender.org/release/Blender5.0/blender-5.0.1-windows-x64.zip
  tar -xf D:\Webdesign\tools\blender.zip -C D:\Webdesign\tools
  for /d %%D in (D:\Webdesign\tools\blender-5.0.1*) do ren "%%D" blender
  del D:\Webdesign\tools\blender.zip
)
echo === Blender === >> "%OUT%"
"%BL%\blender.exe" -b --factory-startup --python "%~dp0tools\gpu_probe.py" 2>&1 | findstr /B "BLENDER BACKEND" >> "%OUT%"
echo done >> "%OUT%"
echo.
echo Gotovo. Mozhno zakryt okno.
pause
