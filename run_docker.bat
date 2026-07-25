@echo off
echo ======================================================================
echo           FCT SDM DASHBOARD v2.0 - DOCKER AUTOMATION RUNNER
echo ======================================================================
echo.

:: Check if Docker is installed
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Docker is not installed on this system.
    echo [ACTION] Installing Docker Desktop via Windows Package Manager (winget)...
    winget install --id Docker.DockerDesktop --silent --accept-source-agreements --accept-package-agreements
    echo.
    echo [NOTE] Docker Desktop has been installed. Please launch Docker Desktop from your Start Menu,
    echo        and then re-run this script or execute: docker compose up -d --build
    echo.
    pause
    exit /b
)

echo [INFO] Docker detected. Building and starting SDM Dashboard containers...
docker compose up -d --build

echo.
echo ======================================================================
echo [SUCCESS] FCT SDM Dashboard is now continuously running in Docker!
echo.
echo  - Frontend Dashboard URL : http://localhost/ or http://localhost:5173/
echo  - Backend REST API URL   : http://localhost:8000/api/v1/
echo  - Container Restart Policy: ALWAYS (Auto-starts on system boot)
echo ======================================================================
echo.
pause
