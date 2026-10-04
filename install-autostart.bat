@echo off
chcp 65001 >nul
cd /d "%~dp0"
schtasks /Create /SC ONLOGON /TN "ShinosiMahsulot" /TR "\"%~dp0start.bat\"" /F
if %errorlevel%==0 (echo Тайёр: сервер ҳангоми ворид шудан ба Windows худаш пахш мешавад.) else (echo Хато. Ин файлро бо "Run as administrator" пахш кунед.)
pause
