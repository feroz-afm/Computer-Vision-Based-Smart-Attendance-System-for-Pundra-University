@echo off
setlocal enabledelayedexpansion
title PUB AttendEye - System Shutdown
cls

echo ===============================================================================
echo   PUB AttendEye - System Shutdown Helper
echo ===============================================================================
echo.

echo [1/2] Terminating service processes on port 8000 (FastAPI CV Service)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING 2^>nul') do (
    echo       Stopping PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/2] Terminating service processes on port 3000 (Next.js Web Server)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo       Stopping PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo All PUB AttendEye local services have been stopped.
echo ===============================================================================
exit /b 0
