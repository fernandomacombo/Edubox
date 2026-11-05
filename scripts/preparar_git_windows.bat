@echo off
setlocal
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0.."
echo Fecha os servidores da instalacao antiga antes de continuar.
echo A instalacao antiga sera preservada. Este clone recebe uma copia dos dados.
pause
python scripts\importar_instalacao.py
if errorlevel 1 goto erro
call scripts\instalar_windows.bat
if errorlevel 1 goto erro
exit /b 0
:erro
echo Preparacao interrompida. Consulta a mensagem acima.
pause
exit /b 1
