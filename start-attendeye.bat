@echo off
setlocal enabledelayedexpansion
title PUB AttendEye - Autonomous Launcher
cls

echo ===============================================================================
echo   PUB AttendEye - Facial Recognition Attendance System Launcher
echo   Pundra University of Science ^& Technology (PUB), Bogra, Bangladesh
echo ===============================================================================
echo.

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

:: 1. Validate Prerequisite Tools
echo [1/6] Checking system prerequisites...

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js v18+ to run PUB AttendEye.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Python virtual environment not found at .venv\Scripts\python.exe.
    echo Please initialize the Python environment: python -m venv .venv ^&^& .venv\Scripts\pip install -r requirements-cv.txt
    pause
    exit /b 1
)

:: 2. Validate Computer Vision ONNX Models
echo [2/6] Verifying biometric vision models...
if not exist "models\face_detection_yunet_2023mar.onnx" (
    echo [ERROR] YuNet model missing: models\face_detection_yunet_2023mar.onnx
    pause
    exit /b 1
)
if not exist "models\face_recognition_sface_2021dec.onnx" (
    echo [ERROR] SFace model missing: models\face_recognition_sface_2021dec.onnx
    pause
    exit /b 1
)
echo       YuNet (Detection) and SFace (128D Recognition) models verified.

:: 3. Validate Configuration (.env.local)
echo [3/6] Checking environment configuration...
if not exist ".env.local" (
    echo [WARN] .env.local not found. Creating from .env.example...
    copy .env.example .env.local >nul
    echo       Created .env.local with development baseline.
) else (
    echo       Configuration file .env.local is present.
)

:: 4. Check for Port Conflicts & Active Processes
echo [4/6] Checking network port availability (8000, 3000)...

set "FASTAPI_RUNNING=0"
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "FASTAPI_RUNNING=1"
    echo       FastAPI CV service is already running and healthy on port 8000.
) else (
    :: Free port 8000 if occupied by dead/stale process
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING 2^>nul') do (
        echo       Reclaiming port 8000 from stale process PID %%a...
        taskkill /F /PID %%a >nul 2>&1
    )
    echo       Starting FastAPI CV service on 127.0.0.1:8000...
    start "PUB AttendEye - CV Backend" /min cmd /c "cd /d %PROJECT_DIR% && .venv\Scripts\python.exe -m uvicorn backend.api:app --host 127.0.0.1 --port 8000"
)

set "NEXTJS_RUNNING=0"
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "NEXTJS_RUNNING=1"
    echo       Next.js frontend is already running on port 3000.
) else (
    :: Free port 3000 if occupied by dead/stale process
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
        echo       Reclaiming port 3000 from stale process PID %%a...
        taskkill /F /PID %%a >nul 2>&1
    )
    echo       Starting Next.js frontend on http://localhost:3000...
    start "PUB AttendEye - Next.js Frontend" /min cmd /c "cd /d %PROJECT_DIR% && npm run dev"
)

:: 5. Await Service Health
echo [5/6] Waiting for services to be ready...

set "CV_HEALTHY=0"
for /L %%i in (1,1,15) do (
    if !CV_HEALTHY! equ 0 (
        powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            set "CV_HEALTHY=1"
        ) else (
            ping -n 2 127.0.0.1 >nul
        )
    )
)

set "WEB_HEALTHY=0"
for /L %%i in (1,1,25) do (
    if !WEB_HEALTHY! equ 0 (
        powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            set "WEB_HEALTHY=1"
        ) else (
            ping -n 2 127.0.0.1 >nul
        )
    )
)

if !CV_HEALTHY! equ 1 (
    echo       [OK] Python CV Engine: HEALTHY on port 8000
) else (
    echo       [WARN] Python CV Engine is taking longer than expected to report healthy.
)

if !WEB_HEALTHY! equ 1 (
    echo       [OK] Next.js Web Portal: READY on port 3000
) else (
    echo       [WARN] Next.js frontend is still compiling.
)

:: 6. Launch Browser & Complete
echo [6/6] Launching default web browser...
start http://localhost:3000

echo.
echo ===============================================================================
echo   PUB AttendEye is now running!
echo.
echo   Frontend Application: http://localhost:3000
echo   Computer Vision API:  http://127.0.0.1:8000
echo   Health Check:         http://127.0.0.1:8000/health
echo.
echo   To stop the application cleanly, run: stop-attendeye.bat
echo ===============================================================================
echo.
exit /b 0
