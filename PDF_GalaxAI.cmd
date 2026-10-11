@echo off
setlocal
set PYTHONUTF8=1
cd /d "%~dp0"
set "PROJECT_PYTHON=python"
if exist "%~dp0.venv\Scripts\python.exe" set "PROJECT_PYTHON=%~dp0.venv\Scripts\python.exe"

:: ---------- 前端依赖自检 ----------
if not exist "node_modules\.bin\vite.cmd" (
  echo [init] Installing frontend dependencies for the first run...
  call npm ci
  if errorlevel 1 (
    echo [error] npm install failed. Please check Node.js / npm.
    pause
    exit /b 1
  )
)

:: ---------- 后端 Python 自检 ----------
"%PROJECT_PYTHON%" --version >nul 2>&1
if errorlevel 1 (
  echo [error] Python not found. Install Python 3.10+ and add it to PATH.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   PDF_GalaxAI Launcher
echo   [1/2] Backend  FastAPI  http://127.0.0.1:8000
echo   [2/2] Frontend Vite     http://127.0.0.1:3000
echo   Keep BOTH windows open. Browser will open automatically.
echo ============================================================
echo.

:: ---------- 启动后端（独立窗口） ----------
start "PDF_GalaxAI Backend (8000)" /D "%~dp0backend" cmd /k ""%PROJECT_PYTHON%" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

:: 等后端先监听端口，避免前端首屏请求 500
timeout /t 3 /nobreak >nul

:: ---------- 启动前端（独立窗口 + 自动打开浏览器） ----------
start "PDF_GalaxAI Frontend (3000)" /D "%~dp0" cmd /k "node node_modules\vite\bin\vite.js --host 127.0.0.1 --port 3000 --open"

endlocal
