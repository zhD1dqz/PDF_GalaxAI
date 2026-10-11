@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [error] Install Node.js 20.19+ or 22.12+ first.
  pause
  exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" (
  call npm ci
  if errorlevel 1 (
    echo [error] Frontend dependency installation failed.
    pause
    exit /b 1
  )
)
echo Graphics-only demo. Synthetic data; no backend or API key required.
node node_modules\vite\bin\vite.js --host 127.0.0.1 --port 3000 --open "/?graphicsDemo=1"
endlocal
