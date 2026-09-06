@echo off
setlocal EnableExtensions
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8768" ^| findstr LISTENING') do taskkill /PID %%a /T /F >nul 2>&1
endlocal
