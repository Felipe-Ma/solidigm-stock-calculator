@echo off
REM Solidigm Stock Calculator - local run helper
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on PATH. Install it from https://nodejs.org/ and try again.
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    exit /b 1
  )
)

echo Starting Solidigm Stock Calculator on http://127.0.0.1:%PORT%
if "%PORT%"=="" echo   ^(default port 5173 - override with: set PORT=3000 ^& run.cmd^)
call npm run start
endlocal
