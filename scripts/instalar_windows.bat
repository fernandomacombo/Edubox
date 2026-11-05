@echo off
setlocal
set PYTHONUTF8=1
if not exist "%~dp0..\runtime\tmp" mkdir "%~dp0..\runtime\tmp"
set "TEMP=%~dp0..\runtime\tmp"
set "TMP=%TEMP%"
chcp 65001 >nul

cd /d "%~dp0..\backend" || goto :error

where python >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Python nao encontrado no PATH.
  echo Instala o Python 3.12 ou mais recente e volta a executar.
  goto :error
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm nao encontrado no PATH.
  echo Instala o Node.js e volta a executar.
  goto :error
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/5] A criar ambiente Python...
  python -m venv .venv || goto :error
) else (
  echo [1/5] Ambiente Python encontrado.
)

rem Algumas instalacoes de Python criam ambientes sem pip.
".venv\Scripts\python.exe" -m pip --version >nul 2>&1
if errorlevel 1 (
  echo [CORRECAO] Pip nao encontrado. A instalar pip no ambiente virtual...
  ".venv\Scripts\python.exe" -m ensurepip --upgrade || goto :pip_error
  ".venv\Scripts\python.exe" -m pip --version || goto :pip_error
)

echo [2/5] A instalar Django...
".venv\Scripts\python.exe" -m pip install -r requirements.txt || goto :error

echo [3/5] A preparar a base de dados...
".venv\Scripts\python.exe" manage.py makemigrations learning || goto :error
".venv\Scripts\python.exe" manage.py migrate || goto :error
if not exist ".edubox_imported" ".venv\Scripts\python.exe" manage.py seed_demo || goto :error
".venv\Scripts\python.exe" manage.py configurar_v02 || goto :error

echo [4/5] A instalar o frontend...
cd /d "%~dp0..\frontend" || goto :error
call npm ci || goto :error

echo [5/5] A criar a conta do professor/administrador...
cd /d "%~dp0..\backend" || goto :error
if not exist ".edubox_imported" ".venv\Scripts\python.exe" manage.py createsuperuser
if errorlevel 1 echo Podes criar esta conta mais tarde com .venv\Scripts\python.exe manage.py createsuperuser.
echo.
echo Instalacao terminada. Inicia o backend e o frontend nos ficheiros .bat da pasta scripts.
pause
exit /b 0

:pip_error
echo.
echo [ERRO] Nao foi possivel preparar o pip neste ambiente virtual.
echo Confirma que o Python instalado inclui ensurepip e que tens permissoes de escrita.
goto :error

:error
echo.
echo A instalacao nao terminou. Consulta a mensagem de erro acima.
pause
exit /b 1
