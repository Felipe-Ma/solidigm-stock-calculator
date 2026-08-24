# Solidigm Stock Calculator - local run helper (PowerShell)
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js was not found on PATH. Install it from https://nodejs.org/ and try again."
    exit 1
}

if (-not (Test-Path -Path 'node_modules')) {
    Write-Host 'Installing dependencies...' -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'npm install failed.'
        exit $LASTEXITCODE
    }
}

$port = if ($env:PORT) { $env:PORT } else { '5173' }
Write-Host "Starting Solidigm Stock Calculator on http://127.0.0.1:$port" -ForegroundColor Green
npm run start
