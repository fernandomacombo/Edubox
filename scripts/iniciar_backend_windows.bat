@echo off
chcp 65001 >nul
cd /d "%~dp0..\backend"
if not exist ".venv\Scripts\python.exe" (
  echo Executa instalar_windows.bat primeiro.
  pause
  exit /b 1
)
echo Backend EduBox: http://localhost:8000/admin/
".venv\Scripts\python.exe" manage.py runserver 127.0.0.1:8000
pause
