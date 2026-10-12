@echo off
setlocal
:: Always run from the project directory, including when opened via a shortcut.
pushd "%~dp0"
if errorlevel 1 exit /b 1
where node >nul 2>nul
if errorlevel 1 (
    echo [error] Node.js was not found. Install Node.js 20.19+ or 22.12+ and reopen this launcher.
    if "%~1"=="" pause
    popd
    exit /b 1
)
node scripts\launch.mjs %*
set "GALAXAI_EXIT_CODE=%errorlevel%"
if not "%GALAXAI_EXIT_CODE%"=="0" (
    echo [error] Startup failed. Check the message above and the logs directory.
    if "%~1"=="" pause
)
popd
exit /b %GALAXAI_EXIT_CODE%
