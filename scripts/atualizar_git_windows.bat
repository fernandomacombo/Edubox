@echo off
setlocal
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0.."
echo Fecha Django e Vite. A actualizacao usa git pull e nao cria outro backup completo.
pause
python scripts\atualizar_git.py
if errorlevel 1 (
 echo Actualizacao interrompida. Consulta a mensagem acima.
 pause
 exit /b 1
)
pause
