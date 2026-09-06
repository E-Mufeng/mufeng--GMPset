@echo off
setlocal EnableExtensions
cd /d "%~dp0"
timeout /t 2 /nobreak >nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8768" ^| findstr LISTENING') do taskkill /PID %%a /T /F >nul 2>&1
start "" /min cmd /c "node %~dp0server.js >> data\logs\server.log 2>&1"
endlocal
