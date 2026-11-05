@echo off
chcp 65001 >nul
cd /d "%~dp0..\frontend"
if not exist "node_modules" (
  echo Executa instalar_windows.bat primeiro.
  pause
  exit /b 1
)
echo Portal EduBox: http://localhost:5173
call npm run dev
pause
