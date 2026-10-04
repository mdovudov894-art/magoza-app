@echo off
chcp 65001 >nul
rem Ин файлро бо "Run as administrator" пахш кунед: кассаҳои дигар аз шабака дастрасӣ пайдо мекунанд.
netsh advfirewall firewall add rule name="ShinosiMahsulot" dir=in action=allow protocol=TCP localport=3000
pause
