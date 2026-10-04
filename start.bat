@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Shinosi mahsulot - server
if not exist node_modules (
  echo Китобхонаҳо насб мешаванд...
  call npm install
)
:loop
node server.js
echo.
echo Сервер қатъ шуд. Пас аз 5 сония аз нав пахш мешавад (барои қатъ: Ctrl+C)...
timeout /t 5 >nul
goto loop
