@echo off
chcp 65001 >nul
setlocal
set "HOST_DIR=%~dp0"
cd /d "%HOST_DIR%"
if not exist ".venv" (
    echo [ERROR] .venv not found. Please run setup first.
    pause
    exit /b 1
)
"%HOST_DIR%\.venv\Scripts\python.exe" "%HOST_DIR%\main.py"
endlocal
